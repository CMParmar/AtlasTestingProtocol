const { env } = require('../utils/testData');

/**
 * @typedef {Object} PersonData
 * @property {string} firstName
 * @property {string} [middleName]
 * @property {string} lastName
 * @property {string} [handle]
 * @property {string} [email]
 * @property {{ number: string, type: 'Mobile'|'Landline'|'Fax'|'VoIP' }} [phone]
 * @property {{ type?: string, recipientName: string, address1: string, address2?: string,
 *             city: string, state: string, postalCode: string }} [address]
 */

const kw = env.keyword;               // "Playwright"
const tag = env.runTag;               // e.g. "1014-153012" - unique per run
const digits = tag.replace(/\D/g, '');
const handle = first => `${kw.toLowerCase()}_${first.toLowerCase()}_${digits}`;
const email = (first, last) => `${kw.toLowerCase()}.${first}.${last}.${digits}@example.com`.toLowerCase();

/**
 * Five realistic people. The keyword is the middle name (so every record reads
 * "Ava Playwright Thompson") and is also part of each handle and e-mail.
 * Phone numbers use the reserved fictional 555-01xx range; e-mails use example.com.
 */
const personTestCases = [
  {
    id: 'TC_PER_001',
    name: 'Create Person with name and e-mail only',
    description: 'Verify a person can be created with only personal details and a primary e-mail.',
    condition: 'User is logged in; Add Person page is open; no phone or address added.',
    severity: 'critical',
    data: { firstName: 'Ava', middleName: kw, lastName: 'Thompson', handle: handle('Ava'), email: email('Ava', 'Thompson') },
  },
  {
    id: 'TC_PER_002',
    name: 'Create Person with a Mobile phone number',
    description: 'Verify a person can be created with a primary Mobile phone added from the phone drawer.',
    condition: 'User is logged in; phone drawer accepts a 10-digit US number with type Mobile.',
    severity: 'critical',
    data: {
      firstName: 'Liam', middleName: kw, lastName: 'Carter', handle: handle('Liam'), email: email('Liam', 'Carter'),
      phone: { number: '2025550143', type: 'Mobile' },
    },
  },
  {
    id: 'TC_PER_003',
    name: 'Create Person with a Billing address',
    description: 'Verify a person can be created with a Billing address (Texas) added from the address drawer.',
    condition: 'User is logged in; address drawer requires Recipient, Street line 1, City and ZIP.',
    severity: 'normal',
    data: {
      firstName: 'Sophia', middleName: kw, lastName: 'Nguyen', handle: handle('Sophia'), email: email('Sophia', 'Nguyen'),
      address: { type: 'Billing', recipientName: `Sophia ${kw} Nguyen`, address1: '2100 Ross Avenue', address2: 'Suite 400', city: 'Dallas', state: 'Texas', postalCode: '75201' },
    },
  },
  {
    id: 'TC_PER_004',
    name: 'Create Person with Landline phone and Mailing address',
    description: 'Verify a person can be created with both a Landline phone and a Mailing address (New York).',
    condition: 'User is logged in; both phone and address drawers are used on the same form.',
    severity: 'normal',
    data: {
      firstName: 'Noah', middleName: kw, lastName: 'Patel', handle: handle('Noah'), email: email('Noah', 'Patel'),
      phone: { number: '2125550178', type: 'Landline' },
      address: { type: 'Mailing', recipientName: `Noah ${kw} Patel`, address1: '350 Fifth Avenue', city: 'New York', state: 'New York', postalCode: '10118' },
    },
  },
  {
    id: 'TC_PER_005',
    name: 'Create Person with all fields (VoIP phone, Shipping address)',
    description: 'Verify a person can be created with every field populated: name, handle, e-mail, VoIP phone and Shipping address (California).',
    condition: 'User is logged in; all optional fields on Add Person are filled.',
    severity: 'critical',
    data: {
      firstName: 'Olivia', middleName: kw, lastName: 'Garcia', handle: handle('Olivia'), email: email('Olivia', 'Garcia'),
      phone: { number: '4155550192', type: 'VoIP' },
      address: { type: 'Shipping', recipientName: `Olivia ${kw} Garcia`, address1: '1 Market Street', address2: 'Floor 12', city: 'San Francisco', state: 'California', postalCode: '94105' },
    },
  },
];

module.exports = { personTestCases };
