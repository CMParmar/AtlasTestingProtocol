const { test, expect } = require('../fixtures/fixtures');
const { LAYOUT } = require('../pages/search/searchResultsConfigPage');
const { MODULE, ENTITY, OTHER_ENTITY, COL, BASELINE, SEARCH_PAGES, CARD_ONLY_PAGES, UNPERMITTED_FIELD, MESSAGES, cases: c } = require('../testData/searchResultsConfigData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues, recordUrl } = require('../utils/testCase');

/**
 * 62281 Configure Search Results (docs/62281 Configure Search Results.md).
 * Runs on the Person search page (/Search?entityId=9): Card / Data Grid toggle, Customise Table View drawer, sort bar
 * and column-heading sorting. Preferences are read and written through the app's own endpoints
 * (GET /Search/GetColumnPreferences, POST /Search/SaveColumnPreferences); the user's Person preferences are put back
 * to BASELINE before and after every test so the run does not leak into other specs.
 *
 * Not automated: the Setting table itself (SettingKey "[Module].[Entity].SearchResult" - no UI / API exposes the row;
 * covered through the preferences endpoints), revoking a real list permission mid-session (MF-2 / A-1 are covered by
 * storing a field the user cannot list), and a real database outage (A-2 is simulated by failing the save request).
 */

const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const visibleTitles = prefs => (prefs.columns || [])
  .filter(col => col.isVisible && col.fieldKey !== 'editAction')
  .sort((a, b) => a.displayOrder - b.displayOrder)
  .map(col => col.customName || col.title);
const keys = prefs => (prefs.columns || []).map(col => col.fieldKey);
const withCols = (changes, sort = BASELINE.sort) => ({
  columns: BASELINE.columns.map(col => ({ ...col, ...(changes[col.fieldKey] || {}) })),
  sort,
});
const sortOf = (primary, pDir = 'ASC', secondary = null, sDir = null) => ({
  primary: { fieldName: primary, direction: pDir }, secondary: { fieldName: secondary, direction: sDir },
});
/** Requested order as "field dir" strings, e.g. ['primaryemail asc', 'FullName asc']. */
const orderOf = res => (res.body.order || []).map(o => `${o.name} ${o.dir}`.toLowerCase());

/**
 * Sort check that tolerates collation differences (spaces, quotes, case): compares the first letter / digit of each
 * value, empty values ignored. Returns the out-of-order pairs (empty = sorted).
 */
function sortViolations(values, dir = 'asc') {
  const key = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').charAt(0);
  const vals = values.map(v => [v, key(v)]).filter(([, k]) => k);
  const bad = [];
  for (let i = 1; i < vals.length; i++) {
    const cmp = vals[i - 1][1].localeCompare(vals[i][1]);
    if (dir === 'asc' ? cmp > 0 : cmp < 0) bad.push(`"${vals[i - 1][0]}" before "${vals[i][0]}"`);
  }
  return bad;
}
const ascendingNumbers = nums => nums.every((n, i) => i === 0 || nums[i - 1] <= n);

/** Puts the user's Person grid + card preferences back to BASELINE. */
async function restoreBaseline(p) {
  for (const layout of [LAYOUT.GRID, LAYOUT.CARD]) {
    const r = await p.savePrefs(ENTITY, BASELINE, layout);
    expect(r.status, `restore baseline (layout ${layout})`).toBe(200);
  }
}

/** Stores `prefs` for the Person grid and reopens the page in Data Grid view. */
async function openWith(p, prefs) {
  return test.step(`Store preferences and open the search: ${JSON.stringify(prefs.sort)}`, async () => {
    const r = await p.savePrefs(ENTITY, prefs);
    expect(r.status, 'SaveColumnPreferences (set-up)').toBe(200);
    let opened = await p.gotoSearch(ENTITY);
    if (await p.isCardView()) {
      await p.switchToGrid();
      opened = await p.gotoSearch(ENTITY);
    }
    return opened;
  });
}

test.describe('Configure Search Results (62281)', () => {
  test.beforeEach(async ({ searchResultsConfigPage: p }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    await p.gotoSearch(ENTITY);
    await restoreBaseline(p);
    await p.gotoSearch(ENTITY);
    if (await p.isCardView()) await p.switchToGrid();
  });

  test.afterEach(async ({ searchResultsConfigPage: p, page }) => {
    await page.unroute('**/*').catch(() => {});
    await p.gotoSearch(ENTITY).catch(() => {});
    if (await p.isCardView().catch(() => false)) await p.switchToGrid().catch(() => {});
    await restoreBaseline(p).catch(() => {});
  });

  // ================= MF-1 / MF-2 / A-1: loading preferences & permissions =================

  test(tcTitle(c.loadPrefs), tcDetails(c.loadPrefs, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.loadPrefs, MODULE);
    const stored = withCols({
      primaryemail: { displayOrder: 1 }, recordId: { displayOrder: 0 }, jobtitle: { isVisible: false },
    }, sortOf('displayName', 'ASC'));
    const { prefs, prefsUrl } = await openWith(p, stored);
    await recordTestValues(testInfo, { 'Stored columns': visibleTitles(prefs), 'Stored primary sort': 'Display Name ASC' });
    await recordUrl(testInfo, page.url(), 'Search page');
    expect(prefsUrl, 'preferences requested for this page\'s entity').toMatch(new RegExp(`entityId=${ENTITY}\\b`));
    expect(prefs.success, 'GetColumnPreferences succeeded').toBe(true);
    expect(visibleTitles(prefs).slice(0, 2), 'loaded preferences keep the stored order').toEqual([COL.primaryemail, COL.FullName]);
    expect(await p.headerTitles(), 'grid headings = stored visible columns, stored order').toEqual(visibleTitles(prefs));
    expect(await p.headerTitles(), 'hidden column not shown').not.toContain(COL.jobtitle);
    expect(await p.primarySortTitle(), 'stored primary sort marked on its heading').toBe(COL.displayName);
    await shot(page, testInfo, 'stored-preferences-loaded');
  });

  test(tcTitle(c.dropUnpermitted), tcDetails(c.dropUnpermitted, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.dropUnpermitted, MODULE);
    const stored = { ...BASELINE, columns: [...BASELINE.columns, { fieldKey: UNPERMITTED_FIELD, isVisible: true, displayOrder: 2 }] };
    const save = await p.savePrefs(ENTITY, stored);
    await recordTestValues(testInfo, { 'Stored field without permission': UNPERMITTED_FIELD, 'Save HTTP': save.status });
    const { prefs, results } = await p.gotoSearch(ENTITY);
    expect(keys(prefs), 'unpermitted field dropped from the loaded preferences').not.toContain(UNPERMITTED_FIELD);
    expect(results.error, 'search runs without an error').toBeNull();
    await expect(p.resultsError, 'no error shown').toBeHidden();
    const headings = await p.headerTitles();
    expect(headings.join('|'), 'grid does not show the field').not.toMatch(/secret/i);
    expect(headings, 'permitted columns still shown').toEqual(expect.arrayContaining([COL.FullName, COL.primaryemail]));
  });

  test(tcTitle(c.availableOnlyPermitted), tcDetails(c.availableOnlyPermitted, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.availableOnlyPermitted, MODULE);
    await p.savePrefs(ENTITY, { ...BASELINE, columns: [...BASELINE.columns, { fieldKey: UNPERMITTED_FIELD, isVisible: true, displayOrder: 3 }] });
    const { prefs } = await p.gotoSearch(ENTITY);
    await p.openCustomize();
    const available = await p.availableColumns();
    await recordTestValues(testInfo, { 'Available columns': available.map(a => a.label) });
    expect(available.map(a => a.key).sort(), 'drawer lists exactly the permitted fields').toEqual(keys(prefs).sort());
    expect(available.map(a => a.key), 'unpermitted field not offered').not.toContain(UNPERMITTED_FIELD);
    await p.closeCustomize();
    await p.switchToCard();
    for (const which of ['primary', 'secondary']) {
      const opts = (await p.sortOptions(which)).map(o => o.value).filter(Boolean);
      expect(opts, `${which} sort does not offer the unpermitted field`).not.toContain(UNPERMITTED_FIELD);
    }
  });

  test(tcTitle(c.parentFields), tcDetails(c.parentFields, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.parentFields, MODULE);
    await p.gotoSearch(OTHER_ENTITY);
    await p.openCustomize();
    const available = await p.availableColumns();
    await recordTestValues(testInfo, { 'Project search columns': available.map(a => a.label) });
    await recordUrl(testInfo, page.url(), 'Project search');
    expect(available.filter(a => /^account/i.test(a.key) || /^account/i.test(a.label)).map(a => a.label),
      'parent (Account) fields offered').not.toHaveLength(0);
    expect(available.filter(a => /project/i.test(a.key)).length, 'Project\'s own fields offered').toBeGreaterThan(0);
  });

  // ================= MF-3 / MF-4: views =================

  test(tcTitle(c.viewCard), tcDetails(c.viewCard, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.viewCard, MODULE);
    const res = await p.switchToCard();
    await recordTestValues(testInfo, { View: 'Card', Results: res.total, 'Cards shown': await p.cards.count() });
    expect(res.body.layoutId, 'results requested with the card layout').toBe(LAYOUT.CARD);
    await expect(p.cardViewContainer).toBeVisible();
    await expect(p.gridViewContainer).toBeHidden();
    await expect(p.cards.first()).toBeVisible();
    expect(await p.cards.count(), 'one card per row returned').toBe(res.rows.length);
    const first = await p.cardDetails(0);
    expect(first.title, 'card has a title').not.toBe('');
    expect(first.id, 'card has its edit action').not.toBe('');
    await shot(page, testInfo, 'card-view');
  });

  test(tcTitle(c.viewGrid), tcDetails(c.viewGrid, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.viewGrid, MODULE);
    const { prefs } = await openWith(p, withCols({ jobtitle: { isVisible: false } }));
    await p.switchToCard();
    const res = await p.switchToGrid();
    await recordTestValues(testInfo, { View: 'Data Grid', 'Stored columns': visibleTitles(prefs) });
    expect(res.body.layoutId, 'results requested with the grid layout').toBe(LAYOUT.GRID);
    await expect(p.gridViewContainer).toBeVisible();
    await expect(p.cardViewContainer).toBeHidden();
    expect(await p.headerTitles(), 'grid shows the stored columns').toEqual(visibleTitles(prefs));
    expect(await p.headerTitles()).not.toContain(COL.jobtitle);
    await shot(page, testInfo, 'grid-view');
  });

  test(tcTitle(c.viewPersist), tcDetails(c.viewPersist, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.viewPersist, MODULE);
    await p.switchToCard();
    await p.gotoSearch(ENTITY);
    const cardKept = await p.isCardView();
    await expect(p.cardViewContainer, 'Card view kept after reopening').toBeVisible();
    await p.switchToGrid();
    await p.gotoSearch(ENTITY);
    await recordTestValues(testInfo, { 'Card kept': cardKept, 'Grid kept': await p.gridViewRadio.isChecked() });
    await expect(p.gridViewContainer, 'Grid view kept after reopening').toBeVisible();
  });

  test(tcTitle(c.cardFixedLayout), tcDetails(c.cardFixedLayout, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.cardFixedLayout, MODULE);
    // a person with an email, taken from the grid before Email is hidden
    const emails = await p.columnValues(COL.primaryemail);
    const ids = await p.shownRecordIds();
    const i = emails.findIndex(Boolean);
    test.skip(i < 0, 'no person with an email on the first page');
    await openWith(p, withCols({ primaryemail: { isVisible: false } }));
    expect(await p.headerTitles(), 'Email hidden in the grid').not.toContain(COL.primaryemail);
    await p.switchToCard();
    const card = p.cards.filter({ has: page.locator(`[data-primary-key="${ids[i]}"]`) }).first();
    await recordTestValues(testInfo, { 'Hidden grid column': COL.primaryemail, Person: ids[i], Email: emails[i] });
    await expect(card, 'the same person is shown as a card').toBeVisible();
    await expect(card, 'card still shows the email (fixed layout)').toContainText(emails[i], { ignoreCase: true });
    await shot(page, testInfo, 'card-layout-unchanged');
  });

  // ================= MF-5: add / remove columns =================

  test(tcTitle(c.removeColumn), tcDetails(c.removeColumn, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.removeColumn, MODULE);
    expect(await p.headerTitles(), 'Job Title shown before').toContain(COL.jobtitle);
    await p.openCustomize();
    await p.setColumnVisible('jobtitle', false);
    const saved = await p.saveView();
    expect(saved, 'Save View sends SaveColumnPreferences').not.toBeNull();
    await recordTestValues(testInfo, { Removed: COL.jobtitle, 'Save HTTP': saved.status, Response: saved.response && saved.response.message });
    expect(saved.status).toBe(200);
    expect(saved.request.columns.find(x => x.fieldKey === 'jobtitle').isVisible, 'stored as hidden').toBe(false);
    expect((await p.toastTexts()).join(' | '), 'success message').toMatch(MESSAGES.saved);
    await expect.poll(() => p.headerTitles(), { message: 'heading removed' }).not.toContain(COL.jobtitle);
    await p.gotoSearch(ENTITY);
    expect(await p.headerTitles(), 'still removed after reopening').not.toContain(COL.jobtitle);
    await shot(page, testInfo, 'column-removed');
  });

  test(tcTitle(c.addColumn), tcDetails(c.addColumn, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.addColumn, MODULE);
    expect(await p.headerTitles(), 'Record ID not shown before').not.toContain(COL.recordId);
    await p.openCustomize();
    await p.setColumnVisible('recordId', true);
    const saved = await p.saveView();
    expect(saved, 'Save View sends SaveColumnPreferences').not.toBeNull();
    await recordTestValues(testInfo, { Added: COL.recordId, 'Save HTTP': saved.status });
    expect(saved.request.columns.find(x => x.fieldKey === 'recordId').isVisible, 'stored as visible').toBe(true);
    await expect.poll(() => p.headerTitles(), { message: 'heading added' }).toContain(COL.recordId);
    await p.gotoSearch(ENTITY);
    expect(await p.headerTitles(), 'still shown after reopening').toContain(COL.recordId);
    await shot(page, testInfo, 'column-added');
  });

  test(tcTitle(c.retainOne), tcDetails(c.retainOne, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.retainOne, MODULE);
    const before = await p.headerTitles();
    await p.openCustomize();
    await p.uncheckAllColumns();
    const saved = await p.saveView(6_000);
    const status = (await p.customizeStatus.innerText()).trim();
    await recordTestValues(testInfo, { Action: 'Untick every column, Save View', Message: status, 'Save request sent': !!saved });
    expect(status, 'validation message').toMatch(MESSAGES.retainOne);
    expect(saved, 'nothing is saved').toBeNull();
    await p.closeCustomize();
    expect(await p.headerTitles(), 'grid keeps its columns').toEqual(before);
    expect(visibleTitles(await p.getPrefs(ENTITY)), 'stored preferences unchanged').toEqual(before);
    await shot(page, testInfo, 'retain-one-column');
  });

  // ================= MF-6 / MF-7 =================

  test(tcTitle(c.reorder), tcDetails(c.reorder, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.reorder, MODULE);
    await p.openCustomize();
    await p.dragColumnTo('primaryemail', 'FullName');
    const order = await p.orderedKeys();
    expect(order.indexOf('primaryemail'), 'Email moved above Full Name in the list').toBeLessThan(order.indexOf('FullName'));
    const saved = await p.saveView();
    expect(saved, 'Save View sends SaveColumnPreferences').not.toBeNull();
    const pos = k => saved.request.columns.find(x => x.fieldKey === k).displayOrder;
    await recordTestValues(testInfo, { 'New order': order.map(k => COL[k] || k), 'Save HTTP': saved.status });
    expect(pos('primaryemail'), 'stored order: Email before Full Name').toBeLessThan(pos('FullName'));
    const heads = () => p.headerTitles();
    await expect.poll(async () => { const h = await heads(); return h.indexOf(COL.primaryemail) < h.indexOf(COL.FullName); }, { message: 'grid reordered' }).toBe(true);
    await p.gotoSearch(ENTITY);
    const h = await heads();
    expect(h.indexOf(COL.primaryemail), 'order kept after reopening').toBeLessThan(h.indexOf(COL.FullName));
    await shot(page, testInfo, 'columns-reordered');
  });

  test(tcTitle(c.resizeWidth), tcDetails(c.resizeWidth, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.resizeWidth, MODULE);
    const saves = p.watchSaves();
    const before = await p.columnWidth(COL.displayName);
    const handles = await p.columnResizers.count();
    await p.dragColumnEdge(COL.displayName, 120);
    await p.page.waitForTimeout(1_500);
    const after = await p.columnWidth(COL.displayName);
    await recordTestValues(testInfo, { Column: COL.displayName, 'Width before': before, 'Width after drag': after, 'Resize handles': handles });
    expect(handles, 'columns have a resize handle').toBeGreaterThan(0);
    expect(after, 'width changes after dragging the edge').toBeGreaterThan(before + 40);
    expect(saves.length, 'width change saved').toBeGreaterThan(0);
    const stored = (saves[saves.length - 1].columns || []).find(x => x.fieldKey === 'displayName');
    expect(stored && stored.width, 'stored width').toBeGreaterThan(before);
  });

  // ================= MF-8: sort bar =================

  test(tcTitle(c.sortOptions), tcDetails(c.sortOptions, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.sortOptions, MODULE);
    const prefs = await p.getPrefs(ENTITY);
    await p.switchToCard();
    await expect(p.sortBarPrimary, 'sort bar shown in Card view').toBeVisible();
    const primary = await p.sortOptions('primary');
    const secondary = await p.sortOptions('secondary');
    await recordTestValues(testInfo, { 'Primary options': primary.map(o => o.text), 'Secondary options': secondary.map(o => o.text) });
    const permitted = keys(prefs).map(k => k.toLowerCase());
    for (const o of [...primary, ...secondary].filter(x => x.value)) {
      expect(permitted, `"${o.text}" (${o.value}) is a permitted field`).toContain(o.value.toLowerCase());
    }
    expect(secondary.map(o => o.text), 'secondary sort is optional').toContain('None');
  });

  test(tcTitle(c.sortBarApply), tcDetails(c.sortBarApply, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.sortBarApply, MODULE);
    await p.switchToCard();
    const res = await p.toggleSortDirection('primary');
    const titles = await p.cardTitles();
    await recordTestValues(testInfo, { 'Requested order': orderOf(res), 'First cards': titles.slice(0, 5) });
    expect(orderOf(res)[0], 'Full Name DESC requested').toBe('fullname desc');
    expect(sortViolations(titles, 'desc'), 'cards ordered Z -> A').toEqual([]);
    await shot(page, testInfo, 'sorted-desc');
  });

  test(tcTitle(c.sortBarSaved), tcDetails(c.sortBarSaved, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.sortBarSaved, MODULE);
    await p.switchToCard();
    const saves = p.watchSaves();
    await p.setSort('primary', 'primaryemail');
    await p.setSort('secondary', 'displayName');
    await p.page.waitForTimeout(2_000);
    const stored = (await p.getPrefs(ENTITY, LAYOUT.CARD)).sort;
    await p.gotoSearch(ENTITY);
    const shown = { primary: await p.selectedSort('primary'), secondary: await p.selectedSort('secondary') };
    await recordTestValues(testInfo, { 'Save requests': saves.length, 'Stored sort': JSON.stringify(stored), 'Shown after reopening': JSON.stringify(shown) });
    expect(saves.length, 'sort change saved (SaveColumnPreferences)').toBeGreaterThan(0);
    expect(stored.primary.fieldName, 'stored primary').toMatch(/primaryemail/i);
    expect(stored.secondary.fieldName, 'stored secondary').toMatch(/displayName/i);
    expect(shown, 'sort kept after reopening').toEqual({ primary: COL.primaryemail, secondary: COL.displayName });
  });

  test(tcTitle(c.sortBothViews), tcDetails(c.sortBothViews, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.sortBothViews, MODULE);
    await openWith(p, withCols({}, sortOf('FullName', 'DESC')));
    const gridNames = await p.columnValues(COL.FullName);
    const gridIds = await p.shownRecordIds();
    await p.switchToCard();
    const cardIds = await p.shownRecordIds();
    await recordTestValues(testInfo, { 'Stored sort': 'Full Name DESC', 'Grid first': gridNames.slice(0, 5), 'Cards first': (await p.cardTitles()).slice(0, 5) });
    expect(sortViolations(gridNames, 'desc'), 'grid ordered Z -> A').toEqual([]);
    expect(sortViolations(await p.cardTitles(), 'desc'), 'cards ordered Z -> A').toEqual([]);
    expect(cardIds.slice(0, 20), 'cards show the same records in the same order').toEqual(gridIds.slice(0, 20));
    await shot(page, testInfo, 'card-sorted-desc');
  });

  // ================= MF-8.5: column heading click =================

  test(tcTitle(c.headerPrimary), tcDetails(c.headerPrimary, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.headerPrimary, MODULE);
    const res = await p.clickHeader(COL.primaryemail);
    const emails = await p.columnValues(COL.primaryemail);
    await recordTestValues(testInfo, { Clicked: COL.primaryemail, 'Requested order': orderOf(res), 'Primary heading': await p.primarySortTitle() });
    expect(orderOf(res).slice(0, 2), 'Email ASC primary, Full Name ASC secondary').toEqual(['primaryemail asc', 'fullname asc']);
    expect(await p.primarySortTitle(), 'Email heading marked as primary sort').toBe(COL.primaryemail);
    expect(sortViolations(emails, 'asc'), 'rows ordered by email A -> Z').toEqual([]);
    await shot(page, testInfo, 'heading-sort');
  });

  test(tcTitle(c.headerInvert), tcDetails(c.headerInvert, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.headerInvert, MODULE);
    const first = await p.clickHeader(COL.primaryemail);
    const second = await p.clickHeader(COL.primaryemail);
    await recordTestValues(testInfo, { 'First click': orderOf(first), 'Second click': orderOf(second) });
    expect(orderOf(second)[0], 'primary inverted to DESC').toBe('primaryemail desc');
    expect(orderOf(second).slice(1), 'secondary unchanged').toEqual(orderOf(first).slice(1));
    expect(await p.headerSort(COL.primaryemail), 'heading shows descending').toBe('descending');
  });

  test(tcTitle(c.headerSecondaryDir), tcDetails(c.headerSecondaryDir, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.headerSecondaryDir, MODULE);
    await openWith(p, withCols({}, sortOf('FullName', 'DESC')));
    const res = await p.clickHeader(COL.primaryemail);
    await recordTestValues(testInfo, { 'Stored sort': 'Full Name DESC', 'Requested order': orderOf(res) });
    expect(orderOf(res).slice(0, 2), 'Email ASC primary, Full Name keeps DESC as secondary').toEqual(['primaryemail asc', 'fullname desc']);
  });

  test(tcTitle(c.headerSaved), tcDetails(c.headerSaved, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.headerSaved, MODULE);
    const saves = p.watchSaves();
    await p.clickHeader(COL.primaryemail);
    await p.page.waitForTimeout(2_000);
    const stored = (await p.getPrefs(ENTITY)).sort;
    await p.gotoSearch(ENTITY);
    const primaryAfter = await p.primarySortTitle();
    await recordTestValues(testInfo, { 'Save requests': saves.length, 'Stored sort': JSON.stringify(stored), 'Primary heading after reopening': primaryAfter });
    expect(saves.length, 'sort change saved (SaveColumnPreferences)').toBeGreaterThan(0);
    expect(stored.primary, 'stored primary').toEqual({ fieldName: expect.stringMatching(/primaryemail/i), direction: 'ASC' });
    expect(stored.secondary.fieldName, 'stored secondary = old primary').toMatch(/FullName/i);
    expect(primaryAfter, 'Email still primary after reopening').toBe(COL.primaryemail);
  });

  // ================= MF-9 =================

  test(tcTitle(c.executeSearch), tcDetails(c.executeSearch, MODULE), async ({ searchResultsConfigPage: p, personSearchPage: ps, page }, testInfo) => {
    await applyAllureLabels(c.executeSearch, MODULE);
    const onlyNameEmail = Object.fromEntries(BASELINE.columns.map(col => [col.fieldKey, { isVisible: ['FullName', 'primaryemail', 'editAction'].includes(col.fieldKey) }]));
    await openWith(p, withCols(onlyNameEmail, sortOf('FullName', 'DESC')));
    await ps.gotoAdvanced();
    await ps.setText('LastName', 'a');
    const res = await ps.apply();
    const names = await p.columnValues(COL.FullName);
    await recordTestValues(testInfo, { Search: 'Last Name contains "a"', Results: res.total, Columns: await p.headerTitles(), 'First rows': names.slice(0, 5) });
    expect(res.error, 'search ran').toBeNull();
    expect(res.total, 'people found').toBeGreaterThan(0);
    expect(await p.headerTitles(), 'stored columns used').toEqual([COL.FullName, COL.primaryemail]);
    expect(sortViolations(names, 'desc'), 'stored sort used (Z -> A)').toEqual([]);
    const wrong = res.rows.filter(r => !/a/i.test(String(r['Full Name'] || '')));
    expect(wrong.map(r => r['Full Name']), 'every row matches the search').toEqual([]);
    await shot(page, testInfo, 'search-with-preferences');
  });

  // ================= alternate flows =================

  test(tcTitle(c.saveFailure), tcDetails(c.saveFailure, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.saveFailure, MODULE);
    await p.failSaves();
    await p.openCustomize();
    await p.setColumnVisible('jobtitle', false);
    const saved = await p.saveView();
    const toasts = await p.toastTexts();
    await recordTestValues(testInfo, { 'Simulated failure': 'HTTP 500 SYS-002 Database unavailable', 'Save HTTP': saved && saved.status, Toasts: toasts });
    expect(saved && saved.status, 'save attempted and failed').toBe(500);
    expect(toasts.join(' | '), 'error toast shown').toMatch(/error|unavailable|SYS-002|fail/i);
    expect(toasts.join(' | '), 'no success message').not.toMatch(MESSAGES.saved);
    await shot(page, testInfo, 'save-failed');
    await page.unroute('**/Search/SaveColumnPreferences');
    await p.gotoSearch(ENTITY);
    expect(await p.headerTitles(), 'preferences not saved: Job Title still shown').toContain(COL.jobtitle);
  });

  test(tcTitle(c.saveFailureMessage), tcDetails(c.saveFailureMessage, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.saveFailureMessage, MODULE);
    await p.failSaves();
    await p.openCustomize();
    await p.setColumnVisible('jobtitle', false);
    await p.saveView();
    const toasts = await p.toastTexts();
    await recordTestValues(testInfo, { Toasts: toasts });
    expect(toasts.join(' | '), 'toast names SYS-002 Database unavailable').toMatch(MESSAGES.dbUnavailable);
  });

  test(tcTitle(c.noSort), tcDetails(c.noSort, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.noSort, MODULE);
    const { prefs } = await openWith(p, withCols({}, null));
    const ids = await p.shownRecordIds();
    await recordTestValues(testInfo, { 'Stored sort': 'none (null)', 'Loaded sort': JSON.stringify(prefs.sort), 'First record IDs': ids.slice(0, 10) });
    expect(ids.length, 'records shown').toBeGreaterThan(1);
    expect(ascendingNumbers(ids), `records in ascending primary-key order (got ${ids.slice(0, 10).join(', ')} ...)`).toBe(true);
    await shot(page, testInfo, 'no-sort-default');
  });

  test(tcTitle(c.zeroColumns), tcDetails(c.zeroColumns, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.zeroColumns, MODULE);
    const allHidden = Object.fromEntries(BASELINE.columns.map(col => [col.fieldKey, { isVisible: false }]));
    const save = await p.savePrefs(ENTITY, withCols(allHidden));
    await p.gotoSearch(ENTITY);
    if (await p.isCardView()) await p.switchToGrid();
    const headings = await p.headerTitles();
    await recordTestValues(testInfo, { 'Stored visible columns': 0, 'Save HTTP': save.status, 'Headings shown': headings });
    await shot(page, testInfo, 'zero-columns');
    await expect(p.gridViewContainer, 'grid shown').toBeVisible();
    expect(headings, 'default column set shown').toEqual(expect.arrayContaining([COL.FullName, COL.displayName, COL.primaryemail]));
  });

  test(tcTitle(c.resetColumns), tcDetails(c.resetColumns, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.resetColumns, MODULE);
    await openWith(p, withCols({ jobtitle: { isVisible: false }, displayName: { isVisible: false } }));
    let prompt = '';
    page.once('dialog', d => { prompt = d.message(); });
    await p.openCustomize();
    const defaults = await p.resetToDefault(true);
    await recordTestValues(testInfo, { Prompt: prompt, 'Default columns': defaults && defaults.columns.map(x => `${x.title}${x.isVisible ? '' : ' (hidden)'}`) });
    expect(prompt, 'confirmation asked').toMatch(MESSAGES.resetConfirm);
    expect(defaults && defaults.success, 'defaults loaded').toBe(true);
    const direct = defaults.columns.filter(x => x.fieldKey !== 'editAction');
    expect(direct.filter(x => !x.isVisible).map(x => x.title), 'every direct field visible').toEqual([]);
    await expect.poll(() => p.headerTitles(), { message: 'grid shows every direct field' }).toEqual(visibleTitles(defaults));
    await shot(page, testInfo, 'reset-to-default');
  });

  test(tcTitle(c.resetSort), tcDetails(c.resetSort, MODULE), async ({ searchResultsConfigPage: p, page }, testInfo) => {
    await applyAllureLabels(c.resetSort, MODULE);
    await p.openCustomize();
    const defaults = await p.resetToDefault(true);
    await p.closeCustomize();
    await p.gotoSearch(ENTITY);
    const ids = await p.shownRecordIds();
    await recordTestValues(testInfo, { 'Default sort': JSON.stringify(defaults && defaults.sort), 'First record IDs': ids.slice(0, 10) });
    expect(defaults.sort.primary.fieldName, 'default primary sort = primary key').toMatch(/^(recordId|PersonID|Id)$/i);
    expect(ascendingNumbers(ids), 'records in ascending primary-key order').toBe(true);
  });

  test(tcTitle(c.resetCancel), tcDetails(c.resetCancel, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.resetCancel, MODULE);
    await openWith(p, withCols({ jobtitle: { isVisible: false } }));
    await p.openCustomize();
    const defaults = await p.resetToDefault(false);
    await p.closeCustomize();
    await recordTestValues(testInfo, { Prompt: 'dismissed', 'Defaults loaded': !!defaults });
    expect(defaults, 'no default preferences loaded').toBeNull();
    expect(await p.headerTitles(), 'Job Title still hidden').not.toContain(COL.jobtitle);
    await p.gotoSearch(ENTITY);
    expect(await p.headerTitles(), 'still hidden after reopening').not.toContain(COL.jobtitle);
  });

  // ================= scope =================

  test(tcTitle(c.perPage), tcDetails(c.perPage, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.perPage, MODULE);
    const snap = prefs => JSON.stringify({ cols: (prefs.columns || []).map(x => [x.fieldKey, x.isVisible, x.displayOrder]), sort: prefs.sort });
    const before = await p.getPrefs(OTHER_ENTITY);
    await p.openCustomize();
    await p.setColumnVisible('jobtitle', false);
    await p.dragColumnTo('primaryemail', 'FullName');
    const saved = await p.saveView();
    expect(saved && saved.status, 'Person preferences saved').toBe(200);
    const after = await p.getPrefs(OTHER_ENTITY);
    await recordTestValues(testInfo, { 'Changed page': SEARCH_PAGES[ENTITY], 'Checked page': SEARCH_PAGES[OTHER_ENTITY] });
    expect(snap(after), `${SEARCH_PAGES[OTHER_ENTITY]} preferences unchanged`).toBe(snap(before));
    expect(visibleTitles(await p.getPrefs(ENTITY)), `${SEARCH_PAGES[ENTITY]} preferences changed`).not.toContain(COL.jobtitle);
  });

  test(tcTitle(c.allPages), tcDetails(c.allPages, MODULE), async ({ searchResultsConfigPage: p }, testInfo) => {
    await applyAllureLabels(c.allPages, MODULE);
    const summary = {};
    for (const [id, name] of Object.entries(SEARCH_PAGES)) {
      await test.step(name, async () => {
        const { prefs, results } = await p.gotoSearch(id);
        const cols = (prefs.columns || []).filter(x => x.isVisible).length;
        summary[name] = `${cols} columns, ${results.total} results`;
        expect.soft(prefs.success, `${name}: preferences loaded`).toBe(true);
        expect.soft(cols, `${name}: at least one column`).toBeGreaterThan(0);
        if (CARD_ONLY_PAGES.includes(Number(id))) {
          await expect.soft(p.cardViewContainer, `${name}: Card view only`).toBeVisible();
          await expect.soft(p.gridViewToggle, `${name}: no Data Grid toggle`).toBeHidden();
          return;
        }
        await expect.soft(p.gridViewToggle, `${name}: Data Grid toggle`).toBeVisible();
        await expect.soft(p.cardViewToggle, `${name}: Card toggle`).toBeVisible();
        await expect.soft(p.customizeTableButton, `${name}: Customise Table View`).toBeVisible();
      });
    }
    await recordTestValues(testInfo, summary);
  });
});
