// Page object for the Manage Tasks list (/task, titled "My Assignments"): My/Team scope toggle,
// All / Tasks / Work Items / Favorites tabs, the advanced-search ("Filters") drawer and the grouped result list.
// The scope, record-type tab and the open drawer are remembered per user by the app, so specs always set them
// explicitly through selectScope() / selectTab().
// No assertions here -- methods act or return values; specs assert.

const { TaskPage } = require('./taskPage');
const { MANAGE_TASK } = require('../../utils/constants');

// Column positions inside a result row (the two record types use different tables)
const COLUMN = Object.freeze({
  WORK_ITEM: { ACCOUNT: 3, PROJECT: 4, SERVICE: 5, DUE: 7, STAFF_ROLE: 8, ASSIGNED: 9 },
  TASK: { RELATED: 3, DUE: 4, ASSIGNED: 5 },
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

class ManageTaskPage extends TaskPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Header: scope toggle and record-type tabs ------------------
    this.pageTitle = page.locator('.assignments-root .page-title, #assignments-root .page-title').first();
    this.scopeToggle = page.locator('#btnAssignmentsScope');
    this.allCount = page.locator('#assignments-count-all');
    this.tasksCount = page.locator('#assignments-count-tasks');
    this.workItemsCount = page.locator('#assignments-count-workitems');
    this.favoritesCount = page.locator('#assignments-count-favorites');
    this.filtersButton = page.locator('#btnAssignmentsFilters');
    this.loadingIndicator = page.locator('#assignments-loading');

    // ---- Result list -------------------------------------------------
    this.list = page.locator('#assignments-list');
    this.listWrap = page.locator('#assignments-list-wrap');
    this.groupHeaders = page.locator('.assignments-group__header');
    this.groupTitles = page.locator('.assignments-group__title');
    this.rows = page.locator('.assignments-row');
    this.taskRows = page.locator('.assignments-row--task');
    this.workItemRows = page.locator('.assignments-row--workitem');
    this.rowIndicators = page.locator('.assignments-row--workitem .assignments-status');
    this.rowNames = page.locator('.assignments-row .assignments-name');
    this.favoriteStars = page.locator('.assignments-star');

    // ---- Filters drawer ----------------------------------------------
    this.filterPanel = page.locator('#assignments-filter-panel');
    this.openFilterPanel = page.locator('#assignments-filter-panel.is-open');
    this.filtersCloseButton = page.locator('#btnAssignmentsFiltersClose');
    this.accountProjectInput = page.locator('#fltAccountProject');
    this.accountProjectSuggestions = page.locator('#fltAccountProjectSuggest .assignments-autosuggest__item');
    this.accountIdInput = page.locator('#fltAccountId');
    this.projectIdInput = page.locator('#fltProjectId');
    this.dueDateSelect = page.locator('#fltDueDate');
    this.taskStatusSelect = page.locator('#fltTaskStatus');
    this.indicatorSelect = page.locator('#fltDisplayIndicator');
    this.staffRoleSelect = page.locator('#fltStaffRole');
    this.assignedToSelect = page.locator('#fltAssignedTo');
    this.keywordInput = page.locator('#fltKeyword');
    this.keywordClearButton = page.locator('#btnKeywordClear');
    this.applyButton = page.locator('#btnAssignmentsApply');
    this.resetButton = page.locator('#btnAssignmentsReset');
    this.filterChips = page.locator('#assignments-filter-chips .badge');
    this.chipRemoveButtons = page.locator('#assignments-filter-chips [data-chip-key]');

    // ---- Right panel (Work Item / Task / Create Task all reuse it) -----
    this.sidePanel = page.locator('#slideOutPanel.is-open');
    this.sidePanelHeading = this.sidePanel.getByRole('heading');
    this.sidePanelCloseButton = this.sidePanel.locator('.right-drawer__close');
    this.sidePanelTitleTextBox = this.sidePanel.locator('#ActionItemName');
    this.sidePanelStatusSelect = this.sidePanel.locator('#IsComplete');
    this.sidePanelSaveButton = this.sidePanel.locator('#btnSaveTask');
    // -----------------------------------------------------------------
  }

  // ---- Navigation / waits ---------------------------------------------

  /** Opens /task and waits until the list has finished its first load. */
  async openManageTasks() {
    await this.navigateWithRetry();
    await this.waitForListLoaded();
  }

  /** The sandbox occasionally drops a connection (ERR_CONNECTION_TIMED_OUT); retry the navigation a few times. */
  async navigateWithRetry(attempts = 3) {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.navigateToTaskPage();
        return;
      } catch (error) {
        if (attempt >= attempts || !/net::ERR_/.test(String(error.message))) throw error;
        await this.page.waitForTimeout(2_000 * attempt);
      }
    }
  }

  /** The scope toggle is disabled and a spinner is shown while the list loads. */
  async waitForListLoaded() {
    await this.scopeToggle.waitFor({ state: 'visible' });
    await this.page.locator('#btnAssignmentsScope:not([disabled])').waitFor({ timeout: 90_000 });
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 90_000 });
    // the spinner can be gone before the next reload has started: let in-flight requests settle too
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  /** Switches scope when needed (My / Team) and waits for the reload. */
  async selectScope(scope) {
    if ((await this.getScope()) !== scope) {
      await this.click(this.scopeToggle);
      await this.page.locator(`#btnAssignmentsScope[data-scope="${scope}"]`).waitFor();
    }
    await this.waitForListLoaded();
  }

  /** @param {string} tab MANAGE_TASK.TAB value */
  async selectTab(tab) {
    await this.click(this.tabButton(tab));
    await this.page.locator(`button.assignments-tab.active[data-tab="${tab}"]`).waitFor();
    await this.waitForListLoaded();
  }

  tabButton(tab) {
    return this.page.locator(`button.assignments-tab[data-tab="${tab}"]`);
  }

  /** Sets the explicit starting state used by every spec: scope, record-type tab, no filters. */
  async prepare(scope, tab) {
    await this.openManageTasks();
    await this.selectScope(scope);
    await this.selectTab(tab);
    await this.resetFilters();
  }

  // ---- Filters drawer ---------------------------------------------------

  async openFilters() {
    if (!(await this.openFilterPanel.count())) {
      // the button is hidden on Favorites and re-appears only after the list re-renders
      await this.filtersButton.waitFor({ state: 'visible', timeout: 60_000 });
      await this.click(this.filtersButton);
      await this.openFilterPanel.waitFor();
    }
  }

  async closeFilters() {
    if (await this.openFilterPanel.count()) {
      await this.click(this.filtersCloseButton);
      await this.openFilterPanel.waitFor({ state: 'detached' });
    }
  }

  /** Apply keeps the drawer open; the list reloads in place. */
  async applyFilters() {
    await this.openFilters();
    await this.click(this.applyButton);
    await this.waitForListLoaded();
  }

  /** Reset All Filters (also closes the drawer). */
  async resetFilters() {
    await this.openFilters();
    await this.click(this.resetButton);
    await this.waitForListLoaded();
    await this.closeFilters();
  }

  async filterByDueDate(label) {
    await this.openFilters();
    await this.dueDateSelect.selectOption({ label });
    await this.applyFilters();
  }

  async filterByTaskStatus(label) {
    await this.openFilters();
    await this.taskStatusSelect.selectOption({ label });
    await this.applyFilters();
  }

  async filterByIndicator(label) {
    await this.openFilters();
    await this.indicatorSelect.selectOption({ label });
    await this.applyFilters();
  }

  async filterByStaffRole(label) {
    await this.openFilters();
    await this.staffRoleSelect.selectOption({ label });
    await this.applyFilters();
  }

  async filterByAssignedTo(label) {
    await this.openFilters();
    await this.assignedToSelect.selectOption({ label });
    await this.applyFilters();
  }

  async searchByKeyword(text) {
    await this.openFilters();
    await this.fill(this.keywordInput, text);
    await this.applyFilters();
  }

  /** Types in the Account/Project box and picks the first suggestion; returns its caption. */
  async pickAccountProject(text) {
    await this.openFilters();
    await this.fill(this.accountProjectInput, text);
    const first = this.accountProjectSuggestions.first();
    await first.waitFor();
    const caption = (await first.innerText()).trim();
    await first.click();
    return caption;
  }

  async filterByAccountProject(text) {
    const caption = await this.pickAccountProject(text);
    await this.applyFilters();
    return caption;
  }

  async removeChip(key) {
    await this.click(this.page.locator(`#assignments-filter-chips [data-chip-key="${key}"]`));
    await this.waitForListLoaded();
  }

  // ---- Row actions --------------------------------------------------------

  rowByName(name) {
    return this.rows.filter({ has: this.page.locator('.assignments-name', { hasText: name }) }).first();
  }

  async openRow(row) {
    await this.click(row.locator('.assignments-name'));
    await this.sidePanel.waitFor();
  }

  async closeSidePanel() {
    await this.click(this.sidePanelCloseButton);
    await this.sidePanel.waitFor({ state: 'detached' });
  }

  async toggleFavorite(row) {
    await this.click(row.locator('.assignments-star'));
  }

  // ---- Value getters (for specs to assert on) --------------------------------

  async getScope() {
    return this.scopeToggle.getAttribute('data-scope');
  }

  async getActiveTab() {
    return this.page.locator('button.assignments-tab.active').getAttribute('data-tab');
  }

  async getCount(locator) {
    const text = (await locator.innerText()).replace(/[^\d]/g, '');
    return Number(text || '0');
  }

  async getGroupTitleList() {
    return (await this.groupTitles.allInnerTexts()).map(t => t.trim());
  }

  /** Number shown in a section title, e.g. "Not Done (76)" -> 76. */
  static countInTitle(title) {
    const m = title.match(/\((\d+)\)\s*$/);
    return m ? Number(m[1]) : NaN;
  }

  /** Rows of one section; section bodies carry ids like assignments-group-readytocomplete. */
  async getGroups() {
    return this.page.evaluate(() => [...document.querySelectorAll('.assignments-group__header')].map(h => {
      const body = document.getElementById(h.getAttribute('aria-controls'));
      const rows = body ? [...body.querySelectorAll('.assignments-row')] : [];
      return {
        title: h.innerText.trim(),
        rows: rows.map(r => ({
          kind: r.dataset.kind,
          name: (r.querySelector('.assignments-name')?.innerText || '').trim(),
          cells: [...r.children].map(td => td.innerText.trim().replace(/\s+/g, ' ')),
          indicator: r.querySelector('.assignments-status')?.getAttribute('aria-label') || '',
        })),
      };
    }));
  }

  /** All rows flattened, each tagged with the title of its section. */
  async getRows() {
    const groups = await this.getGroups();
    return groups.flatMap(g => g.rows.map(r => ({ ...r, group: g.title })));
  }

  /** Cell text of a row for a given column of its record type. */
  static cell(row, column) {
    const map = row.kind === 'task' ? COLUMN.TASK : COLUMN.WORK_ITEM;
    return row.cells[map[column]] ?? '';
  }

  /** "08 Nov 2026" -> Date (local midnight); the no-value dash -> null. */
  static parseListDate(text) {
    const m = (text || '').match(/(\d{1,2}) ([A-Za-z]{3}) (\d{4})/);
    return m ? new Date(Number(m[3]), MONTHS.indexOf(m[2]), Number(m[1])) : null;
  }

  static get NO_VALUE() {
    return MANAGE_TASK.NO_VALUE;
  }

  async getChipTexts() {
    return (await this.filterChips.allInnerTexts()).map(t => t.trim());
  }

  async getSelectOptions(select) {
    return (await select.locator('option').allTextContents()).map(t => t.trim());
  }

  async isFilterVisible(locator) {
    await this.openFilters();
    return locator.isVisible();
  }

  // ---- Create Task from the list ---------------------------------------------

  async createTask(title, statusLabel) {
    await this.openCreateTaskDrawer();
    await this.drawerHeading.waitFor();
    await this.enterTitle(title);
    if (statusLabel) await this.selectStatusByLabel(statusLabel);
    await this.clickSave();
  }
}

module.exports = { ManageTaskPage, COLUMN };
