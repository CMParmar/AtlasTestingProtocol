const { env } = require('../utils/testData');

/**
 * Use case 61967 - View & Edit Project (/Project/Edit/{id}).
 * Every test seeds its own project on the EXISTING project Account (see utils/projectAccount.js) and then views /
 * updates it. `seed` = values the project is created with ("previous values"), `update` = values the test enters.
 * Names, codes and descriptions carry keyword + run tag so every run is unique.
 */
const kw = env.keyword;               // "Playwright"
const tag = env.runTag;               // e.g. "1028-101500"
const digits = tag.replace(/\D/g, '').slice(-6);

const MODULE = 'Project Update';

const MESSAGES = {
  nameRequired: 'Project Name is required',
  statusRequired: 'Project Status is required',
  phaseRequired: 'Project Phase is required',
  dueBeforeStart: 'Due date must be on or after the scheduled start date.',
  negativeHours: 'Estimated Hours must not be negative.',
};

/** Tabs on View & Edit Project. */
const TABS = ['Details', 'Staffing', 'Deliverables', 'Time Summary', 'Documents', 'History', 'Tasks', 'Audit'];

/** Date fields in the order MF-1 requires (Start Date = "Scheduled Start Date", CompletedDate = "Actual Completion Date"). */
const DATE_ORDER = ['Scheduled Start Date', 'Due Date', 'Actual Start Date', 'Actual Completion Date'];

/** Fields that stay editable on a terminal project; every other Project field is read-only (Business Rules). */
const TERMINAL_EDITABLE = ['projectName', 'projectCode', 'description'];
const TERMINAL_READONLY = ['currentPhase', 'billingType', 'estimatedHours', 'scheduledStart', 'dueDate'];

/** Project a test seeds (no = test number, keeps names and codes unique). */
const seed = (no, label, extra = {}) => ({
  projectName: `${kw} Edit ${label} Project ${tag}`,
  details: {
    projectCode: `PE${no}-${digits}`, description: `${kw} project seeded for View & Edit tests ${tag}`,
    billingType: 'Hourly', estimatedHours: '40', scheduledStart: '2026-11-02', dueDate: '2026-12-18',
  },
  ...extra,
});

const tc = (no, def) => ({ id: `TC_PJU_${String(no).padStart(3, '0')}`, seed: seed(String(no).padStart(3, '0'), def.label), ...def });

// ---------- non-terminal updates (MF-2, MF-7, MF-8) - one generic flow ----------
const projectUpdateCases = [
  tc(8, {
    label: 'Identity', severity: 'critical',
    name: 'Update Project Name, Project Code and Description',
    description: 'Verify the Project Name, Project Code and Description of an active project can be changed and are saved (MF-2, MF-7, Test Case 13).',
    condition: 'Active (non-terminal) project; user has PERM.SERV.Project.Update.',
    expected: 'Save succeeds; on re-opening the project shows the new Name, Code and Description.',
    update: { projectName: `${kw} Renamed Project ${tag}-008`, projectCode: `PU008-${digits}`, description: `${kw} description updated ${tag}` },
  }),
  tc(9, {
    label: 'Billing', severity: 'normal',
    name: 'Update Primary Billing Type and Estimated Hours',
    description: 'Verify Primary Billing Type and Estimated Hours can be changed on an active project (MF-2, MF-7).',
    condition: 'Active project with Billing Type Hourly and 40 Estimated Hours.',
    expected: 'Save succeeds; the project shows Fixed Fee and 85.5 Estimated Hours.',
    update: { billingType: 'Fixed Fee', estimatedHours: '85.5' },
  }),
  tc(10, {
    label: 'Schedule', severity: 'normal',
    name: 'Update Scheduled Start Date and Due Date',
    description: 'Verify the schedule dates of an active project can be changed and are saved (MF-2, MF-7).',
    condition: 'Active project scheduled 2026-11-02 to 2026-12-18.',
    expected: 'Save succeeds; the project shows Scheduled Start 2026-11-16 and Due Date 2027-01-29.',
    update: { scheduledStart: '2026-11-16', dueDate: '2027-01-29' },
  }),
  tc(11, {
    label: 'Phase', severity: 'normal',
    name: 'Update the Project Phase',
    description: 'Verify the Project Phase can be moved from the template\'s first phase to another phase (MF-2, MF-7).',
    condition: 'Active project in phase Planning.',
    expected: 'Save succeeds; the project shows Project Phase = Design.',
    update: { currentPhase: 'Design' },
  }),
  tc(12, {
    label: 'All Fields', severity: 'critical',
    name: 'Update every editable field in one save',
    description: 'Verify Name, Code, Description, Phase, Billing Type, Estimated Hours and both schedule dates change together in one save (MF-2, MF-7, MF-8).',
    condition: 'Active project; all editable fields changed before Save.',
    expected: 'Save succeeds; every new value is shown after re-opening.',
    update: {
      projectName: `${kw} Fully Updated Project ${tag}`, projectCode: `PU012-${digits}`, description: `${kw} all fields updated ${tag}`,
      currentPhase: 'Development', billingType: 'Subscription', estimatedHours: '160', scheduledStart: '2026-12-01', dueDate: '2027-03-31',
    },
  }),
];

