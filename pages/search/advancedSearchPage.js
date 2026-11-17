// Advanced Search Criteria Capture (62200): the criteria drawer built from the entity's Search configuration,
// Apply / Clear All (the "Reset" button) and the restore of the last-used criteria on return.
// Everything else (navigation, ResultsData capture, tags, stored-criteria clean-up) comes from BaseSearchPage.
// Rules from BasePage apply: locators in the constructor, no assertions here.

const { BaseSearchPage } = require('./baseSearchPage');

const RESULTS_DATA = /\/Search\/ResultsData/i;
const PREFS_GET = /\/Search\/GetColumnPreferences/i;

class AdvancedSearchPage extends BaseSearchPage {
  constructor(page) {
    super(page);
    // A3-1: "Configuration error - Advanced search configuration not available for this entity."
    this.configErrorMessage = page.getByText(/advanced search configuration not available/i).filter({ visible: true }).first();
    this.clearAllButton = page.getByRole('button', { name: /clear all/i });
    // red "Configuration error • <message>" banner shown instead of the criteria when the config cannot be read
    this.configErrorBanner = page.locator('main').getByText(/configuration error/i).filter({ visible: true }).first();
  }

  /**
   * Opens the search page and waits until it shows either its criteria (Advanced Filters) or the configuration error
   * banner. Returns { available, message } - message is the banner text (e.g. "Configuration error • Missing_search_configuration").
   * Used as a fast pre-check: without a configuration the page never requests its settings, so gotoSearch would only time out.
   */
  async searchState(entityId, timeout = 30_000) {
    await this.open(`/Search?entityId=${entityId}`);
    const ready = await this.openFiltersButton.or(this.configErrorBanner).first()
      .waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (await this.openFiltersButton.isVisible()) return { available: true, message: '' };
    const message = ready ? (await this.configErrorBanner.locator('xpath=..').innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : '';
    return { available: false, message: message || '(neither criteria nor an error shown within the timeout)' };
  }

  /** Throws a readable error when the entity's Advanced Search is not available (no configuration for this user). */
  async requireSearch(entityId) {
    const { available, message } = await this.searchState(entityId);
    if (!available) {
      throw new Error(`Advanced Search is not available for entityId=${entityId}: "${message}". `
        + 'The signed-in user has no Search configuration (SET.<Module>.<Entity>.SearchCriteria) for this entity in the sandbox - '
        + 'restore the setting (or its Global fallback) and re-run.');
    }
  }

  /** Opens a search page that may have no configuration (no settings / search requests): no waits on the network. */
  async openWithoutConfig(entityId) {
    await this.open(`/Search?entityId=${entityId}`);
    await this.configErrorBanner.or(this.openFiltersButton).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  }

  /**
   * Opens the search page (again) and returns the search it runs on load: { results } like gotoSearch.
   * Waits for the navigation to COMMIT before listening for ResultsData, so a late search of the page being left
   * (e.g. still running after Apply / Reset on a slow sandbox) cannot be taken for the on-load search.
   */
  async reopenSearch(entityId, timeout = 60_000) {
    await this.page.goto(`/Search?entityId=${entityId}`, { waitUntil: 'commit', timeout });
    const request = await this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout });
    const results = await this.readResults(request);
    await this.openFiltersButton.waitFor({ state: 'visible', timeout });
    return { results };
  }

  /**
   * Opens the search page once and returns what it loaded: { state, prefs, prefsUrl, results }.
   * prefs = JSON of GetColumnPreferences for the entity (read before anything else navigates), results = on-load search.
   */
  async loadWithSettings(entityId, timeout = 60_000) {
    const prefsP = this.page.waitForResponse(r => PREFS_GET.test(r.url()) && new RegExp(`entityId=${entityId}\\b`).test(r.url()), { timeout })
      .then(async r => ({ url: r.url(), json: await r.json().catch(() => ({})) })).catch(() => null);
    const resultsP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout })
      .then(r => this.readResults(r)).catch(() => null);
    const state = await this.searchState(entityId, timeout);
    if (!state.available) return { state };
    const prefs = await prefsP;
    return { state, prefs: prefs ? prefs.json : null, prefsUrl: prefs ? prefs.url : '', results: await resultsP };
  }

  /** Changes a criterion's operator by key (contains, isEmpty, isNotEmpty, between, ...). */
  async chooseOperator(fieldId, operatorKey) {
    await this.openFilters();
    const f = this.field(fieldId);
    const link = f.locator('a.op-link');
    if (await link.isVisible().catch(() => false)) await link.click();
    await f.locator('button.custom-select-button[aria-label^="Operator for"]').click();
    await f.locator(`.custom-select-option[data-value="${operatorKey}"]`).click();
  }

  /** Text on the operator button of a criterion, e.g. "contains" / "is not empty". */
  async operatorText(fieldId) {
    return (await this.field(fieldId).locator('button.custom-select-button[aria-label^="Operator for"]').innerText()).trim();
  }

  /** Validation messages shown under a criterion. */
  async fieldErrors(fieldId) {
    return (await this.field(fieldId).locator('.invalid-feedback, .field-validation-error').filter({ visible: true }).allInnerTexts())
      .map(t => t.trim()).filter(Boolean);
  }

  /** Clicks Clear All (labelled "Reset" in the app). */
  async clearAll() {
    await this.openFilters();
    await this.resetButton.click();
    await this.page.waitForTimeout(500);
  }

  /** Number of ResultsData requests started while `action` runs and `ms` afterwards. */
  async searchesDuring(action, ms = 4_000) {
    let n = 0;
    const h = r => { if (RESULTS_DATA.test(r.url()) && r.method() === 'POST') n++; };
    this.page.on('request', h);
    try {
      await action();
      await this.page.waitForTimeout(ms);
    } finally {
      this.page.off('request', h);
    }
    return n;
  }
}

module.exports = { AdvancedSearchPage };
