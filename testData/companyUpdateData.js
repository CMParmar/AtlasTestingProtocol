const { env } = require('../utils/testData');
const { companyNegativeCases: neg } = require('./companyNegativeData');

/**
 * Use case 62385 - View & Edit Company.
 * Every test first creates its own company (`seed`), opens it on /Company/Edit/{id}, then edits it.
 * Trade names carry keyword + run tag; EINs are unique per run ("7X-" / "8X-" + last 7 run-tag digits,
 * so they never clash with the Add Company tests, which use "9X-").
 * Vendor is not used: it is not shown among the role checkboxes on the Edit page.
 */
const kw = env.keyword;               // "Playwright"
const tag = env.runTag;               // e.g. "1023-125418"
const digits = tag.replace(/\D/g, '');
const ein = (prefix, i) => `${prefix}${i}-${digits.slice(-7)}`;
const site = slug => `https://playwright-${slug}.example.com`;

const MODULE = 'Company Update';
const ROLES = ['Prospect', 'Client', 'Partner'];

/** Five companies: each one is viewed, edited, saved and re-opened to confirm the change persisted. */
const companyUpdateCases = [
  {
    id: 'TC_CEU_001',
    name: 'View & update Trade Name (Display Name auto-maintained)',
    description: 'Verify an existing company\'s Trade Name can be changed and that the system-maintained Display Name follows it on save (QA-4, QA-5, 62248).',
    condition: 'User has ACCT.Company.View and ACCT.Company.Update; Display Name has not been overwritten.',
    expected: '"Record saved successfully." is shown; after re-opening, Trade Name and Display Name both show the new trade name.',
    severity: 'critical',
    seed: { tradeName: `${kw} Harbor Analytics ${tag}`, legalName: `${kw} Harbor Analytics LLC`, entityType: 'LLC', roles: ['Prospect'] },
    update: { tradeName: `${kw} Harbor Insights ${tag}` },
  },
  {
    id: 'TC_CEU_002',
    name: 'View & update Legal Name, Entity Type and Website',
    description: 'Verify the Legal Name, Entity Type and Website of an existing company can be changed and saved (QA-4).',
    condition: 'User has ACCT.Company.Update; company exists as a Corporation with a website.',
    expected: '"Record saved successfully." is shown; after re-opening, the new Legal Name, Entity Type "S Corporation" and Website are shown.',
    severity: 'critical',
    seed: {
      tradeName: `${kw} Summit Builders ${tag}`, legalName: `${kw} Summit Builders Inc.`, entityType: 'Corporation',
      roles: ['Client'], website: site('summit'),
    },
    update: { legalName: `${kw} Summit Builders Holdings Inc.`, entityType: 'S Corporation', website: site('summit-holdings') },
  },
  {
    id: 'TC_CEU_003',
    name: 'View & update EIN and add a Company Role',
    description: 'Verify a valid, unused EIN can replace the existing one and a new Company Role (Client) can be assigned (MF-3, MF-4, QA-10).',
    condition: 'User has ACCT.Company.Update; company has an EIN and the Prospect role; the new EIN is not used by another company.',
    expected: '"Record saved successfully." is shown; after re-opening, the new EIN is shown and both Prospect and Client are ticked.',
    severity: 'critical',
    seed: {
      tradeName: `${kw} Riverbend Partners ${tag}`, legalName: `${kw} Riverbend Partners LP`, entityType: 'Partnership',
      ein: ein(8, 0), roles: ['Prospect'],
    },
    update: { ein: ein(8, 1), roles: ['Prospect', 'Client'] },
  },
  {
    id: 'TC_CEU_004',
    name: 'View & update - remove a Company Role and add a Landline phone',
    description: 'Verify an assigned Company Role (Partner) can be removed and a phone added to an existing company (MF-4, QA-11).',
    condition: 'User has ACCT.Company.Update; company has the Client and Partner roles and no phone.',
    expected: '"Record saved successfully." is shown; after re-opening, only Client is ticked and the Landline number is shown.',
    severity: 'normal',
    seed: { tradeName: `${kw} Northwind Supply ${tag}`, legalName: `${kw} Northwind Supply Corp.`, entityType: 'Corporation', roles: ['Client', 'Partner'] },
    update: { roles: ['Client'], phone: { number: '3125550147', type: 'Landline' } },
  },
  {
    id: 'TC_CEU_005',
    name: 'View & update all fields (names, entity type, EIN, website, roles, VoIP phone, Billing address)',
    description: 'Verify every editable field of an existing company can be changed in one save, including a second phone and a new address.',
    condition: 'User has ACCT.Company.Update; company exists with an EIN, the Prospect role and a Landline phone.',
    expected: '"Record saved successfully." is shown; after re-opening, every new value is shown and Display Name follows the new Trade Name.',
    severity: 'critical',
    seed: {
      tradeName: `${kw} Lakeside Health ${tag}`, legalName: `${kw} Lakeside Health Foundation`, entityType: 'Nonprofit',
      ein: ein(8, 2), roles: ['Prospect'], website: site('lakeside'), phone: { number: '6125550110', type: 'Landline' },
    },
    update: {
      tradeName: `${kw} Lakeside Care Network ${tag}`, legalName: `${kw} Lakeside Care Network Inc.`, entityType: 'Corporation',
      ein: ein(8, 3), website: site('lakeside-care'), roles: ['Client', 'Partner'],
      phone: { number: '6125550189', type: 'VoIP' },
      address: { type: 'Billing', recipientName: `${kw} Lakeside Accounts`, address1: '80 South Eighth Street', address2: 'Suite 900', city: 'Minneapolis', state: 'Minnesota', postalCode: '55402' },
    },
  },
];

