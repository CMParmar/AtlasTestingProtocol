const { env } = require('../utils/testData');

/**
 * 62418 Company Search - Criteria Specification (docs/62418 Company Search Configuration.md).
 * Quick Search = top-bar search with Record Type "Company"; Advanced Search = /Search?entityId=3 + Advanced Filters.
 * Search is read-only: no records are created. The values below exist in the sandbox (checked 2026-11-12);
 * override any of them in the root .env:
 *   SEARCH_COMPANY_DISPLAY_NAME     Display Name of one company that others contain   (default "Affintus" - also "Affintus Placements")
 *   SEARCH_COMPANY_LEGAL_NAME       part of a Legal Name, not in that Display Name     (default "Diversified" -> Green Home Improvements)
 *   SEARCH_COMPANY_LEGAL_OWNER      that company's Display Name                        (default "Green Home Improvements")
 *   SEARCH_COMPANY_TRADE_NAME       part of a Trade Name                               (default "MojoVest")
 *   SEARCH_COMPANY_WEBSITE          part of a Website                                  (default "equinenetwork" -> Equine Network)
 *   SEARCH_COMPANY_WEBSITE_OWNER                                                       (default "Equine Network")
 *   SEARCH_COMPANY_EIN              a full EIN as stored (digits)                      (default "990354173" -> Xeo Software)
 *   SEARCH_COMPANY_EIN_OWNER                                                           (default "Xeo Software")
 *   SEARCH_COMPANY_ENTITY_TYPE      a CompanyEntityType in use                         (default "LLC")
 *   SEARCH_COMPANY_ROLE / _ROLE_2   CompanyRole names                                  (defaults "Client" / "Partner")
 *   SEARCH_COMPANY_CUSTOMER_ROLE    the role the spec calls "Customer" (4.6)           (default "Client" - the app has no "Customer" role)
 *   SEARCH_COMPANY_ACCOUNT_NAME / _ACCOUNT_NUMBER / _ACCOUNT_OWNER                     (defaults "Equine" / "1034" / "Equine Network")
 *   SEARCH_COMPANY_ACCOUNT_STATUS   an AccountStatus in use                            (default "Active")
 *   SEARCH_COMPANY_PERSON / _PERSON_COMPANY   affiliated Person and one of its companies (defaults "Kalpesh Patel" / "Xeo Software")
 *   SEARCH_COMPANY_PHONE_E164 / _PHONE_OWNER  PhoneNumber.NumberE164 of one company    (defaults "+19702366339" / "Xeo Software")
 *   SEARCH_COMPANY_ADDRESS          part of Address1 of company addresses              (default "Arion")
 *   SEARCH_COMPANY_ADDRESS2 / _ADDRESS2_OWNER  part of an Address2                     (defaults "Suite 101" / "Xeo Software")
 *   SEARCH_COMPANY_CITY / _REGION / _REGION_LINKED / _POSTAL_PREFIX                    (defaults "San Antonio" / "TX" / "Colorado" / "782")
 *   SEARCH_COMPANY_DELETED_NAME     DisplayName of a deleted company (IsDeleted = 1)   (no default - none in the sandbox; tests skipped)
 */
const MODULE = 'Company Search';
const ENTITY_ID = '3';
const e = (name, fallback = '') => process.env[`SEARCH_COMPANY_${name}`] || fallback;

