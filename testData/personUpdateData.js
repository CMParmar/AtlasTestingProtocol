const { env } = require('../utils/testData');
const { personNegativeCases: neg } = require('./personNegativeData');

/**
 * Use case 62386 - View & Update Person.
 * Every test first creates its own person (`seed`), opens it on /Person/Edit/{id}, then edits it.
 * The keyword stays in the middle name, handle and e-mail so every record is easy to find.
 * Phone numbers use the reserved fictional 555-01xx range; e-mails use example.com.
 */
const kw = env.keyword;               // "Playwright"
const digits = env.runTag.replace(/\D/g, '');
const handle = name => `${kw.toLowerCase()}_${name.toLowerCase()}_${digits}`;
const email = (...parts) => `${kw.toLowerCase()}.${parts.join('.')}.${digits}@example.com`.toLowerCase();

const MODULE = 'Person Update';

/** Five people: each one is viewed, edited, saved and re-opened to confirm the change persisted. */
const personUpdateCases = [
  {
    id: 'TC_PEU_001',
    name: 'View & update First and Last Name (Display Name and Initials re-sync)',
    description: 'Verify an existing person\'s First and Last Name can be changed and that Display Name and Initials are re-generated on save (62247).',
    condition: 'User has ACCT.Person.View and ACCT.Person.Edit; person exists with name and e-mail only.',
    expected: 'Changes are saved with a confirmation message; after re-opening, the new names are shown, Display Name = "Amelia Hughes-Ward" and Initials = "AH".',
    severity: 'critical',
    seed: { firstName: 'Mia', middleName: kw, lastName: 'Hughes', handle: handle('Mia'), email: email('mia', 'hughes') },
    update: { firstName: 'Amelia', lastName: 'Hughes-Ward' },
  },
  {
    id: 'TC_PEU_002',
    name: 'View & update Handle and Email',
    description: 'Verify an existing person\'s Handle and primary Email can be changed and saved.',
    condition: 'User has ACCT.Person.Edit; new handle and e-mail are unique in the sandbox.',
    expected: 'Changes are saved with a confirmation message; after re-opening, the new Handle and Email are shown and the header shows the new @handle.',
    severity: 'critical',
    seed: { firstName: 'James', middleName: kw, lastName: 'Walker', handle: handle('James'), email: email('james', 'walker') },
    update: { handle: handle('James_upd'), email: email('james', 'walker', 'updated') },
  },
  {
    id: 'TC_PEU_003',
    name: 'View & update - add a Mobile phone to an existing person',
    description: 'Verify a phone number can be added to an existing person from the Edit page (MF-3, delegates to 62246).',
    condition: 'User has ACCT.Person.Edit; person exists with no phone number.',
    expected: 'The phone is added to the list and saved; after re-opening, the Mobile number is shown on the person.',
    severity: 'normal',
    seed: { firstName: 'Chloe', middleName: kw, lastName: 'Bennett', handle: handle('Chloe'), email: email('chloe', 'bennett') },
    update: { phone: { number: '6175550134', type: 'Mobile' } },
  },
  {
    id: 'TC_PEU_004',
    name: 'View & update - add a Mailing address to an existing person',
    description: 'Verify an address can be added to an existing person from the Edit page (MF-4, delegates to 62390).',
    condition: 'User has ACCT.Person.Edit; person exists with no address.',
    expected: 'The address is added to the list and saved; after re-opening, the Mailing address (Massachusetts) is shown on the person.',
    severity: 'normal',
    seed: { firstName: 'Daniel', middleName: kw, lastName: 'Kim', handle: handle('Daniel'), email: email('daniel', 'kim') },
    update: {
      address: { type: 'Mailing', recipientName: `Daniel ${kw} Kim`, address1: '200 Clarendon Street', city: 'Boston', state: 'Massachusetts', postalCode: '02116' },
    },
  },
  {
    id: 'TC_PEU_005',
    name: 'View & update all fields (names, handle, e-mail, VoIP phone, Shipping address)',
    description: 'Verify every editable field of an existing person can be changed in one save, including a second phone and a new address.',
    condition: 'User has ACCT.Person.Edit; person exists with a Landline phone.',
    expected: 'Changes are saved with a confirmation message; after re-opening, every new value is shown, Display Name = "Gracie Lee-Morgan" and Initials = "GL".',
    severity: 'critical',
    seed: {
      firstName: 'Grace', middleName: kw, lastName: 'Lee', handle: handle('Grace'), email: email('grace', 'lee'),
      phone: { number: '3035550160', type: 'Landline' },
    },
    update: {
      firstName: 'Gracie', lastName: 'Lee-Morgan', handle: handle('Gracie'), email: email('gracie', 'lee-morgan'),
      phone: { number: '3035550187', type: 'VoIP' },
      address: { type: 'Shipping', recipientName: `Gracie ${kw} Lee-Morgan`, address1: '1801 California Street', address2: 'Suite 2400', city: 'Denver', state: 'Colorado', postalCode: '80202' },
    },
  },
];

