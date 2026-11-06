/**
 * 62281 Configure Search Results (docs/62281 Configure Search Results.md).
 * The tests change the signed-in user's own search preferences on the Person search page (/Search?entityId=9) and put
 * the baseline back before and after every test, so other specs (person-search) see the usual grid.
 * Override in the root .env:
 *   SRC_ENTITY_ID          search page the tests configure                  (default 9 = Person)
 *   SRC_OTHER_ENTITY_ID    a second search page (per-page preferences)     (default 10 = Project)
 */
const MODULE = 'Search Results Config';

const ENTITY = Number(process.env.SRC_ENTITY_ID || 9);
const OTHER_ENTITY = Number(process.env.SRC_OTHER_ENTITY_ID || 10);

/** Person grid columns (field key -> heading) and the baseline the tests restore. */
const COL = Object.freeze({
  recordId: 'Record ID', FullName: 'Full Name', displayName: 'Display Name', primaryemail: 'Email',
  jobtitle: 'Job Title', dateLastUpdatedUtc: 'Last Updated', editAction: 'Edit',
});
const BASELINE = {
  columns: Object.keys(COL).map((fieldKey, i) => ({ fieldKey, isVisible: fieldKey !== 'recordId', displayOrder: i + 1 })),
  sort: { primary: { fieldName: 'FullName', direction: 'ASC' }, secondary: { fieldName: null, direction: null } },
};

/** Search pages offered by the Quick Search Record Type list (entityId -> name). */
const SEARCH_PAGES = {
  1: 'Account', 3: 'Company', 9: 'Person', 10: 'Project', 11: 'Rate Card',
  12: 'Report', 13: 'Deliverable', 14: 'Deliverable Type', 18: 'Message',
};

/** Search pages that are Card view only by their own use case (62151: Message search has no grid). */
const CARD_ONLY_PAGES = [18];

/** Field key no user has list permission on (stands in for a field whose permission was removed). */
const UNPERMITTED_FIELD = 'Account.SecretInternalNotes';

const MESSAGES = {
  retainOne: /must retain at least one column/i,
  saved: /preferences saved/i,
  dbUnavailable: /SYS-002|Database unavailable/i,
  resetConfirm: /reset to default/i,
};

const tc = (no, def) => ({ id: `TC_SRC_${String(no).padStart(3, '0')}`, ...def });
const page = `Person search page (/Search?entityId=${ENTITY})`;