/** View, Display Name, validation, unsaved-changes, audit, accounts, recently-viewed and delete/restore scenarios. */
const companyUpdateExtraCases = {
  view: {
    id: 'TC_CEU_006', severity: 'critical',
    name: 'View Company record shows saved details, roles, tabs and features',
    description: 'Verify the Company page loads every saved value and offers Signals, Documents, Audit and Save (MF-1, MF-2, QA-1, QA-28, QA-29). No changes are saved.',
    condition: 'User has ACCT.Company.View; company exists with EIN, roles, website, phone and address.',
    expected: 'All fields are pre-filled; roles are ticked; phone and address are listed; header shows the Display Name; Details, People, Documents, Tasks and Audit tabs, the Signals button and Save are available.',
    seed: {
      tradeName: `${kw} Crescent Media ${tag}`, legalName: `${kw} Crescent Media LLC`, entityType: 'LLC', ein: ein(8, 4),
      roles: ['Client', 'Partner'], website: site('crescent'), phone: { number: '4045550133', type: 'Landline' },
      address: { type: 'Mailing', recipientName: `${kw} Crescent Media`, address1: '191 Peachtree Street NE', city: 'Atlanta', state: 'Georgia', postalCode: '30303' },
    },
  },
  displayOverride: {
    id: 'TC_CEU_007', severity: 'normal',
    name: 'Manually overwritten Display Name is preserved when Trade Name changes',
    description: 'Verify that once the user overwrites Display Name, a later Trade Name change does not replace it (QA-6, 62248).',
    condition: 'User has ACCT.Company.Update; Display Name is overwritten and saved, then Trade Name is changed and saved.',
    expected: 'After both saves the Display Name is still the user-entered value and the Trade Name shows the new value.',
    seed: { tradeName: `${kw} Beacon Labs ${tag}`, legalName: `${kw} Beacon Labs LLC`, entityType: 'LLC', roles: ['Prospect'] },
    override: { displayName: `${kw} Beacon (Custom Display) ${tag}` },
    update: { tradeName: `${kw} Beacon Research ${tag}` },
  },
  invalidEin: {
    id: 'TC_CEU_008', type: 'Negative', severity: 'critical',
    name: 'Save blocked for an invalid EIN on edit',
    description: 'Verify an existing company cannot be saved when its EIN is changed to fewer than nine digits (AF-1, QA-7).',
    condition: 'User has ACCT.Company.Update; company exists with a valid EIN; EIN changed to 12345.',
    expected: `"${neg.invalidEin.message}" is shown, the save is blocked and the stored record is unchanged.`,
    message: neg.invalidEin.message,
    seed: { tradeName: `${kw} Granite Ventures ${tag}`, legalName: `${kw} Granite Ventures Inc.`, entityType: 'Corporation', ein: ein(8, 5), roles: ['Client'] },
    update: { ein: '12345' },
  },
  duplicateEin: {
    id: 'TC_CEU_009', type: 'Negative', severity: 'critical',
    name: 'Save blocked for an EIN already used by another company',
    description: 'Verify a company cannot be saved with the EIN of another active company while duplicate EINs are not allowed (AF-2, QA-8).',
    condition: 'SET.ACCT.Company.AllowDuplicateEIN = 0 (default); a second company with the target EIN is created first.',
    expected: '"A company with this EIN already exists. Change or remove the EIN to continue." is shown, the save is blocked and the stored record is unchanged.',
    message: 'A company with this EIN already exists. Change or remove the EIN to continue.',
    existing: { tradeName: `${kw} EIN Holder ${tag}`, legalName: `${kw} EIN Holder LLC`, entityType: 'LLC', ein: ein(8, 6), roles: ['Prospect'] },
    seed: { tradeName: `${kw} Pinecrest Advisors ${tag}`, legalName: `${kw} Pinecrest Advisors LLC`, entityType: 'LLC', roles: ['Client'] },
    update: { ein: ein(8, 6) },
  },
  noName: {
    id: 'TC_CEU_010', type: 'Negative', severity: 'critical',
    name: 'Save blocked when Trade Name and Legal Name are cleared',
    description: 'Verify an existing company cannot be saved after both Trade Name and Legal Name are cleared (MF-3 field rules).',
    condition: 'User has ACCT.Company.Update; company exists; Trade Name and Legal Name emptied on the Edit page.',
    expected: `"${neg.noName.message}" is shown, the save is blocked and the stored record is unchanged.`,
    message: neg.noName.message,
    seed: { tradeName: `${kw} Orchard Foods ${tag}`, legalName: `${kw} Orchard Foods LLC`, entityType: 'LLC', roles: ['Client'] },
    update: { tradeName: '', legalName: '' },
  },
  unsaved: {
    id: 'TC_CEU_011', type: 'Negative', severity: 'normal',
    name: 'Unsaved changes warning - Cancel keeps edits, Continue discards them',
    description: 'Verify dirty-record tracking on the Company page: leaving with unsaved changes warns the user; Cancel stays, Continue Without Saving discards (MF-3).',
    condition: 'User has ACCT.Company.Update; Trade Name changed but not saved; user clicks a sidebar link twice.',
    expected: 'An "unsaved changes" warning is shown; after Cancel the edit is kept; after Continue the user leaves and the stored Trade Name is unchanged.',
    seed: { tradeName: `${kw} Meridian Freight ${tag}`, legalName: `${kw} Meridian Freight LLC`, entityType: 'LLC', roles: ['Partner'] },
    update: { tradeName: `${kw} Meridian Unsaved ${tag}` },
  },
  audit: {
    id: 'TC_CEU_012', severity: 'normal',
    name: 'Audit tab records the field change after save',
    description: 'Verify that saving a change writes an audit entry visible on the Audit tab (MF-11, QA-27, CORE.AuditEntry).',
    condition: 'User has ACCT.Company.Update; Legal Name is changed and saved.',
    expected: 'The Audit tab lists the change, including the previous Legal Name value.',
    seed: { tradeName: `${kw} Copperline Studios ${tag}`, legalName: `${kw} Copperline Studios LLC`, entityType: 'LLC', roles: ['Client'] },
    update: { legalName: `${kw} Copperline Media Group LLC` },
  },
  accountsHidden: {
    id: 'TC_CEU_013', severity: 'normal',
    name: 'Accounts tab is hidden for a company without accounts',
    description: 'Verify the Accounts tab is not displayed when the company has no associated Account (MF-9).',
    condition: 'User has ACCT.Company.View; company was just created and has no Account.',
    expected: 'No "Accounts" tab is shown on the Company page.',
    seed: { tradeName: `${kw} Bluebird Retail ${tag}`, legalName: `${kw} Bluebird Retail LLC`, entityType: 'LLC', roles: ['Prospect'] },
  },
  recentlyViewed: {
    id: 'TC_CEU_014', severity: 'minor',
    name: 'Opened company appears in Recently Viewed',
    description: 'Verify opening a Company record updates Recently Viewed (MF-1, QA-26, CORE.RecentlyViewed).',
    condition: 'Company is enabled for Recently Viewed (SET.CORE.RecentlyViewed.EnabledEntitiesJSON).',
    expected: 'The Recently Viewed page lists the company by its Display Name.',
    seed: { tradeName: `${kw} Ironwood Systems ${tag}`, legalName: `${kw} Ironwood Systems Inc.`, entityType: 'Corporation', roles: ['Client'] },
  },
  deleteRestore: {
    id: 'TC_CEU_015', severity: 'normal',
    name: 'Soft delete a company without accounts, then restore it',
    description: 'Verify a company with no Accounts can be soft deleted and then restored with its data intact (MF-12, MF-13, QA-23, QA-25, 62217).',
    condition: 'User has ACCT.Company.Update; company has no Account records.',
    expected: 'After Delete the record offers Restore (soft deleted, not removed); after Restore it offers Delete again and every value is unchanged.',
    seed: { tradeName: `${kw} Willow Creek Events ${tag}`, legalName: `${kw} Willow Creek Events LLC`, entityType: 'LLC', roles: ['Prospect'] },
  },
};

