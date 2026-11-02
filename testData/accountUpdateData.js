const { env } = require('../utils/testData');

/**
 * Use case 61959 - View and Update Account.
 * Every test first creates a Company (the Account owner) and an Account for it, then opens /Account/Edit/{id}.
 * Values carry keyword + run tag; new Account Numbers are unique per run ("9" + last 8 run-tag digits + n).
 * Seeded accounts get the Create form defaults: Account Status "Active", Time Zone "Eastern Standard Time",
 * Payment Term "DEFAULT" (the only Payment Term in the sandbox, so it cannot be changed to another value).
 */
const kw = env.keyword;               // "Playwright"
const tag = env.runTag;               // e.g. "1026-221500"
const digits = tag.replace(/\D/g, '');
const accountNumber = n => `9${digits.slice(-8)}${n}`;
const company = (name, extra = {}) => ({
  tradeName: `${kw} ${name} ${tag}`, legalName: `${kw} ${name} LLC`, entityType: 'LLC', roles: ['Client'], ...extra,
});
const billing = (recipient, address1, city, state, postalCode) => ({ type: 'Billing', recipientName: `${kw} ${recipient}`, address1, city, state, postalCode });

const MODULE = 'Account Update';

const MESSAGES = {
  numberInUse: 'This account number is already in use.',
  numberRequired: 'Account number is required.',
  deleted: 'Account deleted successfully.',
  restored: 'Account restored successfully.',
  useOwnerBilling: 'Are you sure you want this account to use the',
};

/** Five accounts: each one is viewed, updated, saved and re-opened to confirm the change persisted. */
const accountUpdateCases = [
  {
    id: 'TC_AEU_001', severity: 'critical',
    name: 'View & update ordinary fields (Account Name, Accounting Customer Key)',
    description: 'Verify ordinary Account fields can be changed and saved (MF-2, MF-11, QA-3, QA-27).',
    condition: 'User has PERM.ACCT.Account.View and PERM.ACCT.Account.Update; Account exists for a Company.',
    expected: '"Record saved successfully." is shown; after re-opening, the new Account Name and Accounting Customer Key are shown.',
    parent: company('Acct Upd Ordinary'),
    update: { accountName: `${kw} Renamed Account ${tag}`, accountingCustomerKey: `PW-CUST-${digits}` },
  },
  {
    id: 'TC_AEU_002', severity: 'critical',
    name: 'View & update Account Number to a new unique value',
    description: 'Verify the Account Number can be changed to a populated, unused value (MF-3, QA-5).',
    condition: 'User has PERM.ACCT.Account.ChangeAccountNumber; the new number is not used by any Account.',
    expected: '"Record saved successfully." is shown; after re-opening, the new Account Number is shown.',
    parent: company('Acct Upd Number'),
    update: { accountNumber: accountNumber(1) },
  },
  {
    id: 'TC_AEU_003', severity: 'critical',
    name: 'View & update Account Status (Active to On Hold)',
    description: 'Verify the Account Status can be changed to another available status (MF-4, QA-10).',
    condition: 'User has PERM.ACCT.Account.ChangeStatus; Account is Active.',
    expected: '"Record saved successfully." is shown; after re-opening, Account Status is "On Hold".',
    parent: company('Acct Upd Status'),
    update: { accountStatus: 'On Hold' },
  },
  {
    id: 'TC_AEU_004', severity: 'normal',
    name: 'View & update Time Zone and Billing Type',
    description: 'Verify the Time Zone (ordinary field) and the Default Billing Type (billing field) can be changed (MF-2, MF-5, QA-15).',
    condition: 'User has PERM.ACCT.Account.Update and PERM.ACCT.Account.ManageBillingSettings.',
    expected: '"Record saved successfully." is shown; after re-opening, Time Zone is "Pacific Standard Time" and Billing Type is "Fixed Fee".',
    parent: company('Acct Upd Billing Type'),
    update: { timeZone: 'Pacific Standard Time', billingType: 'Fixed Fee' },
  },
  {
    id: 'TC_AEU_005', severity: 'critical',
    name: 'View & update - replace the inherited billing address with an own address',
    description: 'Verify an Account that uses its owner\'s billing address can be given its own billing address (MF-5, QA-14, BillingAddressIDF).',
    condition: 'User has PERM.ACCT.Account.ManageBillingSettings; Company has a Billing address; Account uses it.',
    expected: '"Record saved successfully." is shown; after re-opening, "Use owner billing address" is off and the new (Austin) address is shown.',
    parent: company('Acct Upd Address', { address: billing('Owner Billing', '600 Congress Avenue', 'Austin', 'Texas', '78701') }),
    update: { billingAddress: billing('Account Billing', '1100 Congress Avenue', 'Austin', 'Texas', '78701') },
  },
];

