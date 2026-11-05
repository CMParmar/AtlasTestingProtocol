// Configure Search Results (62281): Card / Data Grid toggle, "Customise Table View" drawer (show / hide and reorder
// columns, Save View, Reset to Default), sort bar (primary / secondary + direction) and grid column-heading sorting
// on any /Search?entityId=<n> page. The page is the same Search component as the Message / Person searches, so result
// capture (POST /Search/ResultsData) and the retrying open() are inherited from MessageSearchPage.
//
// Preferences endpoints (sandbox, observed):
//   GET  /Search/GetColumnPreferences?entityId=<n>&layoutTypeId=<1 card | 2 grid>&searchMode=advanced[&reset=true]
//   POST /Search/SaveColumnPreferences { entityId, layoutTypeId, pageSize, columns[{fieldKey,isVisible,displayOrder,customName}], sort, searchMode }
// Rules from BasePage apply: locators in the constructor, no assertions here.

const { MessageSearchPage } = require('./messageSearchPage');

const PREFS_GET = /\/Search\/GetColumnPreferences/i;
const PREFS_SAVE = /\/Search\/SaveColumnPreferences/i;
const RESULTS_DATA = /\/Search\/ResultsData/i;
const LAYOUT = Object.freeze({ CARD: 1, GRID: 2 });

class SearchResultsConfigPage extends MessageSearchPage {
  constructor(page) {
    super(page);

    // ---- view toggle (radio inputs are visually hidden; their labels are the buttons) ----
    this.gridViewRadio = page.locator('#gridView');
    this.cardViewRadio = page.locator('#cardView');
    this.gridViewToggle = page.locator('label[for="gridView"]');
    this.cardViewToggle = page.locator('label[for="cardView"]');

    // ---- grid ----
    this.gridHeaders = this.gridViewContainer.locator('thead th');
    this.gridRows = this.gridViewContainer.locator('tbody tr');
    this.primarySortHeader = this.gridViewContainer.locator('thead th.th-sort-primary');
    this.columnResizers = this.gridViewContainer.locator('thead [class*="resiz"], thead .dt-column-resizer, thead .resize-handle');

    // ---- sort bar (shown in Card view) ----
    this.sortBarPrimary = page.locator('#sortBarPrimary');
    this.sortBarSecondary = page.locator('#sortBarSecondary');
    this.primarySelect = page.locator('#primarySelect');
    this.secondarySelect = page.locator('#secondarySelect');
    this.primaryDirection = page.locator('#primarySort');
    this.secondaryDirection = page.locator('#secondarySort');

    // ---- Customise Table View drawer ----
    this.customizeDrawer = page.locator('#customizeTableDrawer');
    this.customizeClose = this.customizeDrawer.locator('.right-drawer__close');
    this.columnList = page.locator('#columnList');
    this.columnCheckboxes = this.columnList.locator('input.column-checkbox');
    this.orderViewButton = page.locator('#btnSwitchToOrderView');
    this.selectionViewButton = page.locator('#btnSwitchToGeneralView');
    this.orderList = page.locator('#orderColumnList');
    this.orderItems = this.orderList.locator('[data-column]');
    this.saveViewButton = page.locator('#btnSaveView');
    this.resetToDefaultButton = page.locator('#btnResetToDefault');
    this.customizeStatus = page.locator('#customizeTableStatus');

    // ---- toasts (the sandbox banner is excluded) ----
    this.toasts = page.locator('.toast, [role="alert"]').filter({ visible: true }).filter({ hasNotText: 'This is the sandbox' });
  }

  // ---- navigation ----

  /**
   * Opens a search page and waits for its preferences and first results.
   * Returns { prefs, results } - prefs = GetColumnPreferences JSON, results = the ResultsData capture.
   */
  async gotoSearch(entityId) {
    const prefsP = this.page.waitForResponse(r => PREFS_GET.test(r.url()) && new RegExp(`entityId=${entityId}\\b`).test(r.url()), { timeout: 45_000 });
    const resultsP = this.page.waitForRequest(r => RESULTS_DATA.test(r.url()) && r.method() === 'POST', { timeout: 45_000 });
    await this.open(`/Search?entityId=${entityId}`);
    const prefsRes = await prefsP;
    const prefs = await prefsRes.json().catch(() => ({}));
    const results = await this.readResults(await resultsP);
    return { prefs, prefsUrl: prefsRes.url(), results };
  }

  /** Reloads the page and returns the same as gotoSearch. */
  async reloadSearch(entityId) {
    return this.gotoSearch(entityId);
  }

  // ---- preferences API (test set-up / read-back, run inside the signed-in page) ----

