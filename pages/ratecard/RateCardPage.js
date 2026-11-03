const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { env } = require('../../utils/testData');

const num = text => Number(String(text).replace(/[^0-9.-]/g, ''));
/** The rates grid prints dates as yyyy-mm-dd in data-start / data-end; kept for callers that compare dates. */
const showsDate = (text, iso) => String(text || '').includes(iso);

/** Rate editor fields by test-data key -> form field name (#formRateCardLine). */
const FIELDS = {
  targetType: 'RateCardLineTargetIDF', target: 'TargetIDF', billingType: 'BillingTypeIDF', unitOfMeasure: 'UnitOfMeasureIDF',
  rate: 'Rate', effectiveStart: 'EffectiveStartDate', effectiveEnd: 'EffectiveEndDate',
  subscriptionTerm: 'SubscriptionTermIDF', subscriptionInterval: 'SubscriptionIntervalIDF',
};
const TARGET_TYPE_NAMES = { 1: 'Person', 2: 'Labor Grade', 3: 'Service Item', 4: 'Bundle' };

/** Row menu commands (class of the item in the row's "More options" menu). */
const COMMANDS = {
  edit: 'rc-mnu-update', delete: 'rc-mnu-delete', reinstate: 'rc-mnu-reinstate', references: 'rc-mnu-refs',
  change: 'rc-mnu-change', discontinue: 'rc-mnu-discontinue', updateOutOfDate: 'rc-mnu-update-ood',
};

/**
 * View & Edit Rate Card (use case 63150): /RateCard/Edit/{RATE_CARD_ID} (default 1), script /js/rateCardEdit.js.
 *   Header: #rate-card-title (e.g. DEFAULT), Signals; tabs Rates / Accounts / Documents / Audit; "Actions" menu
 *   (#rcActionsDropdown): Add Rate, View Unpriced Targets, Clone the Rate Card, Archive the Rate Card.
 *   Rates tab: Target Type filter (#rc-filter-target-type), "Rates as of" (#rc-filter-asof), "Search rate",
 *   "Add Rate" (#rc-btn-add-rate). The grid (#rc-lines-table, loaded from /RateCard/LinesGrid) has one row per line
 *   with data-line-number / data-target-type / data-target-name / data-rate / data-start / data-end / data-lock and a
 *   "More options" menu (Edit, Delete Rate, Reinstate, References, ...). DataTables shows 10 rows per page, so
 *   checks read the same LinesGrid response in full (linesAsOf).
 *   Rate editor: slide-out #slideOutPanel with #formRateCardLine (fields in FIELDS) and Save (#btnSaveRateCardLine);
 *   Save posts /RateCard/SaveLine and saves that one line immediately (no card-level Save / Cancel).
 *   Messages: #modal-rc-scenario (title, body, Ok / Got it), delete confirmation #modal-rc-delete (Yes / Go Back),
 *   field errors under the fields (.field-validation-error), e.g. a negative Rate.
 */
