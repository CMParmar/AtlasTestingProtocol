const { ServiceEditPage } = require('./serviceEditPage');

const EDIT = /\/Service\/Edit\/\d+/i;
const CLOCK_IN = /\/TimeClock\/ClockIn/i;
const CLOCK_OUT = /\/TimeClock\/ClockOut/i;

/**
 * Cancel Service (use case 62476): /Service/Edit/{id} - the UI calls a Service a "Deliverable". There is no separate
 * "Cancel Service" command in the Actions menu: the user chooses the terminal status "Canceled" in the Status dropdown
 * (#ServiceStatusIDF) and clicks Save, which raises the confirmation dialog #confirmModal:
 *   - "Reason for cancellation (optional)": #cancelServiceReason (textarea)
 *   - Confirm Cancellation: #btnCancelServiceConfirm          - Go back: [data-bs-dismiss="modal"]
 * Confirming posts to /Service/Edit/{id} (302 back to the page). The canceled record then shows
 *   - a banner  main .alert-danger  with the form[action="/Service/RestoreService/{id}"] ("Restore this Deliverable"),
 *   - the status history row  #pane-history tr.tr-history[data-history-type="Status"]  (cells: title, justification = the
 *     cancellation reason or "-", date, user) and the Audit row  ServiceStatusIDF  Active -> Canceled,
 *   - Deliverable Stage disabled, unchanged.
 * Blocked afterwards (the sandbox answers with a toast / dialog):
 *   - Add work item: toast "Work Items cannot be added to a Service in a terminal state."
 *   - Change work item status (.wi-status-trigger / .wi-status-option): toast "Work Item status cannot be changed when the Service or Project is in a terminal state."
 *   - Clock in (a.clock-in[data-clockin-workitemid]): #clockInBlockedModal ("... does not allow clocking in") with
 *     #clockInBlockedCancel / #clockInBlockedContinue.
 * Canceling closes the clocks still running on the Service's work items (62510 Clock Out): the stop control
 * (a.clockout-stop[data-workitemid]) of the work item row disappears and /TimeClock/GetActiveTimeClock returns no clock.
 *
 * CAUTION: on a canceled record the first  main button[type=submit]  is the banner's "Restore this Deliverable" button, so
 * Save is located by its btn-primary class and never by position. Buttons / links / tabs are located by id, href, class and data
 * attributes, never by caption (the UI is localized per user).
 */
class CancelServicePage extends ServiceEditPage {
  constructor(page) {
    super(page);
    // Save: btn-primary only - the banner's Restore button is a submit button too
    this.saveButton = page.locator('main button.btn-primary.action-btn[type="submit"]').first();

    // ---- Cancel confirmation dialog ----
    this.cancelDialog = page.locator('#confirmModal.show');
    this.cancelReason = page.locator('#cancelServiceReason');
    this.cancelConfirm = page.locator('#btnCancelServiceConfirm');
    this.cancelGoBack = page.locator('#confirmModal [data-bs-dismiss="modal"]');

    // ---- Canceled record ----
    this.canceledBanner = page.locator('main .alert-danger').filter({ has: page.locator('form[action^="/Service/RestoreService/"]') });
    this.restoreButton = page.locator('form[action^="/Service/RestoreService/"] button[type="submit"]');
    this.toasts = page.locator('.toast.show, .alert:visible');

    // ---- History / Audit tabs ----
    this.historyTab = page.locator('main .nav-link[data-bs-target="#pane-history"]');
    this.detailsTab = page.locator('main .nav-link[data-bs-target="#pane-details"]');
    this.workItemsTab = page.locator('main .nav-link[data-bs-target="#pane-workitems"]');
    this.auditTab = page.locator('main .nav-link[data-bs-target="#pane-audit"]');
    this.statusHistoryRows = page.locator('#pane-history tr.tr-history[data-history-type="Status"]');
    this.stageHistoryRows = page.locator('#pane-history tr.tr-history[data-history-type="Stage"]');
    this.auditStatusRows = page.locator('#pane-audit tbody tr').filter({ hasText: 'ServiceStatusIDF' });

    // ---- Work Items tab ----
    this.addWorkItemButton = page.locator('#pane-workitems button[onclick*="CreateWorkItem"]');
    this.clockInLinks = page.locator('#pane-workitems a.clock-in[data-clockin-workitemid]');
    this.clockOutLinks = page.locator('#pane-workitems a.clockout-stop[data-workitemid]');
    this.clockInBlocked = page.locator('#clockInBlockedModal.show');
    this.clockInBlockedReasons = page.locator('#clockInBlockedList li');
    this.clockInBlockedCancel = page.locator('#clockInBlockedCancel');
    this.clockInBlockedContinue = page.locator('#clockInBlockedContinue');

    // ---- Clock Out drawer (used only to stop a clock a test started on purpose) ----
    this.clockOutForm = page.locator('#slideOutPanel.is-open #formClockOut');
    this.clockOutSave = page.locator('#btnSaveClockOut');
  }

  // ---------------------------------------------------------------- cancel flow

