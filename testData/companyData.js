const { env } = require('../utils/testData');

/**
 * @typedef {Object} CompanyData
 * @property {string} tradeName
 * @property {string} [legalName]
 * @property {'LLC'|'Corporation'|'S Corporation'|'Partnership'|'Sole Proprietorship'|'Nonprofit'|'Other'} [entityType]
 * @property {string} [ein]
 * @property {Array<'Prospect'|'Client'|'Partner'|'Vendor'>} [roles]
 * @property {string} [website]
 * @property {{ number: string, type: 'Mobile'|'Landline'|'Fax'|'VoIP' }} [phone]
 * @property {{ type?: string, recipientName: string, address1: string, address2?: string,
 *             city: string, state: string, postalCode: string }} [address]
 */

const kw = env.keyword;               // "Playwright"
const tag = env.runTag;               // e.g. "1014-153012"
const digits = tag.replace(/\D/g, '');
// The duplicate check flags existing Trade Names / EINs, so both carry the run tag
// to keep every run's records distinct and traceable.
const ein = i => `9${i}-${digits.slice(-7)}`;

/** Five realistic companies, one per entity type / company role. */
const companyTestCases = [
  {
    id: 'TC_COM_001',
    name: 'Create Company - LLC Prospect with website',
    description: 'Verify a company (LLC) can be created as a Prospect with legal name and website.',
    condition: 'User is logged in; duplicate check finds no exact match for the trade name.',
    severity: 'critical',
    data: {
      tradeName: `${kw} Analytics ${tag}`, legalName: `${kw} Analytics Group LLC`, entityType: 'LLC',
      roles: ['Prospect'], website: 'https://playwright-analytics.example.com',
    },
  },
  {
    id: 'TC_COM_002',
    name: 'Create Company - Corporation Client with EIN',
    description: 'Verify a Corporation can be created as a Client with a valid EIN (XX-XXXXXXX).',
    condition: 'User is logged in; EIN is unique in the sandbox.',
    severity: 'critical',
    data: {
      tradeName: `${kw} Cloud Solutions ${tag}`, legalName: `${kw} Cloud Solutions Inc.`, entityType: 'Corporation',
      ein: ein(2), roles: ['Client'], website: 'https://playwright-cloud.example.com',
    },
  },
  {
    id: 'TC_COM_003',
    name: 'Create Company - Partnership Partner with Landline phone',
    description: 'Verify a Partnership can be created as a Partner with a primary Landline phone.',
    condition: 'User is logged in; phone drawer on Add Company accepts a 10-digit US number.',
    severity: 'normal',
    data: {
      tradeName: `${kw} Health Partners ${tag}`, legalName: `${kw} Health Partners LP`, entityType: 'Partnership',
      ein: ein(3), roles: ['Partner'], phone: { number: '3125550126', type: 'Landline' },
    },
  },
  {
    id: 'TC_COM_004',
    name: 'Create Company - S Corporation Vendor with Shipping address',
    description: 'Verify an S Corporation can be created as a Vendor with a Shipping address (Illinois).',
    condition: 'User is logged in; address drawer on Add Company requires Recipient, Street, City and ZIP.',
    severity: 'normal',
    data: {
      tradeName: `${kw} Logistics ${tag}`, legalName: `${kw} Logistics Co.`, entityType: 'S Corporation',
      ein: ein(4), roles: ['Vendor'],
      address: { type: 'Shipping', recipientName: `${kw} Logistics Receiving`, address1: '233 South Wacker Drive', address2: 'Dock 3', city: 'Chicago', state: 'Illinois', postalCode: '60606' },
    },
  },
  {
    id: 'TC_COM_005',
    name: 'Create Company - Nonprofit with all fields and multiple roles',
    description: 'Verify a Nonprofit can be created with every field: EIN, website, two roles (Client + Partner), phone and Billing address (Washington).',
    condition: 'User is logged in; all optional fields on Add Company are filled.',
    severity: 'critical',
    data: {
      tradeName: `${kw} Green Energy Foundation ${tag}`, legalName: `${kw} Green Energy Foundation`, entityType: 'Nonprofit',
      ein: ein(5), roles: ['Client', 'Partner'], website: 'https://playwright-green.example.org',
      phone: { number: '2065550111', type: 'Landline' },
      address: { type: 'Billing', recipientName: `${kw} Green Energy Accounts`, address1: '400 Broad Street', city: 'Seattle', state: 'Washington', postalCode: '98109' },
    },
  },
];

module.exports = { companyTestCases };
