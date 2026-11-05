const { test, expect } = require('../fixtures/fixtures');
const { MODULE, DATA, FILTER_LABELS, SOURCES, REQUIRED_ENTITY_TYPES, MESSAGES, cases: c } = require('../testData/messageSearchData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues } = require('../utils/testCase');

/**
 * 62151 Conversation Message Search Configuration (docs/62151 Conversation Message Search Configuration.md).
 * Quick Search = top-bar search with Record Type "Message"; Advanced Search = /Search?entityId=18 + Advanced Filters drawer.
 * Read-only: nothing is created. Every search returns the JSON of POST /Search/ResultsData, so the rules are checked
 * on the rows the server returned (first page) and the cards are checked on screen.
 * Sandbox names used (Author, Account, Project, ...) are in testData/messageSearchData.js and can be overridden in .env.
 *
 * Not automated: Full Text Search vs Contains (1.1 - server configuration), date boundaries in a non-UTC profile
 * time zone (2.7 - needs a second user profile), "hide Author when System only" (2.6 - optional, not in Newton cycle),
 * permission enforcement with a restricted user (9 - needs a user without conversation access; 044 only checks
 * that every row returned is marked allowed), soft delete (8 - not supported).
 */

const msgText = r => String(r.Message ?? r.MessageText ?? '');
const msgId = r => Number(r['Record ID'] ?? r._primaryKeyValue);
const msgDay = r => String(r['Created On'] || '').slice(0, 10);
const isSystem = r => [true, 'true', 1, '1'].includes(r['Message Source']);
const ids = rows => rows.map(msgId);
const shiftDay = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const criterion = (res, fieldId) => res.criteria.find(x => String(x.fieldId).toLowerCase() === fieldId.toLowerCase());

/**
 * Application defects confirmed on the sandbox (2026-11-03). These tests are marked as expected failures so the run
 * stays green while the bug is open; Playwright reports "expected to fail but passed" as soon as the app is fixed -
 * then delete the entry. Run with SHOW_DEFECTS=true to see them as normal failures.
 */
const KNOWN_DEFECTS = {
  quickWildcard: '"%" and "_" in the search text are used as SQL LIKE wildcards (not escaped)',
  dateEndInclusive: 'End Date is exclusive - messages created on the End Date are not returned',
  dateReversed: 'the "Start must be <= End" validation message is in the page but never displayed',
  cardEntityName: 'result card has no Entity Name (ResultsData returns empty Account / Project)',
  cardHighlight: 'matched text is not highlighted in the message snippet',
  cardSystemAuthor: 'system messages have Author = null (system actor name not returned)',
  openResult: 'result link is "/SignalCenter" with no conversation / message id',
};
const knownDefect = key => test.fail(process.env.SHOW_DEFECTS !== 'true', `Known defect: ${KNOWN_DEFECTS[key]}`);

/** The search returned normally (HTTP 200, no error text). */
function expectOk(res, what = 'search') {
  expect(res.status, `${what}: HTTP status`).toBe(200);
  expect(res.error, `${what}: no error returned`).toBeNull();
}

/** Advanced Search with the given criteria; returns the ResultsData result. */
async function advancedSearch(p, crit = {}, label = 'Advanced Search') {
  return test.step(`${label}: ${JSON.stringify(crit)}`, async () => {
    await p.gotoAdvanced();
    if (crit.text) await p.setMessageText(crit.text);
    if (crit.source) await p.setMessageSource(crit.source);
    if (crit.author) await p.setAuthor(crit.author);
    if (crit.from) await p.setDateRange(crit.from, crit.to);
    if (crit.entityType) await p.setEntityType(crit.entityType);
    if (crit.account) await p.setAccountScope(crit.account);
    if (crit.project) await p.setProjectScope(crit.project);
    const res = await p.apply();
    expectOk(res, label);
    return res;
  });
}

async function quickSearch(p, text) {
  return test.step(`Quick Search "${text}"`, () => p.quickSearch(text));
}

test.describe('Message Search - Conversation Message Search Configuration (62151)', () => {
  // read-only spec, so a retry is safe: the sandbox sometimes stops answering for a few minutes (page.goto timeouts)
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ messageSearchPage }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    await messageSearchPage.gotoStart();
  });

  // ================= 1. Quick Search =================

  test(tcTitle(c.quickScope), tcDetails(c.quickScope, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickScope, MODULE);
    expect(await p.quickSearchScopes(), 'Quick Search Record Type offers "Message"').toContain('Message');
    const res = await quickSearch(p, DATA.term);
    await recordTestValues(testInfo, { search: DATA.term, 'Record Type': 'Message', Results: res.total });
    expectOk(res);
    await expect(page).toHaveURL(/\/Search\/QuickSearch\?.*entityId=18/);
    await expect(page).toHaveURL(new RegExp(`searchText=${encodeURIComponent(DATA.term)}`));
    expect(res.criteria, 'one criterion: message text contains <term>').toEqual([
      expect.objectContaining({ fieldId: expect.stringMatching(/^messageText$/i), operatorKey: 'contains', values: DATA.term }),
    ]);
    expect(res.total, 'messages found').toBeGreaterThan(0);
    await expect(p.cards.first()).toBeVisible();
    expect(await p.resultsTotal(), '"Results:" equals the total returned').toBe(res.total);
    await shot(page, testInfo, 'quick-search-results');
  });

  test(tcTitle(c.quickContains), tcDetails(c.quickContains, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickContains, MODULE);
    const res = await quickSearch(p, DATA.term);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.term, Results: res.total, 'Rows checked': res.rows.length });
    expect(res.rows.length, 'rows returned').toBeGreaterThan(0);
    const wrong = res.rows.filter(r => !msgText(r).toLowerCase().includes(DATA.term.toLowerCase()));
    expect(wrong.map(msgId), `DEFECT: messages that do not contain "${DATA.term}"`).toEqual([]);
  });

  test(tcTitle(c.quickCase), tcDetails(c.quickCase, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickCase, MODULE);
    const spellings = [DATA.term.toLowerCase(), DATA.term.toUpperCase(),
      DATA.term.split('').map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join('')];
    const results = [];
    for (const s of spellings) {
      await p.gotoStart();
      const res = await quickSearch(p, s);
      expectOk(res, s);
      results.push({ s, total: res.total, ids: ids(res.rows) });
    }
    await recordTestValues(testInfo, Object.fromEntries(results.map(r => [`"${r.s}"`, `${r.total} results`])));
    for (const r of results.slice(1)) {
      expect(r.total, `"${r.s}" total = "${results[0].s}" total`).toBe(results[0].total);
      expect(r.ids, `"${r.s}" returns the same messages`).toEqual(results[0].ids);
    }
  });

  test(tcTitle(c.quickRows), tcDetails(c.quickRows, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickRows, MODULE);
    const res = await quickSearch(p, DATA.term);
    expectOk(res);
    const list = ids(res.rows);
    await recordTestValues(testInfo, { search: DATA.term, 'Rows on page': list.length });
    expect(list.every(Number.isFinite), 'every row is a message with a Record ID').toBe(true);
    expect(new Set(list).size, 'no message appears twice').toBe(list.length);
    await expect(p.cards, 'one card per returned message').toHaveCount(res.rows.length);
    const cardIds = [];
    for (let i = 0; i < res.rows.length; i++) cardIds.push(Number((await p.cardDetails(i)).id));
    expect(cardIds, 'cards are the returned messages, in order').toEqual(list);
  });

  test(tcTitle(c.quickNoMatch), tcDetails(c.quickNoMatch, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickNoMatch, MODULE);
    const res = await quickSearch(p, DATA.noMatch);
    await recordTestValues(testInfo, { search: DATA.noMatch, Results: res.total });
    expectOk(res);
    expect(res.total, 'no messages').toBe(0);
    await expect(p.cards).toHaveCount(0);
    await expect(p.resultsError).toBeHidden();
    const shown = await p.resultsTotal();
    if (shown !== null) expect(shown, '"Results: 0"').toBe(0);
  });

  test(tcTitle(c.quickWildcard), tcDetails(c.quickWildcard, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.quickWildcard, MODULE);
    knownDefect('quickWildcard');
    const seen = {};
    for (const text of DATA.wildcards) {
      await p.gotoStart();
      const res = await test.step(`Quick Search "${text}"`, () => p.quickSearchIfRuns(text));
      expect.soft(res, `DEFECT: Quick Search "${text}" did not run`).not.toBeNull();
      if (!res) { seen[`"${text}"`] = 'no search ran'; continue; }
      expectOk(res, `"${text}"`);
      seen[`"${text}"`] = `${res.total} results`;
      const wrong = res.rows.filter(r => !msgText(r).includes(text));
      expect.soft(wrong.length, `DEFECT: "${text}" is matched as a LIKE wildcard - ${res.total} results, ${wrong.length} of the first ${res.rows.length} do not contain the literal "${text}"`).toBe(0);
    }
    await recordTestValues(testInfo, seen);
  });

  test(tcTitle(c.quickXss), tcDetails(c.quickXss, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
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
    expect(res.rows.filter(r => !msgText(r).includes(payload)).map(msgId), 'only literal matches').toEqual([]);
  });

  test(tcTitle(c.quickSql), tcDetails(c.quickSql, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickSql, MODULE);
    const payload = "' OR 1=1 --";
    const res = await quickSearch(p, payload);
    await recordTestValues(testInfo, { search: payload, Results: res.total });
    expectOk(res);
    expect(await page.locator('main').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
    expect(res.rows.filter(r => !msgText(r).includes(payload)).map(msgId), 'DEFECT: injection returned non-matching messages').toEqual([]);
  });

  test(tcTitle(c.quickEmpty), tcDetails(c.quickEmpty, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.quickEmpty, MODULE);
    await p.chooseQuickSearchScope('Message');
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

  test(tcTitle(c.advOpen), tcDetails(c.advOpen, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.advOpen, MODULE);
    await p.openAdvancedFromQuickSearch();
    await expect(page).toHaveURL(/\/Search\?entityId=18/);
    await p.openFilters();
    const labels = await p.visibleFilterLabels();
    await recordTestValues(testInfo, { 'Criteria shown': labels });
    for (const l of FILTER_LABELS) expect(labels, `"${l}" criterion`).toContain(l);
    await expect(p.applyButton).toBeVisible();
    await expect(p.resetButton).toBeVisible();
    await shot(page, testInfo, 'advanced-filters');
  });

  test(tcTitle(c.advText), tcDetails(c.advText, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.advText, MODULE);
    const quick = await quickSearch(p, DATA.term);
    expectOk(quick, 'Quick Search');
    const adv = await advancedSearch(p, { text: DATA.term });
    await recordTestValues(testInfo, { search: DATA.term, 'Quick total': quick.total, 'Advanced total': adv.total });
    expect(criterion(adv, 'MessageText'), 'Message text contains <term>').toEqual(expect.objectContaining({ operatorKey: 'contains', values: DATA.term }));
    expect(adv.total, 'same total as Quick Search').toBe(quick.total);
    expect(ids(adv.rows).slice(0, 10), 'same newest messages as Quick Search').toEqual(ids(quick.rows).slice(0, 10));
  });

  test(tcTitle(c.advEntityOptions), tcDetails(c.advEntityOptions, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.advEntityOptions, MODULE);
    await p.gotoAdvanced();
    const options = await p.dropdownOptions('EntityIDF');
    const defaultText = await p.dropdownText('EntityIDF');
    await recordTestValues(testInfo, { 'Entity type options': options, 'Default shown': defaultText });
    for (const e of REQUIRED_ENTITY_TYPES) expect(options, `"${e}" offered`).toContain(e);
    expect(await p.isMultiSelect('EntityIDF'), 'single-select control').toBe(false);
    observe(testInfo, `Default Entity type shows "${defaultText}" (spec: All)`);
    await p.setMessageText(DATA.term);
    const res = await p.apply();
    expectOk(res);
    expect(criterion(res, 'EntityIDF'), 'default (All) sends no Entity type filter').toBeUndefined();
  });

  for (const tc of [c.advEntityAccount, c.advEntityProject, c.advEntityService]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ messageSearchPage: p }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      const res = await advancedSearch(p, { entityType: tc.entityType });
      const types = [...new Set(res.rows.map(r => r['Entity Type']))];
      await recordTestValues(testInfo, { 'Entity type': tc.entityType, Results: res.total, 'Entity types returned': types });
      expect(criterion(res, 'EntityIDF'), 'Entity type criterion sent').toBeDefined();
      expect(res.total, `messages on ${tc.entityType} conversations`).toBeGreaterThan(0);
      expect(types, `only ${tc.entityType}`).toEqual([tc.entityType]);
    });
  }

  test(tcTitle(c.accountScope), tcDetails(c.accountScope, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountScope, MODULE);
    await p.gotoAdvanced();
    const accountId = await p.setAccountScope(DATA.account);
    expect(accountId, 'Account Scope resolved a specific AccountID').toMatch(/^\d+$/);
    const res = await p.apply();
    expectOk(res);
    const types = [...new Set(res.rows.map(r => r['Entity Type']))];
    await recordTestValues(testInfo, { account: `${DATA.account} (#${accountId})`, Results: res.total, 'Entity types returned': types });
    expect(criterion(res, 'RootAccountID'), 'RootAccountID = account id').toEqual(expect.objectContaining({ values: accountId }));
    expect(res.total, 'messages under the Account').toBeGreaterThan(0);
    expect(types.some(t => t !== 'Account'), 'transitive downward: objects under the Account are included').toBe(true);
  });

  test(tcTitle(c.accountNarrows), tcDetails(c.accountNarrows, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountNarrows, MODULE);
    const all = await advancedSearch(p, { text: DATA.term }, 'Text only');
    const scoped = await advancedSearch(p, { text: DATA.term, account: DATA.account }, 'Text + Account Scope');
    await recordTestValues(testInfo, { search: DATA.term, account: DATA.account, 'Text only': all.total, 'Text + Account': scoped.total });
    expect(scoped.total, 'Account Scope never adds messages').toBeLessThanOrEqual(all.total);
    expect(scoped.rows.filter(r => !msgText(r).toLowerCase().includes(DATA.term.toLowerCase())).map(msgId), 'text still applies').toEqual([]);
  });

  test(tcTitle(c.accountFreeText), tcDetails(c.accountFreeText, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.accountFreeText, MODULE);
    await p.gotoAdvanced();
    await p.typeEntityText('RootAccountID', DATA.noMatch);
    const res = await p.applyExpectingNoSearch();
    await recordTestValues(testInfo, { account: `${DATA.noMatch} (typed, not picked)`, 'Search ran': !!res });
    await expect(p.pickerError('RootAccountID'), '"Please select a value from the list"').toBeVisible();
    await expect(p.pickerError('RootAccountID')).toHaveText(MESSAGES.selectFromList);
    if (res) expect(criterion(res, 'RootAccountID'), 'free text is never sent as an Account Scope').toBeUndefined();
  });

  test(tcTitle(c.projectScope), tcDetails(c.projectScope, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.projectScope, MODULE);
    await p.gotoAdvanced();
    const projectId = await p.setProjectScope(DATA.project);
    expect(projectId, 'Project Scope resolved a specific ProjectID').toMatch(/^\d+$/);
    const res = await p.apply();
    expectOk(res);
    await recordTestValues(testInfo, { 'Project Scope': `${DATA.project} (#${projectId})`, Results: res.total });
    expect(criterion(res, 'ProjectScopeProjectID'), 'ProjectScopeProjectID = project id').toEqual(expect.objectContaining({ values: projectId }));
    expect(res.total, 'messages under the Project').toBeGreaterThan(0);
  });

  test(tcTitle(c.projectInAccount), tcDetails(c.projectInAccount, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.projectInAccount, MODULE);
    const account = await advancedSearch(p, { account: DATA.account }, 'Account only');
    const project = await advancedSearch(p, { project: DATA.project }, 'Project only');
    const both = await advancedSearch(p, { account: DATA.account, project: DATA.project }, 'Account + Project');
    await recordTestValues(testInfo, { account: DATA.account, 'Project Scope': DATA.project, 'Account only': account.total, 'Project only': project.total, 'Account + Project': both.total });
    expect(both.total, 'Account + Project = Project only').toBe(project.total);
    expect(both.total, 'Project narrows the Account').toBeLessThanOrEqual(account.total);
    expect(both.rows.filter(r => r['Entity Type'] === 'Account').map(msgId), 'Account-level messages are excluded').toEqual([]);
  });

  test(tcTitle(c.projectOtherAccount), tcDetails(c.projectOtherAccount, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.projectOtherAccount, MODULE);
    const res = await advancedSearch(p, { account: DATA.otherAccount, project: DATA.project }, 'Other Account + Project');
    await recordTestValues(testInfo, { account: DATA.otherAccount, 'Project Scope': DATA.project, Results: res.total });
    expect(res.total, 'a Project outside the Account returns nothing').toBe(0);
  });

  test(tcTitle(c.sourceSystem), tcDetails(c.sourceSystem, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.sourceSystem, MODULE);
    const res = await advancedSearch(p, { source: SOURCES.system });
    await recordTestValues(testInfo, { 'Message Source': SOURCES.system, Results: res.total });
    expect(criterion(res, 'MessageSource'), 'isSystemGenerated = 1').toEqual(expect.objectContaining({ values: '1' }));
    expect(res.total, 'system messages found').toBeGreaterThan(0);
    expect(res.rows.filter(r => !isSystem(r)).map(msgId), 'DEFECT: human messages returned').toEqual([]);
  });

  test(tcTitle(c.sourceHuman), tcDetails(c.sourceHuman, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.sourceHuman, MODULE);
    const res = await advancedSearch(p, { text: DATA.term, source: SOURCES.human });
    await recordTestValues(testInfo, { search: DATA.term, 'Message Source': SOURCES.human, Results: res.total });
    expect(criterion(res, 'MessageSource'), 'isSystemGenerated = 0').toEqual(expect.objectContaining({ values: '0' }));
    expect(res.total, 'human messages found').toBeGreaterThan(0);
    expect(res.rows.filter(isSystem).map(msgId), 'DEFECT: system messages returned').toEqual([]);
  });

  test(tcTitle(c.sourceAll), tcDetails(c.sourceAll, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.sourceAll, MODULE);
    const all = await advancedSearch(p, { text: DATA.term, source: SOURCES.all }, 'All');
    const system = await advancedSearch(p, { text: DATA.term, source: SOURCES.system }, 'System');
    const human = await advancedSearch(p, { text: DATA.term, source: SOURCES.human }, 'Human');
    await recordTestValues(testInfo, { search: DATA.term, All: all.total, System: system.total, Human: human.total });
    const sent = criterion(all, 'MessageSource');
    expect(!sent || sent.values === '' || sent.values == null, '"All" does not filter on isSystemGenerated').toBe(true);
    expect(all.total, 'All = System + Human').toBe(system.total + human.total);
  });

  test(tcTitle(c.author), tcDetails(c.author, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.author, MODULE);
    await p.gotoAdvanced();
    const personId = await p.setAuthor(DATA.author);
    expect(personId, 'Author resolved a PersonID').toMatch(/^\d+$/);
    const res = await p.apply();
    expectOk(res);
    await recordTestValues(testInfo, { Author: `${DATA.author} (#${personId})`, Results: res.total });
    expect(criterion(res, 'AuthorPersonID'), 'AuthorPersonID = person id').toEqual(expect.objectContaining({ values: personId }));
    expect(res.total, 'messages by the Author').toBeGreaterThan(0);
    const others = res.rows.filter(r => String(r.Author || '').trim().toLowerCase() !== DATA.author.toLowerCase());
    expect(others.map(r => `${msgId(r)}: ${r.Author}`), 'only the selected Author').toEqual([]);
  });

  test(tcTitle(c.authorNoSystem), tcDetails(c.authorNoSystem, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.authorNoSystem, MODULE);
    const sys = await advancedSearch(p, { author: DATA.author, source: SOURCES.system }, 'Author + Only System');
    const all = await advancedSearch(p, { author: DATA.author, source: SOURCES.all }, 'Author + All');
    await recordTestValues(testInfo, { Author: DATA.author, 'Author + System': sys.total, 'Author + All': all.total });
    expect(sys.total, 'no system messages when an Author is selected').toBe(0);
    expect(all.rows.filter(isSystem).map(msgId), 'Author + All has no system messages').toEqual([]);
  });

  test(tcTitle(c.authorFreeText), tcDetails(c.authorFreeText, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.authorFreeText, MODULE);
    await p.gotoAdvanced();
    await p.typeEntityText('AuthorPersonID', DATA.noMatch);
    const res = await p.applyExpectingNoSearch();
    await recordTestValues(testInfo, { Author: `${DATA.noMatch} (typed, not picked)`, 'Search ran': !!res });
    await expect(p.pickerError('AuthorPersonID'), '"Please select a value from the list"').toBeVisible();
    await expect(p.pickerError('AuthorPersonID')).toHaveText(MESSAGES.selectFromList);
    if (res) expect(criterion(res, 'AuthorPersonID'), 'free text is never sent as an Author').toBeUndefined();
  });

  test(tcTitle(c.dateRange), tcDetails(c.dateRange, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.dateRange, MODULE);
    const res = await advancedSearch(p, { from: DATA.dateFrom, to: DATA.dateTo });
    const days = res.rows.map(msgDay);
    await recordTestValues(testInfo, { 'Date Range': `${DATA.dateFrom} .. ${DATA.dateTo}`, Results: res.total, 'Newest / oldest on page': `${days[0]} / ${days[days.length - 1]}` });
    expect(criterion(res, 'DateCreatedUtc'), 'between start and end').toEqual(expect.objectContaining({ operatorKey: 'between', values: [DATA.dateFrom, DATA.dateTo] }));
    expect(res.total, 'messages in the range').toBeGreaterThan(0);
    expect(res.rows.filter(r => msgDay(r) < DATA.dateFrom || msgDay(r) > DATA.dateTo).map(r => `${msgId(r)}: ${r['Created On']}`), 'every message is inside the range').toEqual([]);
  });

  /**
   * Newest message matching the term and its creation day (yyyy-mm-dd). The day comes from the ISO "Created On" the
   * server returns (same value the card shows); the card's own text follows the browser locale (dd/mm or mm/dd).
   */
  async function newestMessage(p) {
    const res = await advancedSearch(p, { text: DATA.term }, 'Find the newest matching message');
    expect(res.rows.length, 'a message to test with').toBeGreaterThan(0);
    const card = await p.cardDetails(0);
    const day = msgDay(res.rows[0]);
    expect(day, 'creation date of the message').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    return { id: msgId(res.rows[0]), day, shown: card.fields['Created On'] || res.rows[0]['Created On'] };
  }

  test(tcTitle(c.dateStartInclusive), tcDetails(c.dateStartInclusive, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.dateStartInclusive, MODULE);
    const m = await newestMessage(p);
    const res = await advancedSearch(p, { text: DATA.term, from: m.day, to: shiftDay(m.day, 3) }, 'Start Date = message date');
    await recordTestValues(testInfo, { 'Message': `#${m.id} created ${m.shown}`, 'Date Range': `${m.day} .. ${shiftDay(m.day, 3)}`, Results: res.total });
    expect(ids(res.rows), `DEFECT: message #${m.id} created on the Start Date is missing`).toContain(m.id);
  });

  test(tcTitle(c.dateEndInclusive), tcDetails(c.dateEndInclusive, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.dateEndInclusive, MODULE);
    knownDefect('dateEndInclusive');
    const m = await newestMessage(p);
    const endOnly = await advancedSearch(p, { text: DATA.term, from: shiftDay(m.day, -3), to: m.day }, 'End Date = message date');
    const sameDay = await advancedSearch(p, { text: DATA.term, from: m.day, to: m.day }, 'Start Date = End Date = message date');
    await recordTestValues(testInfo, {
      'Message': `#${m.id} created ${m.shown}`,
      [`${shiftDay(m.day, -3)} .. ${m.day}`]: `${endOnly.total} results`, [`${m.day} .. ${m.day}`]: `${sameDay.total} results`,
    });
    expect.soft(ids(endOnly.rows), `DEFECT: message #${m.id} created on the End Date is missing`).toContain(m.id);
    expect.soft(ids(sameDay.rows), `DEFECT: Start = End = ${m.day} does not return message #${m.id} created that day`).toContain(m.id);
  });

  test(tcTitle(c.dateReversed), tcDetails(c.dateReversed, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.dateReversed, MODULE);
    knownDefect('dateReversed');
    await p.gotoAdvanced();
    await p.setDateRange(DATA.dateTo, DATA.dateFrom);
    const res = await p.applyExpectingNoSearch();
    const feedback = p.fieldFeedback('DateCreatedUtc');
    const feedbackText = (await feedback.count()) ? (await feedback.textContent()).trim() : '';
    const validation = await p.isVisibleWithin(p.fieldFeedback('DateCreatedUtc').filter({ visible: true }), 2_000)
      || await p.isVisibleWithin(p.anyValidationError(), 500);
    await recordTestValues(testInfo, {
      'Date Range': `${DATA.dateTo} .. ${DATA.dateFrom} (reversed)`, 'Search ran': !!res, Results: res ? res.total : '-',
      'Validation text in page': feedbackText || '-', 'Validation visible': validation,
    });
    if (res) {
      expect(res.status, 'HTTP status').toBe(200);
      expect(String(res.error || ''), 'no server error').not.toMatch(MESSAGES.serverError);
      expect(res.total, 'a reversed range returns nothing').toBe(0);
    } else {
      expect(validation, feedbackText
        ? `DEFECT: the search was blocked but its validation message "${feedbackText}" is hidden from the user`
        : 'DEFECT: the search was blocked without any validation message').toBe(true);
      expect(feedbackText, 'message explains Start must not be after End').toMatch(MESSAGES.startAfterEnd);
    }
    expect(await page.locator('main').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
  });

  test(tcTitle(c.datePresets), tcDetails(c.datePresets, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.datePresets, MODULE);
    await p.gotoAdvanced();
    const ops = await p.operatorOptions('DateCreatedUtc');
    await recordTestValues(testInfo, { 'Date operators': ops.map(o => o.text) });
    expect(ops.map(o => o.value), 'between (start / end) offered').toContain('between');
    expect(ops.filter(o => /inlast|innext|last|next|days|preset/i.test(`${o.value} ${o.text}`)).map(o => o.text), 'no relative / preset ranges').toEqual([]);
  });

  test(tcTitle(c.combined), tcDetails(c.combined, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.combined, MODULE);
    const crit = { text: DATA.term, source: SOURCES.human, author: DATA.author, entityType: 'Service', from: DATA.dateFrom, to: DATA.dateTo };
    const res = await advancedSearch(p, crit, 'All criteria');
    await recordTestValues(testInfo, { ...crit, Results: res.total });
    for (const f of ['MessageText', 'MessageSource', 'AuthorPersonID', 'EntityIDF', 'DateCreatedUtc']) expect(criterion(res, f), `${f} sent`).toBeDefined();
    expect(res.total, 'messages that meet every criterion').toBeGreaterThan(0);
    const bad = res.rows.filter(r => !msgText(r).toLowerCase().includes(DATA.term.toLowerCase()) || isSystem(r)
      || String(r.Author || '').toLowerCase() !== DATA.author.toLowerCase() || r['Entity Type'] !== 'Service'
      || msgDay(r) < DATA.dateFrom || msgDay(r) > DATA.dateTo);
    expect(bad.map(r => `${msgId(r)}: ${r.Author} / ${r['Entity Type']} / ${r['Created On']}`), 'every row meets every criterion').toEqual([]);
  });

  test(tcTitle(c.reset), tcDetails(c.reset, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.reset, MODULE);
    await p.gotoAdvanced();
    await p.setMessageText(DATA.term);
    await p.setMessageSource(SOURCES.human);
    await p.setAuthor(DATA.author);
    await p.setEntityType('Service');
    await recordTestValues(testInfo, { search: DATA.term, 'Message Source': SOURCES.human, Author: DATA.author, 'Entity type': 'Service' });
    await p.resetFilters();
    await expect(p.messageTextInput, 'Message text cleared').toHaveValue('');
    await expect(p.authorInput, 'Author cleared').toHaveValue('');
    expect(await p.dropdownText('MessageSource'), 'Message source back to default').toMatch(/select|all/i);
    expect(await p.dropdownText('EntityIDF'), 'Entity type back to default').toMatch(/select|all/i);
  });

  test(tcTitle(c.advEmpty), tcDetails(c.advEmpty, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.advEmpty, MODULE);
    await p.gotoAdvanced();
    const res = await p.applyExpectingNoSearch();
    const shownError = (await p.isVisibleWithin(p.resultsError, 2_000)) ? (await p.resultsError.innerText()).trim() : '';
    observe(testInfo, res ? `Search ran: ${res.total} results, error "${res.error || ''}"` : 'No search ran');
    await recordTestValues(testInfo, { Criteria: '(none)', 'Search ran': !!res, Message: shownError || res?.error || '-' });
    if (res) expect(res.status, 'HTTP status').toBe(200);
    expect(await page.locator('main').innerText(), 'no server error shown').not.toMatch(MESSAGES.serverError);
    await expect(p.openFiltersButton, 'page still usable').toBeVisible();
  });

  // ================= 4. ordering =================

  test(tcTitle(c.ordering), tcDetails(c.ordering, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.ordering, MODULE);
    const res = await quickSearch(p, DATA.term);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.term, 'Rows checked': res.rows.length });
    expect(res.rows.length, 'at least two rows to compare').toBeGreaterThan(1);
    const breaks = [];
    for (let i = 1; i < res.rows.length; i++) {
      const [a, b] = [res.rows[i - 1], res.rows[i]];
      const ta = Date.parse(a['Created On']); const tb = Date.parse(b['Created On']);
      if (tb > ta || (tb === ta && msgId(b) > msgId(a))) breaks.push(`#${msgId(a)} ${a['Created On']} before #${msgId(b)} ${b['Created On']}`);
    }
    expect(breaks, 'DateCreatedUtc DESC, then ConversationMessageID DESC').toEqual([]);
  });

  test(tcTitle(c.paging), tcDetails(c.paging, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.paging, MODULE);
    const page1 = await quickSearch(p, DATA.term);
    expectOk(page1, 'page 1');
    expect(page1.total, 'more than one page').toBeGreaterThan(page1.rows.length);
    const page2 = await test.step('Next page', () => p.goToNextPage());
    expectOk(page2, 'page 2');
    await recordTestValues(testInfo, { search: DATA.term, Total: page1.total, 'Page 1 rows': page1.rows.length, 'Page 2 rows': page2.rows.length, 'Page 2 start': page2.body.start });
    expect(page2.body.start, 'page 2 starts after page 1').toBe(page1.rows.length);
    expect(page2.total, 'total unchanged between pages').toBe(page1.total);
    const dup = ids(page2.rows).filter(id => ids(page1.rows).includes(id));
    expect(dup, 'no message on both pages').toEqual([]);
    const last = page1.rows[page1.rows.length - 1]; const first = page2.rows[0];
    const ok = Date.parse(first['Created On']) < Date.parse(last['Created On'])
      || (Date.parse(first['Created On']) === Date.parse(last['Created On']) && msgId(first) < msgId(last));
    expect(ok, `page 2 first (#${msgId(first)} ${first['Created On']}) sorts after page 1 last (#${msgId(last)} ${last['Created On']})`).toBe(true);
  });

  // ================= 6. display / 7. fields =================

  test(tcTitle(c.cardOnly), tcDetails(c.cardOnly, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.cardOnly, MODULE);
    const res = await quickSearch(p, DATA.term);
    expectOk(res);
    await expect(p.cardViewContainer, 'Card view shown').toBeVisible();
    await expect(p.cards.first()).toBeVisible();
    await expect(p.gridViewContainer, 'Grid view hidden').toBeHidden();
    await expect(p.customizeTableButton, 'no grid / table customisation').toBeHidden();
    const gridToggles = page.locator('main').getByRole('button', { name: /grid|table view/i }).filter({ visible: true });
    await expect(gridToggles, 'no switch to Grid view').toHaveCount(0);
    await recordTestValues(testInfo, { search: DATA.term, 'Cards shown': await p.cards.count() });
  });

  test(tcTitle(c.cardFields), tcDetails(c.cardFields, MODULE), async ({ messageSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.cardFields, MODULE);
    const res = await advancedSearch(p, { text: DATA.term, source: SOURCES.human });
    const n = Math.min(5, res.rows.length);
    expect(n, 'cards to check').toBeGreaterThan(0);
    const first = await p.cardDetails(0);
    await recordTestValues(testInfo, { search: DATA.term, 'Cards checked': n, 'First card': Object.entries(first.fields).map(([k, v]) => `${k}: ${v}`).join(' | ') });
    for (let i = 0; i < n; i++) {
      const card = await p.cardDetails(i);
      expect(card.fields['Entity Type'], `card ${i + 1}: Entity Type`).toBeTruthy();
      expect(card.message, `card ${i + 1}: message snippet`).toBeTruthy();
      expect(card.fields.Author, `card ${i + 1}: Author`).toBeTruthy();
      expect(card.fields['Created On'], `card ${i + 1}: date and time`).toMatch(/\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\D+\d{1,2}:\d{2}/);
    }
    await shot(page, testInfo, 'cards');
  });

  test(tcTitle(c.cardEntityName), tcDetails(c.cardEntityName, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.cardEntityName, MODULE);
    knownDefect('cardEntityName');
    const res = await quickSearch(p, DATA.term);
    expectOk(res);
    const card = await p.cardDetails(0);
    await recordTestValues(testInfo, { search: DATA.term, 'Card fields': Object.keys(card.fields) });
    const name = Object.entries(card.fields).find(([k]) => /entity name|^name$/i.test(k));
    expect(name && name[1], 'DEFECT: the card does not show the Entity Name (display name of the owning object)').toBeTruthy();
  });

  test(tcTitle(c.cardHighlight), tcDetails(c.cardHighlight, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.cardHighlight, MODULE);
    knownDefect('cardHighlight');
    const res = await quickSearch(p, DATA.term);
    expectOk(res);
    const n = Math.min(3, res.rows.length);
    const missing = [];
    for (let i = 0; i < n; i++) {
      const card = await p.cardDetails(i);
      if (!card.highlighted.some(h => h.toLowerCase().includes(DATA.term.toLowerCase()))) missing.push(card.id);
    }
    await recordTestValues(testInfo, { search: DATA.term, 'Cards checked': n });
    expect(missing, `DEFECT: "${DATA.term}" is not highlighted in the snippet of these messages`).toEqual([]);
  });

  test(tcTitle(c.cardSystemAuthor), tcDetails(c.cardSystemAuthor, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.cardSystemAuthor, MODULE);
    knownDefect('cardSystemAuthor');
    const res = await advancedSearch(p, { source: SOURCES.system });
    const n = Math.min(3, res.rows.length);
    expect(n, 'system messages to check').toBeGreaterThan(0);
    const authors = [];
    for (let i = 0; i < n; i++) authors.push((await p.cardDetails(i)).fields.Author || '');
    await recordTestValues(testInfo, { 'Message Source': SOURCES.system, 'Authors shown': authors.map(a => a || '(blank)') });
    expect(authors.filter(a => !a).length, 'DEFECT: system message cards do not show the system actor as Author').toBe(0);
  });

  test(tcTitle(c.openResult), tcDetails(c.openResult, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.openResult, MODULE);
    knownDefect('openResult');
    const res = await advancedSearch(p, { text: DATA.term, source: SOURCES.human });
    expect(res.rows.length, 'a result to open').toBeGreaterThan(0);
    const card = await p.cardDetails(0);
    const landing = await test.step('Click the first result', () => p.openResult(0));
    await landing.waitForTimeout(2_000);
    const url = landing.url();
    await recordTestValues(testInfo, { 'Message': `#${card.id}`, 'Landed on': url });
    await shot(landing, testInfo, 'landing-page');
    expect(url, 'left the search page').not.toMatch(/\/Search(\/QuickSearch)?\?/);
    expect(url, `DEFECT: landed on a generic page (${url}), not the parent conversation`).toMatch(/\/\d+(?:[/?#]|$)|[?&#][^=&]*=\d+/);
    const snippet = card.message.split('\n')[0].trim().slice(0, 40);
    await expect(landing.getByText(snippet, { exact: false }).first(), 'the clicked message is shown').toBeVisible({ timeout: 15_000 });
    if (landing !== p.page) await landing.close();
  });

  // ================= 9. permissions =================

  test(tcTitle(c.permission), tcDetails(c.permission, MODULE), async ({ messageSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.permission, MODULE);
    const res = await quickSearch(p, DATA.term);
    expectOk(res);
    await recordTestValues(testInfo, { search: DATA.term, 'Rows checked': res.rows.length });
    expect(res.rows.filter(r => r.IsAllowed === false).map(msgId), 'no message the user may not view').toEqual([]);
  });
});