class RateCardPage extends BasePage {
  constructor(page) {
    super(page);
    this.main = page.locator('main');
    this.title = page.locator('#rate-card-title');
    this.addRateButton = page.locator('#rc-btn-add-rate');
    this.establishCommand = this.addRateButton;
    this.actionsButton = page.locator('#rcActionsDropdown');
    this.actionAddRate = page.locator('#btn-establish-rate');
    this.actionUnpriced = page.locator('#btn-view-unavailable');
    this.actionArchive = page.locator('#btn-archive-rate-card');
    this.filterTargetType = page.locator('#rc-filter-target-type');
    this.asOfInput = page.locator('#rc-filter-asof');
    this.searchInput = page.locator('#rc-filter-search');
    this.gridHost = page.locator('#rc-lines-grid-host');
    this.linesTable = page.locator('#rc-lines-table');
    this.lineRows = page.locator('#rc-lines-table tbody tr[data-line-id]');
    this.count = page.locator('#rc-lines-count');
    // slide-out (rate editor, unpriced targets, references)
    this.drawer = page.locator('#slideOutPanel.is-open');
    this.overlay = this.drawer;
    this.editorForm = this.drawer.locator('#formRateCardLine');
    this.lineSaveButton = this.drawer.locator('#btnSaveRateCardLine');
    this.drawerClose = this.drawer.locator('[data-drawer-close]').first();
    this.fieldErrors = this.drawer.locator('.field-validation-error, .input-validation-error + .text-danger').filter({ hasText: /[A-Za-z]{3}/ });
    this.unavailType = this.drawer.locator('#rc-unavail-target-type');
    this.unavailAsOf = this.drawer.locator('#rc-unavail-asof');
    this.unavailItems = this.drawer.locator('[data-target-id]').filter({ has: page.locator('.rc-unavail-add') });
    // modals
    this.scenarioModal = page.locator('#modal-rc-scenario.show');
    this.scenarioTitle = this.scenarioModal.locator('#rc-scenario-title');
    this.scenarioPrimary = this.scenarioModal.locator('#rc-scenario-primary');
    this.scenarioSecondary = this.scenarioModal.locator('#rc-scenario-secondary');
    this.deleteModal = page.locator('#modal-rc-delete.show');
    this.deleteConfirm = this.deleteModal.locator('#rc-delete-confirm');
    this.archivedBadge = this.main.getByText(/\bArchived\b/i).filter({ visible: true }).first();
  }

  // ---------- open / grid ----------

  /**
   * Opens the rate card under test and waits for its rates; returns { id, url, name, today } - today = the default
   * "Rates as of" date (the server's current date), or the local date if the field is empty.
   */
  async openCard() {
    await this.openRecord(`/RateCard/Edit/${env.rateCardId}`);
    await this.expectOpen();
    const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    return {
      id: String(env.rateCardId), url: this.page.url(), name: (await this.title.innerText()).trim(),
      today: (await this.asOfInput.inputValue().catch(() => '')) || local,
    };
  }

  async expectOpen() {
    await expect(this.addRateButton, 'Rate card page ("Add Rate" button)').toBeVisible({ timeout: 30_000 });
    await this.waitGrid();
  }

  /** Waits until the rates grid has loaded (or reported that it could not). */
  async waitGrid() {
    await expect(this.gridHost.locator('.rc-lines-grid, .text-danger').first(), 'Rates grid loaded').toBeVisible({ timeout: 30_000 });
  }

