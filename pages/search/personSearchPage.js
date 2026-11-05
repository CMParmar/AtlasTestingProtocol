// Person search (62237): top-bar Quick Search with the "Person" record type and the Advanced Filters drawer on
// /Search?entityId=9. The Search page is the same component as the Message search, so the generic plumbing
// (capturing POST /Search/ResultsData, drawer, operators, entity pickers, cards) is inherited from MessageSearchPage;
// this class only overrides what is entity-specific and adds the Person criteria.
// Rules from BasePage apply: locators in the constructor, no assertions here.

const { MessageSearchPage } = require('./messageSearchPage');

const PERSON_ENTITY_ID = '9';
const SCOPE = 'Person';
const RESULTS_DATA = /\/Search\/ResultsData/i;
const LOOKUP = /\/Search\/LookupEntity/i;
const OPENED_RECORD = /\/Person\/Edit\/(\d+)/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class PersonSearchPage extends MessageSearchPage {
  constructor(page) {
    super(page);

    // ---- Advanced Filters drawer: collapsible groups (Identity, Contact, Address, Organization, Roles & Access, Classification) ----
    this.sectionToggles = this.filtersDrawer.locator('.filter-collapsible');
    this.collapsedSections = this.filtersDrawer.locator('.filter-collapsible[aria-expanded="false"]');
    this.includeDeletedCheckbox = page.locator('#chk_IsArchived');

    // ---- results ----
    this.criteriaChips = page.locator('main').getByRole('button', { name: /^Remove .* filter$/ });
    // Person results open in Data Grid (DataTables paging) after Advanced Search and in Card view after Quick Search
    this.nextPageButton = page.locator('button.page-link.next').filter({ visible: true }).first();
  }

  // ---- navigation ----

  /**
   * Person advanced search with every criterion cleared and every drawer section expanded. The app re-runs the
   * last criteria on load, so wait for that search before resetting (its late response must not be taken for ours).
   */
  async gotoAdvanced() {
    const autoSearch = this.page.waitForResponse(r => RESULTS_DATA.test(r.url()), { timeout: 6_000 }).catch(() => null);
    await this.open(`/Search?entityId=${PERSON_ENTITY_ID}`);
    await this.waitForVisible(this.openFiltersButton);
    await autoSearch;
    await this.resetFilters();
    await this.expandAllSections();
  }

  /** Opens every collapsed group of the drawer so all criteria can be used. */
  async expandAllSections() {
    await this.openFilters();
    for (let i = 0; i < 10 && (await this.collapsedSections.count()); i++) {
      await this.collapsedSections.first().click();
      await this.page.waitForTimeout(250);
    }
  }

  /** Clicks Apply and returns the results it produced (drawer sections stay usable afterwards). */
  async apply() {
    await this.openFilters();
    return this.captureResults(() => this.applyButton.click());
  }

  // ---- Quick Search ----

  /**
   * Top-bar Quick Search for people. When exactly one person matches, the app skips the results page and opens
   * /Person/Edit/<id>; the ResultsData body is then gone, so the result carries `openedId` instead of rows:
   * { status, body, criteria, json, rows, total, error, openedId }.
   */
  async quickSearch(text) {
    await this.page.waitForLoadState('load').catch(() => {});
    await this.chooseQuickSearchScope(SCOPE);
    await this.quickSearchInput.fill(text);
    const requestP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout: 45_000 });
    await this.quickSearchButton.click();
    const request = await requestP;
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

  /** Text criterion (DisplayName, FirstName, PrimaryEmail, PhoneNumberE164, City, PostalCode, AccountNumber, ...). */
  async setText(fieldId, value, operator) {
    if (operator) await this.chooseOperator(fieldId, operator);
    await this.page.locator(`#${fieldId}_one`).fill(value);
  }

  /** Operator currently shown on a criterion's "change operator" link (e.g. "contains", "is", "starts with"). */
  async operatorText(fieldId) {
    return (await this.field(fieldId).locator('a.op-link').innerText()).trim();
  }

  /** Single-value dropdown criterion (StaffRoleIds, HasUserAccount, LanguageIDF) by visible option text. */
  async setDropdown(fieldId, label) {
    await this.chooseCustom(this.field(fieldId).locator('[data-arity="one"]'), label);
  }

  /** Multi-value dropdown criterion (StaffRoleIds): operator "is any of" + every label selected. */
  async setDropdownMulti(fieldId, labels) {
    await this.chooseOperator(fieldId, 'in');
    const select = this.page.locator(`#${fieldId}_list`);
    const values = await select.locator('option').evaluateAll(
      (opts, wanted) => opts.filter(o => wanted.includes(o.textContent.trim())).map(o => o.value), labels);
    await select.selectOption(values, { force: true });
    await select.dispatchEvent('change');
  }

  /** Entity picker (SecurityRoleIds, LaborGradeIDF, TagIds): picks one value from the lookup; returns its id. */
  async pickOne(fieldId, name) {
    try {
      return await this.pickEntity(fieldId, name);
    } catch (e) {
      throw new Error(e.message.replace('testData/messageSearchData.js', 'testData/personSearchData.js'));
    }
  }

  /** Entity picker in "is any of" mode: each name is typed and chosen from the suggestion list (tokens). */
  async pickMany(fieldId, names) {
    await this.chooseOperator(fieldId, 'in');
    const input = this.page.locator(`#${fieldId}_list`);
    const suggestions = this.page.locator(`#sug_${fieldId}`);
    for (const name of names) {
      const lookup = this.page.waitForResponse(r => LOOKUP.test(r.url()), { timeout: 15_000 }).catch(() => null);
      await input.fill('');
      await input.pressSequentially(name, { delay: 40 });
      await lookup;
      const option = suggestions.locator('*').filter({ hasText: new RegExp(`^\\s*${esc(name)}\\s*$`) }).last();
      if (await this.isVisibleWithin(option, 5_000)) await option.click();
      else await input.press('Enter');
    }
  }

  /** Free text in an entity picker without choosing a suggestion. */
  async typePickerText(fieldId, text) {
    await this.page.locator(`#${fieldId}_one`).fill(text);
  }

  async setIncludeDeleted(on) {
    if ((await this.includeDeletedCheckbox.isChecked()) !== on) await this.includeDeletedCheckbox.click();
  }

  // ---- value getters ----

  /** Group titles of the drawer, in order. */
  async sectionNames() {
    return (await this.sectionToggles.allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  /** Option texts of the multi-value control (used for "is any of"). */
  async multiOptions(fieldId) {
    return this.page.locator(`#${fieldId}_list option`).evaluateAll(o => o.map(x => x.textContent.trim()).filter(Boolean));
  }

  /** Suggestions an entity picker's lookup returns for `text` (single-value control). */
  async lookupSuggestions(fieldId, text) {
    const input = this.page.locator(`#${fieldId}_one`);
    const lookup = this.page.waitForResponse(r => LOOKUP.test(r.url()), { timeout: 10_000 }).catch(() => null);
    await input.fill('');
    await input.pressSequentially(text, { delay: 40 });
    await lookup;
    await this.page.waitForTimeout(500);
    return this.page.locator(`#dl_${fieldId} option`).evaluateAll(o => o.map(x => x.value.trim()).filter(Boolean));
  }

  /** {text, value} of a dropdown criterion's options (placeholder "Select..." left out, duplicates removed). */
  async dropdownValues(fieldId) {
    const all = await this.field(fieldId).locator('select:not(.op-select) option').evaluateAll(
      o => o.map(x => ({ text: x.textContent.trim(), value: x.value })).filter(x => x.value));
    return all.filter((o, i) => all.findIndex(x => x.value === o.value) === i);
  }

  // ---- test-data discovery (not the search under test) ----

  /**
   * Number of people the server returns for `criteria` ([{ fieldId, operatorKey, values }]). Used to pick values
   * that exist in the sandbox right now - its data is reset regularly, so fixed names stop matching.
   */
  async countPeople(criteria) {
    const token = this.page.locator('input[name="__RequestVerificationToken"]');
    if (!(await token.count())) await this.open(`/Search?entityId=${PERSON_ENTITY_ID}`);
    return this.page.evaluate(async ([entityId, crit]) => {
      const t = document.querySelector('input[name="__RequestVerificationToken"]');
      const r = await fetch('/Search/ResultsData', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { RequestVerificationToken: t.value } : {}) },
        body: JSON.stringify({ draw: 0, start: 0, length: 1, order: [], columns: [], search: null, entityId, layoutId: 1,
          criteriaJson: JSON.stringify(crit), searchMode: 'advanced', applyNewSorting: false }),
      });
      if (!r.ok) throw new Error(`ResultsData probe failed: HTTP ${r.status}`);
      const j = await r.json();
      return j.recordsFiltered ?? 0;
    }, [PERSON_ENTITY_ID, criteria]);
  }

  /**
   * Every row of a search, not only the grid's first page. Replays the captured ResultsData request (same criteria,
   * same ordering) page by page. Use it when comparing result sets: a person on page 2 of one search would otherwise
   * look "missing" from another.
   */
  async allRows(res, pageSize = 100) {
    if (!res || !res.body || res.total <= res.rows.length) return res ? res.rows : [];
    const token = this.page.locator('input[name="__RequestVerificationToken"]');
    if (!(await token.count())) await this.open(`/Search?entityId=${PERSON_ENTITY_ID}`);
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

  /** Texts of the criteria chips shown above the results (e.g. "Include Deleted: is No"). */
  async chipTexts() {
    return this.page.locator('main').evaluate(m => [...m.querySelectorAll('[aria-label^="Remove "][aria-label$=" filter"]')]
      .map(b => (b.parentElement ? b.parentElement.textContent : '').replace(/\s+/g, ' ').trim()));
  }
}

module.exports = { PersonSearchPage, PERSON_ENTITY_ID };
