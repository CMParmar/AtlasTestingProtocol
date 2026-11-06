const { expect } = require('@playwright/test');
const { ProjectPage } = require('./projectPage');

const EDIT = /\/Project\/Edit\/\d+/i;
const isEditPost = r => r.request().method() === 'POST' && /\/Project\/Edit\//i.test(r.url());

/**
 * View & Edit Project (use case 61967): /Project/Edit/{id}, form #form-project (posts to /Project/Edit/{id}).
 * Details tab: Project Name * (#ProjectName), Project Code, Project Status * (#ProjectStatusIDF - every option carries
 * data-is-terminal; Completed and Canceled are terminal), Project Phase * (#CurrentProjectPhaseIDF), Description,
 * Primary Billing Type (#BillingTypeIDF), Estimated Hours, Scheduled Start Date, Due Date, then the system-controlled
 * Actual Start Date (#ActualStartDate) and Actual Completion Date (#ActualCompletionDate), both disabled.
 * Save button + Cancel link (reloads the project, bypasses the dirty check).
 * Tabs: Details, Staffing (.staffing-add-btn), Deliverables (#pane-services, "Add Deliverable"), Time Summary,
 * Documents (#btnaddDocument), History (#status-history-table), Tasks, Audit (#pane-audit).
 * Header: Account Name / Account Owner / Account Number links, Clock In, Signals.
 */
class ProjectEditPage extends ProjectPage {
  constructor(page) {
    super(page);
    this.phase = page.locator('#CurrentProjectPhaseIDF');
    this.actualStart = page.locator('#ActualStartDate');
    this.actualCompletion = page.locator('#ActualCompletionDate');
    this.accountOwnerLink = this.headerLink('Account Owner:');
    this.accountNumberLink = this.headerLink('Account Number:');
    this.tabs = page.locator('main .nav-tabs .nav-link');
    this.historyRows = page.locator('#status-history-table tr.tr-history');
    this.auditPane = page.locator('#pane-audit');
    this.addDeliverable = page.locator('#pane-services a[href*="/Service/Create"]');
    this.staffingAddButtons = page.locator('#pane-project-staffing .staffing-add-btn');
    this.addDocument = page.locator('#btnaddDocument');
    this.signalsButton = page.locator('main').getByRole('button', { name: 'Signals' });
    this.clockIn = page.locator('main').getByRole('link', { name: 'Clock In' });
  }

  static editPath(id) {
    return `/Project/Edit/${id}`;
  }

  /** Project fields by test-data key (same keys as utils/testCase LABELS). */
  get fields() {
    return {
      projectName: this.projectName, projectCode: this.projectCode, projectStatus: this.projectStatus,
      currentPhase: this.phase, description: this.description, billingType: this.billingType,
      estimatedHours: this.estimatedHours, scheduledStart: this.scheduledStart, dueDate: this.dueDate,
      actualStart: this.actualStart, actualCompletion: this.actualCompletion,
    };
  }

  /** Link next to a header caption ("Account Name:", "Account Owner:", "Account Number:"). */
  headerLink(caption) {
    return this.page.locator('main').getByText(caption, { exact: true }).locator('xpath=..').getByRole('link').first();
  }

  async gotoEdit(id) {
    await this.openRecord(ProjectEditPage.editPath(id));
    await this.expectEditOpen();
  }

  /** MF-1: the project opens in Edit Mode (Details form with Save). */
  async expectEditOpen() {
    await expect(this.page).toHaveURL(EDIT);
    await expect(this.saveButton, 'View & Edit Project form (Save button)').toBeVisible({ timeout: 30_000 });
  }

  /** Every field as shown: select = option text, input = value ('' when empty). */
  async values() {
    const out = {};
    for (const [key, control] of Object.entries(this.fields)) out[key] = await this.valueText(control);
    return out;
  }

  /** Sets a select by its option text ('' = the empty "Select" option). */
  async select(control, label) {
    await control.selectOption(label === '' ? '' : { label }, { force: true });
  }

  /** MF-2: enters the given values ({ key: value }); '' clears a field. */
  async update(data) {
    for (const [key, value] of Object.entries(data)) {
      const control = this.fields[key];
      if (!control) throw new Error(`Unknown project field "${key}"`);
      if (await this.isSelect(control)) await this.select(control, value);
      else if (key === 'scheduledStart' || key === 'dueDate') await this.fillDate(control, value);
      else await control.fill(value);
    }
  }

  /** MF-7 / MF-8: saves and waits for the saved project. Returns { url, id }. */
  async save() {
    await Promise.all([
      this.page.waitForResponse(isEditPost, { timeout: 30_000 }),
      this.saveButton.click(),
    ]);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.validationErrors, 'Save rejected with a validation error').toHaveCount(0);
    await this.expectEditOpen();
    return { url: this.page.url(), id: this.recordIdFromUrl() };
  }

  /** Save for a negative test: waits for a validation error or a post-back. Returns { saved }. */
  async trySave() {
    let posted = false;
    const onResponse = r => { if (isEditPost(r)) posted = true; };
    this.page.on('response', onResponse);
    try {
      await this.saveButton.click();
      await expect.poll(async () => ((await this.validationError.isVisible()) ? 'rejected' : posted ? 'posted' : ''),
        { timeout: 30_000 }).not.toBe('');
      if (posted) await this.page.waitForLoadState('domcontentloaded');
      return { saved: posted && !(await this.validationError.isVisible()) };
    } finally {
      this.page.off('response', onResponse);
    }
  }

  /** The project shows these values (estimated hours compared as numbers). */
  async expectValues(expected) {
    for (const [key, value] of Object.entries(expected)) {
      const shown = await this.valueText(this.fields[key]);
      if (key === 'estimatedHours' && value !== '') expect(Number(shown), `Estimated Hours shown "${shown}"`).toBe(Number(value));
      else expect(shown, `${key} on the project`).toBe(value);
    }
  }

  /** True when the user can change the field (enabled, not read-only). */
  async editable(key) {
    return this.fields[key].isEditable();
  }

  /** Project Status options the app marks terminal (data-is-terminal="true"). */
  async terminalStatuses() {
    return (await this.projectStatus.locator('option[data-is-terminal="true"]').allInnerTexts()).map(t => t.trim());
  }

  /** Date field captions in the order the Details tab shows them. */
  async dateCaptions() {
    const ids = ['ScheduledStartDate', 'DueDate', 'ActualStartDate', 'ActualCompletionDate'];
    return (await this.form.locator(ids.map(id => `label[for="${id}"]`).join(', ')).allInnerTexts())
      .map(t => t.replace(/\*/g, '').replace(/\s+/g, ' ').trim());
  }

  tab(name) {
    return this.tabs.filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
  }

  async tabNames() {
    return (await this.tabs.allInnerTexts()).map(t => t.trim()).filter(Boolean);
  }

  /** History tab: State of every status-history row (newest first). */
  async historyStates() {
    return (await this.historyRows.locator('td:nth-child(2)').allInnerTexts()).map(t => t.trim());
  }

  /** Staffing tab: number of visible, enabled "add staff" buttons (open the tab first). */
  async staffingAddable() {
    return this.staffingAddButtons.evaluateAll(bs => bs.filter(b => b.offsetParent !== null && !b.disabled).length);
  }
}

module.exports = { ProjectEditPage };
