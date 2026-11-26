const { env } = require('../utils/testData');
const { BILLING, item, name } = require('./serviceItemData');

/**
 * Use case 62420 - View & Update Service Item. The sandbox calls a Service Item a "Deliverable Type": the record page is
 * /ServiceItem/Edit/{id} (opened after Save on Add Deliverable Type, 62419).
 *
 * View & Update in the sandbox (observed):
 *   header: name + status badge ("Active"), Signals button, Actions menu with only "Delete Deliverable Type"
 *           (confirmation "Are you sure you want to delete this deliverable type?" -> Delete / Go Back)
 *   tabs:   Details | Workflow Templates | Documents | Tasks | Audit
 *   Details: the 62419 fields (Name *, Description, Account Name, Accounting ID *, Taxable switch, Billing Type * with
 *           default radios + Clear Default, Typical Estimated Hours, Unit Of Measure *) and, while Subscription is ticked,
 *           "Turn on if labor is needed each billing period" (MaterializesServicePerSubscriptionPeriod); Save / Cancel
 *   Workflow Templates (63454): Compatible / Incompatible filter, "Result: n", search (name or description CONTAINS),
 *           one row per template: name link (/WorkflowTemplate/Edit/{id}), description, Compatible checkbox and Default
 *           radio - both saved at once by AJAX (no Save); removing the default asks for confirmation.
 *   NOT in the sandbox (reported as known defects): DefaultRate, isActive, the related Services panel
 *           (SERV.RecentServices.MaxCount / MaxAgeDays), a Template Details panel with the template steps.
 *
 * Every test first creates its own Deliverable Type ("Playwright VU <label> <MMDD-HHmmss>") and then views / updates it.
 * NO CLEANUP: the records stay in the sandbox (only TC_SIU_036 soft-deletes the record it created for that purpose).
 */
const MODULE = 'View & Update Service Item';

const kw = env.keyword;
const tag = env.runTag;
const digits = env.runTag.replace(/\D/g, '');
const seed = (label, over = {}) => item(`VU ${label}`, over);

const TEXT = {
  saved: /record saved successfully|(has|have) been (saved|updated)|(saved|updated) successfully/i,
  nameRequired: 'Deliverable Type Name is required',
  accountingIdRequired: 'Accounting ID is required',
  billingRequired: 'Select at least one Billing Type.',
  deleteConfirm: 'Are you sure you want to delete this deliverable type?',
  // SERV-3 as shown by the sandbox: "Cannot delete this Service Item because one or more Services reference it."
  deleteBlocked: /cannot delete this service item because one or more services reference it/i,
  removeDefaultTitle: /This Workflow Template is the default/i,
  noTemplateMatch: 'No workflow templates match your search.',
  defaultDisabledTip: 'This Workflow Template cannot be set as default because it is not compatible with the selected Service Item.',
  activeStatus: 'Active',
};

const TABS = ['Details', 'Workflow Templates', 'Documents', 'Tasks', 'Audit'];

const EDIT = 'User has SERV.ServiceItem.Edit; the Deliverable Type exists (created by the test first, 62419).';
const NEG = { type: 'Negative' };
const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });
const long = (prefix, length) => `${prefix}${'9'.repeat(Math.max(0, length - prefix.length))}`.slice(0, length);

