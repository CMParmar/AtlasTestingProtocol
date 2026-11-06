const { env } = require('../utils/testData');

/**
 * 62151 Conversation Message Search Configuration (docs/62151 Conversation Message Search Configuration.md).
 * Search is read-only: no records are created. The tests search the messages that already exist in the sandbox,
 * so the names below must exist there. Override any of them in the root .env:
 *   SEARCH_MESSAGE_TERM         word found in many messages                     (default "alpha")
 *   SEARCH_AUTHOR_NAME          Person who authored messages                    (default "Kiran Patel")
 *   SEARCH_ACCOUNT_NAME         Account with messages under it                  (default "Equine")
 *   SEARCH_PROJECT_NAME         Project of SEARCH_ACCOUNT_NAME with messages    (default "Accept Association Numbers")
 *   SEARCH_OTHER_ACCOUNT_NAME   Account the project does NOT belong to          (default "Atlas")
 *   SEARCH_DATE_FROM / _TO      range that contains messages (yyyy-mm-dd)       (default 2026-10-01 .. 2026-10-16)
 */
const MODULE = 'Message Search';

const DATA = {
  term: process.env.SEARCH_MESSAGE_TERM || 'alpha',
  author: process.env.SEARCH_AUTHOR_NAME || 'Kiran Patel',
  account: process.env.SEARCH_ACCOUNT_NAME || 'Equine',
  project: process.env.SEARCH_PROJECT_NAME || 'Accept Association Numbers',
  otherAccount: process.env.SEARCH_OTHER_ACCOUNT_NAME || 'Atlas',
  // LIKE wildcards inside otherwise normal text (Quick Search ignores 1-character text)
  wildcards: ['50%', 'a_b'],
  dateFrom: process.env.SEARCH_DATE_FROM || '2026-10-01',
  dateTo: process.env.SEARCH_DATE_TO || '2026-10-16',
  // text no message contains (keyword + run tag keeps it unique)
  noMatch: `${env.keyword}NoSuchMessage${env.runTag.replace(/\D/g, '')}`,
};

/** Criteria labels of the Advanced Filters drawer (2.1 - 2.7). */
const FILTER_LABELS = ['Message text', 'Message source', 'Author', 'Message date range', 'Entity type', 'Account scope', 'Project scope'];

/** Message Source toggle (2.5): label -> value of ConversationMessage.isSystemGenerated (null = no filter). */
const SOURCES = { all: 'All', system: 'Only System messages', human: 'Only Human messages' };

/** Entity types the spec names explicitly (2.2). */
const REQUIRED_ENTITY_TYPES = ['Account', 'Project', 'Service'];

const MESSAGES = {
  selectFromList: /please select a value from the list/i,
  startAfterEnd: /start must be <= end|start.*(before|<=|on or before).*end/i,
  serverError: /exception|stack trace|sql|server error|something went wrong/i,
};

const tc = (no, def) => ({ id: `TC_MSG_${String(no).padStart(3, '0')}`, ...def });

