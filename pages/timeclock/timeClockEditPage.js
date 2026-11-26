const { BasePage } = require('../basePage');

const CLOCK_IN = /\/TimeClock\/ClockIn/i;
const CLOCK_OUT = /\/TimeClock\/ClockOut/i;
const SAVE_TIME_CLOCK = /\/WorkItem\/SaveTimeClock\/\d+/i;

const pad = n => String(n).padStart(2, '0');

/**
 * View & Edit TimeClock (use case 62437), sandbox UI "Time Entry".
 *
 * A time entry is opened from the Time Summary tab of a Project (/Project/Edit/{id}, #pane-timesummary): every row of
 * #workitem-time-entries-table carries data-edit-url="/WorkItem/GetTimeClock/{timeClockId}" and opens the right-hand
 * drawer #slideOutPanel with form #formEditTimeClock (posts to /WorkItem/SaveTimeClock/{timeClockId}):
 *   - Task Date  : #timeEntryDateDisplay (click [data-date-display-trigger] to reveal the editor #timeEntryDateEdit)
 *   - Start Task : #StartTimeAtUtc (type=time, local time)          - End Task : #EndTimeAtUtc (type=time)
 *   - Duration   : #DurationMinutes (hh:mm:ss text; editing it derives the End time from the Start time)
 *   - Internal Note : #InternalNotes     - Billable switch : #IsBillable     - Save : #btnSaveTimeClock
 * Server refusals are shown as an .alert-danger inside the drawer, client checks as .field-validation-error.
 * Leaving the drawer with unsaved changes raises the app's #dirtyRecordWarningModal.
 *
 * Time entries cannot be created here (out of scope of 62437), so a test seeds its own entry with the project-level
 * Clock In / Clock Out of the header (the entry is then moved to a random past day, 00:20 - 00:30, because the server refuses overlaps) (a.clock-in[data-clockin-projectid], .clockout-stop[data-projectid], form
 * #formClockOut). Only one clock can run per user, so the spec runs on a single worker.
 * Buttons, fields and rows are located by id / data attribute, never by caption (the UI is localized per user).
 */
class TimeClockEditPage extends BasePage {
  constructor(page) {
    super(page);
    // ---- Project: Time Summary tab ----
    this.timeSummaryTab = page.locator('main .nav-tabs .nav-link[data-bs-target="#pane-timesummary"]');
    this.timeSummaryPane = page.locator('#pane-timesummary');
    this.timeEntriesTable = page.locator('#workitem-time-entries-table');
    this.timeEntryRows = page.locator('#workitem-time-entries-table tbody tr[data-edit-url]');

    // ---- Seeding: project-level Clock In / Clock Out ----
    this.clockOutDrawer = page.locator('#slideOutPanel.is-open #formClockOut');
    this.clockOutDateTrigger = page.locator('#formClockOut [data-date-display-trigger]');
    this.clockOutDate = page.locator('#formClockOut #timeEntryDateEdit');
    this.clockOutStart = page.locator('#formClockOut #StartTimeAtUtc');
    this.clockOutEnd = page.locator('#formClockOut #EndTimeAtUtc');
    this.clockOutSave = page.locator('#btnSaveClockOut');

    // ---- Time Entry drawer ----
    this.drawer = page.locator('#slideOutPanel.is-open');
    this.form = page.locator('#slideOutPanel #formEditTimeClock');
    this.drawerTitle = page.locator('#slideOutPanel .right-drawer__title');
    this.drawerClose = page.locator('#slideOutPanel .right-drawer__close');
    this.dateTrigger = page.locator('#formEditTimeClock [data-date-display-trigger]');
    this.dateDisplay = page.locator('#timeEntryDateDisplay');
    this.dateEdit = page.locator('#timeEntryDateEdit');
    this.startTime = page.locator('#formEditTimeClock #StartTimeAtUtc');
    this.endTime = page.locator('#formEditTimeClock #EndTimeAtUtc');
    this.duration = page.locator('#formEditTimeClock #DurationMinutes');
    this.internalNotes = page.locator('#formEditTimeClock #InternalNotes');
    this.billable = page.locator('#formEditTimeClock #IsBillable');
    this.saveButton = page.locator('#btnSaveTimeClock');
    this.errorAlert = page.locator('.alert-danger');
    this.fieldErrors = page.locator('#slideOutPanel .field-validation-error, #slideOutPanel #clockOutTimeRangeValidation');
    this.dirtyContinue = this.dirtyModal.locator('[data-action="continue"]');
  }

  // ---------------------------------------------------------------- navigation

