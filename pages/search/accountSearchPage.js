// Account search (62828): top-bar Quick Search with the "Account" record type and the Advanced Filters drawer on
// /Search?entityId=1. Same Search page component as the Person / Company searches, so the generic plumbing
// (ResultsData capture, drawer, operators, dropdowns, paging) is inherited from PersonSearchPage;
// this class only overrides what is entity-specific.
// Rules from BasePage apply: locators in the constructor, no assertions here.

const { PersonSearchPage } = require('./personSearchPage');

const ACCOUNT_ENTITY_ID = '1';
const SCOPE = 'Account';
const RESULTS_DATA = /\/Search\/ResultsData/i;
const OPENED_RECORD = /\/Account\/Edit\/(\d+)/i;
const NOT_DELETED = { fieldId: 'IsArchived', operatorKey: 'equals', values: false };

class AccountSearchPage extends PersonSearchPage {
  constructor(page) {
    super(page);
    // edit links of the result rows / cards (grid is the default view for Account)
    this.resultEditLinks = page.locator('main [data-action-type="edit"], main a[href*="/Account/Edit/"]');
    // any preset control (spec 7: Account has no Preset Searches)
    this.presetControls = page.locator('main, #filtersDrawer').locator('.preset, [data-preset], [class*="preset" i]');
  }

  // ---- navigation ----

  /**
   * Account advanced search with every criterion cleared and every drawer section expanded. The app re-runs the
   * last criteria on load, so wait for that search before resetting (its late response must not be taken for ours).
   */
  async gotoAdvanced() {
    const autoSearch = this.page.waitForResponse(r => RESULTS_DATA.test(r.url()), { timeout: 6_000 }).catch(() => null);
    await this.open(`/Search?entityId=${ACCOUNT_ENTITY_ID}`);
    await this.waitForVisible(this.openFiltersButton);
    await autoSearch;
    await this.resetFilters();
    await this.expandAllSections();
  }

  // ---- Quick Search ----

