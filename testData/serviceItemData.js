const { env } = require('../utils/testData');

/**
 * Use case 62419 - SERV.Create Service Item. The sandbox UI calls a Service Item a "Deliverable Type":
 * Add New (+) -> Deliverable Type = /ServiceItem/Create ("Add Deliverable Type"); a saved one opens /ServiceItem/Edit/{id}
 * (62420 View & Update Service Item).
 *
 * Add form in the sandbox (observed):
 *   Deliverable Type Name * (#ServiceItemName, maxlength 80)   Description (#Description, 250)
 *   Account Name (#AccountName, 100)                             Accounting ID * (#AccountingID, 100)
 *   Taxable / Non-Taxable switch (#IsTaxable, off)               Unit Of Measure * (#UnitOfMeasureIDF: Each, Hour, Month, Day, Year)
 *   Typical Estimated Hours (#TypicalEstimatedHours, number)      Save / Cancel
 *   Billing Type * - one checkbox per type (AllowedBillingTypeIds) + one "default" radio per type (DefaultBillingTypeId,
 *   a single radio group) and a "Clear Default" link.
 *
 * The use case's billing types map to the sandbox's: Hourly = "Time & Material", Fixed = "Fixed Price",
 * Subscription = "Subscription" (the sandbox also offers "Custom Bid" and "Non-billable").
 * Not on the sandbox Add form (TC_SI_029 reports it): DefaultRate, isActive, WorkItemTemplateIDF (Workflow Templates
 * are a tab of the saved record instead).
 *
 * Every name carries the keyword (TEST_KEYWORD, "Playwright") and the run tag, so the records are easy to find and every
 * run is unique. NO CLEANUP: the Deliverable Types stay in the sandbox and are listed in the dated workbook.
 *
 * Optional environment:
 *   SI_NO_PERMISSION_EMAIL / SI_NO_PERMISSION_PASSWORD   a user WITHOUT SERV.ServiceItem.Create (TC_SI_030; skipped if unset)
 */
const MODULE = 'Create Service Item';

const kw = env.keyword;
const tag = env.runTag;                                     // MMDD-HHmmss
const digits = env.runTag.replace(/\D/g, '');               // MMDDHHmmss
const name = label => `${kw} ${label} ${tag}`;               // e.g. "Playwright Managed Services 1124-153012"
const acc = n => `ACC-${n}-${digits}`;                       // unique Accounting ID per run

const BILLING = {
  customBid: 'Custom Bid',
  fixed: 'Fixed Price',
  nonBillable: 'Non-billable',
  subscription: 'Subscription',
  hourly: 'Time & Material',
};
const ALL_BILLING = [BILLING.customBid, BILLING.fixed, BILLING.nonBillable, BILLING.subscription, BILLING.hourly];
const UNITS = ['Each', 'Hour', 'Month', 'Day', 'Year'];

const TEXT = {
  heading: 'Add Deliverable Type',
  nameRequired: 'Deliverable Type Name is required',
  accountingIdRequired: 'Accounting ID is required',
  unitRequired: 'Unit Of Measure is required',
  billingRequired: 'Select at least one Billing Type.',
  added: 'Your new record has been added.',
  activeStatus: 'Active',
};

const LIMITS = { serviceItemName: 80, description: 250, accountName: 100, accountingId: 100 };

const CREATE = 'User is signed in and has SERV.ServiceItem.Create; ServiceItem metadata loads.';
const NEG = { type: 'Negative' };
const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });

/** A complete, valid form. `over` replaces single fields. */
const item = (label, over = {}) => ({
  serviceItemName: name(label),
  description: `${kw} ${label} - automated test record`,
  accountName: `${label} Revenue`,
  accountingId: acc(label.replace(/\W/g, '').slice(0, 6).toUpperCase()),
  isTaxable: false,
  allowedBillingTypes: [BILLING.hourly],
  defaultBillingType: '',
  unitOfMeasure: 'Hour',
  typicalHours: '',
  ...over,
});

