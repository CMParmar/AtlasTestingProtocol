// Company search (62418): top-bar Quick Search with the "Company" record type and the Advanced Filters drawer on
// /Search?entityId=3. Same Search page component as the Person / Message searches, so the generic plumbing
// (ResultsData capture, drawer, operators, dropdowns, entity pickers, paging) is inherited from PersonSearchPage;
// this class only overrides what is entity-specific.
// Rules from BasePage apply: locators in the constructor, no assertions here.

const { PersonSearchPage } = require('./personSearchPage');

const COMPANY_ENTITY_ID = '3';
const SCOPE = 'Company';
const RESULTS_DATA = /\/Search\/ResultsData/i;
const OPENED_RECORD = /\/Company\/Edit\/(\d+)/i;

class CompanySearchPage extends PersonSearchPage {
  constructor(page) {
    super(page);

    // ---- Presets (5): "Customer companies" is configured for the entity; shown in the drawer / page when rendered ----
    this.customerCompaniesPreset = page.getByRole('button', { name: /^\s*customer companies\s*$/i })
      .or(page.getByRole('link', { name: /^\s*customer companies\s*$/i }))
      .or(page.locator('option, .custom-select-option, .chip, .preset').filter({ hasText: /^\s*customer companies\s*$/i }))
      .first();
    // edit links of the result rows / cards (grid is the default view for Company)
    this.resultEditLinks = page.locator('main [data-action-type="edit"], main a[href*="/Company/Edit/"]');
  }

  // ---- navigation ----

  /**
   * Company advanced search with every criterion cleared and every drawer section expanded. The app re-runs the
   * last criteria on load, so wait for that search before resetting (its late response must not be taken for ours).
   */
  async gotoAdvanced() {
    const autoSearch = this.page.waitForResponse(r => RESULTS_DATA.test(r.url()), { timeout: 6_000 }).catch(() => null);
    await this.open(`/Search?entityId=${COMPANY_ENTITY_ID}`);
    await this.waitForVisible(this.openFiltersButton);
    await autoSearch;
    await this.resetFilters();
    await this.expandAllSections();
  }

  // ---- Quick Search ----

  /**
   * Top-bar Quick Search for companies. When exactly one company matches, the app skips the results page and opens
   * /Company/Edit/<id>; the result then carries `openedId` instead of rows:
   * { status, body, criteria, json, rows, total, error, openedId }.
   */
  async quickSearch(text) {
    await this.page.waitForLoadState('load').catch(() => {});
    await this.chooseQuickSearchScope(SCOPE);
    await this.quickSearchInput.fill(text);
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout: 45_000 });
    // an all-digit text that is a Company ID opens that record straight away - no ResultsData request at all
    const openedP = this.page.waitForURL(OPENED_RECORD, { timeout: 45_000 }).then(() => null);
    await this.quickSearchButton.click();
    const request = await Promise.race([requestP, openedP]).catch(() => null);
    requestP.catch(() => {});
    openedP.catch(() => {});
    if (!request) {
      const byId = this.page.url().match(OPENED_RECORD);
      if (!byId) throw new Error(`Quick Search "${text}" neither ran a search nor opened a Company record`);
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

  async quickSearchIfRuns(text, timeout = 10_000) {
    await this.chooseQuickSearchScope(SCOPE);
    await this.quickSearchInput.fill(text);
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

  /** Company Role (default operator "is any of"): every label selected in the multi-value list. */
  async setRoles(labels) {
    await this.setDropdownMulti('CompanyRoleIDF', labels);
  }

  /** Clicks the "Customer companies" preset and returns the search it ran. */
  async applyCustomerCompaniesPreset() {
    await this.openFilters();
    return this.captureResults(() => this.customerCompaniesPreset.click());
  }

  // ---- test-data discovery (not the search under test) ----

  /** POSTs ResultsData for `criteria` from inside the page (same session / anti-forgery token). */
  async probe(criteria, start = 0, length = 1) {
    const token = this.page.locator('input[name="__RequestVerificationToken"]');
    if (!(await token.count())) await this.open(`/Search?entityId=${COMPANY_ENTITY_ID}`);
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
    }, [COMPANY_ENTITY_ID, criteria, start, length]);
  }

  /** Number of non-deleted companies the server returns for `criteria` ([{ fieldId, operatorKey, values }]). */
  async countCompanies(criteria) {
    const res = await this.probe([...criteria, { fieldId: 'IsArchived', operatorKey: 'equals', values: false }]);
    return res.total;
  }

  /** Record IDs of every non-deleted company matching `criteria` (all pages). */
  async companyIds(criteria) {
    const crit = [...criteria, { fieldId: 'IsArchived', operatorKey: 'equals', values: false }];
    const ids = [];
    for (let start = 0; ; start += 200) {
      const res = await this.probe(crit, start, 200);
      ids.push(...res.rows.map(r => Number(r['Record ID'] ?? r._primaryKeyValue)));
      if (res.rows.length < 200 || ids.length >= res.total) break;
    }
    return ids;
  }

  /**
   * Every row of a search, not only the grid's first page (replays the captured ResultsData request page by page,
   * same criteria and order).
   */
  async allRows(res, pageSize = 100) {
    if (!res || !res.body || res.total <= res.rows.length) return res ? res.rows : [];
    const token = this.page.locator('input[name="__RequestVerificationToken"]');
    if (!(await token.count())) await this.open(`/Search?entityId=${COMPANY_ENTITY_ID}`);
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
    const popupP = this.page.context().waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    await this.resultEditLinks.first().dispatchEvent('click');
    const target = (await popupP) || this.page;
    await target.waitForLoadState('domcontentloaded');
    return target;
  }
}

module.exports = { CompanySearchPage, COMPANY_ENTITY_ID };
