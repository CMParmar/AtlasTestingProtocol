const { env } = require('../utils/testData');

const kw = env.keyword;
const tag = env.runTag;

/**
 * Negative Company scenarios: invalid or missing input must be rejected.
 * `message` is the validation text the app shows (taken from the form's data-val-* rules);
 * where the app has no rule (phone length / ZIP format), any validation error counts as a pass.
 * Trade names carry keyword + run tag so a record saved by mistake is easy to find.
 */
const companyNegativeCases = {
  noName: {
    id: 'TC_COM_008', type: 'Negative', severity: 'critical',
    name: 'Save blocked without Trade Name and Legal Name',
    description: 'Verify a company cannot be saved when both Trade Name and Legal Name are empty.',
    condition: 'User is logged in; Add Company form reached via the duplicate check, then Trade Name cleared.',
    expected: '"Enter at least a Trade Name or a Legal Name." is shown and the company is not saved.',
    message: 'Enter at least a Trade Name or a Legal Name.',
    data: { tradeName: '', legalName: '', entityType: 'LLC', website: 'https://playwright-noname.example.com' },
    searchName: `${kw} Name Check ${tag}`,
  },
  invalidEin: {
    id: 'TC_COM_009', type: 'Negative', severity: 'critical',
    name: 'Save blocked for an EIN with fewer than nine digits',
    description: 'Verify a company cannot be saved with a 5-digit EIN.',
    condition: 'User is logged in; valid Trade Name; EIN = 12345.',
    expected: '"EIN must contain exactly nine numeric digits." is shown and the company is not saved.',
    message: 'EIN must contain exactly nine numeric digits.',
    data: { tradeName: `${kw} Invalid EIN ${tag}`, entityType: 'Corporation', ein: '12345' },
  },
  invalidWebsite: {
    id: 'TC_COM_010', type: 'Negative', severity: 'normal',
    name: 'Save blocked for an invalid website URL',
    description: 'Verify a company cannot be saved when Website is not a valid URL.',
    condition: 'User is logged in; valid Trade Name; Website = plain text with spaces.',
    expected: '"Please enter a valid URL." is shown and the company is not saved.',
    message: 'Please enter a valid URL.',
    data: { tradeName: `${kw} Invalid Website ${tag}`, entityType: 'Partnership', website: 'playwright invalid website' },
  },
  shortPhone: {
    id: 'TC_COM_011', type: 'Negative', severity: 'normal',
    name: 'Phone drawer rejects a too-short phone number',
    description: 'Verify a 3-digit number is rejected as a US (+1) company phone number (10 digits required).',
    condition: 'User is logged in; Add Company form open; phone drawer number = 555.',
    expected: 'A validation error is shown and the number is not added as the company phone.',
    data: { tradeName: `${kw} Short Phone ${tag}`, phone: { number: '555', type: 'Landline' } },
  },
  invalidZip: {
    id: 'TC_COM_012', type: 'Negative', severity: 'normal',
    name: 'Address drawer rejects an invalid US ZIP code',
    description: 'Verify a US company address with ZIP "ABC12" is rejected.',
    condition: 'User is logged in; Add Company form open; State = Illinois; ZIP = ABC12.',
    expected: 'A validation error is shown for the ZIP and the address is not added.',
    data: {
      tradeName: `${kw} Invalid ZIP ${tag}`,
      address: { type: 'Billing', recipientName: `${kw} Accounts Payable`, address1: '77 Invalid Zip Plaza', city: 'Chicago', state: 'Illinois', postalCode: 'ABC12' },
    },
  },
};

module.exports = { companyNegativeCases };