const cases = {
  // ---------- MF-1 / MF-2: loading preferences ----------
  loadPrefs: tc(1, {
    severity: 'critical', name: 'Stored preferences load when the search page opens',
    description: 'Verify opening a search page loads the user\'s stored preferences for that page and the grid shows exactly the stored visible columns in the stored order with the stored sort (MF-1).',
    condition: `${page}; preferences saved with Email moved before Full Name and Job Title hidden.`,
    expected: 'GetColumnPreferences is requested for the page\'s entity; grid headings = stored visible columns in stored order; heading of the stored primary sort is marked.',
  }),
  dropUnpermitted: tc(2, {
    severity: 'critical', name: 'Field without list permission is silently dropped from stored preferences',
    description: 'Verify a stored column the user has no list permission on is dropped when the page loads, without an error (MF-2).',
    condition: `${page}; preferences saved containing "${UNPERMITTED_FIELD}" as a visible column.`,
    expected: 'Loaded preferences do not contain the field; the grid does not show it; no error is shown; the permitted columns still show.',
  }),
  availableOnlyPermitted: tc(3, {
    severity: 'critical', name: 'Available columns list only fields with list permission',
    description: 'Verify the Customise Table View list and the sort dropdowns offer only the fields the server returns for the user, never an unpermitted one (A-1, Permission Required).',
    condition: `${page}; "${UNPERMITTED_FIELD}" pushed into the stored preferences.`,
    expected: 'Drawer lists exactly the permitted fields; neither the drawer nor the sort dropdowns offer the unpermitted field.',
  }),
  parentFields: tc(4, {
    severity: 'normal', name: 'Available columns include fields of parent entities',
    description: 'Verify a child entity\'s search (Project) offers fields of its parent entity (Account) in the available columns (Permission Required: parent chain).',
    condition: `Project search page (/Search?entityId=${OTHER_ENTITY}).`,
    expected: 'Customise Table View lists at least one Account field (e.g. Account Name) next to the Project fields.',
  }),

  // ---------- MF-3 / MF-4: views ----------
  viewCard: tc(5, {
    severity: 'critical', name: 'Switch results to Card view',
    description: 'Verify switching to Card view shows the results as cards and hides the grid (MF-3).',
    condition: `${page} in Data Grid view.`,
    expected: 'Cards render (title + edit action), grid is hidden, results are requested with the card layout, card count = rows returned.',
  }),
  viewGrid: tc(6, {
    severity: 'critical', name: 'Switch results to Data Grid view with stored preferences',
    description: 'Verify switching back to Data Grid shows the grid with the stored columns and order (MF-4).',
    condition: `${page} in Card view; grid preferences stored with Job Title hidden.`,
    expected: 'Grid is shown, cards are hidden, headings = stored visible columns (Job Title absent).',
  }),
  viewPersist: tc(7, {
    severity: 'normal', name: 'Selected view is remembered for the search page',
    description: 'Verify the selected view (Card / Grid) is kept when the user returns to the page (Scope: persisting display preferences; MF-9).',
    condition: `${page}; Card view chosen.`,
    expected: 'After reopening the page the results are shown as cards; after switching back to grid and reopening, the grid is shown.',
  }),
  cardFixedLayout: tc(8, {
    severity: 'normal', name: 'Card layout is fixed and not changed by grid column settings',
    description: 'Verify hiding a column in the grid does not change what a card shows - the card layout is designer-determined (MF-3, Out of Scope: modifying the card layout).',
    condition: `${page}; Email hidden in grid preferences.`,
    expected: 'Cards still show the person\'s email; the drawer\'s column choices only affect the grid.',
    defect: 'Hiding a column in the grid also removes it from the cards (Email disappears from every card), so the card layout is not fixed.',
  }),

  // ---------- MF-5: add / remove columns ----------
  removeColumn: tc(9, {
    severity: 'critical', name: 'Remove a column from the grid',
    description: 'Verify unticking a column and saving removes it from the grid and stores the setting (MF-5).',
    condition: `${page}; grid with Job Title.`,
    expected: 'SaveColumnPreferences sent with Job Title isVisible=false; heading gone; still gone after reopening.',
  }),
  addColumn: tc(10, {
    severity: 'critical', name: 'Add a column to the grid',
    description: 'Verify ticking an available column and saving adds it to the grid and stores the setting (MF-5).',
    condition: `${page}; Record ID not shown.`,
    expected: 'SaveColumnPreferences sent with Record ID isVisible=true; "Record ID" heading shown; still shown after reopening.',
  }),
  retainOne: tc(11, {
    severity: 'critical', type: 'Negative', name: 'At least one column must be kept',
    description: 'Verify the user cannot save the grid with zero columns (MF-5 "User must retain at least one column").',
    condition: `${page}; every column unticked.`,
    expected: '"Must retain at least one column" is shown; nothing is saved; the grid keeps its columns.',
  }),

  // ---------- MF-6 / MF-7 ----------
  reorder: tc(12, {
    severity: 'critical', name: 'Reorder grid columns',
    description: 'Verify dragging a column in "Columns Order" and saving reorders the grid and stores the order (MF-6).',
    condition: `${page}; Email dragged above Full Name.`,
    expected: 'Saved displayOrder puts Email before Full Name; grid headings in the new order; kept after reopening.',
  }),
  resizeWidth: tc(13, {
    severity: 'normal', name: 'Adjust a column width',
    description: 'Verify the user can drag a column edge to change its width and the width is stored (MF-7, JSON "width").',
    condition: `${page} in Data Grid view.`,
    expected: 'Column has a resize handle; dragging it changes the width; SaveColumnPreferences stores the width; width kept after reopening.',
    defect: 'Grid columns cannot be resized: there is no resize handle and the saved preferences have no "width" (MF-7 not implemented).',
  }),

  // ---------- MF-8: sort bar ----------
  sortOptions: tc(14, {
    severity: 'normal', name: 'Sort dropdowns offer only permitted fields',
    description: 'Verify primary and secondary sort can only be set on fields the user has list permission on; secondary sort is optional (MF-8).',
    condition: `${page} in Card view.`,
    expected: 'Every sort option is one of the permitted columns; secondary offers "None".',
  }),
  sortBarApply: tc(15, {
    severity: 'critical', name: 'Primary sort reorders the results',
    description: 'Verify choosing a primary sort column and direction reorders the results (MF-8 "Results order updates").',
    condition: `${page} in Card view; primary sort = Full Name, then direction switched to descending.`,
    expected: 'Results are requested with Full Name DESC and the cards are shown Z -> A.',
    defect: 'The sort-bar direction change requests Full Name DESC, but the cards stay in A -> Z order (the request\'s order is ignored).',
  }),
  sortBarSaved: tc(16, {
    severity: 'critical', name: 'Primary and secondary sort are saved',
    description: 'Verify a sort chosen in the sort bar is stored in the user\'s Setting and is still applied when the page is reopened (MF-8).',
    condition: `${page} in Card view; primary = Email, secondary = Display Name.`,
    expected: 'SaveColumnPreferences is sent with the new sort; after reopening the sort bar shows Email / Display Name.',
    defect: 'Sort bar changes are never saved (no SaveColumnPreferences request); after reopening the page the sort is back to Full Name / None.',
  }),
  sortBothViews: tc(17, {
    severity: 'normal', name: 'Stored sort applies to both Card and Grid views',
    description: 'Verify the stored sort orders the results the same way in the grid and in the cards (Scope: sort preferences apply to both views).',
    condition: `${page}; stored sort = Full Name DESC.`,
    expected: 'Grid and cards show the same records in the same, descending order.',
  }),

  // ---------- MF-8.5: column heading click ----------
  headerPrimary: tc(18, {
    severity: 'critical', name: 'Clicking a column heading makes it the primary ascending sort',
    description: 'Verify clicking a grid heading sorts ascending by it, the old primary becomes secondary, and the heading is marked as primary (MF-8.5).',
    condition: `${page} in Data Grid; primary sort = Full Name ASC; Email heading clicked.`,
    expected: 'Results requested with [Email ASC, Full Name ASC]; Email heading marked primary; rows ordered by email.',
    defect: 'After clicking a heading the results are not reordered and the primary-sort marker stays on the old column.',
  }),
  headerInvert: tc(19, {
    severity: 'critical', name: 'Clicking the same heading again inverts the primary sort',
    description: 'Verify a second click on the primary heading switches it to descending and changes nothing else (MF-8.5).',
    condition: `${page} in Data Grid; Email heading clicked twice.`,
    expected: 'Second request has Email DESC with the same secondary; heading shows descending.',
    defect: 'A second click on the same heading sends ASC again - the primary sort is never inverted.',
  }),
  headerSecondaryDir: tc(20, {
    severity: 'normal', name: 'Old primary keeps its direction when it becomes secondary',
    description: 'Verify the field that was primary becomes secondary with its direction unchanged (MF-8.5).',
    condition: `${page} in Data Grid; stored primary = Full Name DESC; Email heading clicked.`,
    expected: 'Results requested with [Email ASC, Full Name DESC].',
  }),
  headerSaved: tc(21, {
    severity: 'critical', name: 'Heading-click sort is saved',
    description: 'Verify every sort change made by clicking a heading overwrites the user\'s Setting (MF-8.5).',
    condition: `${page} in Data Grid; Email heading clicked.`,
    expected: 'SaveColumnPreferences sent with primary Email ASC / secondary Full Name; after reopening the Email heading is still primary.',
    defect: 'Heading-click sorting is never saved (no SaveColumnPreferences request); after reopening the sort is back to Full Name.',
  }),

  // ---------- MF-9 ----------
  executeSearch: tc(22, {
    severity: 'critical', name: 'Executed search uses the stored view, columns and sort',
    description: 'Verify a search run from the Advanced Filters drawer shows its results with the stored preferences (MF-9).',
    condition: `${page}; stored columns Full Name + Email, sort Full Name DESC; search Last Name contains "a".`,
    expected: 'Results grid shows only Full Name and Email, ordered Z -> A, and every row matches the search.',
  }),

  // ---------- alternate flows ----------
  saveFailure: tc(23, {
    severity: 'critical', type: 'Negative', name: 'Save failure leaves preferences unchanged',
    description: 'Verify that when saving preferences fails (database unavailable) the user is told and nothing is stored (A-2).',
    condition: `${page}; SaveColumnPreferences answers HTTP 500 "SYS-002 Database unavailable"; Job Title unticked.`,
    expected: 'An error toast is shown; no success message; stored preferences unchanged (Job Title still visible after reopening).',
  }),
  saveFailureMessage: tc(24, {
    severity: 'normal', type: 'Negative', name: 'Save failure shows SYS-002 Database unavailable',
    description: 'Verify the error toast for a failed save is "SYS-002 Database unavailable" (A-2, Error Handling Reference).',
    condition: `${page}; SaveColumnPreferences answers HTTP 500 "SYS-002 Database unavailable".`,
    expected: 'Toast text contains "SYS-002" / "Database unavailable".',
    defect: 'A failed save shows the generic "An error occurred while saving preferences. Please try again." instead of SYS-002 Database unavailable.',
  }),
  noSort: tc(25, {
    severity: 'normal', name: 'No stored sort defaults to primary key ascending',
    description: 'Verify that when the stored JSON has no sort object the results are ordered by the entity primary key ascending (A-3, Scenario CORE-173).',
    condition: `${page}; preferences saved with sort = null.`,
    expected: 'Records are shown in ascending Record ID order.',
    defect: 'A missing sort is stored / applied as Full Name ASC, not the primary key ascending (A-3).',
  }),
  zeroColumns: tc(26, {
    severity: 'critical', type: 'Negative', name: 'Zero permitted columns falls back to the default column set',
    description: 'Verify that when the stored preferences have no visible/permitted column the grid falls back to the entity\'s default columns (A-4).',
    condition: `${page}; preferences saved with every column hidden.`,
    expected: 'Grid is shown with the default columns (Full Name, Display Name, Email, ...).',
    defect: 'With zero stored columns the Data Grid renders nothing at all instead of the default column set (A-4).',
  }),
  resetColumns: tc(27, {
    severity: 'normal', name: 'Without a stored setting all direct fields of the entity are shown',
    description: 'Verify Reset to Default (no stored setting) shows every core / custom field tied directly to the searched entity (A-5).',
    condition: `${page}; columns customised, then Reset to Default confirmed.`,
    expected: 'Confirm prompt shown; every direct field of the entity is listed as visible and shown in the grid.',
    defect: 'After Reset to Default the defaults mark Record ID as visible, but the grid does not show the Record ID column.',
  }),
  resetSort: tc(28, {
    severity: 'normal', name: 'Without a stored setting results sort by primary key ascending',
    description: 'Verify Reset to Default (no stored setting) orders the results by the entity primary key ascending (A-5).',
    condition: `${page}; Reset to Default confirmed.`,
    expected: 'Default sort is the primary key (Record ID) ascending; records shown in ascending Record ID order.',
    defect: 'Default (reset) sort is Full Name ASC instead of the primary key ascending (A-5).',
  }),
  resetCancel: tc(29, {
    severity: 'minor', type: 'Negative', name: 'Cancelling Reset to Default keeps the customisation',
    description: 'Verify dismissing the Reset to Default confirmation changes nothing.',
    condition: `${page}; Job Title hidden; Reset to Default clicked and the prompt cancelled.`,
    expected: 'No default preferences are loaded; Job Title stays hidden.',
  }),

  // ---------- scope ----------
  perPage: tc(30, {
    severity: 'normal', name: 'Preferences are kept per search page',
    description: 'Verify changing the columns of one search page does not change another search page (Out of Scope: cross-page preferences).',
    condition: `Person search columns changed; Project search (/Search?entityId=${OTHER_ENTITY}) opened.`,
    expected: 'Project preferences (columns and sort) are identical before and after the Person change.',
  }),
  allPages: tc(31, {
    severity: 'normal', name: 'Every search page offers Card / Grid and column configuration',
    description: 'Verify each search page in the Record Type list loads its preferences and offers the Card / Grid toggle and Customise Table View (SettingKeys list).',
    condition: `Search pages: ${Object.values(SEARCH_PAGES).join(', ')}.`,
    expected: 'For each page: GetColumnPreferences succeeds with at least one column, both view toggles and the Customise button are shown (Message: Card view only, per 62151).',
  }),
};

module.exports = { MODULE, ENTITY, OTHER_ENTITY, COL, BASELINE, SEARCH_PAGES, CARD_ONLY_PAGES, UNPERMITTED_FIELD, MESSAGES, cases };
