const { env } = require('../utils/testData');

/**
 * 62828 Stratym Entity Search Specification - Account.
 * Quick Search = top-bar search with Record Type "Account"; Advanced Search = /Search?entityId=1 + Advanced Filters.
 * Search is read-only: no records are created. The values below exist in the sandbox (checked 2026-11-12);
 * override any of them in the root .env:
 *   SEARCH_ACCOUNT_NAME              Account Name that other accounts contain          (default "Vault" - also "Vault Prequal", "iOS Vault")
 *   SEARCH_ACCOUNT_NAME_PART         part of several Account Names                     (default "Vaul")
 *   SEARCH_ACCOUNT_NUMBER / _NUMBER_NAME   an Account Number and its Account Name       (defaults "1034" / "Equine")
 *   SEARCH_ACCOUNT_NUMBER_PART       digits inside several Account Numbers             (default "103" - also a Record ID, so not used in Quick Search)
 *   SEARCH_ACCOUNT_STATUS / _STATUS_2   AccountStatus names in use                     (defaults "Active" / "Prospect")
 *   SEARCH_ACCOUNT_OWNER_COMPANY     DisplayName of a Company that owns several accounts (default "Equine Network")
 *   SEARCH_ACCOUNT_OWNER_LEGAL / _LEGAL_ACCOUNT   part of an owner's Legal Name only   (defaults "Diversified" / "DLG" - Green Home Improvements = "DLG Diversified LLC")
 *   SEARCH_ACCOUNT_OWNER_TRADE / _TRADE_ACCOUNT   part of an owner's Trade Name only   (no default - no owner has a Trade Name different from its Display Name)
 *   SEARCH_ACCOUNT_OWNER_PERSON / _PERSON_FIRST / _PERSON_LAST   a Person owner         (defaults "Nora Fleming" / "Nora" / "Fleming")
 *   SEARCH_ACCOUNT_OWNER_EXACT       owner Display Name that no Account Name equals     (default "Slick" - also in the name "Slick App" of an Xeo account)
 *   SEARCH_ACCOUNT_PHONE_E164 / _PHONE_OWNER   PhoneNumber.NumberE164 of an owner       (defaults "+19702366339" / "Xeo Software")
 *   SEARCH_ACCOUNT_ADDRESS           part of billing Address1                          (default "Manhattan")
 *   SEARCH_ACCOUNT_CITY / _REGION / _REGION_LINKED / _POSTAL_PREFIX                    (defaults "Fort Collins" / "TX" / "Colorado" / "782")
 *   SEARCH_ACCOUNT_COUNTRY / _COUNTRY_2                                                (defaults "United States of America" / "Canada")
 *   SEARCH_ACCOUNT_OWN_BILLING_NAME / _OWN_BILLING_ADDR / _OWNER_BILLING_ADDR   account with its own billing address (BillingAddressIDF set),
 *       its address, and its owner's (not used) billing address  (defaults "Acct Upd Address" / "1100 Congress" / "600 Congress")
 *   SEARCH_ACCOUNT_INHERIT_NAME / _INHERIT_ADDR   account using its owner's billing address (BillingAddressIDF null)
 *       (defaults "Acct Owner Billing" / "901 Bagby")
 *   SEARCH_ACCOUNT_DELETED_NAME      part of the name of deleted accounts (IsDeleted = 1) (default "Acct Delete")
 * The Playwright-created accounts above come from account.spec / account-update.spec; the dependent tests skip when
 * none exist.
 */
const MODULE = 'Account Search';
const ENTITY_ID = '1';
const e = (name, fallback = '') => process.env[`SEARCH_ACCOUNT_${name}`] || fallback;

