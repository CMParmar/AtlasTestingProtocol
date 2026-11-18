// Execute Quick Search (62466): the top-bar Quick Search (record-type scope + single input + magnifier) and the
// Quick Search results page /Search/QuickSearch?entityId=<n>&searchText=<text>&searchMode=quick.
// How the app works (js/search/search-quick.js, observed in the sandbox):
//   - typing starts a debounce timer (sessionConfig.qsDebounceMilliseconds); when it fires and the trimmed text has at
//     least sessionConfig.qsMinimumLength characters the browser navigates to the Quick Search results page
//   - the magnifier / Enter searches at once; with an empty input it reads GET /Search/GetQuickSearchHistory and either
//     searches with that text or shows alert("No Quick Search criterion available.")
//   - a positive integer first calls GET /Search/PkExactMatch?entityId&pkValue and opens { url } when found
// Results, layout, sort bar and preferences come from BaseSearchPage / SearchResultsConfigPage.
// Rules from BasePage apply: locators in the constructor, no assertions here.

const { BaseSearchPage } = require('./baseSearchPage');

const RESULTS_DATA = /\/Search\/ResultsData/i;
const QUICK_PAGE = /\/Search\/QuickSearch\?/i;
const PK_MATCH = /\/Search\/PkExactMatch/i;
const PREFS_SAVE = /\/Search\/SaveColumnPreferences/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class QuickSearchPage extends BaseSearchPage {
  constructor(page) {
    super(page);
    this.scopeSelect = page.locator('#searchScopeSelect');
    // generic error of the results area (AF-2) - text checked by the spec
    this.resultsArea = page.locator('main');
  }

  // ---- navigation ----

  /** A signed-in page with the top bar, with the Quick Search input empty and Record Type = `scope`. */
  async gotoStart(scope) {
    await this.open('/Task');
    await this.waitForVisible(this.quickSearchInput);
    // the page restores the input via .value after load; wait for that before clearing
    await this.page.waitForTimeout(500);
    await this.setInputSilently('');
    if (scope) await this.selectScope(scope);
  }

  /** Selects the Record Type with the input empty (a scope change with text in the input searches at once). */
  async selectScope(label) {
    await this.setInputSilently('');
    const current = await this.scopeButton.innerText().catch(() => '');
    if (current.trim() !== label) {
      await this.scopeButton.click();
      await this.scopeOptionList.filter({ hasText: new RegExp(`^\\s*${esc(label)}\\s*$`) }).first().click();
      await this.page.waitForTimeout(500);
    }
  }

  /** Opens the Quick Search results page directly; returns the ResultsData capture of its search. */
  async openQuick(entityId, text, timeout = 60_000) {
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout });
    await this.page.goto(`/Search/QuickSearch?entityId=${entityId}&searchText=${encodeURIComponent(text)}&searchMode=quick`, { timeout });
    return this.readResults(await requestP);
  }

  /** The Quick Search results page has no Advanced Filters drawer; close it only where it exists. */
  async closeFilters() {
    if (await this.filtersDrawer.count()) await super.closeFilters();
  }

  // ---- input ----

  /** Sets the input value WITHOUT an input event (no debounce / automatic search) - used before a manual search. */
  async setInputSilently(value) {
    await this.quickSearchInput.evaluate((el, v) => { el.value = v; }, value);
  }

  /** Types like a user, one key every `delay` ms (each key fires an input event). */
  async typeText(text, delay = 60) {
    await this.quickSearchInput.click();
    await this.quickSearchInput.pressSequentially(text, { delay });
  }

  async inputValue() {
    return this.quickSearchInput.inputValue();
  }

  // ---- watching ----

  /**
   * Records from now on: Quick Search page loads { t, text } (t = ms since watch start), PkExactMatch calls (pkValue)
   * and SaveColumnPreferences bodies. Returns the live object; call stop() when done.
   */
  watch() {
    const t0 = Date.now();
    const w = { t0, searches: [], pkCalls: [], saves: [], results: [] };
    const onReq = r => {
      const u = r.url();
      if (QUICK_PAGE.test(u) && r.resourceType() === 'document') {
        w.searches.push({ t: Date.now() - t0, text: new URL(u).searchParams.get('searchText'), entityId: new URL(u).searchParams.get('entityId') });
      } else if (PK_MATCH.test(u)) {
        w.pkCalls.push(new URL(u).searchParams.get('pkValue'));
      } else if (PREFS_SAVE.test(u)) {
        w.saves.push(r.postDataJSON());
      } else if (RESULTS_DATA.test(u) && r.method() === 'POST') {
        w.results.push(r.postDataJSON() || {});
      }
    };
    this.page.on('request', onReq);
    w.stop = () => this.page.off('request', onReq);
    return w;
  }

  /** Waits until the browser is on the Quick Search page or a record page; returns the URL. */
  async waitForOutcome(timeout = 60_000) {
    await this.page.waitForURL(u => QUICK_PAGE.test(u.toString()) || /\/Edit\/\d+/i.test(u.toString()), { timeout }).catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    return this.page.url();
  }

  // ---- manual search ----

  async clickSearch() {
    await this.quickSearchButton.click({ noWaitAfter: true });
  }

  async pressEnter() {
    await this.quickSearchInput.press('Enter', { noWaitAfter: true });
  }

  /** Clicks the magnifier and returns the alert text shown (or null) within `timeout`. */
  async clickSearchExpectingAlert(timeout = 5_000) {
    let message = null;
    const handler = async d => { message = d.message(); await d.accept(); };
    this.page.once('dialog', handler);
    await this.clickSearch();
    await this.page.waitForTimeout(timeout);
    this.page.off('dialog', handler);
    return message;
  }

  // ---- server state ----

  /** Last Quick Search criterion stored for the user + entity (GET /Search/GetQuickSearchHistory). */
  async history(entityId) {
    const r = await this.page.request.get(`/Search/GetQuickSearchHistory?entityId=${entityId}`);
    const j = await r.json().catch(() => ({}));
    return j.searchText ?? '';
  }

  /** The Quick Search settings the page runs with: { debounce, minLength }. */
  async quickSettings() {
    const c = await this.page.evaluate(() => window.sessionConfig || {});
    return { debounce: c.qsDebounceMilliseconds, minLength: c.qsMinimumLength };
  }

  /** Localised Quick Search messages the layout ships (No_Quick_Search_Criterion_Available, Quick_Search_Execution_Failed). */
  async quickMessages() {
    return this.page.evaluate(() => window.__quickSearchErrorMessages || {});
  }

  /**
   * Reopens the Advanced Search page and returns its on-load search capture. Listens only after the navigation
   * commits, so a late search of the page being left cannot be taken for it.
   */
  async reopenAdvanced(entityId, timeout = 60_000) {
    await this.page.goto(`/Search?entityId=${entityId}`, { waitUntil: 'commit', timeout });
    const request = await this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout });
    const results = await this.readResults(request);
    await this.openFiltersButton.waitFor({ state: 'visible', timeout });
    return results;
  }

  /** Visible text of the results area without the drawers (for message checks). */
  async resultsText() {
    return this.mainTextWithoutResults();
  }
}

module.exports = { QuickSearchPage };
