const { expect } = require('@playwright/test');
const { ServiceEditPage } = require('./serviceEditPage');

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Work items of a Deliverable (Service) - the visible result of 63071 Materialize Workflow for Service.
 * Extends the View & Edit Service page object (/Service/Edit/{id}).
 *
 * Work Items tab (#pane-workitems): rows tr.work-item-row[data-workitem-id][data-edit-url]; cells: Title, Description,
 *   Staff Role, Effort (actual / estimate), Due Date, Status, Assigned Person; the status icon
 *   (.assignments-status[aria-label]) carries the readiness ("Ready to start", "Not ready to start", "Completed", ...).
 * Work item drawer (#slideOutPanel.is-open #formWorkItem, posts /WorkItem/AddEditWorkItem): #WorkItemName, #Description,
 *   #StaffRoleIDF, #AssignedPersonIDF, #WorkItemStatusIDF, #EstimatedHours, #DueDate, hidden #ServiceIDF / #WorkItemTypeIDF,
 *   Save #btnSaveWorkItem.
 * Change Workflow (Actions -> #btnChangeWorkflow -> #modalChangeServiceWorkflow): step "select" lists the templates the
 *   Deliverable may use (.csw-template-row[data-csw-template-id][data-csw-name], Continue #cswBtnContinue); step "confirm"
 *   (#cswCurrentWorkflow, #cswNewWorkflow, #cswConfirmInfoText, Save #cswBtnSave). The preview JSON
 *   (GET /Service/ChangeWorkflowPreview) holds workItemsToCreateCount / touchedCount / untouchedCount.
 * The current workflow is in the page config <script id="cswConfig"> (currentWorkflowDisplay, e.g. "Name, v.1").
 */
class WorkItemsPage extends ServiceEditPage {
  constructor(page) {
    super(page);
    this.workItemsTab = page.locator('main .nav-tabs [data-bs-target="#pane-workitems"]');
    this.rows = page.locator('#pane-workitems tr.work-item-row');
    this.drawer = page.locator('#slideOutPanel.is-open');
    this.workItemForm = this.drawer.locator('#formWorkItem');
    this.saveWorkItemButton = this.drawer.locator('#btnSaveWorkItem');
    this.cswModal = page.locator('#modalChangeServiceWorkflow');
    this.cswRows = this.cswModal.locator('.csw-template-row');
    this.cswContinue = page.locator('#cswBtnContinue');
    this.cswSave = page.locator('#cswBtnSave');
    this.cswInfo = page.locator('#cswConfirmInfoText');
    this.cswError = page.locator('#cswConfirmError');
  }

  // ------------------------------------------------------------------ Deliverable
  /** Opens the Deliverable and its Work Items tab. */
  async openWorkItems(serviceId) {
    await this.gotoEdit(serviceId);
    await this.workItemsTab.click();
    await expect(this.page.locator('#pane-workitems')).toBeVisible({ timeout: 30_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  /** "Name, v.n" of the workflow the Deliverable is governed by ('' when none). */
  async currentWorkflow() {
    return this.page.evaluate(() => {
      const el = document.getElementById('cswConfig');
      try { return el ? (JSON.parse(el.textContent).currentWorkflowDisplay || '') : ''; } catch { return ''; }
    });
  }

  /** Picks the workflow template option whose text contains `templateName` on Add Deliverable. */
  async chooseTemplate(templateName) {
    const value = await this.template.locator('option').evaluateAll((os, n) => (os.find(o => o.text.includes(n)) || {}).value, templateName);
    if (!value) throw new Error(`Workflow template "${templateName}" is not offered on Add Deliverable`);
    await this.template.selectOption(value, { force: true });
  }

  // ------------------------------------------------------------------ work items grid
  /**
   * [{ id, name, description, role, effort, readiness }] of the Work Items tab.
   * (Not called workItems(): ServicePage already has a `workItems` locator property, which would hide the method.)
   */
  async listWorkItems() {
    return this.rows.evaluateAll(rows => rows.map(r => {
      const td = [...r.querySelectorAll('td')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
      const status = r.querySelector('.assignments-status');
      return {
        id: r.getAttribute('data-workitem-id'),
        name: td[0],
        description: td[1] === '—' ? '' : td[1],
        role: td[2],
        effort: td[3],
        readiness: status ? (status.getAttribute('aria-label') || status.getAttribute('title') || '') : '',
      };
    }));
  }

  row(name) {
    return this.rows.filter({ has: this.page.locator('td').first().filter({ hasText: new RegExp(`^\\s*${esc(name)}\\s*$`) }) }).first();
  }

  async readiness(name) {
    return (await this.listWorkItems()).find(w => w.name === name)?.readiness || '';
  }

  // ------------------------------------------------------------------ work item drawer
  async openWorkItem(name) {
    // click the description cell: the title cell holds the clock-in link
    await this.row(name).locator('td').nth(1).click();
    await expect(this.workItemForm, 'Work item drawer').toBeVisible({ timeout: 30_000 });
    await expect(this.workItemForm.locator('#WorkItemName')).toHaveValue(name, { timeout: 15_000 });
  }

  /** Values of the open drawer. */
  async workItemValues() {
    const f = this.workItemForm;
    const selected = async sel => ((await f.locator(sel).inputValue().catch(() => '')) ? (await f.locator(`${sel} option:checked`).innerText()).trim() : '');
    return {
      name: await f.locator('#WorkItemName').inputValue(),
      description: await f.locator('#Description').inputValue(),
      role: await selected('#StaffRoleIDF'),
      assignee: await selected('#AssignedPersonIDF'),
      status: await selected('#WorkItemStatusIDF'),
      estimatedHours: await f.locator('#EstimatedHours').inputValue(),
      dueDate: await f.locator('#DueDate').inputValue(),
      serviceId: await f.locator('#ServiceIDF').inputValue(),
      workItemType: await f.locator('#WorkItemTypeIDF').inputValue(),
    };
  }

  async closeDrawer() {
    await this.drawer.locator('[data-drawer-close], .right-drawer__close').first().click();
    await expect(this.drawer).toHaveCount(0, { timeout: 15_000 });
  }

  /** Opens a work item, reads it and closes the drawer. */
  async readWorkItem(name) {
    await this.openWorkItem(name);
    const values = await this.workItemValues();
    await this.closeDrawer();
    return values;
  }

  /** Sets status / assignee in the drawer and saves (POST /WorkItem/AddEditWorkItem). */
  async updateWorkItem(name, { status, assignee }) {
    await this.openWorkItem(name);
    if (status) await this.workItemForm.locator('#WorkItemStatusIDF').selectOption({ label: status }, { force: true });
    if (assignee) await this.workItemForm.locator('#AssignedPersonIDF').selectOption({ label: assignee }, { force: true });
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && /\/WorkItem\/AddEditWorkItem/i.test(r.url()), { timeout: 30_000 }),
      this.saveWorkItemButton.click(),
    ]);
    const json = await response.json().catch(() => ({}));
    expect(response.status(), `Work item "${name}" saved`).toBeLessThan(400);
    if (json && json.success === false) throw new Error(`Work item "${name}" not saved: ${json.message || ''}`);
    await expect(this.drawer, 'Drawer closes after Save').toHaveCount(0, { timeout: 30_000 }).catch(() => this.closeDrawer().catch(() => {}));
  }

  // ------------------------------------------------------------------ Change Workflow (63073 -> 63071)
  async openChangeWorkflow() {
    await expect(async () => {
      if (!(await this.changeWorkflowItem.isVisible())) await this.actionsButton.click({ timeout: 5_000 });
      await expect(this.changeWorkflowItem).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000] });
    await this.changeWorkflowItem.click();
    await expect(this.cswModal, 'Change workflow pop-up').toBeVisible({ timeout: 15_000 });
    await expect(this.cswModal.locator('[data-csw-select-list], .csw-select-templates').first(), 'Template list loaded').toBeVisible({ timeout: 30_000 });
  }

  /** Names of the templates offered by Change Workflow. */
  async offeredTemplates() {
    return this.cswRows.evaluateAll(rows => rows.map(r => r.getAttribute('data-csw-name')));
  }

  /** Selects a template and Continue; returns the preview JSON ({ workItemsToCreateCount, touchedCount, ... }). */
  async previewChange(templateName) {
    const row = this.cswRows.filter({ has: this.page.locator('a.csw-name-link', { hasText: new RegExp(`^\\s*${esc(templateName)}\\s*$`) }) }).first();
    await expect(row, `"${templateName}" offered`).toBeVisible({ timeout: 15_000 });
    await row.locator('td').nth(4).click();   // Version cell (the name opens the template in a new tab)
    await expect(this.cswContinue).toBeEnabled({ timeout: 10_000 });
    const [response] = await Promise.all([
      this.page.waitForResponse(r => /\/Service\/ChangeWorkflowPreview/i.test(r.url()), { timeout: 30_000 }),
      this.cswContinue.click(),
    ]);
    const json = await response.json().catch(() => ({}));
    await expect(this.cswSave, 'Confirm Workflow Change').toBeVisible({ timeout: 15_000 });
    return { ...(json.preview || {}), success: json.success, info: (await this.cswInfo.innerText().catch(() => '')).trim() };
  }

  /**
   * The server's Change Workflow preview for a template (the same read-only GET the pop-up makes on Continue). Used for the
   * template that already governs the Deliverable, which the pop-up does not list.
   */
  async previewFor(serviceId, templateId) {
    const r = await this.page.request.get(`/Service/ChangeWorkflowPreview?serviceId=${serviceId}&workflowTemplateId=${templateId}`,
      { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const json = await r.json().catch(() => ({}));
    return { ...(json.preview || {}), success: json.success, message: json.message || '' };
  }

  /** Save on the confirmation; returns the JSON and re-opens the Work Items tab. */
  async saveChange(serviceId) {
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && /\/Service\/ChangeWorkflow(\?|$)/i.test(r.url()), { timeout: 60_000 }),
      this.cswSave.click(),
    ]);
    const json = await response.json().catch(() => ({}));
    if (!json.success) {
      const error = (await this.cswError.innerText().catch(() => '')).trim();
      throw new Error(`Change Workflow refused: ${json.message || error || JSON.stringify(json.validityFailure || {})}`);
    }
    await expect(this.cswModal).toBeHidden({ timeout: 30_000 });
    await this.openWorkItems(serviceId);
    return json;
  }

  async cancelChange() {
    await expect(async () => {
      if (await this.cswModal.isVisible()) await this.cswModal.locator('.modal-footer [data-bs-dismiss="modal"]').filter({ visible: true }).first().click({ timeout: 3_000 });
      await expect(this.cswModal).toBeHidden({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000] });
  }
}

module.exports = { WorkItemsPage };
