const { env } = require('../utils/testData');

/**
 * Use case 63150 - View & Edit Rate Card (BILL), rate card /RateCard/Edit/{RATE_CARD_ID} (default 1).
 * Shared by the Add Rate suite (rateCardAddData.js) and the View & Edit suite (this file's rateCardCases).
 *
 * Every Rate Card Line a test adds lives in its own one-day effective window, so tests never overlap each other
 * (BR-4) and never touch the card's current pricing:
 *   future window - 90 days between 2035 and 2232, chosen by the run's start minute so repeated runs use other dates
 *                   (days 0-44: View & Edit suite, days 45-89: Add Rate suite)
 *   past window   - 4 days between 1950 and 1958 (same idea); a line that ended in the past is Full Lock (BR-2)
 */
const MODULE = 'Rate Card Update';

const TARGET_TYPES = ['Person', 'Labor Grade', 'Service Item', 'Bundle'];
const ALLOWED_BILLING_TYPES = ['Time & Material', 'Fixed Price', 'Subscription', 'Fee'];
const EXCLUDED_BILLING_TYPES = ['Custom Bid', 'Non-billable'];

/**
 * Messages as the sandbox shows them (/RateCard/Edit labels). `field` = the error the rate editor shows under the
 * field when it catches the rule itself before saving (e.g. a negative Rate).
 */
const SCENARIOS = {
  noRateRemains: { title: /No rate remains for/i, message: 'This was the last rate for', buttons: ['Establish a rate', 'Got it'] },
  archived: { title: /Archive the Rate Card/i, message: 'When you confirm, this rate card will remain in effect', buttons: ['Yes', 'Go Back'] },
  deleteConfirm: { title: /Delete this Rate\?/i, message: 'This permanently removes the rate for' },
  duplicate: { title: /Overlapping Rates/i, message: 'has overlapping rates on lines' },
  termInterval: { title: /Interval and Term do not align/i, message: "This term doesn't divide evenly by the billing interval." },
  endBeforeStart: { title: /Check the dates/i, message: "The end date can't be earlier than the start date.", field: /end date|earlier|before/i },
  negativeRate: { title: /Check the rate/i, message: "The rate can't be negative. Enter zero or more.", field: /negative/i },
};

// --- one-day effective windows, unique per test and per run ---
const runStart = (() => {
  const m = env.runId.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : Date.now();
})();
const runSlot = Math.floor(runStart / 60_000) % 800;   // 800 x 90 days -> 2035 to 2232; 800 x 4 days -> 1950 to 1958
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;
/** Future window day `n` (0-89) of this run: yyyy-mm-dd. */
const futureDate = n => iso(Date.UTC(2035, 0, 1) + (runSlot * 90 + n) * DAY);
/** Past window day `n` (0-3) of this run: yyyy-mm-dd (lines here are Full Lock once saved). */
const pastDate = n => iso(Date.UTC(1950, 0, 1) + (runSlot * 4 + n) * DAY);
const dayBefore = d => iso(Date.parse(d) - DAY);

/** A one-day Rate Card Line in future window day `n`. */
const line = (n, extra = {}) => ({ effectiveStart: futureDate(n), effectiveEnd: futureDate(n), ...extra });

const tc = (no, def) => ({ id: `TC_RCU_${String(no).padStart(3, '0')}`, ...def });