const serviceItemCases = {
  // ------------------------------------------------------------------ MF-1 open the page / dirty tracking
  open: tc('TC_SI_001', 'critical', 'Open Add Deliverable Type shows every field in Add Mode',
    'Verify the Create Service Item page opens in Add Mode with Name, Description, Account Name, Accounting ID, Taxable, the Allowed Billing Types multi-select (with default radios), Unit Of Measure, Typical Estimated Hours, Save and Cancel; nothing is pre-filled (MF-1, use-case TC 1).',
    CREATE, 'Heading "Add Deliverable Type"; all fields empty; no billing type ticked or default; Non-Taxable; Unit Of Measure offers Each, Hour, Month, Day, Year.'),
  dirtyStay: tc('TC_SI_002', 'normal', 'Unsaved-changes warning keeps the user on the dirty Add form',
    'Verify dirty-record tracking is initialized: leaving the form after typing shows the unsaved-changes warning and "Cancel" keeps the entered values (MF-1.4, 62382).',
    `${CREATE} A name has been typed but not saved.`, 'Warning shown; user stays on Add Deliverable Type and the typed name is kept.',
    { data: { serviceItemName: name('Dirty Stay') } }),
  dirtyLeave: tc('TC_SI_003', 'normal', 'Continue without saving leaves the form and creates nothing',
    'Verify answering the unsaved-changes warning with "Continue without saving" leaves the page and no Deliverable Type is saved (MF-1.4, 62382).',
    `${CREATE} A name has been typed but not saved.`, 'Page is left (Recently Viewed); the name is not saved.',
    { data: { serviceItemName: name('Dirty Leave') } }),

  // ------------------------------------------------------------------ MF-2 .. MF-7 successful creation
  created: [
    tc('TC_SI_004', 'critical', 'Create with valid minimum data and one billing type (Hourly)',
      'Verify a Deliverable Type with the use case\'s minimum data and a single allowed billing type saves, shows "Your new record has been added." and opens View & Update (62420) with the saved values, Active status and the record tabs (MF-5 to MF-7, use-case TC 4).',
      CREATE, 'Saved; /ServiceItem/Edit/{id} opens Active with every entered value, Time & Material ticked, and the Details / Workflow Templates / Documents / Tasks / Audit tabs.',
      { data: item('Standard Support', { description: 'Basic support service', accountName: 'Support Revenue', accountingId: acc('1001'), unitOfMeasure: 'Hour' }), checkTabs: true }),
    tc('TC_SI_005', 'critical', 'Create with multiple billing types and one default',
      'Verify Hourly + Subscription can be allowed with Subscription marked as the default; both are saved and exactly one is the default (MF-3, BR-1, use-case TC 5).',
      CREATE, 'Saved with Time & Material and Subscription allowed; only Subscription is the default.',
      { data: item('Managed Services', { description: 'Recurring managed services', accountName: 'Managed Revenue', accountingId: acc('2001'), isTaxable: true, allowedBillingTypes: [BILLING.hourly, BILLING.subscription], defaultBillingType: BILLING.subscription, unitOfMeasure: 'Hour', typicalHours: '40' }) }),
    tc('TC_SI_006', 'critical', 'Create with multiple billing types and no default',
      'Verify Fixed + Hourly can be saved without marking a default, because a default is optional (MF-3, BR-1, use-case TC 6).',
      CREATE, 'Saved with Fixed Price and Time & Material allowed and no default.',
      { data: item('Advisory Package', { description: 'Advisory services', accountName: 'Advisory Revenue', accountingId: acc('3001'), isTaxable: true, allowedBillingTypes: [BILLING.fixed, BILLING.hourly], unitOfMeasure: 'Each' }) }),
    tc('TC_SI_007', 'normal', 'Create with every billing type allowed and Custom Bid as default',
      'Verify any combination of billing types can be allowed - all five offered types - with one of them as the default (MF-3).',
      CREATE, 'Saved with all five billing types allowed; Custom Bid is the default.',
      { data: item('Enterprise Bundle', { description: 'Enterprise implementation offering every billing model', accountName: 'Enterprise Revenue', allowedBillingTypes: ALL_BILLING, defaultBillingType: BILLING.customBid, unitOfMeasure: 'Day', typicalHours: '160' }) }),
    tc('TC_SI_008', 'critical', 'Single selected billing type (Subscription) becomes the default',
      'Verify that when only Subscription is allowed it is the item\'s default: it is saved, and Add Deliverable defaults the Billing Type to it (MF-3.2, use-case TC 9).',
      CREATE, 'Saved with only Subscription; Add Deliverable offers only Subscription and selects it.',
      { data: item('Cloud Hosting', { description: 'Monthly cloud hosting subscription', accountName: 'Hosting Revenue', allowedBillingTypes: [BILLING.subscription], unitOfMeasure: 'Month' }), checkDeliverable: true }),
    tc('TC_SI_009', 'normal', 'Taxable switch is saved as Taxable',
      'Verify turning the Taxable switch on saves isTaxable = Yes (MF-2, MF-6).',
      CREATE, 'Saved; the switch shows Taxable on the saved record.',
      { data: item('Taxable Training', { description: 'Instructor-led training day', accountName: 'Training Revenue', isTaxable: true, allowedBillingTypes: [BILLING.fixed], unitOfMeasure: 'Day', typicalHours: '8' }) }),
    tc('TC_SI_010', 'normal', 'Positive decimal Typical Estimated Hours is saved',
      'Verify a positive decimal value (99.99) is accepted in the numeric field and saved unchanged (MF-2 data-type validation, use-case TC 11 adapted - the sandbox has no DefaultRate).',
      CREATE, 'Saved; Typical Estimated Hours = 99.99.',
      { data: item('Data Migration', { description: 'One-off data migration', accountName: 'Migration Revenue', allowedBillingTypes: [BILLING.hourly], unitOfMeasure: 'Hour', typicalHours: '99.99' }) }),
    tc('TC_SI_011', 'normal', 'Zero Typical Estimated Hours is accepted',
      'Verify 0 is accepted in the numeric field (greater than or equal to 0) and the record saves (use-case TC 10 adapted - the sandbox has no DefaultRate).',
      CREATE, 'Saved; Typical Estimated Hours = 0.',
      { data: item('Zero Hour License', { description: 'License with no labor', accountName: 'License Revenue', allowedBillingTypes: [BILLING.fixed], unitOfMeasure: 'Year', typicalHours: '0' }) }),
    tc('TC_SI_012', 'normal', 'Special characters in the text fields are saved as entered',
      'Verify Description, Account Name and Accounting ID accept punctuation and symbols (& / - ( ) . #) and the record shows them unchanged (MF-2).',
      CREATE, 'Saved; every text field shows exactly the entered value.',
      { data: item('R&D Consulting', { description: 'R&D / Ops consulting - phase #2 (EU & US), 50% on-site.', accountName: 'R&D Revenue - Consulting (EU)', accountingId: `GL-4000/${digits}.R&D`, allowedBillingTypes: [BILLING.hourly, BILLING.nonBillable], defaultBillingType: BILLING.hourly, unitOfMeasure: 'Hour', typicalHours: '12.5' }) }),
  ],

  // ------------------------------------------------------------------ MF-4 duplicate name (soft warning)
  duplicateWarning: tc('TC_SI_013', 'critical', 'Duplicate name (different case) shows a soft warning with a link',
    'Verify Save with the name of an existing Deliverable Type in different case shows a warning that another Service Item has this name, with a hyperlink to that record; nothing is saved yet (MF-4, use-case TC 13 / 14 / 15).',
    `${CREATE} A Deliverable Type with the same name (other case) exists - created by the test first.`,
    'Warning shown with a link to /ServiceItem/Edit/{existing id}; the form stays open (soft warning, not a blocking error).',
    { original: item('Premium Support DupWarn', { accountName: 'Premium Revenue' }), caseVariant: 'lower' }),
  duplicateProceed: tc('TC_SI_014', 'critical', 'User may proceed after the duplicate-name warning',
    'Verify duplicate names are allowed: after the warning the user proceeds and a second Deliverable Type with the same name (upper case) is created (BR-5, MF-4.2, use-case TC 13).',
    `${CREATE} A Deliverable Type with the same name exists - created by the test first.`,
    'Second record created with its own id; both records exist.',
    { original: item('Premium Support DupProceed', { accountName: 'Premium Revenue' }), caseVariant: 'upper' }),
  duplicateRevise: tc('TC_SI_015', 'normal', 'User may revise the name after the duplicate-name warning',
    'Verify the user can change the name after the warning and the record saves under the revised name without another warning (MF-4.2).',
    `${CREATE} A Deliverable Type with the same name exists - created by the test first.`,
    'Record saved with the revised name; no second warning.',
    { original: item('Premium Support DupRevise', { accountName: 'Premium Revenue' }), caseVariant: 'lower', revisedName: name('Premium Support Revised') }),

  // ------------------------------------------------------------------ MF-5 validation (nothing is saved)
  emptyForm: tc('TC_SI_016', 'critical', 'Save with an empty form shows every required message',
    'Verify Save with nothing entered shows the Name, Accounting ID, Unit Of Measure and Billing Type messages and nothing is saved (MF-5.1).',
    CREATE, `"${TEXT.nameRequired}", "${TEXT.accountingIdRequired}", "${TEXT.unitRequired}", "${TEXT.billingRequired}"; still on Add Deliverable Type.`, NEG),
  noBilling: tc('TC_SI_017', 'critical', 'At least one allowed billing type is required',
    'Verify Save with every other field valid but no billing type ticked is blocked with the billing-type message; no Service Item or child rows are inserted (BR-2, use-case TC 7).',
    CREATE, `"${TEXT.billingRequired}" is shown; nothing is saved.`,
    { ...NEG, data: item('No Billing', { allowedBillingTypes: [] }), field: 'billing', message: TEXT.billingRequired }),
  noName: tc('TC_SI_018', 'critical', 'Deliverable Type Name is required',
    'Verify Save without a name is blocked with the required message (MF-5.1).',
    CREATE, `"${TEXT.nameRequired}" is shown; nothing is saved.`,
    { ...NEG, data: item('No Name', { serviceItemName: '' }), field: 'ServiceItemName', message: TEXT.nameRequired }),
  noAccountingId: tc('TC_SI_019', 'critical', 'Accounting ID is required',
    'Verify Save without an Accounting ID is blocked with the required message (MF-5.1).',
    CREATE, `"${TEXT.accountingIdRequired}" is shown; nothing is saved.`,
    { ...NEG, data: item('No Accounting ID', { accountingId: '' }), field: 'AccountingID', message: TEXT.accountingIdRequired }),
  noUnit: tc('TC_SI_020', 'critical', 'Unit Of Measure is required',
    'Verify Save without a Unit Of Measure is blocked with the required message (MF-5.1).',
    CREATE, `"${TEXT.unitRequired}" is shown; nothing is saved.`,
    { ...NEG, data: item('No Unit', { unitOfMeasure: '' }), field: 'UnitOfMeasureIDF', message: TEXT.unitRequired }),
  blankName: tc('TC_SI_031', 'normal', 'A name of only spaces is rejected',
    'Verify a Deliverable Type Name made only of spaces is treated as missing and nothing is saved (MF-5.1).',
    CREATE, 'The name is rejected (validation message, or the form returned with the name cleared); nothing is saved.',
    { ...NEG, data: item('Blank Name', { serviceItemName: '     ' }), field: 'ServiceItemName' }),

  // ------------------------------------------------------------------ BR-1 default handling
  oneDefault: tc('TC_SI_021', 'critical', 'Only one billing type can be the default',
    'Verify with Fixed, Hourly and Subscription allowed, marking Fixed and then Hourly as default leaves only Hourly as the default, and that is what is saved (BR-1, use-case TC 8).',
    CREATE, 'Only one default radio is ever selected; saved with Time & Material as the single default.',
    { data: item('Hybrid Delivery', { description: 'Hybrid delivery with three billing models', accountName: 'Hybrid Revenue', allowedBillingTypes: [BILLING.fixed, BILLING.hourly, BILLING.subscription], defaultBillingType: BILLING.hourly, unitOfMeasure: 'Hour' }), defaultsTried: [BILLING.fixed, BILLING.hourly] }),
  clearDefault: tc('TC_SI_022', 'normal', 'Clear Default removes the default before saving',
    'Verify "Clear Default" unselects the marked default, and the record saves with its billing types and no default (MF-3.2, BR-1).',
    CREATE, 'No default radio selected after Clear Default; saved with no default.',
    { data: item('Flexible Retainer', { description: 'Retainer without a default billing type', accountName: 'Retainer Revenue', allowedBillingTypes: [BILLING.fixed, BILLING.subscription], unitOfMeasure: 'Month' }), defaultBeforeClear: BILLING.subscription }),

  // ------------------------------------------------------------------ MF-2 local validation by data type / length
  lengths: tc('TC_SI_023', 'normal', 'Text fields stop at their maximum length',
    `Verify the text fields do not accept more than their maximum length: Name ${LIMITS.serviceItemName}, Description ${LIMITS.description}, Account Name ${LIMITS.accountName}, Accounting ID ${LIMITS.accountingId} characters (MF-2.1). Nothing is saved.`,
    CREATE, 'Each field keeps only its maximum number of characters.', { ...NEG, overflow: 20 }),
  hoursNumeric: tc('TC_SI_024', 'normal', 'Typical Estimated Hours accepts numbers only',
    'Verify the numeric field ignores letters and the exponent "e" while typing, so only the digits remain (MF-2.1). Nothing is saved.',
    CREATE, 'Typing "1e2abc5" leaves "125".', { ...NEG, typed: '1e2abc5', expectedValue: '125' }),
  cancel: tc('TC_SI_025', 'normal', 'Cancel discards the entered values',
    'Verify Cancel (no unsaved-changes prompt) reloads an empty Add form and nothing is saved (62382).',
    `${CREATE} Values entered but not saved.`, 'Empty Add Deliverable Type form; name not saved.',
    { data: item('Cancelled Entry', { allowedBillingTypes: [BILLING.fixed] }) }),

  // ------------------------------------------------------------------ postconditions
  recentlyViewed: tc('TC_SI_026', 'normal', 'New Deliverable Type appears in Recently Viewed',
    'Verify the newly created record is listed in Recently Viewed (Postcondition 3, MF-6.4).',
    CREATE, 'Recently Viewed lists the new name.',
    { data: item('Recently Viewed Check', { allowedBillingTypes: [BILLING.hourly], unitOfMeasure: 'Hour' }) }),
  audit: tc('TC_SI_027', 'normal', 'Audit tab records the created values',
    'Verify the saved record\'s Audit tab has entries for the created values (Postcondition 2, MF-6.3).',
    CREATE, 'Audit tab lists the creation with the entered name.',
    { data: item('Audit Trail Check', { accountName: 'Audit Revenue', allowedBillingTypes: [BILLING.fixed], unitOfMeasure: 'Each' }) }),
  usableOnDeliverable: tc('TC_SI_028', 'critical', 'New Deliverable Type is offered on Add Deliverable with its billing rules',
    'Verify the saved allowed billing types (ServiceItemAllowedBillingType rows) drive Add Deliverable: the new type is offered, only its allowed billing types are listed, its default is selected and its Typical Estimated Hours are applied (MF-6.2).',
    CREATE, 'Add Deliverable offers the new type; Billing Type lists only Time & Material and Subscription with Subscription selected; Estimated Hours = 24.',
    { data: item('Integration Ready', { description: 'Used by Add Deliverable', accountName: 'Integration Revenue', allowedBillingTypes: [BILLING.hourly, BILLING.subscription], defaultBillingType: BILLING.subscription, unitOfMeasure: 'Hour', typicalHours: '24' }) }),

  // ------------------------------------------------------------------ gaps / permissions
  specFields: tc('TC_SI_029', 'normal', 'Use-case fields DefaultRate, isActive and Workflow Template are on the Add form',
    'Verify the Add form shows the remaining MF-1 fields of the use case: DefaultRate (BR-3, use-case TC 10 - 12), isActive and WorkItemTemplateIDF.',
    CREATE, 'Default Rate, Is Active and Workflow Template controls are shown on Add Deliverable Type.',
    { defect: 'The sandbox Add Deliverable Type form has no DefaultRate, isActive or Workflow Template field (use case 62419 MF-1.2); Workflow Templates are only a tab of the saved record.' }),
  noPermission: tc('TC_SI_030', 'critical', 'User without SERV.ServiceItem.Create cannot open the Add form',
    'Verify a signed-in user without the Create permission is denied the Create Service Item page and no add form is shown (Precondition 2, use-case TC 2).',
    'Second user WITHOUT SERV.ServiceItem.Create (SI_NO_PERMISSION_EMAIL / SI_NO_PERMISSION_PASSWORD in .env).',
    'Access denied; the Add Deliverable Type form is not displayed.',
    { ...NEG, user: { email: process.env.SI_NO_PERMISSION_EMAIL || '', password: process.env.SI_NO_PERMISSION_PASSWORD || '' } }),
};

module.exports = { MODULE, TEXT, BILLING, ALL_BILLING, UNITS, LIMITS, serviceItemCases, item, name };