const DATA = {
  displayName: e('DISPLAY_NAME', 'Affintus'),
  legalName: e('LEGAL_NAME', 'Diversified'),
  legalOwner: e('LEGAL_OWNER', 'Green Home Improvements'),
  tradeName: e('TRADE_NAME', 'MojoVest'),
  website: e('WEBSITE', 'equinenetwork'),
  websiteOwner: e('WEBSITE_OWNER', 'Equine Network'),
  ein: e('EIN', '990354173'),
  einOwner: e('EIN_OWNER', 'Xeo Software'),
  entityType: e('ENTITY_TYPE', 'LLC'),
  role: e('ROLE', 'Client'),
  role2: e('ROLE_2', 'Partner'),
  customerRole: e('CUSTOMER_ROLE', 'Client'),
  accountName: e('ACCOUNT_NAME', 'Equine'),
  accountNumber: e('ACCOUNT_NUMBER', '1034'),
  accountOwner: e('ACCOUNT_OWNER', 'Equine Network'),
  accountStatus: e('ACCOUNT_STATUS', 'Active'),
  person: e('PERSON', 'Kalpesh Patel'),
  personCompany: e('PERSON_COMPANY', 'Xeo Software'),
  phoneE164: e('PHONE_E164', '+19702366339'),
  phoneOwner: e('PHONE_OWNER', 'Xeo Software'),
  address: e('ADDRESS', 'Arion'),
  address2: e('ADDRESS2', 'Suite 101'),
  address2Owner: e('ADDRESS2_OWNER', 'Xeo Software'),
  city: e('CITY', 'San Antonio'),
  region: e('REGION', 'TX'),
  regionLinked: e('REGION_LINKED', 'Colorado'),
  postalPrefix: e('POSTAL_PREFIX', '782'),
  deletedName: e('DELETED_NAME'),
  // text no company matches (keyword + run tag keeps it unique)
  noMatch: `${env.keyword}NoSuchCompany${env.runTag.replace(/\D/g, '')}`,
};

