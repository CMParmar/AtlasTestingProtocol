const { expect } = require('@playwright/test');
const { ServicePage } = require('./servicePage');

const EDIT = /\/Service\/Edit\/\d+/i;

/**
 * View & Edit Service: /Service/Edit/{id} - the UI calls a Service a "Deliverable". Extends ServicePage, which already
 * holds the form controls shared with Create Service (#ServiceName, #ServiceItemIDF, #ServiceStatusIDF, #ProjectIDF,
 * #ServiceStageIDF, #AuthoritativeBillingTypeIDF, #EstimatedHours, #Description, #OrderedDate, #ScheduledStartDate,
 * #DueDate, tabs, History / Audit panes).
 *
 * Extra on the saved record (sandbox):
 *   - Account / Company / Project are deep links in the header (a[href^="/Account/Edit/"], "/Company/Edit/", "/Project/Edit/")
 *   - #ServiceItemIDF is disabled (Service Item is locked once the Deliverable has stage history / started)
 *   - #ActualStartDate / #ActualCompletionDate: read-only (disabled) date inputs, system populated
 *   - Actions menu (#actionsDropdown): #btnChangeWorkflow, #btnRemoveWorkflow (only with a template), "Create Change Request"
 *     (a[href*="OriginatingServiceID="]) and #btnLinkAsChangeRequest (only while the Deliverable is not already a change request)
 *   - Link as change request dialog (#confirmModal): #linkChangeRequestSearch, #linkChangeRequestServiceList
 *     (button.link-cr-service-item[data-service-id]), #btnLinkChangeRequestConfirm
 *   - Completing: choose the terminal "Completed" status and Save -> confirmation (#btnCompleteServiceConfirm). The dialog's
 *     "do not show again" box (#completeServiceDontShowAgain) is never ticked: it would suppress the dialog permanently.
 *   - Unsaved changes: the browser's native beforeunload prompt.
 * Buttons / links / tabs are located by id, href and data attributes, never by caption (the UI is localized per user).
 */
class ServiceEditPage extends ServicePage {
  constructor(page) {
    super(page);
    this.saveButton = page.locator('main button.action-btn[type="submit"]').first();
    this.cancelEditLink = page.locator('main a.action-btn[href^="/Service/Edit/"]');
    this.actualStart = page.locator('#ActualStartDate');
    this.actualCompletion = page.locator('#ActualCompletionDate');
    this.accountLink = page.locator('main a[href^="/Account/Edit/"]').first();
    this.projectLink = page.locator('main a[href^="/Project/Edit/"]').first();
    this.actionsButton = page.locator('#actionsDropdown');
    this.changeWorkflowItem = page.locator('#btnChangeWorkflow');
    this.removeWorkflowItem = page.locator('#btnRemoveWorkflow');
    this.createChangeRequestItem = page.locator('#actionsDropdown + .dropdown-menu a[href*="OriginatingServiceID="]');
    this.linkChangeRequestItem = page.locator('#btnLinkAsChangeRequest');
    // Link as change request dialog
    this.linkSearch = page.locator('#linkChangeRequestSearch');
    this.linkList = page.locator('#linkChangeRequestServiceList');
    this.linkConfirm = page.locator('#btnLinkChangeRequestConfirm');
    this.linkChoices = page.locator('#linkChangeRequestServiceList button.link-cr-service-item');
    this.confirmModal = page.locator('#confirmModal.show');
    // Complete confirmation
    this.completeConfirm = page.locator('#btnCompleteServiceConfirm');
    // tabs of the saved record
    this.docsAdd = page.locator('#btnaddDocument');
    this.docsContainer = page.locator('#document-list-container');
    this.changeRequestRows = page.locator('#pane-change-requests a[href^="/Service/Edit/"]');
    this.workItemHeaders = page.locator('#pane-workitems thead th');
    this.sortOrder = page.locator('#SortOrder, [name="SortOrder"]');
  }

  static editPath(id) {
    return `/Service/Edit/${id}`;
  }

