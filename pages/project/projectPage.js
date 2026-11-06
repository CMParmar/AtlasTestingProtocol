const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { TEXT, TYPES } = require('../../testData/projectData');

const CREATE = /\/Project\/Create/i;

/**
 * Create Project (use case 62422): /Project/Create[?AccountID={id}] ("Add Project", form #form-project), reached from
 * Add New -> Project or from an Account's Projects tab ("Add New Project", opens in a new tab).
 * Form (sandbox): Account * (#AccountIDF, option value = account id), Project Name * (#ProjectName),
 * Project Template * (#AuthoritativeProjectTemplateVersionIDF, "Default / Version 1"), Project Code, Project Status *
 * (#ProjectStatusIDF, default Active), Description, Primary Billing Type (#BillingTypeIDF), Estimated Hours,
 * Scheduled Start Date, Due Date. There is NO Project Type control yet (added to the use case by 63342).
 * After save the project opens on /Project/Edit/{id} (61967) with "Your new record has been added.", the Account
 * Name / Owner / Number links and a "Project Phase" select.
 */
class ProjectPage extends BasePage {
  constructor(page) {
    super(page);
    const field = (ids, label) => page.locator(ids).or(page.getByLabel(label)).first();
    this.form = page.locator('#form-project');
    this.projectName = field('#ProjectName', /^Project Name/i);
    this.account = page.locator('#AccountIDF');
    this.projectStatus = page.locator('#ProjectStatusIDF');
    this.templateVersion = page.locator('#AuthoritativeProjectTemplateVersionIDF');
    this.projectCode = page.locator('#ProjectCode');
    this.description = page.locator('#Description');
    this.billingType = page.locator('#BillingTypeIDF');
    this.estimatedHours = page.locator('#EstimatedHours');
    this.scheduledStart = page.locator('#ScheduledStartDate');
    this.dueDate = page.locator('#DueDate');
    this.cancelLink = this.form.getByRole('link', { name: 'Cancel', exact: true });
    // Project Type (use case MF-1 / 63342): not on the sandbox form yet - located by name or label when it appears
    this.projectTypeSelect = page.locator('select#ProjectTypeIDF, select#ProjectTypeID, select#ProjectType, select[name*="ProjectType" i]')
      .or(page.locator('select').filter({ has: page.locator('option', { hasText: /^(Estimation|Delivery)$/ }) })).first();
    this.projectTypeRadios = page.locator('input[type="radio"][name*="ProjectType" i]');
    // saved project
    this.currentPhase = page.locator('#CurrentProjectPhaseIDF, #ProjectPhaseIDF').or(page.getByLabel(/^Project Phase/i)).first();
    this.accountNameLink = page.locator('main').getByText('Account Name:', { exact: true }).locator('xpath=..').getByRole('link').first();
    this.saveButton = this.form.getByRole('button', { name: 'Save', exact: true })
      .or(page.locator('main').getByRole('button', { name: /^(Save|Create Project)$/i })).filter({ visible: true }).first();
    // MF-3 scenario "Project Type Immutable"
    this.typeNotice = page.locator('.modal.show, .swal2-popup, .bootbox, [role="dialog"], [role="alertdialog"]')
      .filter({ visible: true, hasText: TEXT.typeNotice }).first();
    this.noticeOk = this.typeNotice.getByRole('button', { name: /^Ok$/i });
    this.noticeDoNotShow = this.typeNotice.getByRole('checkbox').or(this.typeNotice.getByLabel(/Do not show again/i)).first();
    // entry points
    this.addNewMenu = page.getByRole('button', { name: 'Add New Menu' });
    this.addNewProject = page.locator('a.addnew-item[href="/Project/Create"]');
    this.accountProjectsTab = page.locator('.person-projects-tab');
    this.addNewProjectLink = this.accountProjectsTab.getByRole('link', { name: /Add New Project/i });
    this.validationErrors = page.locator('.field-validation-error, .text-danger, .invalid-feedback, .validation-summary-errors, .alert-danger')
      .filter({ visible: true, hasText: /[A-Za-z]{3}/ });
    this.validationError = this.validationErrors.first();
  }

