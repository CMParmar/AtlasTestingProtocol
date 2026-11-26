const { env } = require('../utils/testData');

/**
 * View & Edit TimeClock (module TASK, docs/62437 View & Edit TimeClock.md).
 * The sandbox calls a TimeClock a "Time Entry". Entries are opened from the Time Summary tab of a Project and edited in a
 * drawer. Every test seeds its own entry (project-level Clock In / Clock Out of the signed-in user, moved to a random past day, 00:20 - 00:30)
 * on TIMECLOCK_PROJECT_ID (default: the task project, 819) and edits it. Entries cannot be deleted from the UI.
 * Test-case ids are the use case's "Additional Test Cases" (TC-1 .. TC-26).
 * Override in the root .env:
 *   TIMECLOCK_PROJECT_ID   project whose Time Summary tab is used (default TASK_PROJECT_ID, else 819)
 */
const MODULE = 'Time Clock Edit';

const tag = env.runTag;
const note = label => `ATL TimeClock ${label} ${tag}`;

/** yyyy-mm-dd of the day `n` days ago in the browser's (= this machine's) time zone; edits are dated in the past so they are never "in the future". */
const daysAgo = n => {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DATA = {
  projectId: process.env.TIMECLOCK_PROJECT_ID || process.env.TASK_PROJECT_ID || '819',
  // seeded entry: a random past day, 00:20 - 00:30, billable
  afterNoon: 12 * 60 + 2,
  // Windows sit just after midnight on a past day: the drawer compares the End time OF DAY with the current time and
  // ignores the date ("End time cannot be in the future"), so a late window would fail in the morning. The 12 hour cases
  // need the local time to be past 12:02 (see afterNoon).
  validDay: daysAgo(1),
  validStart: '00:10',
  validEnd: '00:40',
  validDuration: '00:30:00',
  
  
  // 1h 15m by editing the Duration
  editedDuration: '01:15:00',
  editedEnd: '01:25',
  
  
  // limits (BR-5 / BR-6)
  maxStart: '00:00',
  maxEnd: '12:00',
  
  overMaxEnd: '12:01',
  minStart: '00:10',
  minEnd: '00:11',
  
  // messages shown by the sandbox (the UI is localized per user: matched by pattern, English)
  saved: /(has|have) been saved|saved successfully/i,
  maxMessage: /maximum of 12 hours/i,
  sameTimeMessage: /must not be same/i,
  endRequiredMessage: /End time is required/i,
};

const tc = (id, name, description, condition, expected, extra = {}) => ({ id, name, description, condition, expected, ...extra });
const EDITOR = 'User has PERM.TASK.TimeClock.View, Update.Own (or Update.All) and EditBillable; the entry is the user\'s own, closed and has no invoice line.';
const NEG = { type: 'Negative' };

const cases = {
  // --- permissions / locks (not automatable with the single sandbox user) ---
  viewDenied: tc('TC-1', 'User without view permission cannot open a time entry', 'MF-1, AF-1: open a TimeClock as a user lacking PERM.TASK.TimeClock.View.', 'Second user without View (not automated).', 'Scenario "View Permission Denied"; the record is not shown.', { ...NEG, severity: 'critical' }),
  readOnlyNoUpdate: tc('TC-2', 'User without update permission sees the entry read-only', 'AF-2: open a TimeClock as a user with View only.', 'Second user with View only (not automated).', 'Record loads read-only; "You do not have permissions to edit this record."', { ...NEG }),
  readOnlyInvoiced: tc('TC-3', 'An invoice-associated entry is read-only', 'BR-12, AF-7: open a TimeClock whose InvoiceLineIDF is not null.', 'Entry linked to an invoice line (not automated: needs an invoiced entry).', 'Record read-only; scenario "Record is Read Only Due To Billing".', { ...NEG }),

  // --- edit / save ---
  editSetsManual: tc('TC-4', 'Editing an editable field saves the change (manual entry)', 'BR-1, BR-2, MF-2..MF-4: change Start / End and the note, save, reopen.', EDITOR, '"Your changes have been saved."; the new values are shown again. (IsManualEntry = 1 has no UI.)', { severity: 'critical' }),
  endBeforeStart: tc('TC-5', 'End earlier than Start is not saved', 'BR-10, AF-3: set the End time before the Start time and save.', EDITOR, 'The entry is not saved (the drawer wraps the End to the next day, so the length exceeds the maximum) and keeps its old values.', { ...NEG }),
  overMax: tc('TC-6', 'Duration above the 12 hour maximum is not saved', 'BR-5, AF-4: set a length of 12 h 1 min and save.', EDITOR, 'An error naming the 12 hour maximum is shown; the entry keeps its old values.', { ...NEG, severity: 'critical' }),
  underMin: tc('TC-7', 'Duration below the 1 minute minimum is not saved', 'BR-6, AF-5: make Start and End equal (length 0) and save.', EDITOR, 'An error is shown ("Start time and End time must not be same."); the entry keeps its old values.', { ...NEG, severity: 'critical' }),
  validEdit: tc('TC-8', 'A valid edit is saved', 'MF-3, MF-4, MF-5: set a valid 30 minute window on a past day and save.', EDITOR, '"Your changes have been saved."; the list shows the new range and duration.', { severity: 'critical' }),
  softDelete: tc('TC-9', 'Soft delete with permission', 'BR-8, BR-13, AF-6: soft delete a time entry.', 'The Time Entry drawer has no delete command in the sandbox (not automated).', 'Soft delete confirmation.'),
  softDeleteDenied: tc('TC-10', 'Soft delete without permission', 'BR-8: soft delete as a user without PERM.TASK.TimeClock.DeleteSoft.', 'Second user (not automated).', 'Scenario "Record is Read Only".', { ...NEG }),
  billableNoPerm: tc('TC-11', 'Billable cannot be changed without EditBillable', 'BR-15: open an entry as a user without PERM.TASK.TimeClock.EditBillable.', 'Second user (not automated).', 'Billable switch is read-only; a save does not change it.', { ...NEG }),
  billableWithPerm: tc('TC-12', 'Billable can be changed with EditBillable', 'BR-15: switch Billable off and save; reopen.', EDITOR, 'Saved; the switch is off when reopened and the list shows an unchecked Billable box.'),
  clearEnd: tc('TC-13', 'End time can be cleared on a closed entry (re-opens it)', 'BR-4: clear the End time of a closed entry and save.', EDITOR, 'The entry is saved as an open entry.', { defect: 'The Time Entry drawer refuses to clear the End time ("End time is required") although BR-4 allows EndTimeUtc = null.' }),
  terminalService: tc('TC-14', 'Times of an entry on a terminal Service are locked', 'BR.TASK.TimeClock.PreventCostAffectingEditsOnTerminalService.', 'Entry on a Work Item of a Completed Deliverable (not automated: needs one).', 'Start, End and BillableMinutes are not editable.', { ...NEG }),
  durationDerives: tc('TC-15', 'Duration is never stored as typed: it is recalculated from the times', 'BR.Task.TimeClock.DurationMinutesCalculation: type a Duration, save, reopen.', EDITOR, 'The End is derived from Start + Duration; the saved Start / End / Duration agree with each other.'),
  startPlusDuration: tc('TC-16', 'Start time plus Duration gives the End time', 'BR.Task.TimeClock.DurationMinutesCalculation: keep the Start, type a Duration.', EDITOR, 'The End time is derived; the entry saves.'),
  endPlusDuration: tc('TC-17', 'End time plus Duration gives the Start time', 'BR.Task.TimeClock.DurationMinutesCalculation: keep the End, type a Duration.', 'The sandbox drawer only derives the End from Start + Duration (not automated).', 'The Start time is derived; the entry saves.'),
  noChange: tc('TC-18', 'Saving without changes changes nothing', 'Open an entry and save at once.', EDITOR, 'The entry keeps its values (no error is shown).'),
  audit: tc('TC-19', 'An edit is audited', 'BR-11: edit an entry; look for the CORE.AuditEntry row.', 'No UI shows the audit row of a time entry (not automated).', 'A CORE.AuditEntry row exists.'),
  recentlyViewed: tc('TC-20', 'A save refreshes CORE.RecentlyViewed', 'MF-4: edit an entry; look in Recently Viewed.', 'Time entries are not listed on the Recently Viewed page (not automated).', 'The record is inserted / refreshed in CORE.RecentlyViewed.'),
  invoicedEdit: tc('TC-21', 'Editing an invoice-associated entry is refused', 'BR-12, AF-7.', 'Needs an invoiced entry (not automated).', 'Scenario "Record is Read Only Due To Billing".', { ...NEG }),
  invoicedDelete: tc('TC-22', 'An invoice-associated entry cannot be soft deleted', 'BR-12.', 'Needs an invoiced entry (not automated).', 'The action is blocked.', { ...NEG }),
  exactMax: tc('TC-23', 'A duration of exactly 12 hours is saved', 'BR-5 boundary: 08:00 - 20:00.', EDITOR, 'Saved; the list shows 12h.'),
  exactMin: tc('TC-24', 'A duration of exactly 1 minute is saved', 'BR-6 boundary: 09:00 - 09:01.', EDITOR, 'Saved; the list shows 1m.'),
  notesOnly: tc('TC-25', 'Editing only the Internal Note is saved', 'BR-1, BR-2: change only the note and save.', EDITOR, 'Saved; the note is shown when reopened and the times are unchanged.'),
  recalculates: tc('TC-26', 'Durations are recalculated on save', 'BR-3: change the times and compare the list before and after.', EDITOR, 'The list shows the duration of the new times.'),
  cancelDrawer: tc('TC-27', 'Closing the drawer without saving discards the changes', 'MF-2: change a field, close the drawer, answer "Continue Without Saving", reopen.', EDITOR, 'The reopened entry shows its old values.'),
};

module.exports = { MODULE, DATA, note, daysAgo, cases };
