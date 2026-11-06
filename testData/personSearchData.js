const { env } = require('../utils/testData');

/**
 * 62237 Person Search - Criteria Specification (docs/62237 Search People JSON.md).
 * Search is read-only: no records are created. The tests search the people that already exist in the sandbox,
 * so the values below must exist there. Override any of them in the root .env:
 *   SEARCH_PERSON_LAST_NAME        last name shared by several people              (default "Patel")
 *   SEARCH_PERSON_FIRST_NAME       first name of SEARCH_PERSON_EMAIL's person      (default "Chirag")
 *   SEARCH_PERSON_MIDDLE_NAME      a middle name in use                            (default "Playwright")
 *   SEARCH_PERSON_EMAIL            Person.PrimaryEmail (also a PersonEmail)        (default "Chirag@idb.bz")
 *   SEARCH_PERSON_EMAIL_DOMAIN     part of many emails, equal to none              (default "idb.bz")
 *   SEARCH_PERSON_USER_EMAIL       AspNetUsers.Email of a user                     (default "alpesh@xeosoftware.com")
 *   SEARCH_PERSON_PHONE_E164       PhoneNumber.NumberE164 of one person            (default "+919033921640")
 *   SEARCH_PERSON_PHONE_OWNER      display name of that person                     (default "Alpesh Soni")
 *   SEARCH_PERSON_ADDRESS / _CITY / _REGION / _POSTAL_PREFIX                        (defaults "Mangalmurti" / "Ahmedabad" / "Texas" / "3800")
 *   SEARCH_PERSON_COMPANY / _COMPANY_LEGAL / _COMPANY_TRADE                         (defaults "Judson" / "Independent" / "Judson ISD")
 *   SEARCH_PERSON_ACCOUNT_NAME / _ACCOUNT_NUMBER   an Account and its number        (defaults "Equine" / "1034")
 *   SEARCH_PERSON_STAFF_ROLE / _STAFF_ROLE_2       StaffRole names                  (defaults "Developer" / "Project Manager")
 *   SEARCH_PERSON_SECURITY_ROLE / _SECURITY_ROLE_2 AspNetRoles names                (defaults "Admin" / "Super Admin")
 *   SEARCH_PERSON_LANGUAGE         a Language assigned to someone                  (default "English")
 *   SEARCH_PERSON_SORT_TERM        part of many non-user last names (ordering)     (default "er")
 *   SEARCH_PERSON_LABOR_GRADE      a LaborGrade assigned to someone                (no default - the sandbox has none; test skipped)
 *   SEARCH_PERSON_TAG              a Tag assigned to a person                      (no default - the sandbox has none; test skipped)
 *   SEARCH_PERSON_DELETED_NAME     display name of a deleted person (isDeleted=1)  (no default - none in the sandbox; test skipped)
 */
const MODULE = 'Person Search';
const e = (name, fallback) => process.env[`SEARCH_PERSON_${name}`] || fallback;

const DATA = {
  lastName: e('LAST_NAME', 'Patel'),
  firstName: e('FIRST_NAME', 'Chirag'),
  middleName: e('MIDDLE_NAME', 'Playwright'),
  email: e('EMAIL', 'Chirag@idb.bz'),
  emailDomain: e('EMAIL_DOMAIN', 'idb.bz'),
  userEmail: e('USER_EMAIL', 'alpesh@xeosoftware.com'),
  phoneE164: e('PHONE_E164', '+919033921640'),
  phoneOwner: e('PHONE_OWNER', 'Alpesh Soni'),
  address: e('ADDRESS', 'Mangalmurti'),
  city: e('CITY', 'Ahmedabad'),
  region: e('REGION', 'Texas'),
  postalPrefix: e('POSTAL_PREFIX', '3800'),
  company: e('COMPANY', 'Judson'),
  companyLegal: e('COMPANY_LEGAL', 'Independent'),
  companyTrade: e('COMPANY_TRADE', 'Judson ISD'),
  accountName: e('ACCOUNT_NAME', 'Equine'),
  accountNumber: e('ACCOUNT_NUMBER', '1034'),
  staffRole: e('STAFF_ROLE', 'Developer'),
  staffRole2: e('STAFF_ROLE_2', 'Project Manager'),
  securityRole: e('SECURITY_ROLE', 'Admin'),
  securityRole2: e('SECURITY_ROLE_2', 'Super Admin'),
  language: e('LANGUAGE', 'English'),
  // part of many last names, among people without a user account (alphabetical-order check)
  sortTerm: e('SORT_TERM', 'er'),
  laborGrade: e('LABOR_GRADE', ''),
  tag: e('TAG', ''),
  deletedName: e('DELETED_NAME', ''),
  // text no person matches (keyword + run tag keeps it unique)
  noMatch: `${env.keyword}NoSuchPerson${env.runTag.replace(/\D/g, '')}`,
};

