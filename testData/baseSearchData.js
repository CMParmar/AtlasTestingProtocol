const { env } = require('../utils/testData');
const { DATA: PERSON } = require('./personSearchData');

/**
 * 62383 CORE.Base Search Entity Records (docs/62383 Base Search Entity Records.md).
 * The baseline behaviour every /Search?entityId=<n> page shares: loading the stored search context, criteria tags,
 * Apply, layout / sort changes, persistence and the alternate flows. The flows are exercised on the Person search
 * (entityId 9, same values as personSearchData.js); MF-1 is repeated on several entities to show it is entity-independent.
 * The signed-in user's Person preferences and criteria are put back after every test.
 * Override in the root .env:
 *   BSE_ENTITY_ID            search page the flows run on                       (default 9 = Person)
 *   BSE_OTHER_ENTITY_ID      second page (criteria persisted per entity)        (default 10 = Project)
 *   BSE_NO_LIST_ENTITY_ID    entityId the signed-in user has NO List permission on (no default - AF-1 test skipped)
 *   SEARCH_PERSON_*          sandbox values, see testData/personSearchData.js
 */
const MODULE = 'Base Search';

const ENTITY = Number(process.env.BSE_ENTITY_ID || 9);
const OTHER_ENTITY = Number(process.env.BSE_OTHER_ENTITY_ID || 10);
const NO_LIST_ENTITY = process.env.BSE_NO_LIST_ENTITY_ID ? Number(process.env.BSE_NO_LIST_ENTITY_ID) : null;
/** Message search (62151) has the date-range criterion used for the invalid-value checks (start after end). */
const DATE_ENTITY = 18;

/** Entities MF-1 is checked on (entityId -> name). */
const ENTITIES = { 9: 'Person', 10: 'Project', 1: 'Account', 3: 'Company' };

const DATA = {
  lastName: PERSON.lastName,                 // shared by several people
  firstNamePart: 'a',                         // second criterion for the AND check
  broadLastName: 'a',                         // matches more people than one page (pagination)
  editedLastName: PERSON.lastName.slice(0, -1),
  noMatch: `${env.keyword}NoSuchRecord${env.runTag.replace(/\D/g, '')}`,
  invalidRange: { start: '2026-10-10', end: '2026-01-01' },
  validRange: { start: '2026-01-01', end: '2026-10-10' },
};

const MESSAGES = {
  noResults: /no (matching )?records( match)?/i,
  noPermission: /permission|not authori[sz]ed|access denied|forbidden/i,
  // the sort bar's own label says "Primary sort", so the error must say what is wrong with it
  primarySortMissing: /primary sort (is )?(not defined|missing|invalid|required)|search configuration error/i,
  error: /error|fail|unable|unavailable|SYS-\d+/i,
};

const tc = (no, def) => ({ id: `TC_BSE_${String(no).padStart(3, '0')}`, ...def });
const page = `Person search page (/Search?entityId=${ENTITY})`;