  /** MF-2: "Rates as of" a date (yyyy-mm-dd); waits for the grid to reload. */
  async viewAsOf(date) {
    await Promise.all([
      this.page.waitForResponse(r => r.url().includes('/RateCard/LinesGrid') && r.url().includes(`asOfDate=${date}`), { timeout: 30_000 }),
      this.asOfInput.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, date),
    ]);
    await this.waitGrid();
  }

  /** Re-opens the rate card, optionally as of `date`. */
  async reopen(url, date) {
    await this.openRecord(url);
    await this.expectOpen();
    if (date) await this.viewAsOf(date);
  }

  /** Parses grid rows (Element[] in the browser) into plain line objects. */
  static rowData(rows) {
    return rows.map(r => ({
      lineId: r.dataset.lineId, lineNumber: r.dataset.lineNumber, targetTypeId: r.dataset.targetType,
      target: r.dataset.targetName, rate: r.dataset.rate, rateDisplay: r.dataset.rateDisplay || '',
      start: r.dataset.start, end: r.dataset.end || '', lock: r.dataset.lock || '', outOfDate: r.dataset.outOfDate === 'true',
      billingType: (r.cells[2] ? r.cells[2].innerText : '').trim(), text: r.innerText.replace(/\s+/g, ' ').trim(),
    }));
  }

  /** Lines displayed on the current grid page. */
  async lines() {
    const rows = await this.lineRows.evaluateAll(RateCardPage.rowData);
    return rows.map(l => ({ ...l, targetType: TARGET_TYPE_NAMES[l.targetTypeId] || '' }));
  }

  /** Every line in effect on `date` (the full LinesGrid response, not just the first grid page). */
  async linesAsOf(date) {
    const html = await this.page.evaluate(async ({ id, d }) => {
      const r = await fetch(`/RateCard/LinesGrid?id=${id}${d ? `&asOfDate=${d}` : ''}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      return r.text();
    }, { id: env.rateCardId, d: date || '' });
    const rows = await this.page.evaluate(h => {
      const doc = new DOMParser().parseFromString(h, 'text/html');
      return [...doc.querySelectorAll('tr[data-line-id]')].map(r => ({
        lineId: r.dataset.lineId, lineNumber: r.dataset.lineNumber, targetTypeId: r.dataset.targetType,
        target: r.dataset.targetName, rate: r.dataset.rate, rateDisplay: r.dataset.rateDisplay || '',
        start: r.dataset.start, end: r.dataset.end || '', lock: r.dataset.lock || '', outOfDate: r.dataset.outOfDate === 'true',
        billingType: (r.cells[2] ? r.cells[2].textContent : '').trim(), text: r.textContent.replace(/\s+/g, ' ').trim(),
      }));
    }, html);
    return rows.map(l => ({ ...l, targetType: TARGET_TYPE_NAMES[l.targetTypeId] || '' }));
  }

  /** Lines of `target` that start on `start` (looked up as of that date). */
  async findLines(target, start) {
    return (await this.linesAsOf(start)).filter(l => l.target === target && l.start === start);
  }

  /**
   * Grid row of `target` starting on `start`; shows the grid as of `asOf` (default: that date; null keeps the current
   * "Rates as of") and searches for the target first.
   */
  async row(target, start, { asOf = start } = {}) {
    if (asOf) await this.viewAsOf(asOf);
    await Promise.all([
      this.page.waitForResponse(r => r.url().includes('/RateCard/LinesGrid'), { timeout: 30_000 }),
      this.searchInput.fill(target),
    ]);
    await this.waitGrid();
    const row = this.page.locator(`#rc-lines-table tbody tr[data-start="${start}"]`).filter({ hasText: target }).first();
    await expect(row, `Rate for "${target}" starting ${start} listed`).toBeVisible();
    return row;
  }

  /** Opens the row's "More options" menu and runs `command` (key of COMMANDS). False when the line does not offer it. */
  async rowAction(row, command) {
    await row.locator('.rc-row-menu').click();
    const item = this.page.locator(`.dropdown-menu.show .${COMMANDS[command]}`);
    if (!(await item.count())) {
      await this.page.keyboard.press('Escape');
      return false;
    }
    await item.click();
    return true;
  }

  /** Captions of the commands in the row's "More options" menu. */
  async rowCommands(row) {
    await row.locator('.rc-row-menu').click();
    const items = (await this.page.locator('.dropdown-menu.show .dropdown-item').allInnerTexts()).map(t => t.trim()).filter(Boolean);
    await this.page.keyboard.press('Escape');
    return items;
  }

  // ---------- rate editor ----------

  /** "Add Rate" (toolbar button, or the Actions menu item) -> rate editor. */
  async openAddRate({ viaActions = false } = {}) {
    if (viaActions) {
      await this.actionsButton.click();
      await this.actionAddRate.click();
    } else {
      await this.addRateButton.click();
    }
    await this.expectEditor();
  }

  async expectEditor() {
    await expect(this.editorForm, 'Rate editor (slide-out)').toBeVisible({ timeout: 15_000 });
    await expect(this.lineSaveButton, 'Save button of the rate editor').toBeVisible();
  }

  async formScope() {
    return this.drawer;
  }

  /** A rate editor field by key (see FIELDS). */
  async field(name) {
    const n = FIELDS[name];
    return this.editorForm.locator(`[name="${n}"], [name$=".${n}"], #${n}`).first();
  }

  /** Non-empty option texts of a select field; waits for asynchronously loaded options (Target). */
  async options(name, { wait = name === 'target' } = {}) {
    const control = await this.field(name);
    const options = control.locator('option:not([value=""])');
    if (wait) await expect.poll(() => options.count(), { timeout: 10_000 }).toBeGreaterThan(0).catch(() => {});
    return (await options.allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  /** Current text of a field ('' when empty). */
  async value(name) {
    const control = await this.field(name);
    if (!(await control.count())) return '';
    if ((await control.evaluate(e => e.tagName)) === 'SELECT') {
      return (await control.inputValue()) ? (await control.locator('option:checked').innerText()).trim() : '';
    }
    return (await control.inputValue()).trim();
  }

  /**
   * Picks an option of a select field: the one containing `text`, else the `index`-th offered option that is not in
   * `avoid`. Returns the option text ('' when there is none).
   */
  async choose(name, text, index = 0, avoid = []) {
    const control = await this.field(name);
    await expect(control, `${name} field`).toBeVisible();
    const offered = await this.options(name, { wait: name === 'target' });
    const wanted = String(text || '').toLowerCase();
    const pick = text ? offered.find(o => o.toLowerCase() === wanted) || offered.find(o => o.toLowerCase().includes(wanted))
      : offered.filter(o => !avoid.includes(o))[index];
    if (!pick) return '';
    await control.selectOption({ label: pick });
    if (name === 'targetType') {
      // the Target list is reloaded for the new type
      await expect.poll(async () => (await this.field('target')).evaluate(s => s.options.length), { timeout: 10_000 }).toBeGreaterThan(0).catch(() => {});
      await this.page.waitForTimeout(300);
    }
    return pick;
  }

  async setValue(name, value) {
    const control = await this.field(name);
    await expect(control, `${name} field`).toBeVisible();
    await control.fill(value);
    await control.press('Tab');
  }

  /**
   * Fills the rate editor: Target Type, Target (data.target, else the first offered one not in `avoid`), Billing Type
   * (Time & Material preferred for people / labor grades), Unit of Measure, Rate and dates.
   * Returns the values used, or null when the Target Type offers no usable target.
   */
  async fillRate(data, { avoid = [] } = {}) {
    const used = {};
    if (data.targetType) {
      used.targetType = await this.choose('targetType', data.targetType);
      used.target = await this.choose('target', data.target, data.targetIndex || 0, data.target ? [] : avoid);
      if (!used.target) return null;
    }
    if (data.targetType || data.billingType) {
      const preferred = data.billingType || (/Labor|Person/.test(data.targetType || '') ? 'Time' : '');
      used.billingType = (preferred && await this.choose('billingType', preferred)) || await this.choose('billingType');
    }
    if (data.targetType || data.unitOfMeasure) used.unitOfMeasure = await this.choose('unitOfMeasure', data.unitOfMeasure);
    if (data.subscriptionInterval) used.subscriptionInterval = await this.choose('subscriptionInterval', data.subscriptionInterval);
    if (data.subscriptionTerm) used.subscriptionTerm = await this.choose('subscriptionTerm', data.subscriptionTerm);
    for (const key of ['rate', 'effectiveStart', 'effectiveEnd']) {
      if (data[key] !== undefined) {
        await this.setValue(key, data[key]);
        used[key] = data[key];
      }
    }
    return used;
  }

  /**
   * Save in the rate editor (posts /RateCard/SaveLine). Returns { saved, posted }: saved = the editor closed after a
   * successful save; posted = false when client-side validation stopped it.
   */
  async saveLine() {
    const response = this.page.waitForResponse(r => r.url().includes('/RateCard/SaveLine'), { timeout: 15_000 }).catch(() => null);
    await this.lineSaveButton.click();
    const posted = !!(await response);
    if (!posted) return { saved: false, posted };
    await expect.poll(async () => ((await this.scenarioModal.isVisible()) || !(await this.drawer.isVisible()) || (await this.fieldErrors.count()) > 0),
      { timeout: 15_000 }).toBe(true);
    // a successful save closes the editor (a "No rate remains" notice may follow); a rejected one keeps it open
    const saved = !(await this.drawer.isVisible());
    if (saved) await this.waitGrid();
    return { saved, posted };
  }

  /** Kept for the flow helpers: Save in the rate editor. */
  async done() {
    return this.saveLine();
  }

  /** Closes the slide-out with X; answers an unsaved-changes warning with Continue (true) / Cancel (false). Returns the warning text. */
  async closeDrawer(continueWithoutSaving = true) {
    let text = '';
    const onDialog = d => { text = d.message(); return continueWithoutSaving ? d.accept() : d.dismiss(); };
    this.page.once('dialog', onDialog);
    await this.drawerClose.click();
    // "Unsaved Changes" dialog: Cancel / Continue Without Saving (not necessarily a bootstrap .modal.show)
    // matched by its buttons, not by a modal class: the dialog's markup is not a plain bootstrap .modal
    const keep = this.page.getByText(/^\s*Continue Without Saving\s*$/i).filter({ visible: true }).first();
    const cancel = this.page.getByText(/^\s*Cancel\s*$/i).filter({ visible: true }).first();
    if (await keep.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) {
      text = (await this.page.getByText(/unsaved changes/i).filter({ visible: true }).last().locator('xpath=ancestor::*[.//text()[contains(., "Continue Without Saving")]][1]').innerText()
        .catch(() => 'Unsaved Changes')).replace(/\s+/g, ' ').trim();
      await (continueWithoutSaving ? keep : cancel).click();
      await expect(keep).toBeHidden({ timeout: 10_000 });
    }
    this.page.off('dialog', onDialog);
    return text;
  }

  // ---------- messages ----------

  /** The scenario modal when its text matches `title`. */
  scenario(title) {
    return this.page.locator('#modal-rc-scenario.show, #modal-rc-delete.show').filter({ hasText: title });
  }

  /** Any visible error: a field error in the editor or a scenario message. */
  get anyError() {
    return this.fieldErrors.or(this.scenarioModal).first();
  }

  /** Clicks a button of the open scenario message by caption. */
  async answer(title, caption) {
    await this.scenario(title).getByRole('button', { name: new RegExp(`^\\s*${caption}\\s*$`, 'i') }).click();
    await expect(this.scenarioModal).toBeHidden();
  }

  // ---------- row commands ----------

  /** MF-12: Delete Rate on a row; returns the confirmation text ("Delete this Rate? ..."); `confirm` = Yes, else Go Back. */
  async deleteLine(row, confirm = true) {
    expect(await this.rowAction(row, 'delete'), 'Delete Rate command').toBe(true);
    await expect(this.deleteModal, '"Delete this Rate?" confirmation').toBeVisible();
    const text = (await this.deleteModal.innerText()).replace(/\s+/g, ' ').trim();
    if (confirm) {
      await Promise.all([
        this.page.waitForResponse(r => r.url().includes('/RateCard/DeleteLine'), { timeout: 15_000 }),
        this.deleteConfirm.click(),
      ]);
      await this.waitGrid();
    } else {
      await this.deleteModal.getByRole('button', { name: 'Go Back' }).click();
    }
    return text;
  }

  // ---------- actions menu ----------

  /** MF-3: Actions -> View Unpriced Targets for `targetType` as of `date`. */
  async openUnpriced(targetType, date) {
    if (date) await this.viewAsOf(date);
    await this.actionsButton.click();
    await this.actionUnpriced.click();
    await expect(this.unavailType, 'Unpriced Targets panel').toBeVisible({ timeout: 15_000 });
    if (targetType && (await this.unavailType.locator('option:checked').innerText()).trim() !== targetType) {
      await Promise.all([
        this.page.waitForResponse(r => r.url().includes('/RateCard/UnavailableTargets'), { timeout: 15_000 }),
        this.unavailType.selectOption({ label: targetType }),
      ]);
      await expect(this.unavailType).toBeVisible();
    }
  }

  /** MF-9: Actions -> Archive the Rate Card; returns the confirmation text. `confirm` = Yes, else Go Back. */
  async archive(confirm) {
    await this.actionsButton.click();
    await this.actionArchive.click();
    await expect(this.scenarioModal, '"Archive the Rate Card" confirmation').toBeVisible();
    const text = (await this.scenarioModal.innerText()).replace(/\s+/g, ' ').trim();
    if (confirm) {
      await Promise.all([
        this.page.waitForResponse(r => r.url().includes('/RateCard/Archive'), { timeout: 15_000 }),
        this.scenarioPrimary.click(),
      ]);
      await this.page.waitForLoadState('domcontentloaded');
    } else {
      await this.scenarioSecondary.click();
      await expect(this.scenarioModal).toBeHidden();
    }
    return text;
  }
}

module.exports = { RateCardPage, showsDate, num, TARGET_TYPE_NAMES };
