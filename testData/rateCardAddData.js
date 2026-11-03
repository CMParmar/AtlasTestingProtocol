const { TARGET_TYPES, SCENARIOS } = require('./rateCardData');

/**
 * Use case 63150 - View & Edit Rate Card, MF-4 Establish a New Rate, on /RateCard/Edit/{RATE_CARD_ID} (default 1):
 * "Add Rate" -> rate editor (Target Type, Target, Billing Type, Unit of Measure, Rate, Effective Start / End Date,
 * + Subscription Term / Interval for Subscription) -> Save, which stores the rate at once.
 * Dates are written relative to today - 'today', 'today+2', 'today-7' - and resolved at run time from the card's
 * default "Rates as of" date (utils/rateCardFlow.js dated()), so every rate added is shown on the Rates tab.
 * Rates run from today to today (one day), so the target is free again for tomorrow's run.
 * `target` left out = the first offered target that has no rate on those days (the card's open-ended rates are
 * skipped); `targetType` left out = the first of Person, Bundle, Service Item, Labor Grade with such a target;
 * `billingType` / `unitOfMeasure` left out = the first allowed value (Time & Material preferred for people and labor
 * grades).
 */
const MODULE = 'Rate Card Add';

const rate = (extra = {}) => ({ effectiveStart: 'today', effectiveEnd: 'today', ...extra });
const tc = (no, def) => ({ id: `TC_RCA_${String(no).padStart(3, '0')}`, ...def });

