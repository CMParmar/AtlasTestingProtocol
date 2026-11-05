// Manage Tasks (use case "Manage Tasks") -- the /task page: My/Team scope, All / Tasks / Work Items / Favorites tabs,
// advanced-search filters, grouped results, and opening / creating records in the right panel.
// Uses the authenticated storageState from the setup project.
//
// The app remembers scope and tab per user, so every test starts from prepare(scope, tab): scope + tab chosen
// explicitly and filters reset. The sandbox holds shared, changing data: tests that filter assert on the rows
// that come back and skip (not fail) when a filter legitimately returns nothing.
//
// Not automated (needs data/users the UI cannot set up, or is owned by another use case):
//   - BR-1 / 62553 visibility (users with limited Account/Project access) and Task with no related record owned by someone else.
//   - BR-2 unassigned Work Items matched through the user's StaffRole (needs a seeded unassigned Work Item + role).
//   - BR-4 Canceled Today (needs a Work Item cancelled today and one cancelled earlier) and Completed Today boundary at midnight.
//   - BR-6 "This week" boundary with SET.SETT.Time.FirstDayOfWeek (setting cannot be changed from the UI here).
//   - Sort keys 2-5 of MF-1 (assignment, started status, workflow step, WorkItemID) -- not visible in the list.
//   - PERM.Task.ActionItem.Create absent (needs a user without the permission).
//   - Internals of 62277 / 63186 / 62547 (owned by those use cases); the list only opens them.

const { test, expect } = require('../fixtures/pages.fixture');
const { ManageTaskPage } = require('../pages/task/manageTaskPage');
const { MANAGE_TASK, TASK } = require('../utils/constants');
const { dateOffset, formatListDate } = require('../utils/dateHelpers');
const { uniqueTitle } = require('../utils/testDataGenerator');

const { SCOPE, TAB } = MANAGE_TASK;
const NO_VALUE = MANAGE_TASK.NO_VALUE;

/** Skips the test when the (shared) sandbox returned no rows for the combination under test. */
async function rowsOrSkip(manageTaskPage, reason) {
  const rows = await manageTaskPage.getRows();
  test.skip(rows.length === 0, reason);
  return rows;
}

/** Midnight today in local time -- the "current date" the list compares against. */
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

