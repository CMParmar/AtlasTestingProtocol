const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { ROUTES } = require('../../utils/constants');

const CREATE = /\/Service\/Create/i;

/**
 * Create Service (use case 62433): /Service/Create[?AccountID={id}|?ProjectID={id}] - the UI calls a Service a
 * "Deliverable" (form #form-service, posts to /Service/Create). Reached from Add New or from a Project's Deliverables
 * tab ("Add Deliverable" -> /Service/Create?ProjectID={id}).
 * Form (sandbox): Account * (#AccountIDF, option value = account id), Deliverable Type * = Service Item
 * (#ServiceItemIDF), Workflow Template (#WorkflowTemplateVersionIDF, filled by AJAX once a Deliverable Type is chosen;
 * the item's default template is pre-selected), Deliverable Name * (#ServiceName), Project (#ProjectIDF, filled by AJAX
 * once an Account is chosen), Deliverable Status * (#ServiceStatusIDF, default Active), Deliverable Stage *
 * (#ServiceStageIDF - disabled and set from the template while a template is selected), Description, "visible to the
 * customer" checkbox (#IsCustomerFacing), Billing Type (#AuthoritativeBillingTypeIDF - only the item's allowed types),
 * Estimated Hours (#EstimatedHours), Date Ordered (#OrderedDate), Scheduled Start Date (#ScheduledStartDate),
 * Due Date (#DueDate) - the dates are <input type="date">. Save button + Cancel link.
 * There is no change-request ("originating service") control yet.
 */
class ServicePage extends BasePage {
  constructor(page) {
    super(page);
    this.form = page.locator('#form-service');
    this.account = page.locator('#AccountIDF');
    this.serviceItem = page.locator('#ServiceItemIDF');
    this.template = page.locator('#WorkflowTemplateVersionIDF');
    this.serviceName = page.locator('#ServiceName');
    this.project = page.locator('#ProjectIDF');
    this.status = page.locator('#ServiceStatusIDF');
    this.stage = page.locator('#ServiceStageIDF');
    this.description = page.locator('#Description');
    this.customerFacing = page.locator('#IsCustomerFacing');
    this.billingType = page.locator('#AuthoritativeBillingTypeIDF');
    this.estimatedHours = page.locator('#EstimatedHours');
    this.orderedDate = page.locator('#OrderedDate');
    this.scheduledStart = page.locator('#ScheduledStartDate');
    this.dueDate = page.locator('#DueDate');
    // the UI is localized per user (sandbox user may be on Gujarati): buttons / links / tabs are located by type, href and id, never by caption
    this.saveButton = this.form.locator('button[type="submit"]');
    this.cancelLink = this.form.locator('a[href^="/Service/Create"]');
    // change request (MF-1.5): not on the sandbox form yet - located by label / name when it appears
    this.originatingControl = page.locator('#form-service').getByLabel(/originating|change request|derived/i)
      .or(page.locator('#form-service [name*="DerivedFrom" i]:not([type="hidden"])')).first();
    // saved Deliverable (/Service/Edit/{id}): tabs Details, Documents, Work Items, Related Deliverables, History, Tasks, Dashboard, Audit
    this.tabs = page.locator('main .nav-tabs .nav-link');   // data-bs-target = #pane-details | #pane-docs | #pane-workitems | #pane-change-requests | #pane-history | #pane-tasks | #pane-dashboard | #pane-audit
    this.workItems = page.locator('#pane-workitems .work-item-row');
    this.historyRows = page.locator('#pane-history tr.tr-history');
    this.auditPane = page.locator('#pane-audit');
    this.validationErrors = page.locator('[data-valmsg-for], .field-validation-error, .text-danger, .invalid-feedback, .validation-summary-errors, .alert-danger')
      .filter({ visible: true, hasText: /[\p{L}\p{M}]{3}/u });   // any script, incl. combining vowel signs (the UI may be localized)
    this.validationError = this.validationErrors.first();
  }

  static createPath({ accountId, projectId } = {}) {
    if (projectId) return `${ROUTES.SERVICE_CREATE}?ProjectID=${projectId}`;
    return accountId ? `${ROUTES.SERVICE_CREATE}?AccountID=${accountId}` : ROUTES.SERVICE_CREATE;
  }

