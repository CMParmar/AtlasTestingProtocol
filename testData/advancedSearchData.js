const { env } = require('../utils/testData');
const { DATA: PERSON } = require('./personSearchData');
const { DATA: MESSAGE } = require('./messageSearchData');

/**
 * 62200 Advanced Search Criteria Capture (docs/62200 Advanced Search Criteria Capture Use Case.md).
 * The Search configuration (SET.<Module>.<Entity>.SearchCriteria) drives the criteria drawer; Apply runs the search
 * and stores the criteria as the "last used" SearchHistory for User + Entity; reopening restores and re-runs it.
 * The flows run on the Person search (entityId 9); MF-1 is repeated on every entity of the SettingKey table that has a
 * search page in the sandbox. Stored criteria are cleared before and after every test.
 * Override in the root .env:
 *   ASC_ENTITY_ID              search page the flows run on                              (default 9 = Person)
 *   ASC_OTHER_ENTITY_ID        second entity (criteria scoped per entity)                (default 10 = Project)
 *   ASC_NO_CONFIG_ENTITY_ID    entityId with no SearchCriteria setting (A3-1)            (default 2 - shows the error in the sandbox)
 *   SEARCH_PERSON_* / SEARCH_MESSAGE_*   sandbox values, see personSearchData.js / messageSearchData.js
 */
const MODULE = 'Advanced Search';

const ENTITY = Number(process.env.ASC_ENTITY_ID || 9);
const OTHER_ENTITY = Number(process.env.ASC_OTHER_ENTITY_ID || 10);
const NO_CONFIG_ENTITY = Number(process.env.ASC_NO_CONFIG_ENTITY_ID || 2);
/** Message search (62151): its date range is the criterion with a validation rule (start must be <= end). */
const DATE_ENTITY = 18;

/**
 * Entities of the SettingKey table (SET.<Module>.<Entity>.SearchCriteria) that have a search page in the sandbox,
 * with criteria labels their Search configuration must render (a sample, not the full list).
 * Address, Expense, Invoice, Document, ServiceStage, ServiceSubscription, Tag, Event, TimeClock and WorkItem have no
 * search page yet (not in the Quick Search record types) and are not covered.
 */
const ENTITIES = {
  1: { name: 'Account', key: 'SET.ACCT.Account.SearchCriteria', labels: ['Account name', 'Account number', 'Account status'] },
  3: { name: 'Company', key: 'SET.ACCT.Company.SearchCriteria', labels: ['Display name', 'Legal name', 'Trade name'] },
  9: { name: 'Person', key: 'SET.ACCT.Person.SearchCriteria', labels: ['First Name', 'Last Name', 'Primary Email'] },
  11: { name: 'Rate Card', key: 'SET.ACCT.RateCard.SearchCriteria', labels: ['Rate Card Name', 'Description'] },
  18: { name: 'Message', key: 'SET.COMM.ConversationMessage.SearchCriteria', labels: ['Message text', 'Message date range'] },
  12: { name: 'Report', key: 'SET.CORE.Report.SearchCriteria', labels: ['Report name', 'Report type'] },
  10: { name: 'Project', key: 'SET.SERV.Project.SearchCriteria', labels: ['Project name', 'Project code', 'Project status'] },
  13: { name: 'Deliverable', key: 'SET.SERV.Service.SearchCriteria', labels: ['Deliverable Name', 'Status'] },
  14: { name: 'Deliverable Type', key: 'SET.SERV.ServiceItem.SearchCriteria', labels: ['Deliverable Type Name', 'Billing type'] },
};

const DATA = {
  lastName: PERSON.lastName,               // shared by several people
  otherLastName: PERSON.lastName.slice(0, -1),
  firstNamePart: 'a',
  noMatch: `${env.keyword}NoSuchRecord${env.runTag.replace(/\D/g, '')}`,
  messageText: MESSAGE.term,
  invalidRange: { start: '2026-10-10', end: '2026-01-01' }, // start after end
};

const MESSAGES = {
  noResults: /no matching records( found)?/i,
  noConfig: /advanced search configuration not available for this entity/i,
};

const tc = (no, def) => ({ id: `TC_ASC_${String(no).padStart(3, '0')}`, ...def });
const page = `Person search page (/Search?entityId=${ENTITY})`;

