const { env } = require('../utils/testData');

const kw = env.keyword;
const digits = env.runTag.replace(/\D/g, '');

/**
 * Negative Person scenarios: invalid or missing input must be rejected.
 * `message` is the validation text the app shows (taken from the form's data-val-* rules);
 * where the app has no rule (phone / ZIP format), any validation error is accepted as a pass.
 * Values still carry the keyword so any record the app saves by mistake is easy to find.
 */
const personNegativeCases = {
  noNameNoEmail: {
    id: 'TC_PER_007', type: 'Negative', severity: 'critical',
    name: 'Save blocked when no name and no e-mail are given',
    description: 'Verify a person cannot be saved with First, Middle, Last Name and Email all empty (only a handle).',
    condition: 'User is logged in; Add Person page is open; only Handle is filled.',
    expected: '"A Person record must have at least one name or an email address." is shown and the record is not saved.',
    message: 'A Person record must have at least one name or an email address.',
    data: { handle: `${kw.toLowerCase()}_noname_${digits}` },
  },
  invalidEmail: {
    id: 'TC_PER_008', type: 'Negative', severity: 'critical',
    name: 'Save blocked for an invalid e-mail address',
    description: 'Verify a person cannot be saved when the e-mail has no "@" (invalid format).',
    condition: 'User is logged in; valid name entered; Email = text without "@".',
    expected: '"Enter a valid email address." is shown and the record is not saved.',
    message: 'Enter a valid email address.',
    data: { firstName: 'Ethan', middleName: kw, lastName: 'Brooks', email: `${kw.toLowerCase()}.ethan.brooks.example.com` },
  },
  phoneRequired: {
    id: 'TC_PER_009', type: 'Negative', severity: 'normal',
    name: 'Phone drawer requires a phone number',
    description: 'Verify the phone drawer cannot be confirmed with an empty phone number.',
    condition: 'User is logged in; Add Phone Number drawer is open; number left empty.',
    expected: '"Phone number is required." is shown and no phone is added to the person.',
    message: 'Phone number is required.',
    data: { phone: { number: '', type: 'Mobile' } },
  },
  phoneNonNumeric: {
    id: 'TC_PER_010', type: 'Negative', severity: 'normal',
    name: 'Phone drawer rejects a non-numeric phone number',
    description: 'Verify a phone number made of letters is rejected by the phone drawer.',
    condition: 'User is logged in; Add Phone Number drawer is open; number = letters only.',
    expected: 'A validation error is shown and the value is not added as the person\'s phone number.',
    data: { phone: { number: kw.toUpperCase(), type: 'Mobile' } },
  },
  addressRequired: {
    id: 'TC_PER_011', type: 'Negative', severity: 'normal',
    name: 'Address drawer requires Recipient, Street, City and ZIP',
    description: 'Verify the address drawer cannot be confirmed with the required fields empty.',
    condition: 'User is logged in; Add Address drawer is open; only address type Billing selected.',
    expected: 'Required-field messages (incl. "ZIP/Postal Code is required") are shown and no address is added.',
    message: 'ZIP/Postal Code is required',
    data: { address: { type: 'Billing' } },
  },
  invalidZip: {
    id: 'TC_PER_012', type: 'Negative', severity: 'normal',
    name: 'Address drawer rejects an invalid US ZIP code',
    description: 'Verify a US address with a non-numeric ZIP ("ABCDE") is rejected.',
    condition: 'User is logged in; Add Address drawer is open; State = Texas; ZIP = letters.',
    expected: 'A validation error is shown for the ZIP and the address is not added.',
    data: {
      address: { type: 'Mailing', recipientName: `Ethan ${kw} Brooks`, address1: '901 Invalid Zip Lane', city: 'Austin', state: 'Texas', postalCode: 'ABCDE' },
    },
  },
};

module.exports = { personNegativeCases };