const serviceItemUpdateCases = {
  // ------------------------------------------------------------------ MF-1 open
  load: tc('TC_SIU_001', 'critical', 'View & Update shows the saved values, tabs and commands',
    'Verify the detail page loads every editable field with the saved values, the Active status, the record tabs, the Signals button and the Actions menu (MF-1, T1).',
    EDIT, `All fields populated as saved; status Active; tabs ${TABS.join(', ')}; Signals button; Actions -> Delete Deliverable Type.`,
    { seed: seed('Load Check', { description: 'Seed for the View & Update load check', accountName: 'Load Revenue', isTaxable: true, allowedBillingTypes: [BILLING.hourly, BILLING.fixed], defaultBillingType: BILLING.fixed, unitOfMeasure: 'Day', typicalHours: '6' }) }),

  // ------------------------------------------------------------------ MF-4 save updated fields
  textFields: tc('TC_SIU_002', 'critical', 'Update Accounting ID, Account Name and Description',
    'Verify the text fields can be changed to valid values (Accounting ID within 100 characters) and the changes persist after re-opening (MF-4, T2 - the sandbox has no DefaultRate).',
    EDIT, 'Saved message; re-opened record shows the new values.',
    { seed: seed('Text Update'), update: { accountingId: `GL-5100-${digits}`, accountName: 'Professional Services Revenue', description: `${kw} updated description - quarterly review support` } }),
  unit: tc('TC_SIU_003', 'normal', 'Update Unit Of Measure',
    'Verify Unit Of Measure can be changed to another valid value and persists (T11).',
    EDIT, 'Saved; Unit Of Measure = Month after re-opening.',
    { seed: seed('Unit Update', { unitOfMeasure: 'Hour' }), update: { unitOfMeasure: 'Month' } }),
  taxableOn: tc('TC_SIU_004', 'normal', 'Turn Taxable on',
    'Verify isTaxable can be changed from Non-Taxable to Taxable and persists (T12).',
    EDIT, 'Saved; switch shows Taxable after re-opening.',
    { seed: seed('Taxable On', { isTaxable: false }), update: { isTaxable: true } }),
  taxableOff: tc('TC_SIU_005', 'normal', 'Turn Taxable off',
    'Verify isTaxable can be changed from Taxable to Non-Taxable and persists (T12).',
    EDIT, 'Saved; switch shows Non-Taxable after re-opening.',
    { seed: seed('Taxable Off', { isTaxable: true }), update: { isTaxable: false } }),
  hours: tc('TC_SIU_006', 'normal', 'Update Typical Estimated Hours',
    'Verify Typical Estimated Hours can be changed to a decimal value and persists (MF-4).',
    EDIT, 'Saved; Typical Estimated Hours = 37.75.',
    { seed: seed('Hours Update', { typicalHours: '8' }), update: { typicalHours: '37.75' } }),
  rename: tc('TC_SIU_007', 'critical', 'Rename the Deliverable Type to a unique name',
    'Verify the name can be changed to a new unique name without a duplicate warning, and the header shows it (MF-2 "no duplicate", MF-4).',
    EDIT, 'Saved without a warning; the new name is shown in the field and the page header.',
    { seed: seed('Rename Source'), update: { serviceItemName: name('VU Renamed Target') } }),

  // ------------------------------------------------------------------ allowed billing types
  billingAdd: tc('TC_SIU_008', 'critical', 'Allow more billing types and mark one as default',
    'Verify Time & Material only can be changed to Fixed Price, Time & Material and Subscription with Fixed Price as the default; exactly one default is saved (T4).',
    EDIT, 'Saved; three billing types allowed; Fixed Price is the only default.',
    { seed: seed('Billing Add', { allowedBillingTypes: [BILLING.hourly] }), update: { allowedBillingTypes: [BILLING.fixed, BILLING.hourly, BILLING.subscription], defaultBillingType: BILLING.fixed } }),
  billingRemove: tc('TC_SIU_009', 'normal', 'Remove an allowed billing type',
    'Verify an allowed billing type can be unticked and the remaining ones are kept (MF-4 synchronizes ServiceItemAllowedBillingType).',
    EDIT, 'Saved; Custom Bid removed, Fixed Price and Non-billable kept.',
    { seed: seed('Billing Remove', { allowedBillingTypes: [BILLING.customBid, BILLING.fixed, BILLING.nonBillable] }), update: { allowedBillingTypes: [BILLING.fixed, BILLING.nonBillable] } }),
  defaultChange: tc('TC_SIU_010', 'normal', 'Change the default billing type',
    'Verify the default can move from Subscription to Time & Material; only the new one is the default afterwards (BR 62419-1).',
    EDIT, 'Saved; Time & Material is the only default.',
    { seed: seed('Default Change', { allowedBillingTypes: [BILLING.hourly, BILLING.subscription], defaultBillingType: BILLING.subscription }), update: { defaultBillingType: BILLING.hourly } }),
  defaultClear: tc('TC_SIU_011', 'normal', 'Clear the default billing type',
    'Verify "Clear Default" removes the default and the record saves with no default (a default is optional).',
    EDIT, 'Saved; no default billing type.',
    { seed: seed('Default Clear', { allowedBillingTypes: [BILLING.fixed, BILLING.hourly], defaultBillingType: BILLING.fixed }), clearDefault: true, update: { defaultBillingType: '' } }),
  oneDefault: tc('TC_SIU_012', 'critical', 'Only one default billing type can be marked',
    'Verify marking Custom Bid and then Fixed Price as default leaves only Fixed Price selected, and that is what is saved (T14).',
    EDIT, 'Exactly one default radio is selected at any time; Fixed Price is saved as the default.',
    { seed: seed('One Default', { allowedBillingTypes: [BILLING.customBid, BILLING.fixed, BILLING.hourly] }), defaultsTried: [BILLING.customBid, BILLING.fixed], update: { defaultBillingType: BILLING.fixed } }),
  noBilling: tc('TC_SIU_013', 'critical', 'Removing every billing type is rejected',
    'Verify unticking every billing type blocks Save with the billing-type message (62419 BR-2: at least one allowed billing type) and the saved types are unchanged (T13).',
    EDIT, `"${TEXT.billingRequired}" shown; after re-opening the original billing types are still allowed.`,
    { ...NEG, seed: seed('No Billing Types', { allowedBillingTypes: [BILLING.hourly, BILLING.fixed] }), update: { allowedBillingTypes: [] }, field: 'billing', message: TEXT.billingRequired }),
  labor: tc('TC_SIU_014', 'normal', 'Subscription offers "labor needed each billing period", which is saved',
    'Verify the "Turn on if labor is needed each billing period" switch is hidden without Subscription, shows when Subscription is ticked, and its On value is saved.',
    EDIT, 'Switch hidden before; shown after ticking Subscription; saved On.',
    { seed: seed('Labor Period', { allowedBillingTypes: [BILLING.fixed] }), update: { allowedBillingTypes: [BILLING.fixed, BILLING.subscription] }, laborOn: true }),

  // ------------------------------------------------------------------ MF-2 duplicate name
  duplicate: tc('TC_SIU_015', 'critical', 'Renaming to an existing name shows the duplicate warning; the user may proceed',
    'Verify renaming to the exact name of another Deliverable Type shows the SERV-1 warning with a link to the other record, and proceeding saves the duplicate name (MF-2, T5).',
    `${EDIT} A second Deliverable Type exists (created by the test).`, 'Warning with a link to the other record; after proceeding the record is saved with the duplicate name.',
    { seed: seed('Dup Proceed'), other: seed('Dup Existing A'), variant: 'same' }),
  duplicateCase: tc('TC_SIU_016', 'critical', 'Duplicate-name check is case-insensitive',
    'Verify renaming to the other record\'s name in lower case still shows the SERV-1 warning (T22).',
    `${EDIT} A second Deliverable Type exists (created by the test).`, 'Warning shown for the lower-case variant; nothing saved until the user proceeds.',
    { seed: seed('Dup Case'), other: seed('Dup Existing B'), variant: 'lower' }),
  duplicateRevise: tc('TC_SIU_017', 'normal', 'After the duplicate warning the user can revise the name',
    'Verify the user can adjust the name after the warning and the record saves under the revised unique name (MF-2).',
    `${EDIT} A second Deliverable Type exists (created by the test).`, 'Saved under the revised name without a second warning.',
    { seed: seed('Dup Revise'), other: seed('Dup Existing C'), variant: 'upper', revisedName: name('VU Dup Revised') }),

  // ------------------------------------------------------------------ validation
  noName: tc('TC_SIU_018', 'critical', 'Clearing the name is rejected',
    'Verify Save with an empty Deliverable Type Name is blocked with the required message and the saved name is unchanged (MF-4 validation).',
    EDIT, `"${TEXT.nameRequired}" shown; re-opened record keeps its name.`,
    { ...NEG, seed: seed('Clear Name'), update: { serviceItemName: '' }, field: 'ServiceItemName', message: TEXT.nameRequired }),
  noAccountingId: tc('TC_SIU_019', 'critical', 'Clearing the Accounting ID is rejected',
    'Verify Save with an empty Accounting ID is blocked with the required message (MF-4 validation).',
    EDIT, `"${TEXT.accountingIdRequired}" shown; re-opened record keeps its Accounting ID.`,
    { ...NEG, seed: seed('Clear Accounting ID'), update: { accountingId: '' }, field: 'AccountingID', message: TEXT.accountingIdRequired }),
  accounting100: tc('TC_SIU_020', 'normal', 'Accounting ID of exactly 100 characters is saved',
    'Verify the boundary value - an Accounting ID of exactly 100 characters - saves and persists unchanged (T17).',
    EDIT, 'Saved; Accounting ID has 100 characters.',
    { seed: seed('Accounting 100'), update: { accountingId: long(`ACC-${digits}-`, 100) } }),
  accountingOver: tc('TC_SIU_021', 'normal', 'Accounting ID longer than 100 characters is not accepted',
    'Verify typing 120 characters into Accounting ID keeps only 100 (maxlength), so no over-long value can be saved (T18).',
    EDIT, 'Field keeps 100 characters; the saved value has 100 characters.',
    { ...NEG, seed: seed('Accounting Over'), typed: long(`OVR-${digits}-`, 120), limit: 100 }),
  noChanges: tc('TC_SIU_022', 'normal', 'Save without any changes',
    'Verify Save without modifying anything succeeds and every value stays the same (T23).',
    EDIT, 'Saved message; values unchanged.',
    { seed: seed('No Changes', { allowedBillingTypes: [BILLING.hourly, BILLING.subscription], defaultBillingType: BILLING.subscription, typicalHours: '3.5' }) }),

  // ------------------------------------------------------------------ CORE-1 unsaved changes
  dirtyStay: tc('TC_SIU_023', 'normal', 'Unsaved-changes warning - Cancel keeps the changes',
    'Verify leaving the page with unsaved changes shows the Dirty Record Warning and Cancel keeps the user on the page with the changes (T10).',
    `${EDIT} A field was changed but not saved.`, 'Warning shown; still on the record with the changed value.',
    { seed: seed('Dirty Stay'), update: { description: `${kw} unsaved description change` } }),
  dirtyLeave: tc('TC_SIU_024', 'normal', 'Unsaved-changes warning - Continue discards the changes',
    'Verify Continue without saving leaves the page and the change is discarded (T10).',
    `${EDIT} A field was changed but not saved.`, 'Page left; re-opened record shows the original value.',
    { seed: seed('Dirty Leave'), update: { accountName: 'Discarded Revenue Name' } }),
  cancel: tc('TC_SIU_025', 'normal', 'Cancel reloads the saved values',
    'Verify the Cancel button discards unsaved edits and shows the saved values again (62382).',
    `${EDIT} Fields were changed but not saved.`, 'Saved values shown again; nothing changed.',
    { seed: seed('Cancel Edit'), update: { accountName: 'Cancelled Revenue', unitOfMeasure: 'Year' } }),

  // ------------------------------------------------------------------ postconditions of a save
  recentlyViewed: tc('TC_SIU_026', 'normal', 'Updated Deliverable Type appears in Recently Viewed',
    'Verify CORE.RecentlyViewed lists the record after it was modified and saved (T16).',
    EDIT, 'Recently Viewed lists the updated name.',
    { seed: seed('Recent Source'), update: { serviceItemName: name('VU Recent Updated') } }),
  audit: tc('TC_SIU_027', 'normal', 'Audit tab records the old and new value',
    'Verify the Audit tab shows an entry for the update with the old and the new Accounting ID (MF-4 CORE.Audit Data Changes, T2).',
    EDIT, 'Audit lists the change of Accounting ID from the old to the new value.',
    { seed: seed('Audit Update'), update: { accountingId: `AUD-${digits}-NEW` } }),
  deliverable: tc('TC_SIU_028', 'critical', 'Updated name and billing types are used by Add Deliverable',
    'Verify the saved changes reach downstream use: Add Deliverable offers the new name with only the new allowed billing types and the new default (MF-4).',
    EDIT, 'Add Deliverable offers the renamed type; Billing Type lists Fixed Price and Custom Bid with Custom Bid selected.',
    { seed: seed('Downstream Source', { allowedBillingTypes: [BILLING.hourly] }), update: { serviceItemName: name('VU Downstream Renamed'), allowedBillingTypes: [BILLING.fixed, BILLING.customBid], defaultBillingType: BILLING.customBid } }),

  // ------------------------------------------------------------------ MF-6 compatible workflow templates (63454)
  wtFilter: tc('TC_SIU_029', 'normal', 'Workflow Templates: Compatible / Incompatible filter, search and result count',
    'Verify the panel lists compatible templates by default, the Incompatible filter lists the others, the search restricts rows to names or descriptions CONTAINING the text, the Result count follows, and a search with no match shows the empty message (MF-6).',
    EDIT, `Result count = visible rows; search narrows the list; "${TEXT.noTemplateMatch}" for no match.`,
    { seed: seed('WT Filter'), noMatch: `zz-${kw}-no-template-${digits}` }),
  wtCompatible: tc('TC_SIU_030', 'critical', 'Mark a workflow template as compatible',
    'Verify ticking Compatible on an incompatible template saves at once (ServiceItemCompatibleWorkflowTemplate row added) and persists after reload; no default is set by it (MF-1, BR-2, 63454).',
    EDIT, 'Template moves to the Compatible list, stays there after reload, and is not the default.',
    { seed: seed('WT Compatible') }),
  wtDefault: tc('TC_SIU_031', 'critical', 'Only one compatible workflow template is the default',
    'Verify with two compatible templates, choosing the first and then the second as default leaves only the second as default, also after reload (BR-3, 63454).',
    EDIT, 'Exactly one default; the second template is the default after reload.',
    { seed: seed('WT Default') }),
  wtRemoveDefault: tc('TC_SIU_032', 'normal', 'Removing the default template asks for confirmation',
    'Verify unticking Compatible on the default template asks "This Workflow Template is the default"; Cancel keeps it, Continue removes it and leaves no default (BR-4, 63454).',
    EDIT, 'Confirmation shown; Cancel keeps it compatible and default; Continue makes it incompatible with no default.',
    { seed: seed('WT Remove Default') }),
  wtReadOnly: tc('TC_SIU_033', 'normal', 'Incompatible templates cannot be default; template names link to the template',
    'Verify the Default radio of an incompatible template is disabled with the explanation tooltip, and every template name links to its detail page (/WorkflowTemplate/Edit/{id}) (MF-6, T21).',
    EDIT, 'Default disabled on incompatible rows; each name links to /WorkflowTemplate/Edit/{id}.',
    { seed: seed('WT Read Only') }),

  // ------------------------------------------------------------------ MF-6 other tabs
  tabs: tc('TC_SIU_034', 'normal', 'Documents, Tasks, Audit tabs and Signals load for the record',
    'Verify the Documents tab (Add New Document), Tasks tab, Audit tab (creation entries) and the Signals button for this record load (MF-6, T9).',
    EDIT, 'Each tab shows its content; Signals is wired to this record id.',
    { seed: seed('Tabs Check') }),

  // ------------------------------------------------------------------ MF-5 soft delete
  deleteGoBack: tc('TC_SIU_035', 'normal', 'Delete confirmation - Go Back keeps the record',
    'Verify Actions -> Delete Deliverable Type asks for confirmation and Go Back closes it without deleting (MF-5).',
    EDIT, `"${TEXT.deleteConfirm}" shown; after Go Back the record is still open and Active.`,
    { seed: seed('Delete Go Back') }),
  deleteAllowed: tc('TC_SIU_036', 'critical', 'Soft delete a Deliverable Type that no Deliverable uses',
    'Verify Delete on a Deliverable Type with no Deliverables is executed and the record is no longer offered in selection lists (Add Deliverable) (MF-5, T7, T20). Only this test removes a record, and only the one it created for it.',
    `${EDIT} No Deliverable references it.`, 'Record deleted (page left the record) and not offered by Add Deliverable any more.',
    { seed: seed('Delete Allowed') }),
  deleteBlocked: tc('TC_SIU_037', 'critical', 'Delete is blocked while a Deliverable uses the Deliverable Type',
    'Verify Delete on a Deliverable Type referenced by a Deliverable is refused with the SERV-3 message and the record stays visible and editable (AF-SoftDeleteBlocked, T8).',
    `${EDIT} A Deliverable (created by the test on account "${process.env.SERVICE_ACCOUNT_NAME || 'Test case factory'}") uses it.`,
    'Delete refused with a message; the record is still open, Active and offered by Add Deliverable.',
    { ...NEG, seed: seed('Delete Blocked', { allowedBillingTypes: [BILLING.fixed] }), deliverableName: `${kw} VU Delete Blocked Deliverable ${tag}`, stage: 'Planning' }),

  // ------------------------------------------------------------------ gaps of the sandbox (known defects)
  specFields: tc('TC_SIU_038', 'normal', 'DefaultRate and isActive can be maintained on View & Update',
    'Verify the use-case fields DefaultRate (T2, T3) and isActive (MF-3, T6, T19, SERV-2 deactivation warning) are offered on the record.',
    EDIT, 'Default Rate and Is Active controls are shown.',
    { seed: seed('Spec Fields'), defect: 'The sandbox View & Update Deliverable Type page has no DefaultRate and no isActive control (use case 62420 MF-1, MF-3); the item cannot be deactivated (SERV-2).' }),
  servicesPanel: tc('TC_SIU_039', 'normal', 'Related Services panel lists the recently ordered Deliverables',
    'Verify a related Services panel / tab is shown for the record (MF-6, T1, T24 SERV.RecentServices.MaxAgeDays, T25 MaxCount).',
    EDIT, 'A Services (Deliverables) panel or tab is shown.',
    { seed: seed('Services Panel'), defect: 'The sandbox View & Update Deliverable Type page has no related Services panel (use case 62420 MF-1 / MF-6, T24, T25); tabs are Details, Workflow Templates, Documents, Tasks, Audit.' }),
};

module.exports = { MODULE, TEXT, TABS, serviceItemUpdateCases };