  static createPath(accountId) {
    return accountId ? `/Project/Create?AccountID=${accountId}` : '/Project/Create';
  }

  async gotoCreate(accountId) {
    await this.openRecord(ProjectPage.createPath(accountId));
    await this.expectFormOpen();
  }

  async expectFormOpen() {
    await expect(this.page).toHaveURL(CREATE);
    await expect(this.saveButton, 'Create Project form (Save button)').toBeVisible({ timeout: 30_000 });
  }

  /** MF-1 via the sidebar: Add New -> Project. */
  async openFromAddNew() {
    await this.addNewMenu.click();
    await this.addNewProject.click();
    await this.expectFormOpen();
  }

  /** Accounts offered by the Account selector: [{ id, name }] (option value = account id). */
  async accountOptions() {
    return this.account.locator('option:not([value=""])').evaluateAll(os => os.map(o => ({ id: o.value, name: o.textContent.trim() })));
  }

  /** True when the form has a Project Type control (63342). */
  async hasProjectType() {
    return (await this.projectTypeRadios.count()) + (await this.projectTypeSelect.count()) > 0;
  }

  async isSelect(control) {
    return (await control.evaluate(e => e.tagName)) === 'SELECT';
  }

  /** Text of a control's current value ('' when unset). */
  async valueText(control) {
    if (!(await control.count())) return '';
    if (await this.isSelect(control)) {
      return (await control.inputValue()) ? (await control.locator('option:checked').innerText()).trim() : '';
    }
    return (await control.inputValue()).trim();
  }

