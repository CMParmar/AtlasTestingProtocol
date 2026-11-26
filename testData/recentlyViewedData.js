/**
 * View Recently Viewed Records (module CORE, docs/62469 CORE.View Recently Viewed Records.md).
 * Case ids are TC-nn; `description` names the use-case step it covers (MF-1 .. MF-3) and the QA matrix row.
 * Override in the root .env:
 *   RECENTLY_VIEWED_MAX_RECORDS  value of the setting CORE.RecentlyViewed.MaxRecords on the sandbox
 *                                (the use case defaults to 10; the sandbox list was observed with 100 entries)
 *   RECENTLY_VIEWED_ENTRY_INDEX  which entry of the list the "view a record" case opens (default 4 = the 5th)
 * Not automated (the logged-in user already has a long history that the UI cannot reset): TC-01 (zero records)
 * and TC-02 (exactly one record) -- both need a user without / with a single viewed record.
 */
const MODULE = 'Recently Viewed Records';

const DATA = {
  maxRecords: Number(process.env.RECENTLY_VIEWED_MAX_RECORDS) || 100,
  entryIndex: Number(process.env.RECENTLY_VIEWED_ENTRY_INDEX) || 4,
  heading: 'Recently Viewed',
  columns: ['Name', 'Date Viewed'],
  noMatchText: /no matching records|no data available|no records/i,
  unmatchedSearch: 'zzzz-no-such-record-9f3a7',
  pageSizes: [10, 25, 50],
};

const cases = {
  noRecords: { id: 'TC-01', name: 'No recently viewed records: no entries are displayed', description: 'MF-2, QA 1: open the list when the user has not viewed any record.', condition: 'User with an empty recently viewed history.', expected: 'Scenario "No recently viewed records" is raised and no list entries are displayed.', type: 'Negative' },
  oneRecord: { id: 'TC-02', name: 'One recently viewed record is displayed as the most recent', description: 'MF-3, QA 2: open the list when the user has viewed exactly one record.', condition: 'User whose history has exactly one record.', expected: 'One entry is displayed, as the most recently viewed.' },
  openList: { id: 'TC-03', name: 'The Recently Viewed list opens without a permission check', description: 'MF-1, Permission Required = None: open /RecentlyViewed with the signed-in user.', condition: 'Signed-in user; no specific permission is needed.', expected: 'The "Recently Viewed" page opens with the Name and Date Viewed columns and at least one entry.', severity: 'critical' },
  sidebar: { id: 'TC-04', name: 'The sidebar "Recently viewed" entry opens the list', description: 'MF-1: from another page, click "Recently viewed" in the sidebar.', condition: 'Signed-in user on any other page.', expected: 'The Recently Viewed list is displayed.' },
  descending: { id: 'TC-05', name: 'Entries are listed in descending order of recency', description: 'MF-1, MF-3, QA 3: read the Date Viewed of every entry in display order.', condition: 'User with several viewed records.', expected: 'The first entry is the most recently viewed and every following entry was viewed at the same time or earlier.', severity: 'critical' },
  maxRecords: { id: 'TC-06', name: 'No more entries than CORE.RecentlyViewed.MaxRecords are displayed', description: 'MF-3, QA 4: count the entries across all pages.', condition: 'User with more viewed records than the maximum.', expected: 'The list never contains more entries than the MaxRecords setting and the counter agrees with the number of rows.', severity: 'critical' },
  distinct: { id: 'TC-07', name: 'Each record appears only once', description: 'MF-3, QA 5: collect the deep-link target of every entry.', condition: 'User with several viewed records.', expected: 'No deep-link target appears twice in the list.', severity: 'critical' },
  nameAndLink: { id: 'TC-08', name: 'Every entry shows the record name and a deep link', description: 'MF-3: inspect the name and link of every entry.', condition: 'User with several viewed records.', expected: 'Every entry has a non-empty name and a link target that starts with "/" (a record page).' },
  deepLink: { id: 'TC-09', name: 'Clicking an entry opens that record', description: 'MF-3: click the name of an entry.', condition: 'User with several viewed records.', expected: 'The browser navigates to the record page given by the entry deep link.' },
  viewedFirst: { id: 'TC-10', name: 'A record that was just viewed is refreshed without a duplicate', description: 'MF-1, MF-3: open a record listed lower down, return to the list.', condition: 'User with several viewed records.', expected: 'The Date Viewed of the record moves forward and the record appears exactly once.' },
  sortToggle: { id: 'TC-11', name: 'Date Viewed can be re-sorted and the default is descending', description: 'MF-3: read the sort state of Date Viewed, click the header, click it again.', condition: 'User with several viewed records.', expected: 'Default is descending; one click gives ascending order (oldest first); the next click restores descending.' },
  search: { id: 'TC-12', name: 'Searching narrows the list to matching entries', description: 'MF-3: search for the name of an entry.', condition: 'User with several viewed records.', expected: 'Only entries whose name contains the text are displayed; the entry searched for is among them.' },
  searchNoMatch: { id: 'TC-13', name: 'A search without a match displays no entries', description: 'MF-2 (display side): search for text that matches no record.', condition: 'User with several viewed records.', expected: 'No list entries are displayed and the "no matching records" row is shown.', type: 'Negative' },
  pageSize: { id: 'TC-14', name: 'Rows per page changes how many entries are shown, not which', description: 'MF-3: choose 10, 25, 50 and All rows per page.', condition: 'User with more than 10 viewed records.', expected: 'Each page size shows at most that many entries, the first entries stay the same and "All" shows every record of the counter.' },
};

module.exports = { MODULE, DATA, cases };
