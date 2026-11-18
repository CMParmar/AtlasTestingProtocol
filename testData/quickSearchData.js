const { env } = require('../utils/testData');
const { DATA: PERSON } = require('./personSearchData');

/**
 * 62466 CORE.Execute Quick Search (docs/62466 Execute Quick Search Use Case.md).
 * Top-bar Quick Search with Record Type "Person" (entityId 9). Only the Quick Search divergences from 62200 are
 * tested here; the inherited Advanced Search behaviour is covered by advanced-search.spec.js / base-search.spec.js.
 * Override in the root .env:
 *   QS_DEBOUNCE_MS             CORE.Search.QuickSearchDebounceMilliseconds expected (default 350 - spec default)
 *   QS_MIN_LENGTH              CORE.Search.QuickSearchMinimumLength expected        (default 2 - spec default)
 *   QS_NO_HISTORY_ENTITY_ID    entity the user has never Quick-Searched (AF-1)       (default 14 = Deliverable Type)
 *   QS_NO_HISTORY_SCOPE        its Record Type label                                 (default "Deliverable Type")
 *   QS_SINGLE_MATCH_TEXT       text exactly one person matches                       (default "Kalpesh Patel")
 *   SEARCH_PERSON_*            sandbox values, see personSearchData.js
 */
const MODULE = 'Quick Search';

const ENTITY = 9;
const SCOPE = 'Person';
const OTHER_ENTITY = 10; // Project - history must stay per entity
const NO_HISTORY_ENTITY = Number(process.env.QS_NO_HISTORY_ENTITY_ID || 14);
const NO_HISTORY_SCOPE = process.env.QS_NO_HISTORY_SCOPE || 'Deliverable Type';

const SETTINGS = {
  debounce: Number(process.env.QS_DEBOUNCE_MS || 350),
  minLength: Number(process.env.QS_MIN_LENGTH || 2),
};

const DATA = {
  text: PERSON.lastName,                      // matches several people
  otherText: PERSON.firstName,                // a second, different criterion
  singleMatch: process.env.QS_SINGLE_MATCH_TEXT || 'Kalpesh Patel',
  broadText: 'a',                             // matches many people (relevance order over a full page)
  noPkMatch: '999999999',                     // integer no Person record has as its key
  tag: `${env.keyword}${env.runTag.replace(/\D/g, '')}`, // unique text (no results) to mark the history
};

const MESSAGES = {
  noCriterion: /no quick search criterion available/i,
  execFailed: /quick search execution failed/i,
};

const tc = (no, def) => ({ id: `TC_QS_${String(no).padStart(3, '0')}`, ...def });
const start = `Signed-in user on a page with the top bar; Record Type "${SCOPE}"; Quick Search input empty`;