const cases = {
  // ---------- MF-1: load search context ----------
  loadContext: tc(1, {
    severity: 'critical', name: 'Search page loads its settings, controls and results for the entity',
    description: 'Verify indicating an entity opens its search page: settings are read, the criteria controls, criteria tags and both sort selectors are shown and the result set renders without pressing Apply (MF-1). Repeated per entity.',
    condition: 'Signed-in user with List permission on the entity.',
    expected: 'GetColumnPreferences requested for the entity; ResultsData requested on load for the same entity; Advanced Filters, primary and secondary sort selectors shown; results (or the no-records message) shown, no error.',
  }),
  loadLastCriteria: tc(2, {
    severity: 'critical', name: 'Last-used criteria are re-applied when the page opens',
    description: 'Verify the criteria of the last Apply are loaded as tags and the results are rendered with them the next time the page is opened (MF-1, MF-4 last step).',
    condition: `${page}; Last Name contains "${DATA.lastName}" applied, then the page reopened.`,
    expected: 'The on-load search sends Last Name contains the value; its tag is shown; the Last Name control holds the value.',
  }),
  loadLastLayout: tc(3, {
    severity: 'critical', name: 'Last-used layout is restored when the page opens',
    description: 'Verify the layout (Card / Grid) chosen last is used when the page is opened again (MF-1, MF-3).',
    condition: `${page}; Card view chosen, page reopened; then Grid chosen, page reopened.`,
    expected: 'Reopened in Card view after choosing Card, in Data Grid after choosing Grid.',
  }),
  loadLastSort: tc(4, {
    severity: 'critical', name: 'Last-used sort is restored when the page opens',
    description: 'Verify the primary and secondary sort chosen last are shown and used the next time the page opens (MF-1, MF-5).',
    condition: `${page} in Card view; primary sort = Email, secondary = Display Name; page reopened.`,
    defect: 'Sort-bar changes are never saved (no SaveColumnPreferences request); after reopening the sort is back to Full Name / None (same defect as TC_SRC_016).',
    expected: 'Sort selectors show Email / Display Name after reopening.',
  }),

  // ---------- MF-2: modify criteria ----------
  addNoSearch: tc(5, {
    severity: 'critical', name: 'Adding a criterion does not update the results',
    description: 'Verify entering a criterion value does not run the search (MF-2 "None of these actions ... update the result set").',
    condition: `${page}; criteria reset; Last Name typed.`,
    expected: 'No ResultsData request within 4 s of typing; results unchanged.',
  }),
  addShowsTag: tc(6, {
    severity: 'critical', name: 'An entered criterion appears as a removable tag',
    description: 'Verify each entered criterion appears as a removable tag summarising its value before Apply (MF-2).',
    condition: `${page}; criteria reset; Last Name contains "${DATA.lastName}" typed (not applied).`,
    defect: 'A criterion only appears as a tag after Apply; while it is entered (not applied) no tag is shown.',
    expected: 'A "Last Name: contains <value>" tag with a remove button is shown.',
  }),
  editNoSearch: tc(7, {
    severity: 'normal', name: 'Editing a criterion does not update the results; Apply uses the edited value',
    description: 'Verify changing an applied criterion value does not run the search, and the next Apply sends and tags the edited value (MF-2, MF-4).',
    condition: `${page}; Last Name "${DATA.lastName}" applied, then changed to "${DATA.editedLastName}".`,
    expected: 'No search on editing; after Apply the request and the tag carry the edited value.',
  }),
  removeTagClears: tc(8, {
    severity: 'critical', name: 'Removing a tag clears that criterion',
    description: 'Verify removing a criterion tag clears the criterion from the pending filter set (MF-2).',
    condition: `${page}; Last Name "${DATA.lastName}" applied; its tag removed.`,
    expected: 'Tag gone, Last Name control empty; the next Apply does not send Last Name.',
  }),
  removeTagNoSearch: tc(9, {
    severity: 'critical', name: 'Removing a tag does not update the results',
    description: 'Verify removing a criterion tag does not run the search; results change only on Apply (MF-2).',
    condition: `${page}; Last Name "${DATA.lastName}" applied; its tag removed.`,
    expected: 'No ResultsData request within 4 s of removing the tag.',
    defect: 'Removing a criterion tag immediately re-runs the search (ResultsData sent without that criterion) instead of waiting for Apply.',
  }),

  // ---------- MF-3 / MF-4 ----------
  layoutRunsSearch: tc(10, {
    severity: 'critical', name: 'Changing the layout runs the search with the current criteria',
    description: 'Verify switching Grid <-> Card executes MF-4: the search runs again with the active criteria in the new layout (MF-3).',
    condition: `${page} in Data Grid; Last Name "${DATA.lastName}" applied; switched to Card, then back to Grid.`,
    expected: 'Each switch sends ResultsData with the Last Name criterion and the new layout; the matching records are shown.',
  }),
  applyAllCriteria: tc(11, {
    severity: 'critical', name: 'Apply sends every active criterion',
    description: 'Verify Apply compiles all active criteria and executes the entity search with them (MF-4).',
    condition: `${page}; Last Name "${DATA.lastName}" and First Name "${DATA.firstNamePart}" entered.`,
    expected: 'One ResultsData request with both criteria for the entity; a tag per criterion; HTTP 200, no error.',
  }),
  andLogic: tc(12, {
    severity: 'critical', name: 'Criteria are combined with AND',
    description: 'Verify the records returned for two criteria are those matching both, never either (MF-4 AND logic).',
    condition: `${page}; Last Name "${DATA.lastName}" alone, First Name "${DATA.firstNamePart}" alone, then both.`,
    expected: 'Both-criteria total <= each single-criterion total; every record of the combined search is in the Last Name result.',
  }),
  persistPerEntity: tc(13, {
    severity: 'normal', name: 'Criteria are persisted per entity',
    description: 'Verify criteria applied on one entity\'s search are not loaded on another entity\'s search (MF-4 "for the user and entity").',
    condition: `${page}: Last Name "${DATA.lastName}" applied; then Project search (/Search?entityId=${OTHER_ENTITY}) opened.`,
    expected: 'Project\'s on-load search does not send Last Name; Person reopens with it.',
  }),

  // ---------- MF-5 ----------
  primarySortRuns: tc(14, {
    severity: 'critical', name: 'Changing the primary sort runs the search with the current criteria',
    description: 'Verify selecting a new primary sort executes MF-4: the search runs again with the active criteria and the new sort (MF-5).',
    condition: `${page} in Card view; Last Name "${DATA.lastName}" applied; primary sort set to Email.`,
    expected: 'ResultsData sent with Last Name and order on Email; results shown.',
  }),
  secondarySortRuns: tc(15, {
    severity: 'normal', name: 'Changing the secondary sort runs the search with both sorts',
    description: 'Verify selecting a secondary sort executes MF-4 with primary and secondary sort (MF-5).',
    condition: `${page} in Card view; secondary sort set to Display Name.`,
    expected: 'ResultsData order holds the primary sort then Display Name; criteria unchanged.',
  }),

  // ---------- MF-6 ----------
  pageNavigation: tc(16, {
    severity: 'normal', name: 'Page navigation shows the next page of results',
    description: 'Verify the user can move to the next page of the result set (MF-6).',
    condition: `${page} in Card view; Last Name contains "${'a'}" applied (more records than one page).`,
    expected: 'Next page requests start > 0 with the same criteria; different records are shown.',
  }),
  openRecord: tc(17, {
    severity: 'critical', name: 'Opening a result shows that record',
    description: 'Verify clicking a result opens the individual record for viewing / editing (MF-6).',
    condition: `${page} in Card view; Last Name "${DATA.lastName}" applied.`,
    expected: 'The Person record page (/Person/Edit/<id>) of the clicked result opens.',
  }),

  // ---------- Alternate flows ----------
  noPermission: tc(18, {
    severity: 'critical', type: 'Negative', name: 'No List permission blocks the search',
    description: 'Verify a user without List permission on the entity gets "Insufficient Permission to List Records" and sees no criteria controls or results (AF-1).',
    condition: 'BSE_NO_LIST_ENTITY_ID = an entity the signed-in user has no List permission on.',
    expected: 'Permission message shown; no Advanced Filters, no results; no records returned.',
  }),
  noResults: tc(19, {
    severity: 'critical', type: 'Negative', name: 'No matching records shows the no-results message and keeps the tags',
    description: 'Verify a search that matches nothing shows "No Records Match the Specified Criteria" and the criteria tags stay so the user can adjust and re-apply (AF-2).',
    condition: `${page}; Last Name "${DATA.noMatch}" applied.`,
    expected: 'HTTP 200, 0 records, no-records message shown, Last Name tag still shown, Apply still usable.',
  }),
  noResultsCard: tc(20, {
    severity: 'normal', type: 'Negative', name: 'No matching records in Card view shows the no-results message',
    description: 'Verify the no-results scenario is also shown when the layout is Card (AF-2).',
    condition: `${page}; Last Name "${DATA.noMatch}" applied, then switched to Card view.`,
    expected: 'No cards; no-records message shown; Last Name tag still shown.',  }),
  invalidHighlighted: tc(21, {
    severity: 'critical', type: 'Negative', name: 'Invalid criterion is highlighted and no search runs',
    description: 'Verify a criterion with an invalid value is highlighted and the search is not executed (AF-3).',
    condition: `Message search (/Search?entityId=${DATE_ENTITY}); Date Created between ${DATA.invalidRange.start} and ${DATA.invalidRange.end} (start after end); Apply clicked.`,
    expected: 'Date controls marked invalid; no ResultsData request.',
  }),
  invalidDisablesApply: tc(22, {
    severity: 'normal', type: 'Negative', name: 'Invalid criterion disables Apply until it is fixed',
    description: 'Verify the Apply command is disabled while a criterion is invalid and enabled again once it is corrected (AF-3).',
    condition: `Message search; Date Created between ${DATA.invalidRange.start} and ${DATA.invalidRange.end}.`,
    defect: 'Apply stays enabled while the date range is invalid (start after end); clicking it only marks the fields and runs no search.',
    expected: 'Apply disabled while start > end; enabled after the range is corrected.',
  }),
  invalidFixed: tc(23, {
    severity: 'normal', name: 'Correcting the invalid criterion lets the search run',
    description: 'Verify once the invalid value is corrected the highlight clears and Apply executes the search (AF-3 "until the validation error is resolved").',
    condition: `Message search; invalid range entered, then corrected to ${DATA.validRange.start} - ${DATA.validRange.end}.`,
    expected: 'Invalid marking removed; Apply sends ResultsData with the corrected range; HTTP 200.',
  }),
  primarySortMissing: tc(24, {
    severity: 'critical', type: 'Negative', name: 'Settings without a primary sort raise a configuration error',
    description: 'Verify that when the stored settings have no primary sort the page raises "Search Configuration Error - Primary Sort Not Defined" (MF-1, AF-4).',
    condition: `${page}; preferences stored with sort = null (grid and card).`,
    defect: 'Settings without a primary sort raise no error: the page silently falls back to Full Name ASC (same defect as TC_SRC_025).',
    expected: 'A primary-sort configuration error is shown.',
  }),
  saveFailure: tc(25, {
    severity: 'normal', type: 'Negative', name: 'Preference save failure keeps the results and shows no message',
    description: 'Verify that when persisting preferences fails the results keep being shown and no message is displayed to the user (AF-5).',
    condition: `${page}; POST SaveColumnPreferences answered with HTTP 500; layout switched and primary sort changed.`,
    expected: 'Results still rendered after each change; no error toast / message shown.',
  }),
};

module.exports = { MODULE, ENTITY, OTHER_ENTITY, NO_LIST_ENTITY, DATE_ENTITY, ENTITIES, DATA, MESSAGES, cases };
