const { CancelServicePage } = require('./cancelServicePage');

const EDIT = /\/Service\/Edit\/\d+/i;

/**
 * Complete Service (use case 62477): /Service/Edit/{id} - the UI calls a Service a "Deliverable". There is no separate
 * "Complete Service" command: the user chooses the terminal status "Completed" in the Status dropdown (#ServiceStatusIDF)
 * and clicks Save, which raises the confirmation dialog #confirmModal ("Mark deliverable as complete?"):
 *   - "Don't show the confirmation again for this action." checkbox: #completeServiceDontShowAgain
 *   - Mark Complete: #btnCompleteServiceConfirm          - Go Back: [data-bs-dismiss="modal"]
 * Confirming posts to /Service/Edit/{id} (302 back to the page). The completed record then shows
 *   - Status "Completed", the read-only #ActualCompletionDate set (ISO date, account time zone),
 *   - a Status history row (#pane-history tr.tr-history[data-history-type="Status"]) and the Audit rows
 *     ServiceStatusIDF Active -> Completed and ActualCompletionDate.
 * A Canceled Service can still be completed (the canceled banner disappears). Saving a Service that is already Completed
 * raises no dialog.
 *
 * Extends CancelServicePage because it already holds the history / audit / work item helpers and a Save locator that also
 * works on a canceled record (there the first submit button is the banner's "Restore this Deliverable").
 * Buttons / links / tabs are located by id, href, class and data attributes, never by caption (the UI is localized per user).
 */
class CompleteServicePage extends CancelServicePage {
  constructor(page) {
    super(page);
    this.completeDialog = page.locator('#confirmModal.show');
    this.completeDontShowAgain = page.locator('#completeServiceDontShowAgain');
    this.completeGoBack = page.locator('#confirmModal [data-bs-dismiss="modal"]');
    this.completeTitle = page.locator('#confirmModal h5');
  }

  /** MF-1: chooses the terminal "Completed" status and clicks Save; returns once the confirmation dialog is shown. */
  async startComplete(statusText = 'Completed') {
    await this.detailsTab.click();
    await this.pick(this.status, { text: statusText });
    await this.saveButton.click();
    await this.completeDialog.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** MF-3: confirms the open dialog (optionally ticking "do not ask again"); waits for the post-back. Returns the HTTP status. */
  async confirmComplete({ dontShowAgain = false } = {}) {
    if (dontShowAgain) await this.completeDontShowAgain.check();
    return this.#submit(() => this.completeConfirm.click());
  }

  /** MF-1 + MF-3 in one go (dialog shown and confirmed). */
  async completeService() {
    await this.startComplete();
    return this.confirmComplete();
  }

  /**
   * Chooses Completed and saves for a user who may have switched the confirmation off (MF-2): confirms the dialog
   * when it appears. Returns { dialogShown, status }.
   */
  async completeWhateverTheSetting() {
    await this.detailsTab.click();
    await this.pick(this.status, { text: 'Completed' });
    const post = this.page.waitForResponse(r => r.request().method() === 'POST' && EDIT.test(r.url()), { timeout: 30_000 });
    await this.saveButton.click();
    const dialogShown = await this.completeDialog.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
    if (dialogShown) await this.completeConfirm.click();
    const response = await post;
    await this.#settle();
    return { dialogShown, status: response.status() };
  }

  /** Saves the open record without any change and reports whether the confirmation dialog appeared. */
  async saveAndReportDialog() {
    await this.detailsTab.click();
    await this.saveButton.click();
    const shown = await this.completeDialog.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true, () => false);
    await this.#settle();
    return shown;
  }

  /** Actual Completion Date as shown (ISO yyyy-mm-dd, '' when empty). */
  async completionDate() {
    await this.detailsTab.click();
    return this.actualCompletion.inputValue();
  }

  /** Audit rows of the Actual Completion Date field: raw row texts. */
  async auditCompletionRows() {
    await this.auditTab.click();
    return this.auditPane.locator('tbody tr').filter({ hasText: 'ActualCompletionDate' })
      .evaluateAll(rows => rows.map(r => [...r.querySelectorAll('td')].map(c => c.innerText.trim())));
  }

  /** Billing Type and Estimated Hours as shown. */
  async financialValues() {
    await this.detailsTab.click();
    return { billingType: await this.valueText(this.billingType), estimatedHours: await this.valueText(this.estimatedHours) };
  }

  async #submit(click) {
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && EDIT.test(r.url()), { timeout: 30_000 }),
      click(),
    ]);
    await this.#settle();
    return response.status();
  }

  async #settle() {
    await this.page.waitForLoadState('load');
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }
}

module.exports = { CompleteServicePage };