const DATA = {
  accountName: e('NAME', 'Vault'),
  accountNamePart: e('NAME_PART', 'Vaul'),
  accountNumber: e('NUMBER', '1034'),
  accountNumberName: e('NUMBER_NAME', 'Equine'),
  accountNumberPart: e('NUMBER_PART', '103'),
  status: e('STATUS', 'Active'),
  status2: e('STATUS_2', 'Prospect'),
  ownerCompany: e('OWNER_COMPANY', 'Equine Network'),
  ownerLegal: e('OWNER_LEGAL', 'Diversified'),
  ownerLegalAccount: e('OWNER_LEGAL_ACCOUNT', 'DLG'),
  ownerTrade: e('OWNER_TRADE'),
  ownerTradeAccount: e('OWNER_TRADE_ACCOUNT'),
  ownerPerson: e('OWNER_PERSON', 'Nora Fleming'),
  ownerPersonFirst: e('OWNER_PERSON_FIRST', 'Nora'),
  ownerPersonLast: e('OWNER_PERSON_LAST', 'Fleming'),
  ownerExact: e('OWNER_EXACT', 'Slick'),
  phoneE164: e('PHONE_E164', '+19702366339'),
  phoneOwner: e('PHONE_OWNER', 'Xeo Software'),
  address: e('ADDRESS', 'Manhattan'),
  city: e('CITY', 'Fort Collins'),
  region: e('REGION', 'TX'),
  regionLinked: e('REGION_LINKED', 'Colorado'),
  postalPrefix: e('POSTAL_PREFIX', '782'),
  country: e('COUNTRY', 'United States of America'),
  country2: e('COUNTRY_2', 'Canada'),
  ownBillingName: e('OWN_BILLING_NAME', 'Acct Upd Address'),
  ownBillingAddr: e('OWN_BILLING_ADDR', '1100 Congress'),
  ownerBillingAddr: e('OWNER_BILLING_ADDR', '600 Congress'),
  inheritName: e('INHERIT_NAME', 'Acct Owner Billing'),
  inheritAddr: e('INHERIT_ADDR', '901 Bagby'),
  deletedName: e('DELETED_NAME', 'Acct Delete'),
  // Account Name text matched by more accounts than one grid page (page size can be 100)
  pagingText: e('PAGING_TEXT', 'a'),
  // text no account matches (keyword + run tag keeps it unique)
  noMatch: `${env.keyword}NoSuchAccount${env.runTag.replace(/\D/g, '')}`,
};