// ---------- negative saves (62382 validation) - one generic flow ----------
const projectNegativeCases = [
  tc(30, {
    label: 'No Name', type: 'Negative', severity: 'critical',
    name: 'Save with an empty Project Name is rejected',
    description: 'Verify the project cannot be saved when the required Project Name is cleared (MF-7, 62382 validation).',
    condition: 'Active project; Project Name cleared.',
    expected: `"${MESSAGES.nameRequired}" is shown and the stored project is unchanged.`,
    update: { projectName: '' }, message: MESSAGES.nameRequired,
  }),
  tc(31, {
    label: 'No Status', type: 'Negative', severity: 'critical',
    name: 'Save with no Project Status is rejected',
    description: 'Verify the project cannot be saved when Project Status is set to "Select" (MF-7, 62382 validation).',
    condition: 'Active project; Project Status set to the empty option.',
    expected: `"${MESSAGES.statusRequired}" is shown and the stored project is unchanged.`,
    update: { projectStatus: '' }, message: MESSAGES.statusRequired,
  }),
  tc(32, {
    label: 'No Phase', type: 'Negative', severity: 'normal',
    name: 'Save with no Project Phase is rejected',
    description: 'Verify the project cannot be saved when Project Phase is set to "Select" (MF-7, 62382 validation).',
    condition: 'Active project; Project Phase set to the empty option.',
    expected: `"${MESSAGES.phaseRequired}" is shown and the stored project is unchanged.`,
    update: { currentPhase: '' }, message: MESSAGES.phaseRequired,
  }),
  tc(33, {
    label: 'Due Before Start', type: 'Negative', severity: 'normal',
    name: 'Due Date before Scheduled Start Date is rejected',
    description: 'Verify a Due Date earlier than the Scheduled Start Date cannot be saved (MF-7, 62382 validation).',
    condition: 'Active project; Scheduled Start 2026-12-18, Due Date 2026-11-02.',
    expected: `"${MESSAGES.dueBeforeStart}" is shown and the stored dates are unchanged.`,
    update: { scheduledStart: '2026-12-18', dueDate: '2026-11-02' }, message: MESSAGES.dueBeforeStart,
  }),
  tc(34, {
    label: 'Negative Hours', type: 'Negative', severity: 'normal',
    name: 'Negative Estimated Hours are rejected',
    description: 'Verify Estimated Hours below zero cannot be saved (MF-7, 62382 validation).',
    condition: 'Active project; Estimated Hours = -5.',
    expected: `"${MESSAGES.negativeHours}" is shown and the stored hours are unchanged.`,
    update: { estimatedHours: '-5' }, message: MESSAGES.negativeHours,
  }),
];

