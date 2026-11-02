const { env } = require('../utils/testData');

/**
 * Use case 61957 - Create Account (from an existing Person or Company).
 * Every test first creates the parent it works on; names carry keyword + run tag.
 * `parentType` is 'Company' or 'Person'; `parent` is the Company/Person data used to create it.
 */
const kw = env.keyword;               // "Playwright"
const tag = env.runTag;               // e.g. "1026-101500"
const digits = tag.replace(/\D/g, '');
const company = (name, extra = {}) => ({
  tradeName: `${kw} ${name} ${tag}`, legalName: `${kw} ${name} LLC`, entityType: 'LLC', roles: ['Client'], ...extra,
});

const MODULE = 'Account';
// Account Status is required by the form but not covered by 61957; tests choose "Active" when it is unset.

const accountCases = {
  fromCompany: {
    id: 'TC_ACC_001', severity: 'critical',
    name: 'Create Account from a Company with default values',
    description: 'Verify an Account can be created from a Company using the prepared defaults, opens after save and is listed on the Company\'s Accounts tab (MF-1, MF-3, MF-6, BR-3).',
    condition: 'User has PERM.ACCT.Account.Create; Company is active and has no Account.',
    expected: 'Account Number is pre-filled; Account Name = "<Company Display Name>-<Account Number>"; the account saves, opens, and is listed on the Company\'s Accounts tab.',
    parentType: 'Company',
    parent: company('Account Alpha', { phone: { number: '6025550118', type: 'Landline' } }),
  },
  fromPerson: {
    id: 'TC_ACC_002', severity: 'critical',
    name: 'Create Account from a Person with default values',
    description: 'Verify an Account can be created from a Person; Account Name defaults to the Person\'s Display Name plus Account Number (MF-1, MF-3, MF-6).',
    condition: 'User has PERM.ACCT.Account.Create; Person is active and has no Account.',
    expected: 'Account Name = "Nora Fleming-<Account Number>"; the account saves, opens, and is listed on the Person\'s Accounts tab.',
    parentType: 'Person',
    parent: {
      firstName: 'Nora', middleName: kw, lastName: 'Fleming', handle: `${kw.toLowerCase()}_nora_${digits}`,
      email: `${kw.toLowerCase()}.nora.fleming.${digits}@example.com`,
    },
  },
  inheritedBilling: {
    id: 'TC_ACC_003', severity: 'critical',
    name: 'Inherited billing address is shown and kept',
    description: 'Verify the parent Company\'s billing address is displayed as inherited on the new Account and is used when not overridden (MF-3 step 5, BR-6).',
    condition: 'Company has a Billing address; user does not change it.',
    expected: 'The Company\'s billing street is shown on the Create Account form; after save the account still shows that address.',
    parentType: 'Company',
    parent: company('Account Inherit', {
      address: { type: 'Billing', recipientName: `${kw} Inherit Accounts`, address1: '1 East Washington Street', city: 'Phoenix', state: 'Arizona', postalCode: '85004' },
    }),
  },
  overrideBilling: {
    id: 'TC_ACC_004', severity: 'normal',
    name: 'Override the inherited billing address with an Account-specific address',
    description: 'Verify entering a new billing address on the Create Account form replaces the inherited one for the new Account (MF-5, MF-6 step 2).',
    condition: 'Company has a Billing address; user adds a different Billing address on the Account.',
    expected: 'After save the account shows the new (Tucson) billing address.',
    parentType: 'Company',
    parent: company('Account Override', {
      address: { type: 'Billing', recipientName: `${kw} Override HQ`, address1: '2 North Central Avenue', city: 'Phoenix', state: 'Arizona', postalCode: '85004' },
    }),
    billingAddress: { type: 'Billing', recipientName: `${kw} Override Billing`, address1: '255 West Alameda Street', city: 'Tucson', state: 'Arizona', postalCode: '85701' },
  },
  customName: {
    id: 'TC_ACC_005', severity: 'normal',
    name: 'Create Account with an edited Account Name',
    description: 'Verify the user can change the default Account Name before saving (MF-4).',
    condition: 'User has PERM.ACCT.Account.Create; Account Name edited on the form.',
    expected: 'The account saves with the user-entered Account Name.',
    parentType: 'Company',
    parent: company('Account Rename'),
    accountName: `${kw} Custom Account ${tag}`,
  },
  noParentBilling: {
    id: 'TC_ACC_006', severity: 'normal',
    name: 'Parent without billing address - no inherited address, entry optional',
    description: 'Verify that when the parent has no billing address no inherited address is shown, "Use parent billing address" cannot be turned on, an address can optionally be entered, and the account saves without one (AF-6).',
    condition: 'Company has no address.',
    expected: 'No inherited address; the switch is off and turning it on shows "The account owner does not yet have a billing address..."; the address edit control is available; the account saves without an address.',
    parentType: 'Company',
    parent: company('Account No Billing'),
  },
  advisory: {
    id: 'TC_ACC_007', severity: 'critical',
    name: 'Existing Account Advisory shown and a second Account can still be created',
    description: 'Verify that starting Account creation for a parent that already has an Account shows the advisory on the Accounts tab and still allows a second Account with a different number (MF-2, BR-1, BR-4).',
    condition: 'Company already has one Account.',
    expected: '"Please ensure that the account does not already exist." is shown; continuing creates a second Account with a different Account Number; the Accounts tab lists both.',
    message: 'Please ensure that the account does not already exist.',
    parentType: 'Company',
    parent: company('Account Advisory'),
  },
  numberIncrements: {
    id: 'TC_ACC_008', severity: 'normal',
    name: 'Account Number comes from NextAccountNumber and increments',
    description: 'Verify each new Account form gets a new numeric Account Number, higher than the previous one (MF-3 step 1, BR-4, BR-5).',
    condition: 'The Create Account form is opened twice for the same Company (nothing saved).',
    expected: 'Both Account Numbers are numeric and the second is greater than the first.',
    parentType: 'Company',
    parent: company('Account Numbering'),
  },
  nameRequired: {
    id: 'TC_ACC_009', type: 'Negative', severity: 'critical',
    name: 'Save blocked when Account Name is empty',
    description: 'Verify an Account cannot be saved without an Account Name (MF-6 validation).',
    condition: 'Create Account form open; Account Name cleared.',
    expected: 'A validation error is shown and no Account is created.',
    parentType: 'Company',
    parent: company('Account No Name'),
    clear: 'accountName',
  },
  numberRequired: {
    id: 'TC_ACC_010', type: 'Negative', severity: 'critical',
    name: 'Save blocked when Account Number is empty',
    description: 'Verify an Account cannot be saved without an Account Number (MF-6 validation).',
    condition: 'Create Account form open; Account Number cleared.',
    expected: 'A validation error is shown and no Account is created.',
    parentType: 'Company',
    parent: company('Account No Number'),
    clear: 'accountNumber',
  },
  paymentTermRequired: {
    id: 'TC_ACC_011', type: 'Negative', severity: 'normal',
    name: 'Save blocked when Payment Term is not assigned',
    description: 'Verify an Account cannot be saved without a Payment Term (MF-6 validation).',
    condition: 'Create Account form open; Payment Term set to its empty option.',
    expected: 'A validation error is shown and no Account is created.',
    parentType: 'Company',
    parent: company('Account No Terms'),
    clear: 'paymentTerm',
  },
  timeZoneRequired: {
    id: 'TC_ACC_012', type: 'Negative', severity: 'normal',
    name: 'Save blocked when Time Zone is not assigned',
    description: 'Verify an Account cannot be saved without a Time Zone (MF-6 validation).',
    condition: 'Create Account form open; Time Zone set to its empty option.',
    expected: 'A validation error is shown and no Account is created.',
    parentType: 'Company',
    parent: company('Account No Zone'),
    clear: 'timeZone',
  },
  duplicateNumber: {
    id: 'TC_ACC_013', type: 'Negative', severity: 'critical',
    name: 'Save blocked for an Account Number already in use',
    description: 'Verify a new Account cannot be saved with the Account Number of an existing Account (BR-4, MF-6).',
    condition: 'An Account exists on another Company; its Account Number is typed into the new form.',
    expected: 'A validation error is shown and no Account is created.',
    parentType: 'Company',
    parent: company('Account Duplicate'),
    existingParent: company('Account Number Owner'),
  },
  cancel: {
    id: 'TC_ACC_014', type: 'Negative', severity: 'normal',
    name: 'Cancel at the advisory keeps the user on the parent without creating an Account',
    description: 'Verify that cancelling at the Existing Account Advisory (not continuing) stops Account creation, keeps the user on the parent page and creates nothing (AF-1).',
    condition: 'Company already has one Account; user starts Add New Account and dismisses the advisory.',
    expected: 'User stays on the Company page, no Create Account form opens and the Accounts tab still lists exactly one Account.',
    parentType: 'Company',
    parent: company('Account Cancel'),
  },
};

module.exports = { MODULE, accountCases };