/** Same digits as DATA.phoneE164, typed with spaces / brackets / dashes (input must be normalized to digits). */
const digits = DATA.phoneE164.replace(/\D/g, '');
DATA.phoneDigits = digits;
DATA.phoneLocal = digits.slice(-10); // national part only - a "Contains" match, never an "Equals" match
DATA.phoneFormatted = `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;

/** Criteria labels of the Advanced Filters drawer (2.1 - 2.12). */
const FILTER_LABELS = [
  'Display Name', 'First Name', 'Middle Name', 'Last Name',
  'Primary Email', 'User Email', 'Other Email', 'Phone Number',
  'Address', 'City', 'Region', 'Postal Code',
  'Company Display Name', 'Legal Name', 'Trade Name', 'Account Name', 'Account Number',
  'Staff Role', 'Security Role', 'Has User Account', 'Labor Grade', 'Language', 'Tags', 'Include Deleted',
];

/**
 * Operators the spec requires per criterion (3): default first. fieldId -> { def: shown default, must: operator keys }.
 * Name / address fields: Contains; emails: Equals (default) + Contains; phone: Contains (default) + Equals;
 * postal code: BeginsWith; account number: Exact; multi-select dropdowns: In; labor grade / language: Equals.
 */
const OPERATORS = {
  DisplayName: { def: /contains/i, must: ['contains'] },
  FirstName: { def: /contains/i, must: ['contains'] },
  MiddleName: { def: /contains/i, must: ['contains'] },
  LastName: { def: /contains/i, must: ['contains'] },
  PrimaryEmail: { def: /^(is|equals)$/i, must: ['equals', 'contains'] },
  AspNetUserEmail: { def: /^(is|equals)$/i, must: ['equals', 'contains'] },
  PersonEmailAddress: { def: /^(is|equals)$/i, must: ['equals', 'contains'] },
  PhoneNumberE164: { def: /contains/i, must: ['contains', 'equals'] },
  Address: { def: /contains/i, must: ['contains'] },
  City: { def: /contains/i, must: ['contains'] },
  RegionName: { def: /contains/i, must: ['contains'] },
  PostalCode: { def: /starts with|begins with/i, must: ['startsWith'] },
  CompanyDisplayName: { def: /contains/i, must: ['contains'] },
  CompanyLegalName: { def: /contains/i, must: ['contains'] },
  CompanyTradeName: { def: /contains/i, must: ['contains'] },
  AccountName: { def: /contains/i, must: ['contains'] },
  AccountNumber: { def: /^(is|equals)$/i, must: ['equals'] },
  StaffRoleIds: { def: /^(is|equals)$/i, must: ['in'] },
  SecurityRoleIds: { def: /^(is|equals)$/i, must: ['in'] },
  TagIds: { def: /^(is|equals)$/i, must: ['in'] },
  LaborGradeIDF: { def: /^(is|equals)$/i, must: ['equals'] },
  LanguageIDF: { def: /^(is|equals)$/i, must: ['equals'] },
};

/** Has User Account DDL (2.8): spec wording, and what the app is expected to send for each. */
const HAS_USER = { yes: 'Yes', no: 'No', specOptions: ['All', 'Is User', 'Is Not User'] };

const MESSAGES = {
  selectFromList: /please select a value from the list/i,
  serverError: /exception|stack trace|sql|server error|something went wrong/i,
};

const tc = (no, def) => ({ id: `TC_PER_${String(no).padStart(3, '0')}`, ...def });

const cases = {
  // ---------- 1. Quick Search ----------
  quickScope: tc(1, {
    severity: 'critical', name: 'Quick Search with Record Type "Person" runs a person search',
    description: 'Verify the top-bar Quick Search offers the "Person" record type and evaluates the text against First / Middle / Last / Display Name (1, 1.1).',
    condition: `Signed-in user; people with last name "${DATA.lastName}" exist.`,
    expected: 'Search page opens for entity 9 (Person); name criteria with <text> are sent; results are shown and "Results:" equals the total returned.',
  }),
  quickName: tc(2, {
    severity: 'critical', name: 'Quick Search matches names with Contains',
    description: 'Verify a part of a name returns the people whose name contains it (1.1 Names Contains).',
    condition: `People named "...${DATA.lastName}..." exist; text = "${DATA.lastName.slice(0, -1)}".`,
    expected: 'Results are returned and every row\'s name contains the text (case-insensitive).',
  }),
  quickCase: tc(3, {
    severity: 'normal', name: 'Quick Search is case-insensitive',
    description: 'Verify lower-, upper- and mixed-case spellings of a name return the same people (general rule: case-insensitive).',
    condition: `People with last name "${DATA.lastName}" exist.`,
    expected: 'Same total and same people for every spelling.',
  }),
  quickEmailExact: tc(4, {
    severity: 'critical', name: 'Quick Search finds a person by the exact email',
    description: 'Verify the full email address finds the person (1.2 Exact Match on PrimaryEmail / AspNetUsers.Email / PersonEmail).',
    condition: `"${DATA.email}" is a person\'s email; typed in a different case.`,
    expected: 'The person who owns the email is returned.',
  }),
  quickEmailPartial: tc(5, {
    defect: 'Quick Search sends contains / startsWith for the email fields instead of Exact Match (spec 1.2), so part of an email returns people.',
    type: 'Negative', severity: 'normal', name: 'Quick Search does not match part of an email',
    description: 'Verify emails are matched exactly in Quick Search: part of an address does not return its owner (1.2 Exact Match).',
    condition: `Text "${DATA.emailDomain}" is contained in many emails but equal to none, and is in no name or phone.`,
    expected: 'No results.',
  }),
  quickPhoneFormatted: tc(6, {
    defect: 'Quick Search does not strip non-numeric characters from a phone number (spec 1.3): "+91 (903) 392-1640" returns nobody.',
    severity: 'critical', name: 'Quick Search normalizes a formatted phone number',
    description: 'Verify the input is reduced to digits before it is compared with PhoneNumber.NumberE164 (1.3).',
    condition: `"${DATA.phoneOwner}" has phone ${DATA.phoneE164}; text "${DATA.phoneFormatted}".`,
    expected: `"${DATA.phoneOwner}" is returned.`,
  }),
  quickPhonePartial: tc(7, {
    severity: 'normal', name: 'Quick Search matches part of a phone number (Contains)',
    description: 'Verify phone numbers are compared with Contains logic (1.3).',
    condition: `"${DATA.phoneOwner}" has phone ${DATA.phoneE164}; text "${DATA.phoneLocal}".`,
    expected: `"${DATA.phoneOwner}" is returned.`,
  }),
  quickTextNotPhone: tc(8, {
    type: 'Negative', severity: 'normal', name: 'Quick Search text without digits does not match every phone',
    description: 'Verify text with no digits normalizes to nothing for the phone comparison and does not return everyone who has a phone (1.3).',
    condition: `Text "${DATA.lastName}" (no digits).`,
    expected: 'Every row matches the text by name or email; no row is returned only because it has a phone number.',
  }),
  quickNoMatch: tc(9, {
    type: 'Negative', severity: 'normal', name: 'Quick Search with text no person matches',
    description: 'Verify a search that matches nothing returns an empty result without an error.',
    condition: 'No person matches the generated text.', expected: '"Results: 0", no rows and no error message.',
  }),
  quickXss: tc(10, {
    type: 'Negative', severity: 'critical', name: 'Quick Search with a script tag is not executed',
    description: 'Verify HTML / script typed into Quick Search is treated as text.',
    condition: 'Search text <script>alert(1)</script>.', expected: 'No browser dialog, no server error; the search completes normally.',
  }),
  quickSql: tc(11, {
    type: 'Negative', severity: 'critical', name: 'Quick Search with SQL injection text',
    description: 'Verify SQL syntax typed into Quick Search is treated as text.',
    condition: "Search text ' OR 1=1 --", expected: 'HTTP 200, no server error, and not the whole person list.',
  }),
  quickEmpty: tc(12, {
    type: 'Negative', severity: 'minor', name: 'Quick Search with empty text',
    description: 'Verify searching with an empty Quick Search box is handled gracefully.',
    condition: 'Quick Search box left empty, Record Type = Person.', expected: 'No server error or error page; the user stays on a working page.',
  }),
  quickDeleted: tc(13, {
    severity: 'critical', name: 'Quick Search excludes deleted people',
    description: 'Verify persons with isDeleted = 1 are never returned by Quick Search (1.4).',
    condition: 'SEARCH_PERSON_DELETED_NAME = display name of a deleted person (skipped when not set - the sandbox has none).',
    expected: 'The deleted person is not in the Quick Search results.',
  }),

  // ---------- 2. Advanced Search ----------
  advOpen: tc(14, {
    severity: 'critical', name: 'Advanced Search shows every Person criterion',
    description: 'Verify Advanced Search opens from the Quick Search filter icon and offers every criterion of 2.1 - 2.12.',
    condition: 'Record Type = Person.', expected: 'Search page for entity 9 opens; the drawer lists all 24 criteria with Apply and Reset.',
  }),
  advOperators: tc(15, {
    severity: 'critical', name: 'Each criterion offers the operators of the spec',
    description: 'Verify default and available operators: names / address Contains, emails Equals (default) + Contains, phone Contains (default) + Equals, postal code BeginsWith, account number Exact, multi-selects In, labor grade / language Equals (2, 3).',
    condition: 'Advanced Filters drawer after Reset.', expected: 'Every criterion shows the required default and offers the required operators.',
  }),
  firstName: tc(16, {
    severity: 'normal', fieldId: 'FirstName', value: DATA.firstName, name: 'First Name criterion (Contains)',
    description: 'Verify First Name filters with Contains (2.1).', condition: `People with first name "${DATA.firstName}".`,
    expected: 'FirstName contains <text> is sent; every row\'s name contains the text.',
  }),
  middleName: tc(17, {
    severity: 'normal', fieldId: 'MiddleName', value: DATA.middleName, name: 'Middle Name criterion (Contains)',
    description: 'Verify Middle Name filters with Contains (2.1).', condition: `People with middle name "${DATA.middleName}".`,
    expected: 'MiddleName contains <text> is sent and results are returned; the result list is a subset of all people.',
  }),
  lastName: tc(18, {
    severity: 'normal', fieldId: 'LastName', value: DATA.lastName, name: 'Last Name criterion (Contains)',
    description: 'Verify Last Name filters with Contains (2.1).', condition: `People with last name "${DATA.lastName}".`,
    expected: 'LastName contains <text> is sent; every row\'s name contains the text.',
  }),
  displayName: tc(19, {
    severity: 'normal', fieldId: 'DisplayName', value: DATA.lastName.slice(1, -1), name: 'Display Name criterion (Contains)',
    description: 'Verify Display Name filters with Contains, also on the middle of a name (2.1).', condition: `Text "${DATA.lastName.slice(1, -1)}".`,
    expected: 'DisplayName contains <text> is sent; every row\'s Display Name contains the text.',
  }),
  nameCase: tc(20, {
    severity: 'normal', name: 'Name criteria are case-insensitive',
    description: 'Verify Last Name in lower and upper case returns the same people (general rule).',
    condition: `People with last name "${DATA.lastName}".`, expected: 'Same total and same people.',
  }),
  primaryEmail: tc(21, {
    severity: 'critical', name: 'Primary Email Equals (default) finds the person, case-insensitive',
    description: 'Verify Primary Email defaults to Equals and matches Person.PrimaryEmail case-insensitively (2.2).',
    condition: `"${DATA.email}" is a primary email; typed in lower case.`,
    expected: 'PrimaryEmail equals <email> is sent; exactly the owner of the email is returned.',
  }),
  emailEqualsPartial: tc(22, {
    type: 'Negative', severity: 'normal', name: 'Primary Email Equals does not match part of an address',
    description: 'Verify Equals needs the whole address (2.2).',
    condition: `Primary Email equals "${DATA.emailDomain}".`, expected: 'No results.',
  }),
  emailContains: tc(23, {
    severity: 'normal', name: 'Primary Email Contains matches part of an address',
    description: 'Verify the Contains operator of the email criteria (2.2).',
    condition: `Primary Email contains "${DATA.emailDomain}".`,
    expected: 'PrimaryEmail contains <text> is sent; more people than the Equals search, every row\'s email contains the text.',
  }),
  userEmail: tc(24, {
    severity: 'normal', name: 'User Email matches AspNetUsers.Email',
    description: 'Verify the User Email criterion searches the login email (2.2 AspNetUsers.Email).',
    condition: `"${DATA.userEmail}" is a user\'s login email.`, expected: 'AspNetUserEmail equals <email> is sent and the user is returned.',
  }),
  otherEmail: tc(25, {
    severity: 'normal', name: 'Other Email matches PersonEmail.EmailAddress',
    description: 'Verify the Other Email criterion searches PersonEmail.EmailAddress (2.2).',
    condition: `"${DATA.email}" is stored as a PersonEmail.`, expected: 'PersonEmailAddress equals <email> is sent and the owner is returned.',
  }),
  phoneContains: tc(26, {
    defect: 'Advanced Phone Number does not strip non-numeric characters before matching (spec 2.3): "903-392-1640" with Contains returns nobody.',
    severity: 'critical', name: 'Phone Number Contains (default) with a formatted number',
    description: 'Verify the phone textbox strips non-numeric characters and compares with Contains against NumberE164 (2.3).',
    condition: `"${DATA.phoneOwner}" has ${DATA.phoneE164}; text "${DATA.phoneLocal.slice(0, 3)}-${DATA.phoneLocal.slice(3, 6)}-${DATA.phoneLocal.slice(6)}".`,
    expected: `Phone criterion sent with the default Contains; "${DATA.phoneOwner}" is returned.`,
  }),
  phoneEquals: tc(27, {
    defect: 'Advanced Phone Number Equals does not normalize a formatted number (spec 2.3): "+91 (903) 392-1640" returns nobody.',
    severity: 'normal', name: 'Phone Number Equals with a formatted full number',
    description: 'Verify Equals matches the whole E.164 number after normalization (2.3).',
    condition: `Text "${DATA.phoneFormatted}", operator Equals.`, expected: `Only "${DATA.phoneOwner}" is returned.`,
  }),
  phoneEqualsPartial: tc(28, {
    type: 'Negative', severity: 'normal', name: 'Phone Number Equals with only part of the number',
    description: 'Verify Equals does not match a partial number (2.3).',
    condition: `Text "${DATA.phoneLocal}", operator Equals (stored ${DATA.phoneE164}).`, expected: `"${DATA.phoneOwner}" is not returned.`,
  }),
  phoneLetters: tc(29, {
    type: 'Negative', severity: 'normal', name: 'Phone Number with letters only',
    description: 'Verify text with no digits does not turn into an empty Contains that matches every phone (2.3 normalization).',
    condition: 'Phone Number contains "abc".', expected: 'A validation message or no results; never every person who has a phone.',
  }),
  address: tc(30, {
    severity: 'normal', fieldId: 'Address', value: DATA.address.toLowerCase(), name: 'Address criterion (Contains Address1 / 2 / 3)',
    description: 'Verify Address matches Address1 / Address2 / Address3 with Contains, case-insensitive (2.4).',
    condition: `A person address contains "${DATA.address}".`, expected: 'Address contains <text> is sent and results are returned.',
  }),
  city: tc(31, {
    severity: 'normal', fieldId: 'City', value: DATA.city.slice(0, 5), name: 'City criterion (Contains)',
    description: 'Verify City matches with Contains (2.4).', condition: `People in "${DATA.city}".`,
    expected: 'City contains <text> is sent and results are returned.',
  }),
  region: tc(32, {
    severity: 'normal', fieldId: 'RegionName', value: DATA.region, name: 'Region criterion (Contains)',
    description: 'Verify Region matches RegionNameText / Region.RegionName with Contains (2.4).', condition: `People in region "${DATA.region}".`,
    expected: 'Region criterion is sent and results are returned.',
  }),
  postal: tc(33, {
    severity: 'critical', name: 'Postal Code uses BeginsWith',
    description: 'Verify Postal Code matches the start of the code and not the middle (2.4 BeginsWith).',
    condition: `Postal codes starting "${DATA.postalPrefix}".`,
    expected: 'The prefix returns people; the same digits taken from the middle / end of those codes return none of them.',
  }),
  company: tc(34, {
    severity: 'normal', fieldId: 'CompanyDisplayName', value: DATA.company, name: 'Company Display Name criterion (via Affiliation)',
    description: 'Verify people affiliated with a company are found by Company.DisplayName (2.5, 5 Person -> Affiliation -> Company).',
    condition: `People affiliated with "${DATA.company}".`, expected: 'CompanyDisplayName contains <text> is sent and results are returned.',
  }),
  companyLegal: tc(35, {
    severity: 'normal', fieldId: 'CompanyLegalName', value: DATA.companyLegal, name: 'Company Legal Name criterion',
    description: 'Verify Company.LegalName matches with Contains (2.5).', condition: `A company legal name contains "${DATA.companyLegal}".`,
    expected: 'CompanyLegalName contains <text> is sent and results are returned.',
  }),
  companyTrade: tc(36, {
    severity: 'normal', fieldId: 'CompanyTradeName', value: DATA.companyTrade, name: 'Company Trade Name criterion',
    description: 'Verify Company.TradeName matches with Contains (2.5).', condition: `A company trade name contains "${DATA.companyTrade}".`,
    expected: 'CompanyTradeName contains <text> is sent and results are returned.',
  }),
  accountName: tc(37, {
    severity: 'normal', fieldId: 'AccountName', value: DATA.accountName.toLowerCase(), name: 'Account Name criterion (via AccountPosition)',
    description: 'Verify people with a position on an Account are found by Account.AccountName Contains (2.5, 5).',
    condition: `People on Account "${DATA.accountName}".`, expected: 'AccountName contains <text> is sent and results are returned.',
  }),
  accountNumber: tc(38, {
    severity: 'critical', name: 'Account Number is an exact match',
    description: 'Verify Account.AccountNumber uses Exact Match: the full number finds the Account\'s people, part of it does not (2.5).',
    condition: `Account "${DATA.accountName}" has number ${DATA.accountNumber}.`,
    expected: 'Full number = same people as the Account Name search; a partial number returns none of them.',
  }),
  staffRole: tc(39, {
    severity: 'normal', name: 'Staff Role single value',
    description: 'Verify Staff Role is a dropdown from StaffRole and filters people (2.6).',
    condition: `People with Staff Role "${DATA.staffRole}".`, expected: 'StaffRoleIds criterion sent; results returned.',
  }),
  staffRoleMulti: tc(40, {
    severity: 'critical', name: 'Staff Role multi-select matches any selected role',
    description: 'Verify several Staff Roles can be selected and a person matching any of them is returned (2.6, 3 In).',
    condition: `Staff Roles "${DATA.staffRole}" and "${DATA.staffRole2}".`,
    expected: 'StaffRoleIds "in" both ids is sent; total >= each single role; every single-role person is included.',
  }),
  securityRole: tc(41, {
    severity: 'normal', name: 'Security Role lists AspNetRoles and filters people',
    description: 'Verify the "Security Role" criterion offers AspNetRoles.Name and returns people with that role (2.7).',
    condition: `Role "${DATA.securityRole}".`, expected: 'The role is offered by the lookup; SecurityRoleIds criterion sent; results returned.',
  }),
  securityRoleMulti: tc(42, {
    severity: 'normal', name: 'Security Role multi-select matches any selected role',
    description: 'Verify several Security Roles can be selected (2.7 Supports multi-select).',
    condition: `Roles "${DATA.securityRole}" and "${DATA.securityRole2}".`,
    expected: 'SecurityRoleIds "in" is sent; every single-role person is included.',
  }),
  securityFreeText: tc(43, {
    type: 'Negative', severity: 'minor', name: 'Security Role requires a role chosen from the list',
    description: 'Verify typed text that is not a role is not sent as a Security Role.',
    condition: 'Security Role = text that matches no role, not picked from the list.',
    expected: '"Please select a value from the list" is shown and no Security Role filter is applied.',
  }),
  hasUserOptions: tc(44, {
    defect: 'Has User Account offers "Select... / Yes / No" instead of "All / Is User / Is Not User" (spec 2.8).',
    severity: 'normal', name: 'Has User Account offers All / Is User / Is Not User',
    description: 'Verify the Has User Account DDL has three options and does not filter by default (2.8).',
    condition: 'Advanced Filters drawer after Reset.', expected: 'Options All / Is User / Is Not User; default sends no criterion.',
  }),
  hasUser: tc(45, {
    severity: 'critical', name: 'Has User Account: Is User + Is Not User = All',
    description: 'Verify "Is User" returns people with UserIDF and "Is Not User" the rest (2.8 Person.UserIDF IS NOT NULL).',
    condition: `A User Email person ("${DATA.userEmail}") exists.`,
    expected: 'Users + non-users = all people; no person in both; the known user is in "Is User".',
  }),
  tags: tc(46, {
    severity: 'normal', name: 'Tags multi-select matches any selected tag',
    description: 'Verify the Tags criterion selects from TagAssignment and supports "is any of" (2.9).',
    condition: 'SEARCH_PERSON_TAG = a tag assigned to a person (data part skipped when not set - the sandbox has none).',
    expected: 'Tags offers "is any of"; with a tag, TagIds criterion is sent and results are returned.',
  }),
  includeDeletedDefault: tc(47, {
    severity: 'critical', name: 'Include Deleted is OFF by default',
    description: 'Verify deleted persons are excluded unless the toggle is switched on (2.10, 1.4).',
    condition: 'Advanced Filters drawer after Reset.', expected: 'Toggle unchecked; "Include Deleted: is No" sent (IsArchived = false).',
  }),
  includeDeletedOn: tc(48, {
    defect: 'Include Deleted ON sends IsArchived = true and returns only deleted people instead of adding them to the active ones (spec 2.10).',
    severity: 'critical', name: 'Include Deleted ON adds deleted people to the results',
    description: 'Verify switching the toggle on INCLUDES deleted persons in addition to active ones (2.10).',
    condition: `Last Name "${DATA.lastName}" with Include Deleted OFF and ON.`,
    expected: 'ON total >= OFF total and every OFF person is still returned with ON.',
  }),
  includeDeletedPerson: tc(49, {
    severity: 'normal', name: 'A deleted person is found only with Include Deleted ON',
    description: 'Verify a deleted person is hidden by default and returned with the toggle ON (2.10).',
    condition: 'SEARCH_PERSON_DELETED_NAME = display name of a deleted person (skipped when not set).',
    expected: 'Not returned with OFF; returned with ON.',
  }),
  laborGrade: tc(50, {
    severity: 'normal', name: 'Labor Grade criterion (Equals)',
    description: 'Verify Labor Grade is a lookup from LaborGrade with Equals (2.11).',
    condition: 'SEARCH_PERSON_LABOR_GRADE = a labor grade assigned to someone (data part skipped when not set - the sandbox has none).',
    expected: 'Labor Grade offers Equals; with a value, the criterion is sent and results are returned.',
  }),
  language: tc(51, {
    severity: 'normal', name: 'Language criterion (Equals)',
    description: 'Verify Language is a single-select dropdown from Language and filters with Equals (2.12).',
    condition: `"${DATA.language}" is assigned to someone.`, expected: 'LanguageIDF equals <id> is sent and results are returned.',
  }),
  combined: tc(52, {
    severity: 'critical', name: 'Criteria together are combined with AND',
    description: 'Verify name, address and role criteria applied together all restrict the results (2).',
    condition: `Last Name "${DATA.lastName}", City "${DATA.city}", Staff Role "${DATA.staffRole}".`,
    expected: 'Every result is in each single-criterion result; total <= each single-criterion total.',
  }),
  reset: tc(53, {
    severity: 'normal', name: 'Reset clears every criterion',
    description: 'Verify Reset removes the entered criteria from the drawer.',
    condition: 'Name, email, city, staff role, has user account and include deleted entered.',
    expected: 'After Reset the text boxes are empty, dropdowns show their placeholder and Include Deleted is off.',
  }),
  advEmpty: tc(54, {
    type: 'Negative', severity: 'minor', name: 'Apply with no criteria',
    description: 'Verify applying an empty Advanced Search is handled gracefully.',
    condition: 'All criteria empty.', expected: 'Either results or a friendly message; no server error.',
  }),

  // ---------- 4. ordering ----------
  orderEmail: tc(55, {
    severity: 'critical', name: 'Exact email match is ranked first',
    description: 'Verify a person whose email equals the text is the first result (4.1).',
    condition: `Quick Search "${DATA.email}".`, expected: 'The email owner is the first row.',
  }),
  orderPhone: tc(56, {
    severity: 'normal', name: 'Exact phone match is ranked first',
    description: 'Verify a person whose phone equals the normalized text is the first result (4.2).',
    condition: `Quick Search "${DATA.phoneE164}".`, expected: `"${DATA.phoneOwner}" is the first row.`,
  }),
  orderName: tc(57, {
    severity: 'normal', name: 'Exact name matches before partial name matches',
    description: 'Verify people with a name part equal to the text come before people whose name only contains it (4.3).',
    condition: `Quick Search "${DATA.firstName}".`, expected: 'No partial-name row is ranked above an exact-name row.',
  }),
  orderUsers: tc(58, {
    defect: 'Users are not ranked before non-users (spec 4.4): results come back alphabetical by Full Name only.',
    severity: 'normal', name: 'People with user accounts before people without',
    description: 'Verify that, after exact matches, users are listed before non-users (4.4).',
    condition: `Last Name contains "${DATA.lastName.slice(0, -1)}" (no exact email / phone match).`,
    expected: 'No non-user is listed above a user.',
  }),
  orderAlpha: tc(59, {
    defect: 'Results are ordered by First Name, not by Last Name then First Name (spec 4.5).',
    severity: 'normal', name: 'Then alphabetical by Last Name, First Name',
    description: 'Verify the remaining order is LastName, then FirstName (4.5).',
    condition: `Last Name contains "${DATA.sortTerm}" with Has User Account = Is Not User (one ranking group).`,
    expected: 'Rows are sorted by last name, then first name.',
  }),
  paging: tc(60, {
    severity: 'normal', name: 'Pagination is stable: no duplicate or missing rows',
    description: 'Verify page 2 continues page 1 with no duplicates (4).',
    condition: 'More than one page of people.', expected: 'No Record ID on both pages; total unchanged.',
  }),

  // ---------- results / permissions ----------
  resultsView: tc(61, {
    severity: 'normal', name: 'Results show the person name and email',
    description: 'Verify each result shows the person and opens the Person record.',
    condition: `Last Name "${DATA.lastName}".`, expected: 'One card per row with name and email; opening a result lands on /Person/Edit/<id>.',
  }),
  permission: tc(62, {
    severity: 'critical', name: 'Only people the user may view are returned',
    description: 'Verify every returned person is allowed for the signed-in user.',
    condition: `Signed-in user; Last Name "${DATA.lastName}".`, expected: 'Every row is marked allowed.',
  }),
};

module.exports = { MODULE, DATA, FILTER_LABELS, OPERATORS, HAS_USER, MESSAGES, cases };
