// View Project Dashboard (module SERV, docs/62438 View Project Dashboard.md).
// The dashboard is a read-only Bold BI embed opened with /Dashboard/Index?id={dashboardId}&pid={projectId}; the tests
// only open it for existing projects (PROJECT_DASHBOARD_ID, default 819) and read what the widgets show. Widgets are
// located by their stable BI widget ids (see pages/dashboard/projectDashboardPage.js).
// Functional project, saved session, no retries. The BI data loads slowly (up to ~60 s), so the tests have a long timeout.
//
// Not automated (skipped with the reason): T-1 (needs a user without SERV.Project.View), T-11 / T-13 / T-14 / T-17 / T-18 /
// T-19 / T-21 (need projects with specially prepared snapshot rows). T-2 / T-3 run only when PROJECT_DASHBOARD_EMPTY_ID /
// PROJECT_DASHBOARD_NOHOURS_ID name a suitable project.

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, DATA, cases: c } = require('../testData/projectDashboardData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordUrl } = require('../utils/testCase');

// Every test loads the heavy Bold BI dashboard; several at once overload the sandbox's dashboard service (tests then time
// out waiting for data), so the file runs its tests in order on one worker.
test.describe.configure({ mode: 'default', timeout: 240_000 });

/**
 * Labels the test, opens the Project Dashboard, selects `projectId` in its Projects selector and waits for the data.
 * (The dashboard opens on "All"; the "pid" of its URL does not select a project - see the page object.)
 */
async function openDashboard(p, testCase, testInfo, projectId = DATA.projectId, { waitForData = true } = {}) {
  await applyAllureLabels(testCase, MODULE);
  await test.step('Open the Project Dashboard', () => p.gotoDashboard(DATA.dashboardId));
  await recordUrl(testInfo, p.page.url(), 'Project Dashboard');
  await test.step(`Select project ${projectId} in the Projects selector`, () => p.selectProject(projectId));
  if (!waitForData) { await p.page.waitForTimeout(15_000); return; }
  const loaded = await test.step('Wait for the project data', () => p.waitForData());
  expect(loaded, `the dashboard shows the data of project ${projectId}`).toBe(true);
}

/** Switches the open dashboard to another project through its selector (MF-8); returns the id of the project shown. */
async function switchTo(p, currentId, preferredId) {
  const id = await p.switchToAnotherProject(currentId, preferredId);
  expect(id, 'the selector offers another project with data').not.toBe('');
  return id;
}

test.describe('View Project Dashboard', () => {
  // ================= not automated =================
  test.skip(tcTitle(c.permission), tcDetails(c.permission, MODULE), async () => { /* needs a user without SERV.Project.View */ });
  test.skip(tcTitle(c.oneSnapshot), tcDetails(c.oneSnapshot, MODULE), async () => { /* needs a project with exactly one snapshot */ });
  test.skip(tcTitle(c.zeroServices), tcDetails(c.zeroServices, MODULE), async () => { /* needs a project with 0 services in the snapshot */ });
  test.skip(tcTitle(c.unordered), tcDetails(c.unordered, MODULE), async () => { /* needs unordered snapshot rows */ });
  test.skip(tcTitle(c.outsideRange), tcDetails(c.outsideRange, MODULE), async () => { /* needs snapshots outside the date range */ });
  test.skip(tcTitle(c.actualProgress), tcDetails(c.actualProgress, MODULE), async () => { /* needs several snapshots */ });
  test.skip(tcTitle(c.scopeCreep), tcDetails(c.scopeCreep, MODULE), async () => { /* needs increasing remaining hours */ });
  test.skip(tcTitle(c.missingFields), tcDetails(c.missingFields, MODULE), async () => { /* needs a snapshot with null fields */ });

  // ================= negative: no snapshot / no hours =================
  test(tcTitle(c.noSnapshot), tcDetails(c.noSnapshot, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    test.skip(!DATA.emptyProjectId, 'Set PROJECT_DASHBOARD_EMPTY_ID to a project without snapshot rows');
    await openDashboard(p, c.noSnapshot, testInfo, DATA.emptyProjectId, { waitForData: false });
    await expect(p.projectTitle, 'project header is still shown').toBeVisible();
    await expect(p.noDataMessage.or(p.page.getByText(DATA.noSnapshotMessage)).first(), 'no snapshot message').toBeVisible();
    await expect(p.chartSeries, 'no chart series is drawn').toHaveCount(0);
  });

  test(tcTitle(c.noHours), tcDetails(c.noHours, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    test.skip(!DATA.noHoursProjectId, 'Set PROJECT_DASHBOARD_NOHOURS_ID to a project whose latest snapshot has no estimated hours');
    await openDashboard(p, c.noHours, testInfo, DATA.noHoursProjectId, { waitForData: false });
    await expect(p.accountName, 'header is shown').toBeVisible();
    await expect(p.page.getByText(DATA.noHoursMessage).first(), 'estimated hours required message').toBeVisible();
    await expect(p.chartSeries, 'no chart series is drawn').toHaveCount(0);
  });

  // ================= positive =================
  test(tcTitle(c.validData), tcDetails(c.validData, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await openDashboard(p, c.validData, testInfo);
    const { name, status } = await p.projectNameAndStatus();
    await recordTestValues(testInfo, { 'Project': `${name} - ${status}` });
    expect(name, 'project name').not.toBe('');
    for (const [widget, caption] of [
      [p.percentComplete, DATA.captions.percentComplete],
      [p.percentScheduleRemaining, DATA.captions.percentScheduleRemaining],
      [p.estimatedHours, DATA.captions.estimatedHours],
      [p.remainingHours, DATA.captions.remainingHours],
      [p.completedServices, DATA.captions.completedServices],
      [p.completedHours, DATA.captions.completedHours],
    ]) {
      await expect(widget, `${caption} card`).toContainText(caption);
      await expect(widget, `${caption} card has a value`).toHaveText(/\d/);
    }
    await expect(p.progressChart, 'combined chart').toContainText(DATA.captions.progressChart);
    await expect(p.chartSeries, 'combined chart is drawn').toBeAttached();
    await expect(p.burndownChart, 'burndown chart').toContainText(DATA.captions.burndownChart);
    await expect(p.servicesGrid, 'services table').toContainText(DATA.captions.servicesGrid);
  });

  test(tcTitle(c.caption), tcDetails(c.caption, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await openDashboard(p, c.caption, testInfo);
    await expect(p.accountLabel).toContainText(DATA.headerLabels.account);
    await expect(p.startLabel).toContainText(DATA.headerLabels.start);
    await expect(p.billingLabel).toContainText(DATA.headerLabels.billing);
    await expect(p.dueLabel).toContainText(DATA.headerLabels.due);
    await expect(p.projectSelector, 'project selector').toBeVisible();
  });

  test(tcTitle(c.accountName), tcDetails(c.accountName, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await p.gotoProject(DATA.projectId);
    const expected = await p.projectAccountName();
    await recordTestValues(testInfo, { 'Account (project page)': expected });
    await openDashboard(p, c.accountName, testInfo);
    expect(await p.text(p.accountName), 'Account Name in the header').toBe(expected);
  });

  test(tcTitle(c.startDate), tcDetails(c.startDate, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await openDashboard(p, c.startDate, testInfo);
    const start = await p.text(p.startDate);
    await recordTestValues(testInfo, { 'Start Date': start });
    expect(start, 'Start Date is a date').toMatch(/\d/);
  });

  test(tcTitle(c.dueCaption), tcDetails(c.dueCaption, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await openDashboard(p, c.dueCaption, testInfo);
    await expect(p.dueLabel).toContainText(DATA.headerLabels.due);
    const due = await p.text(p.dueDate);
    await recordTestValues(testInfo, { 'Due Date': due || '(empty)' });
    expect(p.isPlaceholder(due) || /\d/.test(due), 'Due Date is a date or empty').toBe(true);
  });

  test(tcTitle(c.completionMath), tcDetails(c.completionMath, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await openDashboard(p, c.completionMath, testInfo);
    const estimated = p.number(await p.cardValue(p.estimatedHours, DATA.captions.estimatedHours));
    const remaining = p.number(await p.cardValue(p.remainingHours, DATA.captions.remainingHours));
    const completed = p.number(await p.cardValue(p.completedHours, DATA.captions.completedHours));
    await recordTestValues(testInfo, { 'Estimated': estimated, 'Remaining': remaining, 'Completed equivalent': completed });
    for (const n of [estimated, remaining, completed]) expect(Number.isNaN(n), 'every hour card shows a number').toBe(false);
    expect(estimated, 'Estimated > 0').toBeGreaterThan(0);
    expect(Math.abs(estimated - (remaining + completed)), 'Estimated = Remaining + Completed').toBeLessThanOrEqual(DATA.dateTolerance);
  });

  test(tcTitle(c.scheduleClamp), tcDetails(c.scheduleClamp, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await openDashboard(p, c.scheduleClamp, testInfo);
    const pct = p.number(await p.cardValue(p.percentScheduleRemaining, DATA.captions.percentScheduleRemaining));
    await recordTestValues(testInfo, { 'Percent Schedule Remaining': pct });
    expect(Number.isNaN(pct), 'the card shows a number').toBe(false);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
    // recalculate with the Appendix formula from the Start / Due Date shown (dates are m/d/yyyy or yyyy-mm-dd; skipped when unreadable)
    const start = Date.parse(await p.text(p.startDate));
    const due = Date.parse(await p.text(p.dueDate));
    if (!Number.isNaN(start) && !Number.isNaN(due) && due > start) {
      const expected = Math.min(100, Math.max(0, (1 - (Date.now() - start) / (due - start)) * 100));
      expect(Math.abs(pct - expected), `schedule remaining ~ ${expected.toFixed(1)}%`).toBeLessThanOrEqual(DATA.scheduleTolerance);
    }
  });

  test(tcTitle(c.deletedServices), tcDetails(c.deletedServices, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await p.gotoProject(DATA.projectId);
    const names = await p.deliverableNames();
    await recordTestValues(testInfo, { 'Deliverables on the project': names.join('; ') });
    await openDashboard(p, c.deletedServices, testInfo);
    await expect(p.servicesGrid).toContainText(DATA.captions.servicesGrid);
    const grid = await p.text(p.servicesGrid);
    for (const name of names) expect(grid, `service "${name}" is in the table`).toContain(name);
  });

  // ================= switching projects =================
  test(tcTitle(c.switchProject), tcDetails(c.switchProject, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await openDashboard(p, c.switchProject, testInfo);
    const first = await p.projectNameAndStatus();
    await switchTo(p, DATA.projectId, DATA.otherProjectId);
    const second = await p.projectNameAndStatus();
    await recordTestValues(testInfo, { 'First project': first.name, 'Second project': second.name });
    expect(second.name, 'the header changed to the second project').not.toBe(first.name);
  });

  test(tcTitle(c.rapidSwitch), tcDetails(c.rapidSwitch, MODULE), async ({ projectDashboardPage: p }, testInfo) => {
    await openDashboard(p, c.rapidSwitch, testInfo);
    const a = await p.projectNameAndStatus();
    const accountA = await p.text(p.accountName);
    const otherId = await switchTo(p, DATA.projectId, DATA.otherProjectId);
    const b = await p.projectNameAndStatus();
    await switchTo(p, otherId, DATA.projectId);
    const again = await p.projectNameAndStatus();
    expect(b.name).not.toBe(a.name);
    expect(again.name, 'project A shows its own name again').toBe(a.name);
    expect(await p.text(p.accountName), 'project A shows its own account again').toBe(accountA);
  });
});
