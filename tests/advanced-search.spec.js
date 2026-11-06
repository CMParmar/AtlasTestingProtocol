const { test, expect } = require('../fixtures/fixtures');
const { MODULE, ENTITY, OTHER_ENTITY, NO_CONFIG_ENTITY, DATE_ENTITY, ENTITIES, DATA, MESSAGES, cases: c } = require('../testData/advancedSearchData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues, recordUrl } = require('../utils/testCase');

/**
 * 62200 Advanced Search Criteria Capture (docs/62200 Advanced Search Criteria Capture Use Case.md).
 * Run on the Person search (/Search?entityId=9); MF-1 is repeated on every SettingKey entity that has a search page.
 * Every Apply is checked on the POST /Search/ResultsData request it sends (criteriaJson) and on what the page shows.
 * The app stores the last-used criteria server-side from that request (no separate save call), so persistence is
 * checked by reopening the page and reading the criteria of the on-load search. Stored criteria of the entities used
 * are cleared before and after every test so other search specs start from the usual state.
 *
 * Not automated: the Setting rows themselves (SettingKey / SettingValue - no UI or API exposes them), the Global-scope
 * fallback of A3-1 (needs a user-scope config to be removed), the SearchCriteria entities with no search page yet
 * (Address, Expense, Invoice, Document, ServiceStage, ServiceSubscription, Tag, Event, TimeClock, WorkItem) and
 * Sensitive/PII fields (out of scope).
 */

const DEFAULT_FIELDS = ['IsArchived']; // added by the configuration to every search ("Include deleted" = false)

const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const crit = (res, fieldId) => (res.criteria || []).find(x => x.fieldId === fieldId);
/** Criteria the user entered (configuration defaults left out), sorted by field id - comparable between searches. */
const userCriteria = res => (res.criteria || []).filter(x => !DEFAULT_FIELDS.includes(x.fieldId))
  .map(({ fieldId, operatorKey, values }) => ({ fieldId, operatorKey, values }))
  .sort((a, b) => a.fieldId.localeCompare(b.fieldId));
const nameOf = r => `${r['Full Name'] || ''} ${r['Display Name'] || ''} ${r['Last Name'] || ''}`.toLowerCase();
const lastNameTag = value => new RegExp(`^Last Name: contains ${value}$`, 'i');

/** From a cleared drawer: enters Last Name (contains) and/or First Name, optionally with another operator, then Apply. */
async function applyCriteria(p, { lastName, firstName, firstNameOp } = {}) {
  return test.step(`Apply ${JSON.stringify({ lastName, firstName, firstNameOp })}`, async () => {
    await p.resetFilters();
    if (lastName) await p.setText('LastName', lastName);
    if (firstNameOp) await p.chooseOperator('FirstName', firstNameOp);
    if (firstName) await p.setText('FirstName', firstName);
    const res = await p.apply();
    expect(res.status, 'ResultsData HTTP status').toBe(200);
    expect(res.error, 'search error').toBeNull();
    await p.closeFilters();
    // let the app finish storing the criteria before the test navigates away
    await p.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    return res;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Configuration (MF-1, A3-1): no set-up - each test only opens a search page, so they report even when the flows below
// cannot run because the sandbox has no Search configuration.
// ---------------------------------------------------------------------------------------------------------------
test.describe('Advanced Search Criteria Capture (62200) - configuration', () => {
  test.beforeEach(async ({}, testInfo) => {
    knownDefectFor(testInfo, c);
  });

  // ================= MF-1: navigate, configuration rendered =================

  for (const [entityId, { name, key, labels }] of Object.entries(ENTITIES)) {
    test(`${tcTitle(c.configRendered)} [${name}]`, tcDetails(c.configRendered, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
      await applyAllureLabels(c.configRendered, MODULE);
      // one page load: settings response and on-load search are captured while that page is alive
      const { state, prefs, prefsUrl, results } = await p.loadWithSettings(entityId);
      await recordTestValues(testInfo, { Entity: `${name} (${entityId})`, 'Setting key': key, 'Page state': state.available ? 'criteria shown' : state.message });
      if (!state.available) await shot(page, testInfo, `${name.toLowerCase().replace(/\s+/g, '-')}-config-error`);
      expect(state.available, `${key} loaded - page shows: ${state.message}`).toBe(true);
      expect(prefs, 'settings requested for this entity').not.toBeNull();
      expect(results, 'search run on load').not.toBeNull();
      await p.openFilters();
      const shown = await p.visibleFilterLabels();
      await recordUrl(testInfo, page.url(), `${name} advanced search`);
      await recordTestValues(testInfo, { Entity: `${name} (${entityId})`, 'Setting key': key, 'Criteria rendered': shown.join(' | ') });
      await shot(page, testInfo, `${name.toLowerCase().replace(/\s+/g, '-')}-criteria`);
      expect(prefsUrl, 'settings read for this entity').toMatch(new RegExp(`entityId=${entityId}\\b`));
      expect(prefs.success, 'settings read successfully').toBe(true);
      expect(results.status, 'search page served').toBe(200);
      await expect(p.configErrorBanner, 'no configuration error shown').toBeHidden();
      expect(shown.length, 'criteria rendered from the configuration').toBeGreaterThan(0);
      expect(shown, `criteria of ${key} rendered`).toEqual(expect.arrayContaining(labels));
    });
  }

  // ================= A3-1: missing configuration =================

  test(tcTitle(c.missingConfig), tcDetails(c.missingConfig, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.missingConfig, MODULE);
    const searches = await p.searchesDuring(() => p.openWithoutConfig(NO_CONFIG_ENTITY));
    const banner = (await p.isVisibleWithin(p.configErrorBanner, 5_000)) ? (await p.configErrorBanner.locator('xpath=..').innerText()).replace(/\s+/g, ' ').trim() : '';
    await recordUrl(testInfo, page.url(), 'Entity without configuration');
    await recordTestValues(testInfo, { Entity: NO_CONFIG_ENTITY, Message: banner || '(none)', 'Searches run': searches });
    await shot(page, testInfo, 'missing-configuration');
    await expect(p.openFiltersButton, 'no criteria offered').toBeHidden();
    expect(searches, 'no search executed').toBe(0);
    expect(banner, '"Advanced search configuration not available for this entity." shown').toMatch(MESSAGES.noConfig);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Flows (MF-3 .. MF-7, A1, A2, A4) on the Person search. Each test first checks the page offers its criteria and
// fails at once with the page's configuration error when it does not (instead of timing out on the settings request).
// ---------------------------------------------------------------------------------------------------------------
test.describe('Advanced Search Criteria Capture (62200)', () => {
  test.beforeEach(async ({ advancedSearchPage: p }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    await p.requireSearch(ENTITY);
    await p.clearStoredCriteria(ENTITY);
    await p.gotoCleared(ENTITY);
  });

  test.afterEach(async ({ advancedSearchPage: p }) => {
    if ((await p.searchState(ENTITY, 15_000).catch(() => ({}))).available) await p.clearStoredCriteria(ENTITY).catch(() => {});
  });

  // ================= MF-3: values and operators captured =================

  test(tcTitle(c.captureValuesOperators), tcDetails(c.captureValuesOperators, MODULE), async ({ advancedSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.captureValuesOperators, MODULE);
    await p.chooseOperator('LastName', 'isNotEmpty');
    await p.setText('FirstName', DATA.firstNamePart);
    const res = await p.apply();
    await recordTestValues(testInfo, { Criteria: JSON.stringify(res.criteria) });
    expect(crit(res, 'LastName'), 'Last Name captured with its operator key').toMatchObject({ fieldId: 'LastName', operatorKey: 'isNotEmpty' });
    expect(crit(res, 'FirstName'), 'First Name captured with value and operator key').toEqual({ fieldId: 'FirstName', operatorKey: 'contains', values: DATA.firstNamePart });
  });

  // ================= MF-4 / MF-5: Apply =================

  test(tcTitle(c.applySerializes), tcDetails(c.applySerializes, MODULE), async ({ advancedSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.applySerializes, MODULE);
    const res = await applyCriteria(p, { lastName: DATA.lastName });
    const raw = res.body.criteriaJson;
    await recordTestValues(testInfo, { criteriaJson: raw, entityId: res.body.entityId, searchMode: res.body.searchMode });
    expect(typeof raw, 'criteria sent as a JSON string').toBe('string');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed), 'criteria JSON is an array').toBe(true);
    for (const entry of parsed) expect(Object.keys(entry).sort(), `entry ${entry.fieldId} shape`).toEqual(['fieldId', 'operatorKey', 'values']);
    expect(crit(res, 'LastName'), 'Last Name serialized').toEqual({ fieldId: 'LastName', operatorKey: 'contains', values: DATA.lastName });
    expect(String(res.body.entityId), 'search for the entity').toBe(String(ENTITY));
    expect(res.body.searchMode, 'advanced search').toBe('advanced');
  });

  test(tcTitle(c.applyShowsMatches), tcDetails(c.applyShowsMatches, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.applyShowsMatches, MODULE);
    const res = await applyCriteria(p, { lastName: DATA.lastName });
    const nonMatching = res.rows.filter(r => !nameOf(r).includes(DATA.lastName.toLowerCase())).map(nameOf);
    await recordTestValues(testInfo, { 'Last Name': DATA.lastName, Results: res.total, 'Rows checked': res.rows.length, 'Not matching': nonMatching.slice(0, 5) });
    await shot(page, testInfo, 'matching-records');
    expect(res.total, `people with last name "${DATA.lastName}" exist`).toBeGreaterThan(0);
    expect(nonMatching, 'every returned record matches the criteria').toEqual([]);
    await expect.poll(async () => (await p.shownRecordIds()).length, { message: 'records rendered', timeout: 15_000 }).toBeGreaterThan(0);
  });

  // ================= MF-6: persist SearchHistory =================

  test(tcTitle(c.persistOnApply), tcDetails(c.persistOnApply, MODULE), async ({ advancedSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.persistOnApply, MODULE);
    const applied = await applyCriteria(p, { lastName: DATA.lastName, firstName: DATA.firstNamePart });
    const { results } = await p.reopenSearch(ENTITY);
    await recordTestValues(testInfo, { Applied: JSON.stringify(userCriteria(applied)), 'On reopen': JSON.stringify(userCriteria(results)) });
    expect(userCriteria(results), 'stored criteria = applied criteria').toEqual(userCriteria(applied));
  });

  test(tcTitle(c.keepLatestOnly), tcDetails(c.keepLatestOnly, MODULE), async ({ advancedSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.keepLatestOnly, MODULE);
    const first = await applyCriteria(p, { lastName: DATA.lastName });
    const second = await applyCriteria(p, { lastName: DATA.otherLastName, firstNameOp: 'isNotEmpty' });
    const { results } = await p.reopenSearch(ENTITY);
    await recordTestValues(testInfo, { First: JSON.stringify(userCriteria(first)), Second: JSON.stringify(userCriteria(second)), 'On reopen': JSON.stringify(userCriteria(results)) });
    expect(userCriteria(results), 'latest criteria restored').toEqual(userCriteria(second));
    expect(crit(results, 'LastName').values, 'earlier value not restored').not.toBe(DATA.lastName);
  });

  test(tcTitle(c.scopedPerEntity), tcDetails(c.scopedPerEntity, MODULE), async ({ advancedSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.scopedPerEntity, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    const other = await p.reopenSearch(OTHER_ENTITY);
    const otherTags = await p.tagTexts();
    const back = await p.reopenSearch(ENTITY);
    await recordTestValues(testInfo, { 'Other entity criteria': JSON.stringify(other.results.criteria), 'Other entity tags': otherTags, 'Person on return': JSON.stringify(back.results.criteria) });
    expect(String(other.results.body.entityId), 'other entity searched').toBe(String(OTHER_ENTITY));
    expect(other.results.criteria.some(x => x.values === DATA.lastName), 'Person criteria not used by the other entity').toBe(false);
    expect(otherTags.join(' | '), 'no Person tag on the other entity').not.toContain(DATA.lastName);
    expect(crit(back.results, 'LastName'), 'Person criteria still stored').toMatchObject({ values: DATA.lastName });
  });

  // ================= MF-7: return to Advanced Search =================

  test(tcTitle(c.restoreRehydrates), tcDetails(c.restoreRehydrates, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.restoreRehydrates, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName, firstNameOp: 'isNotEmpty' });
    await p.reopenSearch(ENTITY);
    const tags = await p.tagTexts();
    await p.openFilters();
    const ui = { lastName: await p.textValue('LastName'), lastNameOp: await p.operatorText('LastName'), firstNameOp: await p.operatorText('FirstName') };
    await recordTestValues(testInfo, { 'Restored controls': JSON.stringify(ui), Tags: tags });
    await shot(page, testInfo, 'criteria-rehydrated');
    expect(ui.lastName, 'Last Name value restored').toBe(DATA.lastName);
    expect(ui.lastNameOp, 'Last Name operator restored').toMatch(/^contains$/i);
    expect(ui.firstNameOp, 'First Name operator restored').toMatch(/^is not empty$/i);
    expect(tags, 'Last Name tag restored').toEqual(expect.arrayContaining([expect.stringMatching(lastNameTag(DATA.lastName))]));
    expect(tags.some(t => /^First Name:/i.test(t)), 'First Name tag restored').toBe(true);
  });

  test(tcTitle(c.restoreAutoRuns), tcDetails(c.restoreAutoRuns, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.restoreAutoRuns, MODULE);
    const applied = await applyCriteria(p, { lastName: DATA.lastName });
    const { results } = await p.reopenSearch(ENTITY); // resolves on the on-load ResultsData request - no Apply clicked
    await recordTestValues(testInfo, { 'Applied results': applied.total, 'On-load results': results.total, 'On-load criteria': JSON.stringify(userCriteria(results)) });
    expect(results.status, 'restored search executed').toBe(200);
    expect(results.error).toBeNull();
    expect(crit(results, 'LastName'), 'executed with the restored criteria').toMatchObject({ operatorKey: 'contains', values: DATA.lastName });
    expect(results.total, 'same records as the Apply').toBe(applied.total);
    await expect.poll(async () => (await p.shownRecordIds()).length, { message: 'fresh results rendered', timeout: 15_000 }).toBeGreaterThan(0);
    await shot(page, testInfo, 'restored-results');
  });

  // ================= Alternate / exception flows =================

  test(tcTitle(c.noMatches), tcDetails(c.noMatches, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.noMatches, MODULE);
    const res = await applyCriteria(p, { lastName: DATA.noMatch });
    const shown = (await p.isVisibleWithin(p.noResultsMessage, 10_000)) ? (await p.noResultsMessage.innerText()).trim() : '';
    await recordTestValues(testInfo, { 'Last Name': DATA.noMatch, Results: res.total, Message: shown || '(none)' });
    await shot(page, testInfo, 'no-matching-records');
    expect(res.total, 'no records match').toBe(0);
    expect(shown, '"No matching records found." shown').toMatch(MESSAGES.noResults);
    expect(await p.shownRecordIds(), 'no records rendered').toEqual([]);
  });

  test(tcTitle(c.invalidBlocked), tcDetails(c.invalidBlocked, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.invalidBlocked, MODULE);
    await p.requireSearch(DATE_ENTITY);
    try {
      await p.gotoCleared(DATE_ENTITY);
      await p.setDateRange(DATA.invalidRange.start, DATA.invalidRange.end);
      await p.dateEndInput.press('Tab');
      const res = await p.applyExpectingNoSearch();
      const invalid = await p.isInvalid('DateCreatedUtc');
      const errors = await p.fieldErrors('DateCreatedUtc');
      await recordTestValues(testInfo, { 'Date range': `${DATA.invalidRange.start} .. ${DATA.invalidRange.end}`, 'Search ran': !!res, Highlighted: invalid, 'Inline errors': errors });
      await shot(page, testInfo, 'invalid-criterion');
      expect(res, 'search not executed').toBeNull();
      expect(invalid, 'date range control marked invalid').toBe(true);
    } finally {
      await p.clearStoredCriteria(DATE_ENTITY).catch(() => {});
    }
  });

  test(tcTitle(c.invalidMessage), tcDetails(c.invalidMessage, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.invalidMessage, MODULE);
    await p.requireSearch(DATE_ENTITY);
    try {
      await p.gotoCleared(DATE_ENTITY);
      await p.setDateRange(DATA.invalidRange.start, DATA.invalidRange.end);
      await p.dateEndInput.press('Tab');
      await p.applyExpectingNoSearch();
      const errors = await p.fieldErrors('DateCreatedUtc');
      await recordTestValues(testInfo, { 'Date range': `${DATA.invalidRange.start} .. ${DATA.invalidRange.end}`, 'Inline error text': errors.length ? errors : '(none - red border only)' });
      await shot(page, testInfo, 'invalid-criterion-message');
      expect(errors.length, 'inline error text shown under the field').toBeGreaterThan(0);
    } finally {
      await p.clearStoredCriteria(DATE_ENTITY).catch(() => {});
    }
  });

  test(tcTitle(c.invalidNotPersisted), tcDetails(c.invalidNotPersisted, MODULE), async ({ advancedSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.invalidNotPersisted, MODULE);
    await p.requireSearch(DATE_ENTITY);
    try {
      await p.gotoCleared(DATE_ENTITY);
      await p.setMessageText(DATA.messageText);
      const valid = await p.apply();
      expect(valid.status, 'valid criteria applied').toBe(200);
      await p.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await p.setDateRange(DATA.invalidRange.start, DATA.invalidRange.end);
      await p.dateEndInput.press('Tab');
      expect(await p.applyExpectingNoSearch(), 'invalid criteria not searched').toBeNull();
      const { results } = await p.reopenSearch(DATE_ENTITY);
      await recordTestValues(testInfo, { 'Valid criteria': JSON.stringify(userCriteria(valid)), 'On reopen': JSON.stringify(userCriteria(results)) });
      expect(crit(results, 'DateCreatedUtc'), 'invalid date range not stored').toBeUndefined();
      expect(userCriteria(results), 'last valid criteria still stored').toEqual(userCriteria(valid));
    } finally {
      await p.clearStoredCriteria(DATE_ENTITY).catch(() => {});
    }
  });

  test(tcTitle(c.clearAllClears), tcDetails(c.clearAllClears, MODULE), async ({ advancedSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.clearAllClears, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName, firstNameOp: 'isNotEmpty' });
    const searches = await p.searchesDuring(() => p.clearAll());
    await p.openFilters();
    const ui = { lastName: await p.textValue('LastName'), lastNameOp: await p.operatorText('LastName'), firstNameOp: await p.operatorText('FirstName') };
    await recordTestValues(testInfo, { 'After Clear All': JSON.stringify(ui), 'Searches run': searches });
    await shot(page, testInfo, 'cleared');
    expect(ui.lastName, 'Last Name cleared').toBe('');
    expect(ui.lastNameOp, 'Last Name operator back to default').toMatch(/^contains$/i);
    expect(ui.firstNameOp, 'First Name operator back to default').toMatch(/^contains$/i);
    expect(searches, 'no search runs on Clear All').toBe(0);
  });

  test(tcTitle(c.clearAllThenApply), tcDetails(c.clearAllThenApply, MODULE), async ({ advancedSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.clearAllThenApply, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    await p.clearAll();
    await p.page.waitForTimeout(2_000);
    const reopened = await p.reopenSearch(ENTITY);
    await p.clearAll();
    const res = await p.applyExpectingNoSearch();
    await recordTestValues(testInfo, { 'Reopened before Apply': JSON.stringify(userCriteria(reopened.results)), 'Apply after Clear All': res ? JSON.stringify(userCriteria(res)) : '(no search)' });
    expect(crit(reopened.results, 'LastName'), 'Clear All alone stores nothing: last Apply still restored').toMatchObject({ values: DATA.lastName });
    if (res) expect(crit(res, 'LastName'), 'Apply after Clear All sends no Last Name').toBeUndefined();
  });

  test(tcTitle(c.clearAllLabel), tcDetails(c.clearAllLabel, MODULE), async ({ advancedSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.clearAllLabel, MODULE);
    await p.openFilters();
    const label = (await p.resetButton.innerText()).trim();
    await recordTestValues(testInfo, { 'Clear command label': label });
    await expect(p.clearAllButton, '"Clear All" offered').toBeVisible({ timeout: 3_000 });
  });
});
