const { test, expect } = require('../fixtures/fixtures');
const { MODULE, DATA, FILTER_LABELS, EXCLUDED_LABELS, OPERATORS, QUICK_FIELDS, MESSAGES, cases: c } = require('../testData/accountSearchData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues } = require('../utils/testCase');
const { env } = require('../utils/testData');

/**
 * 62828 Stratym Entity Search Specification - Account.
 * Quick Search = top-bar search with Record Type "Account"; Advanced Search = /Search?entityId=1 + Advanced Filters drawer.
 * Read-only: nothing is created. Every search returns the JSON of POST /Search/ResultsData, so the rules are checked
 * on the criteria sent and the rows the server returned. Sandbox values are in testData/accountSearchData.js and can be
 * overridden in .env.
 *
 * Not automated: record-level visibility for a second, restricted user (8 - the suite has one signed-in user; 059 checks
 * the IsAllowed flag of every row), Person MiddleName (no owner in the sandbox has one), stored-preference column
 * dropping (covered by search-results-config.spec).
 */

const aid = r => Number(r['Record ID'] ?? r._primaryKeyValue);
const ids = rows => rows.map(aid);
const nameOf = r => String(r['Account Name'] || '');
const ownerOf = r => String(r['Account Owner'] || '');
const low = v => String(v ?? '').toLowerCase();
const sortNum = a => [...a].sort((x, y) => x - y);
const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const criterion = (res, fieldId) => res.criteria.find(x => String(x.fieldId).toLowerCase() === fieldId.toLowerCase());
const criteriaOf = (res, fieldId) => res.criteria.filter(x => String(x.fieldId).toLowerCase() === fieldId.toLowerCase());
const asList = v => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(String).filter(Boolean);
const label = rows => rows.map(r => `${aid(r)}: ${nameOf(r)} (${ownerOf(r)})`);
const P = (fieldId, operatorKey, values) => ({ fieldId, operatorKey, values });

/** The search returned normally (HTTP 200, no error text). */
function expectOk(res, what = 'search') {
  expect(res.status, `${what}: HTTP status`).toBe(200);
  expect(res.error, `${what}: no error returned`).toBeNull();
}

/**
 * Advanced Search with the given criteria; returns the ResultsData result.
 * crit: { text: { FieldId: value | [value, operator] }, status, statuses: [labels], country, countries: [labels], includeDeleted }
 */
async function advancedSearch(p, crit = {}, title = 'Advanced Search') {
  return test.step(`${title}: ${JSON.stringify(crit)}`, async () => {
    await p.gotoAdvanced();
    for (const [fieldId, v] of Object.entries(crit.text || {})) {
      const [value, op] = Array.isArray(v) ? v : [v];
      await p.setText(fieldId, value, op);
    }
    if (crit.status) { await p.chooseOperator('AccountStatusIDF', 'equals'); await p.setDropdown('AccountStatusIDF', crit.status); }
    if (crit.statuses) await p.setMulti('AccountStatusIDF', crit.statuses);
    if (crit.country) { await p.chooseOperator('BillingCountryIDF', 'equals'); await p.setDropdown('BillingCountryIDF', crit.country); }
    if (crit.countries) await p.setMulti('BillingCountryIDF', crit.countries);
    if (crit.includeDeleted !== undefined) await p.setIncludeDeleted(crit.includeDeleted);
    const res = await p.apply();
    expectOk(res, title);
    return res;
  });
}

async function quickSearch(p, text) {
  return test.step(`Quick Search "${text}"`, () => p.quickSearch(text));
}

/** Rows of a Quick Search; a single match opens the record, so then the opened account is read by its ID. */
async function quickRows(p, res) {
  if (res.openedId) return p.accountRows([P('AccountName', 'isNotEmpty', '')]).then(rows => rows.filter(r => aid(r) === res.openedId));
  return p.allRows(res);
}

const outcome = res => (res.openedId ? `opened /Account/Edit/${res.openedId} (single match)` : `${res.total} results: ${res.rows.slice(0, 5).map(nameOf).join(', ')}`);

/** Value (id) of a dropdown option by its text. */
async function optionValue(p, fieldId, text) {
  const o = (await p.dropdownValues(fieldId)).find(x => low(x.text) === low(text));
  return o ? o.value : null;
}

/** Relevance tier of a row for Quick Search text t (spec 6.3 rules 1 - 7; 8 = none of them). */
function tier(r, t) {
  const v = low(t).trim();
  const d = v.replace(/\D/g, '');
  const phone = String(r['Phone Number'] ?? '').replace(/\D/g, '');
  if (low(r['Account Number']) === v) return 1;
  if (low(nameOf(r)) === v) return 2;
  if (low(ownerOf(r)) === v) return 3;
  if (d && phone && phone === d) return 4;
  if (low(nameOf(r)).includes(v)) return 5;
  if (low(ownerOf(r)).includes(v)) return 6;
  if (d && phone.includes(d)) return 7;
  return 8;
}

test.describe('Account Search - Entity Search Specification (62828)', () => {
  test.beforeEach(async ({ accountSearchPage }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    await accountSearchPage.gotoStart();
  });

  // ================= 6. Quick Search =================

  test(tcTitle(c.quickScope), tcDetails(c.quickScope, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickScope, MODULE);
    expect(await p.quickSearchScopes(), 'Quick Search Record Type offers "Account"').toContain('Account');
    const res = await quickSearch(p, DATA.accountName);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.accountName, 'Record Type': 'Account', 'Criteria sent': res.criteria.map(x => `${x.fieldId} ${x.operatorKey}`), Outcome: outcome(res) });
    expect(res.body.entityId, 'Account entity searched').toBe('1');
    for (const [f, op] of QUICK_FIELDS) {
      expect(res.criteria.some(x => x.fieldId === f && x.operatorKey === op && x.values === DATA.accountName),
        `${f} ${op} <text> is searched`).toBe(true);
    }
    expect(res.total, 'accounts found').toBeGreaterThan(0);
    if (!res.openedId) {
      await expect(page).toHaveURL(/\/Search\/QuickSearch\?.*entityId=1\b/);
      expect(await p.resultsTotal(), '"Results:" equals the total returned').toBe(res.total);
    }
    await shot(page, testInfo, 'quick-search-results');
  });

  test(tcTitle(c.quickAccountName), tcDetails(c.quickAccountName, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickAccountName, MODULE);
    const part = DATA.accountNamePart;
    const expected = ids(await p.accountRows([P('AccountName', 'contains', part)]));
    const res = await quickSearch(p, part);
    expectOk(res);
    const got = ids(await quickRows(p, res));
    await recordTestValues(testInfo, { search: part, Outcome: outcome(res), 'Accounts whose name contains it': expected.length });
    expect(expected.length, 'sandbox has accounts containing the text').toBeGreaterThan(0);
    expect(expected.filter(i => !got.includes(i)), 'every account whose name contains the text is returned').toEqual([]);
  });

  test(tcTitle(c.quickAccountNumber), tcDetails(c.quickAccountNumber, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickAccountNumber, MODULE);
    const res = await quickSearch(p, DATA.accountNumber);
    expectOk(res);
    const rows = await quickRows(p, res);
    await recordTestValues(testInfo, { search: DATA.accountNumber, Outcome: outcome(res) });
    if (!res.openedById) expect(criteriaOf(res, 'AccountNumber').map(x => x.operatorKey), 'Account Number: exact match sent').toContain('equals');
    expect(rows.map(nameOf), `"${DATA.accountNumberName}" found by Account Number ${DATA.accountNumber}`).toContain(DATA.accountNumberName);
  });

  test(tcTitle(c.quickOwnerCompany), tcDetails(c.quickOwnerCompany, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickOwnerCompany, MODULE);
    const owned = await p.accountRows([P('AccountOwner', 'equals', DATA.ownerCompany)]);
    const res = await quickSearch(p, DATA.ownerCompany);
    expectOk(res);
    const got = ids(await quickRows(p, res));
    await recordTestValues(testInfo, { search: DATA.ownerCompany, Outcome: outcome(res), [`Accounts of ${DATA.ownerCompany}`]: owned.map(nameOf) });
    expect(owned.length, `"${DATA.ownerCompany}" owns accounts`).toBeGreaterThan(0);
    expect(label(owned.filter(r => !got.includes(aid(r)))), 'every account of the owner is returned').toEqual([]);
  });

  test(tcTitle(c.quickOwnerLegal), tcDetails(c.quickOwnerLegal, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickOwnerLegal, MODULE);
    const res = await quickSearch(p, DATA.ownerLegal);
    expectOk(res);
    const rows = await quickRows(p, res);
    await recordTestValues(testInfo, { search: DATA.ownerLegal, Outcome: outcome(res) });
    expect(rows.map(nameOf), `"${DATA.ownerLegalAccount}" found by its owner's Legal Name`).toContain(DATA.ownerLegalAccount);
  });

  test(tcTitle(c.quickOwnerPerson), tcDetails(c.quickOwnerPerson, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickOwnerPerson, MODULE);
    const owned = await p.accountRows([P('AccountOwner', 'equals', DATA.ownerPerson)]);
    const res = await quickSearch(p, DATA.ownerPersonLast);
    expectOk(res);
    const got = ids(await quickRows(p, res));
    await recordTestValues(testInfo, { search: DATA.ownerPersonLast, Outcome: outcome(res), [`Accounts of ${DATA.ownerPerson}`]: owned.length });
    test.skip(!owned.length, `No account owned by Person "${DATA.ownerPerson}" - set SEARCH_ACCOUNT_OWNER_PERSON`);
    expect(label(owned.filter(r => !got.includes(aid(r)))), 'every account of the person is returned').toEqual([]);
  });

  test(tcTitle(c.quickPhone), tcDetails(c.quickPhone, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickPhone, MODULE);
    const res = await quickSearch(p, DATA.phoneE164);
    expectOk(res);
    const rows = await quickRows(p, res);
    await recordTestValues(testInfo, { search: DATA.phoneE164, Outcome: outcome(res) });
    expect(rows.filter(r => ownerOf(r) === DATA.phoneOwner).length, `accounts of "${DATA.phoneOwner}" found by ${DATA.phoneE164}`).toBeGreaterThan(0);
  });

  test(tcTitle(c.quickPhoneFormatted), tcDetails(c.quickPhoneFormatted, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickPhoneFormatted, MODULE);
    const res = await quickSearch(p, DATA.phoneFormatted);
    expectOk(res);
    const rows = await quickRows(p, res);
    await recordTestValues(testInfo, { search: DATA.phoneFormatted, 'Phone value sent': criteriaOf(res, 'PhoneNumber').map(x => x.values), Outcome: outcome(res) });
    expect(rows.filter(r => ownerOf(r) === DATA.phoneOwner).length, `"${DATA.phoneFormatted}" normalized to ${DATA.phoneDigits} finds "${DATA.phoneOwner}" accounts`).toBeGreaterThan(0);
  });

  test(tcTitle(c.quickStatusNeutral), tcDetails(c.quickStatusNeutral, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickStatusNeutral, MODULE);
    const t = 'Inactive';
    const res = await quickSearch(p, t);
    expectOk(res);
    const rows = await quickRows(p, res);
    await recordTestValues(testInfo, { search: t, 'Fields sent': [...new Set(res.criteria.map(x => x.fieldId))], Outcome: outcome(res) });
    expect(res.criteria.filter(x => /status/i.test(x.fieldId)), 'no Account Status criterion').toEqual([]);
    const byStatusOnly = rows.filter(r => !['Account Name', 'Account Number', 'Account Owner', 'Phone Number'].some(f => low(r[f]).includes(low(t))));
    expect(label(byStatusOnly), 'no account returned only because of its status').toEqual([]);
  });

  test(tcTitle(c.quickCase), tcDetails(c.quickCase, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickCase, MODULE);
    const t = DATA.ownerCompany;
    const spellings = [t.toLowerCase(), t.toUpperCase(), t.split('').map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join('')];
    const results = [];
    for (const s of spellings) {
      await p.gotoStart();
      const res = await quickSearch(p, s);
      expectOk(res, s);
      results.push({ s, total: res.total, ids: sortNum(ids(await quickRows(p, res))) });
    }
    await recordTestValues(testInfo, Object.fromEntries(results.map(r => [`"${r.s}"`, `${r.total} results`])));
    expect(results[0].total, 'accounts found').toBeGreaterThan(0);
    for (const r of results.slice(1)) {
      expect(r.total, `"${r.s}" total = "${results[0].s}" total`).toBe(results[0].total);
      expect(r.ids, `"${r.s}" returns the same accounts`).toEqual(results[0].ids);
    }
  });

  test(tcTitle(c.quickDeleted), tcDetails(c.quickDeleted, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickDeleted, MODULE);
    const deleted = await p.accountRows([P('AccountName', 'contains', DATA.deletedName)], { deleted: true });
    test.skip(!deleted.length, `No deleted account contains "${DATA.deletedName}" - set SEARCH_ACCOUNT_DELETED_NAME`);
    const res = await quickSearch(p, DATA.deletedName);
    expectOk(res);
    const got = ids(await p.allRows(res));
    if (res.openedId) got.push(res.openedId);
    await recordTestValues(testInfo, { search: DATA.deletedName, 'Deleted accounts': deleted.length, Outcome: outcome(res) });
    expect(label(deleted.filter(r => got.includes(aid(r)))), 'no deleted account is returned').toEqual([]);
  });

  test(tcTitle(c.quickNoMatch), tcDetails(c.quickNoMatch, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickNoMatch, MODULE);
    const res = await quickSearch(p, DATA.noMatch);
    await recordTestValues(testInfo, { search: DATA.noMatch, Results: res.total });
    expectOk(res);
    expect(res.total, 'no accounts').toBe(0);
    await expect(p.resultsError).toBeHidden();
    const shown = await p.resultsTotal();
    if (shown !== null) expect(shown, '"Results: 0"').toBe(0);
  });

  test(tcTitle(c.quickXss), tcDetails(c.quickXss, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickXss, MODULE);
    const payload = '<script>alert(1)</script>';
    const dialogs = [];
    page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
    const res = await quickSearch(p, payload);
    await recordTestValues(testInfo, { search: payload, Results: res.total });
    expectOk(res);
    await page.waitForTimeout(1_000);
    expect(dialogs, 'script in the search text was not executed').toEqual([]);
    expect(await page.locator('main').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
    expect(res.total, 'no account matches the script text').toBe(0);
  });

  test(tcTitle(c.quickSql), tcDetails(c.quickSql, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickSql, MODULE);
    const payload = "' OR 1=1 --";
    const res = await quickSearch(p, payload);
    await recordTestValues(testInfo, { search: payload, Results: res.total });
    expectOk(res);
    expect(await page.locator('main').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
    expect(res.total, 'injection text returns no accounts').toBe(0);
  });

  test(tcTitle(c.quickEmpty), tcDetails(c.quickEmpty, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickEmpty, MODULE);
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await p.chooseQuickSearchScope('Account');
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

  // ================= 6.3 Relevance ordering =================

  test(tcTitle(c.orderAccountNumber), tcDetails(c.orderAccountNumber, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderAccountNumber, MODULE);
    const res = await quickSearch(p, DATA.accountNumber);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.accountNumber, Outcome: outcome(res) });
    if (res.openedId) {
      observe(testInfo, 'Only one account matched, so the app opened the record directly (first by definition)');
      expect((await quickRows(p, res)).map(nameOf), 'the opened record is the account with that number').toContain(DATA.accountNumberName);
      return;
    }
    expect(nameOf(res.rows[0]), 'exact Account Number match is first').toBe(DATA.accountNumberName);
  });

  test(tcTitle(c.orderAccountName), tcDetails(c.orderAccountName, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderAccountName, MODULE);
    const res = await quickSearch(p, DATA.accountName);
    expectOk(res);
    const rows = res.openedId ? [] : await p.allRows(res);
    await recordTestValues(testInfo, { search: DATA.accountName, 'Order returned': rows.slice(0, 15).map(r => `${tier(r, DATA.accountName)}:${nameOf(r)}`) });
    test.skip(!!res.openedId, `Only one account matches "${DATA.accountName}" - set SEARCH_ACCOUNT_NAME to a name others contain`);
    const exactAt = rows.findIndex(r => low(nameOf(r)) === low(DATA.accountName));
    expect(exactAt, 'the exact Account Name match is returned').toBeGreaterThanOrEqual(0);
    expect(label(rows.slice(0, exactAt).filter(r => tier(r, DATA.accountName) > 2)), 'no Contains match is ranked above the exact Account Name match').toEqual([]);
  });

  test(tcTitle(c.orderOwnerExact), tcDetails(c.orderOwnerExact, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderOwnerExact, MODULE);
    const t = DATA.ownerExact;
    const res = await quickSearch(p, t);
    expectOk(res);
    const rows = res.openedId ? [] : await p.allRows(res);
    const order = rows.map(r => (tier(r, t) <= 3 ? 'E' : tier(r, t) === 5 ? 'N' : 'O')).join('');
    await recordTestValues(testInfo, { search: t, 'Order (E = owner exact, N = name contains, O = other)': order, Rows: rows.map(r => `${nameOf(r)} (${ownerOf(r)})`) });
    test.skip(!/E/.test(order) || !/N/.test(order), `"${t}" must match an owner exactly and another Account Name partly - set SEARCH_ACCOUNT_OWNER_EXACT`);
    expect(order, 'every owner exact match precedes every Account Name contains match').toMatch(/^E*[^E]*$/);
  });

  test(tcTitle(c.orderTiers), tcDetails(c.orderTiers, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderTiers, MODULE);
    const seen = {};
    for (const text of [DATA.accountName, DATA.ownerExact, DATA.ownerCompany]) {
      await p.gotoStart();
      const res = await quickSearch(p, text);
      expectOk(res, text);
      if (res.openedId) { seen[text] = 'single match (opened)'; continue; }
      const rows = await p.allRows(res);
      const tiers = rows.map(r => tier(r, text));
      seen[text] = rows.slice(0, 15).map((r, i) => `${tiers[i]}:${nameOf(r)}`);
      const breaks = [];
      for (let i = 1; i < tiers.length; i++) if (tiers[i] < tiers[i - 1]) breaks.push(`${nameOf(rows[i])} (tier ${tiers[i]}) after ${nameOf(rows[i - 1])} (tier ${tiers[i - 1]})`);
      expect.soft(breaks, `"${text}": rows follow the relevance tiers`).toEqual([]);
    }
    await recordTestValues(testInfo, seen);
  });

  test(tcTitle(c.orderAlpha), tcDetails(c.orderAlpha, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderAlpha, MODULE);
    const t = DATA.ownerCompany;
    const res = await quickSearch(p, t);
    expectOk(res);
    const rows = res.openedId ? [] : await p.allRows(res);
    await recordTestValues(testInfo, { search: t, Rows: rows.map(r => `${tier(r, t)}:${nameOf(r)}`) });
    expect(rows.length, 'at least two rows to compare').toBeGreaterThan(1);
    const breaks = [];
    for (let i = 1; i < rows.length; i++) {
      if (tier(rows[i], t) !== tier(rows[i - 1], t)) continue;
      if (nameOf(rows[i - 1]).localeCompare(nameOf(rows[i]), undefined, { sensitivity: 'base' }) > 0) breaks.push(`${nameOf(rows[i - 1])} before ${nameOf(rows[i])}`);
    }
    expect(breaks, 'rows of the same tier are alphabetical by Account Name').toEqual([]);
  });

  // ================= 5. Advanced Search =================

  test(tcTitle(c.advOpen), tcDetails(c.advOpen, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.advOpen, MODULE);
    await p.openAdvancedFromQuickSearch();
    await expect(page).toHaveURL(/\/Search\?entityId=1\b/);
    await p.expandAllSections();
    const labels = (await p.visibleFilterLabels()).map(low);
    await recordTestValues(testInfo, { Sections: await p.sectionNames(), 'Criteria shown': labels });
    for (const l of FILTER_LABELS) expect.soft(labels, `"${l}" criterion`).toContain(low(l));
    await expect(p.applyButton).toBeVisible();
    await expect(p.resetButton).toBeVisible();
    await shot(page, testInfo, 'advanced-filters');
  });

  test(tcTitle(c.advExcluded), tcDetails(c.advExcluded, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.advExcluded, MODULE);
    await p.gotoAdvanced();
    const labels = await p.visibleFilterLabels();
    await recordTestValues(testInfo, { 'Criteria shown': labels });
    for (const re of EXCLUDED_LABELS) expect.soft(labels.filter(l => re.test(l)), `no criterion matching ${re}`).toEqual([]);
    expect(labels.filter(l => /owner/i.test(l)), 'exactly one Account Owner criterion').toHaveLength(1);
  });

  test(tcTitle(c.advOperators), tcDetails(c.advOperators, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.advOperators, MODULE);
    await p.gotoAdvanced();
    const seen = {};
    for (const [fieldId, rule] of Object.entries(OPERATORS)) {
      const ops = (await p.operatorOptions(fieldId)).map(o => o.value);
      const def = await p.operatorText(fieldId);
      seen[fieldId] = `${def} [${ops.join(', ')}]`;
      expect.soft(def, `${fieldId}: default operator`).toMatch(rule.def);
      for (const op of rule.must) expect.soft(ops, `${fieldId}: offers "${op}"`).toContain(op);
    }
    await recordTestValues(testInfo, seen);
  });

  test(tcTitle(c.accountNameContains), tcDetails(c.accountNameContains, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNameContains, MODULE);
    const v = DATA.accountNamePart;
    const res = await advancedSearch(p, { text: { AccountName: v } });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Account Name': v, Results: res.total, Returned: rows.slice(0, 10).map(nameOf) });
    expect(criterion(res, 'AccountName'), 'Account Name contains <text>').toEqual(expect.objectContaining({ operatorKey: 'contains', values: v }));
    expect(res.total, 'accounts found').toBeGreaterThan(0);
    expect(label(rows.filter(r => !low(nameOf(r)).includes(low(v)))), `every Account Name contains "${v}"`).toEqual([]);
  });

  test(tcTitle(c.accountNameEquals), tcDetails(c.accountNameEquals, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNameEquals, MODULE);
    const res = await advancedSearch(p, { text: { AccountName: [DATA.accountName, 'equals'] } });
    await recordTestValues(testInfo, { 'Account Name is': DATA.accountName, Results: res.total, Returned: res.rows.map(nameOf) });
    expect(criterion(res, 'AccountName'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals', values: DATA.accountName }));
    expect(res.rows.map(nameOf), `only "${DATA.accountName}"`).toEqual([DATA.accountName]);
  });

  test(tcTitle(c.nameCase), tcDetails(c.nameCase, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.nameCase, MODULE);
    const v = DATA.accountNamePart;
    const lower = await advancedSearch(p, { text: { AccountName: v.toLowerCase() } }, 'lower case');
    const upper = await advancedSearch(p, { text: { AccountName: v.toUpperCase() } }, 'upper case');
    await recordTestValues(testInfo, { [v.toLowerCase()]: lower.total, [v.toUpperCase()]: upper.total });
    expect(lower.total, 'accounts found').toBeGreaterThan(0);
    expect(upper.total, 'same total').toBe(lower.total);
    expect(sortNum(ids(upper.rows)), 'same accounts').toEqual(sortNum(ids(lower.rows)));
  });

  test(tcTitle(c.accountNumberEquals), tcDetails(c.accountNumberEquals, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNumberEquals, MODULE);
    const res = await advancedSearch(p, { text: { AccountNumber: DATA.accountNumber } });
    await recordTestValues(testInfo, { 'Account Number': DATA.accountNumber, Results: res.total, Returned: res.rows.map(nameOf) });
    expect(criterion(res, 'AccountNumber'), 'Equals is the default').toEqual(expect.objectContaining({ operatorKey: 'equals', values: DATA.accountNumber }));
    expect(res.rows.map(nameOf), 'only the account with that number').toEqual([DATA.accountNumberName]);
  });

  test(tcTitle(c.accountNumberPartial), tcDetails(c.accountNumberPartial, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNumberPartial, MODULE);
    const res = await advancedSearch(p, { text: { AccountNumber: DATA.accountNumberPart } });
    await recordTestValues(testInfo, { 'Account Number': DATA.accountNumberPart, Results: res.total, Returned: res.rows.map(nameOf) });
    expect(res.rows.map(nameOf), 'part of the number does not match with Equals').not.toContain(DATA.accountNumberName);
  });

  test(tcTitle(c.accountNumberContains), tcDetails(c.accountNumberContains, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNumberContains, MODULE);
    const v = DATA.accountNumberPart;
    const res = await advancedSearch(p, { text: { AccountNumber: [v, 'contains'] } });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Account Number contains': v, Results: res.total, Returned: rows.map(r => `${r['Account Number']} ${nameOf(r)}`) });
    expect(criterion(res, 'AccountNumber'), 'Contains sent').toEqual(expect.objectContaining({ operatorKey: 'contains', values: v }));
    expect(rows.map(nameOf), `"${DATA.accountNumberName}" (${DATA.accountNumber}) included`).toContain(DATA.accountNumberName);
    expect(label(rows.filter(r => !String(r['Account Number']).includes(v))), `every Account Number contains "${v}"`).toEqual([]);
  });

  test(tcTitle(c.statusEquals), tcDetails(c.statusEquals, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.statusEquals, MODULE);
    await p.gotoAdvanced();
    const id = await optionValue(p, 'AccountStatusIDF', DATA.status);
    const expected = await p.countAccounts([P('AccountStatusIDF', 'equals', id)]);
    const res = await advancedSearch(p, { status: DATA.status });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Account Status': `${DATA.status} (${id})`, Results: res.total, Expected: expected });
    expect(criterion(res, 'AccountStatusIDF'), 'Equals sent with the status id').toEqual(expect.objectContaining({ operatorKey: 'equals', values: id }));
    expect(res.total, 'accounts with the status').toBeGreaterThan(0);
    expect(label(rows.filter(r => low(r['Account Status']) !== low(DATA.status))), `every row is "${DATA.status}"`).toEqual([]);
    expect(res.total, 'every account with the status').toBe(expected);
  });

  test(tcTitle(c.statusIn), tcDetails(c.statusIn, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.statusIn, MODULE);
    const one = await advancedSearch(p, { status: DATA.status }, DATA.status);
    const two = await advancedSearch(p, { status: DATA.status2 }, DATA.status2);
    const both = await advancedSearch(p, { statuses: [DATA.status, DATA.status2] }, 'Both statuses');
    await recordTestValues(testInfo, { [DATA.status]: one.total, [DATA.status2]: two.total, 'Any of both': both.total });
    const sent = criterion(both, 'AccountStatusIDF');
    expect(sent, '"is any of" sent').toEqual(expect.objectContaining({ operatorKey: 'in' }));
    expect(asList(sent.values), 'both statuses sent').toHaveLength(2);
    const [oneIds, twoIds, bothIds] = [ids(await p.allRows(one)), ids(await p.allRows(two)), ids(await p.allRows(both))];
    expect([...oneIds, ...twoIds].filter(i => !bothIds.includes(i)), 'every single-status account is included').toEqual([]);
    expect(bothIds.filter(i => !oneIds.includes(i) && !twoIds.includes(i)), 'nothing outside the two statuses').toEqual([]);
  });

  test(tcTitle(c.statusOptions), tcDetails(c.statusOptions, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.statusOptions, MODULE);
    await p.gotoAdvanced();
    const opts = await page.locator('#AccountStatusIDF_one option').evaluateAll(o => o.map(x => ({ v: x.value, t: x.textContent.trim() })));
    const real = opts.filter(o => o.v);
    await recordTestValues(testInfo, { Options: real.map(o => o.t) });
    expect(real.length, 'statuses offered').toBeGreaterThan(0);
    expect(real.map(o => o.t), `"${DATA.status}" offered`).toContain(DATA.status);
    expect(real.filter(o => !o.t).map(o => o.v), 'no empty option').toEqual([]);
    expect(real.map(o => o.t).filter((t, i, a) => a.indexOf(t) !== i), 'no duplicate option').toEqual([]);
    expect(real.filter(o => /^(true|false|yes|no|0|1)$/i.test(o.t)).map(o => o.t), 'no behaviour-flag values').toEqual([]);
  });

  test(tcTitle(c.ownerCompanyContains), tcDetails(c.ownerCompanyContains, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.ownerCompanyContains, MODULE);
    const v = DATA.ownerCompany.split(' ')[0];
    const res = await advancedSearch(p, { text: { AccountOwner: v } });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Account Owner': v, Results: res.total, Returned: label(rows.slice(0, 10)) });
    expect(criterion(res, 'AccountOwner'), 'Contains is the default').toEqual(expect.objectContaining({ operatorKey: 'contains', values: v }));
    expect(rows.map(ownerOf), `accounts of "${DATA.ownerCompany}"`).toContain(DATA.ownerCompany);
    expect(label(rows.filter(r => !low(ownerOf(r)).includes(low(v)))), `every Account Owner contains "${v}"`).toEqual([]);
  });

  test(tcTitle(c.ownerCompanyEquals), tcDetails(c.ownerCompanyEquals, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.ownerCompanyEquals, MODULE);
    const res = await advancedSearch(p, { text: { AccountOwner: [DATA.ownerCompany, 'equals'] } });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Account Owner is': DATA.ownerCompany, Results: res.total });
    expect(criterion(res, 'AccountOwner'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals' }));
    expect(res.total, 'accounts of the owner').toBeGreaterThan(0);
    expect(label(rows.filter(r => low(ownerOf(r)) !== low(DATA.ownerCompany))), `every owner is "${DATA.ownerCompany}"`).toEqual([]);
  });

  test(tcTitle(c.ownerLegal), tcDetails(c.ownerLegal, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.ownerLegal, MODULE);
    const res = await advancedSearch(p, { text: { AccountOwner: DATA.ownerLegal } });
    await recordTestValues(testInfo, { 'Account Owner': DATA.ownerLegal, Results: res.total, Returned: label(res.rows) });
    expect(res.rows.map(nameOf), `"${DATA.ownerLegalAccount}" found by its owner's Legal Name`).toContain(DATA.ownerLegalAccount);
  });

  test(tcTitle(c.ownerTrade), tcDetails(c.ownerTrade, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    test.skip(!DATA.ownerTrade || !DATA.ownerTradeAccount, 'Set SEARCH_ACCOUNT_OWNER_TRADE / _TRADE_ACCOUNT (no owner in the sandbox has a Trade Name different from its Display Name)');
    await applyAllureLabels(c.ownerTrade, MODULE);
    const res = await advancedSearch(p, { text: { AccountOwner: DATA.ownerTrade } });
    await recordTestValues(testInfo, { 'Account Owner': DATA.ownerTrade, Results: res.total, Returned: label(res.rows) });
    expect(res.rows.map(nameOf), `"${DATA.ownerTradeAccount}" found by its owner's Trade Name`).toContain(DATA.ownerTradeAccount);
  });

  test(tcTitle(c.ownerPerson), tcDetails(c.ownerPerson, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.ownerPerson, MODULE);
    const owned = await p.accountRows([P('AccountOwner', 'equals', DATA.ownerPerson)]);
    test.skip(!owned.length, `No account owned by Person "${DATA.ownerPerson}" - set SEARCH_ACCOUNT_OWNER_PERSON`);
    const seen = {};
    for (const [v, op] of [[DATA.ownerPersonFirst], [DATA.ownerPersonLast], [DATA.ownerPerson, 'equals']]) {
      const res = await advancedSearch(p, { text: { AccountOwner: op ? [v, op] : v } }, `Owner ${op || 'contains'} "${v}"`);
      const got = ids(await p.allRows(res));
      seen[`${op || 'contains'} "${v}"`] = res.total;
      expect.soft(label(owned.filter(r => !got.includes(aid(r)))), `"${v}": every account of ${DATA.ownerPerson} is returned`).toEqual([]);
    }
    await recordTestValues(testInfo, { ...seen, [`Accounts of ${DATA.ownerPerson}`]: owned.length });
  });

  test(tcTitle(c.ownerSingle), tcDetails(c.ownerSingle, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.ownerSingle, MODULE);
    await p.gotoAdvanced();
    const ownerFields = await page.locator('#filtersDrawer [data-field-id]').evaluateAll(els => els.map(e => e.getAttribute('data-field-id')).filter(id => /owner/i.test(id)));
    const company = await advancedSearch(p, { text: { AccountOwner: DATA.ownerCompany } }, 'Company owner');
    const person = await advancedSearch(p, { text: { AccountOwner: DATA.ownerPerson } }, 'Person owner');
    await recordTestValues(testInfo, { 'Owner criteria': ownerFields, [DATA.ownerCompany]: company.total, [DATA.ownerPerson]: person.total });
    expect(ownerFields, 'one Account Owner criterion').toEqual(['AccountOwner']);
    expect(company.total, 'Company-owned accounts found').toBeGreaterThan(0);
    expect(person.total, 'Person-owned accounts found').toBeGreaterThan(0);
  });

  test(tcTitle(c.billingAddress), tcDetails(c.billingAddress, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.billingAddress, MODULE);
    const res = await advancedSearch(p, { text: { BillingAddress: DATA.address } });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Billing Address': DATA.address, Results: res.total });
    expect(criterion(res, 'BillingAddress'), 'Contains is the default').toEqual(expect.objectContaining({ operatorKey: 'contains', values: DATA.address }));
    expect(res.total, 'accounts found').toBeGreaterThan(0);
    expect(label(rows.filter(r => !low(r['Billing Address']).includes(low(DATA.address)))), 'every Billing Address contains the text').toEqual([]);
  });

  test(tcTitle(c.billingOwn), tcDetails(c.billingOwn, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.billingOwn, MODULE);
    const accounts = await p.accountRows([P('AccountName', 'contains', DATA.ownBillingName)]);
    test.skip(!accounts.length, `No "${DATA.ownBillingName}" account - run account-update.spec or set SEARCH_ACCOUNT_OWN_BILLING_NAME`);
    const own = await advancedSearch(p, { text: { BillingAddress: DATA.ownBillingAddr } }, 'Own billing address');
    const ownIds = ids(await p.allRows(own));
    await recordTestValues(testInfo, { Accounts: accounts.map(nameOf), [DATA.ownBillingAddr]: own.total });
    expect(label(accounts.filter(r => !ownIds.includes(aid(r)))), 'found by its own billing address').toEqual([]);
  });

  test(tcTitle(c.billingInherit), tcDetails(c.billingInherit, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.billingInherit, MODULE);
    const accounts = await p.accountRows([P('AccountName', 'contains', DATA.inheritName)]);
    test.skip(!accounts.length, `No "${DATA.inheritName}" account - run account-update.spec or set SEARCH_ACCOUNT_INHERIT_NAME`);
    const res = await advancedSearch(p, { text: { BillingAddress: DATA.inheritAddr } });
    const got = ids(await p.allRows(res));
    await recordTestValues(testInfo, { Accounts: accounts.map(nameOf), [DATA.inheritAddr]: res.total });
    expect(label(accounts.filter(r => !got.includes(aid(r)))), 'found by the owner billing address').toEqual([]);
  });

  test(tcTitle(c.billingCity), tcDetails(c.billingCity, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.billingCity, MODULE);
    const v = DATA.city.toLowerCase();
    const res = await advancedSearch(p, { text: { BillingCity: v } });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Billing City': v, Results: res.total });
    expect(criterion(res, 'BillingCity'), 'Contains is the default').toEqual(expect.objectContaining({ operatorKey: 'contains', values: v }));
    expect(res.total, 'accounts found').toBeGreaterThan(0);
    expect(label(rows.filter(r => !low(r['Billing City']).includes(v))), 'every Billing City contains the text').toEqual([]);
  });

  test(tcTitle(c.billingRegion), tcDetails(c.billingRegion, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.billingRegion, MODULE);
    const text = await advancedSearch(p, { text: { BillingRegion: DATA.region } }, 'Region text');
    const linked = await advancedSearch(p, { text: { BillingRegion: DATA.regionLinked } }, 'Region record');
    await recordTestValues(testInfo, { [`Region "${DATA.region}"`]: text.total, [`Region "${DATA.regionLinked}"`]: linked.total });
    expect(criterion(text, 'BillingRegion'), 'Contains is the default').toEqual(expect.objectContaining({ operatorKey: 'contains', values: DATA.region }));
    expect(text.total, `"${DATA.region}" finds accounts`).toBeGreaterThan(0);
    expect(linked.total, `"${DATA.regionLinked}" finds accounts`).toBeGreaterThan(0);
  });

  test(tcTitle(c.billingPostal), tcDetails(c.billingPostal, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.billingPostal, MODULE);
    const prefix = await advancedSearch(p, { text: { BillingPostalCode: DATA.postalPrefix } }, 'Prefix');
    const middle = DATA.postalPrefix.slice(1);
    const inner = await advancedSearch(p, { text: { BillingPostalCode: middle } }, 'Digits from inside the code');
    const rows = await p.allRows(prefix);
    await recordTestValues(testInfo, { [`starts with ${DATA.postalPrefix}`]: prefix.total, [`starts with ${middle}`]: inner.total });
    expect(criterion(prefix, 'BillingPostalCode'), 'BeginsWith is the default').toEqual(expect.objectContaining({ operatorKey: 'startsWith' }));
    expect(prefix.total, 'the prefix finds accounts').toBeGreaterThan(0);
    const leaked = ids(await p.allRows(inner)).filter(i => ids(rows).includes(i));
    expect(leaked, `"${middle}" (inside "${DATA.postalPrefix}...") must not match those codes`).toEqual([]);
  });

  test(tcTitle(c.billingCountry), tcDetails(c.billingCountry, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.billingCountry, MODULE);
    const one = await advancedSearch(p, { country: DATA.country }, 'Equals');
    const many = await advancedSearch(p, { countries: [DATA.country, DATA.country2] }, 'In');
    await recordTestValues(testInfo, { [`is ${DATA.country}`]: one.total, [`is any of ${DATA.country}, ${DATA.country2}`]: many.total });
    expect(criterion(one, 'BillingCountryIDF'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals' }));
    expect(criterion(many, 'BillingCountryIDF'), '"is any of" sent').toEqual(expect.objectContaining({ operatorKey: 'in' }));
    expect(one.total, 'accounts in the country').toBeGreaterThan(0);
    const manyIds = ids(await p.allRows(many));
    expect(ids(await p.allRows(one)).filter(i => !manyIds.includes(i)), 'In includes every Equals account').toEqual([]);
  });

  test(tcTitle(c.billingAllAddresses), tcDetails(c.billingAllAddresses, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.billingAllAddresses, MODULE);
    const accounts = await p.accountRows([P('AccountName', 'contains', DATA.ownBillingName)]);
    test.skip(!accounts.length, `No "${DATA.ownBillingName}" account - run account-update.spec or set SEARCH_ACCOUNT_OWN_BILLING_NAME`);
    const res = await advancedSearch(p, { text: { BillingAddress: DATA.ownerBillingAddr } });
    const got = ids(await p.allRows(res));
    await recordTestValues(testInfo, { [DATA.ownerBillingAddr]: res.total, Returned: label(res.rows) });
    expect(label(accounts.filter(r => got.includes(aid(r)))), 'not found by an address that is not its effective billing address').toEqual([]);
  });

  test(tcTitle(c.phoneContains), tcDetails(c.phoneContains, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneContains, MODULE);
    const res = await advancedSearch(p, { text: { PhoneNumber: DATA.phoneDashed } });
    await recordTestValues(testInfo, { 'Phone Number': DATA.phoneDashed, 'Value sent': criterion(res, 'PhoneNumber')?.values, Results: res.total, Returned: label(res.rows.slice(0, 5)) });
    expect(criterion(res, 'PhoneNumber'), 'Contains is the default').toEqual(expect.objectContaining({ operatorKey: 'contains' }));
    expect(res.rows.filter(r => ownerOf(r) === DATA.phoneOwner).length, `accounts of "${DATA.phoneOwner}" found by "${DATA.phoneDashed}"`).toBeGreaterThan(0);
  });

  test(tcTitle(c.phoneEquals), tcDetails(c.phoneEquals, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneEquals, MODULE);
    const res = await advancedSearch(p, { text: { PhoneNumber: [DATA.phoneFormatted, 'equals'] } });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Phone Number (equals)': DATA.phoneFormatted, 'Value sent': criterion(res, 'PhoneNumber')?.values, Results: res.total });
    expect(criterion(res, 'PhoneNumber'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals' }));
    expect(res.total, `accounts of "${DATA.phoneOwner}" found`).toBeGreaterThan(0);
    expect(label(rows.filter(r => ownerOf(r) !== DATA.phoneOwner)), `only accounts of "${DATA.phoneOwner}"`).toEqual([]);
  });

  test(tcTitle(c.phoneEqualsPartial), tcDetails(c.phoneEqualsPartial, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneEqualsPartial, MODULE);
    const v = DATA.phoneLocal.slice(3);
    const res = await advancedSearch(p, { text: { PhoneNumber: [v, 'equals'] } });
    await recordTestValues(testInfo, { 'Phone Number (equals)': v, Results: res.total });
    expect(res.rows.filter(r => ownerOf(r) === DATA.phoneOwner).length, 'Equals does not match part of the number').toBe(0);
  });

  test(tcTitle(c.phoneLetters), tcDetails(c.phoneLetters, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneLetters, MODULE);
    await p.gotoAdvanced();
    await p.setText('PhoneNumber', 'abcdef');
    const res = await p.applyExpectingNoSearch();
    await recordTestValues(testInfo, { 'Phone Number': 'abcdef', 'Search ran': !!res, Results: res ? res.total : '-' });
    if (res) {
      expect(res.status, 'HTTP status').toBe(200);
      expect(res.total, 'letters in the phone criterion return no accounts').toBe(0);
    }
  });

  test(tcTitle(c.includeDeletedDefault), tcDetails(c.includeDeletedDefault, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.includeDeletedDefault, MODULE);
    const deleted = await p.accountRows([P('AccountName', 'contains', DATA.deletedName)], { deleted: true });
    await p.gotoAdvanced();
    await expect(p.includeDeletedCheckbox, 'toggle is OFF').not.toBeChecked();
    await p.setText('AccountName', DATA.deletedName);
    const res = await p.apply();
    expectOk(res);
    const got = ids(await p.allRows(res));
    await recordTestValues(testInfo, { 'Include Deleted': 'OFF (default)', 'Account Name': DATA.deletedName, Results: res.total, 'Deleted accounts': deleted.length });
    const sent = criterion(res, 'IsArchived');
    expect(!sent || sent.values === false || sent.values === 'false', 'deleted accounts are excluded (IsArchived = false)').toBe(true);
    expect(label(deleted.filter(r => got.includes(aid(r)))), 'no deleted account is returned').toEqual([]);
  });

  test(tcTitle(c.includeDeletedOn), tcDetails(c.includeDeletedOn, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.includeDeletedOn, MODULE);
    const v = env.keyword;
    const deleted = await p.accountRows([P('AccountName', 'contains', v)], { deleted: true });
    test.skip(!deleted.length, `No deleted account contains "${v}"`);
    const off = await advancedSearch(p, { text: { AccountName: v } }, 'Include Deleted OFF');
    const on = await advancedSearch(p, { text: { AccountName: v }, includeDeleted: true }, 'Include Deleted ON');
    const [offIds, onIds] = [ids(await p.allRows(off)), ids(await p.allRows(on))];
    await recordTestValues(testInfo, { 'Account Name': v, OFF: off.total, ON: on.total, 'Deleted accounts': deleted.length, 'Sent when ON': JSON.stringify(criterion(on, 'IsArchived') || null) });
    expect(off.total, 'active accounts found').toBeGreaterThan(0);
    expect(on.total, 'ON returns active + deleted accounts').toBe(off.total + deleted.length);
    expect(offIds.filter(i => !onIds.includes(i)), 'active accounts are still returned with ON').toEqual([]);
    expect(label(deleted.filter(r => !onIds.includes(aid(r)))), 'deleted accounts are returned with ON').toEqual([]);
  });

  test(tcTitle(c.combined), tcDetails(c.combined, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.combined, MODULE);
    const owner = await advancedSearch(p, { text: { AccountOwner: DATA.phoneOwner } }, 'Account Owner');
    const status = await advancedSearch(p, { status: DATA.status }, 'Account Status');
    const both = await advancedSearch(p, { text: { AccountOwner: DATA.phoneOwner }, status: DATA.status }, 'Owner + Status');
    const [ownerIds, statusIds, bothIds] = [ids(await p.allRows(owner)), ids(await p.allRows(status)), ids(await p.allRows(both))];
    const expected = sortNum(ownerIds.filter(i => statusIds.includes(i)));
    await recordTestValues(testInfo, { 'Account Owner': owner.total, 'Account Status': status.total, 'Owner + Status': both.total });
    for (const f of ['AccountOwner', 'AccountStatusIDF']) expect(criterion(both, f), `${f} sent`).toBeDefined();
    expect(expected.length, 'the intersection is not empty').toBeGreaterThan(0);
    expect(sortNum(bothIds), 'intersection of the two searches').toEqual(expected);
  });

  test(tcTitle(c.reset), tcDetails(c.reset, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.reset, MODULE);
    await p.gotoAdvanced();
    const text = { AccountName: DATA.accountName, AccountNumber: DATA.accountNumber, AccountOwner: DATA.ownerCompany, BillingCity: DATA.city, PhoneNumber: DATA.phoneLocal };
    for (const [f, v] of Object.entries(text)) await p.setText(f, v);
    await p.setDropdown('AccountStatusIDF', DATA.status);
    await p.setIncludeDeleted(true);
    await recordTestValues(testInfo, { ...text, 'Account Status': DATA.status, 'Include Deleted': 'ON' });
    await p.resetFilters();
    await p.expandAllSections();
    for (const f of Object.keys(text)) await expect(page.locator(`#${f}_one`), `${f} cleared`).toHaveValue('');
    expect(await p.dropdownText('AccountStatusIDF'), 'Account Status back to default').toMatch(/select|all/i);
    await expect(p.includeDeletedCheckbox, 'Include Deleted back to OFF').not.toBeChecked();
  });

  test(tcTitle(c.advEmpty), tcDetails(c.advEmpty, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
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

  test(tcTitle(c.paging), tcDetails(c.paging, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.paging, MODULE);
    const page1 = await advancedSearch(p, { text: { AccountName: DATA.pagingText } }, 'Page 1');
    expect(page1.total, 'more than one page').toBeGreaterThan(page1.rows.length);
    const page2 = await test.step('Next page', () => p.goToNextPage());
    expectOk(page2, 'page 2');
    await recordTestValues(testInfo, { Total: page1.total, 'Page 1 rows': page1.rows.length, 'Page 2 rows': page2.rows.length, 'Page 2 start': page2.body.start });
    expect(page2.body.start, 'page 2 starts after page 1').toBe(page1.rows.length);
    expect(page2.total, 'total unchanged between pages').toBe(page1.total);
    expect(ids(page2.rows).filter(i => ids(page1.rows).includes(i)), 'no account on both pages').toEqual([]);
  });

  // ================= 7. Presets / results / 8. permissions =================

  test(tcTitle(c.noPresets), tcDetails(c.noPresets, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.noPresets, MODULE);
    await p.gotoAdvanced();
    const presets = await p.presetControls.filter({ visible: true }).allInnerTexts();
    await shot(page, testInfo, 'no-presets');
    await recordTestValues(testInfo, { 'Preset controls': presets.length ? presets : '(none)' });
    expect(presets, 'no preset search offered').toEqual([]);
  });

  test(tcTitle(c.resultsView), tcDetails(c.resultsView, MODULE), async ({ accountSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.resultsView, MODULE);
    const res = await advancedSearch(p, { text: { AccountOwner: DATA.ownerCompany } });
    expect(res.total, 'accounts found').toBeGreaterThan(0);
    expect(await p.resultsTotal(), '"Results:" equals the total returned').toBe(res.total);
    const mainText = await page.locator('main').innerText();
    for (const r of res.rows.slice(0, 5)) expect(mainText, `"${nameOf(r)}" shown`).toContain(nameOf(r));
    await shot(page, testInfo, 'account-results');
    const landing = await test.step('Open the first result', () => p.openFirstResult());
    const url = landing.url();
    await recordTestValues(testInfo, { 'Account Owner': DATA.ownerCompany, Results: res.total, Opened: `${nameOf(res.rows[0])} -> ${url}` });
    expect(url, 'opens the Account record').toMatch(new RegExp(`/Account/Edit/${aid(res.rows[0])}(?:[/?#]|$)`, 'i'));
    if (landing !== p.page) await landing.close();
  });

  test(tcTitle(c.permission), tcDetails(c.permission, MODULE), async ({ accountSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.permission, MODULE);
    const res = await advancedSearch(p, { text: { AccountOwner: DATA.phoneOwner } });
    const rows = await p.allRows(res);
    await recordTestValues(testInfo, { 'Account Owner': DATA.phoneOwner, 'Rows checked': rows.length, Total: res.total });
    expect(rows.filter(r => r.IsAllowed === false).map(aid), 'no account the user may not view').toEqual([]);
    expect(rows.length, 'result count matches the rows returned').toBe(res.total);
  });
});
