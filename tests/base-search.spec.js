const { test, expect } = require('../fixtures/fixtures');
const { LAYOUT } = require('../pages/search/searchResultsConfigPage');
const { BASELINE } = require('../testData/searchResultsConfigData');
const { MODULE, ENTITY, OTHER_ENTITY, NO_LIST_ENTITY, DATE_ENTITY, ENTITIES, DATA, MESSAGES, cases: c } = require('../testData/baseSearchData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues, recordUrl } = require('../utils/testCase');

/**
 * 62383 CORE.Base Search Entity Records (docs/62383 Base Search Entity Records.md).
 * The baseline every search page shares, run on the Person search (/Search?entityId=9); MF-1 is repeated on several
 * entities. Every search is checked on the POST /Search/ResultsData request it sends (criteria, layout, order) and on
 * what the page shows. Before and after every test the user's Person preferences go back to the 62281 BASELINE and
 * the stored Person criteria are cleared, so other search specs start from the usual state.
 *
 * Not automated: the Setting rows themselves (CORE.Search.CriteriaConfig / ResultPreferences - no UI or API exposes
 * them; persistence is checked by reopening the page), the internal log of AF-5, and AF-1 unless BSE_NO_LIST_ENTITY_ID
 * names an entity the signed-in user cannot list. Which fields are offered as columns (62281 / Entity Field
 * Resolution for Display) is covered by search-results-config.spec.js.
 */

const QUIET_MS = 4_000; // how long "no search was run" is watched for

const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const crit = (res, fieldId) => (res.criteria || []).find(x => x.fieldId === fieldId);
const pid = r => Number(r['Record ID'] ?? r._primaryKeyValue);
const orderOf = res => (res.body.order || []).map(o => `${o.name} ${o.dir}`.toLowerCase());
const lastNameTag = value => new RegExp(`^Last Name: contains ${value}$`, 'i');

/** Applies Last Name (and optionally First Name) from a cleared drawer; returns the ResultsData capture. */
async function applyCriteria(p, { lastName, firstName } = {}) {
  return test.step(`Apply Last Name "${lastName || ''}" ${firstName ? `+ First Name "${firstName}"` : ''}`, async () => {
    await p.resetFilters();
    if (lastName) await p.setText('LastName', lastName);
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

/** Searches started within `ms` (from a watchSearches() list). */
async function searchesWithin(p, searches, ms = QUIET_MS) {
  await p.page.waitForTimeout(ms);
  return searches.length;
}

/**
 * Puts the Person preferences back to BASELINE. The app opens the search in the layout whose preferences were saved
 * LAST, so Card is saved first and Grid last - otherwise every following test would start in Card view.
 */
async function restoreBaseline(p) {
  for (const layout of [LAYOUT.CARD, LAYOUT.GRID]) {
    const r = await p.savePrefs(ENTITY, BASELINE, layout);
    expect(r.status, `restore baseline preferences (layout ${layout})`).toBe(200);
  }
}

test.describe('Base Search Entity Records (62383)', () => {
  test.beforeEach(async ({ baseSearchPage: p }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    // Grid must be stored while criteria exist (a switch without criteria is not stored), then the criteria cleared
    await p.gotoSearch(ENTITY);
    await p.ensureGridStored();
    await restoreBaseline(p);
    await p.clearStoredCriteria(ENTITY);
    await p.gotoCleared(ENTITY);
    await p.closeFilters();
    expect(await p.gridViewRadio.isChecked(), 'set-up: test starts in Data Grid view').toBe(true);
  });

  test.afterEach(async ({ baseSearchPage: p, page }) => {
    await page.unroute('**/*').catch(() => {});
    await p.gotoSearch(ENTITY).catch(() => {});
    await p.ensureGridStored().catch(() => {});
    await restoreBaseline(p).catch(() => {});
    await p.clearStoredCriteria(ENTITY).catch(() => {});
  });

  // ================= MF-1: load search context =================

  for (const [entityId, name] of Object.entries(ENTITIES)) {
    test(`${tcTitle(c.loadContext)} [${name}]`, tcDetails(c.loadContext, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
      await applyAllureLabels(c.loadContext, MODULE);
      const searches = p.watchSearches();
      const { prefsUrl, prefs, results } = await p.gotoSearch(entityId);
      await recordUrl(testInfo, page.url(), `${name} search`);
      await recordTestValues(testInfo, {
        Entity: `${name} (${entityId})`, 'Settings loaded': prefs.success, 'Searches on load': searches.length,
        'On-load criteria': JSON.stringify(results.criteria), Results: results.total,
      });
      expect(prefsUrl, 'settings read for this entity').toMatch(new RegExp(`entityId=${entityId}\\b`));
      expect(prefs.success, 'settings read successfully').toBe(true);
      expect(String(results.body.entityId), 'results rendered on load, without Apply, for this entity').toBe(String(entityId));
      expect(results.status, 'HTTP status').toBe(200);
      expect(results.error, 'search error').toBeNull();
      await expect(p.openFiltersButton, 'criteria controls offered').toBeVisible();
      if (results.total > 0) {
        await expect.poll(async () => (await p.shownRecordIds()).length, { message: 'records rendered', timeout: 15_000 }).toBeGreaterThan(0);
      } else {
        await expect(p.noResultsMessage, 'no-records message rendered').toBeVisible();
      }
      await expect(p.resultsError, 'no error shown').toBeHidden();
      await shot(page, testInfo, `${name.toLowerCase()}-search-loaded`);
      // the primary / secondary sort selectors are the sort bar of the Card view (Grid sorts by its headings)
      const wasGrid = await p.gridViewRadio.isChecked();
      if (wasGrid) await p.switchToCard();
      await expect(p.sortBarPrimary, 'primary sort selector shown').toBeVisible();
      await expect(p.sortBarSecondary, 'secondary sort selector shown').toBeVisible();
      if (wasGrid) await p.switchToGrid(); // leave the entity in its usual layout
    });
  }

  test(tcTitle(c.loadLastCriteria), tcDetails(c.loadLastCriteria, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.loadLastCriteria, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    const { results } = await p.gotoSearch(ENTITY);
    const tags = await p.tagTexts();
    await recordTestValues(testInfo, { 'Applied Last Name': DATA.lastName, 'On-load criteria': JSON.stringify(results.criteria), Tags: tags });
    expect(crit(results, 'LastName'), 'on-load search re-applies Last Name').toMatchObject({ operatorKey: 'contains', values: DATA.lastName });
    expect(tags, 'persisted criterion shown as a tag').toEqual(expect.arrayContaining([expect.stringMatching(lastNameTag(DATA.lastName))]));
    await p.openFilters();
    expect(await p.textValue('LastName'), 'Last Name control holds the persisted value').toBe(DATA.lastName);
    await shot(page, testInfo, 'last-criteria-reloaded');
  });

  test(tcTitle(c.loadLastLayout), tcDetails(c.loadLastLayout, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.loadLastLayout, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName }); // a layout switch only runs (and is stored) with criteria
    await p.switchToCard();
    const card = await p.gotoSearch(ENTITY);
    const cardKept = await p.isCardView();
    await p.switchToGrid();
    const grid = await p.gotoSearch(ENTITY);
    const gridKept = await p.gridViewRadio.isChecked();
    await recordTestValues(testInfo, { 'Card kept': cardKept, 'Grid kept': gridKept, 'Layouts requested': `${card.results.body.layoutId} / ${grid.results.body.layoutId}` });
    expect(cardKept, 'Card view restored').toBe(true);
    expect(card.results.body.layoutId, 'on-load search in Card layout').toBe(LAYOUT.CARD);
    expect(gridKept, 'Grid view restored').toBe(true);
    await expect(p.gridViewContainer).toBeVisible();
  });

  test(tcTitle(c.loadLastSort), tcDetails(c.loadLastSort, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.loadLastSort, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    await p.switchToCard();
    await p.setSort('primary', 'primaryemail');
    await p.setSort('secondary', 'displayName');
    await p.page.waitForTimeout(2_000);
    await p.gotoSearch(ENTITY);
    const shown = { primary: await p.selectedSort('primary'), secondary: await p.selectedSort('secondary') };
    await recordTestValues(testInfo, { 'Chosen sort': 'Email / Display Name', 'Shown after reopening': JSON.stringify(shown) });
    expect(shown, 'sort restored after reopening').toEqual({ primary: 'Email', secondary: 'Display Name' });
  });

  // ================= MF-2: modify criteria =================

  test(tcTitle(c.addNoSearch), tcDetails(c.addNoSearch, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.addNoSearch, MODULE);
    const searches = p.watchSearches();
    await p.setText('LastName', DATA.lastName);
    const n = await searchesWithin(p, searches);
    await recordTestValues(testInfo, { 'Last Name typed': DATA.lastName, 'Searches run': n });
    expect(n, 'adding a criterion does not run the search').toBe(0);
  });

  test(tcTitle(c.addShowsTag), tcDetails(c.addShowsTag, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.addShowsTag, MODULE);
    await p.setText('LastName', DATA.lastName);
    await page.waitForTimeout(1_000);
    const tags = await p.tagTexts();
    await recordTestValues(testInfo, { 'Last Name typed (not applied)': DATA.lastName, Tags: tags });
    await shot(page, testInfo, 'criterion-entered');
    expect(tags, 'entered criterion shown as a tag before Apply').toEqual(expect.arrayContaining([expect.stringMatching(lastNameTag(DATA.lastName))]));
    await expect(p.tagRemoveButton('LastName'), 'tag can be removed').toBeVisible();
  });

  test(tcTitle(c.editNoSearch), tcDetails(c.editNoSearch, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.editNoSearch, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    const searches = p.watchSearches();
    await p.setText('LastName', DATA.editedLastName);
    const n = await searchesWithin(p, searches);
    const res = await p.apply();
    const tags = await p.tagTexts();
    await recordTestValues(testInfo, { 'Edited Last Name': `${DATA.lastName} -> ${DATA.editedLastName}`, 'Searches on edit': n, Tags: tags });
    expect(n, 'editing a criterion does not run the search').toBe(0);
    expect(crit(res, 'LastName'), 'Apply sends the edited value').toMatchObject({ values: DATA.editedLastName });
    expect(tags, 'tag shows the edited value').toEqual(expect.arrayContaining([expect.stringMatching(lastNameTag(DATA.editedLastName))]));
  });

  test(tcTitle(c.removeTagClears), tcDetails(c.removeTagClears, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.removeTagClears, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    await p.removeTag('LastName');
    await p.page.waitForTimeout(2_000);
    await p.resultsLoading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    const tags = await p.tagTexts();
    await p.openFilters();
    const value = await p.textValue('LastName');
    const res = await p.applyExpectingNoSearch();
    await recordTestValues(testInfo, { 'Tags after removal': tags, 'Last Name control': value || '(empty)', 'Next Apply criteria': res ? JSON.stringify(res.criteria) : '(no search)' });
    expect(tags.join(' | '), 'Last Name tag removed').not.toMatch(/Last Name/i);
    expect(value, 'Last Name criterion cleared').toBe('');
    if (res) expect(crit(res, 'LastName'), 'next Apply does not send Last Name').toBeUndefined();
  });

  test(tcTitle(c.removeTagNoSearch), tcDetails(c.removeTagNoSearch, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.removeTagNoSearch, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    const searches = p.watchSearches();
    await p.removeTag('LastName');
    const n = await searchesWithin(p, searches);
    await recordTestValues(testInfo, { 'Tag removed': 'Last Name', 'Searches run': n, 'Search sent': searches[0] ? searches[0].criteriaJson : '-' });
    expect(n, 'removing a tag does not run the search').toBe(0);
  });

  // ================= MF-3 / MF-4 =================

  test(tcTitle(c.layoutRunsSearch), tcDetails(c.layoutRunsSearch, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.layoutRunsSearch, MODULE);
    const applied = await applyCriteria(p, { lastName: DATA.lastName });
    const card = await p.switchToCard();
    const grid = await p.switchToGrid();
    await recordTestValues(testInfo, {
      'Applied results': applied.total, 'Card search criteria': JSON.stringify(card && card.criteria), 'Grid search criteria': JSON.stringify(grid && grid.criteria),
    });
    for (const [label, res, layout] of [['Card', card, LAYOUT.CARD], ['Grid', grid, LAYOUT.GRID]]) {
      expect(res, `switching to ${label} runs the search`).not.toBeNull();
      expect(res.body.layoutId, `${label}: new layout requested`).toBe(layout);
      expect(crit(res, 'LastName'), `${label}: current criteria kept`).toMatchObject({ values: DATA.lastName });
      expect(res.total, `${label}: same records`).toBe(applied.total);
    }
    await shot(page, testInfo, 'layout-switched');
  });

  test(tcTitle(c.applyAllCriteria), tcDetails(c.applyAllCriteria, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.applyAllCriteria, MODULE);
    const res = await applyCriteria(p, { lastName: DATA.lastName, firstName: DATA.firstNamePart });
    const tags = await p.tagTexts();
    await recordTestValues(testInfo, { Criteria: JSON.stringify(res.criteria), Tags: tags, Results: res.total });
    expect(String(res.body.entityId), 'entity-specific search').toBe(String(ENTITY));
    expect(crit(res, 'LastName'), 'Last Name sent').toMatchObject({ values: DATA.lastName });
    expect(crit(res, 'FirstName'), 'First Name sent').toMatchObject({ values: DATA.firstNamePart });
    expect(tags.some(t => /^Last Name:/i.test(t)) && tags.some(t => /^First Name:/i.test(t)), 'a tag per criterion').toBe(true);
    await shot(page, testInfo, 'all-criteria-applied');
  });

  test(tcTitle(c.andLogic), tcDetails(c.andLogic, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.andLogic, MODULE);
    const last = await applyCriteria(p, { lastName: DATA.lastName });
    const first = await applyCriteria(p, { firstName: DATA.firstNamePart });
    const both = await applyCriteria(p, { lastName: DATA.lastName, firstName: DATA.firstNamePart });
    await recordTestValues(testInfo, { 'Last Name only': last.total, 'First Name only': first.total, Both: both.total });
    expect(last.total, `people with last name "${DATA.lastName}" exist`).toBeGreaterThan(0);
    expect(both.total, 'AND: not more than Last Name alone').toBeLessThanOrEqual(last.total);
    expect(both.total, 'AND: not more than First Name alone').toBeLessThanOrEqual(first.total);
    if (last.total <= last.rows.length) {
      const lastIds = last.rows.map(pid);
      expect(both.rows.map(pid).filter(id => !lastIds.includes(id)), 'every combined record matches Last Name too').toEqual([]);
    }
  });

  test(tcTitle(c.persistPerEntity), tcDetails(c.persistPerEntity, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.persistPerEntity, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    const other = await p.gotoSearch(OTHER_ENTITY);
    const otherTags = await p.tagTexts();
    const back = await p.gotoSearch(ENTITY);
    await recordTestValues(testInfo, { 'Other entity criteria': JSON.stringify(other.results.criteria), 'Other entity tags': otherTags, 'Person criteria on return': JSON.stringify(back.results.criteria) });
    expect(crit(other.results, 'LastName'), 'Person criteria not loaded on the other entity').toBeUndefined();
    expect(otherTags.join(' | ')).not.toContain(DATA.lastName);
    expect(crit(back.results, 'LastName'), 'Person criteria still stored for Person').toMatchObject({ values: DATA.lastName });
  });

  // ================= MF-5: sort =================

  test(tcTitle(c.primarySortRuns), tcDetails(c.primarySortRuns, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.primarySortRuns, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    await p.switchToCard();
    const res = await p.setSort('primary', 'primaryemail');
    await recordTestValues(testInfo, { 'Primary sort': 'Email', Order: orderOf(res), Criteria: JSON.stringify(res.criteria), Results: res.total });
    expect(orderOf(res)[0], 'search ordered by the new primary sort').toMatch(/^primaryemail /);
    expect(crit(res, 'LastName'), 'current criteria kept').toMatchObject({ values: DATA.lastName });
    expect(res.status).toBe(200);
    await expect(p.cards.first(), 'results shown').toBeVisible();
    await shot(page, testInfo, 'primary-sort-changed');
  });

  test(tcTitle(c.secondarySortRuns), tcDetails(c.secondarySortRuns, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.secondarySortRuns, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    await p.switchToCard();
    const res = await p.setSort('secondary', 'displayName');
    await recordTestValues(testInfo, { 'Secondary sort': 'Display Name', Order: orderOf(res) });
    expect(orderOf(res).length, 'primary and secondary sort sent').toBeGreaterThanOrEqual(2);
    expect(orderOf(res)[0], 'primary sort first').toMatch(/^fullname /);
    expect(orderOf(res)[1], 'secondary sort second').toMatch(/^displayname /);
  });

  // ================= MF-6: interact with results =================

  test(tcTitle(c.pageNavigation), tcDetails(c.pageNavigation, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.pageNavigation, MODULE);
    await applyCriteria(p, { lastName: DATA.broadLastName });
    await p.switchToCard();
    const firstIds = await p.shownRecordIds();
    test.skip(!(await p.isVisibleWithin(p.nextPageButton, 3_000)) || (await p.nextPageButton.isDisabled()), 'only one page of results in the sandbox');
    const searches = p.watchSearches();
    await p.nextPageButton.click();
    await p.page.waitForTimeout(2_000);
    await p.resultsLoading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    const nextIds = await p.shownRecordIds();
    await recordTestValues(testInfo, { 'Page 1 ids': firstIds.slice(0, 10), 'Page 2 ids': nextIds.slice(0, 10), 'Requests start': searches.map(s => s.start) });
    expect(nextIds.length, 'records on page 2').toBeGreaterThan(0);
    expect(nextIds.filter(id => firstIds.includes(id)), 'page 2 shows other records').toEqual([]);
    if (searches.length) expect(searches[searches.length - 1].start, 'next page requested').toBeGreaterThan(0);
  });

  test(tcTitle(c.openRecord), tcDetails(c.openRecord, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.openRecord, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    await p.switchToCard();
    const card = await p.cardDetails(0);
    const target = await test.step('Open the first result', () => p.openResult(0));
    await recordTestValues(testInfo, { 'Opened card': `${card.title} (#${card.id})`, Landed: target.url() });
    await recordUrl(testInfo, target.url(), 'Opened record');
    await expect(target, 'record page opened').toHaveURL(new RegExp(`/Person/Edit/${card.id}\\b`));
  });

  // ================= Alternate flows =================

  test(tcTitle(c.noPermission), tcDetails(c.noPermission, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.noPermission, MODULE);
    test.skip(!NO_LIST_ENTITY, 'Set BSE_NO_LIST_ENTITY_ID in .env to an entity the signed-in user has no List permission on');
    const returned = [];
    page.on('response', async r => {
      if (/\/Search\/ResultsData/i.test(r.url())) returned.push(await r.json().then(j => j.recordsFiltered ?? 0).catch(() => 0));
    });
    await p.open(`/Search?entityId=${NO_LIST_ENTITY}`);
    await page.waitForTimeout(QUIET_MS);
    await recordTestValues(testInfo, { 'Entity without List permission': NO_LIST_ENTITY, 'Records returned': returned });
    await shot(page, testInfo, 'no-list-permission');
    await expect(p.permissionMessage, '"Insufficient Permission to List Records" shown').toBeVisible();
    await expect(p.openFiltersButton, 'no criteria controls').toBeHidden();
    expect(await p.cards.count() + await p.gridRows.count(), 'no results shown').toBe(0);
    expect(returned.filter(n => n > 0), 'no records returned').toEqual([]);
  });

  test(tcTitle(c.noResults), tcDetails(c.noResults, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.noResults, MODULE);
    const res = await applyCriteria(p, { lastName: DATA.noMatch });
    const tags = await p.tagTexts();
    const shown = (await p.isVisibleWithin(p.noResultsMessage, 10_000)) ? (await p.noResultsMessage.innerText()).trim() : '';
    await recordTestValues(testInfo, { 'Last Name': DATA.noMatch, Results: res.total, Message: shown || '(none)', Tags: tags });
    await shot(page, testInfo, 'no-results-grid');
    expect(res.total, 'no records match').toBe(0);
    expect(shown, 'no-records message shown').toMatch(MESSAGES.noResults);
    expect(tags, 'criteria tag still shown').toEqual(expect.arrayContaining([expect.stringMatching(lastNameTag(DATA.noMatch))]));
    await p.openFilters();
    await expect(p.applyButton, 'user can adjust and re-apply').toBeEnabled();
  });

  test(tcTitle(c.noResultsCard), tcDetails(c.noResultsCard, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.noResultsCard, MODULE);
    // apply first, then switch: a layout switch is only reliable (and searched) when criteria exist
    await applyCriteria(p, { lastName: DATA.noMatch });
    const res = await p.switchToCard();
    expect(res, 'switching to Card runs the search').not.toBeNull();
    expect(await p.isCardView(), 'Card view shown').toBe(true);
    const tags = await p.tagTexts();
    const shown = (await p.isVisibleWithin(p.noResultsMessage, 10_000)) ? (await p.noResultsMessage.innerText()).trim() : '';
    await recordTestValues(testInfo, { 'Last Name': DATA.noMatch, Results: res.total, Message: shown || '(none)', Tags: tags });
    await shot(page, testInfo, 'no-results-card');
    expect(res.total, 'no records match').toBe(0);
    expect(await p.cards.count(), 'no cards').toBe(0);
    expect(shown, 'no-records message shown in Card view').toMatch(MESSAGES.noResults);
    expect(tags, 'criteria tag still shown').toEqual(expect.arrayContaining([expect.stringMatching(lastNameTag(DATA.noMatch))]));
  });

  test(tcTitle(c.invalidHighlighted), tcDetails(c.invalidHighlighted, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.invalidHighlighted, MODULE);
    await p.gotoCleared(DATE_ENTITY);
    await p.setDateRange(DATA.invalidRange.start, DATA.invalidRange.end);
    await p.dateEndInput.press('Tab');
    const res = await p.applyExpectingNoSearch();
    const invalid = await p.isInvalid('DateCreatedUtc');
    await recordTestValues(testInfo, { 'Date Created': `${DATA.invalidRange.start} .. ${DATA.invalidRange.end}`, 'Search ran': !!res, Highlighted: invalid });
    await shot(page, testInfo, 'invalid-criterion');
    expect(res, 'search not executed').toBeNull();
    expect(invalid, 'invalid criterion highlighted').toBe(true);
  });

  test(tcTitle(c.invalidDisablesApply), tcDetails(c.invalidDisablesApply, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.invalidDisablesApply, MODULE);
    await p.gotoCleared(DATE_ENTITY);
    await p.setDateRange(DATA.invalidRange.start, DATA.invalidRange.end);
    await p.dateEndInput.press('Tab');
    await p.page.waitForTimeout(1_000);
    const disabled = await p.applyButton.isDisabled();
    await recordTestValues(testInfo, { 'Date Created': `${DATA.invalidRange.start} .. ${DATA.invalidRange.end}`, 'Apply disabled': disabled });
    expect(disabled, 'Apply disabled while the criterion is invalid').toBe(true);
    await p.dateStartInput.fill(DATA.validRange.start);
    await p.dateEndInput.fill(DATA.validRange.end);
    await p.dateEndInput.press('Tab');
    await expect(p.applyButton, 'Apply enabled once corrected').toBeEnabled();
  });

  test(tcTitle(c.invalidFixed), tcDetails(c.invalidFixed, MODULE), async ({ baseSearchPage: p }, testInfo) => {
    await applyAllureLabels(c.invalidFixed, MODULE);
    try {
      await p.gotoCleared(DATE_ENTITY);
      await p.setDateRange(DATA.invalidRange.start, DATA.invalidRange.end);
      await p.dateEndInput.press('Tab');
      expect(await p.applyExpectingNoSearch(), 'invalid range not searched').toBeNull();
      await p.dateStartInput.fill(DATA.validRange.start);
      await p.dateEndInput.fill(DATA.validRange.end);
      await p.dateEndInput.press('Tab');
      const res = await p.apply();
      const invalid = await p.isInvalid('DateCreatedUtc');
      await recordTestValues(testInfo, { 'Corrected range': `${DATA.validRange.start} .. ${DATA.validRange.end}`, 'Still highlighted': invalid, Results: res.total });
      expect(res.status, 'search executed').toBe(200);
      expect(res.error).toBeNull();
      expect(crit(res, 'DateCreatedUtc'), 'corrected range sent').toBeDefined();
      expect(invalid, 'highlight cleared').toBe(false);
    } finally {
      await p.clearStoredCriteria(DATE_ENTITY).catch(() => {});
    }
  });

  test(tcTitle(c.primarySortMissing), tcDetails(c.primarySortMissing, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.primarySortMissing, MODULE);
    for (const layout of [LAYOUT.GRID, LAYOUT.CARD]) {
      const r = await p.savePrefs(ENTITY, { columns: BASELINE.columns, sort: null }, layout);
      expect(r.status, `store settings without a primary sort (layout ${layout})`).toBe(200);
    }
    const { prefs, results } = await p.gotoSearch(ENTITY);
    const text = `${await p.mainTextWithoutResults()} ${(await p.toastTexts()).join(' ')} ${results.error || ''}`;
    await recordTestValues(testInfo, { 'Stored sort': 'none (null)', 'Loaded sort': JSON.stringify(prefs.sort), 'Search order': orderOf(results), 'Results shown': results.total });
    await shot(page, testInfo, 'primary-sort-missing');
    expect(text, '"Search Configuration Error - Primary Sort Not Defined" raised').toMatch(MESSAGES.primarySortMissing);
  });

  test(tcTitle(c.saveFailure), tcDetails(c.saveFailure, MODULE), async ({ baseSearchPage: p, page }, testInfo) => {
    await applyAllureLabels(c.saveFailure, MODULE);
    await applyCriteria(p, { lastName: DATA.lastName });
    await p.failSaves();
    const saves = p.watchSaves();
    const card = await p.switchToCard();
    const sorted = await p.setSort('primary', 'primaryemail');
    const toasts = await p.toastTexts();
    await recordTestValues(testInfo, { 'Simulated failure': 'SaveColumnPreferences HTTP 500', 'Failed saves': saves.length, 'Results after changes': `${card && card.total} / ${sorted.total}`, Toasts: toasts });
    await shot(page, testInfo, 'save-failed-silently');
    expect(sorted.status, 'search still executed').toBe(200);
    await expect(p.cards.first(), 'results still displayed').toBeVisible();
    await expect(p.resultsError, 'no error shown in the results').toBeHidden();
    expect(toasts.filter(t => MESSAGES.error.test(t)), 'no message shown to the user').toEqual([]);
  });
});