  async gotoProject(projectId) {
    await this.openRecord(`/Project/Edit/${projectId}`, { timeout: 90_000 });
    await this.timeSummaryTab.waitFor({ state: 'visible', timeout: 60_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  /** Opens the Time Summary tab and waits for its time-entry rows. */
  async openTimeSummary() {
    await this.timeSummaryTab.click();
    await this.timeEntryRows.first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  row(timeClockId) {
    return this.page.locator(`#workitem-time-entries-table tbody tr[data-edit-url="/WorkItem/GetTimeClock/${timeClockId}"]`);
  }

  /** Reloads the project and shows the Time Summary tab. */
  async reloadTimeSummary(projectId) {
    await this.gotoProject(projectId);
    await this.openTimeSummary();
  }

  // ---------------------------------------------------------------- seeding (Clock In -> Clock Out)

  clockInButton(projectId) {
    return this.page.locator(`a.clock-in[data-clockin-projectid="${projectId}"]`);
  }

  clockOutButton(projectId) {
    return this.page.locator(`.clockout-stop[data-projectid="${projectId}"]`);
  }

  /**
   * Clock Out of the running clock. The entry is moved to its own slot - a random past day, 00:20 - 00:30 - so it never
   * overlaps another entry of the user (the server refuses overlapping entries).
   * @returns {Promise<{day:string}>} the day (yyyy-mm-dd) the entry was given
   */
  async clockOutRunning(projectId) {
    await this.clockOutButton(projectId).first().click();
    await this.clockOutDrawer.waitFor({ state: 'visible', timeout: 30_000 });
    const d = new Date(Date.now() - (30 + Math.floor(Math.random() * 5000)) * 86_400_000);
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    await this.clockOutDateTrigger.click();
    await this.clockOutDate.fill(day);
    await this.clockOutStart.fill('00:20');
    await this.clockOutEnd.fill('00:30');
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && CLOCK_OUT.test(r.url()), { timeout: 30_000 }),
      this.clockOutSave.click(),
    ]);
    const body = await response.json();
    if (!body.success) throw new Error(`Clock Out refused: ${body.message}`);
    return { day };
  }

  /**
   * Creates a time entry of the signed-in user on the project (project-level Clock In, then Clock Out into its own past-day
   * slot) and returns { id, day }. Leaves the page on the project's Time Summary tab. A clock left running by an earlier
   * run is closed first.
   */
  async seedEntry(projectId) {
    await this.gotoProject(projectId);
    // the header shows Clock In or (while a clock runs) Clock Out: wait for either, then close a clock left running
    await this.clockInButton(projectId).or(this.clockOutButton(projectId)).first().waitFor({ state: 'visible', timeout: 30_000 });
    if (await this.clockOutButton(projectId).first().isVisible()) {
      await this.clockOutRunning(projectId);
      await this.gotoProject(projectId);
      await this.clockInButton(projectId).first().waitFor({ state: 'visible', timeout: 30_000 });
    }
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && CLOCK_IN.test(r.url()), { timeout: 30_000 }),
      this.clockInButton(projectId).first().click(),
    ]);
    const { data } = await response.json();
    await this.clockOutButton(projectId).first().waitFor({ state: 'visible', timeout: 15_000 });
    const { day } = await this.clockOutRunning(projectId);
    await this.reloadTimeSummary(projectId);
    this.day = day;
    return { id: data.timeClockId, day };
  }

  // ---------------------------------------------------------------- the Time Entry drawer

  /** Opens a time entry in the drawer by id, the way a Time Summary row does (old days are not on the list's first page). */
  async openEntry(timeClockId) {
    await this.page.evaluate(url => window.openTimeEntryDrawer(url), `/WorkItem/GetTimeClock/${timeClockId}`);
    await this.form.waitFor({ state: 'visible', timeout: 30_000 });
    await this.saveButton.waitFor({ state: 'visible' });
  }

  /** Every control of the open drawer as shown. */
  async values() {
    return {
      start: await this.startTime.inputValue(),
      end: await this.endTime.inputValue(),
      duration: await this.duration.inputValue(),
      notes: await this.internalNotes.inputValue(),
      billable: await this.billable.isChecked(),
      date: await this.dateEdit.inputValue(),
    };
  }

  /** Task Date (yyyy-mm-dd): reveals the date editor first when it is still collapsed. */
  async setDate(isoDate) {
    if (!(await this.dateEdit.isVisible())) await this.dateTrigger.click();
    await this.dateEdit.fill(isoDate);
  }

  async setStart(hhmm) { await this.startTime.fill(hhmm); }

  async setEnd(hhmm) { await this.endTime.fill(hhmm); }

  async clearEnd() { await this.endTime.fill(''); }

  /** Duration as hh:mm:ss; the drawer derives the End time from the Start time. */
  async setDuration(hhmmss) {
    await this.duration.fill(hhmmss);
    await this.duration.blur();
  }

  async setNotes(text) { await this.internalNotes.fill(text); }

  async setBillable(on) {
    await this.billable.setChecked(on, { force: true });
  }

  /**
   * Clicks Save and waits for the SaveTimeClock post-back.
   * @returns {Promise<{status:number, success:boolean, message:string}>} the server's answer
   */
  async save() {
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && SAVE_TIME_CLOCK.test(r.url()), { timeout: 30_000 }),
      this.saveButton.click(),
    ]);
    const body = await response.json().catch(() => ({}));
    return { status: response.status(), success: !!body.success, message: body.message || '' };
  }

  /** Closes the drawer; with unsaved changes the app's "Unsaved changes" modal is answered with Continue Without Saving. */
  async closeDrawer() {
    await this.drawerClose.click();
    if (await this.isVisibleWithin(this.dirtyModal, 2_000)) await this.dirtyContinue.click();
    await this.drawer.waitFor({ state: 'hidden', timeout: 15_000 });
  }
}

module.exports = { TimeClockEditPage };