  /**
   * Top-bar Quick Search for accounts. When exactly one account matches (or the text is an Account record ID), the
   * app skips the results page and opens /Account/Edit/<id>; the result then carries `openedId` instead of rows:
   * { status, body, criteria, json, rows, total, error, openedId, openedById }.
   */
  async quickSearch(text) {
    await this.page.waitForLoadState('load').catch(() => {});
    await this.chooseQuickSearchScope(SCOPE);
    await this.setQuickTextSilently(text);
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout: 45_000 });
    // an all-digit text that is an Account record ID opens that record straight away - no ResultsData request at all
    const openedP = this.page.waitForURL(OPENED_RECORD, { timeout: 45_000 }).then(() => null);
    await this.quickSearchButton.click();
    const request = await Promise.race([requestP, openedP]).catch(() => null);
    requestP.catch(() => {});
    openedP.catch(() => {});
    if (!request) {
      const byId = this.page.url().match(OPENED_RECORD);
      if (!byId) throw new Error(`Quick Search "${text}" neither ran a search nor opened an Account record`);
      await this.page.waitForLoadState('domcontentloaded');
      return { status: 200, body: {}, criteria: [], json: {}, rows: [], total: 1, error: null, openedId: Number(byId[1]), openedById: true };
    }
    const response = await request.response();
    let json = null;
    try { json = await response.json(); } catch { json = null; }
    if (!json || json.recordsFiltered === 1) {
      await this.page.waitForURL(OPENED_RECORD, { timeout: 10_000 }).catch(() => {});
    }
    const opened = this.page.url().match(OPENED_RECORD);
    if (opened) await this.page.waitForLoadState('domcontentloaded');
    else await this.resultsLoading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    const body = request.postDataJSON() || {};
    let criteria = [];
    try { criteria = JSON.parse(body.criteriaJson || '[]'); } catch { criteria = []; }
    return {
      status: response.status(), body, criteria, json: json || {},
      rows: (json && json.data) || [], total: json ? json.recordsFiltered ?? 0 : (opened ? 1 : 0),
      error: (json && json.error) || null, openedId: opened ? Number(opened[1]) : null,
    };
  }

  /**
   * Puts `text` in the Quick Search input WITHOUT an input event. fill() would also start the app's debounced
   * automatic search (750 ms in the sandbox), which then navigates a second time on top of the magnifier click and
   * the search request can be lost between the two page loads.
   */
  async setQuickTextSilently(text) {
    await this.quickSearchInput.evaluate((el, v) => { el.value = v; }, text);
  }

  /**
   * Clicks Apply and returns the results. A click made while the page is still settling (restore / reset / drawer
   * sections expanding) is sometimes lost, so Apply is clicked once more when no search starts. When the app still
   * sends nothing, the error says why (its own form validation and the criteria it would send).
   */
  async apply() {
    await this.openFilters();
    for (const timeout of [15_000, 30_000]) {
      const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout }).catch(() => null);
      await this.applyButton.click();
      const request = await requestP;
      if (request) return this.readResults(request);
    }
    const state = await this.page.evaluate(() => {
      const app = window.SearchApp || {};
      let valid = null; let criteria = null;
      try { valid = app.Validation.validateForm(); } catch { valid = 'n/a'; }
      try { criteria = app.Criteria.collect(); } catch { criteria = 'n/a'; }
      return { valid, criteria };
    });
    const invalid = await this.filtersDrawer.locator('.invalid-feedback, .field-validation-error')
      .filter({ visible: true }).allInnerTexts().catch(() => []);
    throw new Error(`Apply was clicked twice but no search was sent. Form valid: ${state.valid}; `
      + `criteria: ${JSON.stringify(state.criteria)}; visible field errors: ${JSON.stringify(invalid)}`);
  }

  async quickSearchIfRuns(text, timeout = 10_000) {
    await this.chooseQuickSearchScope(SCOPE);
    await this.setQuickTextSilently(text);
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout }).catch(() => null);
    await this.quickSearchButton.click();
    const request = await requestP;
    return request ? this.readResults(request) : null;
  }

  async openAdvancedFromQuickSearch() {
    await this.chooseQuickSearchScope(SCOPE);
    await this.advancedSearchIcon.click();
    await this.waitForVisible(this.openFiltersButton);
  }

  // ---- criteria ----

  /** Account Status / Billing Country with "is any of": every label selected in the multi-value list. */
  async setMulti(fieldId, labels) {
    await this.setDropdownMulti(fieldId, labels);
  }

  // ---- test-data discovery (not the search under test) ----

  /** POSTs ResultsData for `criteria` from inside the page (same session / anti-forgery token). */
  async probe(criteria, start = 0, length = 1) {
    const token = this.page.locator('input[name="__RequestVerificationToken"]');
    if (!(await token.count())) await this.open(`/Search?entityId=${ACCOUNT_ENTITY_ID}`);
    return this.page.evaluate(async ([entityId, crit, start, length]) => {
      const t = document.querySelector('input[name="__RequestVerificationToken"]');
      const r = await fetch('/Search/ResultsData', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { RequestVerificationToken: t.value } : {}) },
        body: JSON.stringify({ draw: 0, start, length, order: [], columns: [], search: null, entityId, layoutId: 2,
          criteriaJson: JSON.stringify(crit), searchMode: 'advanced', applyNewSorting: false }),
      });
      if (!r.ok) throw new Error(`ResultsData probe failed: HTTP ${r.status}`);
      const j = await r.json();
      return { total: j.recordsFiltered ?? 0, rows: j.data || [], error: j.error || null };
    }, [ACCOUNT_ENTITY_ID, criteria, start, length]);
  }

  /** Number of non-deleted accounts the server returns for `criteria` ([{ fieldId, operatorKey, values }]). */
  async countAccounts(criteria) {
    return (await this.probe([...criteria, NOT_DELETED])).total;
  }

  /** Every non-deleted account row matching `criteria` (all pages). `deleted: true` searches deleted accounts instead. */
  async accountRows(criteria, { deleted = false } = {}) {
    const crit = [...criteria, { ...NOT_DELETED, values: deleted }];
    const rows = [];
    for (let start = 0; ; start += 100) {
      const res = await this.probe(crit, start, 100);
      rows.push(...res.rows);
      if (res.rows.length < 100 || rows.length >= res.total) break;
    }
    return rows;
  }

  /**
   * Every row of a search, not only the grid's first page (replays the captured ResultsData request page by page,
   * same criteria and order).
   */
  async allRows(res, pageSize = 100) {
    if (!res || !res.body || res.total <= res.rows.length) return res ? res.rows : [];
    const token = this.page.locator('input[name="__RequestVerificationToken"]');
    if (!(await token.count())) await this.open(`/Search?entityId=${ACCOUNT_ENTITY_ID}`);
    return this.page.evaluate(async ([body, total, size]) => {
      const t = document.querySelector('input[name="__RequestVerificationToken"]');
      const rows = [];
      for (let start = 0; start < total; start += size) {
        const r = await fetch('/Search/ResultsData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(t ? { RequestVerificationToken: t.value } : {}) },
          body: JSON.stringify({ ...body, start, length: size }),
        });
        if (!r.ok) throw new Error(`ResultsData page probe failed: HTTP ${r.status}`);
        const page = (await r.json()).data || [];
        rows.push(...page);
        if (page.length < size) break;
      }
      return rows;
    }, [res.body, res.total, pageSize]);
  }

  /**
   * Opens the edit link of the first result (grid row or card). Returns the page it landed on. The Advanced Filters
   * drawer stays open after Apply and covers the grid, so the link's own click handler is fired directly.
   */
  async openFirstResult() {
    // openEditPage() navigates (or opens a tab) after the click handler returns - wait for whichever happens
    const popupP = this.page.context().waitForEvent('page', { timeout: 20_000 });
    const sameTabP = this.page.waitForURL(OPENED_RECORD, { timeout: 20_000 }).then(() => this.page);
    await this.resultEditLinks.first().dispatchEvent('click');
    const target = await Promise.any([popupP, sameTabP]).catch(() => this.page);
    popupP.catch(() => {});
    sameTabP.catch(() => {});
    if (target !== this.page) await target.waitForURL(OPENED_RECORD, { timeout: 20_000 }).catch(() => {});
    await target.waitForLoadState('domcontentloaded');
    return target;
  }
}

module.exports = { AccountSearchPage, ACCOUNT_ENTITY_ID };