  /** fetch() from the page with the anti-forgery token: { status, json, text }. */
  async api(method, url, body) {
    return this.page.evaluate(async ([m, u, bd]) => {
      const t = document.querySelector('input[name="__RequestVerificationToken"]');
      const r = await fetch(u, {
        method: m,
        headers: { 'Content-Type': 'application/json', ...(t ? { RequestVerificationToken: t.value } : {}) },
        body: bd === undefined ? undefined : JSON.stringify(bd),
      });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }
      return { status: r.status, json, text: text.slice(0, 2000) };
    }, [method, url, body]);
  }

  async getPrefs(entityId, layoutTypeId = LAYOUT.GRID) {
    const r = await this.api('GET', `/Search/GetColumnPreferences?entityId=${entityId}&layoutTypeId=${layoutTypeId}&searchMode=advanced`);
    return r.json;
  }

  /** Saves preferences directly: columns [{ fieldKey, isVisible, displayOrder?, customName? }], sort (may be null). */
  async savePrefs(entityId, { columns, sort }, layoutTypeId = LAYOUT.GRID) {
    return this.api('POST', '/Search/SaveColumnPreferences', {
      entityId: String(entityId), layoutTypeId, pageSize: 100, searchMode: 'advanced',
      columns: columns.map((c, i) => ({ fieldKey: c.fieldKey, isVisible: c.isVisible, displayOrder: c.displayOrder ?? i + 1, customName: c.customName ?? null })),
      sort,
    });
  }

  // ---- view toggle ----

  async isCardView() {
    return this.cardViewRadio.isChecked();
  }

  /** Switches to Card view; returns the ResultsData capture it triggered (null if the view was already Card). */
  async switchToCard() {
    if (await this.isCardView()) return null;
    return this.captureResults(() => this.cardViewToggle.click());
  }

  async switchToGrid() {
    if (await this.gridViewRadio.isChecked()) return null;
    return this.captureResults(() => this.gridViewToggle.click());
  }

  // ---- grid ----

  /** Column titles of the grid in display order (action column and sort badges left out). */
  async headerTitles() {
    return this.gridHeaders.evaluateAll(ths => ths
      .filter(th => !th.classList.contains('action-column'))
      .map(th => ((th.querySelector('.dt-column-title') || th).textContent || '').trim())
      .filter(Boolean));
  }

  header(title) {
    return this.gridHeaders.filter({ has: this.page.locator('.dt-column-title', { hasText: new RegExp(`^\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }) }).first();
  }

  /** Title of the heading marked as primary sort (null when none). */
  async primarySortTitle() {
    if (!(await this.primarySortHeader.count())) return null;
    return (await this.primarySortHeader.first().locator('.dt-column-title').innerText()).trim();
  }

  /** aria-sort of a heading: 'ascending' | 'descending' | null. */
  async headerSort(title) {
    return this.header(title).getAttribute('aria-sort');
  }

  /** Clicks a column heading; returns the ResultsData capture it triggered (body.order = requested sort). */
  async clickHeader(title) {
    return this.captureResults(() => this.header(title).locator('.dt-column-title').click());
  }

  /** Cell texts of one column (by its title) on the current grid page. */
  async columnValues(title) {
    const titles = await this.gridHeaders.evaluateAll(ths => ths.map(th => ((th.querySelector('.dt-column-title') || th).textContent || '').trim()));
    const idx = titles.indexOf(title);
    if (idx < 0) return [];
    return this.gridRows.evaluateAll((trs, i) => trs.map(tr => (tr.children[i] ? tr.children[i].innerText : '').trim()), idx);
  }

  /** Record IDs (data-primary-key of the edit action) of the visible grid or card rows, in order. */
  async shownRecordIds() {
    const scope = (await this.isCardView()) ? this.cardViewContainer : this.gridViewContainer;
    return scope.locator('[data-primary-key]').evaluateAll(a => a.map(x => Number(x.getAttribute('data-primary-key'))));
  }

  /** Width (px) of a column heading. */
  async columnWidth(title) {
    const box = await this.header(title).boundingBox();
    return box ? Math.round(box.width) : null;
  }

  /** Drags the right edge of a heading by dx pixels (what a user does to resize a column). */
  async dragColumnEdge(title, dx) {
    const box = await this.header(title).boundingBox();
    const y = box.y + box.height / 2;
    await this.page.mouse.move(box.x + box.width - 2, y);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width - 2 + dx, y, { steps: 10 });
    await this.page.mouse.up();
  }

  // ---- cards ----

  async cardTitles() {
    return this.cards.evaluateAll(cs => cs.map(c => ((c.querySelector('.card-title') || c).textContent || '').trim()));
  }

  // ---- sort bar ----

  /** [{ value, text }] of the primary / secondary sort dropdown. */
  async sortOptions(which = 'primary') {
    const select = which === 'primary' ? this.primarySelect : this.secondarySelect;
    return select.locator('option').evaluateAll(o => o.map(x => ({ value: x.value, text: x.textContent.trim() })));
  }

  async selectedSort(which = 'primary') {
    const wrap = which === 'primary' ? this.sortBarPrimary : this.sortBarSecondary;
    return (await wrap.locator('button.custom-select-button').innerText()).trim();
  }

  /** Picks a sort column by field key (e.g. 'primaryemail'); returns the ResultsData capture. */
  async setSort(which, fieldKey) {
    const wrap = which === 'primary' ? this.sortBarPrimary : this.sortBarSecondary;
    await wrap.locator('button.custom-select-button').click();
    return this.captureResults(() => wrap.locator(`.custom-select-option[data-value="${fieldKey}"]`).click());
  }

  async toggleSortDirection(which = 'primary') {
    const btn = which === 'primary' ? this.primaryDirection : this.secondaryDirection;
    return this.captureResults(() => btn.click());
  }

  // ---- Customise Table View drawer ----

  async openCustomize() {
    if (!(await this.hasClass(this.customizeDrawer, 'is-open'))) await this.customizeButton().click();
    await this.waitForVisible(this.saveViewButton);
    await this.columnCheckboxes.first().waitFor({ state: 'attached', timeout: 10_000 });
  }

  customizeButton() {
    return this.customizeTableButton;
  }

  async closeCustomize() {
    if (await this.hasClass(this.customizeDrawer, 'is-open')) await this.customizeClose.click();
  }

  /** Columns listed in the drawer: [{ key, label, checked }]. */
  async availableColumns() {
    return this.columnCheckboxes.evaluateAll(cbs => cbs.map(cb => ({
      key: cb.dataset.fieldKey,
      label: ((document.querySelector(`label[for="${cb.id}"]`) || {}).textContent || '').trim(),
      checked: cb.checked,
    })));
  }

  async setColumnVisible(fieldKey, on) {
    const cb = this.columnList.locator(`input.column-checkbox[data-field-key="${fieldKey}"]`);
    if ((await cb.isChecked()) !== on) await cb.click();
  }

  async uncheckAllColumns() {
    for (const cb of await this.columnCheckboxes.all()) if (await cb.isChecked()) await cb.click();
  }

  /** Field keys of the "Columns Order" list, top to bottom. */
  async orderedKeys() {
    await this.showOrderView();
    return this.orderItems.evaluateAll(e => e.map(x => x.dataset.column));
  }

  async showOrderView() {
    if (await this.orderList.isHidden()) await this.orderViewButton.click();
    await this.waitForVisible(this.orderList);
  }

  /** Drags column `fieldKey` (by its grip) onto column `targetKey`, i.e. moves it to that position. */
  async dragColumnTo(fieldKey, targetKey) {
    await this.showOrderView();
    await this.orderList.locator(`[data-column="${fieldKey}"] .drag-handle`)
      .dragTo(this.orderList.locator(`[data-column="${targetKey}"]`));
  }

  /**
   * Clicks Save View. Returns { request, response } of POST SaveColumnPreferences, or null when the app saved nothing
   * within `timeout` (e.g. validation stopped it).
   */
  async saveView(timeout = 10_000) {
    const reqP = this.page.waitForRequest(r => PREFS_SAVE.test(r.url()), { timeout }).catch(() => null);
    await this.saveViewButton.click();
    const req = await reqP;
    if (!req) return null;
    const res = await req.response();
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    await this.resultsLoading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    return { request: req.postDataJSON(), status: res.status(), response: json };
  }

  /**
   * Clicks Reset to Default and answers the browser confirm. Returns the GetColumnPreferences JSON it loaded
   * (null if nothing was loaded, e.g. when dismissed).
   */
  async resetToDefault(accept = true) {
    const handler = d => (accept ? d.accept() : d.dismiss());
    this.page.once('dialog', handler);
    const resP = this.page.waitForResponse(r => PREFS_GET.test(r.url()) && /reset=true/i.test(r.url()), { timeout: 10_000 }).catch(() => null);
    await this.resetToDefaultButton.click();
    const res = await resP;
    await this.resultsLoading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    return res ? res.json().catch(() => null) : null;
  }

  // ---- generic ----

  /** Records every SaveColumnPreferences request from now on; returns the live array of request bodies. */
  watchSaves() {
    const saves = [];
    this.page.on('request', r => { if (PREFS_SAVE.test(r.url())) saves.push(r.postDataJSON()); });
    return saves;
  }

  /** Makes POST SaveColumnPreferences fail like a database outage. */
  async failSaves(message = 'SYS-002 Database unavailable') {
    await this.page.route(PREFS_SAVE, r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message }) }));
  }

  async toastTexts() {
    await this.toasts.first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
    return (await this.toasts.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
}

module.exports = { SearchResultsConfigPage, LAYOUT, PREFS_SAVE };