const cases = {
  // ---------- MF-1: open Advanced Search, configuration rendered ----------
  configRendered: tc(1, {
    severity: 'critical', name: 'Search configuration is loaded and its criteria are rendered',
    description: 'Verify navigating to Advanced Search for a known entity reads its Search configuration (SET.<Module>.<Entity>.SearchCriteria) and renders the criteria it defines (MF-1). Repeated per entity of the SettingKey table.',
    condition: 'Signed-in user; entity route /Search?entityId=<n> resolved.',
    expected: 'Settings requested for the entity; Advanced Filters offered; the drawer shows the criteria of the entity configuration; no "configuration not available" message.',
  }),

  // ---------- MF-3: enter values and operators ----------
  captureValuesOperators: tc(2, {
    severity: 'critical', name: 'Values and operators are captured keyed by field id and operator key',
    description: 'Verify the values and operators entered across the visible controls are captured as a criteria structure keyed by field ids and operator keys (MF-3).',
    condition: `${page}; Last Name operator "is not empty", First Name contains "${DATA.firstNamePart}".`,
    expected: 'Criteria hold { fieldId: "LastName", operatorKey: "isNotEmpty" } and { fieldId: "FirstName", operatorKey: "contains", values: "a" }.',
  }),

  // ---------- MF-4 / MF-5: Apply ----------
  applySerializes: tc(3, {
    severity: 'critical', name: 'Apply serializes the criteria to JSON',
    description: 'Verify clicking Apply serializes the captured criteria into JSON sent with the search (MF-4).',
    condition: `${page}; Last Name contains "${DATA.lastName}" entered; Apply clicked.`,
    expected: 'ResultsData sends criteriaJson: a JSON array whose entries carry fieldId, operatorKey and values; entity and advanced mode sent.',
  }),
  applyShowsMatches: tc(4, {
    severity: 'critical', name: 'Apply executes the search and shows the matching records',
    description: 'Verify Apply executes the search and the results grid shows the records matching the criteria (MF-4, MF-5).',
    condition: `${page}; Last Name contains "${DATA.lastName}" applied.`,
    expected: 'HTTP 200, no error, at least one record; every returned record\'s name contains the value; records rendered.',
  }),

  // ---------- MF-6: persist SearchHistory ----------
  persistOnApply: tc(5, {
    severity: 'critical', name: 'Applied criteria are stored as the last-used search',
    description: 'Verify the criteria JSON of the Apply is stored as {ModuleCode}.{Entity}.SearchHistory: the next visit searches with exactly the same criteria (MF-4, MF-6).',
    condition: `${page}; Last Name contains "${DATA.lastName}" + First Name contains "${DATA.firstNamePart}" applied; page reopened.`,
    expected: 'The on-load search sends the same criteria as the Apply.',
  }),
  keepLatestOnly: tc(6, {
    severity: 'critical', name: 'Only the most recent criteria are kept',
    description: 'Verify a second Apply replaces the stored criteria: only the latest is the effective "last used" (MF-4, MF-6).',
    condition: `${page}; Last Name "${DATA.lastName}" applied, then Last Name "${DATA.otherLastName}" + First Name operator "is not empty" applied; page reopened.`,
    expected: 'The on-load search sends the second criteria only; the first value is not restored.',
  }),
  scopedPerEntity: tc(7, {
    severity: 'normal', name: 'Stored criteria are scoped to the entity',
    description: 'Verify the stored criteria belong to the User + Entity combination: criteria applied on Person are not loaded on another entity (MF-6 Setting key scope).',
    condition: `${page}: Last Name "${DATA.lastName}" applied; then /Search?entityId=${OTHER_ENTITY} opened; then Person reopened.`,
    expected: 'The other entity does not search with Last Name; Person still restores it.',
  }),

  // ---------- MF-7: return to Advanced Search ----------
  restoreRehydrates: tc(8, {
    severity: 'critical', name: 'Returning restores the criteria into the controls',
    description: 'Verify the saved criteria are rehydrated into the UI when the user returns: values, operators and tags (MF-7).',
    condition: `${page}; Last Name contains "${DATA.lastName}" + First Name "is not empty" applied; page reopened.`,
    expected: 'Last Name control holds the value with operator "contains"; First Name operator shows "is not empty"; both shown as tags.',
  }),
  restoreAutoRuns: tc(9, {
    severity: 'critical', name: 'Returning re-runs the restored criteria and shows fresh results',
    description: 'Verify the restored criteria are executed on return without clicking Apply and fresh results are displayed (MF-7).',
    condition: `${page}; Last Name contains "${DATA.lastName}" applied; page reopened.`,
    expected: 'ResultsData sent on load with the restored criteria; same record count as the Apply; records rendered.',
  }),

  // ---------- Alternate / exception flows ----------
  noMatches: tc(10, {
    severity: 'critical', type: 'Negative', name: 'No matching records shows the empty state',
    description: 'Verify criteria that match no records display the empty state "No matching records found." (A1-1).',
    condition: `${page}; Last Name contains "${DATA.noMatch}" applied.`,
    expected: 'HTTP 200, 0 records, "No matching records found." shown, no records rendered.',
  }),
  invalidBlocked: tc(11, {
    severity: 'critical', type: 'Negative', name: 'Invalid criterion blocks the search and highlights the field',
    description: 'Verify a value violating the field validation blocks execution and the field is marked invalid (A2-1).',
    condition: `Message search (/Search?entityId=${DATE_ENTITY}); Message date range between ${DATA.invalidRange.start} and ${DATA.invalidRange.end} (start after end); Apply clicked.`,
    expected: 'No ResultsData request; the date range controls are marked invalid (red border).',
  }),
  invalidMessage: tc(17, {
    severity: 'normal', type: 'Negative', name: 'Invalid criterion shows an inline error message on the field',
    description: 'Verify the inline error references the field with a message, not only a highlight (A2-1 "show inline errors referencing the field").',
    condition: `Message search; Message date range between ${DATA.invalidRange.start} and ${DATA.invalidRange.end}; Apply clicked.`,
    expected: 'An error message (e.g. "Start must be on or before End") is shown under the date range.',
    defect: 'Only a red border is shown on the date inputs; no error message text tells the user what is wrong.',
  }),
  invalidNotPersisted: tc(12, {
    severity: 'critical', type: 'Negative', name: 'Invalid criteria are not stored',
    description: 'Verify criteria are not persisted while invalid: the last valid criteria remain the stored ones (A2-1 "do not persist until valid").',
    condition: `Message search; Message text "${DATA.messageText}" applied (valid); then the invalid date range added and Apply clicked; page reopened.`,
    expected: 'The on-load search sends Message text only - no date range criterion.',
  }),
  missingConfig: tc(13, {
    severity: 'critical', type: 'Negative', name: 'Missing Search configuration shows "not available" message',
    description: 'Verify an entity with no {ModuleCode}.{Entity}.SearchCriteria setting (and no Global fallback) shows "Advanced search configuration not available for this entity." (A3-1).',
    condition: `/Search?entityId=${NO_CONFIG_ENTITY} (no Search configuration in the sandbox).`,
    expected: 'Message shown; no Advanced Filters, no criteria; no search executed.',
  }),
  clearAllClears: tc(14, {
    severity: 'critical', name: 'Clear All clears every input and runs no search',
    description: 'Verify Clear All clears all criteria inputs and operators and does not run the search (A4-1).',
    condition: `${page}; Last Name contains "${DATA.lastName}" + First Name "is not empty" applied; Clear All (Reset) clicked.`,
    expected: 'Last Name empty; both operators back to "contains"; no ResultsData request within 4 s.',
  }),
  clearAllThenApply: tc(15, {
    severity: 'normal', name: 'After Clear All the search runs only on Apply, without the cleared criteria',
    description: 'Verify that after Clear All nothing runs (and nothing is stored) until Apply is clicked again, and that Apply then searches without the cleared criteria (A4-1).',
    condition: `${page}; Last Name "${DATA.lastName}" applied; Clear All clicked; page reopened; Clear All + Apply clicked.`,
    expected: 'Reopening before Apply still restores Last Name; the Apply after Clear All sends no Last Name.',
  }),
  clearAllLabel: tc(16, {
    severity: 'minor', name: 'The clear command is labelled "Clear All"',
    description: 'Verify the command that clears the criteria is offered as "Clear All" (A4-1 stimulus).',
    condition: `${page}; Advanced Filters drawer open.`,
    expected: 'A "Clear All" button is shown in the drawer.',
    defect: 'The command is labelled "Reset", not "Clear All" (confirm with the use-case owner whether the wording is binding).',
  }),
};

module.exports = { MODULE, ENTITY, OTHER_ENTITY, NO_CONFIG_ENTITY, DATE_ENTITY, ENTITIES, DATA, MESSAGES, cases };