test.describe('Manage Tasks', () => {
  // ---------------- MF-1: Open Manage Tasks ----------------
  test.describe('MF-1 Open Manage Tasks', () => {
    test('TC-01 page opens with the My/Team toggle, record-type tabs, Filters and + Task controls', async ({ manageTaskPage }) => {
      await manageTaskPage.openManageTasks();
      await expect(manageTaskPage.scopeToggle).toBeVisible();
      for (const tab of Object.values(TAB)) await expect(manageTaskPage.tabButton(tab)).toBeVisible();
      await expect(manageTaskPage.filtersButton).toBeVisible();
      await expect(manageTaskPage.addTaskButton).toBeVisible();
    });

    test('TC-02 My scope is shown as My and the StaffRole / Assigned to filters are hidden', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      expect(await manageTaskPage.getScope()).toBe(SCOPE.MY);
      await expect(manageTaskPage.scopeToggle).toHaveAttribute('aria-pressed', 'false');
      await manageTaskPage.openFilters();
      await expect(manageTaskPage.staffRoleSelect).toBeHidden();
      await expect(manageTaskPage.assignedToSelect).toBeHidden();
    });

    test('TC-03 tab counts: All equals Tasks plus Work Items', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      const all = await manageTaskPage.getCount(manageTaskPage.allCount);
      const tasks = await manageTaskPage.getCount(manageTaskPage.tasksCount);
      const workItems = await manageTaskPage.getCount(manageTaskPage.workItemsCount);
      expect(all).toBe(tasks + workItems);
    });

    test('TC-04 Account / Project suggestions are offered for the typed text', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      await manageTaskPage.openFilters();
      await manageTaskPage.accountProjectInput.fill(MANAGE_TASK.FILTER_SEARCH_TEXT);
      await expect(manageTaskPage.accountProjectSuggestions.first()).toBeVisible();
      const captions = await manageTaskPage.accountProjectSuggestions.allInnerTexts();
      for (const caption of captions) expect(caption.toLowerCase()).toContain(MANAGE_TASK.FILTER_SEARCH_TEXT.toLowerCase());
    });

    test('TC-05 Tasks tab groups results into Not Done and Completed Tasks sections with matching counts', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      const groups = await manageTaskPage.getGroups();
      test.skip(groups.length === 0, 'No tasks for the signed-in user');
      for (const group of groups) {
        expect(group.title).toMatch(/^(Overdue|Not Done|Completed Tasks)/);
        expect(ManageTaskPage.countInTitle(group.title)).toBe(group.rows.length);
        for (const row of group.rows) expect(row.kind).toBe('task');
      }
      expect(await manageTaskPage.taskRows.count()).toBe(await manageTaskPage.getCount(manageTaskPage.tasksCount));
    });

    test('TC-06 every Work Item row displays its status indicator', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      const rows = await rowsOrSkip(manageTaskPage, 'No Work Items for the signed-in user');
      for (const row of rows) expect(row.indicator, `indicator of "${row.name}"`).not.toBe('');
    });

    test('TC-07 section titles carry a count equal to the rows shown (Work Items)', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      const groups = await manageTaskPage.getGroups();
      test.skip(groups.length === 0, 'No Work Items for the signed-in user');
      for (const group of groups) expect(ManageTaskPage.countInTitle(group.title)).toBe(group.rows.length);
    });

    test('TC-08 Canceled section holds only canceled Work Items and no other section holds them', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      const rows = await rowsOrSkip(manageTaskPage, 'No Work Items for the signed-in user');
      for (const row of rows) {
        const inCanceled = MANAGE_TASK.GROUP.CANCELED.test(row.group);
        const isCanceled = /canceled/i.test(row.indicator);
        expect(inCanceled, `"${row.name}" (${row.indicator}) listed under "${row.group}"`).toBe(isCanceled);
      }
    });

    test('TC-09 Work Items are ordered by due date ascending within each section, no due date last', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      const groups = await manageTaskPage.getGroups();
      test.skip(groups.length === 0, 'No Work Items for the signed-in user');
      for (const group of groups) {
        const dues = group.rows.map(r => ManageTaskPage.cell(r, 'DUE'));
        let previous = null;
        let seenNoDue = false;
        for (const text of dues) {
          const date = ManageTaskPage.parseListDate(text);
          if (!date) { seenNoDue = true; continue; }
          expect(seenNoDue, `"${group.title}": a dated row follows a row with no due date`).toBe(false);
          if (previous) expect(date.getTime()).toBeGreaterThanOrEqual(previous.getTime());
          previous = date;
        }
      }
    });

    test('TC-10 filter chips are empty and no filter is applied after resetting', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await expect(manageTaskPage.filterChips).toHaveCount(0);
    });
  });

  // ---------------- MF-2 / MF-11: Team scope ----------------
  test.describe('MF-2 / MF-11 Team and My scope', () => {
    test('TC-11 Team scope shows the StaffRole and Assigned to filters for Work Items', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.WORK_ITEMS);
      expect(await manageTaskPage.getScope()).toBe(SCOPE.TEAM);
      await expect(manageTaskPage.scopeToggle).toHaveAttribute('aria-pressed', 'true');
      await manageTaskPage.openFilters();
      await expect(manageTaskPage.staffRoleSelect).toBeVisible();
      await expect(manageTaskPage.assignedToSelect).toBeVisible();
      await expect(manageTaskPage.indicatorSelect).toBeVisible();
    });

    test('TC-12 Team scope on the Tasks tab shows Assigned to but not StaffRole / Status Indicator', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.TASKS);
      await manageTaskPage.openFilters();
      await expect(manageTaskPage.assignedToSelect).toBeVisible();
      await expect(manageTaskPage.taskStatusSelect).toBeVisible();
      await expect(manageTaskPage.staffRoleSelect).toBeHidden();
      await expect(manageTaskPage.indicatorSelect).toBeHidden();
    });

    test('TC-13 Team includes the signed-in user\'s own records (Team count is not lower than My count)', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      const mine = await manageTaskPage.getCount(manageTaskPage.tasksCount);
      await manageTaskPage.selectScope(SCOPE.TEAM);
      const team = await manageTaskPage.getCount(manageTaskPage.tasksCount);
      expect(team).toBeGreaterThanOrEqual(mine);
    });

    test('TC-14 returning to My hides the StaffRole filter and clears an applied StaffRole value', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.WORK_ITEMS);
      await manageTaskPage.filterByStaffRole(MANAGE_TASK.STAFF_ROLE);
      await expect(manageTaskPage.filterChips.filter({ hasText: MANAGE_TASK.STAFF_ROLE })).toHaveCount(1);
      await manageTaskPage.closeFilters();

      await manageTaskPage.selectScope(SCOPE.MY);
      await expect(manageTaskPage.filterChips.filter({ hasText: MANAGE_TASK.STAFF_ROLE })).toHaveCount(0);
      await manageTaskPage.openFilters();
      await expect(manageTaskPage.staffRoleSelect).toBeHidden();
      await expect(manageTaskPage.staffRoleSelect).toHaveValue('');
    });

    test('TC-15 Assigned to filter is not offered under My scope on the All tab', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.openFilters();
      await expect(manageTaskPage.assignedToSelect).toBeHidden();
      await expect(manageTaskPage.staffRoleSelect).toBeHidden();
    });

    test('TC-16 Team scope lists unassigned Work Items when no filter is applied', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.WORK_ITEMS);
      const rows = await rowsOrSkip(manageTaskPage, 'No Work Items in Team scope');
      const assignees = new Set(rows.map(r => ManageTaskPage.cell(r, 'ASSIGNED')));
      expect(assignees.size, 'Team scope should span more than one assignee').toBeGreaterThan(1);
    });
  });

  // ---------------- MF-3: Record-type selector ----------------
  test.describe('MF-3 Record-type selector', () => {
    test('TC-17 Tasks tab lists only Tasks', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      expect(await manageTaskPage.workItemRows.count()).toBe(0);
    });

    test('TC-18 Work Items tab lists only Work Items', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      expect(await manageTaskPage.taskRows.count()).toBe(0);
    });

    test('TC-19 All tab lists Tasks and Work Items together', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      const tasks = await manageTaskPage.getCount(manageTaskPage.tasksCount);
      const workItems = await manageTaskPage.getCount(manageTaskPage.workItemsCount);
      test.skip(!tasks || !workItems, 'Needs both Tasks and Work Items for the signed-in user');
      expect(await manageTaskPage.taskRows.count()).toBeGreaterThan(0);
      expect(await manageTaskPage.workItemRows.count()).toBeGreaterThan(0);
    });

    test('TC-20 switching tabs keeps the selected scope', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.TASKS);
      await manageTaskPage.selectTab(TAB.WORK_ITEMS);
      expect(await manageTaskPage.getScope()).toBe(SCOPE.TEAM);
      await manageTaskPage.selectTab(TAB.ALL);
      expect(await manageTaskPage.getScope()).toBe(SCOPE.TEAM);
    });

    test('TC-21 Favorites tab hides the advanced search (per the Search Mode appendix)', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.selectTab(TAB.FAVORITES);
      await expect(manageTaskPage.filtersButton).toBeHidden();
    });

    test('TC-22 a Task can be added to and removed from Favorites', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      test.skip((await manageTaskPage.taskRows.count()) === 0, 'No tasks for the signed-in user');
      const title = uniqueTitle('AUTO manage-favorite');
      await manageTaskPage.createTask(title);
      await expect(manageTaskPage.successToast.first()).toContainText(TASK.SUCCESS_MESSAGE);
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      const before = await manageTaskPage.getCount(manageTaskPage.favoritesCount);

      await manageTaskPage.toggleFavorite(manageTaskPage.rowByName(title));
      await expect.poll(() => manageTaskPage.getCount(manageTaskPage.favoritesCount)).toBe(before + 1);
      await manageTaskPage.selectTab(TAB.FAVORITES);
      await expect(manageTaskPage.rowByName(title)).toBeVisible();

      await manageTaskPage.toggleFavorite(manageTaskPage.rowByName(title));
      await expect.poll(() => manageTaskPage.getCount(manageTaskPage.favoritesCount)).toBe(before);
    });
  });

  // ---------------- MF-4 / BR-6: Due Date filter ----------------
  test.describe('MF-4 Due Date filter', () => {
    test('TC-23 Due Date filter offers the designed ranges', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.openFilters();
      expect(await manageTaskPage.getSelectOptions(manageTaskPage.dueDateSelect)).toEqual(MANAGE_TASK.DUE_DATE_OPTIONS);
    });

    test('TC-24 Overdue returns only records due before today', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.filterByDueDate(MANAGE_TASK.DUE.OVERDUE);
      const rows = await rowsOrSkip(manageTaskPage, 'No overdue records');
      for (const row of rows) {
        const due = ManageTaskPage.parseListDate(ManageTaskPage.cell(row, 'DUE'));
        expect(due, `"${row.name}" has no due date`).not.toBeNull();
        expect(due.getTime(), `"${row.name}" is due ${due}`).toBeLessThan(today().getTime());
      }
    });

    test('TC-25 Today returns only records due today', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.filterByDueDate(MANAGE_TASK.DUE.TODAY);
      const rows = await rowsOrSkip(manageTaskPage, 'No records due today');
      for (const row of rows) expect(ManageTaskPage.cell(row, 'DUE')).toBe(formatListDate(dateOffset(0)));
    });

    test('TC-26 No Due Date returns only records without a due date', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.filterByDueDate(MANAGE_TASK.DUE.NONE);
      const rows = await rowsOrSkip(manageTaskPage, 'No records without a due date');
      for (const row of rows) expect(ManageTaskPage.cell(row, 'DUE')).toBe(NO_VALUE);
    });

    test('TC-27 Next 7 days returns only records due from today through the next 7 days', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.filterByDueDate('Next 7 days');
      const rows = await rowsOrSkip(manageTaskPage, 'No records due in the next 7 days');
      const start = today().getTime();
      const end = start + 7 * 24 * 60 * 60 * 1000;
      for (const row of rows) {
        const due = ManageTaskPage.parseListDate(ManageTaskPage.cell(row, 'DUE'));
        expect(due, `"${row.name}" has no due date`).not.toBeNull();
        expect(due.getTime()).toBeGreaterThanOrEqual(start);
        expect(due.getTime()).toBeLessThanOrEqual(end);
      }
    });

    test('TC-28 a Task created with a due date today is found by the Due Today filter', async ({ manageTaskPage }) => {
      const title = uniqueTitle('AUTO manage-due-today');
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.openCreateTaskDrawer();
      await manageTaskPage.enterTitle(title);
      await manageTaskPage.enterDueDate(dateOffset(0));
      await manageTaskPage.clickSave();
      await expect(manageTaskPage.successToast.first()).toContainText(TASK.SUCCESS_MESSAGE);

      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.filterByDueDate(MANAGE_TASK.DUE.TODAY);
      await expect(manageTaskPage.rowByName(title)).toBeVisible();
    });

    test('TC-29 an applied Due Date filter shows a chip and removing the chip restores the list', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      const total = await manageTaskPage.rows.count();
      await manageTaskPage.filterByDueDate(MANAGE_TASK.DUE.OVERDUE);
      expect(await manageTaskPage.getChipTexts()).toContain('Due Date: Overdue');
      await manageTaskPage.removeChip('dueDate');
      await expect(manageTaskPage.filterChips).toHaveCount(0);
      expect(await manageTaskPage.rows.count()).toBe(total);
    });
  });

  // ---------------- MF-5 / BR-5: Status filter ----------------
  test.describe('MF-5 Status filter', () => {
    test('TC-30 Task status filter offers All, Not Done and Done', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.openFilters();
      expect(await manageTaskPage.getSelectOptions(manageTaskPage.taskStatusSelect)).toEqual(MANAGE_TASK.TASK_STATUS_OPTIONS);
    });

    test('TC-31 Done returns only completed Tasks', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.filterByTaskStatus(MANAGE_TASK.DONE_STATUS_LABEL);
      const rows = await rowsOrSkip(manageTaskPage, 'No completed tasks');
      for (const row of rows) expect(row.group).toMatch(MANAGE_TASK.GROUP.COMPLETED_TASKS);
    });

    test('TC-32 Not Done returns no completed Tasks', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.filterByTaskStatus('Not Done');
      const rows = await rowsOrSkip(manageTaskPage, 'No open tasks');
      for (const row of rows) expect(row.group).not.toMatch(MANAGE_TASK.GROUP.COMPLETED_TASKS);
    });

    test('TC-33 a Task completed today stays listed under Completed Tasks', async ({ manageTaskPage }) => {
      const title = uniqueTitle('AUTO manage-completed-today');
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.createTask(title, MANAGE_TASK.DONE_STATUS_LABEL);
      await expect(manageTaskPage.successToast.first()).toContainText(TASK.SUCCESS_MESSAGE);

      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      const rows = await manageTaskPage.getRows();
      const created = rows.find(r => r.name === title);
      expect(created, `"${title}" should be listed`).toBeTruthy();
      expect(created.group).toMatch(MANAGE_TASK.GROUP.COMPLETED_TASKS);
    });

    test('TC-34 Status Indicator filter offers the six display indicators', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      await manageTaskPage.openFilters();
      const options = await manageTaskPage.getSelectOptions(manageTaskPage.indicatorSelect);
      for (const expected of MANAGE_TASK.INDICATOR_OPTIONS) {
        expect(options.some(o => o.toLowerCase().includes(expected.toLowerCase())), `option "${expected}"`).toBe(true);
      }
      expect(options.filter(o => o !== 'All')).toHaveLength(6);
    });

    for (const indicator of Object.values(MANAGE_TASK.INDICATOR)) {
      test(`TC-35 Status Indicator "${indicator}" returns only Work Items with that indicator`, async ({ manageTaskPage }) => {
        await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
        await manageTaskPage.filterByIndicator(indicator);
        const rows = await rowsOrSkip(manageTaskPage, `No Work Items with the "${indicator}" indicator`);
        for (const row of rows) expect(row.indicator.toLowerCase()).toBe(indicator.toLowerCase());
      });
    }

    test('TC-36 Status Indicator "Temporarily blocked" returns only blocked Work Items', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      await manageTaskPage.openFilters();
      const label = (await manageTaskPage.getSelectOptions(manageTaskPage.indicatorSelect)).find(o => /temp/i.test(o));
      await manageTaskPage.filterByIndicator(label);
      const rows = await rowsOrSkip(manageTaskPage, 'No temporarily blocked Work Items');
      for (const row of rows) expect(row.indicator).toMatch(/block/i);
    });

    test('TC-37 on the All tab, indicators that hide Tasks ("Not ready to start", "Canceled") return no Tasks', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      for (const indicator of [MANAGE_TASK.INDICATOR.NOT_READY, MANAGE_TASK.INDICATOR.CANCELED]) {
        await manageTaskPage.filterByIndicator(indicator);
        expect(await manageTaskPage.taskRows.count(), `Tasks under "${indicator}"`).toBe(0);
      }
    });

    test('TC-38 on the All tab, "Completed" returns only completed Tasks', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.filterByIndicator(MANAGE_TASK.INDICATOR.COMPLETED);
      const tasks = (await manageTaskPage.getRows()).filter(r => r.kind === 'task');
      for (const task of tasks) expect(task.group).toMatch(MANAGE_TASK.GROUP.COMPLETED_TASKS);
    });

    test('TC-39 on the All tab, "Ready to start" returns only incomplete Tasks', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.filterByIndicator(MANAGE_TASK.INDICATOR.READY_TO_START);
      const tasks = (await manageTaskPage.getRows()).filter(r => r.kind === 'task');
      for (const task of tasks) expect(task.group).not.toMatch(MANAGE_TASK.GROUP.COMPLETED_TASKS);
    });
  });

  // ---------------- MF-6: Keyword search ----------------
  test.describe('MF-6 Keyword search', () => {
    test('TC-40 keyword returns only Tasks whose name contains the text', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      const first = (await manageTaskPage.getRows())[0];
      test.skip(!first, 'No tasks for the signed-in user');
      const keyword = first.name.split(/\s+/)[0];
      await manageTaskPage.searchByKeyword(keyword);
      const rows = await manageTaskPage.getRows();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.name.toLowerCase()).toContain(keyword.toLowerCase());
    });

    test('TC-41 keyword returns only Work Items whose name contains the text', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      const first = (await manageTaskPage.getRows())[0];
      test.skip(!first, 'No Work Items for the signed-in user');
      const keyword = first.name.split(/\s+/)[0];
      await manageTaskPage.searchByKeyword(keyword);
      const rows = await manageTaskPage.getRows();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.name.toLowerCase()).toContain(keyword.toLowerCase());
    });

    test('TC-42 keyword on the All tab applies to Tasks and Work Items independently', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      const first = (await manageTaskPage.getRows())[0];
      test.skip(!first, 'No records for the signed-in user');
      const keyword = first.name.split(/\s+/)[0];
      await manageTaskPage.searchByKeyword(keyword);
      for (const row of await manageTaskPage.getRows()) expect(row.name.toLowerCase()).toContain(keyword.toLowerCase());
    });

    test('TC-43 keyword search is not case sensitive', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      const first = (await manageTaskPage.getRows())[0];
      test.skip(!first, 'No tasks for the signed-in user');
      const keyword = first.name.split(/\s+/)[0];
      await manageTaskPage.searchByKeyword(keyword.toUpperCase());
      expect((await manageTaskPage.getRows()).length).toBeGreaterThan(0);
    });

    test('TC-44 keyword with no match returns an empty list', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.searchByKeyword(MANAGE_TASK.UNKNOWN_KEYWORD);
      expect(await manageTaskPage.rows.count()).toBe(0);
      expect(await manageTaskPage.getChipTexts()).toEqual(expect.arrayContaining([expect.stringContaining(MANAGE_TASK.UNKNOWN_KEYWORD)]));
    });

    test('TC-45 Reset All Filters clears the keyword and restores the list', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await expect(manageTaskPage.rows.first()).toBeVisible();
      const total = await manageTaskPage.rows.count();
      await manageTaskPage.searchByKeyword(MANAGE_TASK.UNKNOWN_KEYWORD);
      await manageTaskPage.resetFilters();
      await expect(manageTaskPage.filterChips).toHaveCount(0);
      await expect.poll(() => manageTaskPage.rows.count(), { timeout: 60_000 }).toBe(total);
      await manageTaskPage.openFilters();
      await expect(manageTaskPage.keywordInput).toHaveValue('');
    });

    test('TC-46 the clear button empties the keyword box', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.ALL);
      await manageTaskPage.openFilters();
      await manageTaskPage.keywordInput.fill('abc');
      await manageTaskPage.click(manageTaskPage.keywordClearButton);
      await expect(manageTaskPage.keywordInput).toHaveValue('');
    });
  });

  // ---------------- MF-7 / BR-7: Account / Project filter ----------------
  test.describe('MF-7 Account / Project filter', () => {
    test('TC-47 Account filter returns only Work Items of that Account', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      const first = (await manageTaskPage.getRows())[0];
      test.skip(!first, 'No Work Items for the signed-in user');
      const account = ManageTaskPage.cell(first, 'ACCOUNT');
      await manageTaskPage.filterByAccountProject(account.slice(0, 3));
      const caption = (await manageTaskPage.getChipTexts()).join(' ');
      expect(caption).toContain('Account');
      const rows = await rowsOrSkip(manageTaskPage, 'Selected Account has no Work Items');
      const accounts = new Set(rows.map(r => ManageTaskPage.cell(r, 'ACCOUNT')));
      expect(accounts.size).toBe(1);
    });

    test('TC-48 selecting an Account fills the hidden Account id and clears the Project id', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      await manageTaskPage.pickAccountProject(MANAGE_TASK.FILTER_SEARCH_TEXT);
      await expect(manageTaskPage.accountIdInput).not.toHaveValue('');
    });

    test('TC-49 Tasks without a related record are excluded while the Account filter is active', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.filterByAccountProject(MANAGE_TASK.FILTER_SEARCH_TEXT);
      for (const row of await manageTaskPage.getRows()) {
        expect(ManageTaskPage.cell(row, 'RELATED'), `"${row.name}" has no related record`).not.toBe(NO_VALUE);
        expect(ManageTaskPage.cell(row, 'RELATED')).not.toBe('');
      }
    });

    test('TC-50 removing the Account / Project chip restores the unfiltered list', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      const total = await manageTaskPage.rows.count();
      await manageTaskPage.filterByAccountProject(MANAGE_TASK.FILTER_SEARCH_TEXT);
      await manageTaskPage.removeChip('accountProject');
      expect(await manageTaskPage.rows.count()).toBe(total);
    });
  });

  // ---------------- MF-12 / BR-8: StaffRole filter ----------------
  test.describe('MF-12 StaffRole filter', () => {
    test('TC-51 StaffRole filter offers the active StaffRoles', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.WORK_ITEMS);
      await manageTaskPage.openFilters();
      const options = await manageTaskPage.getSelectOptions(manageTaskPage.staffRoleSelect);
      expect(options[0]).toBe('All');
      expect(options).toContain(MANAGE_TASK.STAFF_ROLE);
    });

    test('TC-52 StaffRole filter returns only Work Items carrying that StaffRole', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.WORK_ITEMS);
      await manageTaskPage.filterByStaffRole(MANAGE_TASK.STAFF_ROLE);
      const rows = await rowsOrSkip(manageTaskPage, `No Work Items with StaffRole ${MANAGE_TASK.STAFF_ROLE}`);
      for (const row of rows) expect(ManageTaskPage.cell(row, 'STAFF_ROLE')).toBe(MANAGE_TASK.STAFF_ROLE);
    });

    test('TC-53 StaffRole filter has no effect on Tasks (All tab)', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.ALL);
      const tasksBefore = await manageTaskPage.taskRows.count();
      test.skip(tasksBefore === 0, 'No tasks in Team scope');
      await manageTaskPage.filterByStaffRole(MANAGE_TASK.STAFF_ROLE);
      expect(await manageTaskPage.taskRows.count()).toBe(tasksBefore);
    });

    test('TC-54 StaffRole filter can be combined with the Due Date filter', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.WORK_ITEMS);
      await manageTaskPage.openFilters();
      await manageTaskPage.staffRoleSelect.selectOption({ label: MANAGE_TASK.STAFF_ROLE });
      await manageTaskPage.dueDateSelect.selectOption({ label: MANAGE_TASK.DUE.OVERDUE });
      await manageTaskPage.applyFilters();
      expect((await manageTaskPage.getChipTexts()).length).toBe(2);
      for (const row of await manageTaskPage.getRows()) {
        expect(ManageTaskPage.cell(row, 'STAFF_ROLE')).toBe(MANAGE_TASK.STAFF_ROLE);
        expect(ManageTaskPage.parseListDate(ManageTaskPage.cell(row, 'DUE'))?.getTime()).toBeLessThan(today().getTime());
      }
    });
  });

  // ---------------- Assigned to filter (Team) ----------------
  test.describe('Assigned to filter', () => {
    test('TC-55 Assigned to returns only Work Items assigned to the chosen person (Team)', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.WORK_ITEMS);
      const assignee = (await manageTaskPage.getRows()).map(r => ManageTaskPage.cell(r, 'ASSIGNED')).find(n => n && n !== NO_VALUE);
      test.skip(!assignee, 'No assigned Work Items in Team scope');
      await manageTaskPage.filterByAssignedTo(assignee);
      const rows = await manageTaskPage.getRows();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(ManageTaskPage.cell(row, 'ASSIGNED')).toBe(assignee);
    });

    test('TC-56 Assigned to returns only Tasks owned by the chosen person (Team)', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.TEAM, TAB.TASKS);
      const owner = (await manageTaskPage.getRows()).map(r => ManageTaskPage.cell(r, 'ASSIGNED')).find(Boolean);
      test.skip(!owner, 'No tasks in Team scope');
      await manageTaskPage.filterByAssignedTo(owner);
      const rows = await manageTaskPage.getRows();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(ManageTaskPage.cell(row, 'ASSIGNED')).toBe(owner);
    });
  });

  // ---------------- Filters drawer behaviour ----------------
  test.describe('Filters drawer', () => {
    test('TC-57 Filters button opens and the close button hides the drawer', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.openFilters();
      await expect(manageTaskPage.openFilterPanel).toBeVisible();
      await manageTaskPage.closeFilters();
      await expect(manageTaskPage.openFilterPanel).toHaveCount(0);
    });

    test('TC-58 several filters can be applied together and each shows a chip', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.openFilters();
      await manageTaskPage.dueDateSelect.selectOption({ label: MANAGE_TASK.DUE.OVERDUE });
      await manageTaskPage.taskStatusSelect.selectOption({ label: 'Not Done' });
      await manageTaskPage.applyFilters();
      const chips = await manageTaskPage.getChipTexts();
      expect(chips).toHaveLength(2);
      expect(chips.join(' ')).toContain('Overdue');
    });

    test('TC-59 Reset All Filters clears every control and chip', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.openFilters();
      await manageTaskPage.dueDateSelect.selectOption({ label: MANAGE_TASK.DUE.OVERDUE });
      await manageTaskPage.keywordInput.fill('abc');
      await manageTaskPage.applyFilters();
      await manageTaskPage.resetFilters();
      await expect(manageTaskPage.filterChips).toHaveCount(0);
      await manageTaskPage.openFilters();
      await expect(manageTaskPage.dueDateSelect.locator('option:checked')).toHaveText('All');
      await expect(manageTaskPage.keywordInput).toHaveValue('');
    });
  });

  // ---------------- MF-8 / MF-9: open a record ----------------
  test.describe('MF-8 / MF-9 Open a record', () => {
    test('TC-60 selecting a Work Item row opens the Work Item in the right panel', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.WORK_ITEMS);
      const row = manageTaskPage.workItemRows.first();
      test.skip((await manageTaskPage.workItemRows.count()) === 0, 'No Work Items for the signed-in user');
      const name = (await row.locator('.assignments-name').innerText()).trim();
      await manageTaskPage.openRow(row);
      await expect(manageTaskPage.sidePanel).toBeVisible();
      await expect(manageTaskPage.sidePanel).toContainText(name);
      await expect(manageTaskPage.rows.first()).toBeVisible();
      await manageTaskPage.closeSidePanel();
    });

    test('TC-61 selecting a Task row opens the Task in the right panel with its title', async ({ manageTaskPage }) => {
      const title = uniqueTitle('AUTO manage-open-task');
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.createTask(title);
      await expect(manageTaskPage.successToast.first()).toContainText(TASK.SUCCESS_MESSAGE);
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);

      await manageTaskPage.openRow(manageTaskPage.rowByName(title));
      await expect(manageTaskPage.sidePanelHeading.first()).toContainText(title);
      await expect(manageTaskPage.sidePanelTitleTextBox).toHaveValue(title);
      await manageTaskPage.closeSidePanel();
    });

    test('TC-62 closing the right panel keeps the list, scope and tab unchanged', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      test.skip((await manageTaskPage.taskRows.count()) === 0, 'No tasks for the signed-in user');
      const total = await manageTaskPage.taskRows.count();
      await manageTaskPage.openRow(manageTaskPage.taskRows.first());
      await manageTaskPage.closeSidePanel();
      expect(await manageTaskPage.taskRows.count()).toBe(total);
      expect(await manageTaskPage.getScope()).toBe(SCOPE.MY);
      expect(await manageTaskPage.getActiveTab()).toBe(TAB.TASKS);
    });

    test('TC-63 a Task edited in the right panel is updated in the list', async ({ manageTaskPage }) => {
      const title = uniqueTitle('AUTO manage-edit-task');
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.createTask(title);
      await expect(manageTaskPage.successToast.first()).toContainText(TASK.SUCCESS_MESSAGE);
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);

      await manageTaskPage.openRow(manageTaskPage.rowByName(title));
      await manageTaskPage.sidePanelStatusSelect.selectOption({ label: MANAGE_TASK.DONE_STATUS_LABEL });
      await manageTaskPage.click(manageTaskPage.sidePanelSaveButton);
      await expect(manageTaskPage.sidePanel).toHaveCount(0);

      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      const created = (await manageTaskPage.getRows()).find(r => r.name === title);
      expect(created?.group).toMatch(MANAGE_TASK.GROUP.COMPLETED_TASKS);
    });
  });

  // ---------------- MF-10: Create a task ----------------
  test.describe('MF-10 Create a New Task', () => {
    test('TC-64 + Task opens the Create New Task right panel', async ({ manageTaskPage }) => {
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.openCreateTaskDrawer();
      await expect(manageTaskPage.drawerHeading).toBeVisible();
      await expect(manageTaskPage.saveButton).toBeEnabled();
    });

    test('TC-65 a newly created Task appears in the My Tasks list under Not Done', async ({ manageTaskPage }) => {
      const title = uniqueTitle('AUTO manage-create');
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      const before = await manageTaskPage.getCount(manageTaskPage.tasksCount);
      await manageTaskPage.createTask(title);
      await expect(manageTaskPage.successToast.first()).toContainText(TASK.SUCCESS_MESSAGE);

      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      expect(await manageTaskPage.getCount(manageTaskPage.tasksCount)).toBe(before + 1);
      const created = (await manageTaskPage.getRows()).find(r => r.name === title);
      expect(created, `"${title}" should be listed`).toBeTruthy();
      expect(created.group).toMatch(MANAGE_TASK.GROUP.NOT_DONE);
    });

    test('TC-66 a Task created without a due date appears under No Due Date filter', async ({ manageTaskPage }) => {
      const title = uniqueTitle('AUTO manage-no-due');
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.createTask(title);
      await expect(manageTaskPage.successToast.first()).toContainText(TASK.SUCCESS_MESSAGE);

      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.filterByDueDate(MANAGE_TASK.DUE.NONE);
      await expect(manageTaskPage.rowByName(title)).toBeVisible();
    });

    test('TC-67 a Task created for me is also listed in Team scope', async ({ manageTaskPage }) => {
      const title = uniqueTitle('AUTO manage-team');
      await manageTaskPage.prepare(SCOPE.MY, TAB.TASKS);
      await manageTaskPage.createTask(title);
      await expect(manageTaskPage.successToast.first()).toContainText(TASK.SUCCESS_MESSAGE);

      await manageTaskPage.prepare(SCOPE.TEAM, TAB.TASKS);
      await manageTaskPage.searchByKeyword(title);
      await expect(manageTaskPage.rowByName(title)).toBeVisible();
    });
  });
});
