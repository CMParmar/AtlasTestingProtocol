// Page object for the Signal Center list (/SignalCenter): All / Unread / Mentioned / Starred filter tabs with counts,
// the sort button, Refresh, the conversation rows (unread dot, star, entity icon + link, attachment / unread / mention
// badges, activity date, message count), incremental loading on scroll and the right-hand conversation panel.
// The filter and sort chosen are remembered per user by the app (UpdateFilterPreference / UpdateSortPreference),
// so specs always set them explicitly through prepare() / selectFilter().
// The list is rendered by /js/signal-center.js from POST /SignalCenter/GetConversations (and /SignalCenter/Refresh);
// methods that trigger a load return that JSON ("data": conversations, counts, hasMoreResults, limits, sortOrder).
// No assertions here -- methods act or return values; specs assert.

const { BasePage } = require('../basePage');
const { ROUTES, SIGNAL_CENTER } = require('../../utils/constants');

const { API } = SIGNAL_CENTER;
const RESPONSE_TIMEOUT = 20_000;

/** "May 25" -- how a row prints its Conversation Activity Date (month short, day two digits, en-US). */
function formatRowDate(isoDateTime) {
  return new Date(isoDateTime).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

class SignalCenterPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Header ------------------------------------------------------
    this.heading = page.locator('#signal-center-heading');
    this.scrollArea = page.locator('.scroll-area');

    // ---- Filter tabs (each carries a count) ---------------------------
    this.filterTabs = page.locator('.signal-tabs .filter-tab');
    this.activeFilterTab = page.locator('.signal-tabs .filter-tab.active');
    this.allCount = page.locator('#count-all');
    this.unreadCount = page.locator('#count-unread');
    this.mentionedCount = page.locator('#count-mentioned');
    this.starredCount = page.locator('#count-starred');

    // ---- Toolbar -----------------------------------------------------
    this.sortButton = page.locator('#primarySort');
    this.sortLabel = page.locator('#primarySort span');
    this.refreshButton = page.locator('#btn-refresh');

    // ---- List and its states ------------------------------------------
    this.list = page.locator('#conversation-list');
    this.rows = page.locator('#conversation-list > .list-group-item');
    this.unreadRows = page.locator('#conversation-list > .list-group-item:has(.msg-icon.dot.unread)');
    this.rowTitles = page.locator('#conversation-list > .list-group-item .text-body a span');
    this.loadingIndicator = page.locator('#loading-indicator');
    this.loadMoreIndicator = page.locator('#load-more-indicator');
    this.errorMessage = page.locator('#error-message');
    this.emptyState = page.locator('#default-empty-state');
    this.filterEmptyState = page.locator('#filter-empty-state');

    // ---- Right panel (View Conversation reuses #slideOutPanel) --------
    this.panel = page.locator('#slideOutPanel.is-open');
    this.panelTitle = this.panel.locator('.conversation-title');
    this.panelDetail = this.panel.locator('.conversation-detail');
    this.panelCloseButton = this.panel.locator('.right-drawer__close').first();
    this.panelStarButton = this.panel.locator('.star-btn');
    this.panelMessageInput = this.panel.locator('#messageInput');
    // -----------------------------------------------------------------
  }

  // ---- Navigation -----------------------------------------------------

  /** The sandbox occasionally drops a connection (ERR_* / navigation timeout); retry the navigation a few times. */
  async openSignalCenter(attempts = 4) {
    for (let attempt = 1; ; attempt++) {
      try {
        // the list is server-rendered: DOMContentLoaded is enough (the slow sandbox can take long to fire `load` for all assets)
        await this.page.goto(ROUTES.SIGNAL_CENTER, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        break;
      } catch (error) {
        if (attempt >= attempts || !/net::ERR_|Timeout/.test(String(error.message))) throw error;
        await this.page.waitForTimeout(2_000 * attempt);
      }
    }
    await this.waitForListLoaded();
  }

  /** The list is server-rendered on open; wait for the spinner to be gone and in-flight requests to settle. */
  async waitForListLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 90_000 });
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  /** Opens the page and starts from the explicit state every spec uses: filter All, full list from the top. */
  async prepare(filter = SIGNAL_CENTER.FILTER.ALL) {
    await this.openSignalCenter();
    if ((await this.getActiveFilter()) !== filter || filter === SIGNAL_CENTER.FILTER.ALL) {
      await this.selectFilter(filter);
    }
  }

  // ---- Loading (each returns the list JSON the page received) ------------

  /** Runs `action` and resolves with the "data" of the list/refresh response it triggered, after the list rendered. */
  async #loadAfter(action, urlPart) {
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.url().includes(urlPart) && r.request().method() === 'POST', { timeout: RESPONSE_TIMEOUT }),
      action(),
    ]);
    const body = await response.json().catch(() => null);
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: RESPONSE_TIMEOUT });
    return body && body.data ? body.data : body;
  }

  /** @param {string} filter SIGNAL_CENTER.FILTER value */
  async selectFilter(filter) {
    return this.#loadAfter(() => this.click(this.filterTab(filter)), API.LIST);
  }

  /** Clicks the sort button (applies and saves the opposite order); returns the list JSON, whose sortOrder is the new one. */
  async toggleSort() {
    return this.#loadAfter(() => this.click(this.sortButton), API.LIST);
  }

  async refresh() {
    return this.#loadAfter(() => this.click(this.refreshButton), API.REFRESH);
  }

  /**
   * Scrolls the load-more sentinel into view (Intersection Observer, 100px margin).
   * Resolves with the incremental-load JSON, or null when no request is made (nothing more to load) within `wait` ms.
   */
  async scrollForMore(wait = RESPONSE_TIMEOUT) {
    const response = this.page.waitForResponse(r => r.url().includes(API.LIST) && r.request().method() === 'POST', { timeout: wait }).catch(() => null);
    await this.scrollToEnd();
    const loaded = await response;
    if (!loaded) return null;
    const body = await loaded.json().catch(() => null);
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: RESPONSE_TIMEOUT });
    return body && body.data ? body.data : body;
  }

  /** Scrolls the list container to its end (the sentinel sits below the last row). */
  async scrollToEnd() {
    await this.loadMoreIndicator.evaluate(el => el.scrollIntoView({ block: 'end' }));
  }

  /** Keeps scrolling until no more rows load; returns every list JSON received (index 0 = the page already shown). */
  async loadAllRows(maxLoads = 30) {
    const loads = [];
    for (let i = 0; i < maxLoads; i++) {
      const more = await this.scrollForMore(2_500);
      if (!more) break;
      loads.push(more);
      if (!more.hasMoreResults) break;
    }
    return loads;
  }

  async scrollTop() {
    return this.scrollArea.evaluate(el => el.scrollTop);
  }

  // ---- Reading the list ---------------------------------------------------

  filterTab(filter) {
    return this.page.locator(`#filter-${filter.toLowerCase()}`);
  }

  async getActiveFilter() {
    return this.activeFilterTab.getAttribute('data-filter');
  }

  async getTabCounts() {
    const num = async l => Number((await l.innerText()).replace(/[^0-9]/g, ''));
    return {
      all: await num(this.allCount),
      unread: await num(this.unreadCount),
      mentioned: await num(this.mentionedCount),
      starred: await num(this.starredCount),
    };
  }

  /** The order the sort button will apply next ("Ascending" / "Descending") -- the opposite of the one shown. */
  async getNextSortOrder() {
    return this.sortButton.getAttribute('data-order');
  }

  async getSortLabel() {
    return (await this.sortLabel.innerText()).trim();
  }

  /** Indicators of every row in one pass, keyed by conversation id (fast: no per-row round trips). */
  async readRowIndicators() {
    return this.rows.evaluateAll(els => Object.fromEntries(els.map(e => {
      const count = el => Number(el?.querySelector('.badge-count')?.textContent || 0);
      const badges = [...e.querySelectorAll('.icon-badge')];
      return [e.getAttribute('data-conversation-id'), {
        unread: count(e.querySelector('.icon-badge.email')),
        mentions: count(badges.find(b => b.querySelector('.mentioned'))),
        documents: count(badges.find(b => !b.classList.contains('email') && !b.querySelector('.mentioned'))),
        messages: Number(e.querySelector('.comment span')?.textContent || 0),
        starred: e.querySelector('.star-toggle')?.getAttribute('data-starred') === 'true',
        dotUnread: !!e.querySelector('.msg-icon.dot.unread'),
      }];
    })));
  }

  async getRowCount() {
    return this.rows.count();
  }

  /** Conversation ids of the rows, top to bottom. */
  async getRowIds() {
    return this.rows.evaluateAll(els => els.map(e => Number(e.getAttribute('data-conversation-id'))));
  }

  async getRowTitles() {
    return (await this.rowTitles.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  }

  row(conversationId) {
    return this.page.locator(`#conversation-list > .list-group-item[data-conversation-id="${conversationId}"]`);
  }

  // Row parts
  unreadDot(id) { return this.row(id).locator('.msg-icon.dot'); }
  starToggle(id) { return this.row(id).locator('.star-toggle'); }
  entityIcon(id) { return this.row(id).locator('.msg-type'); }
  titleLink(id) { return this.row(id).locator('.text-body a'); }
  attachmentBadge(id) { return this.row(id).locator('.icon-badge:not(.email):not(:has(.mentioned))').first(); }
  unreadBadge(id) { return this.row(id).locator('.icon-badge.email'); }
  mentionBadge(id) { return this.row(id).locator('.icon-badge:has(.mentioned)'); }
  dateText(id) { return this.row(id).locator('.date span'); }
  messageCount(id) { return this.row(id).locator('.comment span'); }

  /** Number printed in a badge (0 when the badge has no count). */
  async badgeCount(badge) {
    const text = await badge.locator('.badge-count').first().innerText({ timeout: 1_000 }).catch(() => '');
    return text ? Number(text) : 0;
  }

  async isRowStarred(id) {
    return (await this.starToggle(id).getAttribute('data-starred')) === 'true';
  }

  /** Stars / unstars a row when it is not already in that state and waits for the save. */
  async setStar(id, starred) {
    if ((await this.isRowStarred(id)) === starred) return;
    const response = this.page.waitForResponse(r => r.url().includes(API.STAR), { timeout: RESPONSE_TIMEOUT });
    await this.click(this.starToggle(id));
    await response;
    await this.page.waitForFunction(
      ([sel, want]) => document.querySelector(sel)?.getAttribute('data-starred') === String(want),
      [`#conversation-list [data-conversation-id="${id}"] .star-toggle`, starred],
    );
  }

  // ---- Opening a conversation ----------------------------------------------

  /** Clicks the unread/read dot at the left of the row -- not the star, the badges or the title link -- which opens the right panel
   *  (the date at the right can sit under an already open panel). */
  async openConversation(id) {
    await this.click(this.unreadDot(id));
    await this.panel.waitFor({ state: 'visible' });
    await this.panelDetail.waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT });
  }

  async closePanel() {
    await this.click(this.panelCloseButton);
    await this.panel.waitFor({ state: 'hidden' });
  }

  // ---- Network control for failure / empty-state scenarios -------------------

  /** Answers POSTs to the endpoint with a successful but empty list (no conversations, zero counts). */
  async mockEmptyList(urlPart = API.LIST) {
    await this.page.route(`**${urlPart}*`, route => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true, errorMessage: null,
          data: {
            conversations: [], allCount: 0, unreadCount: 0, mentionedCount: 0, starredCount: 0,
            currentFilter: 'All', sortOrder: 'Descending', hasMoreResults: false, totalEligibleCount: 0,
            initialLoadLimit: SIGNAL_CENTER.DEFAULT_INITIAL_LOAD_LIMIT, conversationScrollBatchSize: SIGNAL_CENTER.DEFAULT_SCROLL_BATCH_SIZE,
          },
        }),
      });
    });
  }

  /** Makes POSTs to the endpoint fail at network level (like a dropped connection). */
  async failRequests(urlPart = API.LIST) {
    await this.page.route(`**${urlPart}*`, route => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
  }

  async restoreRequests(urlPart = API.LIST) {
    await this.page.unroute(`**${urlPart}*`);
  }
}

module.exports = { SignalCenterPage, formatRowDate };