/** Same digits as DATA.phoneE164, typed with spaces / brackets / dashes (input must be normalized to digits). */
const digits = DATA.phoneE164.replace(/\D/g, '');
DATA.phoneDigits = digits;
DATA.phoneLocal = digits.slice(-10); // national part only - a "Contains" match, never an "Equals" match
DATA.phoneDashed = `${DATA.phoneLocal.slice(0, 3)}-${DATA.phoneLocal.slice(3, 6)}-${DATA.phoneLocal.slice(6)}`;
DATA.phoneFormatted = `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;

/** Criteria of the Advanced Filters drawer (5.2.1 - 5.2.6), spec wording (the app uses sentence case - compared case-insensitively). */
const FILTER_LABELS = [
  'Account Name', 'Account Number', 'Account Status', 'Account Owner',
  'Billing Address', 'Billing City', 'Billing Region', 'Billing Postal Code', 'Billing Country',
  'Phone Number', 'Include Deleted',
];

/** Criteria the spec forbids as defaults (5.2.2 status behaviour flags, 5.2.3 split owner, 5.5 admin fields). */
const EXCLUDED_LABELS = [
  /active status/i, /terminal status/i, /blocks? new work/i, /blocks? billing/i, /blocks? customer access/i,
  /rate ?card/i, /time ?zone/i, /payment term/i, /billing type/i, /company owner/i, /person owner/i,
];

/**
 * Operators the spec requires per criterion (5.2, 5.4), by fieldId: shown default + operator keys that must be offered.
 */
const OPERATORS = {
  AccountName: { def: /contains/i, must: ['contains', 'equals'] },
  AccountNumber: { def: /^(is|equals)$/i, must: ['equals', 'contains'] },
  AccountStatusIDF: { def: /is any of|^in$/i, must: ['in', 'equals'] },
  AccountOwner: { def: /contains/i, must: ['contains', 'equals'] },
  BillingAddress: { def: /contains/i, must: ['contains', 'equals'] },
  BillingCity: { def: /contains/i, must: ['contains', 'equals'] },
  BillingRegion: { def: /contains/i, must: ['contains', 'equals'] },
  BillingPostalCode: { def: /starts with|begins with/i, must: ['startsWith', 'equals', 'contains'] },
  BillingCountryIDF: { def: /^(is|equals)$/i, must: ['equals', 'in'] },
  PhoneNumber: { def: /contains/i, must: ['contains', 'equals'] },
};

/** Quick Search (6.2): fieldIds the top-bar search must send, with the operators each must use. */
const QUICK_FIELDS = [
  ['AccountName', 'contains'], ['AccountNumber', 'equals'], ['AccountOwner', 'contains'], ['PhoneNumber', 'contains'],
];

const MESSAGES = {
  serverError: /exception|stack trace|sql|server error|something went wrong/i,
};

const tc = (no, def) => ({ id: `TC_ACS_${String(no).padStart(3, '0')}`, ...def });

const cases = {
  // ================= 6. Quick Search =================
  quickScope: tc(1, {
    severity: 'critical', name: 'Quick Search with Record Type "Account" runs an account search',
    description: 'Verify the top-bar Quick Search offers the "Account" record type and evaluates the text against Account Name, Account Number, Account Owner and Phone Number (6.2).',
    condition: `Signed-in user; text "${DATA.accountName}".`,
    expected: 'Search runs for entity 1 (Account); Account Name / Owner / Phone with Contains and Account Number with Equals are sent; results are shown.',
  }),
  quickAccountName: tc(2, {
    severity: 'critical', name: 'Quick Search matches Account Name with Contains',
    description: 'Verify part of an Account Name returns the accounts whose name contains it (6.2.1).',
    condition: `Text = "${DATA.accountNamePart}".`,
    expected: 'Every account whose Account Name contains the text is returned.',
  }),
  quickAccountNumber: tc(3, {
    severity: 'critical', name: 'Quick Search matches Account Number exactly',
    description: 'Verify the full Account Number finds its account (6.2.1 Exact Match).',
    condition: `Text = "${DATA.accountNumber}" (Account "${DATA.accountNumberName}").`,
    expected: `"${DATA.accountNumberName}" is returned (or opened directly).`,
  }),
  quickOwnerCompany: tc(4, {
    severity: 'critical', name: 'Quick Search matches a Company owner name',
    description: 'Verify the Display Name of the owning Company finds every account it owns (6.2.2).',
    condition: `Text = "${DATA.ownerCompany}" (in no Account Name).`,
    expected: `Every account owned by "${DATA.ownerCompany}" is returned.`,
  }),
  quickOwnerLegal: tc(5, {
    defect: `Account Owner ignores Company.LegalName (spec 5.2.3 / 6.2.2): "${DATA.ownerLegal}" (Legal Name of the owner of ${DATA.ownerLegalAccount}) returns nothing.`,
    severity: 'normal', name: 'Quick Search matches the owner Company Legal Name',
    description: 'Verify part of the owning Company\'s Legal Name finds its account (6.2.2 / 5.2.3 Company.LegalName).',
    condition: `Text = "${DATA.ownerLegal}" (only in the owner's Legal Name).`,
    expected: `Account "${DATA.ownerLegalAccount}" is returned.`,
  }),
  quickOwnerPerson: tc(6, {
    severity: 'critical', name: 'Quick Search matches a Person owner name',
    description: 'Verify the last name of the owning Person finds that person\'s accounts (6.2.2 Person name fields).',
    condition: `Text = "${DATA.ownerPersonLast}" (Person "${DATA.ownerPerson}").`,
    expected: `Every account owned by "${DATA.ownerPerson}" is returned.`,
  }),
  quickPhone: tc(7, {
    defect: `Account phone search returns no account for any value (spec 6.2.3): owner phone numbers are not joined - "${DATA.phoneE164}" finds none of the ${DATA.phoneOwner} accounts.`,
    severity: 'critical', name: 'Quick Search finds accounts by the owner phone (E.164)',
    description: 'Verify the full E.164 number of the owner finds the owner\'s accounts (6.2.3).',
    condition: `Text = "${DATA.phoneE164}" (phone of "${DATA.phoneOwner}").`,
    expected: `Accounts owned by "${DATA.phoneOwner}" are returned.`,
  }),
  quickPhoneFormatted: tc(8, {
    defect: `Account phone search returns no account for any value (spec 6.2.3): owner phone numbers are not joined - "${DATA.phoneFormatted}" finds none of the ${DATA.phoneOwner} accounts.`,
    severity: 'critical', name: 'Quick Search normalizes a formatted phone number',
    description: 'Verify spaces, brackets, dashes and "+" are stripped before matching (6.2.3).',
    condition: `Text = "${DATA.phoneFormatted}".`,
    expected: `Accounts owned by "${DATA.phoneOwner}" are returned, as for "${DATA.phoneDigits}".`,
  }),
  quickStatusNeutral: tc(9, {
    type: 'Negative', severity: 'critical', name: 'Quick Search does not search Account Status',
    description: 'Verify Quick Search is status-neutral: a status name does not return accounts merely because of their status (4.2).',
    condition: 'Text = "Inactive".',
    expected: 'No AccountStatus criterion is sent; no account is returned only because its status is Inactive.',
  }),
  quickCase: tc(10, {
    severity: 'normal', name: 'Quick Search is case-insensitive',
    description: 'Verify lower-, upper- and mixed-case spellings return the same accounts (5.4).',
    condition: `Text "${DATA.ownerCompany}" in three spellings.`,
    expected: 'Same total and same accounts for every spelling.',
  }),
  quickDeleted: tc(11, {
    type: 'Negative', severity: 'critical', name: 'Quick Search excludes deleted accounts',
    description: 'Verify accounts with IsDeleted = 1 are never returned by Quick Search (6.2.4).',
    condition: `Text = "${DATA.deletedName}" (name part of deleted accounts).`,
    expected: 'No deleted account is returned.',
  }),
  quickNoMatch: tc(12, {
    type: 'Negative', severity: 'normal', name: 'Quick Search with text no account matches',
    description: 'Verify a "no results" state is shown (no error) when nothing matches.',
    condition: `Text = "${DATA.noMatch}".`,
    expected: 'HTTP 200, 0 results, no error.',
  }),
  quickXss: tc(13, {
    type: 'Negative', severity: 'critical', name: 'Quick Search with a script tag is not executed',
    description: 'Verify the text is treated as data, not markup.',
    condition: 'Text = "<script>alert(1)</script>".',
    expected: 'No dialog opens; no server error; no account matches.',
  }),
  quickSql: tc(14, {
    type: 'Negative', severity: 'critical', name: 'Quick Search with SQL injection text',
    description: 'Verify SQL meta-characters are parameterized.',
    condition: "Text = \"' OR 1=1 --\".",
    expected: 'HTTP 200, no SQL error text, no account returned.',
  }),
  quickEmpty: tc(15, {
    type: 'Negative', severity: 'minor', name: 'Quick Search with empty text',
    description: 'Verify an empty Quick Search does not error.',
    condition: 'Text = "".',
    expected: 'No search is run (or it runs without error); no server error; page still usable.',
  }),

  // ================= 6.3 Relevance ordering =================
  orderAccountNumber: tc(16, {
    severity: 'normal', name: 'Exact Account Number match is ranked first',
    description: 'Verify the account whose number equals the text is first (6.3 rule 1).',
    condition: `Quick Search "${DATA.accountNumber}".`, expected: `"${DATA.accountNumberName}" is row 1 (or opened directly).`,
  }),
  orderAccountName: tc(17, {
    defect: `Quick Search results are alphabetical only, not by relevance (spec 6.3): "iOS Vault" / "Mobile Vault" are ranked above the exact match "${DATA.accountName}".`,
    severity: 'normal', name: 'Exact Account Name match ranks above Contains matches',
    description: 'Verify the exact Account Name match comes before accounts that only contain the text (6.3 rules 2, 5).',
    condition: `Quick Search "${DATA.accountName}" (other accounts contain it).`,
    expected: `"${DATA.accountName}" is above every account that only contains the text.`,
  }),
  orderOwnerExact: tc(18, {
    defect: `Quick Search results are alphabetical only, not by relevance (spec 6.3): "Slick App" (name contains) is ranked above accounts owned by "${DATA.ownerExact}".`,
    severity: 'normal', name: 'Exact Account Owner match ranks above Account Name contains matches',
    description: 'Verify accounts whose owner name equals the text come before accounts whose name only contains it (6.3 rules 3, 5).',
    condition: `Quick Search "${DATA.ownerExact}" (owner of several accounts; also inside other Account Names).`,
    expected: `Every account owned by "${DATA.ownerExact}" precedes every account that only contains the text in its name.`,
  }),
  orderTiers: tc(19, {
    defect: `Quick Search results are alphabetical only, not by relevance (spec 6.3 rules 1 - 7).`,
    severity: 'normal', name: 'Rows follow the relevance tiers',
    description: 'Verify rows follow: Number exact > Name exact > Owner exact > Phone exact > Name contains > Owner contains > Phone contains (6.3).',
    condition: `Quick Search "${DATA.accountName}", "${DATA.ownerExact}", "${DATA.ownerCompany}".`,
    expected: 'The tier of every row is >= the tier of the row before it.',
  }),
  orderAlpha: tc(20, {
    severity: 'normal', name: 'Rows of the same tier are alphabetical by Account Name',
    description: 'Verify within the same tier results are sorted by Account Name A-Z (6.3 rule 8).',
    condition: `Quick Search "${DATA.ownerCompany}" (all rows: owner exact).`,
    expected: 'Rows of each tier are in ascending Account Name order (case-insensitive).',
  }),

  // ================= 5. Advanced Search =================
  advOpen: tc(21, {
    severity: 'critical', name: 'Advanced Filters drawer lists every Account criterion',
    description: 'Verify the drawer shows all criteria of section 5.2.',
    condition: 'Account search opened from the Quick Search filter icon; every section expanded.',
    expected: `Criteria present: ${FILTER_LABELS.join(', ')}.`,
  }),
  advExcluded: tc(22, {
    type: 'Negative', severity: 'normal', name: 'Admin / status-behaviour fields are not exposed as criteria',
    description: 'Verify AccountStatus behaviour flags, Rate Card, Time Zone, Payment Term, Default Billing Type and split Company / Person Owner criteria are absent (5.2.2, 5.2.3, 5.5).',
    condition: 'Advanced Filters open, every section expanded.',
    expected: 'None of: Is Active Status, Is Terminal Status, Blocks New Work / Billing / Customer Access, Rate Card, Time Zone, Payment Term, Billing Type, Company Owner, Person Owner.',
  }),
  advOperators: tc(23, {
    defect: `Account Status default operator is "is" (Equals) instead of "is any of" (In) (spec 5.2.2).`,
    severity: 'normal', name: 'Each criterion offers the spec operators with the right default',
    description: 'Verify operator lists and defaults per criterion (5.2, 5.4).',
    condition: 'Advanced Filters open.',
    expected: 'Name / Owner / Address / City / Region / Phone: Contains (+ Equals); Number: Equals (+ Contains); Status: In (+ Equals); Postal: Begins With (+ Equals, Contains); Country: Equals (+ In).',
  }),
  accountNameContains: tc(24, {
    severity: 'critical', name: 'Account Name Contains',
    description: 'Verify every returned account\'s name contains the text (5.2.1).',
    condition: `Account Name = "${DATA.accountNamePart}".`, expected: 'Results returned; every Account Name contains the text.',
  }),
  accountNameEquals: tc(25, {
    severity: 'normal', name: 'Account Name Equals',
    description: 'Verify Equals returns only the account whose name is the text (5.2.1).',
    condition: `Account Name is "${DATA.accountName}".`, expected: `Only "${DATA.accountName}" is returned.`,
  }),
  nameCase: tc(26, {
    severity: 'normal', name: 'Text criteria are case-insensitive',
    description: 'Verify upper / lower case Account Name return the same accounts (5.4).',
    condition: `Account Name = "${DATA.accountNamePart.toUpperCase()}" vs "${DATA.accountNamePart.toLowerCase()}".`,
    expected: 'Same total and same Record IDs.',
  }),
  accountNumberEquals: tc(27, {
    severity: 'critical', name: 'Account Number Equals',
    description: 'Verify the full Account Number returns exactly its account (5.2.1).',
    condition: `Account Number = "${DATA.accountNumber}".`, expected: `Only "${DATA.accountNumberName}" is returned.`,
  }),
  accountNumberPartial: tc(28, {
    type: 'Negative', severity: 'normal', name: 'Account Number Equals does not match part of a number',
    description: 'Verify a partial Account Number returns nothing with the default Equals (5.2.1).',
    condition: `Account Number = "${DATA.accountNumberPart}".`, expected: `"${DATA.accountNumberName}" (${DATA.accountNumber}) is not returned.`,
  }),
  accountNumberContains: tc(29, {
    severity: 'normal', name: 'Account Number Contains',
    description: 'Verify the Contains operator returns every account whose number contains the digits (5.2.1).',
    condition: `Account Number contains "${DATA.accountNumberPart}".`, expected: 'Results returned; every Account Number contains the digits.',
  }),
  statusEquals: tc(30, {
    severity: 'critical', name: 'Account Status Equals',
    description: 'Verify only accounts with the selected status are returned (5.2.2).',
    condition: `Account Status is "${DATA.status}".`, expected: `Every row's Account Status is "${DATA.status}"; total = accounts with that status.`,
  }),
  statusIn: tc(31, {
    severity: 'critical', name: 'Account Status In (several statuses)',
    description: 'Verify selecting two statuses returns accounts having either status (5.2.2 In).',
    condition: `Account Status is any of "${DATA.status}", "${DATA.status2}".`,
    expected: 'Result = union of the two single-status searches; every row has one of the statuses.',
  }),
  statusOptions: tc(32, {
    type: 'Negative', severity: 'normal', name: 'Account Status offers status display names once each',
    description: 'Verify the status list shows AccountStatus.Name values, no empty or duplicate entries, no behaviour-flag values (5.2.2).',
    condition: 'Advanced Filters open.',
    expected: 'Every option has a value and a name and appears once.',
  }),
  ownerCompanyContains: tc(33, {
    severity: 'critical', name: 'Account Owner Contains (Company Display Name)',
    description: 'Verify accounts whose owning Company name contains the text are returned (5.2.3).',
    condition: `Account Owner = "${DATA.ownerCompany.split(' ')[0]}".`, expected: 'Results returned; every row\'s Account Owner contains the text.',
  }),
  ownerCompanyEquals: tc(34, {
    severity: 'normal', name: 'Account Owner Equals (Company)',
    description: 'Verify Equals returns only accounts whose owner name is the text (5.2.3).',
    condition: `Account Owner is "${DATA.ownerCompany}".`, expected: `Every row's Account Owner is "${DATA.ownerCompany}".`,
  }),
  ownerLegal: tc(35, {
    defect: `Account Owner ignores Company.LegalName (spec 5.2.3): "${DATA.ownerLegal}" (Legal Name of the owner of ${DATA.ownerLegalAccount}) returns nothing.`,
    severity: 'normal', name: 'Account Owner matches the owner Company Legal Name',
    description: 'Verify Account Owner searches Company.LegalName of the owner (5.2.3).',
    condition: `Account Owner = "${DATA.ownerLegal}" (only in the Legal Name of the owner of "${DATA.ownerLegalAccount}").`,
    expected: `"${DATA.ownerLegalAccount}" is returned.`,
  }),
  ownerTrade: tc(36, {
    severity: 'normal', name: 'Account Owner matches the owner Company Trade Name',
    description: 'Verify Account Owner searches Company.TradeName of the owner (5.2.3).',
    condition: 'SEARCH_ACCOUNT_OWNER_TRADE / _TRADE_ACCOUNT set (no owner in the sandbox has a distinct Trade Name).',
    expected: 'The account of that owner is returned.',
  }),
  ownerPerson: tc(37, {
    severity: 'critical', name: 'Account Owner matches Person first, last and display name',
    description: 'Verify Account Owner searches Person.FirstName, LastName and DisplayName of the owning Person (5.2.3).',
    condition: `Account Owner = "${DATA.ownerPersonFirst}", "${DATA.ownerPersonLast}", then is "${DATA.ownerPerson}".`,
    expected: `Each search returns every account owned by "${DATA.ownerPerson}".`,
  }),
  ownerSingle: tc(38, {
    severity: 'normal', name: 'Account Owner is one criterion for Company and Person owners',
    description: 'Verify one Account Owner criterion finds both Company-owned and Person-owned accounts (5.2.3 hides the polymorphic model).',
    condition: `Account Owner = "${DATA.ownerCompany}" and "${DATA.ownerPerson}" in the same criterion.`,
    expected: 'Exactly one Account Owner criterion in the drawer; both searches return accounts.',
  }),
  billingAddress: tc(39, {
    severity: 'normal', name: 'Billing Address Contains',
    description: 'Verify text in Address1 / Address2 of the effective billing address matches (5.2.4).',
    condition: `Billing Address = "${DATA.address}".`, expected: 'Results returned; every row\'s Billing Address contains the text.',
  }),
  billingOwn: tc(40, {
    severity: 'critical', name: 'Billing criteria use the Account\'s own billing address when set',
    description: 'Verify an account with BillingAddressIDF is found by its own address and not by its owner\'s billing address (5.2.4 rule 1).',
    condition: `Accounts "${DATA.ownBillingName}": own address "${DATA.ownBillingAddr}", owner billing "${DATA.ownerBillingAddr}".`,
    expected: `Found by "${DATA.ownBillingAddr}"; not found by "${DATA.ownerBillingAddr}".`,
  }),
  billingInherit: tc(41, {
    severity: 'critical', name: 'Billing criteria fall back to the owner\'s billing address',
    description: 'Verify an account without its own billing address is found by its owner\'s billing address (5.2.4 rules 2 - 4).',
    condition: `Accounts "${DATA.inheritName}" (use the owner billing address "${DATA.inheritAddr}").`,
    expected: `Every "${DATA.inheritName}" account is returned for "${DATA.inheritAddr}".`,
  }),
  billingCity: tc(42, {
    severity: 'normal', name: 'Billing City Contains (case-insensitive)',
    description: 'Verify accounts whose effective billing city contains the text are returned (5.2.4).',
    condition: `Billing City = "${DATA.city.toLowerCase()}".`, expected: 'Results returned; every row\'s Billing City contains the text.',
  }),
  billingRegion: tc(43, {
    severity: 'normal', name: 'Billing Region Contains (RegionNameText or Region.RegionName)',
    description: 'Verify the region matches free-text regions and linked Region records (5.2.4).',
    condition: `Billing Region = "${DATA.region}", then "${DATA.regionLinked}".`,
    expected: 'Both return accounts.',
  }),
  billingPostal: tc(44, {
    severity: 'normal', name: 'Billing Postal Code Begins With',
    description: 'Verify the postal code prefix matches and digits from inside the code do not (5.2.4 BeginsWith).',
    condition: `Billing Postal Code = "${DATA.postalPrefix}", then "${DATA.postalPrefix.slice(1)}".`,
    expected: 'The prefix returns accounts; the inner digits return none of those accounts.',
  }),
  billingCountry: tc(45, {
    severity: 'normal', name: 'Billing Country Equals and In',
    description: 'Verify Equals on one country and In on two countries (5.2.4).',
    condition: `Billing Country is "${DATA.country}", then is any of "${DATA.country}", "${DATA.country2}".`,
    expected: 'Equals returns accounts; In returns at least the same accounts.',
  }),
  billingAllAddresses: tc(46, {
    type: 'Negative', severity: 'normal', name: 'Billing criteria do not search non-billing addresses',
    description: 'Verify an address that is not the effective billing address does not match (5.2.4 "must not search all Account-related Address records").',
    condition: `Billing Address = "${DATA.ownerBillingAddr}" (owner billing address of accounts that use their own).`,
    expected: `No "${DATA.ownBillingName}" account is returned.`,
  }),
  phoneContains: tc(47, {
    defect: `Advanced Phone Number returns no account for any value (spec 5.2.5): owner phone numbers are not joined - "${DATA.phoneDashed}" finds none of the ${DATA.phoneOwner} accounts.`,
    severity: 'critical', name: 'Phone Number Contains with formatted input',
    description: 'Verify non-numeric characters are stripped and the owner\'s phone numbers are matched with Contains (5.2.5).',
    condition: `Phone = "${DATA.phoneDashed}", operator default.`,
    expected: `Accounts owned by "${DATA.phoneOwner}" are returned.`,
  }),
  phoneEquals: tc(48, {
    defect: `Advanced Phone Number returns no account for any value (spec 5.2.5): "${DATA.phoneFormatted}" Equals finds none of the ${DATA.phoneOwner} accounts.`,
    severity: 'critical', name: 'Phone Number Equals with the full number',
    description: 'Verify Equals matches the full E.164 number typed with formatting (5.2.5).',
    condition: `Phone Equals "${DATA.phoneFormatted}".`,
    expected: `Only accounts owned by "${DATA.phoneOwner}" are returned.`,
  }),
  phoneEqualsPartial: tc(49, {
    type: 'Negative', severity: 'normal', name: 'Phone Number Equals with only part of the number',
    description: 'Verify Equals does not match a partial number (5.2.5).',
    condition: `Phone Equals "${DATA.phoneLocal.slice(3)}".`,
    expected: `No account of "${DATA.phoneOwner}" is returned.`,
  }),
  phoneLetters: tc(50, {
    type: 'Negative', severity: 'normal', name: 'Phone Number with letters only',
    description: 'Verify letters (empty after normalization) do not match every phone.',
    condition: 'Phone = "abcdef".', expected: 'No account returned; no server error.',
  }),
  includeDeletedDefault: tc(51, {
    severity: 'critical', name: 'Include Deleted is OFF by default',
    description: 'Verify the toggle defaults to OFF and deleted accounts are excluded (5.2.6, 5.5).',
    condition: `Advanced Filters opened fresh; Account Name = "${DATA.deletedName}".`,
    expected: 'Toggle OFF; IsArchived = false sent; no deleted account returned.',
  }),
  includeDeletedOn: tc(52, {
    defect: `Include Deleted ON returns only deleted accounts instead of adding them to the active ones (spec 5.2.6).`,
    severity: 'critical', name: 'Include Deleted ON adds deleted accounts to active ones',
    description: 'Verify ON includes deleted accounts without removing active ones (5.2.6).',
    condition: `Account Name = "${env.keyword}"; toggle ON.`,
    expected: 'Total ON > total OFF; every account of the OFF search is in the ON search; deleted accounts are included.',
  }),
  combined: tc(53, {
    severity: 'normal', name: 'Several criteria are combined with AND',
    description: 'Verify Account Owner + Account Status returns the intersection of the two single searches (5.4).',
    condition: `Account Owner = "${DATA.phoneOwner}" and Account Status = "${DATA.status}".`,
    expected: 'Result = intersection of the two single-criterion results.',
  }),
  reset: tc(54, {
    severity: 'minor', name: 'Reset clears every criterion',
    description: 'Verify Reset empties the drawer and Include Deleted returns to OFF.',
    condition: 'Several criteria set.', expected: 'All criteria empty; toggle OFF.',
  }),
  advEmpty: tc(55, {
    type: 'Negative', severity: 'minor', name: 'Apply with no criteria',
    description: 'Verify Apply with nothing set does not error (5.4 all criteria optional).',
    condition: 'All criteria empty.', expected: 'No server error; page still usable.',
  }),
  paging: tc(56, {
    severity: 'normal', name: 'Pagination is stable: no duplicate or missing rows',
    description: 'Verify page 2 continues page 1 with no duplicates.',
    condition: `Account Name = "${DATA.pagingText}" (more than one page).`, expected: 'No Record ID on both pages; total unchanged.',
  }),

  // ================= 7. Presets / results / 8. permissions =================
  noPresets: tc(57, {
    type: 'Negative', severity: 'minor', name: 'No Preset Searches are offered for Account',
    description: 'Verify the Account search page offers no preset searches (7 "Not applicable").',
    condition: 'Account search page; Advanced Filters open.',
    expected: 'No preset control is shown.',
  }),
  resultsView: tc(58, {
    severity: 'normal', name: 'Results show the accounts and open the Account record',
    description: 'Verify the results show the returned accounts and a result opens its Account record.',
    condition: `Account Owner = "${DATA.ownerCompany}".`, expected: '"Results:" equals the total; opening the first result lands on /Account/Edit/<id>.',
  }),
  permission: tc(59, {
    severity: 'critical', name: 'Only accounts the user may view are returned',
    description: 'Verify every returned account is allowed for the signed-in user and the count matches the rows (8).',
    condition: `Account Owner = "${DATA.phoneOwner}".`, expected: 'Every row is marked allowed; total = rows read.',
  }),
};

module.exports = { MODULE, ENTITY_ID, DATA, FILTER_LABELS, EXCLUDED_LABELS, OPERATORS, QUICK_FIELDS, MESSAGES, cases };
