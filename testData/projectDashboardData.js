/**
 * View Project Dashboard (module SERV, docs/62438 View Project Dashboard.md).
 * Test-case ids are the use case's "Additional Test Cases" (T-1 .. T-22). The dashboard is read-only, so the tests only
 * open it for existing projects. Override in the root .env:
 *   PROJECT_DASHBOARD_ID          project with snapshot data (default 819)
 *   PROJECT_DASHBOARD_OTHER_ID    second project for the "switch project" cases (default: the first other project of the selector that has data)
 *   PROJECT_DASHBOARD_EMPTY_ID    project WITHOUT snapshot rows (T-2 skips while empty)
 *   PROJECT_DASHBOARD_NOHOURS_ID  project whose latest snapshot has EstimatedHoursTotal 0 / null (T-3 skips while empty)
 *   PROJECT_DASHBOARD_UUID        id of the "Project Dashboard" BI dashboard
 */
const MODULE = 'Project Dashboard';

const DATA = {
  dashboardId: process.env.PROJECT_DASHBOARD_UUID || '1e53e61f-83d8-4253-acb3-9b59d4058325',
  projectId: process.env.PROJECT_DASHBOARD_ID || '819',
  otherProjectId: process.env.PROJECT_DASHBOARD_OTHER_ID || '', // empty = the first other project of the selector that has data
  emptyProjectId: process.env.PROJECT_DASHBOARD_EMPTY_ID || '',
  noHoursProjectId: process.env.PROJECT_DASHBOARD_NOHOURS_ID || '',

  // captions of the widgets (used only to prove the widget is the right one)
  captions: {
    percentComplete: 'Percent Complete',
    percentScheduleRemaining: 'Percent Schedule Remaining',
    estimatedHours: 'Estimated Hours',
    remainingHours: 'Remaining Hours',
    completedServices: 'Completed Services',
    completedHours: 'Completed Hours Equivalent',
    progressChart: 'Project Progress, Burndown Combined Chart',
    burndownChart: 'Burndown Chart',
    servicesGrid: 'Project Services',
  },
  headerLabels: { account: 'Account Name', start: 'Start Date', billing: 'Billing Type', due: 'Due Date' },
  noSnapshotMessage: /no snapshot data available|no data to be displayed/i,
  noHoursMessage: /estimated hours required to display charts/i,
  dateTolerance: 0.5, // hours rounding tolerance for Estimated = Remaining + Completed
  scheduleTolerance: 5, // percentage points between the shown and the recalculated schedule remaining
};

const tc = (id, name, description, condition, expected, extra = {}) => ({ id, name, description, condition, expected, ...extra });
const VIEWER = 'User has SERV.Project.View; the project has snapshot rows and EstimatedHoursTotal > 0.';
const NEG = { type: 'Negative' };

const cases = {
  permission: tc('T-1', 'User without SERV.Project.View does not see the dashboard', 'MF-1: open the dashboard as a user lacking SERV.Project.View.', 'Second user without the permission (not automated).', 'Dashboard not shown.', { ...NEG, severity: 'critical' }),
  noSnapshot: tc('T-2', 'Project without snapshot rows shows "No snapshot data available"', 'MF-3 / AF-1: open the dashboard of a project with no snapshot rows.', 'Project without snapshots (PROJECT_DASHBOARD_EMPTY_ID).', 'Header shown, chart omitted, scenario "No snapshot data available" shown.', { ...NEG }),
  noHours: tc('T-3', 'EstimatedHoursTotal 0 / null hides the chart', 'MF-5 / AF-2: open a project whose latest snapshot has no estimated hours.', 'Project with EstimatedHoursTotal 0 or null (PROJECT_DASHBOARD_NOHOURS_ID).', 'Header and services shown; scenario "Estimated hours required to display charts"; no combined chart.', { ...NEG }),
  validData: tc('T-4', 'Valid snapshot data shows every metric and the combined chart', 'MF-6, MF-7: open the dashboard of a project with snapshots.', VIEWER, 'Header, six summary metrics, the combined chart, the burndown chart and the services table are shown.', { severity: 'critical' }),
  switchProject: tc('T-5', 'Switching to another project reloads the dashboard', 'MF-8: open the dashboard for a second project.', VIEWER, 'The header shows the second project.'),
  startDate: tc('T-6', 'Start Date shown is the project start date', 'MF-4: compare the dashboard Start Date with the project.', VIEWER, 'Start Date matches the project (or the earliest snapshot date when the project has none).'),
  dueCaption: tc('T-8', 'Due Date caption and value come from the project', 'MF-4: the dashboard shows the "Due Date" caption and a date.', VIEWER, 'The Due Date caption is shown with a date or empty value.'),
  oneSnapshot: tc('T-11', 'A single snapshot row still renders the chart', 'MF-3, MF-7.', 'Project with exactly one snapshot (not automated).', 'Header metrics and one data point with ideal lines.'),
  completionMath: tc('T-12', 'Estimated hours equal Remaining plus Completed hours equivalent', 'MF-6 / Language: EstimatedHoursTotal = RemainingHoursTotal + CompletedHoursEquivalent.', VIEWER, 'The three hour cards agree.', { severity: 'critical' }),
  zeroServices: tc('T-13', 'TotalServicesCount 0 does not divide by zero', 'MF-6.', 'Project with 0 services in the snapshot (not automated).', 'ServicesCompletionRate shown as 0% or empty without an error.'),
  unordered: tc('T-14', 'Snapshots are ordered by date for the chart', 'MF-3, MF-7.', 'Needs unordered snapshot rows in the database (not automated).', 'Chart plots in date order.'),
  deletedServices: tc('T-15', 'Deleted services are excluded from the services table', 'Scope: the Project Services table lists the project\'s non-deleted services.', VIEWER, 'Every Deliverable of the project is in the table.'),
  accountName: tc('T-16', 'AccountName in the header is the project\'s account', 'MF-2: compare the header Account Name with the project page.', VIEWER, 'Same account name.'),
  outsideRange: tc('T-17', 'Snapshots outside the date range are plotted correctly', 'MF-4, MF-7.', 'Needs snapshots outside the range (not automated).', 'Only data within the range is plotted.'),
  actualProgress: tc('T-18', 'Actual progression follows the snapshots', 'MF-7.', 'Needs several snapshots (not automated).', 'The actual line reflects each PercentComplete.'),
  scopeCreep: tc('T-19', 'Scope creep shows in the burndown', 'MF-7.', 'Needs increasing remaining hours (not automated).', 'The burndown rises.'),
  scheduleClamp: tc('T-20', 'Percent Schedule Remaining is between 0% and 100%', 'MF-6, Appendix: the value is clamped.', VIEWER, 'The card shows a value from 0 to 100 and agrees with the schedule dates.', { severity: 'critical' }),
  missingFields: tc('T-21', 'Missing snapshot fields do not crash the dashboard', 'MF-7.', 'Needs a snapshot with null fields (not automated).', 'The chart renders only the valid series.'),
  rapidSwitch: tc('T-22', 'Rapid project switching leaks no data between projects', 'MF-8: open project A, project B, project A again.', VIEWER, 'Each load shows its own project header.'),
  caption: tc('T-23', 'Every widget is captioned', 'MF-2, MF-6: check the widget captions.', VIEWER, 'The header labels, six metric captions, chart and table titles are shown.'),
};

module.exports = { MODULE, DATA, cases };