/** `${prefix}` padded with letters (no spaces) to exactly `length` characters - used for the 200-character limit. */
const longText = (prefix, length) => (prefix + 'ABCDEFGHIJ'.repeat(30)).slice(0, length);

/**
 * Use case 62248 - Maintain Company Display Name (QA matrix rows not already covered by
 * TC_CEU_001 [MF-6 Trade Name], TC_CEU_007 [A3-1 Trade Name] and TC_CEU_010 [MF-2]).
 * `steps` are saved one after another; an empty displayName means "reset" (MF-5).
 */
const displayNameFlows = [
  {
    id: 'TC_CEU_016', severity: 'critical',
    name: 'Display Name falls back to Legal Name when Trade Name is blank',
    description: 'Verify that with Trade Name cleared the system generates Display Name from Legal Name (62248 MF-3).',
    condition: 'Display Name not overwritten; Trade Name cleared on the Edit page; Legal Name populated.',
    expected: 'After save, Display Name = Legal Name.',
    seed: { tradeName: `${kw} Acme Widgets ${tag}`, legalName: `${kw} Acme Manufacturing LLC ${tag}`, entityType: 'LLC', roles: ['Prospect'] },
    steps: [{ tradeName: '' }],
  },
  {
    id: 'TC_CEU_017', severity: 'normal',
    name: 'Display Name regenerates when Legal Name changes (not overwritten)',
    description: 'Verify that, while Display Name is system-maintained and Trade Name is blank, a Legal Name change regenerates it (62248 MF-6).',
    condition: 'Display Name not overwritten; Trade Name blank; Legal Name changed and saved.',
    expected: 'After the second save, Display Name = the new Legal Name.',
    seed: { tradeName: `${kw} Delta Freight ${tag}`, legalName: `${kw} Delta Freight LLC ${tag}`, entityType: 'LLC', roles: ['Client'] },
    steps: [{ tradeName: '' }, { legalName: `${kw} Delta Logistics Group LLC ${tag}` }],
  },
  {
    id: 'TC_CEU_018', severity: 'normal',
    name: 'Display Name keeps the first 200 characters of a 250-character Trade Name',
    description: 'Verify a 250-character Trade Name produces a Display Name of its first 200 characters (62248 MF-3).',
    condition: 'Display Name not overwritten; Trade Name = 250 characters.',
    expected: 'After save, Display Name = first 200 characters of Trade Name.',
    seed: { tradeName: `${kw} Short Trade ${tag}`, legalName: `${kw} Long Trade Holdings LLC ${tag}`, entityType: 'LLC', roles: ['Prospect'] },
    steps: [{ tradeName: longText(`${kw} Long Trade Name ${tag} `, 250) }],
  },
  {
    id: 'TC_CEU_019', severity: 'normal',
    name: 'Display Name keeps the first 200 characters of a 250-character Legal Name',
    description: 'Verify a 250-character Legal Name (Trade Name blank) produces a Display Name of its first 200 characters (62248 MF-3).',
    condition: 'Display Name not overwritten; Trade Name blank; Legal Name = 250 characters.',
    expected: 'After save, Display Name = first 200 characters of Legal Name.',
    seed: { tradeName: `${kw} Short Legal ${tag}`, legalName: `${kw} Short Legal LLC ${tag}`, entityType: 'LLC', roles: ['Prospect'] },
    steps: [{ tradeName: '', legalName: longText(`${kw} Long Legal Name ${tag} `, 250) }],
  },
  {
    id: 'TC_CEU_021', severity: 'normal',
    name: 'Overwritten Display Name is kept when Legal Name changes',
    description: 'Verify a user-entered Display Name is stored and survives a later Legal Name change (62248 MF-4, A1-1, A3-1).',
    condition: 'Display Name set to "Acme West Division" and saved; Legal Name then changed and saved.',
    expected: 'After both saves, Display Name is still the user-entered value.',
    seed: { tradeName: `${kw} Acme West ${tag}`, legalName: `${kw} Acme West LLC ${tag}`, entityType: 'LLC', roles: ['Partner'] },
    steps: [{ displayName: `${kw} Acme West Division ${tag}` }, { legalName: `${kw} Acme West Holdings LLC ${tag}` }],
  },
  {
    id: 'TC_CEU_023', severity: 'critical',
    name: 'Reset Display Name regenerates it and re-enables auto-maintenance',
    description: 'Verify that resetting an overwritten Display Name regenerates it from Trade Name, and later Trade Name changes regenerate it again (62248 MF-5, A2-1).',
    condition: 'Display Name overwritten and saved; then reset (cleared) and saved; then Trade Name changed and saved.',
    expected: 'After the reset, Display Name = Trade Name; after the Trade Name change, Display Name = the new Trade Name.',
    seed: { tradeName: `${kw} Vista Labs ${tag}`, legalName: `${kw} Vista Labs LLC ${tag}`, entityType: 'LLC', roles: ['Client'] },
    steps: [{ displayName: `${kw} Vista Custom Name ${tag}` }, { displayName: '' }, { tradeName: `${kw} Vista Research ${tag}` }],
  },
];

