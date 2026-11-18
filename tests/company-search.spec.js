const { test, expect } = require('../fixtures/fixtures');
const { MODULE, DATA, FILTER_LABELS, OPERATORS, QUICK_FIELDS, MESSAGES, cases: c } = require('../testData/companySearchData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues } = require('../utils/testCase');

/**
 * 62418 Company Search - Criteria Specification (docs/62418 Company Search Configuration.md).
 * Quick Search = top-bar search with Record Type "Company"; Advanced Search = /Search?entityId=3 + Advanced Filters drawer.
 * Read-only: nothing is created. Every search returns the JSON of POST /Search/ResultsData, so the rules are checked
 * on the criteria sent and the rows the server returned. Sandbox values are in testData/companySearchData.js and can be
 * overridden in .env.
 *
 * Not automated: the SQL join paths (each joined criterion is checked by the companies it returns), inactive Entity
 * Type / Company Role records (the sandbox has none - the lists are checked for empty / duplicate entries), deleted
 * companies (1.5 / 2.10 / 5.1 - none in the sandbox; 015 and 052 run once SEARCH_COMPANY_DELETED_NAME is set).
 */

const cid = r => Number(r['Record ID'] ?? r._primaryKeyValue);
const ids = rows => rows.map(cid);
const nameOf = r => String(r['Display Name'] || '');
const low = v => String(v ?? '').toLowerCase();
const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const criterion = (res, fieldId) => res.criteria.find(x => String(x.fieldId).toLowerCase() === fieldId.toLowerCase());
const criteriaOf = (res, fieldId) => res.criteria.filter(x => String(x.fieldId).toLowerCase() === fieldId.toLowerCase());
const asList = v => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(String).filter(Boolean);
const label = rows => rows.map(r => `${cid(r)}: ${nameOf(r)}`);
const NOT_DELETED = { fieldId: 'IsArchived', operatorKey: 'equals', values: false };

/** The search returned normally (HTTP 200, no error text). */
function expectOk(res, what = 'search') {
  expect(res.status, `${what}: HTTP status`).toBe(200);
  expect(res.error, `${what}: no error returned`).toBeNull();
}

/**
 * Advanced Search with the given criteria; returns the ResultsData result.
 * crit: { text: { FieldId: value | [value, operator] }, entityType, roles: [labels], accountStatus, person, includeDeleted }
 */
async function advancedSearch(p, crit = {}, title = 'Advanced Search') {
  return test.step(`${title}: ${JSON.stringify(crit)}`, async () => {
    await p.gotoAdvanced();
    for (const [fieldId, v] of Object.entries(crit.text || {})) {
      const [value, op] = Array.isArray(v) ? v : [v];
      await p.setText(fieldId, value, op);
    }
    if (crit.entityType) await p.setDropdown('CompanyEntityTypeIDF', crit.entityType);
    if (crit.roles) await p.setRoles(crit.roles);
    if (crit.accountStatus) await p.setDropdown('AccountStatusIDF', crit.accountStatus);
    if (crit.person) await p.pickOne('AffiliatedPersonIDF', crit.person);
    if (crit.includeDeleted !== undefined) await p.setIncludeDeleted(crit.includeDeleted);
    const res = await p.apply();
    expectOk(res, title);
    return res;
  });
}

async function quickSearch(p, text) {
  return test.step(`Quick Search "${text}"`, () => p.quickSearch(text));
}

/** Display names of every row of a search (all pages). */
async function allNames(p, res) {
  return (await p.allRows(res)).map(nameOf);
}

/**
 * Was the company returned? A single match opens the Company record directly (res.openedId), so then the record page
 * must show the name; otherwise every returned row (all pages) is checked.
 */
async function returned(p, res, name) {
  if (res.openedId) {
    const text = low(await p.page.locator('main').innerText());
    return text.includes(low(name));
  }
  return (await allNames(p, res)).some(n => low(n) === low(name));
}

const outcome = res => (res.openedId ? `opened /Company/Edit/${res.openedId} (single match)` : `${res.total} results: ${res.rows.slice(0, 5).map(nameOf).join(', ')}`);

/** Value (id) of a dropdown option by its text. */
async function optionValue(p, fieldId, text) {
  const o = (await p.dropdownValues(fieldId)).find(x => low(x.text) === low(text));
  return o ? o.value : null;
}

/** Ordering tier of a row for search text t (spec 4.1 - 4.5; 6 = no exact match). */
function tier(r, t) {
  const v = low(t).trim();
  const d = v.replace(/\D/g, '');
  if (low(r['Account Number']) === v) return 1;
  if (low(r['Display Name']) === v) return 2;
  if (low(r['Legal Name']) === v) return 3;
  if (low(r['Trade Name']) === v) return 4;
  if (d && String(r['Phone Number'] ?? '').replace(/\D/g, '') === d) return 5;
  return 6;
}

const CUSTOMER_TERMS = ['Systems', 'Group', 'Solutions', 'Consulting', 'LLC', 'Inc', 'an', 'er', 'on', 'a'];

/** A Display Name fragment matched by companies with and without the Customer role (at most 100 of them). */
async function customerMixTerm(p, roleId) {
  return test.step('Find a Display Name shared by Customer and non-Customer companies', async () => {
    for (const t of CUSTOMER_TERMS) {
      const name = { fieldId: 'DisplayName', operatorKey: 'contains', values: t };
      const all = await p.countCompanies([name]);
      if (all < 3 || all > 100) continue;
      const cust = await p.countCompanies([name, { fieldId: 'CompanyRoleIDF', operatorKey: 'in', values: [roleId] }]);
      if (cust > 0 && cust < all) return t;
    }
    return null;
  });
}

test.describe('Company Search - Criteria Specification (62418)', () => {
  test.beforeEach(async ({ companySearchPage }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    await companySearchPage.gotoStart();
  });

  // ================= 1. Quick Search =================

  test(tcTitle(c.quickScope), tcDetails(c.quickScope, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickScope, MODULE);
    expect(await p.quickSearchScopes(), 'Quick Search Record Type offers "Company"').toContain('Company');
    const res = await quickSearch(p, DATA.displayName);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.displayName, 'Record Type': 'Company', Outcome: outcome(res) });
    expect(res.body.entityId, 'Company entity searched').toBe('3');
    for (const [f, op] of QUICK_FIELDS) {
      expect(res.criteria.some(x => x.fieldId === f && x.operatorKey === op && x.values === DATA.displayName),
        `${f} ${op} <text> is searched`).toBe(true);
    }
    expect(res.total, 'companies found').toBeGreaterThan(0);
    if (!res.openedId) {
      await expect(page).toHaveURL(/\/Search\/QuickSearch\?.*entityId=3/);
      expect(await p.resultsTotal(), '"Results:" equals the total returned').toBe(res.total);
    }
    await shot(page, testInfo, 'quick-search-results');
  });

  test(tcTitle(c.quickDisplayName), tcDetails(c.quickDisplayName, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickDisplayName, MODULE);
    const part = DATA.displayName.slice(0, -1);
    const res = await quickSearch(p, part);
    expectOk(res);
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { search: part, Outcome: outcome(res) });
    expect(res.total, 'companies whose name contains the text').toBeGreaterThan(0);
    expect(rows.map(nameOf).some(n => low(n).includes(low(part))), 'a Display Name contains the text').toBe(true);
    const fields = ['Display Name', 'Legal Name', 'Trade Name', 'Website', 'Account Name', 'Account Number', 'Phone Number'];
    const wrong = rows.filter(r => !fields.some(f => low(r[f]).includes(low(part))));
    observe(testInfo, `${wrong.length} row(s) match through a field not shown in the grid (e.g. a second account)`);
  });

  test(tcTitle(c.quickLegalName), tcDetails(c.quickLegalName, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickLegalName, MODULE);
    const res = await quickSearch(p, DATA.legalName);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.legalName, Outcome: outcome(res) });
    expect(await returned(p, res, DATA.legalOwner), `"${DATA.legalOwner}" found by its Legal Name`).toBe(true);
  });

  test(tcTitle(c.quickTradeName), tcDetails(c.quickTradeName, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickTradeName, MODULE);
    const part = DATA.tradeName.slice(0, -1);
    const res = await quickSearch(p, part);
    expectOk(res);
    await recordTestValues(testInfo, { search: part, Outcome: outcome(res) });
    expect(res.criteria.some(x => x.fieldId === 'tradeName' && x.operatorKey === 'contains'), 'Trade Name contains sent').toBe(true);
    if (res.openedId) {
      expect(low(await p.page.locator('main').innerText()), 'opened company has the trade name').toContain(low(DATA.tradeName));
      return;
    }
    const rows = await p.allRows(res);
    expect(rows.some(r => low(r['Trade Name']).includes(low(part))), 'a company whose Trade Name contains the text').toBe(true);
  });

  test(tcTitle(c.quickCase), tcDetails(c.quickCase, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickCase, MODULE);
    const t = DATA.displayName;
    const spellings = [t.toLowerCase(), t.toUpperCase(), t.split('').map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join('')];
    const results = [];
    for (const s of spellings) {
      await p.gotoStart();
      const res = await quickSearch(p, s);
      expectOk(res, s);
      results.push({ s, total: res.total, ids: res.openedId ? [res.openedId] : ids(await p.allRows(res)).sort((a, b) => a - b) });
    }
    await recordTestValues(testInfo, Object.fromEntries(results.map(r => [`"${r.s}"`, `${r.total} results`])));
    for (const r of results.slice(1)) {
      expect(r.total, `"${r.s}" total = "${results[0].s}" total`).toBe(results[0].total);
      expect(r.ids, `"${r.s}" returns the same companies`).toEqual(results[0].ids);
    }
  });

  test(tcTitle(c.quickWebsite), tcDetails(c.quickWebsite, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickWebsite, MODULE);
    const res = await quickSearch(p, DATA.website);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.website, Outcome: outcome(res) });
    expect(await returned(p, res, DATA.websiteOwner), `"${DATA.websiteOwner}" found by its website`).toBe(true);
  });

  test(tcTitle(c.quickAccountName), tcDetails(c.quickAccountName, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickAccountName, MODULE);
    const part = DATA.accountName.slice(0, -1);
    const res = await quickSearch(p, part);
    expectOk(res);
    await recordTestValues(testInfo, { search: part, Outcome: outcome(res) });
    expect(await returned(p, res, DATA.accountOwner), `"${DATA.accountOwner}" found by its Account Name`).toBe(true);
  });

  test(tcTitle(c.quickAccountNumber), tcDetails(c.quickAccountNumber, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickAccountNumber, MODULE);
    const res = await quickSearch(p, DATA.accountNumber);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.accountNumber, Outcome: outcome(res) });
    expect(criteriaOf(res, 'accountNumber').map(x => x.operatorKey), 'Account Number: exact match only').toEqual(['equals']);
    expect(await returned(p, res, DATA.accountOwner), `"${DATA.accountOwner}" found by Account Number ${DATA.accountNumber}`).toBe(true);
  });

  test(tcTitle(c.quickAccountNumberPartial), tcDetails(c.quickAccountNumberPartial, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickAccountNumberPartial, MODULE);
    const partial = DATA.accountNumber.slice(0, -1);
    const res = await quickSearch(p, partial);
    expectOk(res);
    await recordTestValues(testInfo, { search: partial, Outcome: outcome(res), 'Account Number operators': criteriaOf(res, 'accountNumber').map(x => x.operatorKey) });
    if (res.openedById) observe(testInfo, `"${partial}" is a Company ID, so Quick Search opened /Company/Edit/${res.openedId} without searching`);
    else expect(criteriaOf(res, 'accountNumber').map(x => x.operatorKey), 'Account Number: exact match only').toEqual(['equals']);
    expect(await returned(p, res, DATA.accountOwner), `"${DATA.accountOwner}" is not matched by part of its Account Number`).toBe(false);
  });

  test(tcTitle(c.quickPhoneE164), tcDetails(c.quickPhoneE164, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickPhoneE164, MODULE);
    const res = await quickSearch(p, DATA.phoneE164);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.phoneE164, Outcome: outcome(res) });
    expect(await returned(p, res, DATA.phoneOwner), `"${DATA.phoneOwner}" found by ${DATA.phoneE164}`).toBe(true);
  });

  test(tcTitle(c.quickPhoneFormatted), tcDetails(c.quickPhoneFormatted, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickPhoneFormatted, MODULE);
    const res = await quickSearch(p, DATA.phoneFormatted);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.phoneFormatted, 'Phone value sent': criteriaOf(res, 'phoneNumber').map(x => x.values), Outcome: outcome(res) });
    expect(await returned(p, res, DATA.phoneOwner), `DEFECT: "${DATA.phoneFormatted}" is not normalized to ${DATA.phoneDigits}`).toBe(true);
  });

  test(tcTitle(c.quickPhonePartial), tcDetails(c.quickPhonePartial, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickPhonePartial, MODULE);
    const res = await quickSearch(p, DATA.phoneLocal);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.phoneLocal, Outcome: outcome(res) });
    expect(await returned(p, res, DATA.phoneOwner), 'part of the phone number finds the company').toBe(true);
  });

  test(tcTitle(c.quickTextNotPhone), tcDetails(c.quickTextNotPhone, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickTextNotPhone, MODULE);
    const t = DATA.displayName;
    const res = await quickSearch(p, t);
    expectOk(res);
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { search: t, Outcome: outcome(res) });
    const withPhoneOnly = rows.filter(r => !['Display Name', 'Legal Name', 'Trade Name', 'Website', 'Account Name', 'Account Number']
      .some(f => low(r[f]).includes(low(t))) && r['Phone Number']);
    const all = await p.countCompanies([]);
    expect(res.total, 'not every company is returned').toBeLessThan(all);
    expect(label(withPhoneOnly), 'no company returned only because it has a phone number').toEqual([]);
  });

  test(tcTitle(c.quickEinIgnored), tcDetails(c.quickEinIgnored, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickEinIgnored, MODULE);
    const res = await quickSearch(p, DATA.ein);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.ein, Outcome: outcome(res), 'Fields sent': [...new Set(res.criteria.map(x => x.fieldId))] });
    expect(criterion(res, 'EIN'), 'no EIN criterion').toBeUndefined();
    expect(await returned(p, res, DATA.einOwner), `"${DATA.einOwner}" is not found by its EIN`).toBe(false);
  });

  test(tcTitle(c.quickDeleted), tcDetails(c.quickDeleted, MODULE), async ({ companySearchPage: p }, testInfo) => {
    test.skip(!DATA.deletedName, 'Set SEARCH_COMPANY_DELETED_NAME to a deleted company (none in the sandbox)');
    await applyAllureLabels(c.quickDeleted, MODULE);
    const res = await quickSearch(p, DATA.deletedName);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.deletedName, Outcome: outcome(res) });
    expect(await returned(p, res, DATA.deletedName), 'DEFECT: a deleted company is returned by Quick Search').toBe(false);
  });

  test(tcTitle(c.quickNoMatch), tcDetails(c.quickNoMatch, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickNoMatch, MODULE);
    const res = await quickSearch(p, DATA.noMatch);
    await recordTestValues(testInfo, { search: DATA.noMatch, Results: res.total });
    expectOk(res);
    expect(res.total, 'no companies').toBe(0);
    await expect(p.resultsError).toBeHidden();
    const shown = await p.resultsTotal();
    if (shown !== null) expect(shown, '"Results: 0"').toBe(0);
  });

  test(tcTitle(c.quickXss), tcDetails(c.quickXss, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickXss, MODULE);
    const payload = '<script>alert(1)</script>';
    const dialogs = [];
    page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
    const res = await quickSearch(p, payload);
    await recordTestValues(testInfo, { search: payload, Results: res.total });
    expectOk(res);
    await page.waitForTimeout(1_000);
    expect(dialogs, 'DEFECT: script in the search text was executed').toEqual([]);
    expect(await page.locator('main').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
    expect(res.total, 'no company matches the script text').toBe(0);
  });

  test(tcTitle(c.quickSql), tcDetails(c.quickSql, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickSql, MODULE);
    const payload = "' OR 1=1 --";
    const res = await quickSearch(p, payload);
    await recordTestValues(testInfo, { search: payload, Results: res.total });
    expectOk(res);
    expect(await page.locator('main').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
    expect(res.total, 'DEFECT: injection text returned companies').toBe(0);
  });

  test(tcTitle(c.quickEmpty), tcDetails(c.quickEmpty, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickEmpty, MODULE);
    await p.chooseQuickSearchScope('Company');
    await p.quickSearchInput.fill('');
    const response = page.waitForResponse(r => /\/Search\/ResultsData/i.test(r.url()), { timeout: 8_000 }).catch(() => null);
    await p.quickSearchButton.click();
    const r = await response;
    await page.waitForLoadState('domcontentloaded');
    observe(testInfo, r ? `Search ran: HTTP ${r.status()}` : `No search ran; stayed on ${page.url()}`);
    await recordTestValues(testInfo, { search: '(empty)', 'Landed on': page.url() });
    if (r) expect(r.status(), 'HTTP status').toBeLessThan(500);
    expect(await page.locator('body').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
    await expect(p.quickSearchInput, 'page still usable').toBeVisible();
  });

  // ================= 2. Advanced Search =================

  test(tcTitle(c.advOpen), tcDetails(c.advOpen, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.advOpen, MODULE);
    await p.openAdvancedFromQuickSearch();
    await expect(page).toHaveURL(/\/Search\?entityId=3/);
    await p.expandAllSections();
    const labels = (await p.visibleFilterLabels()).map(low);
    await recordTestValues(testInfo, { Sections: await p.sectionNames(), 'Criteria shown': labels });
    for (const l of FILTER_LABELS) expect.soft(labels, `"${l}" criterion`).toContain(low(l));
    expect(labels.filter(l => /country/.test(l)), 'no Country criterion').toEqual([]);
    await expect(p.applyButton).toBeVisible();
    await expect(p.resetButton).toBeVisible();
    await shot(page, testInfo, 'advanced-filters');
  });

  test(tcTitle(c.advOperators), tcDetails(c.advOperators, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.advOperators, MODULE);
    await p.gotoAdvanced();
    const seen = {};
    for (const [fieldId, rule] of Object.entries(OPERATORS)) {
      const ops = (await p.operatorOptions(fieldId)).map(o => o.value);
      const def = await p.operatorText(fieldId);
      seen[fieldId] = `${def} [${ops.join(', ')}]`;
      expect.soft(def, `${fieldId}: default operator`).toMatch(rule.def);
      for (const op of rule.must) expect.soft(ops, `${fieldId}: offers "${op}"`).toContain(op);
      if (rule.only) expect.soft(ops.filter(o => !/^is(Not)?Empty$/.test(o)), `${fieldId}: only ${rule.must.join(', ')}`).toEqual(rule.must);
    }
    await recordTestValues(testInfo, seen);
  });

  for (const tc of [c.displayName, c.legalName, c.tradeName, c.website, c.city]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ companySearchPage: p }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      const value = tc.fieldId === 'City' ? tc.value.toLowerCase() : tc.value;
      const res = await advancedSearch(p, { text: { [tc.fieldId]: value } });
      const rows = await p.allRows(res);
      await recordTestValues(testInfo, { [tc.fieldId]: value, Results: res.total, Returned: rows.slice(0, 10).map(nameOf) });
      expect(criterion(res, tc.fieldId), `${tc.fieldId} contains <text>`).toEqual(expect.objectContaining({ operatorKey: 'contains', values: value }));
      expect(res.total, 'companies found').toBeGreaterThan(0);
      const wrong = rows.filter(r => !low(r[tc.column]).includes(low(value)));
      expect(label(wrong), `every ${tc.column} contains "${value}"`).toEqual([]);
    });
  }

  test(tcTitle(c.nameCase), tcDetails(c.nameCase, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.nameCase, MODULE);
    const lower = await advancedSearch(p, { text: { DisplayName: DATA.displayName.toLowerCase() } }, 'lower case');
    const upper = await advancedSearch(p, { text: { DisplayName: DATA.displayName.toUpperCase() } }, 'upper case');
    await recordTestValues(testInfo, { [DATA.displayName.toLowerCase()]: lower.total, [DATA.displayName.toUpperCase()]: upper.total });
    expect(lower.total, 'companies found').toBeGreaterThan(0);
    expect(upper.total, 'same total').toBe(lower.total);
    expect(ids(upper.rows).sort(), 'same companies').toEqual(ids(lower.rows).sort());
  });

  test(tcTitle(c.einEquals), tcDetails(c.einEquals, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.einEquals, MODULE);
    const res = await advancedSearch(p, { text: { EIN: DATA.ein } });
    await recordTestValues(testInfo, { EIN: DATA.ein, Results: res.total, Returned: res.rows.map(nameOf) });
    expect(criterion(res, 'EIN'), 'EIN equals <value>').toEqual(expect.objectContaining({ operatorKey: 'equals', values: DATA.ein }));
    expect(res.rows.map(nameOf), `only "${DATA.einOwner}"`).toEqual([DATA.einOwner]);
  });

  test(tcTitle(c.einPartial), tcDetails(c.einPartial, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.einPartial, MODULE);
    const partial = DATA.ein.slice(0, -1);
    const res = await advancedSearch(p, { text: { EIN: partial } });
    await recordTestValues(testInfo, { EIN: partial, Results: res.total });
    expect(res.total, 'Equals does not match part of an EIN').toBe(0);
  });

  test(tcTitle(c.entityType), tcDetails(c.entityType, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.entityType, MODULE);
    await p.gotoAdvanced();
    const options = await p.dropdownOptions('CompanyEntityTypeIDF');
    expect(options, `"${DATA.entityType}" offered`).toContain(DATA.entityType);
    expect(await p.isMultiSelect('CompanyEntityTypeIDF'), 'single-select').toBe(false);
    const id = await optionValue(p, 'CompanyEntityTypeIDF', DATA.entityType);
    const expected = await p.countCompanies([{ fieldId: 'CompanyEntityTypeIDF', operatorKey: 'equals', values: id }]);
    const res = await advancedSearch(p, { entityType: DATA.entityType });
    await recordTestValues(testInfo, { 'Entity Type': `${DATA.entityType} (${id})`, Results: res.total, 'Companies of that type': expected });
    expect(criterion(res, 'CompanyEntityTypeIDF'), 'Equals sent with the type id').toEqual(expect.objectContaining({ operatorKey: 'equals', values: id }));
    expect(res.total, 'companies of the type').toBeGreaterThan(0);
    expect(res.total, 'every company of the type, nothing else').toBe(expected);
  });

  test(tcTitle(c.entityTypeActiveOnly), tcDetails(c.entityTypeActiveOnly, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.entityTypeActiveOnly, MODULE);
    await p.gotoAdvanced();
    const opts = await page.locator('#CompanyEntityTypeIDF_one option').evaluateAll(o => o.map(x => ({ v: x.value, t: x.textContent.trim() })));
    const real = opts.filter(o => o.v);
    await recordTestValues(testInfo, { Options: real.map(o => o.t) });
    expect(real.length, 'entity types offered').toBeGreaterThan(0);
    expect(real.filter(o => !o.t).map(o => o.v), 'no empty option').toEqual([]);
    expect(real.map(o => o.t).filter((t, i, a) => a.indexOf(t) !== i), 'no duplicate option').toEqual([]);
  });

  test(tcTitle(c.role), tcDetails(c.role, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.role, MODULE);
    await p.gotoAdvanced();
    const options = await p.multiOptions('CompanyRoleIDF');
    expect(options, `"${DATA.role}" offered`).toContain(DATA.role);
    const id = await optionValue(p, 'CompanyRoleIDF', DATA.role);
    const res = await advancedSearch(p, { roles: [DATA.role] });
    await recordTestValues(testInfo, { 'Role options': options, 'Company Role': `${DATA.role} (${id})`, Results: res.total });
    const sent = criterion(res, 'CompanyRoleIDF');
    expect(sent, '"is any of" sent').toEqual(expect.objectContaining({ operatorKey: 'in' }));
    expect(asList(sent.values), 'the role id sent').toEqual([String(id)]);
    expect(res.total, 'companies with the role').toBeGreaterThan(0);
  });

  test(tcTitle(c.roleMulti), tcDetails(c.roleMulti, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.roleMulti, MODULE);
    const one = await advancedSearch(p, { roles: [DATA.role] }, DATA.role);
    const two = await advancedSearch(p, { roles: [DATA.role2] }, DATA.role2);
    const both = await advancedSearch(p, { roles: [DATA.role, DATA.role2] }, 'Both roles');
    await recordTestValues(testInfo, { [DATA.role]: one.total, [DATA.role2]: two.total, 'Any of both': both.total });
    const sent = criterion(both, 'CompanyRoleIDF');
    expect(sent, '"is any of" sent').toEqual(expect.objectContaining({ operatorKey: 'in' }));
    expect(asList(sent.values), 'both roles sent').toHaveLength(2);
    const [oneIds, twoIds, bothIds] = [ids(await p.allRows(one)), ids(await p.allRows(two)), ids(await p.allRows(both))];
    expect(bothIds, 'every row of the combined search read').toHaveLength(both.total);
    expect([...oneIds, ...twoIds].filter(i => !bothIds.includes(i)), 'every single-role company is included').toEqual([]);
    expect(bothIds.filter(i => !oneIds.includes(i) && !twoIds.includes(i)), 'nothing outside the two roles').toEqual([]);
    expect(new Set(bothIds).size, 'a company with both roles is listed once').toBe(bothIds.length);
  });

  test(tcTitle(c.roleActiveOnly), tcDetails(c.roleActiveOnly, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.roleActiveOnly, MODULE);
    await p.gotoAdvanced();
    const opts = await page.locator('#CompanyRoleIDF_list option').evaluateAll(o => o.map(x => ({ v: x.value, t: x.textContent.trim() })));
    await recordTestValues(testInfo, { Options: opts.map(o => o.t) });
    expect(opts.length, 'roles offered').toBeGreaterThan(0);
    expect(opts.filter(o => !o.v || !o.t).map(o => o.t || o.v), 'no empty option').toEqual([]);
    expect(opts.map(o => o.t).filter((t, i, a) => a.indexOf(t) !== i), 'no duplicate option').toEqual([]);
  });

  test(tcTitle(c.roleNone), tcDetails(c.roleNone, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.roleNone, MODULE);
    const res = await advancedSearch(p, { text: { DisplayName: DATA.displayName } });
    const expected = await p.countCompanies([{ fieldId: 'DisplayName', operatorKey: 'contains', values: DATA.displayName }]);
    await recordTestValues(testInfo, { 'Display Name': DATA.displayName, 'Company Role': '(none)', Results: res.total });
    expect(criterion(res, 'CompanyRoleIDF'), 'no role criterion sent').toBeUndefined();
    expect(res.total, 'same as Display Name alone').toBe(expected);
  });

  test(tcTitle(c.accountName), tcDetails(c.accountName, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountName, MODULE);
    const res = await advancedSearch(p, { text: { AccountName: DATA.accountName } });
    const names = await allNames(p, res);
    await recordTestValues(testInfo, { 'Account Name': DATA.accountName, Results: res.total, Returned: names.slice(0, 10) });
    expect(criterion(res, 'AccountName'), 'Account Name contains <text>').toEqual(expect.objectContaining({ operatorKey: 'contains', values: DATA.accountName }));
    expect(names, `"${DATA.accountOwner}" (owns Account "${DATA.accountName}")`).toContain(DATA.accountOwner);
  });

  test(tcTitle(c.accountNumber), tcDetails(c.accountNumber, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNumber, MODULE);
    const res = await advancedSearch(p, { text: { AccountNumber: DATA.accountNumber } });
    await recordTestValues(testInfo, { 'Account Number': DATA.accountNumber, Results: res.total, Returned: res.rows.map(nameOf) });
    expect(criterion(res, 'AccountNumber'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals', values: DATA.accountNumber }));
    expect(res.rows.map(nameOf), 'the owner of the Account').toEqual([DATA.accountOwner]);
  });

  test(tcTitle(c.accountNumberPartial), tcDetails(c.accountNumberPartial, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNumberPartial, MODULE);
    const partial = DATA.accountNumber.slice(0, -1);
    const res = await advancedSearch(p, { text: { AccountNumber: partial } });
    await recordTestValues(testInfo, { 'Account Number': partial, Results: res.total });
    expect(res.rows.map(nameOf), 'part of the number does not match').not.toContain(DATA.accountOwner);
  });

  test(tcTitle(c.accountStatus), tcDetails(c.accountStatus, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountStatus, MODULE);
    await p.gotoAdvanced();
    const options = await p.dropdownOptions('AccountStatusIDF');
    expect(options, `"${DATA.accountStatus}" offered`).toContain(DATA.accountStatus);
    const id = await optionValue(p, 'AccountStatusIDF', DATA.accountStatus);
    const res = await advancedSearch(p, { accountStatus: DATA.accountStatus });
    const names = await allNames(p, res);
    await recordTestValues(testInfo, { 'Account Status': `${DATA.accountStatus} (${id})`, Results: res.total });
    expect(criterion(res, 'AccountStatusIDF'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals', values: id }));
    expect(res.total, 'companies with such an account').toBeGreaterThan(0);
    expect(names, `"${DATA.accountOwner}" (its Account is ${DATA.accountStatus})`).toContain(DATA.accountOwner);
  });

  test(tcTitle(c.accountCombined), tcDetails(c.accountCombined, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountCombined, MODULE);
    const byNo = await advancedSearch(p, { text: { AccountNumber: DATA.accountNumber } }, 'Account Number');
    const both = await advancedSearch(p, { text: { AccountName: DATA.accountName, AccountNumber: DATA.accountNumber } }, 'Name + Number');
    await recordTestValues(testInfo, { 'Account Name': DATA.accountName, 'Account Number': DATA.accountNumber, Results: both.total, Returned: both.rows.map(nameOf) });
    expect(both.rows.map(nameOf), `"${DATA.accountOwner}" returned`).toContain(DATA.accountOwner);
    expect(ids(both.rows).filter(i => !ids(byNo.rows).includes(i)), 'every row also has the Account Number').toEqual([]);
  });

  test(tcTitle(c.affiliatedPerson), tcDetails(c.affiliatedPerson, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.affiliatedPerson, MODULE);
    const res = await advancedSearch(p, { person: DATA.person });
    const names = await allNames(p, res);
    const all = await p.countCompanies([]);
    await recordTestValues(testInfo, { 'Affiliated Person': DATA.person, 'Value sent': JSON.stringify(criterion(res, 'AffiliatedPersonIDF') || null), Results: res.total, Returned: names });
    expect(criterion(res, 'AffiliatedPersonIDF'), 'Affiliated Person criterion sent').toBeDefined();
    expect(names, `"${DATA.personCompany}" (affiliated with ${DATA.person})`).toContain(DATA.personCompany);
    expect(res.total, 'only the person\'s companies').toBeLessThan(all);
  });

  test(tcTitle(c.phoneContains), tcDetails(c.phoneContains, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneContains, MODULE);
    const res = await advancedSearch(p, { text: { PhoneNumber: DATA.phoneDashed } });
    await recordTestValues(testInfo, { 'Phone Number': DATA.phoneDashed, 'Value sent': criterion(res, 'PhoneNumber')?.values, Results: res.total, Returned: res.rows.map(nameOf) });
    expect(criterion(res, 'PhoneNumber'), 'Contains is the default').toEqual(expect.objectContaining({ operatorKey: 'contains' }));
    expect(res.rows.map(nameOf), `DEFECT: "${DATA.phoneDashed}" is not normalized to digits before matching`).toContain(DATA.phoneOwner);
  });

  test(tcTitle(c.phoneEquals), tcDetails(c.phoneEquals, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneEquals, MODULE);
    const res = await advancedSearch(p, { text: { PhoneNumber: [DATA.phoneFormatted, 'equals'] } });
    await recordTestValues(testInfo, { 'Phone Number (equals)': DATA.phoneFormatted, 'Value sent': criterion(res, 'PhoneNumber')?.values, Results: res.total, Returned: res.rows.map(nameOf) });
    expect(criterion(res, 'PhoneNumber'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals' }));
    expect(res.rows.map(nameOf), `DEFECT: "${DATA.phoneFormatted}" does not equal ${DATA.phoneE164} after normalization`).toEqual([DATA.phoneOwner]);
  });

  test(tcTitle(c.phoneEqualsPartial), tcDetails(c.phoneEqualsPartial, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneEqualsPartial, MODULE);
    const res = await advancedSearch(p, { text: { PhoneNumber: [DATA.phoneLocal, 'equals'] } });
    await recordTestValues(testInfo, { 'Phone Number (equals)': DATA.phoneLocal, Results: res.total });
    expect(res.rows.map(nameOf), 'Equals does not match part of the number').not.toContain(DATA.phoneOwner);
  });

  test(tcTitle(c.phoneLetters), tcDetails(c.phoneLetters, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneLetters, MODULE);
    await p.gotoAdvanced();
    await p.setText('PhoneNumber', 'abcdef');
    const res = await p.applyExpectingNoSearch();
    await recordTestValues(testInfo, { 'Phone Number': 'abcdef', 'Search ran': !!res, Results: res ? res.total : '-' });
    if (res) {
      expect(res.status, 'HTTP status').toBe(200);
      expect(res.total, 'DEFECT: letters in the phone criterion returned companies').toBe(0);
    }
  });

  test(tcTitle(c.address), tcDetails(c.address, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.address, MODULE);
    const a1 = await advancedSearch(p, { text: { Address: DATA.address } }, 'Address1 text');
    const a2 = await advancedSearch(p, { text: { Address: DATA.address2 } }, 'Address2 text');
    await recordTestValues(testInfo, { [`Address "${DATA.address}"`]: `${a1.total}: ${a1.rows.map(nameOf).join(', ')}`, [`Address "${DATA.address2}"`]: `${a2.total}: ${a2.rows.map(nameOf).join(', ')}` });
    expect(criterion(a1, 'Address'), 'Address contains <text>').toEqual(expect.objectContaining({ operatorKey: 'contains', values: DATA.address }));
    expect(a1.total, 'Address1 text finds companies').toBeGreaterThan(0);
    expect(a2.rows.map(nameOf), `Address2 text finds "${DATA.address2Owner}"`).toContain(DATA.address2Owner);
  });

  test(tcTitle(c.region), tcDetails(c.region, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.region, MODULE);
    const text = await advancedSearch(p, { text: { Region: DATA.region } }, 'Region text');
    const linked = await advancedSearch(p, { text: { Region: DATA.regionLinked } }, 'Region record');
    const rows = await p.allRows(text);
    await recordTestValues(testInfo, { [`Region "${DATA.region}"`]: text.total, [`Region "${DATA.regionLinked}"`]: `${linked.total}: ${linked.rows.map(nameOf).join(', ')}` });
    expect(criterion(text, 'Region'), 'Region contains <text>').toEqual(expect.objectContaining({ operatorKey: 'contains', values: DATA.region }));
    expect(text.total, 'companies in the region').toBeGreaterThan(0);
    expect(label(rows.filter(r => !low(r.Region).includes(low(DATA.region)))), `every Region contains "${DATA.region}"`).toEqual([]);
    expect(linked.total, `"${DATA.regionLinked}" (Region record name) finds companies`).toBeGreaterThan(0);
  });

  test(tcTitle(c.postal), tcDetails(c.postal, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.postal, MODULE);
    const prefix = await advancedSearch(p, { text: { PostalCode: DATA.postalPrefix } }, 'Prefix');
    const middle = DATA.postalPrefix.slice(1);
    const inner = await advancedSearch(p, { text: { PostalCode: middle } }, 'Digits from inside the code');
    const rows = await p.allRows(prefix);
    await recordTestValues(testInfo, { [`starts with ${DATA.postalPrefix}`]: prefix.total, [`starts with ${middle}`]: inner.total });
    expect(criterion(prefix, 'PostalCode'), 'BeginsWith is the default').toEqual(expect.objectContaining({ operatorKey: 'startsWith' }));
    expect(prefix.total, 'the prefix finds companies').toBeGreaterThan(0);
    expect(label(rows.filter(r => r['Postal Code'] && !String(r['Postal Code']).startsWith(DATA.postalPrefix))), 'every shown code starts with the prefix').toEqual([]);
    const leaked = ids(inner.rows).filter(i => ids(rows).includes(i));
    expect(leaked, `"${middle}" (inside "${DATA.postalPrefix}...") must not match those codes`).toEqual([]);
  });

  test(tcTitle(c.noCountry), tcDetails(c.noCountry, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.noCountry, MODULE);
    await p.gotoAdvanced();
    const labels = await p.visibleFilterLabels();
    await recordTestValues(testInfo, { 'Criteria shown': labels });
    expect(labels.filter(l => /country/i.test(l)), 'no Country criterion').toEqual([]);
  });

  test(tcTitle(c.includeDeletedDefault), tcDetails(c.includeDeletedDefault, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.includeDeletedDefault, MODULE);
    await p.gotoAdvanced();
    await expect(p.includeDeletedCheckbox, 'toggle is OFF').not.toBeChecked();
    await p.setText('DisplayName', DATA.displayName);
    const res = await p.apply();
    expectOk(res);
    await recordTestValues(testInfo, { 'Include Deleted': 'OFF (default)', Chips: await p.chipTexts(), Results: res.total });
    const sent = criterion(res, 'IsArchived');
    expect(!sent || sent.values === false || sent.values === 'false', 'deleted companies are excluded (IsArchived = false)').toBe(true);
  });

  test(tcTitle(c.includeDeletedOn), tcDetails(c.includeDeletedOn, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.includeDeletedOn, MODULE);
    const off = await advancedSearch(p, { text: { DisplayName: DATA.displayName } }, 'Include Deleted OFF');
    const on = await advancedSearch(p, { text: { DisplayName: DATA.displayName }, includeDeleted: true }, 'Include Deleted ON');
    await recordTestValues(testInfo, { 'Display Name': DATA.displayName, OFF: off.total, ON: on.total, 'Sent when ON': JSON.stringify(criterion(on, 'IsArchived') || null) });
    expect(off.total, 'active companies found').toBeGreaterThan(0);
    expect(on.total, 'DEFECT: Include Deleted ON returns fewer companies - it acts as "only deleted" instead of "also deleted"').toBeGreaterThanOrEqual(off.total);
    expect(label(off.rows.filter(r => !ids(on.rows).includes(cid(r)))), 'active companies are still returned with ON').toEqual([]);
  });

  test(tcTitle(c.includeDeletedCompany), tcDetails(c.includeDeletedCompany, MODULE), async ({ companySearchPage: p }, testInfo) => {
    test.skip(!DATA.deletedName, 'Set SEARCH_COMPANY_DELETED_NAME to a deleted company (none in the sandbox)');
    await applyAllureLabels(c.includeDeletedCompany, MODULE);
    const isIt = r => low(nameOf(r)) === low(DATA.deletedName);
    const off = await advancedSearch(p, { text: { DisplayName: DATA.deletedName } }, 'OFF');
    const on = await advancedSearch(p, { text: { DisplayName: DATA.deletedName }, includeDeleted: true }, 'ON');
    await recordTestValues(testInfo, { 'Deleted company': DATA.deletedName, OFF: off.total, ON: on.total });
    expect(off.rows.filter(isIt).length, 'hidden while OFF').toBe(0);
    expect(on.rows.filter(isIt).length, 'returned with ON').toBeGreaterThan(0);
  });

  test(tcTitle(c.combined), tcDetails(c.combined, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.combined, MODULE);
    const city = await advancedSearch(p, { text: { City: DATA.city } }, 'City');
    const role = await advancedSearch(p, { roles: [DATA.role] }, 'Company Role');
    const both = await advancedSearch(p, { text: { City: DATA.city }, roles: [DATA.role] }, 'City + Role');
    const [cityIds, roleIds, bothIds] = [ids(await p.allRows(city)), ids(await p.allRows(role)), ids(await p.allRows(both))];
    const expected = cityIds.filter(i => roleIds.includes(i)).sort((a, b) => a - b);
    await recordTestValues(testInfo, { City: city.total, 'Company Role': role.total, 'City + Role': both.total });
    for (const f of ['City', 'CompanyRoleIDF']) expect(criterion(both, f), `${f} sent`).toBeDefined();
    expect([...bothIds].sort((a, b) => a - b), 'intersection of the two searches').toEqual(expected);
  });

  test(tcTitle(c.reset), tcDetails(c.reset, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.reset, MODULE);
    await p.gotoAdvanced();
    await p.setText('DisplayName', DATA.displayName);
    await p.setText('EIN', DATA.ein);
    await p.setText('City', DATA.city);
    await p.setDropdown('CompanyEntityTypeIDF', DATA.entityType);
    await p.setDropdown('AccountStatusIDF', DATA.accountStatus);
    await p.setIncludeDeleted(true);
    await recordTestValues(testInfo, { 'Display Name': DATA.displayName, EIN: DATA.ein, City: DATA.city, 'Entity Type': DATA.entityType, 'Account Status': DATA.accountStatus, 'Include Deleted': 'ON' });
    await p.resetFilters();
    await p.expandAllSections();
    for (const f of ['DisplayName', 'EIN', 'City']) await expect(page.locator(`#${f}_one`), `${f} cleared`).toHaveValue('');
    expect(await p.dropdownText('CompanyEntityTypeIDF'), 'Entity Type back to default').toMatch(/select|all/i);
    expect(await p.dropdownText('AccountStatusIDF'), 'Account Status back to default').toMatch(/select|all/i);
    await expect(p.includeDeletedCheckbox, 'Include Deleted back to OFF').not.toBeChecked();
  });

  test(tcTitle(c.advEmpty), tcDetails(c.advEmpty, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.advEmpty, MODULE);
    await p.gotoAdvanced();
    const res = await p.applyExpectingNoSearch();
    const shownError = (await p.isVisibleWithin(p.resultsError, 2_000)) ? (await p.resultsError.innerText()).trim() : '';
    observe(testInfo, res ? `Search ran: ${res.total} results, error "${res.error || ''}"` : 'No search ran');
    await recordTestValues(testInfo, { Criteria: '(none)', 'Search ran': !!res, Message: shownError || res?.error || '-' });
    if (res) expect(res.status, 'HTTP status').toBe(200);
    const pageText = await page.locator('main').evaluate(m => {
      const cl = m.cloneNode(true);
      cl.querySelectorAll('table, .card-grid, [id*="Grid" i], [class*="result-card" i]').forEach(e => e.remove());
      return cl.innerText ?? cl.textContent;
    });
    expect(`${pageText}\n${shownError}`, 'no server error shown').not.toMatch(MESSAGES.serverError);
    await expect(p.openFiltersButton, 'page still usable').toBeVisible();
  });

  // ================= 4. Result ordering =================

  test(tcTitle(c.orderAccountNumber), tcDetails(c.orderAccountNumber, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderAccountNumber, MODULE);
    const res = await quickSearch(p, DATA.accountNumber);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.accountNumber, Outcome: outcome(res) });
    if (res.openedId) {
      observe(testInfo, 'Only one company matched, so the app opened the record directly (first by definition)');
      expect(await returned(p, res, DATA.accountOwner), 'the opened record is the Account owner').toBe(true);
      return;
    }
    expect(nameOf(res.rows[0]), 'exact Account Number match is first').toBe(DATA.accountOwner);
  });

  test(tcTitle(c.orderDisplayName), tcDetails(c.orderDisplayName, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderDisplayName, MODULE);
    const t = low(DATA.displayName);
    const res = await quickSearch(p, DATA.displayName);
    expectOk(res);
    const rows = res.openedId ? [] : await p.allRows(res);
    await recordTestValues(testInfo, { search: DATA.displayName, 'Order returned': rows.slice(0, 15).map(nameOf) });
    test.skip(!!res.openedId, `Only one company matches "${DATA.displayName}" - set SEARCH_COMPANY_DISPLAY_NAME to a name others contain`);
    const exactAt = rows.findIndex(r => low(nameOf(r)) === t);
    expect(exactAt, 'the exact Display Name match is returned').toBeGreaterThanOrEqual(0);
    const partialBefore = rows.slice(0, exactAt).filter(r => tier(r, DATA.displayName) === 6);
    expect(label(partialBefore), 'no partial match is ranked above the exact Display Name match').toEqual([]);
  });

  test(tcTitle(c.orderNameTiers), tcDetails(c.orderNameTiers, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderNameTiers, MODULE);
    const seen = {};
    for (const text of [DATA.displayName, DATA.accountNumber]) {
      await p.gotoStart();
      const res = await quickSearch(p, text);
      expectOk(res, text);
      if (res.openedId) { seen[text] = 'single match (opened)'; continue; }
      const rows = await p.allRows(res);
      const tiers = rows.map(r => tier(r, text));
      seen[text] = rows.slice(0, 15).map((r, i) => `${tiers[i]}:${nameOf(r)}`);
      const breaks = [];
      for (let i = 1; i < tiers.length; i++) if (tiers[i] < tiers[i - 1]) breaks.push(`${nameOf(rows[i])} (tier ${tiers[i]}) after ${nameOf(rows[i - 1])} (tier ${tiers[i - 1]})`);
      expect.soft(breaks, `"${text}": rows follow the exact-match tiers`).toEqual([]);
    }
    await recordTestValues(testInfo, seen);
  });

  test(tcTitle(c.orderPhone), tcDetails(c.orderPhone, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderPhone, MODULE);
    const res = await quickSearch(p, DATA.phoneE164);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.phoneE164, Outcome: outcome(res) });
    if (res.openedId) {
      observe(testInfo, 'Only one company matched, so the app opened the record directly (first by definition)');
      expect(await returned(p, res, DATA.phoneOwner), 'the opened record is the phone owner').toBe(true);
      return;
    }
    expect(nameOf(res.rows[0]), 'exact phone match is first').toBe(DATA.phoneOwner);
  });

  test(tcTitle(c.orderCustomer), tcDetails(c.orderCustomer, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderCustomer, MODULE);
    await p.gotoAdvanced();
    const roleId = await optionValue(p, 'CompanyRoleIDF', DATA.customerRole);
    const term = await customerMixTerm(p, roleId);
    test.skip(!term, `No Display Name text is shared by "${DATA.customerRole}" and other companies`);
    const res = await advancedSearch(p, { text: { DisplayName: term } });
    const rows = (await p.allRows(res)).filter(r => tier(r, term) === 6);
    const custIds = await p.companyIds([{ fieldId: 'DisplayName', operatorKey: 'contains', values: term }, { fieldId: 'CompanyRoleIDF', operatorKey: 'in', values: [roleId] }]);
    const order = rows.map(r => (custIds.includes(cid(r)) ? 'C' : 'N')).join('');
    await recordTestValues(testInfo, { 'Display Name contains': term, [`Order (C = ${DATA.customerRole}, N = other)`]: order, Rows: rows.map(nameOf) });
    expect(order, `DEFECT: "${DATA.customerRole}" companies are not ranked before the others (4.6)`).toMatch(/^C*N*$/);
  });

  test(tcTitle(c.orderAlpha), tcDetails(c.orderAlpha, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderAlpha, MODULE);
    await p.gotoAdvanced();
    const roleId = await optionValue(p, 'CompanyRoleIDF', DATA.customerRole);
    const term = (await customerMixTerm(p, roleId)) || 'a';
    const res = await advancedSearch(p, { text: { DisplayName: term } });
    const rows = (await p.allRows(res)).filter(r => tier(r, term) === 6);
    const custIds = await p.companyIds([{ fieldId: 'DisplayName', operatorKey: 'contains', values: term }, { fieldId: 'CompanyRoleIDF', operatorKey: 'in', values: [roleId] }]);
    const breaks = [];
    for (const group of [rows.filter(r => custIds.includes(cid(r))), rows.filter(r => !custIds.includes(cid(r)))]) {
      for (let i = 1; i < group.length; i++) {
        if (nameOf(group[i - 1]).localeCompare(nameOf(group[i]), undefined, { sensitivity: 'base' }) > 0) breaks.push(`${nameOf(group[i - 1])} before ${nameOf(group[i])}`);
      }
    }
    await recordTestValues(testInfo, { 'Display Name contains': term, Rows: rows.map(nameOf) });
    expect(rows.length, 'at least two rows to compare').toBeGreaterThan(1);
    expect(breaks, 'DEFECT: results are not alphabetical by Display Name within a tier').toEqual([]);
  });

  test(tcTitle(c.paging), tcDetails(c.paging, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.paging, MODULE);
    const page1 = await advancedSearch(p, { roles: [DATA.role] }, 'Page 1');
    expect(page1.total, 'more than one page').toBeGreaterThan(page1.rows.length);
    const page2 = await test.step('Next page', () => p.goToNextPage());
    expectOk(page2, 'page 2');
    await recordTestValues(testInfo, { Total: page1.total, 'Page 1 rows': page1.rows.length, 'Page 2 rows': page2.rows.length, 'Page 2 start': page2.body.start });
    expect(page2.body.start, 'page 2 starts after page 1').toBe(page1.rows.length);
    expect(page2.total, 'total unchanged between pages').toBe(page1.total);
    expect(ids(page2.rows).filter(i => ids(page1.rows).includes(i)), 'no company on both pages').toEqual([]);
  });

  // ================= 5. Presets =================

  test(tcTitle(c.presetCustomer), tcDetails(c.presetCustomer, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.presetCustomer, MODULE);
    await p.gotoAdvanced();
    const shown = await p.isVisibleWithin(p.customerCompaniesPreset, 5_000);
    await shot(page, testInfo, 'presets');
    await recordTestValues(testInfo, { 'Preset shown': shown });
    expect(shown, 'DEFECT: the "Customer companies" preset is configured but not offered on the Company search page').toBe(true);
    const res = await p.applyCustomerCompaniesPreset();
    expectOk(res, 'preset');
    const statusId = await optionValue(p, 'AccountStatusIDF', 'Active');
    const activeIds = await p.companyIds([{ fieldId: 'AccountStatusIDF', operatorKey: 'equals', values: statusId }]);
    const presetIds = ids(await p.allRows(res));
    await recordTestValues(testInfo, { 'Preset criteria': JSON.stringify(res.criteria), Results: res.total, 'Account Status = Active': activeIds.length });
    expect(presetIds.filter(i => !activeIds.includes(i)), 'only companies with an Active account').toEqual([]);
    expect(activeIds.filter(i => !presetIds.includes(i)), 'every company with an Active account').toEqual([]);
  });

  test(tcTitle(c.presetCustomerDeleted), tcDetails(c.presetCustomerDeleted, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.presetCustomerDeleted, MODULE);
    await p.gotoAdvanced();
    const shown = await p.isVisibleWithin(p.customerCompaniesPreset, 5_000);
    expect(shown, 'DEFECT: the "Customer companies" preset is configured but not offered on the Company search page').toBe(true);
    const res = await p.applyCustomerCompaniesPreset();
    expectOk(res, 'preset');
    const sent = criterion(res, 'IsArchived');
    await recordTestValues(testInfo, { 'Preset criteria': JSON.stringify(res.criteria) });
    expect(!sent || sent.values === false || sent.values === 'false', 'deleted companies excluded (IsArchived = false)').toBe(true);
    if (DATA.deletedName) expect(await returned(p, res, DATA.deletedName), 'the deleted company is not returned').toBe(false);
  });

  // ================= results / permissions =================

  test(tcTitle(c.resultsView), tcDetails(c.resultsView, MODULE), async ({ companySearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.resultsView, MODULE);
    const res = await advancedSearch(p, { text: { DisplayName: DATA.displayName } });
    expect(res.total, 'companies found').toBeGreaterThan(0);
    expect(await p.resultsTotal(), '"Results:" equals the total returned').toBe(res.total);
    const mainText = await page.locator('main').innerText();
    for (const r of res.rows.slice(0, 5)) expect(mainText, `"${nameOf(r)}" shown`).toContain(nameOf(r));
    await shot(page, testInfo, 'company-results');
    const landing = await test.step('Open the first result', () => p.openFirstResult());
    const url = landing.url();
    await recordTestValues(testInfo, { 'Display Name': DATA.displayName, Results: res.total, Opened: `${nameOf(res.rows[0])} -> ${url}` });
    expect(url, 'opens the Company record').toMatch(new RegExp(`/Company/Edit/${cid(res.rows[0])}(?:[/?#]|$)`, 'i'));
    if (landing !== p.page) await landing.close();
  });

  test(tcTitle(c.permission), tcDetails(c.permission, MODULE), async ({ companySearchPage: p }, testInfo) => {
    await applyAllureLabels(c.permission, MODULE);
    const res = await advancedSearch(p, { roles: [DATA.role] });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Company Role': DATA.role, 'Rows checked': rows.length });
    expect(rows.filter(r => r.IsAllowed === false).map(cid), 'no company the user may not view').toEqual([]);
  });
});