  /** MF-1: chooses the terminal "Canceled" status and clicks Save; returns once the cancel dialog is shown. */
  async startCancel(statusText = 'Canceled') {
    await this.pick(this.status, { text: statusText });
    await this.saveButton.click();
    await this.cancelDialog.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** MF-2: confirms the open dialog (optionally with a reason); waits for the post-back and the reloaded page. Returns the HTTP status. */
  async confirmCancel(reason) {
    if (reason !== undefined && reason !== null) await this.cancelReason.fill(reason);
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && EDIT.test(r.url()), { timeout: 30_000 }),
      this.cancelConfirm.click(),
    ]);
    await this.page.waitForLoadState('load');
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    return response.status();
  }

  /** MF-1 + MF-2 in one go. */
  async cancelService(reason) {
    await this.startCancel();
    return this.confirmCancel(reason);
  }

  // ---------------------------------------------------------------- tabs / state

  async openHistory() {
    await this.historyTab.click();
    await this.historyRows.first().waitFor({ state: 'attached', timeout: 15_000 });
  }

  async openWorkItems() {
    await this.workItemsTab.click();
    await this.workItems.first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Status history, newest first: [{ title, justification }]. A blank justification is shown as a dash. */
  async statusHistory() {
    await this.openHistory();
    return this.statusHistoryRows.evaluateAll(rows => rows.map(r => {
      const cells = r.querySelectorAll('td');
      return { title: cells[1].innerText.trim(), justification: cells[2].innerText.trim() };
    }));
  }

  /** Stage history titles, newest first. */
  async stageHistory() {
    await this.openHistory();
    return this.stageHistoryRows.evaluateAll(rows => rows.map(r => r.querySelectorAll('td')[1].innerText.trim()));
  }

  /** Audit rows of the Service Status field: [{ old, new, action }]. */
  async auditStatusChanges() {
    await this.auditTab.click();
    await this.auditStatusRows.first().waitFor({ state: 'visible', timeout: 15_000 });
    return this.auditStatusRows.evaluateAll(rows => rows.map(r => {
      const cells = [...r.querySelectorAll('td')].map(c => c.innerText.trim());
      return { old: cells[1], new: cells[2], action: cells[3] };
    }));
  }

  /** Work items of the Work Items tab: [{ id, title, status }] (status = caption of the row's status dropdown). */
  async workItemStatuses() {
    await this.openWorkItems();
    return this.workItems.evaluateAll(rows => rows.map(r => ({
      id: r.getAttribute('data-workitem-id'),
      title: r.querySelector('.work-item-page-link').innerText.trim(),
      status: r.querySelector('.wi-status-trigger').innerText.trim(),
    })));
  }

  /** The user's running clock as the server reports it: the work item id, or null when no clock runs. */
  async activeClockWorkItemId() {
    const response = await this.page.request.get('/TimeClock/GetActiveTimeClock', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const body = await response.json();
    return body.data ? String(body.data.workItemId ?? body.data.WorkItemID ?? body.data.workItemID ?? '') || 'running' : null;
  }

  /** True when the user's running clock belongs to one of THIS Service's work items (clocks of other tests / Services do not count). */
  async clockRunsOnService() {
    const active = await this.activeClockWorkItemId();
    if (active === null) return false;
    const ids = await this.workItems.evaluateAll(rows => rows.map(r => r.getAttribute('data-workitem-id')));
    return ids.includes(active);
  }

  // ---------------------------------------------------------------- work item actions (blocked after cancel)

  /** Clicks "Add work item" and returns the toast text that answers it ('' when a drawer opened instead). */
  async tryAddWorkItem() {
    await this.workItemsTab.click();
    await this.addWorkItemButton.first().click();
    return this.nextToast();
  }

  /** Chooses `statusName` in the status dropdown of a work item row (by id) and returns the toast text that answers it. */
  async tryChangeWorkItemStatus(workItemId, statusName) {
    const row = this.page.locator(`#pane-workitems tr.work-item-row[data-workitem-id="${workItemId}"]`);
    await row.locator('.wi-status-trigger').click();
    await row.locator(`.wi-status-option[data-status-name="${statusName}"]`).click();
    return this.nextToast();
  }

  /** Waits a moment for the app's toast / alert and returns every visible message (lower-cased text joined with " | "). */
  async nextToast() {
    await this.toasts.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    await this.page.waitForTimeout(500);
    return (await this.toasts.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ');
  }

  // ---------------------------------------------------------------- clock

  /** Clocks in on the first work item row (POST /TimeClock/ClockIn) and returns its work item id. */
  async clockInFirstWorkItem() {
    const link = this.clockInLinks.first();
    const workItemId = await link.getAttribute('data-clockin-workitemid');
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && CLOCK_IN.test(r.url()), { timeout: 30_000 }),
      link.click(),
    ]);
    const body = await response.json().catch(() => ({}));
    if (body.success === false) throw new Error(`Clock In refused: ${body.message}`);
    await this.clockOutLinks.first().waitFor({ state: 'visible', timeout: 15_000 });
    return workItemId;
  }

  /** Tries to clock in on the first work item of a canceled Service: the "Work item is blocked" dialog answers. */
  async tryClockInFirstWorkItem() {
    await this.clockInLinks.first().click();
    await this.clockInBlocked.waitFor({ state: 'visible', timeout: 15_000 });
    return (await this.clockInBlockedReasons.allInnerTexts()).map(t => t.trim());
  }

  /**
   * Stops the running clock of a work item row with the Clock Out drawer (defaults: today, start = clock-in minute,
   * end = now). The drawer refuses a zero-length entry, so the call waits until the clock-in minute has passed.
   */
  async clockOutRunning(clockedInAt) {
    const wait = 62_000 - (Date.now() - clockedInAt);
    if (wait > 0) await this.page.waitForTimeout(wait);
    await this.clockOutLinks.first().click();
    await this.clockOutForm.waitFor({ state: 'visible', timeout: 30_000 });
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && CLOCK_OUT.test(r.url()), { timeout: 30_000 }),
      this.clockOutSave.click(),
    ]);
    const body = await response.json().catch(() => ({}));
    if (body.success === false) throw new Error(`Clock Out refused: ${body.message}`);
    await this.clockOutLinks.first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  }
}

module.exports = { CancelServicePage };
