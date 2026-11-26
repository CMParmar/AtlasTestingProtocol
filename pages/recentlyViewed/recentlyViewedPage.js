const { BasePage } = require('../basePage');

/**
 * View Recently Viewed Records (use case 62469, module CORE): /RecentlyViewed, a DataTable (#recentlyViewedTable) with the
 * columns Name (a deep link to the record: <a class="text-secondary-500" href="/Project/Edit/819">) and Date Viewed
 * ("11/24/2026 2:51:58 PM", sorted descending by default). Above it: the record counter (#recentlyViewedTable_info,
 * "1-10 of 100") and the Search box; below it: the pager and the "Rows per page" select (10 / 25 / 50 / All = -1).
 * The sidebar entry is a.side-link[href="/RecentlyViewed"] (leaveLink of BasePage). Nothing here writes data.
 * No assertions -- methods act or return values; specs assert.
 */
class RecentlyViewedPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- page ----
    this.heading = page.locator('.page-title .h4');
    this.table = page.locator('#recentlyViewedTable');
    this.nameHeader = this.table.locator('thead th').filter({ hasText: 'Name' });
    this.dateHeader = this.table.locator('thead th').filter({ hasText: 'Date Viewed' });
    this.dateSortButton = this.dateHeader.locator('.dt-column-order');
    this.nameSortButton = this.nameHeader.locator('.dt-column-order');
    this.rows = this.table.locator('tbody tr').filter({ hasNot: page.locator('td.dt-empty') });   // every data row, also one without a link
    this.nameLinks = this.table.locator('tbody td a');
    this.emptyRow = this.table.locator('tbody td.dt-empty');

    // ---- counter, search, paging ----
    this.info = page.locator('#recentlyViewedTable_info');
    this.searchInput = page.locator('#recentlyViewedTable_wrapper .dt-search input[type="search"]');
    this.pageSizeSelect = page.locator('#recentlyViewedTable_wrapper .dt-length select');
    this.nextButton = page.locator('#recentlyViewedTable_wrapper .dt-paging button.next');
    this.pageButtons = page.locator('#recentlyViewedTable_wrapper .dt-paging button.page-link[data-dt-idx]:not(.first):not(.previous):not(.next):not(.last):not(.ellipsis)');

    // ---- sidebar ----
    this.sidebarLink = page.locator('a.side-link[href="/RecentlyViewed"]');
  }

  /** Opens the list by URL and waits for the table to be drawn. */
  async goto() {
    await this.openRecord('/RecentlyViewed');
    await this.table.waitFor({ state: 'visible', timeout: 60_000 });
    await this.info.waitFor({ state: 'visible', timeout: 60_000 });
  }

  /** Opens the list the way a user does: the "Recently viewed" entry of the sidebar. Call from any other page. */
  async openFromSidebar() {
    await this.sidebarLink.click();
    await this.table.waitFor({ state: 'visible', timeout: 60_000 });
  }

  /** Shows every record on one page ("Rows per page" = All). */
  async showAll() {
    await this.pageSizeSelect.selectOption('-1');
    await this.page.waitForTimeout(500);
  }

  /** Chooses a "Rows per page" value (10, 25, 50). */
  async setPageSize(size) {
    await this.pageSizeSelect.selectOption(String(size));
    await this.page.waitForTimeout(500);
  }

  /** Visible entries of the table: [{ name, href, viewed (text), viewedAt (Date) }], in display order. */
  async entries() {
    return this.rows.evaluateAll(trs => trs.map(tr => {
      const a = tr.querySelector('a');
      const viewed = (tr.querySelector('td.dt-type-date')?.textContent || '').trim();
      const name = (a ? a.textContent : tr.querySelector('td.dtr-control')?.textContent || '').trim();
      return { name, href: a ? a.getAttribute('href') || '' : '', viewed, viewedAt: viewed };
    })).then(list => list.map(e => ({ ...e, viewedAt: new Date(e.viewed) })));
  }

  /** The counter text, e.g. "1-10 of 100". */
  async infoText() {
    return (await this.info.innerText()).trim();
  }

  /** Total number of records the counter reports ("1-10 of 100" -> 100; an empty list -> 0). */
  async totalRecords() {
    const text = await this.infoText();
    const m = text.match(/of\s+([\d,]+)\s*$/i);
    return m ? Number(m[1].replace(/,/g, '')) : (/^\s*0\b/.test(text) || /no entries/i.test(text) ? 0 : (await this.rows.count()));
  }

  /** Searches the list (DataTables search is client side, so no request is made). */
  async search(text) {
    await this.searchInput.fill(text);
    await this.page.waitForTimeout(500);
  }

  async clearSearch() {
    await this.searchInput.fill('');
    await this.page.waitForTimeout(500);
  }

  /** Clicks the Date Viewed header (toggles descending <-> ascending). */
  async toggleDateSort() {
    await this.dateHeader.click();
    await this.page.waitForTimeout(500);
  }

  /** aria-sort of the Date Viewed column: "ascending" | "descending" | null. */
  async dateSortState() {
    return this.dateHeader.getAttribute('aria-sort');
  }

  /** Index of the first entry that is not a (slow, heavy) Project page; 0 when every entry is a project. */
  async lightEntryIndex() {
    const hrefs = await this.nameLinks.evaluateAll(as => as.map(a => a.getAttribute('href') || ''));
    return Math.max(0, hrefs.findIndex(h => !/^\/Project\//i.test(h)));
  }

  /** Clicks the name link of a record (deep link) and returns the href that was followed. */
  async openEntry(index = 0) {
    const link = this.nameLinks.nth(index);
    const href = await link.getAttribute('href');
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await this.page.waitForURL(u => u.pathname === href, { timeout: 90_000, waitUntil: 'commit' });
    return href;
  }
}

module.exports = { RecentlyViewedPage };
