// View & Edit TimeClock (module TASK, docs/62437 View & Edit TimeClock.md). The sandbox calls a TimeClock a "Time Entry".
// A time entry is opened from the Time Summary tab of a Project and edited in the right-hand drawer.
// Functional project, saved session, no retries. Every test seeds its own entry of the signed-in user (project-level
// Clock In -> Clock Out) on TIMECLOCK_PROJECT_ID and edits it; entries cannot be deleted from the UI.
// Only one clock can run per user, so the file runs its tests in order on one worker.
// Locators were taken from the live sandbox drawer (#formEditTimeClock, #StartTimeAtUtc, #EndTimeAtUtc, #DurationMinutes ...).
//
// Differences between the use case and the sandbox (the tests check what the application does today):
//   - the drawer wraps an End earlier than the Start to the next day instead of raising "Invalid Timestamp Order" (AF-3 is struck out in the use case),
//   - Duration below the minimum cannot be typed: a length of 0 is refused with "Start time and End time must not be same.",
//   - the messages for the 12 hour maximum / the minimum are worded differently from the use case,
//   - the drawer's "End time cannot be in the future" check compares only the time of day and ignores the Task Date, so test windows sit just after midnight (12 hour cases run after 12:02),
//   - TC-13: the End time cannot be cleared ("End time is required") - reported as a known defect.
//
// Not automated (skipped with the reason): TC-1 / TC-2 / TC-10 / TC-11 (need a second user with fewer permissions),
// TC-3 / TC-21 / TC-22 (need an invoiced entry), TC-9 (no soft-delete command in the drawer), TC-14 (needs a terminal Service),
// TC-17 (the drawer only derives the End from Start + Duration), TC-19 / TC-20 (no UI shows the audit row / Recently Viewed entry).

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, DATA, note, cases: c } = require('../testData/timeClockEditData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefect, recordTestValues, recordUrl } = require('../utils/testCase');

// One clock per user: run the tests of this file in order on one worker
test.describe.configure({ mode: 'default' });

/** The 12 hour windows end at 12:00 / 12:01: before 12:02 local time the drawer's time-of-day "future" check refuses them. */
function skipBeforeNoon(testInfo) {
  const now = new Date();
  test.skip(now.getHours() * 60 + now.getMinutes() < DATA.afterNoon, 'The drawer compares the End time of day with the current time (ignoring the date): run after 12:02 local time');
}

/** Labels the test and flags a known defect. */
async function begin(testCase, testInfo) {
  await applyAllureLabels(testCase, MODULE);
  knownDefect(testInfo, testCase);
}

/** Seeds an entry of the signed-in user, opens it in the drawer and logs it; returns its TimeClock id. */
async function seedAndOpen(p, testInfo) {
  const entry = await test.step('Seed a time entry (Clock In, Clock Out) and open it', async () => {
    const entry = await p.seedEntry(DATA.projectId);
    await p.openEntry(entry.id);
    return entry;
  });
  await recordUrl(testInfo, p.page.url(), `Project ${DATA.projectId} - Time Summary`);
  await recordTestValues(testInfo, { 'Time Entry': `${entry.id} (${entry.day}, 00:20 - 00:30)` });
  return entry.id;
}

/** Closes the drawer (if still open) and reopens the entry: the drawer reads the entry from the server, so what is shown is what was stored. */
async function reopen(p, id) {
  if (await p.drawer.isVisible().catch(() => false)) await p.closeDrawer();
  await p.openEntry(id);
  return p.values();
}

/** Saves and expects the "Your changes have been saved." confirmation. */
async function saveAndExpectSaved(p) {
  const result = await p.save();
  expect(result.success, `the server answered: "${result.message}"`).toBe(true);
  await expect(p.savedMessage, 'save confirmation').toBeVisible();
  await expect(p.drawer, 'drawer closes after a successful save').toBeHidden();
  return result;
}

/** Saves and expects the save to be refused: an error is shown, the drawer stays open and the stored values are unchanged. */
async function saveAndExpectRefused(p, id, before) {
  const result = await p.save();
  expect(result.success, 'the save is refused').toBe(false);
  await expect(p.errorAlert.or(p.fieldErrors).filter({ hasText: /\S/ }).first(), 'an error is shown').toBeVisible();
  await expect(p.drawer, 'drawer stays open').toBeVisible();
  const stored = await reopen(p, id);
  expect(stored, 'the stored entry is unchanged').toEqual(before);
  return result;
}

test.describe('View & Edit TimeClock', () => {
  // ================= permissions and locks (not automated) =================
  test.skip(tcTitle(c.viewDenied), tcDetails(c.viewDenied, MODULE), async () => { /* needs a user without PERM.TASK.TimeClock.View */ });
  test.skip(tcTitle(c.readOnlyNoUpdate), tcDetails(c.readOnlyNoUpdate, MODULE), async () => { /* needs a user with View only */ });
  test.skip(tcTitle(c.readOnlyInvoiced), tcDetails(c.readOnlyInvoiced, MODULE), async () => { /* needs an invoice-associated entry */ });

  // ================= MF-2 .. MF-5 edit and save =================
  test(tcTitle(c.editSetsManual), tcDetails(c.editSetsManual, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.editSetsManual, testInfo);
    const id = await seedAndOpen(p, testInfo);
    const text = note('Manual');
    await recordTestValues(testInfo, { 'Start Task': DATA.validStart, 'End Task': DATA.validEnd, 'Internal Note': text });
    await p.setStart(DATA.validStart);
    await p.setEnd(DATA.validEnd);
    await p.setNotes(text);
    await saveAndExpectSaved(p);
    expect(await reopen(p, id)).toMatchObject({ start: DATA.validStart, end: DATA.validEnd, duration: DATA.validDuration, notes: text });
  });

  test(tcTitle(c.endBeforeStart), tcDetails(c.endBeforeStart, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.endBeforeStart, testInfo);
    const id = await seedAndOpen(p, testInfo);
    const before = await p.values();
    await recordTestValues(testInfo, { 'Start Task': '10:00', 'End Task': '09:00' });
    await p.setStart('10:00');
    await p.setEnd('09:00');
    await saveAndExpectRefused(p, id, before);
  });

  test(tcTitle(c.overMax), tcDetails(c.overMax, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    skipBeforeNoon(testInfo);
    await begin(c.overMax, testInfo);
    const id = await seedAndOpen(p, testInfo);
    const before = await p.values();
    await recordTestValues(testInfo, { 'Start Task': DATA.maxStart, 'End Task': DATA.overMaxEnd });
    await p.setStart(DATA.maxStart);
    await p.setEnd(DATA.overMaxEnd);
    const result = await saveAndExpectRefused(p, id, before);
    expect(result.message, 'maximum duration message').toMatch(DATA.maxMessage);
  });

  test(tcTitle(c.underMin), tcDetails(c.underMin, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.underMin, testInfo);
    const id = await seedAndOpen(p, testInfo);
    const before = await p.values();
    await recordTestValues(testInfo, { 'Start Task': DATA.minStart, 'End Task': DATA.minStart });
    await p.setStart(DATA.minStart);
    await p.setEnd(DATA.minStart);
    const result = await saveAndExpectRefused(p, id, before);
    expect(result.message, 'minimum duration message').toMatch(DATA.sameTimeMessage);
  });

  test(tcTitle(c.validEdit), tcDetails(c.validEdit, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.validEdit, testInfo);
    const id = await seedAndOpen(p, testInfo);
    await recordTestValues(testInfo, { 'Start Task': DATA.validStart, 'End Task': DATA.validEnd });
    await p.setStart(DATA.validStart);
    await p.setEnd(DATA.validEnd);
    await saveAndExpectSaved(p);
    await expect(p.savedMessage).toHaveText(DATA.saved);
    expect(await reopen(p, id)).toMatchObject({ start: DATA.validStart, end: DATA.validEnd, duration: DATA.validDuration });
  });

  test.skip(tcTitle(c.softDelete), tcDetails(c.softDelete, MODULE), async () => { /* the drawer has no delete command */ });
  test.skip(tcTitle(c.softDeleteDenied), tcDetails(c.softDeleteDenied, MODULE), async () => { /* needs a user without DeleteSoft */ });
  test.skip(tcTitle(c.billableNoPerm), tcDetails(c.billableNoPerm, MODULE), async () => { /* needs a user without EditBillable */ });

  test(tcTitle(c.billableWithPerm), tcDetails(c.billableWithPerm, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.billableWithPerm, testInfo);
    const id = await seedAndOpen(p, testInfo);
    await expect(p.billable, 'Billable is editable with EditBillable').toBeEnabled();
    expect((await p.values()).billable, 'a seeded entry is billable').toBe(true);
    await recordTestValues(testInfo, { Billable: false });
    await p.setBillable(false);
    await saveAndExpectSaved(p);
    expect((await reopen(p, id)).billable, 'Billable stored').toBe(false);
  });

  test(tcTitle(c.clearEnd), tcDetails(c.clearEnd, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.clearEnd, testInfo);
    await seedAndOpen(p, testInfo);
    await recordTestValues(testInfo, { 'End Task': '(cleared)' });
    await p.clearEnd();
    const result = await p.save();
    expect(result.success, `saved as an open entry; the drawer says: "${await p.fieldErrors.allInnerTexts()}"`).toBe(true);
  });

  test.skip(tcTitle(c.terminalService), tcDetails(c.terminalService, MODULE), async () => { /* needs an entry on a terminal Service */ });

  // ================= BR.Task.TimeClock.DurationMinutesCalculation =================
  test(tcTitle(c.durationDerives), tcDetails(c.durationDerives, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.durationDerives, testInfo);
    const id = await seedAndOpen(p, testInfo);
    await recordTestValues(testInfo, { 'Start Task': DATA.validStart, Duration: DATA.editedDuration });
    await p.setStart(DATA.validStart);
    await p.setDuration(DATA.editedDuration);
    await expect(p.endTime, 'End derived from Start + Duration').toHaveValue(DATA.editedEnd);
    await saveAndExpectSaved(p);
    expect(await reopen(p, id)).toMatchObject({ start: DATA.validStart, end: DATA.editedEnd, duration: DATA.editedDuration });
  });

  test(tcTitle(c.startPlusDuration), tcDetails(c.startPlusDuration, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.startPlusDuration, testInfo);
    const id = await seedAndOpen(p, testInfo);
    await recordTestValues(testInfo, { 'Start Task': DATA.validStart, Duration: DATA.validDuration });
    await p.setStart(DATA.validStart);
    await p.setDuration(DATA.validDuration);
    await expect(p.endTime, 'End derived from Start + Duration').toHaveValue(DATA.validEnd);
    await saveAndExpectSaved(p);
    expect(await reopen(p, id)).toMatchObject({ start: DATA.validStart, end: DATA.validEnd, duration: DATA.validDuration });
  });

  test.skip(tcTitle(c.endPlusDuration), tcDetails(c.endPlusDuration, MODULE), async () => { /* the drawer derives only the End time */ });

  test(tcTitle(c.noChange), tcDetails(c.noChange, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.noChange, testInfo);
    const id = await seedAndOpen(p, testInfo);
    const before = await p.values();
    await p.save();
    await expect(p.errorAlert, 'no error').toHaveCount(0);
    expect(await reopen(p, id), 'values unchanged').toEqual(before);
  });

  test.skip(tcTitle(c.audit), tcDetails(c.audit, MODULE), async () => { /* no UI shows CORE.AuditEntry of a time entry */ });
  test.skip(tcTitle(c.recentlyViewed), tcDetails(c.recentlyViewed, MODULE), async () => { /* time entries are not listed in Recently Viewed */ });
  test.skip(tcTitle(c.invoicedEdit), tcDetails(c.invoicedEdit, MODULE), async () => { /* needs an invoiced entry */ });
  test.skip(tcTitle(c.invoicedDelete), tcDetails(c.invoicedDelete, MODULE), async () => { /* needs an invoiced entry */ });

  // ================= boundaries =================
  test(tcTitle(c.exactMax), tcDetails(c.exactMax, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    skipBeforeNoon(testInfo);
    await begin(c.exactMax, testInfo);
    const id = await seedAndOpen(p, testInfo);
    await recordTestValues(testInfo, { 'Start Task': DATA.maxStart, 'End Task': DATA.maxEnd });
    await p.setStart(DATA.maxStart);
    await p.setEnd(DATA.maxEnd);
    await saveAndExpectSaved(p);
    expect((await reopen(p, id)).duration, 'stored duration').toBe('12:00:00');
  });

  test(tcTitle(c.exactMin), tcDetails(c.exactMin, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.exactMin, testInfo);
    const id = await seedAndOpen(p, testInfo);
    await recordTestValues(testInfo, { 'Start Task': DATA.minStart, 'End Task': DATA.minEnd });
    await p.setStart(DATA.minStart);
    await p.setEnd(DATA.minEnd);
    await saveAndExpectSaved(p);
    expect((await reopen(p, id)).duration, 'stored duration').toBe('00:01:00');
  });

  test(tcTitle(c.notesOnly), tcDetails(c.notesOnly, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.notesOnly, testInfo);
    const id = await seedAndOpen(p, testInfo);
    const before = await p.values();
    const text = note('Notes only');
    await recordTestValues(testInfo, { 'Internal Note': text });
    await p.setNotes(text);
    await saveAndExpectSaved(p);
    expect(await reopen(p, id)).toEqual({ ...before, notes: text });
  });

  test(tcTitle(c.recalculates), tcDetails(c.recalculates, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.recalculates, testInfo);
    const id = await seedAndOpen(p, testInfo);
    expect((await p.values()).duration, 'seeded length').toBe('00:10:00');
    await recordTestValues(testInfo, { 'Start Task': DATA.validStart, 'End Task': DATA.validEnd });
    await p.setStart(DATA.validStart);
    await p.setEnd(DATA.validEnd);
    await saveAndExpectSaved(p);
    expect((await reopen(p, id)).duration, 'recalculated length').toBe(DATA.validDuration);
  });

  test(tcTitle(c.cancelDrawer), tcDetails(c.cancelDrawer, MODULE), async ({ timeClockEditPage: p }, testInfo) => {
    await begin(c.cancelDrawer, testInfo);
    const id = await seedAndOpen(p, testInfo);
    const before = await p.values();
    await p.setNotes(note('Discarded'));
    await p.setBillable(false);
    await p.closeDrawer();
    expect(await reopen(p, id), 'old values after Continue Without Saving').toEqual(before);
  });
});