const accountUpdateExtraCases = {
  view: {
    id: 'TC_AEU_006', severity: 'critical',
    name: 'View Account record - values, owner and hidden fields',
    description: 'Verify the Account opens with its saved values, shows its owner as read-only, offers no editable owner fields and does not display the active rate card (MF-1, QA-1, QA-22, QA-23, QA-24, BR-3, BR-8).',
    condition: 'User has PERM.ACCT.Account.View; Account exists for a Company with a Billing address.',
    expected: 'All saved values are shown; the owner Company is shown as a link; EntityIDF / EntityRecordID cannot be edited; no Rate Card field is displayed.',
    parent: company('Acct View', { address: billing('View Billing', '3 Riverwalk Plaza', 'San Antonio', 'Texas', '78205') }),
  },
  duplicateNumber: {
    id: 'TC_AEU_007', type: 'Negative', severity: 'critical',
    name: 'Save blocked for an Account Number used by another active Account',
    description: 'Verify an Account cannot be saved with the Account Number of another active Account (MF-3, AF-4, QA-7, BR-5).',
    condition: 'A second active Account exists; its Account Number is entered on this Account.',
    expected: `"${MESSAGES.numberInUse}" (or a duplicate-number validation) is shown, the save is blocked and the stored Account Number is unchanged.`,
    message: MESSAGES.numberInUse,
    parent: company('Acct Dup Number'),
    otherParent: company('Acct Number Holder'),
  },
  blankNumber: {
    id: 'TC_AEU_008', type: 'Negative', severity: 'critical',
    name: 'Save blocked when Account Number is blank',
    description: 'Verify an Account cannot be saved with an empty Account Number (BR-4, QA-9).',
    condition: 'Account Number cleared on the Edit page.',
    expected: `"${MESSAGES.numberRequired}" (or the required-field validation) is shown, the save is blocked and the stored Account Number is unchanged.`,
    message: MESSAGES.numberRequired,
    parent: company('Acct Blank Number'),
    update: { accountNumber: '' },
  },
  useOwnerBilling: {
    id: 'TC_AEU_009', severity: 'normal',
    name: 'Switch an own billing address back to the owner\'s billing address',
    description: 'Verify that turning "Use owner billing address" on for an Account with its own address asks for confirmation and, once confirmed, the owner\'s address is used (AF-14).',
    condition: 'Company has a Billing address; Account was created with its own billing address.',
    expected: `A confirmation is shown (use case text: "${MESSAGES.useOwnerBilling} <owner> billing address..."); after Continue and Save the Account uses the owner's (Houston) address.`,
    parent: company('Acct Owner Billing', { address: billing('Owner HQ', '901 Bagby Street', 'Houston', 'Texas', '77002') }),
    ownAddress: billing('Own Billing', '1500 Louisiana Street', 'Houston', 'Texas', '77002'),
    update: { useParentBilling: true },
  },
  unsaved: {
    id: 'TC_AEU_010', type: 'Negative', severity: 'normal',
    name: 'Unsaved changes warning - Cancel keeps edits, Continue discards them',
    description: 'Verify dirty-record tracking on the Account page: leaving with unsaved changes warns the user; Cancel stays, Continue Without Saving discards (MF-1, 62382).',
    condition: 'Account Name changed but not saved; user clicks a sidebar link twice.',
    expected: 'An "unsaved changes" warning is shown; after Cancel the edit is kept; after Continue the user leaves and the stored Account Name is unchanged.',
    parent: company('Acct Unsaved'),
    update: { accountName: `${kw} Unsaved Account ${tag}` },
  },
  audit: {
    id: 'TC_AEU_011', severity: 'normal',
    name: 'Audit tab records the Account change after save',
    description: 'Verify saving an Account change writes an audit entry visible on the Audit tab (MF-11, QA-27, 62382).',
    condition: 'Account Name changed and saved.',
    expected: 'The Audit tab lists the change, including the previous Account Name.',
    parent: company('Acct Audit'),
    update: { accountName: `${kw} Audited Account ${tag}` },
  },
  softDelete: {
    id: 'TC_AEU_012', severity: 'critical',
    name: 'Soft delete an Account without financial child records',
    description: 'Verify an Account with no Projects, Services or billing records can be soft deleted (MF-12, QA-28).',
    condition: 'User has PERM.ACCT.Account.DeleteSoft; Account has no blocking child records.',
    expected: `"${MESSAGES.deleted}" is shown and the Account is shown as deleted (Restore available).`,
    parent: company('Acct Delete'),
  },
  restore: {
    id: 'TC_AEU_013', severity: 'critical',
    name: 'Restore a soft-deleted Account - Account Number kept',
    description: 'Verify a soft-deleted Account can be restored and keeps its reserved Account Number (MF-13, QA-39, QA-41, BR-7).',
    condition: 'User has PERM.ACCT.Account.Restore; Account was soft deleted in this test.',
    expected: `"${MESSAGES.restored}" is shown; after re-opening, the Account is active again with the same Account Number and Name.`,
    parent: company('Acct Restore'),
  },
  deletedNumber: {
    id: 'TC_AEU_014', type: 'Negative', severity: 'normal',
    name: 'Save blocked for an Account Number used by a soft-deleted Account',
    description: 'Verify a soft-deleted Account keeps its Account Number reserved, so another Account cannot take it (AF-4, QA-8, BR-5).',
    condition: 'A second Account is soft deleted; its Account Number is entered on this Account.',
    expected: `"${MESSAGES.numberInUse}" (or a duplicate-number validation) is shown, the save is blocked and the stored Account Number is unchanged.`,
    message: MESSAGES.numberInUse,
    parent: company('Acct Reserved Number'),
    otherParent: company('Acct Deleted Holder'),
  },
};

module.exports = { MODULE, MESSAGES, accountUpdateCases, accountUpdateExtraCases };