const displayNameExtraCases = {
  whitespace: {
    id: 'TC_CEU_020', severity: 'minor',
    name: 'Display Name trims and collapses extra spaces from Trade Name',
    description: 'Verify leading/trailing whitespace is trimmed and repeated spaces are collapsed in the generated Display Name (62248 MF-3).',
    condition: 'Display Name not overwritten; Trade Name entered with leading, trailing and double spaces.',
    expected: `After save, Display Name = "${kw} Spaced Trade Name ${tag}".`,
    seed: { tradeName: `${kw} Spacing Check ${tag}`, legalName: `${kw} Spacing Check LLC ${tag}`, entityType: 'LLC', roles: ['Prospect'] },
    update: { tradeName: `   ${kw}    Spaced   Trade  Name ${tag}   ` },
  },
  tooLong: {
    id: 'TC_CEU_022', type: 'Negative', severity: 'normal',
    name: 'Display Name longer than 200 characters is rejected',
    description: 'Verify a 220-character Display Name cannot be saved (62248 MF-4: must be <= 200 characters).',
    condition: 'Company exists; user enters a 220-character Display Name.',
    expected: 'A validation error is shown (or the field does not accept more than 200 characters) and the Display Name is not saved.',
    seed: { tradeName: `${kw} Length Check ${tag}`, legalName: `${kw} Length Check LLC ${tag}`, entityType: 'LLC', roles: ['Prospect'] },
    update: { displayName: longText(`${kw} Long Display ${tag} `, 220) },
  },
};

module.exports = { MODULE, ROLES, companyUpdateCases, companyUpdateExtraCases, displayNameFlows, displayNameExtraCases };