/** View & Edit Rate Card cases (adding rates is covered by the Add Rate suite). */
const rateCardCases = {
  // ---------- MF-1 / MF-2 / MF-3 view ----------
  view: tc(1, {
    severity: 'blocker',
    name: 'Rate card opens with its Rate Card Lines and edit commands',
    description: 'Verify a user with PERM.BILL.RateCard.Update sees the rate card, its Rate Card Lines in effect today and the means to edit it (MF-1).',
    condition: '/RateCard/Edit/{id} opened; user holds PERM.BILL.RateCard.View and PERM.BILL.RateCard.Update.',
    expected: 'The rate card name, the Rates grid (Target, Billing Type, Rate, Effective dates, Lock State), "Add Rate" and the Actions menu (Add Rate, View Unpriced Targets, Archive the Rate Card) are shown.',
  }),
  lineNumbers: tc(2, {
    severity: 'normal',
    name: 'Rate Card Line Numbers start at 1 and are unique',
    description: 'Verify each displayed Rate Card Line has a whole-number Line Number starting at 1 and unique on the rate card (MF-1).',
    condition: 'Rate card opened; at least one line in effect today.',
    expected: 'Line Numbers are 1, 2, 3 ... with no gaps or repeats.',
  }),
  ordering: tc(3, {
    severity: 'normal',
    name: 'Lines are ordered by Target Type, then Target Name',
    description: 'Verify the Rate Card Lines are listed by Target Type and then by Target Name (MF-1).',
    condition: 'Rate card opened; two or more lines in effect today.',
    expected: 'The (Target Type, Target Name) pairs appear in ascending order.',
  }),
  asOfDate: tc(4, {
    severity: 'critical',
    name: 'View rates as of a date shows only the lines in effect then',
    description: 'Verify viewing the rate card as of a date lists the lines in effect on that date - a line in a future window shows on its date and not the day before (MF-2, In Effect).',
    condition: 'Labor Grade rate added for one future day and saved.',
    expected: 'As of the window date the line is listed; as of the day before and as of today it is not.',
    data: line(0, { targetType: 'Labor Grade', rate: '142.50' }),
  }),
  unavailableTargets: tc(5, {
    severity: 'normal',
    name: 'Unpriced (Unavailable) Targets are listed with an add-rate affordance',
    description: 'Verify Actions -> View Unpriced Targets lists targets of the chosen type that have no rate on the date, each with a command to establish a rate (MF-3).',
    condition: 'Target Type = Labor Grade; date = a future window day (no lines then).',
    expected: 'At least one Labor Grade is listed, each with an add-rate command.',
    data: { targetType: 'Labor Grade', asOf: futureDate(1) },
  }),
  establishFromUnavailable: tc(6, {
    severity: 'normal',
    name: 'Adding a rate from Unpriced Targets pre-fills the target and date',
    description: 'Verify the add-rate command on an Unpriced Target opens the rate editor with that Target Type, Target and start date (MF-3 -> MF-4).',
    condition: 'Rates viewed as of a future window day; Unpriced Targets for Labor Grade.',
    expected: 'Target Type = Labor Grade, Target = the listed target, Effective Start Date = the chosen date, End Date empty.',
    data: { targetType: 'Labor Grade', asOf: futureDate(2) },
  }),
  // ---------- MF-6 update unlocked ----------
  updateRate: tc(7, {
    severity: 'blocker',
    name: 'Update the Rate of an Unlocked line',
    description: 'Verify the Rate of an Unlocked Rate Card Line is changed in place - no new line is created (MF-6).',
    condition: 'Unlocked Labor Grade line at 150.00 (no references, future window); Rate changed to 165.50.',
    expected: 'After Save the same line (same dates) shows 165.50 and no second line exists for that day.',
    data: line(3, { targetType: 'Labor Grade', rate: '150.00' }),
    update: { rate: '165.50' },
  }),
  updateEndDate: tc(8, {
    severity: 'normal',
    name: 'Update the end date of an Unlocked line',
    description: 'Verify the Effective End Date of an Unlocked line can be extended (MF-6, BR-20).',
    condition: 'Unlocked Labor Grade line for one day; end date moved two days later.',
    expected: 'After Save the line shows the new end date.',
    data: line(4, { targetType: 'Labor Grade', rate: '120.00' }),
    update: { effectiveEnd: futureDate(6) },
  }),
  updatePeriod: tc(9, {
    severity: 'normal',
    name: 'Move the effective period and rate of an Unlocked line',
    description: 'Verify an Unlocked line\'s start date, end date and rate can all be changed together (MF-6).',
    condition: 'Unlocked Labor Grade line on window day 7; moved to day 9 with Rate 210.00.',
    expected: 'After Save the line is shown on day 9 with Rate 210.00 and no longer on day 7.',
    data: line(7, { targetType: 'Labor Grade', rate: '200.00' }),
    update: { effectiveStart: futureDate(9), effectiveEnd: futureDate(9), rate: '210.00' },
  }),
  updateServiceItem: tc(10, {
    severity: 'normal',
    name: 'Update the Rate of an Unlocked Service Item line',
    description: 'Verify a Service Item line can be repriced in place (MF-6).',
    condition: 'Unlocked Service Item line at 1,000.00; Rate changed to 1,150.00.',
    expected: 'After Save the line shows 1150.00 on the same dates.',
    data: line(11, { targetType: 'Service Item', rate: '1000.00' }),
    update: { rate: '1150.00' },
  }),
  // ---------- MF-12 delete ----------
  deleteRate: tc(11, {
    severity: 'critical',
    name: 'Delete an Unlocked line',
    description: 'Verify Delete Rate on an Unlocked line asks "Delete this Rate?" naming the target and, on Yes, removes the line (MF-12).',
    condition: 'Unlocked Labor Grade line (future window); Delete Rate, Yes.',
    expected: 'The confirmation names the target; the line is no longer listed as of its date.',
    data: line(13, { targetType: 'Labor Grade', rate: '75.00' }),
  }),
  lastRateNotice: tc(12, {
    severity: 'normal',
    name: 'Deleting the last rate for a target raises "No rate remains"',
    description: 'Verify deleting the last Rate Card Line in effect for a target shows "No rate remains for {TargetName}" with Establish a rate and Got it (MF-12, Scen-1, EnableLastRateNotice = 1). Skipped when the target still has other current rates.',
    condition: 'A Labor Grade with no other current rate; its only line deleted.',
    expected: 'The notice names the target and offers "Establish a rate" and "Got it".',
    data: line(14, { targetType: 'Labor Grade', rate: '60.00' }),
  }),
  // ---------- MF-11 references ----------
  references: tc(13, {
    severity: 'minor',
    name: 'View references of a line with no Dependent References',
    description: 'Verify View References shows the total number of Dependent References - zero for a new line (MF-11, BR-16).',
    condition: 'New Labor Grade line (future window) saved; View References opened.',
    expected: 'The total shown is 0 and no references are listed.',
    data: line(15, { targetType: 'Labor Grade', rate: '88.00' }),
  }),
  // ---------- BR-2 / MF-8 full lock ----------
  fullLock: tc(14, {
    severity: 'critical',
    name: 'A line whose end date has passed is Full Lock',
    description: 'Verify a Rate Card Line ending before the current date cannot be changed or deleted (BR-2, D-11 allows the past start).',
    condition: 'Labor Grade line in a past window (1950-1958) saved; viewed as of its date.',
    expected: 'The line offers no Edit / Update / Delete command (Reinstate only).',
    data: { targetType: 'Labor Grade', rate: '45.00', effectiveStart: pastDate(0), effectiveEnd: pastDate(0) },
  }),
  reinstate: tc(15, {
    severity: 'critical',
    name: 'Reinstate a Full Lock rate',
    description: 'Verify Reinstate stages a New Rate that copies the Full Lock line with the entered Rate and dates; the old line is unchanged (MF-8).',
    condition: 'Full Lock Labor Grade line (past window); reinstated for one future day with Rate 55.00.',
    expected: 'After Save a new line for the same target is shown on the future day with Rate 55.00; the past line still shows 45.00.',
    data: { targetType: 'Labor Grade', rate: '45.00', effectiveStart: pastDate(1), effectiveEnd: pastDate(1) },
    update: { rate: '55.00', effectiveStart: futureDate(17), effectiveEnd: futureDate(17) },
  }),
  // ---------- MF-14 cancel ----------
  cancelConfirm: tc(16, {
    type: 'Negative', severity: 'critical',
    name: 'Closing the editor without Save discards the edit',
    description: 'Verify closing the rate editor (X) after changing the Rate - continuing without saving if warned - leaves the rate as last saved (MF-14).',
    condition: 'Saved Labor Grade line repriced 90.00 -> 95.00 in the editor; editor closed without Save.',
    expected: 'The line still shows 90.00.',
    data: line(19, { targetType: 'Labor Grade', rate: '90.00' }),
    update: { rate: '95.00' },
  }),
  cancelDismiss: tc(17, {
    type: 'Negative', severity: 'normal',
    name: 'Staying on the unsaved-changes warning keeps the edit for Save',
    description: 'Verify that answering the unsaved-changes warning with Cancel keeps the editor and the entered Rate, which Save then stores (MF-14, MF-13). Skipped when the editor raises no warning.',
    condition: 'Saved Labor Grade line repriced 80.00 -> 81.00; X clicked, warning answered with Cancel; Save.',
    expected: 'The line shows 81.00.',
    data: line(21, { targetType: 'Labor Grade', rate: '80.00' }),
    update: { rate: '81.00' },
  }),
  // ---------- MF-9 archive ----------
  archiveNotice: tc(18, {
    severity: 'normal',
    name: 'Archive asks for confirmation; Go Back keeps the card active',
    description: 'Verify Actions -> Archive the Rate Card asks "Archive the Rate Card {name}?" explaining the effect, and Go Back archives nothing (MF-9, Scen-2).',
    condition: 'Archive the Rate Card clicked, then Go Back.',
    expected: 'The confirmation names the card and offers Yes / Go Back; after Go Back the card is still active (Archive still offered).',
  }),
  archiveSave: tc(19, {
    severity: 'normal',
    name: 'Archive with Yes archives the rate card',
    description: 'Verify confirming Archive the Rate Card with Yes archives it while its lines stay unchanged (MF-9). Runs only with RATE_CARD_ALLOW_ARCHIVE=true.',
    condition: 'RATE_CARD_ALLOW_ARCHIVE=true (permanent: the card can no longer be selected for new accounts).',
    expected: 'The card reloads as archived (Archive no longer offered) and its lines are still listed.',
  }),
  // ---------- AF-1 on edit ----------
  editNegativeRate: tc(20, {
    type: 'Negative', severity: 'critical',
    name: 'Editing a rate to a negative value is rejected',
    description: 'Verify changing an Unlocked line\'s Rate below zero raises "Check the rate" and nothing is saved (MF-6, BR-21, Scen-14).',
    condition: 'Saved Labor Grade line at 70.00; Rate changed to -10.00.',
    expected: `"${SCENARIOS.negativeRate.message}" is shown; the line still shows 70.00.`,
    data: line(23, { targetType: 'Labor Grade', rate: '70.00' }),
    update: { rate: '-10.00' }, scenario: 'negativeRate',
  }),
  editEndBeforeStart: tc(21, {
    type: 'Negative', severity: 'normal',
    name: 'Editing the end date before the start date is rejected',
    description: 'Verify moving an Unlocked line\'s end date before its start date raises "Check the dates" (MF-6, BR-20, Scen-13).',
    condition: 'Saved Labor Grade line on window day 25; end date set to day 24.',
    expected: `"${SCENARIOS.endBeforeStart.message}" is shown; the line keeps its dates.`,
    data: line(25, { targetType: 'Labor Grade', rate: '66.00' }),
    update: { effectiveEnd: futureDate(24) }, scenario: 'endBeforeStart',
  }),
  editOverlap: tc(22, {
    type: 'Negative', severity: 'critical',
    name: 'Moving a line onto another line of the same target is rejected',
    description: 'Verify editing a line so that its period overlaps another line with the same target, billing type and unit raises "Overlapping Rates" (MF-6, BR-4, Scen-6).',
    condition: 'Two saved lines for the same Labor Grade on days 27 and 29; the second moved to day 27.',
    expected: `"${SCENARIOS.duplicate.message}" is shown; the second line stays on day 29.`,
    data: line(27, { targetType: 'Labor Grade', rate: '101.00' }),
    second: line(29, { rate: '102.00' }),
    update: { effectiveStart: futureDate(27), effectiveEnd: futureDate(27) }, scenario: 'duplicate',
  }),
};

module.exports = {
  MODULE, TARGET_TYPES, ALLOWED_BILLING_TYPES, EXCLUDED_BILLING_TYPES, SCENARIOS,
  futureDate, pastDate, dayBefore, line, rateCardCases,
};