const cases = {
  // ---------- Settings ----------
  settingsDefaults: tc(1, {
    severity: 'critical', name: 'Quick Search runs with the debounce and minimum-length settings',
    description: `Verify the page applies CORE.Search.QuickSearchDebounceMilliseconds (default ${SETTINGS.debounce}) and CORE.Search.QuickSearchMinimumLength (default ${SETTINGS.minLength}) (6 Relevant Settings).`,
    condition: 'Any signed-in page; window.sessionConfig read.',
    expected: `qsDebounceMilliseconds = ${SETTINGS.debounce}, qsMinimumLength = ${SETTINGS.minLength}.`,
    // 2026-11-12: minimum length fixed (2); debounce is now 750 ms. If 750 is the agreed value, set QS_DEBOUNCE_MS=750
    // in .env and remove this defect.
    defect: 'The page runs with qsDebounceMilliseconds = 750 instead of the 350 ms default of CORE.Search.QuickSearchDebounceMilliseconds.',
  }),

  // ---------- MF-1: automatic ----------
  autoRuns: tc(2, {
    severity: 'critical', name: 'Typing runs a Quick Search without clicking (QS-1)',
    description: 'Verify the system conducts a Quick Search automatically after the user types and stops (MF-1).',
    condition: `${start}; "${DATA.text}" typed, nothing clicked.`,
    expected: 'The Quick Search results page opens for Person with the typed text and results are requested.',
  }),
  autoUsesFullText: tc(3, {
    severity: 'critical', name: 'No search while the user is still typing - the full text is searched',
    description: `Verify no search runs between keystrokes typed faster than the debounce (${SETTINGS.debounce} ms) and the search uses the complete text (MF-1 "after the user has stopped typing").`,
    condition: `${start}; "${DATA.text}" typed one key every 80 ms.`,
    expected: 'Exactly one Quick Search, with the full text.',
  }),
  autoWaitsDebounce: tc(4, {
    severity: 'normal', name: 'The automatic search waits the debounce interval',
    description: `Verify the automatic search starts no sooner than CORE.Search.QuickSearchDebounceMilliseconds (${SETTINGS.debounce} ms) after the last input (MF-1).`,
    condition: `${start}; "${DATA.text}" entered in one input event; time until the Quick Search page is requested measured.`,
    expected: `The search starts >= ${SETTINGS.debounce} ms after the input.`,
  }),
  belowMinLength: tc(5, {
    severity: 'critical', type: 'Negative', name: 'Text shorter than the minimum length runs no automatic search',
    description: `Verify fewer than CORE.Search.QuickSearchMinimumLength (${SETTINGS.minLength}) characters do not start a search; the system waits for more input (MF-1).`,
    condition: `${start}; one character typed; 4 s waited.`,
    expected: 'No Quick Search runs; the user stays on the page.',
  }),

  // ---------- MF-2: manual ----------
  manualWithText: tc(6, {
    severity: 'critical', name: 'Magnifier runs a Quick Search with the entered text (QS-2)',
    description: 'Verify clicking the Quick Search command with text in the input conducts a Quick Search with that text (MF-2).',
    condition: `${start}; "${DATA.text}" in the input (no typing events); magnifier clicked.`,
    expected: 'Quick Search results page opens with the text; results requested for Person.',
  }),
  manualEnter: tc(7, {
    severity: 'normal', name: 'Enter runs a Quick Search with the entered text',
    description: 'Verify pressing Enter in the input initiates the same manual Quick Search (MF-2).',
    condition: `${start}; "${DATA.text}" in the input; Enter pressed.`,
    expected: 'Quick Search results page opens with the text.',
  }),
  manualEmptyHistory: tc(8, {
    severity: 'critical', name: 'Magnifier with an empty input re-runs the stored QuickSearchHistory (QS-3)',
    description: 'Verify an empty input + magnifier retrieves the last criterion from {ModuleCode}.{Entity}.QuickSearchHistory, runs the search with it and shows it in the input (MF-2).',
    condition: `Person Quick Search for "${DATA.text}" run earlier; then ${start}; magnifier clicked.`,
    expected: 'History read for Person; Quick Search runs with the stored text; the input shows it.',
  }),
  manualEmptyNoHistory: tc(9, {
    severity: 'critical', type: 'Negative', name: 'Magnifier with an empty input and no history raises "No Quick Search criterion available" (QS-4)',
    description: 'Verify an empty input + magnifier with no QuickSearchHistory for the entity invokes CORE-174 and executes no search (MF-2, AF-1).',
    condition: `Record Type "${NO_HISTORY_SCOPE}" (entityId ${NO_HISTORY_ENTITY}, never Quick-Searched by the user); input empty; magnifier clicked.`,
    expected: '"No Quick Search criterion available." shown; no search; the user stays on the page.',
  }),

  // ---------- MF-2.5: direct record match ----------
  pkOpensRecord: tc(10, {
    severity: 'critical', name: 'Integer equal to a record key opens that record',
    description: 'Verify an Integer Candidate matching the primary key of a visible, authorised Person opens that record immediately, without the results surface (MF-2.5 Direct Record Load).',
    condition: `${start}; the Record ID of a Person (taken from a "${DATA.text}" search) entered; magnifier clicked.`,
    expected: 'The key is checked for Person; /Person/Edit/<id> opens; no Quick Search results page.',
  }),
  pkTrimmed: tc(11, {
    severity: 'normal', name: 'Integer with surrounding spaces is trimmed before the key match',
    description: 'Verify the value is trimmed before Integer Candidate evaluation (MF-2.5 "The system trims the entered value").',
    condition: `${start}; " <Record ID> " entered; magnifier clicked.`,
    expected: 'The record opens.',
  }),
  pkLeadingZeros: tc(12, {
    severity: 'normal', name: 'Integer with leading zeros is matched as the same key',
    description: 'Verify a digits-only value with leading zeros is an Integer Candidate whose base-10 value is matched against the primary key (7 Language: Integer Candidate / Direct Record Match).',
    condition: `${start}; "0<Record ID>" entered; magnifier clicked.`,
    expected: 'The key lookup is made for <Record ID> and that record opens.',
    defect: 'Leading zeros skip the key lookup (no PkExactMatch call); a text search runs instead and opened another record (e.g. "012" opened Person 11).',
  }),
  pkNoMatch: tc(13, {
    severity: 'critical', name: 'Integer matching no record runs the standard Quick Search',
    description: 'Verify an Integer Candidate that matches no record continues with standard Quick Search execution (MF-2.5).',
    condition: `${start}; "${DATA.noPkMatch}" entered; magnifier clicked.`,
    expected: 'The key is checked; the Quick Search results page opens with the text.',
  }),
  notIntegerCandidate: tc(14, {
    severity: 'critical', name: 'Signed / decimal / mixed values are not treated as integers',
    description: 'Verify values with a sign, decimal or letters are not Integer Candidates: no key lookup, standard Quick Search (7 Language: Integer Candidate; MF-2.5).',
    condition: `${start}; "+<id>", "<id>.0", "<id>a" entered in turn; magnifier clicked.`,
    expected: 'No key lookup for any of them; each runs the standard Quick Search with the text.',
  }),
  pkHistory: tc(15, {
    severity: 'normal', name: 'Direct Record Load is stored as the Quick Search history',
    description: 'Verify a Direct Record Load counts as a successful Quick Search for history: the integer becomes the QuickSearchHistory (MF-2.5 last rule, MF-4).',
    condition: `Person history = "${DATA.text}"; then the Record ID of a Person entered and the record opened.`,
    expected: 'GetQuickSearchHistory for Person returns the integer.',
    defect: 'The history is not updated by a Direct Record Load: it still holds the previous text.',
  }),
  singleTextMatch: tc(16, {
    severity: 'normal', name: 'Text matching exactly one record still shows the results',
    description: 'Verify only an integer primary-key match opens a record directly; any other criterion shows the normal results surface, even with one match (3 Goal, MF-2.5 "proceeds to MF-3").',
    condition: `${start}; "${DATA.singleMatch}" (one matching person) entered; magnifier clicked.`,
    expected: 'The Quick Search results page stays open with one result.',
    defect: 'A Quick Search with exactly one result opens that record (/Person/Edit/<id>) instead of showing the results.',
  }),

  // ---------- MF-3: sort ----------
  defaultRelevance: tc(17, {
    severity: 'critical', name: 'Relevance is the default Quick Search sort (QS-5)',
    description: 'Verify that without a stored QuickSearchResult sort the Quick Search results are sorted by Relevance (MF-3).',
    condition: `Person Quick Search for "${DATA.text}".`,
    expected: 'Primary sort shows Relevance; the search is sent without a column order (relevance order).',
  }),
  relevanceOrder: tc(25, {
    severity: 'critical', name: 'Relevance-sorted results show the best matches first',
    description: 'Verify that with the Relevance sort the records are ordered by their relevance score, highest first (7 Language: Relevance; MF-3).',
    condition: `Person Quick Search for "${DATA.text}" and for "${DATA.broadText}" with the default Relevance sort.`,
    expected: 'RelevanceScore of the rows shown is in descending order.',
    defect: 'Rows are not ordered by RelevanceScore: "Patel" returns 1400, 1400, 1400, 2100 (best match last) and "a" shows two 0-score rows before the 400-score rows.',
  }),
  relevanceOnlyQuick: tc(18, {
    severity: 'normal', name: 'Relevance can be chosen as primary or secondary sort only in Quick Search',
    description: 'Verify Relevance is offered in the primary and secondary sort of Quick Search and not in Advanced Search (MF-3).',
    condition: `Person Quick Search page, then Person Advanced Search page (Card view).`,
    expected: 'Quick Search: Relevance in both sort lists. Advanced Search: no Relevance.',
  }),
  userSort: tc(19, {
    severity: 'normal', name: 'The user can change the Quick Search sort',
    description: 'Verify the user can configure the primary sort of Quick Search as in Advanced Search (MF-3).',
    condition: `Person Quick Search for "${DATA.text}"; primary sort set to Full Name.`,
    expected: 'The search runs again ordered by Full Name with the same Quick Search criterion.',
  }),

  // ---------- MF-4: persistence ----------
  historyStored: tc(20, {
    severity: 'critical', name: 'The Quick Search criterion is stored as QuickSearchHistory per entity (QS-6)',
    description: 'Verify a successful Quick Search stores its criterion in {ModuleCode}.{Entity}.QuickSearchHistory for the user and entity (MF-4).',
    condition: `Person Quick Search for a unique text; Project history read before and after.`,
    expected: 'Person history = the text; Project history unchanged.',
  }),
  sortStored: tc(21, {
    severity: 'normal', name: 'A changed Quick Search sort is stored and used next time (QS-6)',
    description: 'Verify a sort changed during a Quick Search is stored in {ModuleCode}.{Entity}.QuickSearchResult and applied to the next Quick Search (MF-3, MF-4).',
    condition: `Person Quick Search; primary sort set to Full Name; Quick Search for "${DATA.otherText}" run.`,
    expected: 'The preferences are saved (searchMode quick); the next Quick Search is sorted by Full Name.',
    defect: 'Changing the Quick Search sort saves nothing (no SaveColumnPreferences request); the next Quick Search is back on Relevance.',
  }),
  independentFromAdvanced: tc(22, {
    severity: 'critical', name: 'Quick Search history is independent of Advanced Search history (QS-6)',
    description: 'Verify Quick Search does not change {ModuleCode}.{Entity}.SearchHistory and Advanced Search does not change QuickSearchHistory (MF-4).',
    condition: `Person: Advanced criteria Last Name "${DATA.text}" applied; Quick Search for a unique text; Advanced page reopened; Advanced criteria changed.`,
    expected: 'Advanced reopens with Last Name only; Quick history keeps the unique text after the Advanced change.',
  }),

  // ---------- MF-5: inherited ----------
  inheritsResults: tc(23, {
    severity: 'normal', name: 'Quick Search results use the Advanced Search result surface (QS-7)',
    description: 'Verify the Quick Search results offer the inherited behaviour: Card / Grid layouts, column customisation and paging (MF-5).',
    condition: `Person Quick Search for "${DATA.text}"; switched to Data Grid and back.`,
    expected: 'Both layouts render the same records for the Quick Search criterion; Customise Table View and the page size are offered.',
  }),

  // ---------- AF-2 ----------
  execFailed: tc(24, {
    severity: 'critical', type: 'Negative', name: 'A failed Quick Search raises "Quick Search execution failed" (QS-8)',
    description: 'Verify a system error during Quick Search execution invokes CORE-175 Quick Search Execution Failed (AF-2).',
    condition: `Person Quick Search for "${DATA.text}"; POST /Search/ResultsData answered with HTTP 500.`,
    expected: '"Quick Search execution failed." shown; no results.',
    defect: 'A generic "We\'re sorry, something went wrong. Please try again later." is shown instead of the Quick Search Execution Failed scenario (the app ships that text as Quick_Search_Execution_Failed).',
  }),
};

module.exports = { MODULE, ENTITY, SCOPE, OTHER_ENTITY, NO_HISTORY_ENTITY, NO_HISTORY_SCOPE, SETTINGS, DATA, MESSAGES, cases };