/** Same digits as DATA.phoneE164, typed with spaces / brackets / dashes (input must be normalized to digits). */
const digits = DATA.phoneE164.replace(/\D/g, '');
DATA.phoneDigits = digits;
DATA.phoneLocal = digits.slice(-10); // national part only - a "Contains" match, never an "Equals" match
DATA.phoneDashed = `${DATA.phoneLocal.slice(0, 3)}-${DATA.phoneLocal.slice(3, 6)}-${DATA.phoneLocal.slice(6)}`;
DATA.phoneFormatted = `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;

/** Criteria of the Advanced Filters drawer (2.1 - 2.10), spec wording (the app uses sentence case - compared case-insensitively). */
const FILTER_LABELS = [
  'Display Name', 'Legal Name', 'Trade Name', 'Website', 'EIN', 'Company Entity Type', 'Company Role',
  'Account Name', 'Account Number', 'Account Status', 'Affiliated Person', 'Phone Number',
  'Address', 'City', 'Region', 'Postal Code', 'Include Deleted',
];

/**
 * Operators the spec requires per criterion (2, 3), by fieldId: shown default + operator keys that must be offered.
 * only = no other value operator may be offered (EIN: "Supported operators: Equals").
 */
const OPERATORS = {
  DisplayName: { def: /contains/i, must: ['contains'] },
  LegalName: { def: /contains/i, must: ['contains'] },
  TradeName: { def: /contains/i, must: ['contains'] },
  Website: { def: /contains/i, must: ['contains'] },
  EIN: { def: /^(is|equals)$/i, must: ['equals'], only: true },
  CompanyEntityTypeIDF: { def: /^(is|equals)$/i, must: ['equals'] },
  CompanyRoleIDF: { def: /is any of|^in$/i, must: ['in'] },
  AccountName: { def: /contains/i, must: ['contains'] },
  AccountNumber: { def: /^(is|equals)$/i, must: ['equals'] },
  AccountStatusIDF: { def: /^(is|equals)$/i, must: ['equals'] },
  PhoneNumber: { def: /contains/i, must: ['contains', 'equals'] },
  Address: { def: /contains/i, must: ['contains'] },
  City: { def: /contains/i, must: ['contains'] },
  Region: { def: /contains/i, must: ['contains'] },
  PostalCode: { def: /starts with|begins with/i, must: ['startsWith'] },
};

/** Quick Search (1): lower-case fieldIds the top-bar search sends, and the operator each must use. */
const QUICK_FIELDS = [
  ['displayName', 'contains'], ['legalName', 'contains'], ['tradeName', 'contains'], ['website', 'contains'],
  ['accountName', 'contains'], ['accountNumber', 'equals'], ['phoneNumber', 'contains'],
];

const MESSAGES = {
  selectFromList: /please select a value from the list/i,
  serverError: /exception|stack trace|sql|server error|something went wrong/i,
};

const tc = (no, def) => ({ id: `TC_COS_${String(no).padStart(3, '0')}`, ...def });

const cases = {
  // ================= 1. Quick Search =================
  quickScope: tc(1, {
    severity: 'critical', name: 'Quick Search with Record Type "Company" runs a company search',
    description: 'Verify the top-bar Quick Search offers the "Company" record type and evaluates the text against Display / Legal / Trade Name, Website, Account Name / Number and Phone (1).',
    condition: `Signed-in user; text "${DATA.displayName}" (several companies contain it).`,
    expected: 'Search page opens for entity 3 (Company); Contains on the names / website / account name / phone and Exact on the account number are sent; results are shown.',
  }),
  quickDisplayName: tc(2, {
    severity: 'critical', name: 'Quick Search matches Display Name with Contains',
    description: 'Verify part of a Display Name returns the companies whose Display Name contains it (1.1).',
    condition: `Text = "${DATA.displayName.slice(0, -1)}".`,
    expected: 'Results are returned; every row contains the text in a Quick Search field (case-insensitive).',
  }),
  quickLegalName: tc(3, {
    severity: 'critical', name: 'Quick Search matches Legal Name with Contains',
    description: 'Verify a company is found by part of its Legal Name only (1.1 Company.LegalName).',
    condition: `Text = "${DATA.legalName}" (in the Legal Name of "${DATA.legalOwner}", not in its Display Name).`,
    expected: `"${DATA.legalOwner}" is returned.`,
  }),
  quickTradeName: tc(4, {
    severity: 'critical', name: 'Quick Search matches Trade Name with Contains',
    description: 'Verify a company is found by part of its Trade Name (1.1 Company.TradeName).',
    condition: `Text = "${DATA.tradeName.slice(0, -1)}".`,
    expected: 'A company whose Trade Name contains the text is returned.',
  }),
  quickCase: tc(5, {
    severity: 'normal', name: 'Quick Search is case-insensitive',
    description: 'Verify lower-, upper- and mixed-case spellings of a company name return the same companies (general rule).',
    condition: `Text "${DATA.displayName}" in three spellings.`,
    expected: 'Same total and same companies for every spelling.',
  }),
  quickWebsite: tc(6, {
    severity: 'normal', name: 'Quick Search matches Website with Contains',
    description: 'Verify part of a website (the domain without "https://www.") finds the company (1.2).',
    condition: `Text = "${DATA.website}".`,
    expected: `"${DATA.websiteOwner}" is returned.`,
  }),
  quickAccountName: tc(7, {
    severity: 'critical', name: 'Quick Search matches an owned Account Name with Contains',
    description: 'Verify part of the name of an Account owned by the company finds that company (1.3 Account.AccountName).',
    condition: `Text = "${DATA.accountName.slice(0, -1)}" (Account "${DATA.accountName}" of "${DATA.accountOwner}").`,
    expected: `"${DATA.accountOwner}" is returned.`,
  }),
  quickAccountNumber: tc(8, {
    severity: 'critical', name: 'Quick Search matches an Account Number exactly',
    description: 'Verify the full Account Number of an owned Account finds the owning company (1.3 Exact Match).',
    condition: `Text = "${DATA.accountNumber}".`,
    expected: `"${DATA.accountOwner}" is returned.`,
  }),
  quickAccountNumberPartial: tc(9, {
    type: 'Negative', severity: 'normal', name: 'Quick Search does not match part of an Account Number',
    description: 'Verify a partial Account Number is not a match through the Account Number rule (1.3 Exact Match).',
    condition: `Text = "${DATA.accountNumber.slice(0, -1)}" (number without its last digit).`,
    expected: `"${DATA.accountOwner}" is not returned; accountNumber is sent with "equals" only.`,
  }),
  quickPhoneE164: tc(10, {
    severity: 'critical', name: 'Quick Search finds a company by phone (E.164)',
    description: 'Verify the full E.164 number finds the company (1.4 Contains on PhoneNumber.NumberE164).',
    condition: `Text = "${DATA.phoneE164}".`,
    expected: `"${DATA.phoneOwner}" is returned.`,
  }),
  quickPhoneFormatted: tc(11, {
    defect: `Quick Search does not strip non-numeric characters from a phone number (spec 1.4): "${DATA.phoneFormatted}" does not find ${DATA.phoneOwner}.`,
    severity: 'critical', name: 'Quick Search normalizes a formatted phone number',
    description: 'Verify spaces, brackets, dashes and "+" are stripped before matching (1.4).',
    condition: `Text = "${DATA.phoneFormatted}".`,
    expected: `"${DATA.phoneOwner}" is returned, as for "${DATA.phoneDigits}".`,
  }),
  quickPhonePartial: tc(12, {
    severity: 'normal', name: 'Quick Search matches part of a phone number (Contains)',
    description: 'Verify the national part of the number (without country code) matches (1.4 Contains).',
    condition: `Text = "${DATA.phoneLocal}".`,
    expected: `"${DATA.phoneOwner}" is returned.`,
  }),
  quickTextNotPhone: tc(13, {
    type: 'Negative', severity: 'normal', name: 'Quick Search text without digits does not match every phone',
    description: 'Verify letters only (empty after normalization) do not make every company with a phone match (1.4).',
    condition: `Text = "${DATA.displayName}".`,
    expected: 'Every row contains the text in a name, website or account field (none returned only through the phone).',
  }),
  quickEinIgnored: tc(14, {
    type: 'Negative', severity: 'normal', name: 'Quick Search does not evaluate EIN',
    description: 'Verify a full EIN is not matched by Quick Search (2.3 "EIN is not evaluated by Quick Search").',
    condition: `Text = "${DATA.ein}" (EIN of "${DATA.einOwner}", in no other field).`,
    expected: 'No EIN criterion is sent; the company is not returned.',
  }),
  quickDeleted: tc(15, {
    type: 'Negative', severity: 'critical', name: 'Quick Search excludes deleted companies',
    description: 'Verify companies with IsDeleted = 1 are never returned by Quick Search (1.5).',
    condition: 'SEARCH_COMPANY_DELETED_NAME set (a deleted company).',
    expected: 'The deleted company is not returned.',
  }),
  quickNoMatch: tc(16, {
    type: 'Negative', severity: 'normal', name: 'Quick Search with text no company matches',
    description: 'Verify a "no results" state is shown (no error) when nothing matches.',
    condition: `Text = "${DATA.noMatch}".`,
    expected: 'HTTP 200, 0 results, no error.',
  }),
  quickXss: tc(17, {
    type: 'Negative', severity: 'critical', name: 'Quick Search with a script tag is not executed',
    description: 'Verify the text is treated as data, not markup.',
    condition: 'Text = "<script>alert(1)</script>".',
    expected: 'No dialog opens; no server error; no company matches.',
  }),
  quickSql: tc(18, {
    type: 'Negative', severity: 'critical', name: 'Quick Search with SQL injection text',
    description: 'Verify SQL meta-characters are parameterized.',
    condition: "Text = \"' OR 1=1 --\".",
    expected: 'HTTP 200, no SQL error text, no company returned.',
  }),
  quickEmpty: tc(19, {
    type: 'Negative', severity: 'minor', name: 'Quick Search with empty text',
    description: 'Verify an empty Quick Search does not error.',
    condition: 'Text = "".',
    expected: 'No search is run (or it runs without error); no server error; page still usable.',
  }),

  // ================= 2. Advanced Search =================
  advOpen: tc(20, {
    severity: 'critical', name: 'Advanced Filters drawer lists every Company criterion',
    description: 'Verify the drawer shows all criteria of section 2 and Country is not exposed (2.9).',
    condition: 'Company search opened from the Quick Search filter icon; every section expanded.',
    expected: `Criteria present: ${FILTER_LABELS.join(', ')}; no Country criterion.`,
  }),
  advOperators: tc(21, {
    severity: 'normal', name: 'Each criterion offers the spec operators with the right default',
    description: 'Verify operator lists and defaults per criterion (2, 3).',
    condition: 'Advanced Filters open.',
    expected: 'Names / Website / Account Name / Address / City / Region: Contains; EIN: Equals only; Entity Type / Account Number / Account Status: Equals; Phone: Contains (default) + Equals; Postal Code: Begins With; Company Role: In.',
  }),
  displayName: tc(22, {
    severity: 'critical', name: 'Display Name Contains', fieldId: 'DisplayName', column: 'Display Name', value: DATA.displayName,
    description: 'Verify every returned company\'s Display Name contains the text (2.1).',
    condition: `Display Name = "${DATA.displayName}".`, expected: 'Results returned; every row\'s Display Name contains the text.',
  }),
  legalName: tc(23, {
    severity: 'critical', name: 'Legal Name Contains', fieldId: 'LegalName', column: 'Legal Name', value: DATA.legalName,
    description: 'Verify every returned company\'s Legal Name contains the text (2.1).',
    condition: `Legal Name = "${DATA.legalName}".`, expected: 'Results returned; every row\'s Legal Name contains the text.',
  }),
  tradeName: tc(24, {
    severity: 'critical', name: 'Trade Name Contains', fieldId: 'TradeName', column: 'Trade Name', value: DATA.tradeName,
    description: 'Verify every returned company\'s Trade Name contains the text (2.1).',
    condition: `Trade Name = "${DATA.tradeName}".`, expected: 'Results returned; every row\'s Trade Name contains the text.',
  }),
  nameCase: tc(25, {
    severity: 'normal', name: 'Name criteria are case-insensitive',
    description: 'Verify upper / lower case Display Name return the same companies.',
    condition: `Display Name = "${DATA.displayName.toUpperCase()}" vs "${DATA.displayName.toLowerCase()}".`,
    expected: 'Same total and same Record IDs.',
  }),
  website: tc(26, {
    severity: 'normal', name: 'Website Contains', fieldId: 'Website', column: 'Website', value: DATA.website,
    description: 'Verify every returned company\'s Website contains the text (2.2).',
    condition: `Website = "${DATA.website}".`,
    expected: 'Results returned; every row\'s Website contains the text.',
  }),
  einEquals: tc(27, {
    severity: 'critical', name: 'EIN Equals returns the company with that EIN',
    description: 'Verify a full EIN returns exactly the company with that EIN (2.3).',
    condition: `EIN = "${DATA.ein}" (EIN of "${DATA.einOwner}").`,
    expected: `Only "${DATA.einOwner}" is returned.`,
  }),
  einPartial: tc(28, {
    type: 'Negative', severity: 'normal', name: 'EIN Equals does not match part of an EIN',
    description: 'Verify a partial EIN returns nothing (2.3 Equals only).',
    condition: `EIN = "${DATA.ein.slice(0, -1)}" (full EIN without its last digit).`,
    expected: '0 results.',
  }),
  entityType: tc(29, {
    severity: 'normal', name: 'Company Entity Type Equals',
    description: 'Verify the Entity Type dropdown sends Equals on the selected type and returns its companies (2.4).',
    condition: `Entity Type = "${DATA.entityType}".`,
    expected: 'Equals sent with the type\'s id; results returned; same companies as the server holds for that type.',
  }),
  entityTypeActiveOnly: tc(30, {
    type: 'Negative', severity: 'normal', name: 'Company Entity Type offers each active type once',
    description: 'Verify the dropdown lists the active CompanyEntityType records only, no duplicates or empty entries (2.4).',
    condition: 'Advanced Filters open.',
    expected: 'Every option has a value and appears once.',
  }),
  role: tc(31, {
    severity: 'critical', name: 'Company Role In (single role)',
    description: 'Verify the companies holding the selected role through CompanyRoleAssignment are returned (2.5).',
    condition: `Company Role = "${DATA.role}".`,
    expected: '"in" sent with the role id; results returned.',
  }),
  roleMulti: tc(32, {
    severity: 'critical', name: 'Company Role In (several roles)',
    description: 'Verify selecting two roles returns companies having either role (2.5 In).',
    condition: `Company Role = "${DATA.role}" + "${DATA.role2}".`,
    expected: 'Result = union of the two single-role searches.',
  }),
  roleActiveOnly: tc(33, {
    type: 'Negative', severity: 'normal', name: 'Company Role offers each active role once',
    description: 'Verify the role list holds the active CompanyRole records only, no duplicates or empty entries (2.5).',
    condition: 'Advanced Filters open.',
    expected: 'Every option has a value and appears once.',
  }),
  roleNone: tc(34, {
    type: 'Negative', severity: 'minor', name: 'Company Role with nothing selected does not filter',
    description: 'Verify the role criterion is not sent when no role is chosen (all criteria optional).',
    condition: `Display Name = "${DATA.displayName}"; Company Role untouched.`,
    expected: 'No CompanyRoleIDF criterion sent; same companies as Display Name alone.',
  }),
  accountName: tc(35, {
    severity: 'critical', name: 'Account Name Contains (owned Account)', fieldId: 'AccountName', column: 'Account Name', value: DATA.accountName,
    description: 'Verify companies owning an Account whose name contains the text are returned (2.6).',
    condition: `Account Name = "${DATA.accountName}".`,
    expected: `Results returned, including "${DATA.accountOwner}".`,
  }),
  accountNumber: tc(36, {
    severity: 'critical', name: 'Account Number Equals (owned Account)',
    description: 'Verify the full Account Number returns the owning company (2.6).',
    condition: `Account Number = "${DATA.accountNumber}".`,
    expected: `"${DATA.accountOwner}" is returned.`,
  }),
  accountNumberPartial: tc(37, {
    type: 'Negative', severity: 'normal', name: 'Account Number Equals does not match part of a number',
    description: 'Verify a partial Account Number returns nothing (2.6 Equals).',
    condition: `Account Number = "${DATA.accountNumber.slice(0, -1)}".`,
    expected: `"${DATA.accountOwner}" is not returned.`,
  }),
  accountStatus: tc(38, {
    severity: 'normal', name: 'Account Status Equals',
    description: 'Verify companies owning an Account with the selected status are returned (2.6).',
    condition: `Account Status = "${DATA.accountStatus}".`,
    expected: `Equals sent; results returned, including "${DATA.accountOwner}" (its Account is ${DATA.accountStatus}).`,
  }),
  accountCombined: tc(39, {
    severity: 'normal', name: 'Account Name and Account Number evaluate the same owned Account',
    description: 'Verify Account Name + Account Number of the same Account return its owner (2.6).',
    condition: `Account Name = "${DATA.accountName}", Account Number = "${DATA.accountNumber}".`,
    expected: `"${DATA.accountOwner}" is returned; every row is also in the Account Number search.`,
  }),
  affiliatedPerson: tc(40, {
    severity: 'normal', name: 'Affiliated Person returns the person\'s companies',
    description: 'Verify companies affiliated with the selected Person through Affiliation are returned (2.7).',
    condition: `Affiliated Person = "${DATA.person}" (picked from the lookup).`,
    expected: `"${DATA.personCompany}" is returned; fewer companies than without the criterion.`,
  }),
  phoneContains: tc(41, {
    defect: `Advanced Phone Number does not strip non-numeric characters before matching (spec 2.8): "${DATA.phoneDashed}" with Contains returns nobody.`,
    severity: 'critical', name: 'Phone Number Contains with formatted input',
    description: 'Verify non-numeric characters are stripped and Contains is the default (2.8).',
    condition: `Phone = "${DATA.phoneDashed}", operator default.`,
    expected: `"${DATA.phoneOwner}" is returned.`,
  }),
  phoneEquals: tc(42, {
    defect: `Advanced Phone Number Equals does not normalize a formatted number (spec 2.8): "${DATA.phoneFormatted}" returns nobody.`,
    severity: 'critical', name: 'Phone Number Equals with the full number',
    description: 'Verify Equals matches the full E.164 number typed with formatting (2.8).',
    condition: `Phone Equals "${DATA.phoneFormatted}".`,
    expected: `Only "${DATA.phoneOwner}" is returned.`,
  }),
  phoneEqualsPartial: tc(43, {
    type: 'Negative', severity: 'normal', name: 'Phone Number Equals with only part of the number',
    description: 'Verify Equals does not match a partial number (2.8).',
    condition: `Phone Equals "${DATA.phoneLocal}".`,
    expected: `"${DATA.phoneOwner}" is not returned.`,
  }),
  phoneLetters: tc(44, {
    type: 'Negative', severity: 'normal', name: 'Phone Number with letters only',
    description: 'Verify letters (empty after normalization) do not match every phone.',
    condition: 'Phone = "abcdef".', expected: 'No company returned; no server error.',
  }),
  address: tc(45, {
    severity: 'normal', name: 'Address Contains (Address1 / Address2)',
    description: 'Verify text in Address1 or Address2 of a company-level address matches (2.9).',
    condition: `Address = "${DATA.address}" (Address1) and "${DATA.address2}" (Address2 of "${DATA.address2Owner}").`,
    expected: `Both return companies; "${DATA.address2Owner}" is returned for the Address2 text.`,
  }),
  city: tc(46, {
    severity: 'normal', name: 'City Contains', fieldId: 'City', column: 'City', value: DATA.city,
    description: 'Verify companies with a company-level address in the city are returned (2.9).',
    condition: `City = "${DATA.city.toLowerCase()}".`,
    expected: 'Results returned; every row\'s City contains the text.',
  }),
  region: tc(47, {
    severity: 'normal', name: 'Region Contains (RegionNameText or Region.RegionName)',
    description: 'Verify the region matches free-text regions and linked Region records (2.9).',
    condition: `Region = "${DATA.region}", then "${DATA.regionLinked}" (address linked to a Region record).`,
    expected: `Both return companies; every row\'s Region contains "${DATA.region}" for the first search.`,
  }),
  postal: tc(48, {
    severity: 'normal', name: 'Postal Code Begins With',
    description: 'Verify the postal code prefix matches and a middle part does not (2.9 BeginsWith).',
    condition: `Postal Code = "${DATA.postalPrefix}", then "${DATA.postalPrefix.slice(1)}".`,
    expected: 'Every row\'s postal code starts with the prefix; the inner digits match none of those codes.',
  }),
  noCountry: tc(49, {
    type: 'Negative', severity: 'minor', name: 'Country is not exposed as a criterion',
    description: 'Verify the Address section has no Country criterion (2.9 "Country is not separately exposed").',
    condition: 'Advanced Filters open, Address section expanded.',
    expected: 'No criterion labelled Country.',
  }),
  includeDeletedDefault: tc(50, {
    severity: 'critical', name: 'Include Deleted is OFF by default',
    description: 'Verify the toggle defaults to OFF and deleted companies are excluded (2.10).',
    condition: 'Advanced Filters opened fresh; Display Name set.',
    expected: 'Toggle OFF; IsArchived = false (or absent) is sent.',
  }),
  includeDeletedOn: tc(51, {
    defect: 'Include Deleted ON returns only deleted companies (0 in the sandbox) instead of adding them to the active ones (spec 2.10).',
    severity: 'critical', name: 'Include Deleted ON adds deleted companies to active ones',
    description: 'Verify ON includes deleted companies without removing active ones (2.10).',
    condition: `Display Name = "${DATA.displayName}"; toggle ON.`,
    expected: 'Total ON >= total OFF; every company of the OFF search is in the ON search.',
  }),
  includeDeletedCompany: tc(52, {
    severity: 'normal', name: 'Include Deleted ON returns a deleted company',
    description: 'Verify a known deleted company is returned only with the toggle ON (2.10).',
    condition: 'SEARCH_COMPANY_DELETED_NAME set.',
    expected: 'Not returned with OFF; returned with ON.',
  }),
  combined: tc(53, {
    severity: 'normal', name: 'Several criteria are combined with AND',
    description: 'Verify City + Company Role returns the intersection of the two single searches.',
    condition: `City = "${DATA.city}" and Company Role = "${DATA.role}".`,
    expected: 'Result = intersection of the two single-criterion results.',
  }),
  reset: tc(54, {
    severity: 'minor', name: 'Reset clears every criterion',
    description: 'Verify Reset empties the drawer and Include Deleted returns to OFF.',
    condition: 'Several criteria set.', expected: 'All criteria empty; toggle OFF.',
  }),
  advEmpty: tc(55, {
    type: 'Negative', severity: 'minor', name: 'Apply with no criteria',
    description: 'Verify Apply with nothing set does not error (all criteria optional).',
    condition: 'All criteria empty.', expected: 'No server error; page still usable.',
  }),

  // ================= 4. Result Ordering =================
  orderAccountNumber: tc(56, {
    severity: 'normal', name: 'Exact Account Number match is ranked first',
    description: 'Verify the company owning the exact Account Number is first (4.1).',
    condition: `Quick Search "${DATA.accountNumber}".`, expected: `"${DATA.accountOwner}" is row 1 (or opened directly).`,
  }),
  orderDisplayName: tc(57, {
    severity: 'normal', name: 'Exact Display Name match ranks above partial matches',
    description: 'Verify exact Display Name matches come before Contains matches (4.2).',
    condition: `Quick Search "${DATA.displayName}" (other companies contain it).`,
    expected: `"${DATA.displayName}" is above every company that only contains the text.`,
  }),
  orderNameTiers: tc(58, {
    severity: 'normal', name: 'Exact-match tiers are never ranked below partial matches',
    description: 'Verify rows follow the tiers: Account Number > Display > Legal > Trade > Phone exact > others (4.1 - 4.5).',
    condition: `Quick Search "${DATA.displayName}" and "${DATA.accountNumber}".`,
    expected: 'The tier of every row is >= the tier of the row before it.',
  }),
  orderPhone: tc(59, {
    severity: 'normal', name: 'Exact Phone Number match is ranked first among phone matches',
    description: 'Verify the company whose E.164 equals the input is ranked first (4.5).',
    condition: `Quick Search "${DATA.phoneE164}".`, expected: `"${DATA.phoneOwner}" is row 1 (or opened directly).`,
  }),
  orderCustomer: tc(60, {
    defect: `Companies with the "${DATA.customerRole}" (Customer) role are not ranked before the others (spec 4.6): results are alphabetical only.`,
    severity: 'normal', name: 'Companies with the Customer role rank before others',
    description: `Verify among non-exact matches, companies with the "${DATA.customerRole}" role come first (4.6; the app has no "Customer" role).`,
    condition: `Display Name contains a text matching "${DATA.customerRole}" and non-"${DATA.customerRole}" companies.`,
    expected: `Every "${DATA.customerRole}" company precedes every other company.`,
  }),
  orderAlpha: tc(61, {
    severity: 'normal', name: 'Remaining results are alphabetical by Display Name',
    description: 'Verify within the same tier results are sorted by Display Name A-Z (4.7).',
    condition: 'Same search as the Customer ordering; each role group compared on its own.',
    expected: 'Rows of each group are in ascending Display Name order (case-insensitive).',
  }),
  paging: tc(62, {
    severity: 'normal', name: 'Pagination is stable: no duplicate or missing rows',
    description: 'Verify page 2 continues page 1 with no duplicates.',
    condition: `Company Role = "${DATA.role}" (more than one page).`, expected: 'No Record ID on both pages; total unchanged.',
  }),

  // ================= 5. Presets =================
  presetCustomer: tc(63, {
    defect: 'The "Customer companies" preset is configured for the Company entity but no preset control is rendered on the search page (spec 5.1).',
    severity: 'critical', name: 'Preset "Customer Companies" returns companies with an Active Account',
    description: 'Verify the default preset is offered and returns only companies owning an Account with AccountStatus = Active (5.1).',
    condition: 'Company search page; Advanced Filters open.',
    expected: 'A "Customer companies" preset is shown; applying it returns the same companies as Account Status = Active.',
  }),
  presetCustomerDeleted: tc(64, {
    defect: 'The "Customer companies" preset is configured for the Company entity but no preset control is rendered on the search page (spec 5.1).',
    type: 'Negative', severity: 'normal', name: 'Preset "Customer Companies" excludes deleted companies',
    description: 'Verify the preset never returns IsDeleted = 1 companies (5.1).',
    condition: 'Preset applied.',
    expected: 'IsArchived = false (or absent) in the preset criteria; the deleted company (if configured) is not returned.',
  }),

  // ================= results / permissions =================
  resultsView: tc(65, {
    severity: 'normal', name: 'Results show the company and open the Company record',
    description: 'Verify the results show the returned companies and a result opens its Company record.',
    condition: `Display Name = "${DATA.displayName}".`, expected: '"Results:" equals the total; opening the first result lands on /Company/Edit/<id>.',
  }),
  permission: tc(66, {
    severity: 'critical', name: 'Only companies the user may view are returned',
    description: 'Verify every returned company is allowed for the signed-in user.',
    condition: `Company Role = "${DATA.role}".`, expected: 'Every row is marked allowed.',
  }),
};

module.exports = { MODULE, ENTITY_ID, DATA, FILTER_LABELS, OPERATORS, QUICK_FIELDS, MESSAGES, cases };
