// Base Search Entity Records (62383): the behaviour every /Search?entityId=<n> page shares - stored search context
// loaded on open, criteria tags (chips) above the results, Apply, layout / sort changes and the no-results /
// invalid-criterion states. Layout, sort bar and preferences API come from SearchResultsConfigPage (62281), result
// capture (POST /Search/ResultsData) and the Advanced Filters drawer from MessageSearchPage.
// Rules from BasePage apply: locators in the constructor, no assertions here.

const { SearchResultsConfigPage } = require('./searchResultsConfigPage');

const RESULTS_DATA = /\/Search\/ResultsData/i;
const PREFS_GET = /\/Search\/GetColumnPreferences/i;

class BaseSearchPage extends SearchResultsConfigPage {
  constructor(page) {
    super(page);

    // criteria tags above the results: "<Label>: <operator> <value>" + a "Remove <fieldId> filter" button
    this.tagRemoveButtons = page.locator('[aria-label^="Remove "][aria-label$=" filter"]');
    // "No matching records" (grid) / no-results text of the card view
    this.noResultsMessage = page.locator('main').getByText(/no (matching )?records|no records match|no results/i).filter({ visible: true }).first();
    // Insufficient permission page / message
    this.permissionMessage = page.getByText(/permission|not authori[sz]ed|access denied|forbidden/i).filter({ visible: true }).first();
  }

  // ---- navigation ----

  /**
   * Opens a search page and waits for its settings and on-load search (see SearchResultsConfigPage.gotoSearch).
   * The sandbox now and then never answers GetColumnPreferences on a load, so a load is tried twice.
   */
  async gotoSearch(entityId) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.loadSearch(entityId, attempt === 1 ? 30_000 : 45_000);
      } catch (e) {
        if (attempt >= 2) throw e;
      }
    }
  }

  async loadSearch(entityId, timeout) {
    // both waits are created before the navigation; neither may reject unhandled when the other fails
    const prefsP = this.page.waitForResponse(r => PREFS_GET.test(r.url()) && new RegExp(`entityId=${entityId}\\b`).test(r.url()), { timeout }).catch(e => e);
    const resultsP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout }).catch(e => e);
    await this.open(`/Search?entityId=${entityId}`);
    const prefsRes = await prefsP;
    if (prefsRes instanceof Error) throw prefsRes;
    const prefs = await prefsRes.json().catch(() => ({}));
    const request = await resultsP;
    if (request instanceof Error) throw request;
    return { prefs, prefsUrl: prefsRes.url(), results: await this.readResults(request) };
  }

  /**
   * Opens the search page of `entityId` with every criterion cleared (drawer open). The page re-runs the last
   * criteria on load, so that search is awaited first (its late response must not be taken for a later one).
   * Returns what gotoSearch returns for the on-load search: { prefs, prefsUrl, results }.
   */
  async gotoCleared(entityId) {
    const opened = await this.gotoSearch(entityId);
    await this.resetFilters();
    return opened;
  }

  /**
   * Leaves the open search page in Data Grid view and makes the app store it. A layout switch is only searched and
   * stored when there are criteria, so a broad Last Name criterion is applied first when the page is in Card view.
   */
  async ensureGridStored() {
    if (!(await this.isCardView())) return;
    await this.resetFilters();
    await this.setText('LastName', 'a');
    await this.apply();
    await this.closeFilters();
    await this.switchToGrid();
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  }

  /** Stores "no criteria" for the entity: reset + Apply (Apply with nothing set may not search at all). */
  async clearStoredCriteria(entityId) {
    await this.gotoCleared(entityId);
    return this.applyExpectingNoSearch(6_000);
  }

  async closeFilters() {
    if (await this.hasClass(this.filtersDrawer, 'is-open')) {
      await this.filtersDrawer.locator('.right-drawer__close').first().click();
      // wait for the slide-out to finish: a click on the view toggle during it is lost
      await this.page.waitForFunction(el => !el.classList.contains('is-open'), await this.filtersDrawer.elementHandle(), { timeout: 5_000 }).catch(() => {});
      await this.page.waitForTimeout(500);
    }
  }

  // ---- layout ----
  // A layout switch only searches when there are criteria to run (a cleared page stays empty), so the switch waits
  // briefly for a search and returns null when none was started.

  async switchToCard() {
    if (await this.isCardView()) return null;
    return this.switchLayout(this.cardViewToggle, this.cardViewRadio);
  }

  async switchToGrid() {
    if (await this.gridViewRadio.isChecked()) return null;
    return this.switchLayout(this.gridViewToggle, this.gridViewRadio);
  }

  async switchLayout(toggle, radio, timeout = 10_000) {
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout }).catch(() => null);
    await this.closeFilters();
    await toggle.click();
    if (!(await radio.isChecked())) {
      await this.page.waitForTimeout(1_000);
      if (!(await radio.isChecked())) await toggle.click(); // first click lost (page still busy)
    }
    const request = await requestP;
    return request ? this.readResults(request) : null;
  }

  // ---- criteria ----

  /** Text criterion by field id (LastName, FirstName, DisplayName, ...), default operator. */
  async setText(fieldId, value) {
    await this.openFilters();
    const input = this.page.locator(`#${fieldId}_one`);
    await input.fill(value);
    await input.press('Tab');
  }

  async textValue(fieldId) {
    return this.page.locator(`#${fieldId}_one`).inputValue();
  }

  /** True when the criterion has a control marked invalid. */
  async isInvalid(fieldId) {
    return (await this.field(fieldId).locator('.is-invalid').count()) > 0;
  }

  // ---- tags ----

  /** Tag texts, e.g. ["Last Name: contains Patel", "Include Deleted: is No"]. */
  async tagTexts() {
    return this.tagRemoveButtons.evaluateAll(bs => bs
      .filter(b => b.offsetParent)
      .map(b => (b.parentElement ? b.parentElement.textContent : '').replace(/\s+/g, ' ').trim()));
  }

  tagRemoveButton(fieldId) {
    return this.page.locator(`[aria-label="Remove ${fieldId} filter"]`).filter({ visible: true }).first();
  }

  async removeTag(fieldId) {
    await this.tagRemoveButton(fieldId).click();
  }

  // ---- results ----

  /** Records every ResultsData request from now on; returns the live array of request bodies. */
  watchSearches() {
    const searches = [];
    this.page.on('request', r => {
      if (RESULTS_DATA.test(r.url()) && r.method() === 'POST') searches.push(r.postDataJSON() || {});
    });
    return searches;
  }

  /** Visible text of the main area without the results grid / cards (for message checks). */
  async mainTextWithoutResults() {
    return this.page.locator('main').evaluate(m => {
      const c = m.cloneNode(true);
      c.querySelectorAll('#gridViewContainer tbody, #cardViewContent, #filtersDrawer, #customizeTableDrawer').forEach(e => e.remove());
      return (c.innerText ?? c.textContent).replace(/\s+/g, ' ');
    });
  }
}

module.exports = { BaseSearchPage };
