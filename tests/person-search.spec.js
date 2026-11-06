const { test, expect } = require('../fixtures/fixtures');
const { MODULE, DATA, FILTER_LABELS, OPERATORS, HAS_USER, MESSAGES, cases: c } = require('../testData/personSearchData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues } = require('../utils/testCase');

/**
 * 62237 Person Search - Criteria Specification (docs/62237 Search People JSON.md).
 * Quick Search = top-bar search with Record Type "Person"; Advanced Search = /Search?entityId=9 + Advanced Filters drawer.
 * Read-only: nothing is created. Every search returns the JSON of POST /Search/ResultsData, so the rules are checked
 * on the criteria sent and the rows the server returned (first page); the result cards are checked on screen.
 * Sandbox values used (names, email, phone, account, roles, ...) are in testData/personSearchData.js and can be
 * overridden in .env.
 *
 * Not automated: the SQL join paths of section 5 (covered indirectly - each joined criterion must return the
 * people linked through it), Region as a dropdown (2.4 - depends on tenant configuration), deleted persons
 * (1.4 / 2.10 - the sandbox has none; 013 and 049 run once SEARCH_PERSON_DELETED_NAME is set), Labor Grade and
 * Tags data (2.9 / 2.11 - none assigned in the sandbox; the controls are still checked).
 */

const pid = r => Number(r['Record ID'] ?? r._primaryKeyValue);
const ids = rows => rows.map(pid);
const nameOf = r => `${r['Full Name'] || ''} ${r['Display Name'] || ''}`.toLowerCase();
const emailOf = r => String(r.Email || '').toLowerCase();
const words = r => String(r['Full Name'] || r['Display Name'] || '').trim().split(/\s+/);
const lastFirst = r => { const w = words(r); return [w[w.length - 1] || '', w[0] || ''].map(s => s.toLowerCase()); };
const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const criterion = (res, fieldId) => res.criteria.find(x => String(x.fieldId).toLowerCase() === fieldId.toLowerCase());
const asList = v => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(String).filter(Boolean);
/** IDs of every row of a search (all pages - `res.rows` is only the grid's first page). */
const allIds = async (p, res) => ids(await p.allRows(res));
const label = (rows, list) => rows.filter(r => list.includes(pid(r))).map(r => `${pid(r)}: ${r['Full Name']}`);

/** The search returned normally (HTTP 200, no error text). */
function expectOk(res, what = 'search') {
  expect(res.status, `${what}: HTTP status`).toBe(200);
  expect(res.error, `${what}: no error returned`).toBeNull();
}

/**
 * Advanced Search with the given criteria; returns the ResultsData result.
 * crit: { text: { FieldId: value | [value, operator] }, staffRole, staffRoles, securityRole, securityRoles,
 *         hasUser: 'yes'|'no', language, laborGrade, tags, includeDeleted }
 */
async function advancedSearch(p, crit = {}, title = 'Advanced Search') {
  return test.step(`${title}: ${JSON.stringify(crit)}`, async () => {
    await p.gotoAdvanced();
    for (const [fieldId, v] of Object.entries(crit.text || {})) {
      const [value, op] = Array.isArray(v) ? v : [v];
      await p.setText(fieldId, value, op);
    }
    if (crit.staffRole) await p.setDropdown('StaffRoleIds', crit.staffRole);
    if (crit.staffRoles) await p.setDropdownMulti('StaffRoleIds', crit.staffRoles);
    if (crit.securityRole) await p.pickOne('SecurityRoleIds', crit.securityRole);
    if (crit.securityRoles) await p.pickMany('SecurityRoleIds', crit.securityRoles);
    if (crit.hasUser) await p.setDropdown('HasUserAccount', await hasUserLabel(p, crit.hasUser));
    if (crit.language) await p.setDropdown('LanguageIDF', crit.language);
    if (crit.laborGrade) await p.pickOne('LaborGradeIDF', crit.laborGrade);
    if (crit.tags) await p.pickMany('TagIds', crit.tags);
    if (crit.includeDeleted !== undefined) await p.setIncludeDeleted(crit.includeDeleted);
    const res = await p.apply();
    expectOk(res, title);
    return res;
  });
}

/** Has User Account option text for 'yes' / 'no' (spec wording "Is User" / "Is Not User", app may say Yes / No). */
async function hasUserLabel(p, which) {
  const options = await p.dropdownOptions('HasUserAccount');
  const re = which === 'yes' ? /^(yes|is user)$/i : /^(no|is not user)$/i;
  return options.find(o => re.test(o)) || (which === 'yes' ? HAS_USER.yes : HAS_USER.no);
}

async function quickSearch(p, text) {
  return test.step(`Quick Search "${text}"`, () => p.quickSearch(text));
}

/**
 * Was the person returned? A single match opens the Person record directly (res.openedId), so then the
 * record page itself must show the email / name; otherwise the returned rows are checked.
 */
async function returned(p, res, { email, name }) {
  if (res.openedId) {
    const text = (await p.page.locator('main').innerText()).toLowerCase();
    return text.includes((email || name).toLowerCase());
  }
  return res.rows.some(r => (email ? emailOf(r) === email.toLowerCase() : r['Full Name'] === name));
}

const PROBE_TEXTS = ['a', 'e', 'i', 'o', 'u', 'y', 'r', 'n', 'l', 's', 't', 'm', 'h', 'c', 'd'];

/**
 * A value of `fieldId` that matches people in the sandbox right now: the configured one when it still does, else the
 * first probe text that does (the sandbox is reset regularly, so fixed names disappear). null = no data at all.
 */
async function valueWithData(p, testInfo, fieldId, preferred, operatorKey = 'contains') {
  return test.step(`Find ${fieldId} data in the sandbox`, async () => {
    for (const v of [preferred, ...PROBE_TEXTS].filter(Boolean)) {
      if (await p.countPeople([{ fieldId, operatorKey, values: v }])) {
        if (v !== preferred) observe(testInfo, `"${preferred}" no longer matches anyone in ${fieldId}; used "${v}" instead`);
        return v;
      }
    }
    return null;
  });
}

const outcome = res => (res.openedId ? `opened /Person/Edit/${res.openedId} (single match)` : `${res.total} results: ${res.rows.slice(0, 5).map(r => r['Full Name']).join(', ')}`);

test.describe('Person Search - Criteria Specification (62237)', () => {
  test.beforeEach(async ({ personSearchPage }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    await personSearchPage.gotoStart();
  });

  // ================= 1. Quick Search =================

  test(tcTitle(c.quickScope), tcDetails(c.quickScope, MODULE), async ({ personSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickScope, MODULE);
    expect(await p.quickSearchScopes(), 'Quick Search Record Type offers "Person"').toContain('Person');
    const res = await quickSearch(p, DATA.lastName);
    await recordTestValues(testInfo, { search: DATA.lastName, 'Record Type': 'Person', Results: res.total });
    expectOk(res);
    await expect(page).toHaveURL(/\/Search\/QuickSearch\?.*entityId=9/);
    for (const f of ['firstName', 'middleName', 'lastName', 'displayName']) {
      expect(res.criteria.filter(x => x.fieldId.toLowerCase() === f.toLowerCase() && x.operatorKey === 'contains' && x.values === DATA.lastName),
        `${f} contains <text> is searched`).toHaveLength(1);
    }
    expect(res.total, 'people found').toBeGreaterThan(0);
    await expect(p.cards.first()).toBeVisible();
    expect(await p.resultsTotal(), '"Results:" equals the total returned').toBe(res.total);
    await shot(page, testInfo, 'quick-search-results');
  });

  test(tcTitle(c.quickName), tcDetails(c.quickName, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickName, MODULE);
    const part = DATA.lastName.slice(0, -1);
    const res = await quickSearch(p, part);
    expectOk(res);
    await recordTestValues(testInfo, { search: part, Results: res.total, 'Rows checked': res.rows.length });
    expect(res.total, 'people whose name contains the text').toBeGreaterThan(0);
    const wrong = res.rows.filter(r => !nameOf(r).includes(part.toLowerCase()));
    expect(label(wrong, ids(wrong)), `rows whose name does not contain "${part}"`).toEqual([]);
  });

  test(tcTitle(c.quickCase), tcDetails(c.quickCase, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickCase, MODULE);
    const t = DATA.lastName;
    const spellings = [t.toLowerCase(), t.toUpperCase(), t.split('').map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join('')];
    const results = [];
    for (const s of spellings) {
      await p.gotoStart();
      const res = await quickSearch(p, s);
      expectOk(res, s);
      results.push({ s, total: res.total, ids: ids(res.rows).sort((a, b) => a - b) });
    }
    await recordTestValues(testInfo, Object.fromEntries(results.map(r => [`"${r.s}"`, `${r.total} results`])));
    for (const r of results.slice(1)) {
      expect(r.total, `"${r.s}" total = "${results[0].s}" total`).toBe(results[0].total);
      expect(r.ids, `"${r.s}" returns the same people`).toEqual(results[0].ids);
    }
  });

  test(tcTitle(c.quickEmailExact), tcDetails(c.quickEmailExact, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickEmailExact, MODULE);
    const typed = DATA.email.toUpperCase();
    const res = await quickSearch(p, typed);
    expectOk(res);
    await recordTestValues(testInfo, { search: typed, Outcome: outcome(res) });
    expect(await returned(p, res, { email: DATA.email }), `the owner of ${DATA.email} is returned`).toBe(true);
  });

  test(tcTitle(c.quickEmailPartial), tcDetails(c.quickEmailPartial, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickEmailPartial, MODULE);
    const res = await quickSearch(p, DATA.emailDomain);
    expectOk(res);
    const emailOps = res.criteria.filter(x => /email/i.test(x.fieldId)).map(x => `${x.fieldId} ${x.operatorKey}`);
    await recordTestValues(testInfo, { search: DATA.emailDomain, Results: res.total, 'Email criteria sent': emailOps });
    expect(emailOps.filter(o => !/ equals$/.test(o)), 'DEFECT: Quick Search sends non-exact operators for email fields').toEqual([]);
    expect(res.rows.map(r => `${pid(r)}: ${r['Full Name']} <${r.Email}>`), `DEFECT: part of an email ("${DATA.emailDomain}") returned people`).toEqual([]);
  });

  test(tcTitle(c.quickPhoneFormatted), tcDetails(c.quickPhoneFormatted, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickPhoneFormatted, MODULE);
    const res = await quickSearch(p, DATA.phoneFormatted);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.phoneFormatted, Outcome: outcome(res) });
    expect(await returned(p, res, { name: DATA.phoneOwner }), `DEFECT: "${DATA.phoneFormatted}" is not normalized to ${DATA.phoneDigits}`).toBe(true);
  });

  test(tcTitle(c.quickPhonePartial), tcDetails(c.quickPhonePartial, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickPhonePartial, MODULE);
    const res = await quickSearch(p, DATA.phoneLocal);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.phoneLocal, Outcome: outcome(res) });
    expect(await returned(p, res, { name: DATA.phoneOwner }), 'part of the phone number finds the person').toBe(true);
  });

  test(tcTitle(c.quickTextNotPhone), tcDetails(c.quickTextNotPhone, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickTextNotPhone, MODULE);
    const t = DATA.lastName.toLowerCase();
    const res = await quickSearch(p, DATA.lastName);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.lastName, Results: res.total });
    const unexplained = res.rows.filter(r => !nameOf(r).includes(t) && emailOf(r) !== t);
    observe(testInfo, `Rows not matching by name / exact email: ${unexplained.length}`);
    expect(label(unexplained, ids(unexplained)), 'every row matches by name or exact email (not by an empty phone match)').toEqual([]);
  });

  test(tcTitle(c.quickNoMatch), tcDetails(c.quickNoMatch, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickNoMatch, MODULE);
    const res = await quickSearch(p, DATA.noMatch);
    await recordTestValues(testInfo, { search: DATA.noMatch, Results: res.total });
    expectOk(res);
    expect(res.total, 'no people').toBe(0);
    await expect(p.cards).toHaveCount(0);
    await expect(p.resultsError).toBeHidden();
    const shown = await p.resultsTotal();
    if (shown !== null) expect(shown, '"Results: 0"').toBe(0);
  });

  test(tcTitle(c.quickXss), tcDetails(c.quickXss, MODULE), async ({ personSearchPage: p, page }, testInfo) => {
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
    expect(res.total, 'no person matches the script text').toBe(0);
  });

  test(tcTitle(c.quickSql), tcDetails(c.quickSql, MODULE), async ({ personSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickSql, MODULE);
    const payload = "' OR 1=1 --";
    const res = await quickSearch(p, payload);
    await recordTestValues(testInfo, { search: payload, Results: res.total });
    expectOk(res);
    expect(await page.locator('main').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
    expect(res.total, 'DEFECT: injection text returned people').toBe(0);
  });

  test(tcTitle(c.quickEmpty), tcDetails(c.quickEmpty, MODULE), async ({ personSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickEmpty, MODULE);
    await p.chooseQuickSearchScope('Person');
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

  test(tcTitle(c.quickDeleted), tcDetails(c.quickDeleted, MODULE), async ({ personSearchPage: p }, testInfo) => {
    test.skip(!DATA.deletedName, 'Set SEARCH_PERSON_DELETED_NAME to a deleted person (none in the sandbox)');
    await applyAllureLabels(c.quickDeleted, MODULE);
    const res = await quickSearch(p, DATA.deletedName);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.deletedName, Results: res.total });
    expect(res.rows.filter(r => String(r['Display Name']).toLowerCase() === DATA.deletedName.toLowerCase()).map(pid),
      'DEFECT: a deleted person is returned by Quick Search').toEqual([]);
  });

  // ================= 2. Advanced Search =================

  test(tcTitle(c.advOpen), tcDetails(c.advOpen, MODULE), async ({ personSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.advOpen, MODULE);
    await p.openAdvancedFromQuickSearch();
    await expect(page).toHaveURL(/\/Search\?entityId=9/);
    await p.expandAllSections();
    const labels = await p.visibleFilterLabels();
    await recordTestValues(testInfo, { Sections: await p.sectionNames(), 'Criteria shown': labels });
    for (const l of FILTER_LABELS) expect.soft(labels, `"${l}" criterion`).toContain(l);
    await expect(p.applyButton).toBeVisible();
    await expect(p.resetButton).toBeVisible();
    await shot(page, testInfo, 'advanced-filters');
  });

  test(tcTitle(c.advOperators), tcDetails(c.advOperators, MODULE), async ({ personSearchPage: p }, testInfo) => {
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

  for (const tc of [c.firstName, c.middleName, c.lastName, c.displayName]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personSearchPage: p }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      const value = await valueWithData(p, testInfo, tc.fieldId, tc.value);
      test.skip(!value, `No person in the sandbox has a ${tc.fieldId} (set one, or SEARCH_PERSON_* in .env)`);
      const res = await advancedSearch(p, { text: { [tc.fieldId]: value } });
      await recordTestValues(testInfo, { [tc.fieldId]: value, Results: res.total });
      expect(criterion(res, tc.fieldId), `${tc.fieldId} contains <text>`).toEqual(expect.objectContaining({ operatorKey: 'contains', values: value }));
      expect(res.total, 'people found').toBeGreaterThan(0);
      if (tc.fieldId !== 'MiddleName') {
        const col = tc.fieldId === 'DisplayName' ? r => String(r['Display Name'] || '').toLowerCase() : nameOf;
        const wrong = res.rows.filter(r => !col(r).includes(value.toLowerCase()));
        expect(label(wrong, ids(wrong)), `every name contains "${value}"`).toEqual([]);
      }
    });
  }

  test(tcTitle(c.nameCase), tcDetails(c.nameCase, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.nameCase, MODULE);
    const lower = await advancedSearch(p, { text: { LastName: DATA.lastName.toLowerCase() } }, 'lower case');
    const upper = await advancedSearch(p, { text: { LastName: DATA.lastName.toUpperCase() } }, 'upper case');
    await recordTestValues(testInfo, { [DATA.lastName.toLowerCase()]: lower.total, [DATA.lastName.toUpperCase()]: upper.total });
    expect(lower.total, 'people found').toBeGreaterThan(0);
    expect(upper.total, 'same total').toBe(lower.total);
    expect(ids(upper.rows).sort(), 'same people').toEqual(ids(lower.rows).sort());
  });

  test(tcTitle(c.primaryEmail), tcDetails(c.primaryEmail, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.primaryEmail, MODULE);
    const typed = DATA.email.toLowerCase();
    const res = await advancedSearch(p, { text: { PrimaryEmail: typed } });
    await recordTestValues(testInfo, { 'Primary Email': typed, Results: res.total, Returned: res.rows.map(r => `${r['Full Name']} <${r.Email}>`) });
    expect(criterion(res, 'PrimaryEmail'), 'Equals is the default').toEqual(expect.objectContaining({ operatorKey: 'equals', values: typed }));
    expect(res.total, 'the owner is found').toBeGreaterThan(0);
    expect(res.rows.filter(r => emailOf(r) !== typed).map(r => `${r['Full Name']} <${r.Email}>`), 'only the owner of the email').toEqual([]);
  });

  test(tcTitle(c.emailEqualsPartial), tcDetails(c.emailEqualsPartial, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.emailEqualsPartial, MODULE);
    const res = await advancedSearch(p, { text: { PrimaryEmail: DATA.emailDomain } });
    await recordTestValues(testInfo, { 'Primary Email (equals)': DATA.emailDomain, Results: res.total });
    expect(res.total, 'Equals does not match part of an address').toBe(0);
  });

  test(tcTitle(c.emailContains), tcDetails(c.emailContains, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.emailContains, MODULE);
    const eq = await advancedSearch(p, { text: { PrimaryEmail: DATA.email } }, 'Equals');
    const res = await advancedSearch(p, { text: { PrimaryEmail: [DATA.emailDomain, 'contains'] } }, 'Contains');
    await recordTestValues(testInfo, { 'Primary Email (contains)': DATA.emailDomain, Results: res.total, 'Equals full address': eq.total });
    expect(criterion(res, 'PrimaryEmail'), 'Contains sent').toEqual(expect.objectContaining({ operatorKey: 'contains', values: DATA.emailDomain }));
    expect(res.total, 'Contains finds more than one exact address').toBeGreaterThan(eq.total);
    expect(res.rows.filter(r => !emailOf(r).includes(DATA.emailDomain.toLowerCase())).map(r => `${r['Full Name']} <${r.Email}>`),
      'every primary email contains the text').toEqual([]);
  });

  test(tcTitle(c.userEmail), tcDetails(c.userEmail, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.userEmail, MODULE);
    const res = await advancedSearch(p, { text: { AspNetUserEmail: DATA.userEmail } });
    await recordTestValues(testInfo, { 'User Email': DATA.userEmail, Results: res.total, Returned: res.rows.map(r => r['Full Name']) });
    expect(criterion(res, 'AspNetUserEmail'), 'User Email equals <email>').toEqual(expect.objectContaining({ operatorKey: 'equals' }));
    expect(res.total, 'exactly the user').toBe(1);
  });

  test(tcTitle(c.otherEmail), tcDetails(c.otherEmail, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.otherEmail, MODULE);
    const res = await advancedSearch(p, { text: { PersonEmailAddress: DATA.email } });
    await recordTestValues(testInfo, { 'Other Email': DATA.email, Results: res.total, Returned: res.rows.map(r => r['Full Name']) });
    expect(criterion(res, 'PersonEmailAddress'), 'Other Email equals <email>').toEqual(expect.objectContaining({ operatorKey: 'equals' }));
    expect(res.rows.map(emailOf), 'the owner is returned').toContain(DATA.email.toLowerCase());
  });

  test(tcTitle(c.phoneContains), tcDetails(c.phoneContains, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneContains, MODULE);
    const l = DATA.phoneLocal;
    const typed = `${l.slice(0, 3)}-${l.slice(3, 6)}-${l.slice(6)}`;
    const res = await advancedSearch(p, { text: { PhoneNumberE164: typed } });
    await recordTestValues(testInfo, { 'Phone Number': typed, 'Value sent': criterion(res, 'PhoneNumberE164')?.values, Results: res.total, Returned: res.rows.map(r => r['Full Name']) });
    expect(criterion(res, 'PhoneNumberE164'), 'Contains is the default').toEqual(expect.objectContaining({ operatorKey: 'contains' }));
    expect(res.rows.map(r => r['Full Name']), `DEFECT: "${typed}" is not normalized to digits before matching`).toContain(DATA.phoneOwner);
  });

  test(tcTitle(c.phoneEquals), tcDetails(c.phoneEquals, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneEquals, MODULE);
    const res = await advancedSearch(p, { text: { PhoneNumberE164: [DATA.phoneFormatted, 'equals'] } });
    await recordTestValues(testInfo, { 'Phone Number (equals)': DATA.phoneFormatted, Results: res.total, Returned: res.rows.map(r => r['Full Name']) });
    expect(res.rows.map(r => r['Full Name']), `DEFECT: "${DATA.phoneFormatted}" does not equal ${DATA.phoneE164} after normalization`).toEqual([DATA.phoneOwner]);
  });

  test(tcTitle(c.phoneEqualsPartial), tcDetails(c.phoneEqualsPartial, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneEqualsPartial, MODULE);
    const res = await advancedSearch(p, { text: { PhoneNumberE164: [DATA.phoneLocal, 'equals'] } });
    await recordTestValues(testInfo, { 'Phone Number (equals)': DATA.phoneLocal, Results: res.total });
    expect(res.rows.map(r => r['Full Name']), 'Equals does not match part of the number').not.toContain(DATA.phoneOwner);
  });

  test(tcTitle(c.phoneLetters), tcDetails(c.phoneLetters, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.phoneLetters, MODULE);
    await p.gotoAdvanced();
    await p.setText('PhoneNumberE164', 'abc');
    const res = await p.applyExpectingNoSearch();
    await recordTestValues(testInfo, { 'Phone Number': 'abc', 'Search ran': !!res, Results: res ? res.total : '-' });
    if (res) {
      expect(res.status, 'HTTP status').toBe(200);
      expect(res.total, 'DEFECT: letters in the phone criterion returned people').toBe(0);
    }
  });

  for (const tc of [c.address, c.city, c.region]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personSearchPage: p }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      const value = await valueWithData(p, testInfo, tc.fieldId, tc.value);
      test.skip(!value, `No person in the sandbox has a ${tc.fieldId} (set one, or SEARCH_PERSON_* in .env)`);
      const res = await advancedSearch(p, { text: { [tc.fieldId]: value } });
      await recordTestValues(testInfo, { [tc.fieldId]: value, Results: res.total, Returned: res.rows.slice(0, 10).map(r => r['Full Name']) });
      expect(criterion(res, tc.fieldId), `${tc.fieldId} contains <text>`).toEqual(expect.objectContaining({ operatorKey: 'contains', values: value }));
      expect(res.total, 'people found').toBeGreaterThan(0);
    });
  }

  test(tcTitle(c.postal), tcDetails(c.postal, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.postal, MODULE);
    const prefix = await advancedSearch(p, { text: { PostalCode: DATA.postalPrefix } }, 'Prefix');
    const middle = DATA.postalPrefix.slice(1);
    const inner = await advancedSearch(p, { text: { PostalCode: middle } }, 'Digits from inside the code');
    await recordTestValues(testInfo, { [`starts with ${DATA.postalPrefix}`]: prefix.total, [`starts with ${middle}`]: inner.total });
    expect(criterion(prefix, 'PostalCode'), 'BeginsWith is the default').toEqual(expect.objectContaining({ operatorKey: 'startsWith' }));
    expect(prefix.total, 'the prefix finds people').toBeGreaterThan(0);
    const leaked = ids(inner.rows).filter(id => ids(prefix.rows).includes(id));
    expect(label(inner.rows, leaked), `"${middle}" (inside "${DATA.postalPrefix}...") must not match those codes`).toEqual([]);
  });

  for (const tc of [c.company, c.companyLegal, c.companyTrade, c.accountName]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personSearchPage: p }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      const value = await valueWithData(p, testInfo, tc.fieldId, tc.value);
      test.skip(!value, `No person in the sandbox has a ${tc.fieldId} (set one, or SEARCH_PERSON_* in .env)`);
      const res = await advancedSearch(p, { text: { [tc.fieldId]: value } });
      await recordTestValues(testInfo, { [tc.fieldId]: value, Results: res.total, Returned: res.rows.slice(0, 10).map(r => r['Full Name']) });
      expect(criterion(res, tc.fieldId), `${tc.fieldId} contains <text>`).toEqual(expect.objectContaining({ operatorKey: 'contains', values: value }));
      expect(res.total, 'people linked to it').toBeGreaterThan(0);
    });
  }

  test(tcTitle(c.accountNumber), tcDetails(c.accountNumber, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNumber, MODULE);
    const byName = await advancedSearch(p, { text: { AccountName: DATA.accountName } }, 'Account Name');
    const full = await advancedSearch(p, { text: { AccountNumber: DATA.accountNumber } }, 'Full number');
    const partialNo = DATA.accountNumber.slice(0, -1);
    const partial = await advancedSearch(p, { text: { AccountNumber: partialNo } }, 'Partial number');
    await recordTestValues(testInfo, { 'Account Name': `${DATA.accountName}: ${byName.total}`, [`= ${DATA.accountNumber}`]: full.total, [`= ${partialNo}`]: partial.total });
    expect(criterion(full, 'AccountNumber'), 'Exact match').toEqual(expect.objectContaining({ operatorKey: 'equals', values: DATA.accountNumber }));
    expect(full.total, 'the full number finds the Account\'s people').toBeGreaterThan(0);
    expect(ids(full.rows).filter(id => !ids(byName.rows).includes(id)), 'same people as the Account Name').toEqual([]);
    const leaked = ids(partial.rows).filter(id => ids(full.rows).includes(id));
    expect(label(partial.rows, leaked), `part of the number ("${partialNo}") does not match ${DATA.accountNumber}`).toEqual([]);
  });

  test(tcTitle(c.staffRole), tcDetails(c.staffRole, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.staffRole, MODULE);
    await p.gotoAdvanced();
    const options = await p.dropdownOptions('StaffRoleIds');
    expect(options, `"${DATA.staffRole}" offered`).toContain(DATA.staffRole);
    const res = await advancedSearch(p, { staffRole: DATA.staffRole });
    await recordTestValues(testInfo, { 'Staff Role options': options.filter(o => !/select/i.test(o)), 'Staff Role': DATA.staffRole, Results: res.total });
    expect(criterion(res, 'StaffRoleIds'), 'Staff Role criterion sent').toBeDefined();
    expect(res.total, 'people with the role').toBeGreaterThan(0);
  });

  test(tcTitle(c.staffRoleMulti), tcDetails(c.staffRoleMulti, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.staffRoleMulti, MODULE);
    const one = await advancedSearch(p, { staffRole: DATA.staffRole }, DATA.staffRole);
    const two = await advancedSearch(p, { staffRole: DATA.staffRole2 }, DATA.staffRole2);
    const both = await advancedSearch(p, { staffRoles: [DATA.staffRole, DATA.staffRole2] }, 'Both roles');
    await recordTestValues(testInfo, { [DATA.staffRole]: one.total, [DATA.staffRole2]: two.total, 'Any of both': both.total });
    const sent = criterion(both, 'StaffRoleIds');
    expect(sent, '"is any of" sent').toEqual(expect.objectContaining({ operatorKey: 'in' }));
    expect(asList(sent.values), 'both roles sent').toHaveLength(2);
    expect(both.total, 'at least as many as each role').toBeGreaterThanOrEqual(Math.max(one.total, two.total));
    expect(both.total, 'no more than both together').toBeLessThanOrEqual(one.total + two.total);
    const [oneIds, twoIds, bothIds] = [await allIds(p, one), await allIds(p, two), await allIds(p, both)];
    expect(bothIds, 'every row of the combined search read').toHaveLength(both.total);
    const missing = [...oneIds, ...twoIds].filter(id => !bothIds.includes(id));
    expect(missing, 'every single-role person is included').toEqual([]);
  });

  test(tcTitle(c.securityRole), tcDetails(c.securityRole, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.securityRole, MODULE);
    await p.gotoAdvanced();
    expect(await p.visibleFilterLabels(), 'caption "Security Role"').toContain('Security Role');
    const suggestions = await p.lookupSuggestions('SecurityRoleIds', DATA.securityRole.slice(0, 2));
    expect(suggestions, `"${DATA.securityRole}" offered from AspNetRoles`).toContain(DATA.securityRole);
    const res = await advancedSearch(p, { securityRole: DATA.securityRole });
    await recordTestValues(testInfo, { Suggestions: suggestions, 'Security Role': DATA.securityRole, Results: res.total });
    expect(criterion(res, 'SecurityRoleIds'), 'Security Role criterion sent').toBeDefined();
    expect(res.total, 'people with the role').toBeGreaterThan(0);
  });

  test(tcTitle(c.securityRoleMulti), tcDetails(c.securityRoleMulti, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.securityRoleMulti, MODULE);
    const one = await advancedSearch(p, { securityRole: DATA.securityRole }, DATA.securityRole);
    const two = await advancedSearch(p, { securityRole: DATA.securityRole2 }, DATA.securityRole2);
    const both = await advancedSearch(p, { securityRoles: [DATA.securityRole, DATA.securityRole2] }, 'Both roles');
    await recordTestValues(testInfo, { [DATA.securityRole]: one.total, [DATA.securityRole2]: two.total, 'Any of both': both.total });
    const sent = criterion(both, 'SecurityRoleIds');
    expect(sent, '"is any of" sent').toEqual(expect.objectContaining({ operatorKey: 'in' }));
    expect(asList(sent.values), 'both roles sent').toHaveLength(2);
    const [oneIds, twoIds, bothIds] = [await allIds(p, one), await allIds(p, two), await allIds(p, both)];
    expect(bothIds, 'every row of the combined search read').toHaveLength(both.total);
    const missing = [...oneIds, ...twoIds].filter(id => !bothIds.includes(id));
    expect(missing, 'every single-role person is included').toEqual([]);
  });

  test(tcTitle(c.securityFreeText), tcDetails(c.securityFreeText, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.securityFreeText, MODULE);
    await p.gotoAdvanced();
    await p.typePickerText('SecurityRoleIds', DATA.noMatch);
    const res = await p.applyExpectingNoSearch();
    await recordTestValues(testInfo, { 'Security Role': `${DATA.noMatch} (typed, not picked)`, 'Search ran': !!res });
    await expect(p.pickerError('SecurityRoleIds'), '"Please select a value from the list"').toBeVisible();
    await expect(p.pickerError('SecurityRoleIds')).toHaveText(MESSAGES.selectFromList);
    if (res) expect(criterion(res, 'SecurityRoleIds'), 'free text is never sent as a Security Role').toBeUndefined();
  });

  test(tcTitle(c.hasUserOptions), tcDetails(c.hasUserOptions, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.hasUserOptions, MODULE);
    await p.gotoAdvanced();
    const options = await p.dropdownOptions('HasUserAccount');
    const shown = await p.dropdownText('HasUserAccount');
    await recordTestValues(testInfo, { Options: options, 'Default shown': shown, 'Spec options': HAS_USER.specOptions });
    expect(options.some(o => /^(yes|is user)$/i.test(o)), 'a "user" option').toBe(true);
    expect(options.some(o => /^(no|is not user)$/i.test(o)), 'a "not a user" option').toBe(true);
    await p.setText('LastName', DATA.lastName);
    const res = await p.apply();
    expectOk(res);
    expect(criterion(res, 'HasUserAccount'), 'default does not filter (All)').toBeUndefined();
    for (const o of HAS_USER.specOptions) expect.soft(options, `SPEC: option "${o}" (app shows ${options.join(' / ')})`).toContain(o);
  });

  test(tcTitle(c.hasUser), tcDetails(c.hasUser, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.hasUser, MODULE);
    const base = { text: { City: DATA.city } };
    const all = await advancedSearch(p, base, 'All');
    const users = await advancedSearch(p, { ...base, hasUser: 'yes' }, 'Is User');
    const others = await advancedSearch(p, { ...base, hasUser: 'no' }, 'Is Not User');
    const user = await advancedSearch(p, { text: { AspNetUserEmail: DATA.userEmail }, hasUser: 'no' }, 'Known user + Is Not User');
    await recordTestValues(testInfo, { City: DATA.city, All: all.total, 'Is User': users.total, 'Is Not User': others.total, [`${DATA.userEmail} + Is Not User`]: user.total });
    expect(criterion(users, 'HasUserAccount'), 'Is User sent').toBeDefined();
    expect(users.total + others.total, 'Is User + Is Not User = All').toBe(all.total);
    expect(ids(users.rows).filter(id => ids(others.rows).includes(id)), 'nobody is in both').toEqual([]);
    expect(user.total, 'a user is never "Is Not User"').toBe(0);
  });

  test(tcTitle(c.tags), tcDetails(c.tags, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.tags, MODULE);
    await p.gotoAdvanced();
    const ops = (await p.operatorOptions('TagIds')).map(o => o.value);
    expect(ops, 'Tags supports "is any of"').toContain('in');
    if (!DATA.tag) {
      observe(testInfo, 'Data part not run: set SEARCH_PERSON_TAG (no tag is assigned to a person in the sandbox)');
      await recordTestValues(testInfo, { 'Tags operators': ops });
      return;
    }
    const res = await advancedSearch(p, { tags: [DATA.tag] });
    await recordTestValues(testInfo, { Tag: DATA.tag, Results: res.total });
    expect(criterion(res, 'TagIds'), 'Tags criterion sent').toBeDefined();
    expect(res.total, 'tagged people').toBeGreaterThan(0);
  });

  test(tcTitle(c.includeDeletedDefault), tcDetails(c.includeDeletedDefault, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.includeDeletedDefault, MODULE);
    await p.gotoAdvanced();
    await expect(p.includeDeletedCheckbox, 'toggle is OFF').not.toBeChecked();
    await p.setText('LastName', DATA.lastName);
    const res = await p.apply();
    expectOk(res);
    const chips = await p.chipTexts();
    await recordTestValues(testInfo, { 'Include Deleted': 'OFF (default)', Chips: chips, Results: res.total });
    const sent = criterion(res, 'IsArchived');
    expect(!sent || sent.values === false || sent.values === 'false', 'deleted people are excluded (IsArchived = false)').toBe(true);
  });

  test(tcTitle(c.includeDeletedOn), tcDetails(c.includeDeletedOn, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.includeDeletedOn, MODULE);
    const off = await advancedSearch(p, { text: { LastName: DATA.lastName } }, 'Include Deleted OFF');
    const on = await advancedSearch(p, { text: { LastName: DATA.lastName }, includeDeleted: true }, 'Include Deleted ON');
    await recordTestValues(testInfo, { 'Last Name': DATA.lastName, OFF: off.total, ON: on.total, 'Sent when ON': JSON.stringify(criterion(on, 'IsArchived') || null) });
    expect(off.total, 'active people found').toBeGreaterThan(0);
    expect(on.total, 'DEFECT: Include Deleted ON returns fewer people - it acts as "only deleted" instead of "also deleted"').toBeGreaterThanOrEqual(off.total);
    expect(label(off.rows, ids(off.rows).filter(id => !ids(on.rows).includes(id))), 'active people are still returned with ON').toEqual([]);
  });

  test(tcTitle(c.includeDeletedPerson), tcDetails(c.includeDeletedPerson, MODULE), async ({ personSearchPage: p }, testInfo) => {
    test.skip(!DATA.deletedName, 'Set SEARCH_PERSON_DELETED_NAME to a deleted person (none in the sandbox)');
    await applyAllureLabels(c.includeDeletedPerson, MODULE);
    const isIt = r => String(r['Display Name']).toLowerCase() === DATA.deletedName.toLowerCase();
    const off = await advancedSearch(p, { text: { DisplayName: DATA.deletedName } }, 'OFF');
    const on = await advancedSearch(p, { text: { DisplayName: DATA.deletedName }, includeDeleted: true }, 'ON');
    await recordTestValues(testInfo, { 'Deleted person': DATA.deletedName, OFF: off.total, ON: on.total });
    expect(off.rows.filter(isIt).length, 'hidden while OFF').toBe(0);
    expect(on.rows.filter(isIt).length, 'returned with ON').toBeGreaterThan(0);
  });

  test(tcTitle(c.laborGrade), tcDetails(c.laborGrade, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.laborGrade, MODULE);
    await p.gotoAdvanced();
    const ops = (await p.operatorOptions('LaborGradeIDF')).map(o => o.value);
    expect(ops, 'Labor Grade offers Equals').toContain('equals');
    if (!DATA.laborGrade) {
      observe(testInfo, 'Data part not run: set SEARCH_PERSON_LABOR_GRADE (no labor grade is assigned in the sandbox)');
      await recordTestValues(testInfo, { 'Labor Grade operators': ops });
      return;
    }
    const res = await advancedSearch(p, { laborGrade: DATA.laborGrade });
    await recordTestValues(testInfo, { 'Labor Grade': DATA.laborGrade, Results: res.total });
    expect(criterion(res, 'LaborGradeIDF'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals' }));
    expect(res.total, 'people with the grade').toBeGreaterThan(0);
  });

  test(tcTitle(c.language), tcDetails(c.language, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.language, MODULE);
    await p.gotoAdvanced();
    const options = await p.dropdownOptions('LanguageIDF');
    expect(options, `"${DATA.language}" offered`).toContain(DATA.language);
    expect(await p.isMultiSelect('LanguageIDF'), 'single-select').toBe(false);
    // a language some person has right now, the configured one first (the Person form has no Language field, so
    // the sandbox may hold none at all)
    const langs = (await p.dropdownValues('LanguageIDF')).sort((a, b) => (b.text === DATA.language) - (a.text === DATA.language));
    let used = null;
    for (const o of langs) {
      if (await p.countPeople([{ fieldId: 'LanguageIDF', operatorKey: 'equals', values: o.value }])) { used = o.text; break; }
    }
    const res = await advancedSearch(p, { language: used || DATA.language });
    await recordTestValues(testInfo, { 'Language options': options.filter(o => !/select/i.test(o)), Language: used || DATA.language, Results: res.total });
    expect(criterion(res, 'LanguageIDF'), 'Equals sent').toEqual(expect.objectContaining({ operatorKey: 'equals' }));
    if (!used) {
      observe(testInfo, 'Result count not checked: no person in the sandbox has a Language (it cannot be set on the Person form)');
      expect(res.total, 'nobody has a language, so nobody is returned').toBe(0);
      return;
    }
    expect(res.total, `people with the language "${used}"`).toBeGreaterThan(0);
  });

  test(tcTitle(c.combined), tcDetails(c.combined, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.combined, MODULE);
    const name = await advancedSearch(p, { text: { LastName: DATA.lastName } }, 'Last Name');
    const city = await advancedSearch(p, { text: { City: DATA.city } }, 'City');
    const role = await advancedSearch(p, { staffRole: DATA.staffRole }, 'Staff Role');
    const all = await advancedSearch(p, { text: { LastName: DATA.lastName, City: DATA.city }, staffRole: DATA.staffRole }, 'All three');
    await recordTestValues(testInfo, { 'Last Name': name.total, City: city.total, 'Staff Role': role.total, 'All three': all.total });
    for (const f of ['LastName', 'City', 'StaffRoleIds']) expect(criterion(all, f), `${f} sent`).toBeDefined();
    expect(all.total, 'people meeting every criterion').toBeGreaterThan(0);
    const allThree = await allIds(p, all);
    for (const [n, single] of [['Last Name', name], ['City', city], ['Staff Role', role]]) {
      expect(all.total, `<= ${n} total`).toBeLessThanOrEqual(single.total);
      const singleIds = await allIds(p, single);
      expect(allThree.filter(id => !singleIds.includes(id)), `every row also matches ${n}`).toEqual([]);
    }
  });

  test(tcTitle(c.reset), tcDetails(c.reset, MODULE), async ({ personSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.reset, MODULE);
    await p.gotoAdvanced();
    await p.setText('LastName', DATA.lastName);
    await p.setText('PrimaryEmail', DATA.email);
    await p.setText('City', DATA.city);
    await p.setDropdown('StaffRoleIds', DATA.staffRole);
    await p.setDropdown('HasUserAccount', await hasUserLabel(p, 'yes'));
    await p.setIncludeDeleted(true);
    await recordTestValues(testInfo, { 'Last Name': DATA.lastName, 'Primary Email': DATA.email, City: DATA.city, 'Staff Role': DATA.staffRole, 'Has User Account': 'Is User', 'Include Deleted': 'ON' });
    await p.resetFilters();
    await p.expandAllSections();
    for (const f of ['LastName', 'PrimaryEmail', 'City']) await expect(page.locator(`#${f}_one`), `${f} cleared`).toHaveValue('');
    expect(await p.dropdownText('StaffRoleIds'), 'Staff Role back to default').toMatch(/select|all/i);
    expect(await p.dropdownText('HasUserAccount'), 'Has User Account back to default').toMatch(/select|all/i);
    await expect(p.includeDeletedCheckbox, 'Include Deleted back to OFF').not.toBeChecked();
  });

  test(tcTitle(c.advEmpty), tcDetails(c.advEmpty, MODULE), async ({ personSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.advEmpty, MODULE);
    await p.gotoAdvanced();
    const res = await p.applyExpectingNoSearch();
    const shownError = (await p.isVisibleWithin(p.resultsError, 2_000)) ? (await p.resultsError.innerText()).trim() : '';
    observe(testInfo, res ? `Search ran: ${res.total} results, error "${res.error || ''}"` : 'No search ran');
    await recordTestValues(testInfo, { Criteria: '(none)', 'Search ran': !!res, Message: shownError || res?.error || '-' });
    if (res) expect(res.status, 'HTTP status').toBe(200);
    // check the page text without the results grid: person data (e.g. Job Title "Sr. TSQL Programmer") must not trip the pattern
    const pageText = await page.locator('main').evaluate(m => {
      const c = m.cloneNode(true);
      c.querySelectorAll('table, .card-grid, [id*="Grid" i], [class*="result-card" i]').forEach(e => e.remove());
      return c.innerText ?? c.textContent;
    });
    expect(`${pageText}
${shownError}`, 'no server error shown').not.toMatch(MESSAGES.serverError);
    await expect(p.openFiltersButton, 'page still usable').toBeVisible();
  });

  // ================= 4. Result ordering =================

  test(tcTitle(c.orderEmail), tcDetails(c.orderEmail, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderEmail, MODULE);
    const res = await quickSearch(p, DATA.email);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.email, Outcome: outcome(res) });
    if (res.openedId) {
      observe(testInfo, 'Only one person matched, so the app opened the record directly (that person is first by definition)');
      expect(await returned(p, res, { email: DATA.email }), 'the opened record is the email owner').toBe(true);
      return;
    }
    expect(res.rows.length, 'results').toBeGreaterThan(0);
    expect(emailOf(res.rows[0]), 'exact email match is first').toBe(DATA.email.toLowerCase());
  });

  test(tcTitle(c.orderPhone), tcDetails(c.orderPhone, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderPhone, MODULE);
    const res = await quickSearch(p, DATA.phoneE164);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.phoneE164, Outcome: outcome(res) });
    if (res.openedId) {
      observe(testInfo, 'Only one person matched, so the app opened the record directly (that person is first by definition)');
      expect(await returned(p, res, { name: DATA.phoneOwner }), 'the opened record is the phone owner').toBe(true);
      return;
    }
    expect(res.rows.length, 'results').toBeGreaterThan(0);
    expect(res.rows[0]['Full Name'], 'exact phone match is first').toBe(DATA.phoneOwner);
  });

  test(tcTitle(c.orderName), tcDetails(c.orderName, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderName, MODULE);
    const t = DATA.firstName.toLowerCase();
    const res = await quickSearch(p, DATA.firstName);
    expectOk(res);
    const exact = res.rows.map(r => words(r).some(w => w.toLowerCase() === t) || String(r['Display Name']).toLowerCase() === t);
    await recordTestValues(testInfo, { search: DATA.firstName, 'Order returned': res.rows.slice(0, 10).map((r, i) => `${r['Full Name']}${exact[i] ? ' (exact)' : ''}`) });
    expect(exact.some(Boolean), 'an exact name match exists').toBe(true);
    const firstPartial = exact.indexOf(false);
    const lateExact = firstPartial < 0 ? [] : res.rows.slice(firstPartial).filter((r, i) => exact[firstPartial + i]).map(r => r['Full Name']);
    expect(lateExact, 'no exact-name row is ranked below a partial-name row').toEqual([]);
  });

  test(tcTitle(c.orderUsers), tcDetails(c.orderUsers, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderUsers, MODULE);
    // a last-name fragment matching both people with and without a user account (all users on one page)
    const part = await test.step('Find a Last Name with users and non-users', async () => {
      const count = (t, isUser) => p.countPeople([
        { fieldId: 'LastName', operatorKey: 'contains', values: t }, { fieldId: 'HasUserAccount', operatorKey: 'equals', values: String(isUser) }]);
      for (const t of [DATA.lastName.slice(0, -1), DATA.lastName, 'son', 'an', 'er', 'el', 'in', 'ar', 'e']) {
        const u = await count(t, true);
        if (u > 0 && u <= 25 && (await count(t, false)) > 0) return t;
      }
      return null;
    });
    test.skip(!part, 'No last name in the sandbox is shared by people with and without a user account');
    if (part !== DATA.lastName.slice(0, -1)) observe(testInfo, `"${DATA.lastName.slice(0, -1)}" matches only users now; used "${part}"`);
    const base = await advancedSearch(p, { text: { LastName: part } }, 'Last Name');
    const users = await advancedSearch(p, { text: { LastName: part }, hasUser: 'yes' }, 'Users only');
    // whole result in server order: users sort first, so the grid's first page alone may hold only users
    const baseRows = await p.allRows(base);
    const userIds = await allIds(p, users);
    const order = baseRows.map(r => (userIds.includes(pid(r)) ? 'U' : 'N')).join('');
    await recordTestValues(testInfo, { 'Last Name': part, 'Order (U = user, N = not)': order, Rows: baseRows.map(r => r['Full Name']) });
    expect(userIds.length > 0 && userIds.length < baseRows.length, 'both users and non-users in the result').toBe(true);
    expect(order, 'every user is listed before every non-user').toMatch(/^U*N*$/);
  });

  test(tcTitle(c.orderAlpha), tcDetails(c.orderAlpha, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.orderAlpha, MODULE);
    const res = await advancedSearch(p, { text: { LastName: DATA.sortTerm }, hasUser: 'no' });
    const keys = res.rows.map(lastFirst);
    await recordTestValues(testInfo, { 'Last Name contains': DATA.sortTerm, 'Has User Account': 'Is Not User', Rows: res.rows.map(r => r['Full Name']) });
    expect(res.rows.length, 'at least two rows to compare').toBeGreaterThan(1);
    const breaks = [];
    for (let i = 1; i < keys.length; i++) {
      const cmp = keys[i - 1][0].localeCompare(keys[i][0]) || keys[i - 1][1].localeCompare(keys[i][1]);
      if (cmp > 0) breaks.push(`${res.rows[i - 1]['Full Name']} before ${res.rows[i]['Full Name']}`);
    }
    expect(breaks, 'DEFECT: results are not sorted by Last Name, then First Name').toEqual([]);
  });

  test(tcTitle(c.paging), tcDetails(c.paging, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.paging, MODULE);
    const page1 = await advancedSearch(p, { hasUser: 'no' }, 'Page 1');
    expect(page1.total, 'more than one page').toBeGreaterThan(page1.rows.length);
    const page2 = await test.step('Next page', () => p.goToNextPage());
    expectOk(page2, 'page 2');
    await recordTestValues(testInfo, { Total: page1.total, 'Page 1 rows': page1.rows.length, 'Page 2 rows': page2.rows.length, 'Page 2 start': page2.body.start });
    expect(page2.body.start, 'page 2 starts after page 1').toBe(page1.rows.length);
    expect(page2.total, 'total unchanged between pages').toBe(page1.total);
    expect(ids(page2.rows).filter(id => ids(page1.rows).includes(id)), 'no person on both pages').toEqual([]);
  });

  // ================= results / permissions =================

  test(tcTitle(c.resultsView), tcDetails(c.resultsView, MODULE), async ({ personSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.resultsView, MODULE);
    const res = await quickSearch(p, DATA.lastName);
    expectOk(res);
    await expect(p.cards, 'one card per returned person').toHaveCount(res.rows.length);
    const n = Math.min(5, res.rows.length);
    for (let i = 0; i < n; i++) {
      const card = await p.cardDetails(i);
      expect(card.text, `card ${i + 1}: name`).toContain(res.rows[i]['Full Name'] || res.rows[i]['Display Name']);
      if (res.rows[i].Email) expect(card.text, `card ${i + 1}: email`).toContain(res.rows[i].Email);
    }
    await shot(page, testInfo, 'person-cards');
    const landing = await test.step('Open the first result', () => p.openResult(0));
    const url = landing.url();
    await recordTestValues(testInfo, { search: DATA.lastName, 'Cards checked': n, Opened: `${res.rows[0]['Full Name']} -> ${url}` });
    expect(url, 'opens the Person record').toMatch(new RegExp(`/Person/Edit/${pid(res.rows[0])}(?:[/?#]|$)`, 'i'));
    if (landing !== p.page) await landing.close();
  });

  test(tcTitle(c.permission), tcDetails(c.permission, MODULE), async ({ personSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.permission, MODULE);
    const res = await quickSearch(p, DATA.lastName);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.lastName, 'Rows checked': res.rows.length });
    expect(res.rows.filter(r => r.IsAllowed === false).map(pid), 'no person the user may not view').toEqual([]);
  });
});