const cases = {
  // ---------- 1. Quick Search ----------
  quickScope: tc(1, {
    severity: 'critical', name: 'Quick Search with Record Type "Message" runs a message search',
    description: 'Verify the top-bar Quick Search offers the "Message" record type and searches ConversationMessage.MessageText with Contains (1, 1.1).',
    condition: `Signed-in user; messages containing "${DATA.term}" exist.`,
    expected: 'Search page opens for entity 18 (Message); criterion messageText contains <term> is sent; results are shown and "Results:" equals the total returned.',
  }),
  quickContains: tc(2, {
    severity: 'critical', name: 'Quick Search returns only messages containing the text',
    description: 'Verify every returned message contains the search text (1.1 Contains / Like).',
    condition: `Messages containing "${DATA.term}" exist.`,
    expected: 'Every result row\'s message text contains the search text (case-insensitive).',
  }),
  quickCase: tc(3, {
    severity: 'normal', name: 'Quick Search is case-insensitive',
    description: 'Verify lower-, upper- and mixed-case spellings of the same text return the same messages (general rule: case-insensitive matching).',
    condition: `Messages containing "${DATA.term}" exist.`,
    expected: 'The same total and the same first page of messages for every spelling.',
  }),
  quickRows: tc(4, {
    severity: 'normal', name: 'Quick Search returns one row per message (no grouping)',
    description: 'Verify results are individual ConversationMessage rows, not grouped by conversation (1.1, 6, 10).',
    condition: `Messages containing "${DATA.term}" exist.`,
    expected: 'Every card is one message with its own Record ID; no Record ID repeats; one card per returned row.',
  }),
  quickNoMatch: tc(5, {
    type: 'Negative', severity: 'normal', name: 'Quick Search with text no message contains',
    description: 'Verify a search that matches nothing returns an empty result without an error.',
    condition: 'No message contains the generated text.',
    expected: '"Results: 0", no cards and no error message.',
  }),
  quickWildcard: tc(6, {
    defect: 'The search text goes into SQL LIKE unescaped, so % and _ act as wildcards ("50%" returns messages without "50%").',
    type: 'Negative', severity: 'normal', name: 'Quick Search treats % and _ as literal characters',
    description: 'Verify LIKE wildcard characters typed by the user are matched literally (Contains), not as wildcards.',
    condition: 'Search text "50%" and "a_b" (a single character does not start a search).',
    expected: 'Only messages that contain the literal character are returned (not every message).',
  }),
  quickXss: tc(7, {
    type: 'Negative', severity: 'critical', name: 'Quick Search with a script tag is not executed',
    description: 'Verify HTML / script typed into Quick Search is treated as text.',
    condition: 'Search text <script>alert(1)</script>.',
    expected: 'No browser dialog, no server error; the search completes normally.',
  }),
  quickSql: tc(8, {
    type: 'Negative', severity: 'critical', name: 'Quick Search with SQL injection text',
    description: 'Verify SQL syntax typed into Quick Search is treated as text.',
    condition: "Search text ' OR 1=1 --",
    expected: 'HTTP 200, no server error, and only messages that contain the literal text (normally none).',
  }),
  quickEmpty: tc(9, {
    type: 'Negative', severity: 'minor', name: 'Quick Search with empty text',
    description: 'Verify searching with an empty Quick Search box is handled gracefully.',
    condition: 'Quick Search box left empty, Record Type = Message.',
    expected: 'No server error or error page; the user stays on a working page.',
  }),

  // ---------- 2. Advanced Search ----------
  advOpen: tc(10, {
    severity: 'critical', name: 'Advanced Search shows every message criterion',
    description: 'Verify Advanced Search opens from the Quick Search filter icon and offers Message text, Message source, Author, Date range, Entity type, Account scope and Project scope (2).',
    condition: 'Record Type = Message.',
    expected: 'Search page for entity 18 opens; the Advanced Filters drawer lists all seven criteria with Apply and Reset.',
  }),
  advText: tc(11, {
    severity: 'normal', name: 'Advanced Message text matches Quick Search',
    description: 'Verify the Advanced Message text criterion behaves the same as Quick Search (2.1 "Same as 1.1").',
    condition: `Messages containing "${DATA.term}" exist.`,
    expected: 'Same total and same first page of messages as the Quick Search for the same text.',
  }),
  advEntityOptions: tc(12, {
    severity: 'normal', name: 'Entity type dropdown: options and default',
    description: 'Verify the Entity type criterion is a single-select dropdown offering Account, Project and Service, and that by default it does not filter (2.2 Default All).',
    condition: 'Advanced Filters drawer after Reset.',
    expected: 'Account, Project and Service are offered; the control is single-select; applying without a choice sends no Entity type criterion.',
  }),
  advEntityAccount: tc(13, {
    severity: 'normal', entityType: 'Account', name: 'Entity type = Account returns only Account conversations',
    description: 'Verify Entity type filters by Conversation.EntityIDF (2.2).', condition: 'Messages exist on Account conversations.',
    expected: 'Every result has Entity Type Account.',
  }),
  advEntityProject: tc(14, {
    severity: 'normal', entityType: 'Project', name: 'Entity type = Project returns only Project conversations',
    description: 'Verify Entity type filters by Conversation.EntityIDF (2.2).', condition: 'Messages exist on Project conversations.',
    expected: 'Every result has Entity Type Project.',
  }),
  advEntityService: tc(15, {
    severity: 'normal', entityType: 'Service', name: 'Entity type = Service returns only Service conversations',
    description: 'Verify Entity type filters by Conversation.EntityIDF (2.2).', condition: 'Messages exist on Service conversations.',
    expected: 'Every result has Entity Type Service.',
  }),
  accountScope: tc(16, {
    severity: 'critical', name: 'Account Scope includes messages of objects under the Account',
    description: 'Verify Account Scope resolves a specific AccountID and is transitive downward: messages of Projects / Services under the Account are included (2.3).',
    condition: `Account "${DATA.account}" has Service / Project messages.`,
    expected: 'RootAccountID = <account id> is sent; results are returned and include entity types other than Account.',
  }),
  accountNarrows: tc(17, {
    severity: 'normal', name: 'Account Scope narrows a text search',
    description: 'Verify Account Scope limits the results of a text search to that Account (2.3).',
    condition: `Messages containing "${DATA.term}" exist in and outside "${DATA.account}".`,
    expected: 'Text + Account Scope total <= text-only total.',
  }),
  accountFreeText: tc(18, {
    type: 'Negative', severity: 'normal', name: 'Account Scope requires an Account chosen from the list',
    description: 'Verify Account Scope must return a specific AccountID: free text that is not picked from the lookup is rejected (2.3).',
    condition: 'Account Scope = text that matches no Account, not picked from the list.',
    expected: '"Please select a value from the list" is shown and no Account-scoped search runs.',
  }),
  projectScope: tc(19, {
    severity: 'critical', name: 'Project Scope returns the Project\'s messages',
    description: 'Verify Project Scope resolves a specific ProjectID and returns messages under that Project (2.4).',
    condition: `Project "${DATA.project}" has messages.`,
    expected: 'ProjectScopeProjectID = <project id> is sent and results are returned.',
  }),
  projectInAccount: tc(20, {
    severity: 'critical', name: 'Project Scope further narrows Account Scope',
    description: 'Verify that with both scopes the Project narrows the Account: Account-level messages are excluded (2.4 Notes).',
    condition: `Project "${DATA.project}" belongs to Account "${DATA.account}".`,
    expected: 'Account + Project total = Project-only total and <= Account-only total; no row has Entity Type Account.',
  }),
  projectOtherAccount: tc(21, {
    type: 'Negative', severity: 'normal', name: 'Project Scope with an Account it does not belong to',
    description: 'Verify combining a Project with an unrelated Account returns nothing (both scopes apply).',
    condition: `Project "${DATA.project}" does not belong to Account "${DATA.otherAccount}".`,
    expected: 'No results and no error.',
  }),
  sourceSystem: tc(22, {
    severity: 'normal', name: 'Messages Source = Only System messages',
    description: 'Verify only system-generated messages are returned (2.5 isSystemGenerated = 1).',
    condition: 'System messages exist.', expected: 'Every result has Message Source = system (true).',
  }),
  sourceHuman: tc(23, {
    severity: 'normal', name: 'Messages Source = Only Human messages',
    description: 'Verify only human messages are returned (2.5 isSystemGenerated = 0).',
    condition: `Human messages containing "${DATA.term}" exist.`, expected: 'Every result has Message Source = human (false).',
  }),
  sourceAll: tc(24, {
    severity: 'normal', name: 'Messages Source = All ignores isSystemGenerated',
    description: 'Verify "All" (default) returns system and human messages (2.5).',
    condition: `Messages containing "${DATA.term}".`, expected: 'All total = System total + Human total.',
  }),
  author: tc(25, {
    severity: 'critical', name: 'Author returns only that person\'s messages',
    description: 'Verify Author filters by ConversationMessage.AuthorPersonID (2.6).',
    condition: `"${DATA.author}" authored messages.`,
    expected: 'AuthorPersonID = <person id> is sent; every result has that Author.',
  }),
  authorNoSystem: tc(26, {
    severity: 'normal', name: 'Author excludes system messages whatever the Message Source',
    description: 'Verify system messages are not included when an Author is selected, regardless of Message Source (2.6 Notes).',
    condition: `"${DATA.author}" authored messages; system messages exist.`,
    expected: 'Author + Only System messages returns nothing; Author + All returns no system message.',
  }),
  authorFreeText: tc(27, {
    type: 'Negative', severity: 'normal', name: 'Author requires a Person chosen from the list',
    description: 'Verify the Author criterion only accepts a Person picked from the lookup (2.6 returns PersonID).',
    condition: 'Author = text that matches no Person, not picked from the list.',
    expected: '"Please select a value from the list" is shown and no Author-filtered search runs.',
  }),
  dateRange: tc(28, {
    severity: 'critical', name: 'Date Range returns messages created within the range',
    description: 'Verify the Date Range criterion limits results by ConversationMessage.DateCreatedUtc (2.7).',
    condition: `Messages exist between ${DATA.dateFrom} and ${DATA.dateTo}.`,
    expected: 'Results are returned and every message date is within the range.',
  }),
  dateStartInclusive: tc(29, {
    severity: 'normal', name: 'Date Range Start Date is inclusive',
    description: 'Verify a message created on the Start Date is returned (2.7 Start Date inclusive).',
    condition: 'The newest message matching the search text; Start Date = its creation date.',
    expected: 'That message is in the results.',
  }),
  dateEndInclusive: tc(30, {
    defect: 'End Date is exclusive: messages created on the End Date are not returned (Start = End returns nothing).',
    severity: 'critical', name: 'Date Range End Date is inclusive',
    description: 'Verify a message created on the End Date (any time that day) is returned (2.7 End Date inclusive).',
    condition: 'The newest message matching the search text; End Date = its creation date.',
    expected: 'That message is in the results (also when Start Date = End Date).',
  }),
  dateReversed: tc(31, {
    defect: 'A reversed range is blocked, but its message "Start must be <= End" stays hidden (display: none).',
    type: 'Negative', severity: 'normal', name: 'Date Range with End Date before Start Date',
    description: 'Verify a reversed range is rejected or returns nothing, without an error.',
    condition: `Start ${DATA.dateTo}, End ${DATA.dateFrom}.`,
    expected: 'A validation message or "Results: 0"; no server error.',
  }),
  datePresets: tc(32, {
    severity: 'minor', name: 'No relative date presets in v1',
    description: 'Verify relative / preset ranges such as "Last 30 days" are not exposed (2.7 Notes).',
    condition: 'Advanced Filters drawer.', expected: 'Message date range offers no "in last / in next / last N days" option.',
  }),
  combined: tc(33, {
    severity: 'critical', name: 'All criteria together are combined with AND',
    description: 'Verify text, Message Source, Author, Entity type and Date Range applied together all restrict the results (2).',
    condition: `"${DATA.author}" authored human messages on Service conversations containing "${DATA.term}".`,
    expected: 'Every result satisfies every criterion; the total is <= each single-criterion search.',
  }),
  reset: tc(34, {
    severity: 'normal', name: 'Reset clears every criterion',
    description: 'Verify Reset removes the entered criteria from the Advanced Filters drawer.',
    condition: 'Text, Message Source, Author and Entity type entered.',
    expected: 'After Reset the text and Author are empty and the dropdowns show their placeholder.',
  }),
  advEmpty: tc(35, {
    type: 'Negative', severity: 'minor', name: 'Apply with no criteria',
    description: 'Verify applying an empty Advanced Search is handled gracefully.',
    condition: 'All criteria empty.', expected: 'Either results or a friendly message; no server error.',
  }),

  // ---------- 4. ordering / 6. display / 7. fields / 9. permissions ----------
  ordering: tc(36, {
    severity: 'critical', name: 'Results ordered newest first, then by Message ID',
    description: 'Verify ordering DateCreatedUtc DESC, then ConversationMessageID DESC (4).',
    condition: `Messages containing "${DATA.term}".`, expected: 'Every row is not newer than the one before it; ties are broken by the higher ID first.',
  }),
  paging: tc(37, {
    severity: 'critical', name: 'Pagination is stable: no duplicate or missing rows',
    description: 'Verify page 2 continues page 1 in the same order with no duplicates (4).',
    condition: `More than one page of messages containing "${DATA.term}".`,
    expected: 'No Record ID appears on both pages; the first row of page 2 sorts after the last row of page 1.',
  }),
  cardOnly: tc(38, {
    severity: 'normal', name: 'Results use Card view only (Grid disabled)',
    description: 'Verify message results are shown as cards and Grid view is not available (6).',
    condition: `Messages containing "${DATA.term}".`, expected: 'Card container shown with cards; grid table hidden; no "Customize Table View" control.',
  }),
  cardFields: tc(39, {
    severity: 'critical', name: 'Result card shows Entity Type, message, Author and timestamp',
    description: 'Verify each card shows Entity Type, the message snippet, the Author and the message date & time (7).',
    condition: `Messages containing "${DATA.term}".`, expected: 'Every card shows Entity Type, message text, Author and a date + time.',
  }),
  cardEntityName: tc(40, {
    defect: 'The Message search results carry no Entity Name column, so the card cannot show it.',
    severity: 'normal', name: 'Result card shows the Entity Name',
    description: 'Verify each card shows the display name of the object that owns the conversation (7 Entity Name).',
    condition: `Messages containing "${DATA.term}".`, expected: 'Every card shows an Entity Name value.',
  }),
  cardHighlight: tc(41, {
    defect: 'The matched text is not highlighted in the message snippet.',
    severity: 'normal', name: 'Message snippet highlights the matched text',
    description: 'Verify the matched term is highlighted in the message snippet (7, 62151 Snippet Rendering Specification).',
    condition: `Messages containing "${DATA.term}".`, expected: 'The search text is highlighted in every card\'s snippet.',
  }),
  cardSystemAuthor: tc(42, {
    defect: 'System messages come back with Author = null, so the card shows no system actor.',
    severity: 'normal', name: 'System message card shows the system actor as Author',
    description: 'Verify the Author of a system message shows SystemActor.Name (7 Author).',
    condition: 'Messages Source = Only System messages.', expected: 'Every system message card shows a non-empty Author.',
  }),
  openResult: tc(43, {
    defect: 'The result open action is the fixed URL /SignalCenter with no record id, so it cannot open the parent conversation.',
    severity: 'critical', name: 'Clicking a result opens the parent conversation at the message',
    description: 'Verify clicking a result navigates to the parent conversation and scrolls to the referenced message (7).',
    condition: `Messages containing "${DATA.term}".`, expected: 'The landing page is the conversation\'s object and shows the clicked message.',
  }),
  permission: tc(44, {
    severity: 'critical', name: 'Only messages the user may view are returned',
    description: 'Verify every returned message is allowed for the signed-in user (9).',
    condition: `Signed-in user; messages containing "${DATA.term}".`, expected: 'Every row is marked allowed; no row the user cannot open.',
  }),
};

module.exports = { MODULE, DATA, FILTER_LABELS, SOURCES, REQUIRED_ENTITY_TYPES, MESSAGES, cases };
