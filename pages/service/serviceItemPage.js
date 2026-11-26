const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');

const CREATE_PATH = '/ServiceItem/Create';
const CREATE_URL = /\/ServiceItem\/Create/i;
const EDIT_URL = /\/ServiceItem\/Edit\/(\d+)/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Create Service Item (use case 62419) - the sandbox calls a Service Item a "Deliverable Type".
 * Sidebar "+" (Add New Menu) -> Deliverable Type opens /ServiceItem/Create ("Add Deliverable Type", form #form-serviceitem, posts to
 * /ServiceItem/Create). A successful Save redirects to /ServiceItem/Edit/{id} (62420 View & Update) with
 * "Your new record has been added.".
 *
 * Form: #ServiceItemName *, #Description, #AccountName, #AccountingID *, #IsTaxable (switch; Taxable / Non-Taxable),
 * Billing Type * = one row per type: checkbox input[name=AllowedBillingTypeIds] + "default" radio
 * input[name=DefaultBillingTypeId] (one radio group, so a single default), "Clear Default" (#clearDefaultBillingType),
 * #UnitOfMeasureIDF *, #TypicalEstimatedHours (number; the keys e / E are blocked), Save (submit) and Cancel
 * (link back to /ServiceItem/Create, no dirty check). Hidden BypassDuplicateNameCheck: the duplicate-name check runs on the
 * server at Save (soft warning with a link to the other record; Save again / proceed creates the record anyway).
 * Required messages are jQuery unobtrusive ([data-valmsg-for=...]); the billing message is
 * #AllowedBillingTypeIds_validationMessage ("Select at least one Billing Type.").
 * The checkboxes, radios and the switch are covered by styled spans, so they are toggled with a DOM click.
 *
 * View & Update (/ServiceItem/Edit/{id}): same fields, status badge (.ServiceItemStatus, "Active"), tabs Details,
 * Workflow Templates, Documents, Tasks, Audit (#pane-audit).
 */
class ServiceItemPage extends BasePage {
  constructor(page) {
    super(page);
    // sidebar "+" Add New menu -> Deliverable Type
    this.addNewMenu = page.getByRole('button', { name: 'Add New Menu' });
    this.addNewDeliverableType = page.locator(`a.addnew-item[href="${CREATE_PATH}"]`).filter({ visible: true }).first();
    this.form = page.locator('#form-serviceitem');
    this.heading = page.locator('main .page-title').first();
    this.serviceItemName = page.locator('#ServiceItemName');
    this.description = page.locator('#Description');
    this.accountName = page.locator('#AccountName');
    this.accountingId = page.locator('#AccountingID');
    this.isTaxable = page.locator('#IsTaxable');
    this.taxableTrack = page.locator('label.status-switch').filter({ has: this.isTaxable });
    this.unitOfMeasure = page.locator('#UnitOfMeasureIDF');
    this.typicalHours = page.locator('#TypicalEstimatedHours');
    this.billingRows = this.form.locator('.form-check').filter({ has: page.locator('input[name="AllowedBillingTypeIds"]') });
    this.billingCheckboxes = this.form.locator('input[name="AllowedBillingTypeIds"]');
    this.defaultRadios = this.form.locator('input[name="DefaultBillingTypeId"]');
    this.clearDefaultLink = page.locator('#clearDefaultBillingType');
    this.saveButton = this.form.locator('button[type="submit"]');
    this.cancelLink = this.form.locator('a.btn[href*="/ServiceItem/Create"]');
    this.bypassDuplicate = this.form.locator('input[name="BypassDuplicateNameCheck"]');

    // validation
    this.billingMessage = page.locator('#AllowedBillingTypeIds_validationMessage');
    this.validationErrors = page.locator('main').locator('.field-validation-error, .validation-summary-errors, #AllowedBillingTypeIds_validationMessage.field-validation-error, #alert-js-error .alert, .alert-danger')
      .filter({ visible: true, hasText: /\S{2}/ });

    // MF-4 duplicate-name warning: a warning alert / dialog that names the duplicate or links to the other record
    const containers = page.locator('#alert-js-warning, .alert-warning, .alert, .modal.show, .swal2-popup, [role="alertdialog"], .validation-summary-errors, .text-warning');
    this.duplicateWarning = containers
      .filter({ visible: true, hasText: /same name|already (exists|in use|used)|another (deliverable|service)|duplicate|exists with|has this name|with this name/i })
      .or(containers.filter({ visible: true, has: page.locator('a[href*="/ServiceItem/Edit/"]') }))
      .first();
    this.duplicateLink = this.duplicateWarning.locator('a[href*="/ServiceItem/"]').first();
    this.duplicateProceedButton = this.duplicateWarning.locator('button, a.btn, input[type="submit"]')
      .filter({ hasText: /save anyway|continue|proceed|yes|create|save|ok/i }).first();

    // View & Update (62420)
    this.statusBadge = page.locator('main .ServiceItemStatus, main .badges .badge').first();
    this.recordTabs = page.locator('main .nav-tabs [role="tab"], main .nav-tabs .nav-link');
    this.auditPane = page.locator('#pane-audit');
  }

  static get createPath() {
    return CREATE_PATH;
  }

  // ------------------------------------------------------------------ navigation
  /** Opens Add Deliverable Type; the slow sandbox can stall on navigation, so up to 3 attempts. */
  async gotoCreate() {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.openRecord(CREATE_PATH, { timeout: 60_000 });
        await this.saveButton.waitFor({ state: 'visible', timeout: 45_000 });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
      }
    }
    // the dirty-record tracker and the billing-type validation attach after DOMContentLoaded (+100 ms)
    await this.page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});
    await this.page.waitForFunction(() => !!window.dirtyRecordTracker, undefined, { timeout: 10_000 }).catch(() => {});
  }

  /**
   * The command that opens the create page: sidebar "+" (Add New Menu) -> "Deliverable Type"
   * (a.addnew-item[href="/ServiceItem/Create"]). The menu toggles, so it is clicked again until the item shows.
   */
  async openFromAddNew() {
    await this.openRecord('/RecentlyViewed', { timeout: 60_000 });
    await expect(async () => {
      if (!(await this.addNewDeliverableType.isVisible())) await this.addNewMenu.click({ timeout: 5_000 });
      await expect(this.addNewDeliverableType).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000] });
    await this.addNewDeliverableType.click();
    await this.page.waitForURL(CREATE_URL, { timeout: 60_000 });
    await this.saveButton.waitFor({ state: 'visible', timeout: 45_000 });
  }

  async openEdit(id) {
    await this.openCreatedRecord(`/ServiceItem/Edit/${id}`);
    await this.serviceItemName.waitFor({ state: 'visible', timeout: 45_000 });
  }

  isOnCreate() {
    return CREATE_URL.test(this.page.url());
  }

  // ------------------------------------------------------------------ billing types
  billingRow(type) {
    return this.billingRows.filter({ has: this.page.locator('.role-text', { hasText: new RegExp(`^\\s*${esc(type)}\\s*$`) }) }).first();
  }

  billingCheckbox(type) {
    return this.billingRow(type).locator('input[name="AllowedBillingTypeIds"]');
  }

  defaultRadio(type) {
    return this.billingRow(type).locator('input[name="DefaultBillingTypeId"]');
  }

  /** Names of the offered billing types, in page order. */
  async billingTypeNames() {
    return (await this.billingRows.locator('.role-text').allInnerTexts()).map(t => t.trim());
  }

  /** Billing types currently ticked. */
  async checkedBillingTypes() {
    const out = [];
    for (const type of await this.billingTypeNames()) if (await this.billingCheckbox(type).isChecked()) out.push(type);
    return out;
  }

  /** The billing type whose default radio is selected ('' = none). */
  async defaultBillingType() {
    for (const type of await this.billingTypeNames()) if (await this.defaultRadio(type).isChecked()) return type;
    return '';
  }

  /** DOM click (the styled span covers the input), then waits for the state. */
  async toggleTo(input, checked) {
    if ((await input.isChecked()) === checked) return;
    await input.evaluate(el => el.click());
    await expect(input).toBeChecked({ checked });
  }

  async setBillingTypes(types) {
    for (const type of await this.billingTypeNames()) await this.toggleTo(this.billingCheckbox(type), types.includes(type));
  }

  async markDefault(type) {
    await this.toggleTo(this.defaultRadio(type), true);
  }

  async clearDefault() {
    await this.clearDefaultLink.click();
  }

  async setTaxable(on) {
    await this.toggleTo(this.isTaxable, !!on);
  }

  // ------------------------------------------------------------------ the form
  /**
   * Fills the form. Fields not in `data` are left alone; '' clears a text field / selects "Select".
   * data: { serviceItemName, description, accountName, accountingId, isTaxable, allowedBillingTypes, defaultBillingType,
   *         unitOfMeasure, typicalHours }
   */
  async fillForm(data) {
    const text = [['serviceItemName', this.serviceItemName], ['description', this.description], ['accountName', this.accountName],
      ['accountingId', this.accountingId], ['typicalHours', this.typicalHours]];
    for (const [key, control] of text) if (data[key] !== undefined) await control.fill(String(data[key]));
    if (data.isTaxable !== undefined) await this.setTaxable(data.isTaxable);
    if (data.allowedBillingTypes) await this.setBillingTypes(data.allowedBillingTypes);
    if (data.defaultBillingType) await this.markDefault(data.defaultBillingType);
    if (data.unitOfMeasure !== undefined) {
      if (data.unitOfMeasure) await this.unitOfMeasure.selectOption({ label: data.unitOfMeasure });
      else await this.unitOfMeasure.selectOption('');
    }
  }

  /** Values shown by the form (Add or View & Update), in the same shape as fillForm's data. */
  async readForm() {
    const unit = (await this.unitOfMeasure.inputValue())
      ? (await this.unitOfMeasure.locator('option:checked').innerText()).trim() : '';
    return {
      serviceItemName: await this.serviceItemName.inputValue(),
      description: await this.description.inputValue(),
      accountName: await this.accountName.inputValue(),
      accountingId: await this.accountingId.inputValue(),
      isTaxable: await this.isTaxable.isChecked(),
      allowedBillingTypes: await this.checkedBillingTypes(),
      defaultBillingType: await this.defaultBillingType(),
      unitOfMeasure: unit,
      typicalHours: await this.typicalHours.inputValue(),
    };
  }

  async unitOptions() {
    return (await this.unitOfMeasure.locator('option:not([value=""])').allInnerTexts()).map(t => t.trim());
  }

  /** Clicks Save (no wait for a navigation: the result is read by saveOutcome). */
  async clickSave() {
    await this.saveButton.click({ noWaitAfter: true });
  }

  /**
   * What Save led to: 'saved' (View & Update /ServiceItem/Edit/{id}), 'duplicate' (MF-4 warning) or 'invalid'
   * (validation message on the Add form). Polls until one shows.
   */
  async saveOutcome(timeout = 60_000) {
    let outcome = '';
    await expect.poll(async () => {
      if (EDIT_URL.test(this.page.url())) outcome = 'saved';
      else if (await this.duplicateWarning.isVisible().catch(() => false)) outcome = 'duplicate';
      else if (await this.validationErrors.first().isVisible().catch(() => false)) outcome = 'invalid';
      else outcome = '';
      return outcome;
    }, { message: 'Save led to View & Update, a duplicate-name warning or a validation message', timeout, intervals: [500, 1_000, 2_000] }).not.toBe('');
    if (outcome === 'saved') await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    return outcome;
  }

  /** Save and expect View & Update to open; returns { id, url }. */
  async saveNew() {
    await this.clickSave();
    const outcome = await this.saveOutcome();
    if (outcome !== 'saved') {
      throw new Error(`Save did not create the Deliverable Type (${outcome}): ${await this.visibleMessages()}`);
    }
    return this.savedRecord();
  }

  /** After the duplicate warning: press the warning's proceed button, or Save again (the server then bypasses the check). */
  async proceedAfterDuplicate() {
    if (await this.duplicateProceedButton.isVisible().catch(() => false)) await this.duplicateProceedButton.click({ noWaitAfter: true });
    else await this.clickSave();
    await this.page.waitForURL(EDIT_URL, { timeout: 60_000 });
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    return this.savedRecord();
  }

  async savedRecord() {
    await this.serviceItemName.waitFor({ state: 'visible', timeout: 45_000 });
    const m = this.page.url().match(EDIT_URL);
    return { id: m ? m[1] : '', url: this.page.url() };
  }

  /** Required message of one field ([data-valmsg-for]); 'billing' = the billing-type message. */
  fieldMessage(field) {
    return field === 'billing' ? this.billingMessage : this.form.locator(`[data-valmsg-for="${field}"]`);
  }

  /** Text of every visible validation / warning message, for the report. */
  async visibleMessages() {
    const texts = await this.page.locator('main').locator('.field-validation-error, .alert, .modal.show, .validation-summary-errors, #AllowedBillingTypeIds_validationMessage')
      .filter({ visible: true }).allInnerTexts().catch(() => []);
    return [...new Set(texts.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' | ');
  }

  /** Duplicate warning text and the existing record's id from its link. */
  async duplicateDetails() {
    const text = (await this.duplicateWarning.innerText()).replace(/\s+/g, ' ').trim();
    const href = (await this.duplicateLink.getAttribute('href').catch(() => '')) || '';
    const m = href.match(/\/ServiceItem\/Edit\/(\d+)/i);
    return { text, href, id: m ? m[1] : '' };
  }

  /** A record tab of View & Update by its exact caption (Details, Workflow Templates, Documents, Tasks, Audit). */
  tab(name) {
    return this.page.locator('main .nav-tabs').locator('[role="tab"], .nav-link')
      .filter({ hasText: new RegExp(`^\\s*${esc(name)}\\s*$`) }).first();
  }

  /** Record tab captions of View & Update. */
  async tabNames() {
    return (await this.recordTabs.allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  async openAuditTab() {
    await this.openTab('Audit');
    await this.auditPane.waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Controls for the use-case fields that the sandbox Add form does not have (TC_SI_029). */
  specOnlyFields() {
    const main = this.page.locator('main');
    return {
      'Default Rate': main.locator('#DefaultRate, [name="DefaultRate"]').or(main.getByLabel(/default rate/i)),
      'Is Active': main.locator('#IsActive, [name="IsActive"]').or(main.getByLabel(/^\s*(is )?active\s*$/i)),
      'Workflow Template': main.locator('#WorkItemTemplateIDF, [name="WorkItemTemplateIDF"], [name*="WorkflowTemplate" i]').or(main.getByLabel(/workflow template|work item template/i)),
    };
  }
}

module.exports = { ServiceItemPage, CREATE_URL, EDIT_URL };