const rateCardAddCases = {
  // ---------- MF-4 fields and choices ----------
  addRateButton: tc(1, {
    severity: 'blocker',
    name: '"Add Rate" opens the rate editor',
    description: 'Verify the "Add Rate" button on the Rates tab - and Actions -> Add Rate - open the editor to establish a new Rate Card Line (MF-4).',
    condition: '/RateCard/Edit/{id} opened by a user with PERM.BILL.RateCard.Update.',
    expected: 'The rate editor slides open with its fields and Save, from both the button and the Actions menu.',
  }),
  fields: tc(2, {
    severity: 'critical',
    name: 'New rate shows Target Type, Target, Unit, Billing Type, Rate and dates',
    description: 'Verify Add Rate exposes Target Type, Target, Unit of Measure, Billing Type, Rate, Effective Start Date and Effective End Date (MF-4).',
    condition: 'Add Rate clicked.',
    expected: 'All seven fields are shown; Effective End Date defaults to empty.',
  }),
  targetTypes: tc(3, {
    severity: 'critical',
    name: 'Target Type offers Person, Labor Grade, Service Item and Bundle',
    description: 'Verify the Target Type choices are the four kinds held in BILL.usysRateCardLineTarget (MF-4, Language: Target Type).',
    condition: 'Add Rate clicked.',
    expected: `Options: ${TARGET_TYPES.join(', ')}.`,
  }),
  targetsByType: tc(4, {
    severity: 'normal',
    name: 'Target list follows the selected Target Type',
    description: 'Verify the Target choices change with the Target Type - each type offers only records of that type (MF-4, BR-15).',
    condition: 'Target Type switched between Labor Grade, Person, Service Item and Bundle.',
    expected: 'The Target options differ between Target Types; a Labor Grade name is not offered as a Person.',
  }),
  billingTypes: tc(5, {
    severity: 'critical',
    name: 'Billing Type never offers Custom Bid or Non-billable',
    description: 'Verify that for every Target Type the Billing Type choices are limited to Time & Material, Fixed Price, Subscription and Fee (BR-12, MF-4).',
    condition: 'Each Target Type with an available target selected in turn.',
    expected: 'No Target Type offers Custom Bid or Non-billable.',
  }),
  subscriptionFields: tc(6, {
    severity: 'normal',
    name: 'Subscription Term and Interval appear only for Subscription',
    description: 'Verify Subscription Term and Subscription Interval are exposed only when the Billing Type is Subscription (MF-4, BR-9). Skipped when no Service Item offers Subscription.',
    condition: 'Service Item target; Billing Type switched between Subscription and another type.',
    expected: 'Term and Interval shown for Subscription, hidden for the other billing type.',
    data: { targetType: 'Service Item' },
  }),
  clearTarget: tc(7, {
    severity: 'normal',
    name: 'Changing the Target Type clears the chosen Target',
    description: 'Verify a Target that no longer fits is cleared when the Target Type changes (MF-4 clearing behaviour).',
    condition: 'Labor Grade target chosen; Target Type changed to Service Item.',
    expected: 'The Target is cleared.',
  }),
  clearUnit: tc(8, {
    severity: 'minor',
    name: 'Changing the Billing Type clears a Unit it does not allow',
    description: 'Verify a Unit of Measure that the new Billing Type does not allow is cleared (MF-4, BR-18). Skipped when every billing type allows the same units.',
    condition: 'Unit chosen for one billing type; billing type changed to one whose units do not include it.',
    expected: 'The Unit of Measure is cleared.',
  }),
  // ---------- add a rate for each Target Type ----------
  laborGrade: tc(9, {
    severity: 'blocker',
    name: 'Add a Labor Grade rate',
    description: 'Verify a Labor Grade rate (Time & Material) is added, saved and listed (MF-4, MF-13).',
    condition: 'Target Type Labor Grade; first Labor Grade; Rate 150.00; effective today.',
    expected: 'After Save the Rates tab (Rates as of today) lists the Labor Grade with Rate 150.00.',
    data: rate({ targetType: 'Labor Grade', rate: '150.00' }),
  }),
  person: tc(10, {
    severity: 'blocker',
    name: 'Add a Person rate',
    description: 'Verify a rate for a Person with an enabled user is added and saved (MF-4, BR-15). Skipped when no Person is offered.',
    condition: 'Target Type Person; first Person offered; Rate 185.00.',
    expected: 'The Rates tab (Rates as of today) lists the Person with Rate 185.00.',
    data: rate({ targetType: 'Person', rate: '185.00' }),
  }),
  serviceItem: tc(11, {
    severity: 'blocker',
    name: 'Add a Service Item rate',
    description: 'Verify a Service Item rate with a billing type the item allows is added and saved (MF-4, BR-17, BR-18).',
    condition: 'Target Type Service Item; first Service Item; its first allowed billing type and unit; Rate 1,250.00.',
    expected: 'The Rates tab (Rates as of today) lists the Service Item with Rate 1250.00.',
    data: rate({ targetType: 'Service Item', rate: '1250.00' }),
  }),
  bundle: tc(12, {
    severity: 'critical',
    name: 'Add a Bundle rate',
    description: 'Verify a Bundle with a published version can be priced; the line targets that published version (MF-4, BR-14). Skipped when no bundle has a published version.',
    condition: 'Target Type Bundle; first bundle offered; Rate 2,400.00.',
    expected: 'The Rates tab (Rates as of today) lists the Bundle with Rate 2400.00.',
    data: rate({ targetType: 'Bundle', rate: '2400.00' }),
  }),
  secondLaborGrade: tc(13, {
    severity: 'normal',
    name: 'Add a rate for a second Labor Grade',
    description: 'Verify rates for two different Labor Grades on the same day do not conflict (BR-4 keys on the target).',
    condition: 'Target Type Labor Grade; the next Labor Grade without a rate today (not the one of TC_RCA_009); Rate 175.00 today.',
    expected: 'The second Labor Grade line is listed with Rate 175.00. Skipped when only one Labor Grade exists.',
    data: rate({ targetType: 'Labor Grade', rate: '175.00' }),
  }),
  // ---------- each billing type ----------
  fixedPrice: tc(14, {
    severity: 'critical',
    name: 'Add a Fixed Price rate',
    description: 'Verify a rate with Billing Type Fixed Price is saved for a target that allows it (BR-12, BR-17).',
    condition: 'First Target Type / target whose billing types include Fixed Price; Rate 5,000.00.',
    expected: 'The line is listed with Billing Type Fixed Price and Rate 5000.00. Skipped when no target allows Fixed Price.',
    data: rate({ billingType: 'Fixed Price', rate: '5000.00' }),
  }),
  fee: tc(15, {
    severity: 'normal',
    name: 'Add a Fee rate',
    description: 'Verify a rate with Billing Type Fee is saved for a target that allows it (BR-12, BR-17).',
    condition: 'First Target Type / target whose billing types include Fee; Rate 250.00.',
    expected: 'The line is listed with Billing Type Fee and Rate 250.00. Skipped when no target allows Fee.',
    data: rate({ billingType: 'Fee', rate: '250.00' }),
  }),
  timeMaterial: tc(16, {
    severity: 'normal',
    name: 'Add a Time & Material rate for a Service Item',
    description: 'Verify a Time & Material Service Item rate is saved when the item allows it (BR-17, BR-18).',
    condition: 'Service Item whose billing types include Time & Material; Rate 140.00.',
    expected: 'The line is listed with Billing Type Time & Material. Skipped when no Service Item allows it.',
    data: rate({ targetType: 'Service Item', billingType: 'Time', rate: '140.00' }),
  }),
  subscription: tc(17, {
    severity: 'critical',
    name: 'Add a Subscription rate with a term divisible by the interval',
    description: 'Verify a Subscription rate with Subscription Interval and a Term that is a multiple of it is saved (BR-9, BR-13).',
    condition: 'Service Item (or subscription Bundle) that offers Subscription; Interval and a Term divisible by it; Rate 99.00.',
    expected: 'The Subscription line is listed with Rate 99.00. Skipped when no target offers Subscription.',
    data: rate({ billingType: 'Subscription', rate: '99.00' }),
  }),
  // ---------- rate values and dates ----------
  zeroRate: tc(18, {
    severity: 'normal',
    name: 'A rate of zero is accepted',
    description: 'Verify Rate = 0.00 is allowed (BR-21: zero or greater).',
    condition: 'First free target (any Target Type); Rate 0.00 today.',
    expected: 'The line is saved with Rate 0.00.',
    data: rate({ rate: '0.00' }),
  }),
  decimalRate: tc(19, {
    severity: 'normal',
    name: 'A rate with cents is saved exactly',
    description: 'Verify a Rate with two decimals is stored and shown unchanged.',
    condition: 'First free target (any Target Type); Rate 87.25 today.',
    expected: 'The line is saved with Rate 87.25.',
    data: rate({ rate: '87.25' }),
  }),
  largeRate: tc(20, {
    severity: 'minor',
    name: 'A large rate is saved',
    description: 'Verify a large Rate (25,000.00) is accepted and shown in full.',
    condition: 'Service Item target; Rate 25000.00.',
    expected: 'The line is saved with Rate 25000.00.',
    data: rate({ targetType: 'Service Item', rate: '25000.00' }),
  }),
  multiDay: tc(21, {
    severity: 'normal',
    name: 'Add a rate for a multi-day period',
    description: 'Verify a rate effective over several days is in effect on each of them (MF-4, In Effect).',
    condition: 'First free target; Effective Start = today, End = today + 2; Rate 132.00.',
    expected: 'The line is on the Rates tab today and is still listed as of its end date.',
    data: { rate: '132.00', effectiveStart: 'today', effectiveEnd: 'today+2' },
  }),
  backdated: tc(22, {
    severity: 'normal',
    name: 'A new rate may start in the past',
    description: 'Verify a rate with a start date before the current date is accepted (D-11).',
    condition: 'First free target; Effective Start = today - 7, End = today; Rate 40.00.',
    expected: 'The line is saved, listed as of its past start date and shown on the Rates tab today.',
    data: { rate: '40.00', effectiveStart: 'today-7', effectiveEnd: 'today' },
  }),
  // ---------- staging and saving ----------
  twoInOneSave: tc(23, {
    severity: 'critical',
    name: 'Two rates added one after the other are both kept',
    description: 'Verify a second rate added right after the first (another target, same day) is saved and the first one is kept (MF-4, MF-13).',
    condition: 'A rate for the first free target saved, then a rate for the next free target saved, both today.',
    expected: 'Both lines are shown on the Rates tab today.',
    data: rate({ rate: '111.00' }),
    second: rate({ rate: '222.00' }),
  }),
  notSavedUntilSave: tc(24, {
    type: 'Negative', severity: 'critical',
    name: 'A rate is not saved until Save',
    description: 'Verify a rate filled in the editor is not stored when the page is left without clicking Save (MF-13).',
    condition: 'Rate for the first free target filled in the editor; the rate card re-opened without Save.',
    expected: 'The rate is not on the Rates tab today.',
    data: rate({ rate: '99.00' }),
  }),
  cancelDiscards: tc(25, {
    type: 'Negative', severity: 'normal',
    name: 'Closing the editor discards the new rate',
    description: 'Verify closing the rate editor (X) - continuing without saving if warned - discards the rate entered (MF-14).',
    condition: 'Rate for the first free target filled in the editor; editor closed with X.',
    expected: 'The rate is not on the Rates tab today.',
    data: rate({ rate: '77.00' }),
  }),
  lineNumber: tc(26, {
    severity: 'minor',
    name: 'An added rate gets a Rate Card Line Number',
    description: 'Verify a saved rate is displayed with a whole-number Rate Card Line Number (MF-1).',
    condition: 'Rate for the first free target added and saved today.',
    expected: 'The line on the Rates tab shows a whole-number Line Number.',
    data: rate({ rate: '64.00' }),
  }),
  // ---------- AF-1 negative ----------
  negativeRate: tc(27, {
    type: 'Negative', severity: 'critical',
    name: 'Negative rate is rejected',
    description: 'Verify a Rate below zero is not saved: the editor reports it under Rate (or "Check the rate") (BR-21, AF-1, Scen-14).',
    condition: 'First free target; Rate -25.00 today.',
    expected: `"${SCENARIOS.negativeRate.message}" is shown; the entries are kept and nothing is saved.`,
    data: rate({ rate: '-25.00' }), scenario: 'negativeRate',
  }),
  endBeforeStart: tc(28, {
    type: 'Negative', severity: 'critical',
    name: 'End date before start date is rejected',
    description: 'Verify an Effective End Date earlier than the Effective Start Date raises "Check the dates" (BR-20, AF-1, Scen-13).',
    condition: 'First free target; start = today, end = yesterday.',
    expected: `"${SCENARIOS.endBeforeStart.message}" is shown and nothing is saved.`,
    data: { rate: '100.00', effectiveStart: 'today', effectiveEnd: 'today-1' }, scenario: 'endBeforeStart',
  }),
  overlap: tc(29, {
    type: 'Negative', severity: 'blocker',
    name: 'Overlapping rate for the same target is rejected',
    description: 'Verify a second rate with the same target, billing type and unit whose period overlaps an existing rate raises "Overlapping Rates" (BR-4, AF-1, Scen-6).',
    condition: 'Rate for the first free target saved for today; a second rate for the same target / billing type / unit for today.',
    expected: `"${SCENARIOS.duplicate.message}" is shown and the second rate is not saved.`,
    data: rate({ rate: '130.00' }),
    second: rate({ rate: '140.00' }),
  }),
  termInterval: tc(30, {
    type: 'Negative', severity: 'normal',
    name: 'Subscription term not divisible by the interval is rejected',
    description: 'Verify a Subscription rate whose term is not a multiple of its interval raises "Interval and Term do not align" (BR-13, AF-1, Scen-8). Skipped when no such combination is offered.',
    condition: 'Service Item, Subscription; e.g. Interval Quarterly with Term 4 Months.',
    expected: `"${SCENARIOS.termInterval.message}" is shown and nothing is saved.`,
    data: rate({ targetType: 'Service Item', rate: '300.00' }),
  }),
  missingTarget: tc(31, {
    type: 'Negative', severity: 'normal',
    name: 'A rate without a Target cannot be added',
    description: 'Verify the new rate cannot be confirmed without a Target (MF-4).',
    condition: 'Target Type Labor Grade, Target empty, Rate and dates entered.',
    expected: 'Save shows the required-field message, the editor stays open and nothing is saved.',
    data: rate({ targetType: 'Labor Grade', rate: '50.00' }),
  }),
  missingRate: tc(32, {
    type: 'Negative', severity: 'normal',
    name: 'A rate without a Rate value cannot be added',
    description: 'Verify the new rate cannot be confirmed with an empty Rate (MF-4).',
    condition: 'First free target and dates (today) entered; Rate empty.',
    expected: 'Save shows the required-field message, the editor stays open and nothing is saved.',
    data: rate({ rate: '' }),
  }),
  missingStart: tc(33, {
    type: 'Negative', severity: 'normal',
    name: 'A rate without an Effective Start Date cannot be added',
    description: 'Verify the new rate cannot be confirmed without an Effective Start Date (MF-4).',
    condition: 'First free target and Rate entered; Effective Start Date empty.',
    expected: 'Save shows the required-field message, the editor stays open and nothing is saved.',
    data: { rate: '50.00', effectiveStart: '', effectiveEnd: 'today' },
  }),
  textRate: tc(34, {
    type: 'Negative', severity: 'minor',
    name: 'Letters are not accepted as a Rate',
    description: 'Verify the Rate field accepts numbers only.',
    condition: 'First free target; "abc" typed into Rate.',
    expected: 'The Rate field stays empty (or a validation message is shown) and nothing is saved.',
    data: rate({ rate: 'abc' }),
  }),
};

module.exports = { MODULE, rateCardAddCases };