/** View-only, validation, unsaved-changes and audit scenarios from the 62386 test matrix. */
const personUpdateExtraCases = {
  view: {
    id: 'TC_PEU_006', severity: 'critical',
    name: 'View Person record shows saved details and tabs',
    description: 'Verify the Person detail page loads every saved value, the header and the tabs (MF-1). No changes are saved.',
    condition: 'User has ACCT.Person.View; person exists with a phone and an address.',
    expected: 'Header shows the Display Name and @handle; all fields are pre-filled; phone and address are listed; Details, Documents, Tasks and Audit tabs plus Save and Cancel are available.',
    seed: {
      firstName: 'Ruby', middleName: kw, lastName: 'Collins', handle: handle('Ruby'), email: email('ruby', 'collins'),
      phone: { number: '7135550121', type: 'Mobile' },
      address: { type: 'Billing', recipientName: `Ruby ${kw} Collins`, address1: '1200 Smith Street', city: 'Houston', state: 'Texas', postalCode: '77002' },
    },
  },
  identityBlank: {
    id: 'TC_PEU_007', type: 'Negative', severity: 'critical',
    name: 'Save blocked when all names and e-mail are cleared',
    description: 'Verify an existing person cannot be saved after First, Middle, Last Name and Email are all cleared (AF-2).',
    condition: 'User has ACCT.Person.Edit; person exists; all four identity fields are emptied on the Edit page.',
    expected: `"${neg.noNameNoEmail.message}" is shown, the save is blocked and the stored record is unchanged.`,
    message: neg.noNameNoEmail.message,
    seed: { firstName: 'Henry', middleName: kw, lastName: 'Adams', handle: handle('Henry'), email: email('henry', 'adams') },
    update: { firstName: '', middleName: '', lastName: '', email: '' },
  },
  invalidEmail: {
    id: 'TC_PEU_008', type: 'Negative', severity: 'critical',
    name: 'Save blocked for an invalid e-mail on edit',
    description: 'Verify an existing person cannot be saved when the e-mail is changed to a value without "@" (AF-1).',
    condition: 'User has ACCT.Person.Edit; person exists; Email = text without "@".',
    expected: `"${neg.invalidEmail.message}" is shown, the save is blocked and the stored record is unchanged.`,
    message: neg.invalidEmail.message,
    seed: { firstName: 'Ella', middleName: kw, lastName: 'Morris', handle: handle('Ella'), email: email('ella', 'morris') },
    update: { email: `${kw.toLowerCase()}.ella.morris.example.com` },
  },
  unsavedCancel: {
    id: 'TC_PEU_009', type: 'Negative', severity: 'normal',
    name: 'Unsaved changes warning - Cancel keeps the user on the page',
    description: 'Verify leaving the Edit page with unsaved changes shows a warning, and Cancel keeps the user on the record with the edits intact (AF-7).',
    condition: 'User has ACCT.Person.Edit; Last Name is changed but not saved; user clicks a sidebar link.',
    expected: 'An "unsaved changes" warning is shown; after Cancel the user stays on /Person/Edit/{id} and the edited value is still in the field.',
    seed: { firstName: 'Lucas', middleName: kw, lastName: 'Turner', handle: handle('Lucas'), email: email('lucas', 'turner') },
    update: { lastName: 'Turner-Unsaved' },
  },
  unsavedDiscard: {
    id: 'TC_PEU_010', type: 'Negative', severity: 'normal',
    name: 'Unsaved changes warning - Continue discards the changes',
    description: 'Verify confirming the unsaved-changes warning leaves the page and discards the edits (AF-7).',
    condition: 'User has ACCT.Person.Edit; Last Name is changed but not saved; user clicks a sidebar link and confirms.',
    expected: 'An "unsaved changes" warning is shown; after Continue Without Saving the user leaves the page and the stored Last Name is unchanged.',
    seed: { firstName: 'Zoe', middleName: kw, lastName: 'Parker', handle: handle('Zoe'), email: email('zoe', 'parker') },
    update: { lastName: 'Parker-Discarded' },
  },
  audit: {
    id: 'TC_PEU_011', severity: 'normal',
    name: 'Audit tab records the field change after save',
    description: 'Verify that saving a change writes an audit entry (MF-8, CORE.AuditEntry) that is visible on the Audit tab.',
    condition: 'User has ACCT.Person.Edit; Last Name is changed and saved.',
    expected: 'The Audit tab lists the change, including the previous Last Name value.',
    seed: { firstName: 'Owen', middleName: kw, lastName: 'Bennett', handle: handle('Owen'), email: email('owen', 'bennett') },
    update: { lastName: 'Fairbanks' },
  },
};

module.exports = { MODULE, personUpdateCases, personUpdateExtraCases };