  /** Opens the form; the sandbox sometimes stalls on navigation, so one retry is made. Waits for the form's AJAX lists to load. */
  async gotoCreate(params) {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.openRecord(ServicePage.createPath(params));
        break;
      } catch (e) {
        if (attempt >= 2) throw e;
      }
    }
    await this.expectFormOpen();
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  async expectFormOpen() {
    await expect(this.page).toHaveURL(CREATE);
    await expect(this.saveButton, 'Create Deliverable form (Save button)').toBeVisible({ timeout: 30_000 });
  }

  // --- generic control helpers ---

  /** Text of a select's current value ('' when unset) or an input's value. */
  async valueText(control) {
    if ((await control.evaluate(e => e.tagName)) === 'SELECT') {
      return (await control.inputValue()) ? (await control.locator('option:checked').innerText()).trim() : '';
    }
    return (await control.inputValue()).trim();
  }

  /** Non-empty option texts of a select. */
  async optionTexts(select) {
    return (await select.locator('option:not([value=""])').allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  /** Option values (ids) of a select, without the empty "Select" option. */
  async optionValues(select) {
    return select.locator('option:not([value=""])').evaluateAll(os => os.map(o => o.value));
  }

  /** Re-reads `read` until it returns the same value `rounds` times in a row - AJAX-filled selects settle after a change. */
  async settled(read, { interval = 400, rounds = 3 } = {}) {
    let last = JSON.stringify(await read());
    for (let same = 0; same < rounds;) {
      await this.page.waitForTimeout(interval);
      const now = JSON.stringify(await read());
      same = now === last ? same + 1 : 0;
      last = now;
    }
    return JSON.parse(last);
  }

  /** Picks an option by its visible text (exact) or by its value. */
  async pick(select, { text, value }) {
    const v = value !== undefined ? String(value)
      : await select.locator('option').evaluateAll((os, t) => (os.find(o => o.text.trim() === t) || {}).value, text);
    if (v === undefined) throw new Error(`Option "${text}" not found`);
    await select.selectOption(v, { force: true });
  }

  /** Selects the empty option; false when the select has none. */
  async clearSelect(select) {
    if (!(await select.locator('option[value=""]').count())) return false;
    await select.selectOption('', { force: true });
    return true;
  }

  // --- the form ---

  /** Chooses an Account and waits for the Project list to reload (GET /EntityField/GetEntityFieldOptions). */
  async selectAccount(id) {
    await Promise.all([
      this.page.waitForResponse(r => /GetEntityFieldOptions/i.test(r.url()) && /AccountIDF=/i.test(r.url()), { timeout: 30_000 }),
      this.account.selectOption(String(id), { force: true }),
    ]);
    return this.settled(() => this.optionValues(this.project), { rounds: 2 });
  }

  /** Chooses a Deliverable Type (Service Item) and waits for the template, billing type and hours (GET /Service/GetServiceItemDefaults). */
  async selectItem(itemName) {
    await Promise.all([
      this.page.waitForResponse(r => /GetServiceItemDefaults/i.test(r.url()), { timeout: 30_000 }),
      this.pick(this.serviceItem, { text: itemName }),
    ]);
    await this.settled(async () => [await this.optionValues(this.template), await this.template.inputValue(),
      await this.billingType.inputValue(), await this.estimatedHours.inputValue()], { rounds: 2 });
  }

  /** The defaults the current Deliverable Type applied. */
  async itemDefaults() {
    return {
      templates: await this.optionTexts(this.template),
      template: await this.valueText(this.template),
      billingTypes: await this.optionTexts(this.billingType),
      billingType: await this.valueText(this.billingType),
      estimatedHours: await this.estimatedHours.inputValue(),
      stage: await this.valueText(this.stage),
      stageLocked: await this.stage.isDisabled(),
    };
  }

  async selectProject(id) {
    await this.project.selectOption(String(id), { force: true });
  }

  /** MF-2: fills the form. Undefined fields are left as the form set them; '' clears a select / input. */
  async fillForm({ accountId, item, serviceName, projectId, stage, templateText, noTemplate = false, description,
    billingType, estimatedHours, orderedDate, scheduledStart, dueDate, customerFacing }) {
    if (accountId && (await this.account.inputValue()) !== String(accountId)) await this.selectAccount(accountId);
    if (item) await this.selectItem(item);
    if (serviceName !== undefined) await this.serviceName.fill(serviceName);
    if (projectId) await this.selectProject(projectId);
    if (noTemplate) {
      await this.clearSelect(this.template);
      await expect(this.stage, 'Stage becomes editable once the template is removed').toBeEnabled();
    } else if (templateText) await this.pick(this.template, { text: templateText });
    if (stage && !(await this.stage.isDisabled())) await this.pick(this.stage, { text: stage });
    if (description !== undefined) await this.description.fill(description);
    if (billingType) await this.pick(this.billingType, { text: billingType });
    if (estimatedHours !== undefined) await this.estimatedHours.fill(String(estimatedHours));
    if (orderedDate !== undefined) await this.orderedDate.fill(orderedDate);
    if (scheduledStart !== undefined) await this.scheduledStart.fill(scheduledStart);
    if (dueDate !== undefined) await this.dueDate.fill(dueDate);
    if (customerFacing !== undefined) await this.customerFacing.setChecked(customerFacing, { force: true });
    return this.formValues();
  }

  /** Every field as shown (select = option text) - what the test records and compares with the saved record. */
  async formValues() {
    const optional = async (control, key) => ((await this.valueText(control)) ? { [key]: await this.valueText(control) } : {});
    return {
      account: await this.valueText(this.account),
      serviceItem: await this.valueText(this.serviceItem),
      serviceName: await this.valueText(this.serviceName),
      serviceStatus: await this.valueText(this.status),
      ...(await optional(this.project, 'project')),
      ...(await optional(this.template, 'templateVersion')),
      ...(await optional(this.stage, 'serviceStage')),
      ...(await optional(this.description, 'description')),
      ...(await optional(this.billingType, 'billingType')),
      ...(await optional(this.estimatedHours, 'estimatedHours')),
      ...(await optional(this.orderedDate, 'orderedDate')),
      ...(await optional(this.scheduledStart, 'scheduledStart')),
      ...(await optional(this.dueDate, 'dueDate')),
    };
  }

  /** MF-3: saves and waits for the saved Deliverable to open. Returns { url, id }. */
  async submitNew() {
    await this.saveButton.click();
    await expect(this.page, 'Deliverable saved and opened (still on /Service/Create means the save was rejected)')
      .not.toHaveURL(CREATE, { timeout: 30_000 });
    await this.page.waitForLoadState('domcontentloaded');
    return { url: this.page.url(), id: this.recordIdFromUrl() };
  }

  /** Save for a negative test: waits for a validation error or a (wrong) save. Returns { saved, url, id }. */
  async trySave() {
    await this.saveButton.click();
    await expect.poll(async () => {
      if (!CREATE.test(this.page.url())) return 'saved';
      return (await this.validationError.isVisible()) ? 'rejected' : '';
    }, { timeout: 30_000 }).not.toBe('');
    const saved = !CREATE.test(this.page.url());
    if (saved) await this.page.waitForLoadState('domcontentloaded');
    return { saved, url: this.page.url(), id: saved ? this.recordIdFromUrl() : '' };
  }

  /** The value is shown on the saved Deliverable: as text, an input value or a selected option. */
  async expectShown(value, what) {
    await expect.poll(() => this.page.locator('main').evaluate((m, v) => {
      const c = m.cloneNode(true);
      c.querySelectorAll('select, script, style, template').forEach(e => e.remove());
      const texts = [c.textContent,
        ...[...m.querySelectorAll('input, textarea')].map(e => e.value),
        ...[...m.querySelectorAll('select')].map(s => (s.selectedOptions[0] ? s.selectedOptions[0].text : ''))];
      return texts.some(t => (t || '').toLowerCase().includes(v.toLowerCase()));
    }, value), { message: `${what} "${value}" shown on the saved Deliverable`, timeout: 15_000 }).toBe(true);
  }

  /** True when project {id} is in a terminal status (/Project/Edit/{id}: every Project Status option carries data-is-terminal). */
  async isProjectTerminal(id) {
    await this.openRecord(`/Project/Edit/${id}`);
    const status = this.page.locator('#ProjectStatusIDF');
    await expect(status, `Project ${id} status`).toBeVisible({ timeout: 30_000 });
    return status.evaluate(s => s.selectedOptions[0]?.getAttribute('data-is-terminal') === 'true');
  }

  /** Saved Deliverable: opens a tab by its pane id: 'workitems', 'history', 'audit', 'change-requests', ... */
  async openSavedTab(pane) {
    await this.page.locator(`main .nav-tabs .nav-link[data-bs-target="#pane-${pane}"], main .nav-tabs .nav-link[href="#pane-${pane}"]`).click();
  }

  /** The visible validation message under a field (ASP.NET unobtrusive validation), by field id, e.g. 'ServiceName'. */
  fieldError(fieldId) {
    return this.page.locator(`[data-valmsg-for="${fieldId}"]`).filter({ visible: true, hasText: /\S/ });
  }

  /** Saved Deliverable: State of every History row (newest first), e.g. ["Planning", "Active"]. */
  async historyStates() {
    return (await this.historyRows.locator('td:nth-child(2)').allInnerTexts()).map(t => t.trim());
  }

  /** True when the form has a change-request ("originating service") control (MF-1.5). */
  async hasOriginatingControl() {
    return (await this.originatingControl.count()) > 0;
  }
}

module.exports = { ServicePage };
