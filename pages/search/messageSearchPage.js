// Conversation Message search (62151): top-bar Quick Search with the "Message" record type and the
// Advanced Filters drawer on /Search?entityId=18. Results are rendered as cards from the JSON returned by
// POST /Search/ResultsData, so every search action returns that JSON for the spec to assert on.
// Rules from BasePage apply: locators in the constructor, no assertions here.

const { BasePage } = require('../basePage');
const { ROUTES } = require('../../utils/constants');

const MESSAGE_ENTITY_ID = '18';
const RESULTS_DATA = /\/Search\/ResultsData/i;
const LOOKUP = /\/Search\/LookupEntity/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class MessageSearchPage extends BasePage {
  constructor(page) {
    super(page);

    // ---- top-bar Quick Search (quickSearchInput / quickSearchButton come from BasePage) ----
    this.scopeButton = page.locator('.search-cntrl button.custom-select-button[aria-label="Scope"]');
    this.scopeOptionList = page.locator('.search-cntrl .custom-select-option:not(.placeholder)');
    this.advancedSearchIcon = page.locator('#kt_drawer_chat_toggle .filter-icon-div');

    // ---- results ----
    this.resultsCount = page.locator('main').getByText(/^\s*Results:/).first();
    this.resultsError = page.locator('#resultsErrorMessage');
    this.resultsLoading = page.locator('#resultsLoading');
    this.cardViewContainer = page.locator('#cardViewContainer');
    this.gridViewContainer = page.locator('#gridViewContainer');
    this.customizeTableButton = page.locator('#btnOpenCustomizeTable');
    this.cards = page.locator('#cardViewContent .card');
    this.pagination = page.locator('#cardViewPagination');
    this.nextPageButton = this.pagination.locator('button.page-link.next');

    // ---- Advanced Filters drawer ----
    this.openFiltersButton = page.locator('#btnOpenAdvancedFilters');
    this.filtersDrawer = page.locator('#filtersDrawer');
    this.filterLabels = this.filtersDrawer.locator('label.form-label');
    this.applyButton = page.locator('#btnApply');
    this.resetButton = page.locator('#btnReset');
    this.messageTextInput = page.locator('#MessageText_one');
    this.authorInput = page.locator('#AuthorPersonID_one');
    this.accountScopeInput = page.locator('#RootAccountID_one');
    this.projectScopeInput = page.locator('#ProjectScopeProjectID_one');
    this.dateOnInput = page.locator('#DateCreatedUtc_one');
    this.dateStartInput = page.locator('#DateCreatedUtc_two_start');
    this.dateEndInput = page.locator('#DateCreatedUtc_two_end');
  }

  /** Criterion container in the drawer: MessageText, MessageSource, AuthorPersonID, DateCreatedUtc, EntityIDF, RootAccountID, ProjectScopeProjectID. */
  field(fieldId) {
    return this.filtersDrawer.locator(`[data-field-id="${fieldId}"]`);
  }

  /** Validation message element of a criterion (e.g. DateCreatedUtc "Start must be <= End"), visible or not. */
  fieldFeedback(fieldId) {
    return this.field(fieldId).locator('.invalid-feedback').filter({ hasText: /[A-Za-z]{3}/ }).first();
  }

  /** Quick Search that may not run at all (e.g. too-short text): resolves to the results or null. */
  async quickSearchIfRuns(text, timeout = 10_000) {
    await this.chooseQuickSearchScope('Message');
    await this.quickSearchInput.fill(text);
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout }).catch(() => null);
    await this.quickSearchButton.click();
    const request = await requestP;
    return request ? this.readResults(request) : null;
  }

  /** "Please select a value from the list" message of an entity picker (Author / Account / Project scope). */
  pickerError(fieldId) {
    return this.field(fieldId).locator('.field-validation-error');
  }

  // ---- navigation ----

  /** Any signed-in page that carries the top bar (Quick Search lives there). */
  async gotoStart() {
    await this.open(ROUTES.TASK);
    await this.waitForVisible(this.quickSearchInput);
  }

  /** page.goto with retries: the sandbox occasionally resets connections (ERR_CONNECTION_RESET / timeouts). */
  async open(path) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await super.open(path);
      } catch (e) {
        if (attempt >= 3 || !/ERR_CONNECTION|ERR_NETWORK|ERR_EMPTY_RESPONSE|ERR_TIMED_OUT|Timeout/i.test(e.message)) throw e;
        await this.page.waitForTimeout(3_000 * attempt);
      }
    }
  }

  /**
   * Advanced search page for messages with every criterion cleared. The app remembers the last criteria and re-runs
   * that search on load, so wait for it before resetting (its late response must not be mistaken for ours).
   */
  async gotoAdvanced() {
    const autoSearch = this.page.waitForResponse(r => RESULTS_DATA.test(r.url()), { timeout: 6_000 }).catch(() => null);
    await this.open(`/Search?entityId=${MESSAGE_ENTITY_ID}`);
    await this.waitForVisible(this.openFiltersButton);
    await autoSearch;
    await this.resetFilters();
  }

  // ---- search actions (each returns the ResultsData request + response) ----

  /**
   * Runs `action` and returns what the results grid asked for and got:
   * { status, body, criteria, json, rows, total, error }.
   */
  async captureResults(action) {
    // match the REQUEST issued by this action (a response to an earlier, still-running search must not be taken)
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout: 45_000 });
    await action();
    return this.readResults(await requestP);
  }

  /** Waits for a ResultsData request's response and returns { status, body, criteria, json, rows, total, error }. */
  async readResults(request) {
    const response = await request.response();
    const body = request.postDataJSON() || {};
    let json = {};
    try { json = await response.json(); } catch { json = {}; }
    await this.resultsLoading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    let criteria = [];
    try { criteria = JSON.parse(body.criteriaJson || '[]'); } catch { criteria = []; }
    return {
      status: response.status(), body, criteria, json,
      rows: json.data || [], total: json.recordsFiltered ?? 0, error: json.error || null,
    };
  }

  async chooseQuickSearchScope(label = 'Message') {
    await this.scopeButton.click();
    await this.scopeOptionList.filter({ hasText: new RegExp(`^\\s*${esc(label)}\\s*$`) }).first().click();
  }

  /** Texts of the record types offered by the Quick Search scope dropdown. */
  async quickSearchScopes() {
    return this.page.locator('#searchScopeSelect option').evaluateAll(o => o.map(x => x.textContent.trim()).filter(Boolean));
  }

  /** Top-bar Quick Search: Record Type = Message, type the text, click Search. */
  async quickSearch(text) {
    // a navigation still settling from the previous step would block the Search click
    await this.page.waitForLoadState('load').catch(() => {});
    await this.chooseQuickSearchScope('Message');
    await this.quickSearchInput.fill(text);
    return this.captureResults(() => this.quickSearchButton.click());
  }

  /** Opens Advanced Search from the filter icon inside the Quick Search box. */
  async openAdvancedFromQuickSearch() {
    await this.chooseQuickSearchScope('Message');
    await this.advancedSearchIcon.click();
    await this.waitForVisible(this.openFiltersButton);
  }

  async openFilters() {
    if (!(await this.hasClass(this.filtersDrawer, 'is-open'))) await this.openFiltersButton.click();
    await this.waitForVisible(this.applyButton);
  }

  async resetFilters() {
    await this.openFilters();
    await this.resetButton.click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.openFilters();
  }

  /** Clicks Apply and returns the results it produced. */
  async apply() {
    await this.openFilters();
    return this.captureResults(() => this.applyButton.click());
  }

  /** Clicks Apply when the app may refuse to search (validation): resolves to the results or null. */
  async applyExpectingNoSearch(timeout = 8_000) {
    await this.openFilters();
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout }).catch(() => null);
    await this.applyButton.click();
    const request = await requestP;
    return request ? this.readResults(request) : null;
  }

  async goToNextPage() {
    return this.captureResults(() => this.nextPageButton.click());
  }

  // ---- criteria ----

  async setMessageText(text) {
    await this.messageTextInput.fill(text);
  }

  /** Picks an option of a custom dropdown inside `container` by its visible text. */
  async chooseCustom(container, label) {
    await container.locator('button.custom-select-button').first().click();
    await container.locator('.custom-select-option')
      .filter({ hasText: new RegExp(`^\\s*${esc(label)}\\s*$`) }).first().click();
  }

  /** 'All' | 'Only System messages' | 'Only Human messages' */
  async setMessageSource(label) {
    await this.chooseCustom(this.field('MessageSource').locator('[data-arity="one"]'), label);
  }

  /** Entity type (conversation context), e.g. 'Account', 'Project', 'Service'. */
  async setEntityType(label) {
    await this.chooseCustom(this.field('EntityIDF').locator('[data-arity="one"]'), label);
  }

  /** Changes a criterion's operator (e.g. DateCreatedUtc -> 'between'). */
  async chooseOperator(fieldId, value) {
    const f = this.field(fieldId);
    await f.locator('a.op-link').click();
    await f.locator('button[aria-label^="Operator for"]').click();
    await f.locator(`.custom-select-option[data-value="${value}"]`).click();
  }

  /** Message date range, both ends as yyyy-mm-dd (operator "between"). */
  async setDateRange(start, end) {
    await this.chooseOperator('DateCreatedUtc', 'between');
    await this.dateStartInput.fill(start);
    await this.dateEndInput.fill(end);
  }

  /**
   * Types `name` into an entity picker and selects the matching lookup suggestion.
   * Returns the id the picker resolved (Person / Account / Project id).
   */
  async pickEntity(fieldId, name) {
    const input = this.page.locator(`#${fieldId}_one`);
    const lookup = this.page.waitForResponse(r => LOOKUP.test(r.url()), { timeout: 15_000 }).catch(() => null);
    await input.fill('');
    await input.pressSequentially(name.trim(), { delay: 40 });
    await lookup;
    const match = ([id, n]) => [...document.querySelectorAll(`#dl_${id} option`)]
      .some(o => o.value.trim().toLowerCase() === n.trim().toLowerCase());
    await this.page.waitForFunction(match, [fieldId, name], { timeout: 15_000 }).catch(() => {});
    const value = await this.page.locator(`#dl_${fieldId} option`).evaluateAll(
      (opts, n) => (opts.find(o => o.value.trim().toLowerCase() === n.trim().toLowerCase()) || {}).value || null, name);
    if (!value) throw new Error(`"${name}" is not offered by the ${fieldId} lookup - set it in the root .env (see testData/messageSearchData.js)`);
    await input.fill(value);
    await input.dispatchEvent('input');
    await input.dispatchEvent('change');
    const selected = this.field(fieldId).locator('.selected-id');
    await this.page.waitForFunction(el => !!el.value, await selected.elementHandle(), { timeout: 10_000 }).catch(() => {});
    return selected.inputValue();
  }

  /** Types text into an entity picker without choosing a suggestion (free text). */
  async typeEntityText(fieldId, text) {
    await this.page.locator(`#${fieldId}_one`).fill(text);
  }

  async setAuthor(name) { return this.pickEntity('AuthorPersonID', name); }
  async setAccountScope(name) { return this.pickEntity('RootAccountID', name); }
  async setProjectScope(name) { return this.pickEntity('ProjectScopeProjectID', name); }

  // ---- value getters ----

  async visibleFilterLabels() {
    return (await this.filterLabels.allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  /** Operators a criterion offers: [{ value, text }]. */
  async operatorOptions(fieldId) {
    return this.field(fieldId).locator('select.op-select option')
      .evaluateAll(o => o.map(x => ({ value: x.value, text: x.textContent.trim() })));
  }

  /** Option texts of a dropdown criterion (single-value control). */
  async dropdownOptions(fieldId) {
    return this.page.locator(`#${fieldId}_one option`).evaluateAll(o => o.map(x => x.textContent.trim()));
  }

  /** Text on a dropdown criterion's button (current selection or placeholder). */
  async dropdownText(fieldId) {
    return (await this.field(fieldId).locator('[data-arity="one"] button.custom-select-button').innerText()).trim();
  }

  async isMultiSelect(fieldId) {
    return this.page.locator(`#${fieldId}_one`).evaluate(el => el.multiple === true);
  }

  /** Number shown after "Results:" (null when not shown). */
  async resultsTotal() {
    if (!(await this.isVisibleWithin(this.resultsCount, 5_000))) return null;
    const m = (await this.resultsCount.innerText()).replace(/,/g, '').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  /** Everything a result card shows. */
  async cardDetails(index = 0) {
    return this.cards.nth(index).evaluate(card => {
      const fields = {};
      card.querySelectorAll('.card-field').forEach(f => {
        const label = f.querySelector('.field-label');
        const value = f.querySelector('.field-value');
        if (label) fields[label.textContent.replace(/:\s*$/, '').trim()] = (value ? value.innerText : '').trim();
      });
      const msg = card.querySelector('.field-group-message .field-value');
      return {
        id: (card.querySelector('[data-primary-key]') || { getAttribute: () => '' }).getAttribute('data-primary-key') || '',
        title: ((card.querySelector('.card-title') || {}).textContent || '').trim(),
        groups: [...card.querySelectorAll('.group-label')].map(g => g.textContent.trim()),
        message: msg ? msg.innerText.trim() : '',
        fields,
        highlighted: [...card.querySelectorAll('mark, .highlight, .search-highlight, .hl, em.match, b.match')]
          .map(e => e.textContent.trim()).filter(Boolean),
        text: card.innerText,
      };
    });
  }

  /** Clicks a result's open icon. Returns the page it landed on (a new tab if the app opens one). */
  async openResult(index = 0) {
    const link = this.cards.nth(index).locator('[data-action-type="edit"], a[href]').first();
    const popupP = this.page.context().waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    await link.click();
    const target = (await popupP) || this.page;
    await target.waitForLoadState('domcontentloaded');
    return target;
  }
}

module.exports = { MessageSearchPage, MESSAGE_ENTITY_ID };
