// View Signal Center (module COMM) -- the /SignalCenter list: Eligible Conversations (active, not dormant), summary
// indicators, All / Unread / Mentioned / Starred quick filters, sort, Refresh, incremental load on scroll and opening a
// Conversation in the right panel. Uses the authenticated storageState from the setup project.
//
// The filter and sort are remembered per user by the app, so every test starts from prepare() (filter All, list from the
// top) and tests that change the sort / star put it back in `finally`. The sandbox holds shared, changing data: tests
// compare what the page shows with the JSON the page itself received (GetConversations / Refresh = the persisted data),
// and skip (not fail) when the data cannot exercise the rule (e.g. fewer rows than one batch).
//
// Not automated (needs data / users the UI cannot set up, or is owned by another use case):
//   - Permission-based exclusion (entities the user cannot view) -- needs a second user with limited access.
//   - A Conversation crossing SET.COMM.SignalCenter.DormantAfterDays after the list loaded, and the exact-threshold
//     boundary -- needs a message dated to the day; TC-05 checks the oldest Conversation shown is inside the window.
//   - A Conversation with zero messages -- the list must not contain one (TC-07), it cannot be created from the UI.
//   - Concurrent message arrival during Refresh, and changing the SET.COMM.SignalCenter.* settings (not editable here).
//   - Content / posting inside the Conversation panel (owned by View Conversation, 62361).

const { test, expect } = require('../fixtures/pages.fixture');
const { formatRowDate } = require('../pages/signalCenter/signalCenterPage');
const { SIGNAL_CENTER, ROUTES } = require('../utils/constants');

const { FILTER, SORT } = SIGNAL_CENTER;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Conversations in the order the rows are shown, from the list JSONs received so far. */
const conversationsOf = (...loads) => loads.flatMap(l => (l && l.conversations) || []);
const idsOf = conversations => conversations.map(c => c.conversationID);
const hasDuplicates = ids => new Set(ids).size !== ids.length;
const squash = text => String(text).replace(/\s+/g, ' ').trim();

/** True when the activity dates run in the direction `sortOrder` names (Ascending = oldest first). */
function isSortedBy(conversations, sortOrder) {
  const times = conversations.map(c => new Date(c.activityDate).getTime());
  return times.every((t, i) => i === 0 || (sortOrder === SORT.ASCENDING ? times[i - 1] <= t : times[i - 1] >= t));
}

/** Skips the test when the (shared) sandbox cannot exercise the rule under test. */
function skipUnless(condition, reason) {
  test.skip(!condition, reason);
}