  /** Opens /Service/Edit/{id} (one retry: the sandbox sometimes stalls on navigation). */
  async gotoEdit(id) {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.openRecord(ServiceEditPage.editPath(id));
        break;
      } catch (e) {
        if (attempt >= 2) throw e;
      }
    }
    await this.expectEditOpen();
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  async expectEditOpen() {
    await expect(this.page).toHaveURL(EDIT);
    await expect(this.serviceName, 'Deliverable Name on the Edit page').toBeVisible({ timeout: 30_000 });
  }

  /** Creates a Deliverable through Create Service and returns its id; leaves the page on /Service/Edit/{id}. */
  async createDeliverable({ accountId, ...form }) {
    await this.gotoCreate({ accountId });
    await this.fillForm(form);
    const record = await this.submitNew();
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    return record;
  }

  /** MF-6: clicks Save and waits for the POST to complete and the page to reload. Returns the HTTP status. */
  async save() {
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && EDIT.test(r.url()), { timeout: 30_000 }),
      this.saveButton.click(),
    ]);
    await this.page.waitForLoadState('load');
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    return response.status();
  }

  /** Chooses the terminal "Completed" status, saves and confirms the completion dialog (the "do not show again" box stays off). */
  async complete(statusText) {
    await this.pick(this.status, { text: statusText });
    await this.saveButton.click();
    await expect(this.completeConfirm, 'Completion confirmation').toBeVisible();
    await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && EDIT.test(r.url()), { timeout: 30_000 }),
      this.completeConfirm.click(),
    ]);
    await this.page.waitForLoadState('load');
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  /** Every control a user may change on the saved Deliverable, as shown. */
  async editableValues() {
    return {
      ...(await this.formValues()),
      actualStart: await this.actualStart.inputValue(),
      actualCompletion: await this.actualCompletion.inputValue(),
    };
  }

  /** Opens the Actions menu (idempotent). */
  async openActions() {
    if (!(await this.linkChangeRequestItem.isVisible().catch(() => false)) && !(await this.changeWorkflowItem.isVisible().catch(() => false))) {
      await this.actionsButton.click();
    }
  }

  /** The id of a Deliverable listed in the Link-as-change-request dialog. */
  async linkChoiceIds() {
    return this.linkChoices.evaluateAll(els => els.map(e => e.getAttribute('data-service-id')));
  }

  /** Opens the Link-as-change-request dialog and searches by text; returns the offered Deliverable ids. */
  async openLinkDialog(search = '') {
    await this.actionsButton.click();
    await this.linkChangeRequestItem.click();
    await expect(this.linkSearch).toBeVisible();
    await this.linkSearch.click();
    await this.linkSearch.fill(search);
    await expect.poll(() => this.linkChoices.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    return this.settled(() => this.linkChoiceIds(), { rounds: 2 });
  }

  /** Picks an originating Deliverable in the open dialog, confirms the link and reloads the saved record. */
  async linkTo(originatingId, ownId) {
    await this.linkChoices.and(this.page.locator(`[data-service-id="${originatingId}"]`)).click();
    await expect(this.linkConfirm, 'Confirm link').toBeEnabled();
    await this.linkConfirm.click();
    await expect(this.confirmModal, 'Link dialog closes once the link is saved').toBeHidden({ timeout: 30_000 });
    await this.gotoEdit(ownId);
  }

  /** Work item rows of the Work Items tab: [{ id, text }]. */
  async workItemRows() {
    return this.workItems.evaluateAll(rows => rows.map(r => ({
      id: r.getAttribute('data-workitem-id'),
      editUrl: r.getAttribute('data-edit-url'),
      text: r.innerText.replace(/\s+/g, ' ').trim(),
    })));
  }

  /** True when a Save button is offered. */
  async canSave() {
    return (await this.saveButton.count()) > 0 && (await this.saveButton.isEnabled().catch(() => false));
  }
}

module.exports = { ServiceEditPage };
