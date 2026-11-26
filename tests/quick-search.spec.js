const { test, expect } = require('../fixtures/fixtures');
const { MODULE, ENTITY, SCOPE, OTHER_ENTITY, NO_HISTORY_ENTITY, NO_HISTORY_SCOPE, SETTINGS, DATA, MESSAGES, cases: c } = require('../testData/quickSearchData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues, recordUrl } = require('../utils/testCase');

/**
 * 62466 CORE.Execute Quick Search (docs/62466 Execute Quick Search Use Case.md), run with Record Type "Person".
 * Only the Quick Search divergences from 62200 are tested; inherited behaviour is in advanced-search.spec.js.
 * A Quick Search is a navigation to /Search/QuickSearch?entityId&searchText&searchMode=quick, so searches are counted
 * as those page loads; an integer first calls GET /Search/PkExactMatch. History is read with
 * GET /Search/GetQuickSearchHistory (the app's own endpoint for {ModuleCode}.{Entity}.QuickSearchHistory).
 * yes now its is working
 * Not automated: CORE.SearchExecutionLog (no UI / API), the authorisation check of MF-2.5 for a record the user may not
 * open (needs a restricted record), a key of another entity (no id that exists for one entity only is guaranteed).
 */

const QUIET_MS = 4_000; // how long "no search was run" is watched for
const QUICK_URL = /\/Search\/QuickSearch\?/i;

const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const pid = r => Number(r['Record ID'] ?? r._primaryKeyValue);
const orderOf = res => (res.body.order || []).map(o => `${o.name} ${o.dir}`.toLowerCase());
const recordUrlOf = id => new RegExp(`/Person/Edit/${id}(\\b|$)`, 'i');

/** Record ID of a Person, read from a Quick Search that returns several people. */
async function personId(p) {
  return test.step('Read a Person Record ID', async () => {
    const res = await p.openQuick(ENTITY, DATA.text);
    expect(res.rows.length, `people matching "${DATA.text}" exist`).toBeGreaterThan(1);
    return pid(res.rows[0]);
  });
}

/** Manual search of `value` from an empty start page; returns { url, w } once the browser reached the outcome. */
async function manualSearch(p, value, { enter = false } = {}) {
  return test.step(`Manual Quick Search "${value}"`, async () => {
    await p.gotoStart(SCOPE);
    await p.setInputSilently(value);
    const w = p.watch();
    if (enter) await p.pressEnter(); else await p.clickSearch();
    const url = await p.waitForOutcome();
    await p.page.waitForTimeout(1_000);
    w.stop();
    return { url, w };
  });
}

/** Quick Search results page in Card view (where the sort bar is); returns the last search capture. */
async function quickInCard(p, text) {
  const res = await p.openQuick(ENTITY, text);
  const switched = await p.switchToCard();
  return switched || res;
}

test.describe('Execute Quick Search (62466)', () => {
  test.beforeEach(async ({ quickSearchPage: p }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    await p.gotoStart(SCOPE);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*').catch(() => {});
  });

  // ================= Settings =================

  test(tcTitle(c.settingsDefaults), tcDetails(c.settingsDefaults, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.settingsDefaults, MODULE);
    const s = await p.quickSettings();
    await recordTestValues(testInfo, { 'Debounce (ms)': s.debounce, 'Minimum length': s.minLength, Expected: `${SETTINGS.debounce} / ${SETTINGS.minLength}` });
    expect(s.debounce, 'CORE.Search.QuickSearchDebounceMilliseconds').toBe(SETTINGS.debounce);
    expect(s.minLength, 'CORE.Search.QuickSearchMinimumLength').toBe(SETTINGS.minLength);
  });

  // ================= MF-1: automatic Quick Search =================

  test(tcTitle(c.autoRuns), tcDetails(c.autoRuns, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.autoRuns, MODULE);
    const w = p.watch();
    await p.typeText(DATA.text, 60).catch(() => {}); // the page may navigate while typing
    await page.waitForURL(QUICK_URL, { timeout: 60_000 });
    await expect.poll(() => w.results.length, { message: 'results requested', timeout: 30_000 }).toBeGreaterThan(0);
    w.stop();
    await recordUrl(testInfo, page.url(), 'Quick Search results');
    await recordTestValues(testInfo, { Typed: DATA.text, 'Searches started': w.searches.map(s => `${s.text} @${s.t}ms`) });
    await shot(page, testInfo, 'auto-quick-search');
    expect(w.searches.length, 'a Quick Search ran without clicking').toBeGreaterThan(0);
    expect(w.searches[0].entityId, 'for the selected record type').toBe(String(ENTITY));
    expect(DATA.text.toLowerCase().startsWith(w.searches[0].text.trim().toLowerCase()), 'with the typed text').toBe(true);
  });

  test(tcTitle(c.autoUsesFullText), tcDetails(c.autoUsesFullText, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.autoUsesFullText, MODULE);
    const w = p.watch();
    await p.typeText(DATA.text, 80).catch(() => {});
    await page.waitForURL(QUICK_URL, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(SETTINGS.debounce + QUIET_MS);
    w.stop();
    await recordTestValues(testInfo, { Typed: `${DATA.text} (80 ms per key)`, 'Searches started': w.searches.map(s => `"${s.text}" @${s.t}ms`) });
    expect(w.searches.map(s => s.text), 'one Quick Search, with the full text').toEqual([DATA.text]);
  });

  test(tcTitle(c.autoWaitsDebounce), tcDetails(c.autoWaitsDebounce, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.autoWaitsDebounce, MODULE);
    const w = p.watch();
    await p.quickSearchInput.fill(DATA.text); // one input event
    const typedAt = Date.now() - w.t0;
    await page.waitForURL(QUICK_URL, { timeout: 60_000 });
    w.stop();
    const delay = w.searches.length ? w.searches[0].t - typedAt : null;
    await recordTestValues(testInfo, { 'Expected debounce (ms)': SETTINGS.debounce, 'Measured delay (ms)': delay });
    expect(delay, 'a search started').not.toBeNull();
    expect(delay, `search started >= ${SETTINGS.debounce} ms after the input`).toBeGreaterThanOrEqual(SETTINGS.debounce * 0.9);
  });

  test(tcTitle(c.belowMinLength), tcDetails(c.belowMinLength, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.belowMinLength, MODULE);
    const short = DATA.text.slice(0, Math.max(1, SETTINGS.minLength - 1));
    const w = p.watch();
    await p.typeText(short, 60).catch(() => {});
    await page.waitForTimeout(SETTINGS.debounce + QUIET_MS);
    w.stop();
    await recordTestValues(testInfo, { Typed: short, 'Minimum length': SETTINGS.minLength, 'Searches started': w.searches.map(s => s.text), URL: page.url() });
    expect(w.searches, 'no automatic Quick Search').toEqual([]);
    await expect(page, 'still on the start page').not.toHaveURL(QUICK_URL);
  });

  // ================= MF-2: manual Quick Search =================

  test(tcTitle(c.manualWithText), tcDetails(c.manualWithText, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.manualWithText, MODULE);
    const { url, w } = await manualSearch(p, DATA.text);
    await recordUrl(testInfo, url, 'Quick Search results');
    await recordTestValues(testInfo, { Entered: DATA.text, 'Searches started': w.searches.map(s => s.text), 'Results requests': w.results.length });
    expect(url, 'Quick Search results page').toMatch(QUICK_URL);
    expect(w.searches.map(s => s.text), 'searched with the entered text').toEqual([DATA.text]);
    expect(w.searches[0].entityId).toBe(String(ENTITY));
    await expect.poll(() => w.results.length, { message: 'results requested', timeout: 20_000 }).toBeGreaterThan(0);
    await shot(page, testInfo, 'manual-quick-search');
  });

  test(tcTitle(c.manualEnter), tcDetails(c.manualEnter, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.manualEnter, MODULE);
    const { url, w } = await manualSearch(p, DATA.text, { enter: true });
    await recordTestValues(testInfo, { Entered: DATA.text, 'Searches started': w.searches.map(s => s.text) });
    expect(url, 'Quick Search results page').toMatch(QUICK_URL);
    expect(w.searches.map(s => s.text), 'searched with the entered text').toEqual([DATA.text]);
  });

  test(tcTitle(c.manualEmptyHistory), tcDetails(c.manualEmptyHistory, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.manualEmptyHistory, MODULE);
    await p.openQuick(ENTITY, DATA.text);
    expect(await p.history(ENTITY), 'set-up: history holds the text').toBe(DATA.text);
    const { url, w } = await manualSearch(p, '');
    const shown = await p.inputValue();
    await recordTestValues(testInfo, { 'Stored history': DATA.text, 'Searches started': w.searches.map(s => s.text), 'Input shows': shown });
    await shot(page, testInfo, 'history-restored');
    expect(url, 'Quick Search results page').toMatch(QUICK_URL);
    expect(w.searches.map(s => s.text), 'searched with the stored criterion').toEqual([DATA.text]);
    expect(shown, 'stored criterion shown in the input').toBe(DATA.text);
  });

  test(tcTitle(c.manualEmptyNoHistory), tcDetails(c.manualEmptyNoHistory, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.manualEmptyNoHistory, MODULE);
    const stored = await p.history(NO_HISTORY_ENTITY);
    test.skip(stored !== '', `"${NO_HISTORY_SCOPE}" (entityId ${NO_HISTORY_ENTITY}) already has a Quick Search history ("${stored}") - set QS_NO_HISTORY_ENTITY_ID / QS_NO_HISTORY_SCOPE to an entity never Quick-Searched`);
    try {
      await p.selectScope(NO_HISTORY_SCOPE);
      const w = p.watch();
      const message = await p.clickSearchExpectingAlert();
      w.stop();
      await recordTestValues(testInfo, { 'Record Type': NO_HISTORY_SCOPE, Message: message || '(none)', 'Searches started': w.searches.length, URL: page.url() });
      expect(message, '"No Quick Search criterion available" shown').toMatch(MESSAGES.noCriterion);
      expect(w.searches, 'no search executed').toEqual([]);
      expect(w.results, 'no results requested').toEqual([]);
      await expect(page, 'user stays on the page').not.toHaveURL(QUICK_URL);
    } finally {
      await p.selectScope(SCOPE).catch(() => {});
    }
  });

  // ================= MF-2.5: Direct Record Match =================

  test(tcTitle(c.pkOpensRecord), tcDetails(c.pkOpensRecord, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.pkOpensRecord, MODULE);
    const id = await personId(p);
    const { url, w } = await manualSearch(p, String(id));
    await recordUrl(testInfo, url, 'Opened record');
    await recordTestValues(testInfo, { 'Record ID entered': id, 'Key lookups': w.pkCalls, 'Results pages': w.searches.length, Landed: url });
    await shot(page, testInfo, 'direct-record-load');
    expect(w.pkCalls, 'primary key checked').toContain(String(id));
    expect(url, 'record opened immediately').toMatch(recordUrlOf(id));
    expect(w.searches, 'no Quick Search results page').toEqual([]);
  });

  test(tcTitle(c.pkTrimmed), tcDetails(c.pkTrimmed, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.pkTrimmed, MODULE);
    const id = await personId(p);
    const { url, w } = await manualSearch(p, `  ${id}  `);
    await recordTestValues(testInfo, { Entered: `"  ${id}  "`, 'Key lookups': w.pkCalls, Landed: url });
    expect(w.pkCalls, 'trimmed value checked as a key').toContain(String(id));
    expect(url, 'record opened').toMatch(recordUrlOf(id));
  });

  test(tcTitle(c.pkLeadingZeros), tcDetails(c.pkLeadingZeros, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.pkLeadingZeros, MODULE);
    const id = await personId(p);
    const { url, w } = await manualSearch(p, `0${id}`);
    await recordTestValues(testInfo, { Entered: `0${id}`, 'Key lookups': w.pkCalls, Landed: url });
    expect(w.pkCalls, 'base-10 value checked as a key').toContain(String(id));
    expect(url, 'that record opened').toMatch(recordUrlOf(id));
  });

  test(tcTitle(c.pkNoMatch), tcDetails(c.pkNoMatch, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.pkNoMatch, MODULE);
    const { url, w } = await manualSearch(p, DATA.noPkMatch);
    await recordTestValues(testInfo, { Entered: DATA.noPkMatch, 'Key lookups': w.pkCalls, 'Searches started': w.searches.map(s => s.text), Landed: url });
    expect(w.pkCalls, 'primary key checked').toContain(DATA.noPkMatch);
    expect(url, 'standard Quick Search results page').toMatch(QUICK_URL);
    expect(w.searches.map(s => s.text), 'searched with the integer as text').toEqual([DATA.noPkMatch]);
  });

  test(tcTitle(c.notIntegerCandidate), tcDetails(c.notIntegerCandidate, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.notIntegerCandidate, MODULE);
    const id = await personId(p);
    const seen = {};
    for (const value of [`+${id}`, `${id}.0`, `${id}a`]) {
      const { w } = await manualSearch(p, value);
      seen[value] = { pk: w.pkCalls, searched: w.searches.map(s => s.text) };
    }
    await recordTestValues(testInfo, { Values: JSON.stringify(seen) });
    for (const [value, s] of Object.entries(seen)) {
      expect(s.pk, `"${value}": no key lookup`).toEqual([]);
      expect(s.searched, `"${value}": standard Quick Search with the text`).toEqual([value]);
    }
  });

  test(tcTitle(c.pkHistory), tcDetails(c.pkHistory, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.pkHistory, MODULE);
    const id = await personId(p); // leaves the history at DATA.text
    expect(await p.history(ENTITY), 'set-up: history holds the text').toBe(DATA.text);
    const { url } = await manualSearch(p, String(id));
    expect(url, 'set-up: record opened directly').toMatch(recordUrlOf(id));
    let stored = '';
    await expect.poll(async () => (stored = await p.history(ENTITY)), { message: 'history updated', timeout: 10_000 }).toBe(String(id)).catch(() => {});
    await recordTestValues(testInfo, { 'Record ID': id, 'History after Direct Record Load': stored });
    expect(stored, 'Direct Record Load stored as QuickSearchHistory').toBe(String(id));
  });

  test(tcTitle(c.singleTextMatch), tcDetails(c.singleTextMatch, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.singleTextMatch, MODULE);
    await p.gotoStart(SCOPE);
    await p.setInputSilently(DATA.singleMatch);
    // read the count on the way through: the page may leave before a response body could be read afterwards
    let total = null;
    await page.route(/\/Search\/ResultsData/i, async route => {
      const response = await route.fetch();
      const json = await response.json().catch(() => null);
      if (json) total = json.recordsFiltered;
      await route.fulfill({ response, json: json || undefined });
    });
    await p.clickSearch();
    await page.waitForURL(u => QUICK_URL.test(u.toString()) || /\/Edit\/\d+/i.test(u.toString()), { timeout: 60_000 });
    await expect.poll(() => total, { message: 'search answered', timeout: 30_000 }).not.toBeNull().catch(() => {});
    await page.waitForTimeout(QUIET_MS);
    await recordTestValues(testInfo, { Entered: DATA.singleMatch, Results: total, Landed: page.url() });
    await shot(page, testInfo, 'single-match');
    expect(total, `set-up: exactly one person matches "${DATA.singleMatch}" (set QS_SINGLE_MATCH_TEXT)`).toBe(1);
    await expect(page, 'results surface kept (no Direct Record Load for text)').toHaveURL(QUICK_URL);
  });

  // ================= MF-3: sort =================

  test(tcTitle(c.defaultRelevance), tcDetails(c.defaultRelevance, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.defaultRelevance, MODULE);
    const res = await quickInCard(p, DATA.text);
    const primary = await p.selectedSort('primary');
    const scores = res.rows.map(r => Number(r.RelevanceScore));
    await recordTestValues(testInfo, { 'Primary sort': primary, Order: JSON.stringify(res.body.order), 'Relevance scores': scores });
    await shot(page, testInfo, 'default-relevance');
    expect(primary, 'Relevance shown as primary sort').toBe('Relevance');
    expect(orderOf(res).filter(o => !/^relevance/.test(o)), 'no column order sent (relevance order)').toEqual([]);
  });

  test(tcTitle(c.relevanceOrder), tcDetails(c.relevanceOrder, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.relevanceOrder, MODULE);
    const seen = {};
    for (const text of [DATA.text, DATA.broadText]) {
      const res = await quickInCard(p, text);
      seen[text] = res.rows.map(r => Number(r.RelevanceScore));
    }
    await recordTestValues(testInfo, { 'Relevance scores (first page, in order shown)': JSON.stringify(seen) });
    await shot(page, testInfo, 'relevance-order');
    for (const [text, scores] of Object.entries(seen)) {
      expect(scores.length, `"${text}": results returned`).toBeGreaterThan(1);
      const outOfOrder = scores.findIndex((s, i) => i > 0 && s > scores[i - 1]);
      expect(outOfOrder, `"${text}": rows in descending RelevanceScore (first break at row ${outOfOrder}): ${scores.slice(0, 15).join(', ')}`).toBe(-1);
    }
  });

  test(tcTitle(c.relevanceOnlyQuick), tcDetails(c.relevanceOnlyQuick, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.relevanceOnlyQuick, MODULE);
    await quickInCard(p, DATA.text);
    const texts = list => list.map(o => o.text);
    const quick = { primary: texts(await p.sortOptions('primary')), secondary: texts(await p.sortOptions('secondary')) };
    await p.gotoSearch(ENTITY);
    const advanced = { primary: texts(await p.sortOptions('primary')), secondary: texts(await p.sortOptions('secondary')) };
    await recordTestValues(testInfo, { Quick: JSON.stringify(quick), Advanced: JSON.stringify(advanced) });
    expect(quick.primary, 'Quick: Relevance as primary sort').toContain('Relevance');
    expect(quick.secondary, 'Quick: Relevance as secondary sort').toContain('Relevance');
    expect(advanced.primary.length, 'Advanced: sort options read').toBeGreaterThan(1);
    expect(advanced.primary, 'Advanced: no Relevance').not.toContain('Relevance');
    expect(advanced.secondary, 'Advanced: no Relevance (secondary)').not.toContain('Relevance');
  });

  test(tcTitle(c.userSort), tcDetails(c.userSort, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.userSort, MODULE);
    const before = await quickInCard(p, DATA.text);
    try {
      const res = await p.setSort('primary', 'FullName');
      await recordTestValues(testInfo, { Order: orderOf(res), Criteria: res.body.criteriaJson === before.body.criteriaJson ? 'unchanged' : 'changed' });
      expect(orderOf(res)[0], 'ordered by Full Name').toMatch(/^fullname /);
      expect(res.body.criteriaJson, 'same Quick Search criterion').toBe(before.body.criteriaJson);
      expect(res.body.searchMode, 'still a Quick Search').toBe('quick');
      expect(res.status).toBe(200);
    } finally {
      await p.setSort('primary', 'Relevance').catch(() => {});
    }
  });

  // ================= MF-4: persistence =================

  test(tcTitle(c.historyStored), tcDetails(c.historyStored, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.historyStored, MODULE);
    const text = `${DATA.tag}h`;
    const otherBefore = await p.history(OTHER_ENTITY);
    await p.openQuick(ENTITY, text);
    const person = await p.history(ENTITY);
    const other = await p.history(OTHER_ENTITY);
    await recordTestValues(testInfo, { Searched: text, 'Person history': person, 'Project history (before / after)': `${otherBefore} / ${other}` });
    expect(person, 'criterion stored for Person').toBe(text);
    expect(other, 'other entity history unchanged').toBe(otherBefore);
  });

  test(tcTitle(c.sortStored), tcDetails(c.sortStored, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.sortStored, MODULE);
    await quickInCard(p, DATA.text);
    const w = p.watch();
    try {
      await p.setSort('primary', 'FullName');
      await p.page.waitForTimeout(3_000);
      w.stop();
      const next = await quickInCard(p, DATA.otherText);
      const primary = await p.selectedSort('primary');
      await recordTestValues(testInfo, { 'Saves sent': w.saves.length, 'Next Quick Search sort': primary, 'Next order': orderOf(next) });
      expect(w.saves.some(s => String(s.searchMode).toLowerCase() === 'quick'), 'Quick Search sort saved').toBe(true);
      expect(primary, 'next Quick Search uses the stored sort').toBe('Full Name');
    } finally {
      w.stop();
      await p.setSort('primary', 'Relevance').catch(() => {});
    }
  });

  test(tcTitle(c.independentFromAdvanced), tcDetails(c.independentFromAdvanced, MODULE), async ({ quickSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.independentFromAdvanced, MODULE);
    const unique = `${DATA.tag}i`;
    try {
      await p.gotoCleared(ENTITY);
      await p.setText('LastName', DATA.text);
      const adv = await p.apply();
      expect(adv.status, 'set-up: Advanced criteria applied').toBe(200);
      await p.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await p.openQuick(ENTITY, unique);
      const reopened = await p.reopenAdvanced(ENTITY);
      const advCriteria = reopened.criteria.filter(x => x.fieldId !== 'IsArchived');
      await p.resetFilters();
      await p.setText('LastName', DATA.otherText);
      await p.apply();
      await p.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const quickAfter = await p.history(ENTITY);
      await recordTestValues(testInfo, { 'Advanced after Quick Search': JSON.stringify(advCriteria), 'Quick history after Advanced change': quickAfter });
      expect(advCriteria, 'Advanced SearchHistory untouched by Quick Search').toEqual([{ fieldId: 'LastName', operatorKey: 'contains', values: DATA.text }]);
      expect(quickAfter, 'QuickSearchHistory untouched by Advanced Search').toBe(unique);
    } finally {
      await p.clearStoredCriteria(ENTITY).catch(() => {});
    }
  });

  // ================= MF-5: inherited result surface =================

  test(tcTitle(c.inheritsResults), tcDetails(c.inheritsResults, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.inheritsResults, MODULE);
    const first = await quickInCard(p, DATA.text);
    const grid = await p.switchToGrid();
    const gridRows = await p.shownRecordIds();
    await shot(page, testInfo, 'quick-grid');
    const card = await p.switchToCard();
    await recordTestValues(testInfo, { Results: first.total, 'Grid search': grid && grid.total, 'Card search': card && card.total, 'Grid ids': gridRows.slice(0, 10) });
    for (const [label, res] of [['Grid', grid], ['Card', card]]) {
      expect(res, `${label}: layout switch runs the search`).not.toBeNull();
      expect(res.body.criteriaJson, `${label}: same Quick Search criterion`).toBe(first.body.criteriaJson);
      expect(res.body.searchMode, `${label}: Quick Search mode kept`).toBe('quick');
      expect(res.total, `${label}: same records`).toBe(first.total);
    }
    expect(gridRows.length, 'records rendered in the grid').toBeGreaterThan(0);
    await expect(p.customizeTableButton, 'column customisation offered').toBeVisible();
  });

  // ================= AF-2 =================

  test(tcTitle(c.execFailed), tcDetails(c.execFailed, MODULE), async ({ quickSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.execFailed, MODULE);
    await page.route(/\/Search\/ResultsData/i, r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'SYS-002 Database unavailable' }) }));
    await page.goto(`/Search/QuickSearch?entityId=${ENTITY}&searchText=${encodeURIComponent(DATA.text)}&searchMode=quick`, { timeout: 60_000 });
    await page.waitForTimeout(QUIET_MS);
    const text = `${await p.resultsText()} ${(await p.toastTexts()).join(' ')}`;
    const shown = (text.match(/[^.]*(sorry|wrong|fail|error)[^.]*\./i) || [''])[0].trim();
    await recordTestValues(testInfo, { 'Simulated failure': 'ResultsData HTTP 500', 'Message shown': shown || '(none)', 'App message for CORE-175': (await p.quickMessages()).Quick_Search_Execution_Failed });
    await shot(page, testInfo, 'quick-search-failed');
    expect(await p.shownRecordIds(), 'no results shown').toEqual([]);
    expect(text, '"Quick Search execution failed." shown').toMatch(MESSAGES.execFailed);
  });
});