test.describe('View Signal Center', () => {
  // ---------------- MF-1: Open Signal Center ----------------
  test.describe('MF-1 Open Signal Center', () => {
    test('TC-01 page opens with the heading, four filter tabs with counts, sort, Refresh and the list', async ({ signalCenterPage: sc }) => {
      await sc.openSignalCenter();
      await expect(sc.heading).toHaveText('Signal Center');
      await expect(sc.filterTabs).toHaveCount(4);
      for (const filter of Object.values(FILTER)) await expect(sc.filterTab(filter)).toBeVisible();
      for (const count of [sc.allCount, sc.unreadCount, sc.mentionedCount, sc.starredCount]) await expect(count).toHaveText(/^\d+$/);
      await expect(sc.sortButton).toBeVisible();
      await expect(sc.refreshButton).toBeVisible();
      await expect(sc.refreshButton).toHaveAttribute('title', 'Refresh');
      await expect(sc.list).toBeVisible();
    });

    test('TC-02 initial load shows at most InitialLoadLimit Eligible Conversations, one row each', async ({ signalCenterPage: sc }) => {
      await sc.openSignalCenter();
      const list = await sc.selectFilter(FILTER.ALL);
      const limit = list.initialLoadLimit;
      expect(limit, 'SET.COMM.SignalCenter.InitialLoadLimit').toBeGreaterThan(0);
      const rows = await sc.getRowCount();
      expect(rows).toBeLessThanOrEqual(limit);
      expect(rows, 'rows = min(limit, eligible conversations)').toBe(Math.min(limit, list.allCount));
      expect(await sc.getRowIds(), 'one row per Conversation').toEqual(idsOf(list.conversations));
      expect(hasDuplicates(await sc.getRowIds()), 'no Conversation listed twice').toBe(false);
      expect(list.hasMoreResults, 'more rows are offered only when the limit was reached').toBe(list.allCount > limit);
    });

    test('TC-03 every row shows the unread dot, star, entity icon, title link, indicators, date and message count', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const [first] = conversationsOf(await sc.selectFilter(FILTER.ALL));
      const id = first.conversationID;
      await expect(sc.unreadDot(id)).toBeVisible();
      await expect(sc.starToggle(id)).toBeVisible();
      await expect(sc.entityIcon(id)).toBeVisible();
      await expect(sc.titleLink(id)).toBeVisible();
      await expect(sc.titleLink(id)).toHaveAttribute('href', `/${first.entityTypeName}/Edit/${first.entityRecordID}`);
      await expect(sc.attachmentBadge(id)).toBeVisible();
      await expect(sc.unreadBadge(id)).toBeVisible();
      await expect(sc.mentionBadge(id)).toBeVisible();
      await expect(sc.dateText(id)).toHaveText(formatRowDate(first.activityDate));
      await expect(sc.messageCount(id)).toHaveText(String(first.messageCount));
    });

    // Test Case 11 / 12: counts match the persisted data (unread, mentions, distinct documents, message count, star)
    test('TC-04 per-row indicators match the persisted message state (unread, mentions, documents, messages, star)', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      const rest = await sc.loadAllRows();
      const conversations = conversationsOf(first, ...rest);
      expect(conversations.length).toBeGreaterThan(0);
      expect(await sc.getRowCount()).toBe(conversations.length);

      const shownById = await sc.readRowIndicators();
      const mismatches = [];
      for (const c of conversations) {
        const shown = shownById[c.conversationID];
        const expected = {
          unread: c.unreadCount, mentions: c.mentionCount, documents: c.documentRefCount,
          messages: c.messageCount, starred: c.isStarred, dotUnread: c.unreadCount > 0,
        };
        if (JSON.stringify(shown) !== JSON.stringify(expected)) mismatches.push({ id: c.conversationID, title: c.displayName, shown, expected });
      }
      expect(mismatches, 'rows whose indicators differ from the persisted counts').toEqual([]);
    });

    test('TC-05 tab counts equal the number of Conversations of each kind', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      const conversations = conversationsOf(first, ...(await sc.loadAllRows()));
      const counts = await sc.getTabCounts();
      expect(counts.all, 'All').toBe(conversations.length);
      expect(counts.unread, 'Unread').toBe(conversations.filter(c => c.isUnread).length);
      expect(counts.mentioned, 'Mentioned').toBe(conversations.filter(c => c.mentionCount > 0).length);
      expect(counts.all).toBe(first.allCount);
      // Starred has no age limit (MF-6), so older starred Conversations are not part of All: compare with the Starred list
      const starred = await sc.selectFilter(FILTER.STARRED);
      expect(counts.starred, 'Starred').toBe(starred.conversations.length);
    });

    // Test Case 21: only Active Conversations (activity within SET.COMM.SignalCenter.DormantAfterDays) are retrieved
    test('TC-06 no dormant Conversation is listed: every activity date is within DormantAfterDays', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      const conversations = conversationsOf(first, ...(await sc.loadAllRows()));
      const oldest = Math.min(...conversations.map(c => new Date(c.activityDate).getTime()));
      const ageDays = (Date.now() - oldest) / DAY_MS;
      // one day of tolerance for the server / browser time zone and the moment the threshold is evaluated
      expect(ageDays, `oldest activity ${new Date(oldest).toISOString()} must be within ${SIGNAL_CENTER.DEFAULT_DORMANT_AFTER_DAYS} days`)
        .toBeLessThanOrEqual(SIGNAL_CENTER.DEFAULT_DORMANT_AFTER_DAYS + 1);
    });

    // Test Case 27: the Conversation Activity Date is the date of the latest message, so a listed Conversation has messages
    test('TC-07 every listed Conversation has at least one message', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      const conversations = conversationsOf(first, ...(await sc.loadAllRows()));
      expect(conversations.filter(c => !(c.messageCount >= 1)).map(c => c.displayName), 'Conversations without messages').toEqual([]);
      expect(conversations.filter(c => !c.activityDate).map(c => c.displayName), 'Conversations without an activity date').toEqual([]);
    });

    // Test Case 26: performance under max load
    test('TC-08 a full initial load completes within an acceptable time', async ({ signalCenterPage: sc }) => {
      await sc.openSignalCenter();
      const started = Date.now();
      const list = await sc.selectFilter(FILTER.ALL);
      const elapsed = Date.now() - started;
      expect(list.conversations.length).toBeLessThanOrEqual(list.initialLoadLimit);
      expect(elapsed, `loading ${list.conversations.length} rows took ${elapsed} ms`).toBeLessThan(SIGNAL_CENTER.MAX_LOAD_MS);
    });
  });

  // ---------------- MF-2: Scroll Conversation List (incremental load) ----------------
  test.describe('MF-2 Scroll Conversation List', () => {
    test('TC-09 scrolling appends at most ScrollBatchSize more rows and keeps the existing ones', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      skipUnless(first.hasMoreResults, 'Fewer Eligible Conversations than the initial load limit: nothing to scroll for');
      const before = await sc.getRowIds();
      const more = await sc.scrollForMore();
      expect(more, 'an incremental load request after scrolling').not.toBeNull();
      expect(more.conversations.length).toBeGreaterThan(0);
      expect(more.conversations.length, 'SET.COMM.SignalCenter.ConversationScrollBatchSize').toBeLessThanOrEqual(more.conversationScrollBatchSize);
      const after = await sc.getRowIds();
      expect(after.slice(0, before.length), 'existing rows stay in place').toEqual(before);
      expect(after.slice(before.length), 'new rows are appended').toEqual(idsOf(more.conversations));
    });

    // Test Case 22 / 25
    test('TC-10 loading everything by scrolling lists every Conversation exactly once', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      skipUnless(first.hasMoreResults, 'Fewer Eligible Conversations than the initial load limit: nothing to scroll for');
      await sc.loadAllRows();
      const ids = await sc.getRowIds();
      expect(hasDuplicates(ids), 'no duplicate rows after repeated incremental loads').toBe(false);
      expect(ids.length, 'rows = All count').toBe(first.allCount);
      expect((await sc.getTabCounts()).all).toBe(first.allCount);
    });

    test('TC-11 rapid repeated scrolling does not duplicate or skip rows', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      skipUnless(first.hasMoreResults, 'Fewer Eligible Conversations than the initial load limit: nothing to scroll for');
      for (let i = 0; i < 12; i++) await sc.scrollToEnd();
      await sc.loadAllRows();
      const ids = await sc.getRowIds();
      expect(hasDuplicates(ids), 'no duplicate rows').toBe(false);
      expect(ids.length, 'no skipped rows').toBe(first.allCount);
    });

    // AF-3
    test('TC-12 AF-3 scrolling at the end of the list loads nothing and keeps the list and scroll position', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      await sc.selectFilter(FILTER.STARRED); // short list: fully loaded
      const list = await sc.getRowCount();
      skipUnless(list > 0, 'No starred Conversations to show a fully loaded list');
      const ids = await sc.getRowIds();
      const top = await sc.scrollTop();
      expect(await sc.scrollForMore(2_500), 'no further request when nothing remains').toBeNull();
      expect(await sc.getRowIds()).toEqual(ids);
      expect(await sc.scrollTop()).toBe(top);
      await expect(sc.errorMessage).toBeHidden();
    });

    // Test Case 18: sort retained while scrolling
    test('TC-13 the sort order stays consistent across incremental loads', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      skipUnless(first.hasMoreResults, 'Fewer Eligible Conversations than the initial load limit: nothing to scroll for');
      const rest = await sc.loadAllRows();
      const all = conversationsOf(first, ...rest);
      expect(isSortedBy(all, first.sortOrder), `activity dates run ${first.sortOrder} across all loads`).toBe(true);
      expect(await sc.getRowIds()).toEqual(idsOf(all));
    });

    // Test Case 17: filter retained while scrolling
    test('TC-14 the active filter stays applied across incremental loads', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.UNREAD);
      skipUnless(first.hasMoreResults, 'Fewer unread Conversations than the initial load limit: nothing to scroll for');
      const rest = await sc.loadAllRows();
      const all = conversationsOf(first, ...rest);
      expect(all.every(c => c.isUnread), 'only unread Conversations are appended').toBe(true);
      expect(await sc.getActiveFilter()).toBe(FILTER.UNREAD);
      expect(await sc.getRowCount()).toBe(all.length);
      expect(await sc.unreadRows.count(), 'every row shows the unread dot').toBe(all.length);
    });

    // Test Case 30 + network errors: a failed incremental load must not corrupt the list
    test('TC-15 a failed incremental load keeps the existing list intact and shows an error', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      skipUnless(first.hasMoreResults, 'Fewer Eligible Conversations than the initial load limit: nothing to scroll for');
      const ids = await sc.getRowIds();
      await sc.failRequests();
      await sc.scrollForMore(3_000);
      await expect(sc.errorMessage).toBeVisible();
      await expect(sc.errorMessage).toHaveText(SIGNAL_CENTER.LOAD_ERROR_MESSAGE);
      expect(await sc.getRowIds(), 'rows unchanged after the failure').toEqual(ids);
      expect(await sc.getActiveFilter()).toBe(FILTER.ALL);
      await expect(sc.loadingIndicator).toBeHidden();
    });
  });

  // ---------------- MF-3: Open Conversation ----------------
  test.describe('MF-3 Open Conversation', () => {
    // Test Case 28
    test('TC-16 clicking a Conversation opens it in the right panel and keeps filter, rows and scroll position', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      skipUnless(first.conversations.length > 0, 'No Conversations to open');
      const ids = await sc.getRowIds();
      // scroll a row from the lower part of the list into view, well clear of the load-more sentinel
      const target = ids[Math.min(ids.length - 1, Math.max(0, ids.length - 12))];
      await sc.row(target).scrollIntoViewIfNeeded();
      const title = squash(await sc.titleLink(target).innerText());
      const top = await sc.scrollTop();

      await sc.openConversation(target);
      await expect(sc.panelTitle).toHaveText(title);
      await expect(sc.panelDetail).toHaveAttribute('data-conversation-id', String(target));
      await expect(sc.row(target)).toHaveClass(/\bactive\b/);
      await expect(sc.panelMessageInput).toBeVisible();

      expect(await sc.getActiveFilter(), 'filter preserved').toBe(FILTER.ALL);
      expect(await sc.getRowIds(), 'rows and their order preserved').toEqual(ids);
      expect(Math.abs((await sc.scrollTop()) - top), 'scroll position preserved').toBeLessThanOrEqual(5);

      await sc.closePanel();
      expect(await sc.getRowIds(), 'rows preserved after closing').toEqual(ids);
    });

    test('TC-17 the panel shows the selected Conversation and replaces it when another row is clicked', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const list = await sc.selectFilter(FILTER.ALL);
      skipUnless(list.conversations.length >= 2, 'Needs at least two Conversations');
      const [a, b] = idsOf(list.conversations);
      await sc.openConversation(a);
      await expect(sc.panelDetail).toHaveAttribute('data-conversation-id', String(a));
      await sc.openConversation(b);
      await expect(sc.panelDetail).toHaveAttribute('data-conversation-id', String(b));
      await expect(sc.row(b)).toHaveClass(/\bactive\b/);
      await expect(sc.row(a)).not.toHaveClass(/\bactive\b/);
    });

    test('TC-18 the entity title link opens the parent record instead of the panel', async ({ page, signalCenterPage: sc }) => {
      await sc.prepare();
      const [first] = conversationsOf(await sc.selectFilter(FILTER.ALL));
      skipUnless(first, 'No Conversations to open');
      await sc.click(sc.titleLink(first.conversationID));
      await expect(page).toHaveURL(new RegExp(`/${first.entityTypeName}/Edit/${first.entityRecordID}`, 'i'));
      expect(page.url()).not.toContain(ROUTES.SIGNAL_CENTER);
    });
  });

  // ---------------- MF-4: Sort Conversations ----------------
  test.describe('MF-4 Sort Conversations', () => {
    test('TC-19 the list is ordered by Conversation Activity Date in the direction the sort names', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const list = await sc.selectFilter(FILTER.ALL);
      expect([SORT.ASCENDING, SORT.DESCENDING]).toContain(list.sortOrder);
      expect(isSortedBy(list.conversations, list.sortOrder), `rows are ${list.sortOrder} by activity date`).toBe(true);
    });

    test('TC-20 clicking the sort button reverses the order and the label flips A-Z / Z-A', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const before = await sc.selectFilter(FILTER.ALL);
      const labelBefore = await sc.getSortLabel();
      let changed = false;
      try {
        const after = await sc.toggleSort();
        changed = true;
        expect(after.sortOrder, 'the opposite order is applied').not.toBe(before.sortOrder);
        expect(isSortedBy(after.conversations, after.sortOrder)).toBe(true);
        expect(await sc.getSortLabel()).not.toBe(labelBefore);
        expect(await sc.getRowIds()).toEqual(idsOf(after.conversations));
        if (before.allCount > 1 && before.conversations.length > 1) {
          expect(idsOf(after.conversations)[0], 'a different Conversation leads').not.toBe(idsOf(before.conversations)[0]);
        }
      } finally {
        if (changed) await sc.toggleSort();
      }
      expect(await sc.getSortLabel(), 'toggling twice restores the label').toBe(labelBefore);
    });

    // Test Case 18 / "preferred sort applied on initial load and refresh"
    test('TC-21 the chosen sort is saved for the user and applied on reload and on Refresh', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const original = await sc.selectFilter(FILTER.ALL);
      const saved = sc.page.waitForResponse(r => r.url().includes(SIGNAL_CENTER.API.SORT), { timeout: 20_000 });
      let toggled = false;
      try {
        const changed = await sc.toggleSort();
        toggled = true;
        expect((await saved).ok(), 'UpdateSortPreference succeeded').toBe(true);

        const labelAfterToggle = await sc.getSortLabel();
        const firstIdAfterToggle = (await sc.getRowIds())[0];
        await sc.openSignalCenter(); // initial load: server-rendered with the saved preference
        expect(await sc.getSortLabel(), 'saved sort restored on open').toBe(labelAfterToggle);
        expect((await sc.getRowIds())[0], 'same Conversation leads after reload').toBe(firstIdAfterToggle);

        const refreshed = await sc.refresh();
        expect(refreshed.sortOrder, 'Refresh applies the saved sort').toBe(changed.sortOrder);
        expect(isSortedBy(refreshed.conversations, refreshed.sortOrder)).toBe(true);
      } finally {
        if (toggled) {
          await sc.openSignalCenter();
          await sc.toggleSort();
        }
      }
      expect((await sc.selectFilter(FILTER.ALL)).sortOrder, 'original sort restored').toBe(original.sortOrder);
    });

    test('TC-22 sorting keeps the active filter', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      await sc.selectFilter(FILTER.UNREAD);
      let toggled = false;
      try {
        const sorted = await sc.toggleSort();
        toggled = true;
        expect(await sc.getActiveFilter()).toBe(FILTER.UNREAD);
        expect(sorted.conversations.every(c => c.isUnread)).toBe(true);
      } finally {
        if (toggled) await sc.toggleSort();
      }
    });
  });

  // ---------------- MF-5: Refresh List ----------------
  test.describe('MF-5 Refresh List', () => {
    // Test Case 19
    test('TC-23 Refresh reloads the list from the top, back to InitialLoadLimit rows, with fresh counts', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const first = await sc.selectFilter(FILTER.ALL);
      skipUnless(first.hasMoreResults, 'Fewer Eligible Conversations than the initial load limit: nothing to scroll for');
      await sc.scrollForMore();
      expect(await sc.getRowCount()).toBeGreaterThan(first.conversations.length);

      const refreshed = await sc.refresh();
      expect(await sc.getRowCount(), 'extra scrolled rows are dropped').toBe(Math.min(refreshed.initialLoadLimit, refreshed.allCount));
      expect(await sc.getRowIds()).toEqual(idsOf(refreshed.conversations));
      expect(await sc.getTabCounts()).toEqual({
        all: refreshed.allCount, unread: refreshed.unreadCount, mentioned: refreshed.mentionedCount, starred: refreshed.starredCount,
      });
    });

    test('TC-24 Refresh clears a quick filter: the list returns to All', async ({ signalCenterPage: sc }) => {
      // Known defect: /SignalCenter/Refresh returns the rows of the saved filter (e.g. 5 Mentioned) while the page switches
      // the tab to All, so tab and rows disagree. Expected to fail until fixed (then remove test.fail).
      test.fail(true, 'Refresh keeps the saved filter in the returned rows but shows the All tab');
      await sc.prepare();
      await sc.selectFilter(FILTER.MENTIONED);
      const refreshed = await sc.refresh();
      expect(await sc.getActiveFilter()).toBe(FILTER.ALL);
      expect(await sc.getRowCount()).toBe(Math.min(refreshed.initialLoadLimit, refreshed.allCount));
    });

    test('TC-25 a failed Refresh keeps the current list intact and shows an error', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      await sc.selectFilter(FILTER.ALL);
      const ids = await sc.getRowIds();
      const counts = await sc.getTabCounts();
      await sc.failRequests(SIGNAL_CENTER.API.REFRESH);
      await sc.click(sc.refreshButton);
      await expect(sc.errorMessage).toHaveText(SIGNAL_CENTER.REFRESH_ERROR_MESSAGE);
      expect(await sc.getRowIds()).toEqual(ids);
      expect(await sc.getTabCounts()).toEqual(counts);
    });
  });

  // ---------------- MF-6: Quick filters ----------------
  test.describe('MF-6 Apply Quick Filters', () => {
    test('TC-26 All lists every Eligible Conversation regardless of unread, mention or star', async ({ signalCenterPage: sc }) => {
      await sc.prepare(FILTER.STARRED);
      const all = await sc.selectFilter(FILTER.ALL);
      expect(await sc.getActiveFilter()).toBe(FILTER.ALL);
      await expect(sc.filterTab(FILTER.ALL)).toHaveClass(/\bactive\b/);
      expect(await sc.getRowCount()).toBe(Math.min(all.initialLoadLimit, all.allCount));
      expect(all.conversations.length).toBeGreaterThan(0);
    });

    // Test Case 15
    test('TC-27 Unread lists only Conversations with unread messages', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const list = await sc.selectFilter(FILTER.UNREAD);
      skipUnless(list.conversations.length > 0, 'No unread Conversations in the sandbox');
      expect(await sc.getActiveFilter()).toBe(FILTER.UNREAD);
      expect(list.conversations.every(c => c.isUnread && c.unreadCount > 0), 'every Conversation has unread messages').toBe(true);
      expect(await sc.getRowCount()).toBe(Math.min(list.initialLoadLimit, list.unreadCount));
      expect(await sc.unreadRows.count(), 'every row shows the unread dot').toBe(await sc.getRowCount());
    });

    // Test Case 16
    test('TC-28 Mentioned lists only Conversations with an unread message that mentions the user', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const list = await sc.selectFilter(FILTER.MENTIONED);
      skipUnless(list.conversations.length > 0, 'No unread mentions in the sandbox');
      expect(list.conversations.every(c => c.mentionCount > 0 && c.isUnread), 'unread mentions only').toBe(true);
      expect(await sc.getRowCount()).toBe(Math.min(list.initialLoadLimit, list.mentionedCount));
      for (const c of list.conversations) await expect(sc.mentionBadge(c.conversationID)).toHaveClass(/has-count/);
    });

    // Test Case 14
    test('TC-29 Starred lists only starred Conversations, whatever their age', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const list = await sc.selectFilter(FILTER.STARRED);
      skipUnless(list.conversations.length > 0, 'No starred Conversations in the sandbox');
      expect(list.conversations.every(c => c.isStarred)).toBe(true);
      expect(await sc.getRowCount()).toBe(Math.min(list.initialLoadLimit, list.starredCount));
      for (const id of idsOf(list.conversations)) expect(await sc.isRowStarred(id)).toBe(true);
    });

    test('TC-30 each tab count equals the rows of its filter; counts do not change while filtering', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const counts = await sc.getTabCounts();
      for (const [filter, key] of [[FILTER.UNREAD, 'unread'], [FILTER.MENTIONED, 'mentioned'], [FILTER.STARRED, 'starred']]) {
        const list = await sc.selectFilter(filter);
        expect(await sc.getRowCount(), `${filter} rows`).toBe(Math.min(list.initialLoadLimit, counts[key]));
        expect(await sc.getTabCounts(), `counts after ${filter}`).toEqual(counts);
      }
    });

    test('TC-31 the selected filter is highlighted and stays until changed', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      for (const filter of [FILTER.UNREAD, FILTER.MENTIONED, FILTER.STARRED, FILTER.ALL]) {
        await sc.selectFilter(filter);
        await expect(sc.activeFilterTab).toHaveCount(1);
        await expect(sc.filterTab(filter)).toHaveClass(/\bactive\b/);
      }
    });

    test('TC-32 the selected filter is saved for the user and restored when the page is opened again', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      try {
        await sc.selectFilter(FILTER.STARRED);
        await sc.openSignalCenter();
        expect(await sc.getActiveFilter(), 'saved filter restored on open').toBe(FILTER.STARRED);
      } finally {
        await sc.selectFilter(FILTER.ALL);
      }
    });

    // Test Case 13: starred state persists
    test('TC-33 starring a Conversation is saved, counted in Starred and listed under the Starred filter; unstarring undoes it', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      const list = await sc.selectFilter(FILTER.ALL);
      const target = list.conversations.find(c => !c.isStarred);
      skipUnless(target, 'Every listed Conversation is already starred');
      const id = target.conversationID;
      const starredBefore = (await sc.getTabCounts()).starred;
      try {
        await sc.setStar(id, true);
        await expect(sc.starToggle(id)).toHaveClass(/\bactive\b/);
        await expect(sc.starredCount).toHaveText(String(starredBefore + 1));

        await sc.openSignalCenter();
        await sc.selectFilter(FILTER.ALL);
        expect(await sc.isRowStarred(id), 'starred state persists after reload').toBe(true);
        const starred = await sc.selectFilter(FILTER.STARRED);
        expect(idsOf(starred.conversations)).toContain(id);
      } finally {
        await sc.openSignalCenter();
        await sc.selectFilter(FILTER.ALL);
        if (await sc.row(id).count()) await sc.setStar(id, false);
      }
      await expect(sc.starredCount).toHaveText(String(starredBefore));
      expect(await sc.isRowStarred(id)).toBe(false);
    });
  });

  // ---------------- Alternate / exception flows ----------------
  test.describe('Alternate and exception flows', () => {
    // AF-1 / SC-[TBD] No Conversations Available (also Test Case 24: everything dormant)
    test('TC-34 AF-1 no Eligible Conversations: the empty-state message is shown, with no rows', async ({ signalCenterPage: sc }) => {
      await sc.openSignalCenter();
      await sc.mockEmptyList();
      await sc.selectFilter(FILTER.ALL);
      await expect(sc.emptyState).toBeVisible();
      await expect(sc.emptyState).toContainText(SIGNAL_CENTER.EMPTY_MESSAGE);
      await expect(sc.filterEmptyState).toBeHidden();
      await expect(sc.rows).toHaveCount(0);
    });

    test('TC-35 AF-1 Refresh with no Eligible Conversations shows the empty-state message', async ({ signalCenterPage: sc }) => {
      await sc.openSignalCenter();
      await sc.mockEmptyList(SIGNAL_CENTER.API.REFRESH);
      await sc.refresh();
      await expect(sc.emptyState).toContainText(SIGNAL_CENTER.EMPTY_MESSAGE);
      await expect(sc.rows).toHaveCount(0);
      expect(await sc.getActiveFilter()).toBe(FILTER.ALL);
    });

    // AF-2 / SC-[TBD] No Conversations Match Selected Filter
    test('TC-36 AF-2 a filter with no matching Conversations shows the filter message and keeps the filter selected', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      try {
        await sc.mockEmptyList();
        await sc.selectFilter(FILTER.MENTIONED);
        await expect(sc.filterEmptyState).toBeVisible();
        await expect(sc.filterEmptyState).toHaveText(SIGNAL_CENTER.FILTER_EMPTY_MESSAGE);
        await expect(sc.emptyState).toBeHidden();
        await expect(sc.rows).toHaveCount(0);
        expect(await sc.getActiveFilter(), 'filter retained').toBe(FILTER.MENTIONED);
      } finally {
        await sc.restoreRequests();
        await sc.selectFilter(FILTER.ALL);
      }
    });

    test('TC-37 leaving an empty filter result restores the rows', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      await sc.mockEmptyList();
      await sc.selectFilter(FILTER.STARRED);
      await expect(sc.filterEmptyState).toBeVisible();
      await sc.restoreRequests();
      const all = await sc.selectFilter(FILTER.ALL);
      await expect(sc.filterEmptyState).toBeHidden();
      await expect(sc.emptyState).toBeHidden();
      expect(await sc.getRowCount()).toBe(all.conversations.length);
    });

    // Network errors do not corrupt existing list state
    test('TC-38 a failed filter load shows an error and does not corrupt the existing list', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      await sc.selectFilter(FILTER.ALL);
      const ids = await sc.getRowIds();
      const counts = await sc.getTabCounts();
      await sc.failRequests();
      await sc.click(sc.filterTab(FILTER.UNREAD));
      await expect(sc.errorMessage).toHaveText(SIGNAL_CENTER.LOAD_ERROR_MESSAGE);
      await expect(sc.loadingIndicator).toBeHidden();
      expect(await sc.getRowIds(), 'rows unchanged').toEqual(ids);
      expect(await sc.getTabCounts(), 'counts unchanged').toEqual(counts);
      // the app recovers once the network is back
      await sc.restoreRequests();
      const recovered = await sc.selectFilter(FILTER.ALL);
      expect(await sc.getRowIds()).toEqual(idsOf(recovered.conversations));
    });

    test('TC-39 the error message disappears by itself', async ({ signalCenterPage: sc }) => {
      await sc.prepare();
      await sc.failRequests();
      await sc.click(sc.filterTab(FILTER.UNREAD));
      await expect(sc.errorMessage).toBeVisible();
      await expect(sc.errorMessage).toBeHidden({ timeout: 10_000 });
    });
  });
});