  /** Non-empty option texts of a select. */
  async optionTexts(select) {
    return (await select.locator('option:not([value=""])').allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  /** Picks the option containing `text` - native select (also under a custom dropdown) or a type-ahead. */
  async choose(control, text) {
    if (await this.isSelect(control)) {
      const option = control.locator('option').filter({ hasText: text }).first();
      if (await option.count()) {
        await control.selectOption(await option.getAttribute('value'), { force: true });
        return;
      }
      // AJAX select (e.g. select2): the visible widget follows the hidden <select>
      await control.locator('xpath=following-sibling::*[1]').click();
    } else {
      await control.click();
    }
    await this.page.keyboard.type(text, { delay: 30 });
    await this.page.locator('[role="option"], .select2-results__option, .ui-menu-item, .dropdown-item, .custom-select-option')
      .filter({ visible: true, hasText: text }).first().click();
  }

  /** Keeps the current value, otherwise picks `preferred` or the first real option. Returns the option text. */
  async ensureSelected(select, preferred) {
    if (!(await select.inputValue())) {
      const options = select.locator('option:not([value=""])');
      const pick = preferred && (await options.filter({ hasText: preferred }).count())
        ? options.filter({ hasText: preferred }).first() : options.first();
      await select.selectOption(await pick.getAttribute('value'), { force: true });
    }
    return this.valueText(select);
  }

  /** Selects an option other than the current one; returns its text. */
  async selectOther(select) {
    const current = await select.inputValue();
    const other = select.locator(`option:not([value=""]):not([value="${current}"])`).first();
    await select.selectOption(await other.getAttribute('value'), { force: true });
    return this.valueText(select);
  }

  /** Sets a select to its empty option; false when it has none. */
  async clearSelect(select) {
    if (!(await select.locator('option[value=""]').count())) return false;
    await select.selectOption('', { force: true });
    return true;
  }

  // --- Project Type (radios or a select) ---

  async typeOptions() {
    if (await this.projectTypeRadios.count()) {
      return Promise.all((await this.projectTypeRadios.all()).map(async r => {
        const id = await r.getAttribute('id');
        const label = id ? this.page.locator(`label[for="${id}"]`).first() : r.locator('xpath=..');
        return (await label.innerText()).trim() || (await r.getAttribute('value'));
      }));
    }
    return this.optionTexts(this.projectTypeSelect);
  }

  async typeValue() {
    if (await this.projectTypeRadios.count()) {
      for (const t of TYPES) {
        if (await this.page.getByRole('radio', { name: t }).first().isChecked().catch(() => false)) return t;
      }
      return '';
    }
    return this.valueText(this.projectTypeSelect);
  }

  /** The Project Type control itself (for help text lookup / visibility). */
  typeControl() {
    return this.projectTypeRadios.first().or(this.projectTypeSelect).first();
  }

  async setProjectType(type) {
    if (await this.projectTypeRadios.count()) {
      await this.page.getByRole('radio', { name: type }).first().check({ force: true });
    } else {
      await this.choose(this.projectTypeSelect, type);
    }
  }

  /** Waits briefly for the Project Type notice; true when it appeared. */
  async noticeAppears(timeout = 5_000) {
    return this.typeNotice.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
  }

  /** Sets the type and acknowledges the notice with Ok if it appears (optionally ticking "Do not show again"). */
  async setTypeAndAcknowledge(type, { doNotShowAgain = false } = {}) {
    await this.setProjectType(type);
    const shown = await this.noticeAppears();
    if (shown) await this.acknowledgeNotice({ doNotShowAgain });
    return shown;
  }

  async acknowledgeNotice({ doNotShowAgain = false } = {}) {
    if (doNotShowAgain) await this.noticeDoNotShow.check();
    await this.noticeOk.click();
    await expect(this.typeNotice, 'Ok dismisses the notice').toBeHidden();
  }

  /** Help text shown with the Project Type control (form-text, tooltip or info icon title). */
  async typeHelpText() {
    const group = this.page.locator('.form-group, .mb-3, .form-floating, [class*="col-"], fieldset')
      .filter({ has: this.typeControl() }).last();
    const help = group.locator('.form-text, .help-text, .help-block, small, .text-muted, [data-bs-toggle="tooltip"], [title]')
      .filter({ visible: true }).first();
    if (!(await help.count())) return '';
    return ((await help.innerText()).trim() || (await help.getAttribute('title')) || (await help.getAttribute('data-bs-original-title')) || '').trim();
  }

  // --- fill / save ---

  /**
   * Fills the form: name (when the form has one), Account (when not pre-populated), Project Status (default kept
   * unless changeStatus), Project Type (notice acknowledged) and Template Version. Returns the values used.
   */
  async fillForm({ projectName, accountId, projectType, changeStatus = false, skipTemplate = false, details = {} }) {
    if (projectName) await this.projectName.fill(projectName);
    if (accountId && (await this.account.inputValue()) !== String(accountId)) await this.account.selectOption(String(accountId), { force: true });
    await this.ensureSelected(this.projectStatus, 'Active');
    if (changeStatus) await this.selectOther(this.projectStatus);
    if (projectType && (await this.hasProjectType())) await this.setTypeAndAcknowledge(projectType);
    if (!skipTemplate) await this.ensureSelected(this.templateVersion);
    if (details.projectCode) await this.projectCode.fill(details.projectCode);
    if (details.description) await this.description.fill(details.description);
    if (details.billingType) await this.choose(this.billingType, details.billingType);
    if (details.estimatedHours) await this.estimatedHours.fill(details.estimatedHours);
    if (details.scheduledStart) await this.fillDate(this.scheduledStart, details.scheduledStart);
    if (details.dueDate) await this.fillDate(this.dueDate, details.dueDate);
    return this.formValues();
  }

  /** Date fields are text boxes (yyyy-mm-dd) that may open a date picker; the picker is closed afterwards. */
  async fillDate(input, value) {
    await input.fill(value);
    await input.press('Tab');
    await this.page.keyboard.press('Escape');
  }

  async formValues() {
    const optional = async (control, key) => ((await control.count()) && (await this.valueText(control)) ? { [key]: await this.valueText(control) } : {});
    return {
      projectName: await this.valueText(this.projectName),
      account: await this.valueText(this.account),
      projectStatus: await this.valueText(this.projectStatus),
      ...((await this.hasProjectType()) ? { projectType: await this.typeValue() } : {}),
      templateVersion: await this.valueText(this.templateVersion),
      ...(await optional(this.projectCode, 'projectCode')),
      ...(await optional(this.description, 'description')),
      ...(await optional(this.billingType, 'billingType')),
      ...(await optional(this.estimatedHours, 'estimatedHours')),
      ...(await optional(this.scheduledStart, 'scheduledStart')),
      ...(await optional(this.dueDate, 'dueDate')),
    };
  }

  /** MF-4 / MF-5: saves and waits for View & Edit Project. Returns { url, id }. */
  async submitNew() {
    await this.saveButton.click();
    await expect(this.page, 'Project saved and opened (still on /Project/Create means the save was rejected)')
      .not.toHaveURL(CREATE, { timeout: 30_000 });
    await expect(this.page).toHaveURL(/\/Project\//i);
    await this.page.waitForLoadState('domcontentloaded');
    return { url: this.page.url(), id: this.recordIdFromUrl() };
  }

  /** Save for a negative test: waits for a validation error or a (wrong) save. */
  async trySave() {
    await this.saveButton.click();
    await expect.poll(async () => {
      if (!CREATE.test(this.page.url())) return 'saved';
      return (await this.validationError.isVisible()) ? 'rejected' : '';
    }, { timeout: 30_000 }).not.toBe('');
    const saved = !CREATE.test(this.page.url());
    return { saved, url: this.page.url(), id: saved ? this.recordIdFromUrl() : '' };
  }

  // --- saved project (View & Edit Project) ---

  /** The value is shown on the page: as text, an input value or a selected option (select option lists ignored). */
  async expectShown(value, what) {
    await expect.poll(() => this.page.locator('main').evaluate((m, v) => {
      const c = m.cloneNode(true);
      c.querySelectorAll('select, script, style, template').forEach(e => e.remove());
      const texts = [c.textContent,
        ...[...m.querySelectorAll('input, textarea')].map(e => e.value),
        ...[...m.querySelectorAll('select')].map(s => (s.selectedOptions[0] ? s.selectedOptions[0].text : ''))];
      return texts.some(t => (t || '').toLowerCase().includes(v.toLowerCase()));
    }, value), { message: `${what} "${value}" shown on the saved project`, timeout: 15_000 }).toBe(true);
  }

  /** True when the saved project still lets the user change the Project Type. */
  async typeEditable() {
    if (await this.projectTypeRadios.count()) {
      for (const r of await this.projectTypeRadios.all()) if (await r.isEnabled() && await r.isVisible()) return true;
      return false;
    }
    if (await this.projectTypeSelect.count()) {
      return this.projectTypeSelect.evaluate(s => !s.disabled && !s.hasAttribute('readonly') && !s.closest('[disabled]'));
    }
    return false;
  }

  /** Current phase on the saved project ('' when not shown). */
  async currentPhaseText() {
    return (await this.currentPhase.count()) ? this.valueText(this.currentPhase) : '';
  }

  /** Phases offered on the saved project (from its template), in the order the app lists them. */
  async phaseOptions() {
    return (await this.currentPhase.count()) ? this.optionTexts(this.currentPhase) : [];
  }

  /** Account page, Projects tab: shows All and narrows the list to `text` when the table has a search box. */
  async filterAccountProjects(text) {
    await this.accountProjectsTab.locator('[data-projects-filter="all"]').click();
    const search = this.accountProjectsTab.locator('input[type="search"]').filter({ visible: true }).first();
    if (await search.count()) await search.fill(text);
  }

  /** The saved project is linked to the account: "Account Name:" links to /Account/Edit/{accountId}. */
  async expectLinkedToAccount(accountId) {
    await expect(this.accountNameLink, 'Saved project shows its Account').toBeVisible();
    await expect(this.accountNameLink, `Project belongs to Account #${accountId}`).toHaveAttribute('href', new RegExp(`/Account/Edit/${accountId}(?:[/?#]|$)`));
    return (await this.accountNameLink.innerText()).trim();
  }
}

module.exports = { ProjectPage };