// ---------- individual scenarios ----------
const projectUpdateExtraCases = {
  // --- MF-1 view ---
  view: tc(1, {
    label: 'View', severity: 'blocker',
    name: 'Project opens in Edit Mode with its saved values',
    description: 'Verify opening an existing project loads /Project/Edit/{id} in Edit Mode with every saved value and editable fields (MF-1, Test Case 1).',
    condition: 'Existing active project; user can view it (62553).',
    expected: 'The Details form shows the saved Name, Code, Status, Description, Billing Type, Estimated Hours and dates; the fields and Save are enabled.',
  }),
  header: tc(2, {
    label: 'Header', severity: 'normal',
    name: 'Header shows the owning Account',
    description: 'Verify the project header links the Account Name, Account Owner and Account Number of the owning Account (MF-1).',
    condition: 'Existing project on the project Account.',
    expected: '"Account Name:" and "Account Number:" link to /Account/Edit/{account}; "Account Owner:" links to the owner record.',
  }),
  tabs: tc(3, {
    label: 'Tabs', severity: 'normal',
    name: 'Project page shows all tabs',
    description: 'Verify the project page offers the Details, Staffing, Deliverables, Time Summary, Documents, History, Tasks and Audit tabs (MF-1, MF-3, MF-4).',
    condition: 'Existing project opened.',
    expected: `Tabs: ${TABS.join(', ')}.`,
  }),
  dateOrder: tc(4, {
    label: 'Date Order', severity: 'normal',
    name: 'Date fields are shown in the required sequence',
    description: 'Verify the date fields are displayed as Start Date, Due Date, Actual Start Date, Actual Completion Date (MF-1, DLV 63305).',
    condition: 'Existing project opened; Details tab.',
    expected: `Order: ${DATE_ORDER.join(', ')}; CompletedDate is captioned "Actual Completion Date".`,
  }),
  readOnlyDates: tc(5, {
    label: 'Read Only Dates', severity: 'critical',
    name: 'Actual Start Date and Actual Completion Date are read-only',
    description: 'Verify the system-controlled Actual Start Date and Actual Completion Date (CompletedDate) cannot be edited (Business Rules, MF-1, Test Case 16).',
    condition: 'Existing active project opened.',
    expected: 'Both fields are shown but disabled / read-only.',
  }),
  fromAccount: tc(6, {
    label: 'From Account', severity: 'normal',
    name: 'Open the project from its Account\'s Projects tab',
    description: 'Verify the project listed on the Account\'s Projects tab opens View & Edit Project (MF-1).',
    condition: 'Project saved on the project Account; Account page, Projects tab (All).',
    expected: 'Clicking the project opens /Project/Edit/{id} showing that project.',
  }),
  recentlyViewed: tc(7, {
    label: 'Recently Viewed', severity: 'minor',
    name: 'Opened project is listed in Recently Viewed',
    description: 'Verify opening a project inserts / updates its CORE.RecentlyViewed entry (Test Case 40).',
    condition: 'Project opened, then Recently viewed opened.',
    expected: 'Recently viewed lists the project.',
  }),
  // --- status changes ---
  onHold: tc(13, {
    label: 'On Hold', severity: 'critical',
    name: 'Change status between non-terminal statuses (Active to On Hold)',
    description: 'Verify a non-terminal to non-terminal status change saves and adds a ProjectStatusHistory row (Business Rules, MF-7, Test Case 8).',
    condition: 'Active project; user has PERM.SERV.Project.Update.',
    expected: 'Save succeeds; status = On Hold; the History tab gains one row with State "On Hold".',
    update: { projectStatus: 'On Hold' },
  }),
  draftNoActualStart: tc(14, {
    label: 'Draft', severity: 'normal',
    name: 'Actual Start Date is not substituted with the Scheduled Start Date',
    description: 'Verify a Draft project (no snapshot status yet) shows an empty Actual Start Date and does not substitute the Scheduled Start Date or creation date (Business Rules - Actual Start Date).',
    condition: 'Project created with status Draft and Scheduled Start 2026-11-02.',
    expected: 'Actual Start Date is empty (and never shows the Scheduled Start Date).',
    seedStatus: 'Draft',
  }),
  draftToActive: tc(15, {
    label: 'Activate', severity: 'critical',
    name: 'Draft to Active sets the Actual Start Date',
    description: 'Verify moving a Draft project to Active populates Actual Start Date with the date it entered the snapshot status and records the status change (Business Rules, MF-7).',
    condition: 'Draft project; status changed to Active.',
    expected: 'Save succeeds; Actual Start Date = today (Account time zone, +/- 1 day); History shows "Active".',
    seedStatus: 'Draft', update: { projectStatus: 'Active' },
  }),
  noStatusChange: tc(16, {
    label: 'No Status Change', severity: 'normal',
    name: 'Save without a status change adds no status history',
    description: 'Verify saving other field changes does not insert a ProjectStatusHistory row (Test Case 17).',
    condition: 'Active project; only the Description is changed.',
    expected: 'Save succeeds; the number of History rows is unchanged.',
    update: { description: `${kw} description only change ${tag}` },
  }),
  confirmation: tc(17, {
    label: 'Confirm', severity: 'normal',
    name: 'Save confirms and clears the unsaved-changes state',
    description: 'Verify a successful save shows a confirmation and clears dirty-state tracking, so leaving the page raises no warning (MF-8, Test Case 42).',
    condition: 'Active project; Project Name changed and saved, then a sidebar link is clicked.',
    expected: 'A save confirmation is shown; the page can be left without the "Unsaved Changes" warning.',
    update: { projectName: `${kw} Confirmed Project ${tag}` },
  }),
  audit: tc(18, {
    label: 'Audit', severity: 'normal',
    name: 'Saved change is recorded in the Audit tab',
    description: 'Verify a saved change records a CORE.AuditEntry visible on the Audit tab (MF-8, Test Case 41).',
    condition: 'Active project renamed and saved; Audit tab opened.',
    expected: 'The Audit tab shows the previous Project Name.',
    update: { projectName: `${kw} Audited Project ${tag}` },
  }),
  actualStartRetained: tc(19, {
    label: 'Retain Start', severity: 'normal',
    name: 'Actual Start Date is kept when the project leaves and re-enters Active',
    description: 'Verify a project that leaves the snapshot span and re-enters it keeps the Actual Start Date of its first entry (Business Rules - Actual Start Date).',
    condition: 'Active project: Active to On Hold (save), then On Hold to Active (save).',
    expected: 'Actual Start Date after both saves = the value before them.',
    update: { projectStatus: 'On Hold' }, then: { projectStatus: 'Active' },
  }),
  // --- terminal state ---
  complete: tc(20, {
    label: 'Complete', severity: 'blocker',
    name: 'Change status to Completed sets the completion date and terminal state',
    description: 'Verify saving status Completed populates Actual Completion Date with the current date, adds status history and enforces terminal behaviour on the next load (MF-7, MF-8, Test Cases 9, 14, 43).',
    condition: 'Active project; user has PERM.SERV.Project.Close; status changed to Completed.',
    expected: 'Save succeeds; status = Completed; Actual Completion Date = today (+/- 1 day); History shows "Completed"; restricted fields are read-only.',
    update: { projectStatus: 'Completed' },
  }),
  terminalFields: tc(21, {
    label: 'Terminal Fields', severity: 'critical',
    name: 'Terminal project: only Name, Code and Description are editable',
    description: 'Verify a Completed project keeps Name, Project Code and Description editable and makes the other Project fields read-only (MF-1.5, Test Cases 2, 4).',
    condition: 'Project saved with status Completed and re-opened.',
    expected: 'Name, Code, Description editable; Phase, Billing Type, Estimated Hours, Scheduled Start and Due Date read-only.',
    close: 'Completed',
  }),
  terminalEdit: tc(22, {
    label: 'Terminal Edit', severity: 'critical',
    name: 'Terminal project: Name, Code and Description changes are saved',
    description: 'Verify Name, Project Code and Description can be changed and saved on a Completed project and it stays Completed (Business Rules, Test Case 3).',
    condition: 'Completed project; Name, Code and Description changed.',
    expected: 'Save succeeds; the new values persist; status remains Completed.',
    close: 'Completed',
    update: { projectName: `${kw} Closed Renamed Project ${tag}`, projectCode: `PU022-${digits}`, description: `${kw} updated after completion ${tag}` },
  }),
  terminalCreation: tc(23, {
    label: 'Terminal Create', severity: 'critical',
    name: 'Terminal project: new deliverables and time entries are unavailable',
    description: 'Verify a Completed project offers no Add Deliverable (Service / WorkItem creation) and no Clock In (time entry) (MF-1.5, Test Cases 5, 6).',
    condition: 'Completed project; Deliverables tab opened.',
    expected: '"Add Deliverable" and "Clock In" are not offered.',
    close: 'Completed',
  }),
  terminalStaffing: tc(24, {
    label: 'Terminal Staff', severity: 'normal',
    name: 'Terminal project: staff changes are prevented',
    description: 'Verify a Completed project offers no way to add staff on the Staffing tab (Business Rules: Staff changes are prevented).',
    condition: 'Completed project; Staffing tab opened.',
    expected: 'No enabled "add staff" action is shown.',
    close: 'Completed',
  }),
  terminalAnnotations: tc(25, {
    label: 'Terminal Notes', severity: 'normal',
    name: 'Terminal project: Documents and Signals stay available',
    description: 'Verify low-risk annotations remain available on a Completed project: Documents (Add New Document) and Conversations (Signals) (Business Rules, Test Case 7).',
    condition: 'Completed project; Documents tab opened.',
    expected: '"Add New Document" and the Signals button are available.',
    close: 'Completed',
  }),
  cancelStatus: tc(26, {
    label: 'Canceled', severity: 'critical',
    name: 'Change status to Canceled enforces terminal state without a completion date',
    description: 'Verify Canceled (terminal) is saved, enforces terminal behaviour and leaves Actual Completion Date empty (only Completed sets CompletedDate) (MF-7, MF-8).',
    condition: 'Active project; status changed to Canceled.',
    expected: 'Save succeeds; status = Canceled; Actual Completion Date empty; restricted fields read-only.',
    update: { projectStatus: 'Canceled' },
  }),
  reopenClears: tc(27, {
    label: 'Reopen', severity: 'normal',
    name: 'Completed to another status clears the completion date',
    description: 'Verify changing a Completed project to another status clears Actual Completion Date (MF-7, Test Case 15). Skipped while the status of a terminal project is read-only (reopen via 62529 is a future requirement).',
    condition: 'Completed project; status changed to Active.',
    expected: 'Save succeeds; status = Active; Actual Completion Date empty.',
    close: 'Completed', update: { projectStatus: 'Active' },
  }),
  // --- related sections, non-terminal ---
  deliverables: tc(28, {
    label: 'Deliverables', severity: 'normal',
    name: 'Active project: Deliverables tab offers Add Deliverable',
    description: 'Verify the Deliverables (Services) section of a non-terminal project lists its services and exposes the Add Service action (MF-3, Test Cases 20, 21).',
    condition: 'Active project; user can add Services; Deliverables tab opened.',
    expected: 'The Deliverables tab shows its results and "Add Deliverable" (/Service/Create?ProjectID={id}).',
  }),
  documentsSignals: tc(29, {
    label: 'Docs Signals', severity: 'minor',
    name: 'Documents tab and Signal interface are accessible',
    description: 'Verify the Documents tab opens with Add New Document and the Signals button is available (MF-4, MF-5, Test Cases 37, 38).',
    condition: 'Active project; Documents tab opened.',
    expected: 'Documents tab shown with "Add New Document"; Signals button enabled.',
  }),
  // --- leaving without saving ---
  cancelLink: tc(35, {
    label: 'Cancel', type: 'Negative', severity: 'normal',
    name: 'Cancel discards unsaved changes',
    description: 'Verify Cancel on View & Edit Project reloads the project and discards the changes entered (MF-2).',
    condition: 'Active project; Name and Description changed; Cancel clicked instead of Save.',
    expected: 'The project reloads with its stored Name and Description.',
    update: { projectName: `${kw} Not Saved Project ${tag}`, description: `${kw} should be discarded ${tag}` },
  }),
  unsavedWarning: tc(36, {
    label: 'Unsaved', type: 'Negative', severity: 'normal',
    name: 'Leaving with unsaved changes warns the user',
    description: 'Verify unsaved changes are tracked: leaving shows the "Unsaved Changes" warning; Cancel keeps the edit, Continue Without Saving discards it (MF-2).',
    condition: 'Active project; Project Name changed; sidebar link clicked.',
    expected: 'Warning shown; Cancel keeps the value; Continue leaves and the stored project is unchanged.',
    update: { projectName: `${kw} Unsaved Project ${tag}` },
  }),
  nameMax: tc(37, {
    label: 'Name Max', type: 'Negative', severity: 'minor',
    name: 'Project Name longer than 200 characters is cut to 200',
    description: 'Verify the Project Name accepts at most 200 characters (field limit).',
    condition: 'Active project; 205 characters typed into Project Name.',
    expected: 'Project Name holds 200 characters.',
    length: 205, max: 200,
  }),
  unknownProject: tc(38, {
    label: 'Unknown', type: 'Negative', severity: 'minor',
    name: 'Unknown project id does not open a project',
    description: 'Verify /Project/Edit/{id} for a project that does not exist does not show an editable project (MF-1, 62553 visibility).',
    condition: 'Project id 999999999 (does not exist).',
    expected: 'No editable project form for that id is shown.',
    projectId: '999999999',
  }),
};

module.exports = {
  MODULE, MESSAGES, TABS, DATE_ORDER, TERMINAL_EDITABLE, TERMINAL_READONLY,
  projectUpdateCases, projectNegativeCases, projectUpdateExtraCases,
};
