const { env } = require('../utils/testData');

/**
 * Use case 62422 - Create Project (/Project/Create, /Project/Create?AccountID={id}).
 * Projects are created on an EXISTING Account: PROJECT_ACCOUNT_ID, else the first "Playwright Project Owner ..."
 * (or other "Playwright ...") account in the Account selector; a Company + Account is created only when none exists.
 * Project names carry keyword + run tag so every run is unique.
 */
const kw = env.keyword;               // "Playwright"
const tag = env.runTag;               // e.g. "1028-101500"

const MODULE = 'Project';

const TEXT = {
  typeNotice: 'Once this project is created, the Project Type cannot be changed.',
  noticeTitle: 'Project Type',
  doNotShow: 'Do not show again',
};

const TYPES = ['Estimation', 'Delivery'];

const projectName = label => `${kw} ${label} Project ${tag}`;

/** Company that owns the seeded Account. */
const seedCompany = {
  tradeName: `${kw} Project Owner ${tag}`, legalName: `${kw} Project Owner LLC`, entityType: 'LLC', roles: ['Client'],
};

const projectCases = {
  // --- MF-1 page load ---
  fromAddNew: {
    id: 'TC_PRJ_001', severity: 'critical',
    name: 'Create Project page opens from the Add New menu',
    description: 'Verify Add New -> Project opens the Create Project page with the Account, Project Name, Project Template, Project Status controls and a Save button (MF-1).',
    condition: 'User has PERM.SERV.Project.Create.',
    expected: '/Project/Create ("Add Project") opens and shows Account, Project Name, Project Template, Project Status and Save.',
  },
  directUrl: {
    id: 'TC_PRJ_002', severity: 'normal',
    name: 'Create Project page opens by URL without an Account',
    description: 'Verify /Project/Create opens without an AccountID and the Account selector is empty (MF-1).',
    condition: 'User has PERM.SERV.Project.Create; no AccountID parameter.',
    expected: 'The form opens; the Account selector is not pre-populated.',
  },
  accountParam: {
    id: 'TC_PRJ_003', severity: 'critical',
    name: 'AccountID parameter pre-populates the Account selector',
    description: 'Verify /Project/Create?AccountID={id} pre-populates the Account selector with that account (MF-1).',
    condition: 'A valid Account exists.',
    expected: 'The Account selector shows the seeded Account.',
  },
  fromAccountTab: {
    id: 'TC_PRJ_004', severity: 'normal',
    name: 'Add New Project from the Account\'s Projects tab',
    description: 'Verify the Account page\'s Projects tab "Add New Project" opens /Project/Create?AccountID={id} with the Account pre-populated (MF-1).',
    condition: 'Account page, Projects tab.',
    expected: 'A new tab opens on /Project/Create?AccountID=<account id> and the Account selector shows the Account.',
  },
  statusDefault: {
    id: 'TC_PRJ_005', severity: 'normal',
    name: 'Project Status shows the effective default and can be changed',
    description: 'Verify Project Status is populated with the effective default (62203) or left empty when none exists, and the user can change it (MF-1).',
    condition: 'Create Project page opened.',
    expected: 'Project Status holds the default (or is empty); selecting another status changes it.',
  },
  typeNoDefault: {
    id: 'TC_PRJ_006', severity: 'critical',
    name: 'Project Type control is present with no default',
    description: 'Verify the form exposes the required Project Type control (Estimation / Delivery) with no value selected (MF-1, 63342).',
    condition: 'Create Project page opened.',
    expected: 'A Project Type control is shown; neither Estimation nor Delivery is selected when the page loads.',
  },
  typeOptions: {
    id: 'TC_PRJ_007', severity: 'critical',
    name: 'Project Type offers Estimation and Delivery',
    description: 'Verify the Project Type control offers exactly the two types Estimation and Delivery (MF-1).',
    condition: 'Create Project page opened.',
    expected: 'Options: Estimation, Delivery.',
  },
  typeHelp: {
    id: 'TC_PRJ_008', severity: 'minor',
    name: 'Project Type help text is displayed',
    description: 'Verify help text explaining the Project Type is shown next to the control (MF-1).',
    condition: 'Create Project page opened.',
    expected: 'A help text / tooltip is shown with the Project Type control.',
  },
  templateControl: {
    id: 'TC_PRJ_009', severity: 'critical',
    name: 'Template Version control is shown with selectable versions',
    description: 'Verify a control requiring a Project Template Version is shown and offers at least one valid version (MF-1, BR.SERV.Project.Create.TemplateRequired).',
    condition: 'Create Project page opened; at least one non-deleted ProjectTemplateVersion exists.',
    expected: 'The Template Version control is present and lists one or more versions.',
  },
  // --- MF-3 Project Type Immutable scenario ---
  noticeShown: {
    id: 'TC_PRJ_010', severity: 'critical',
    name: 'First Project Type selection shows the Project Type notice',
    description: 'Verify setting the Project Type for the first time shows the Project Type Immutable notice (MF-3).',
    condition: 'SuppressProjectTypeImmutableNotice is False for the user.',
    expected: `"${TEXT.typeNotice}" is shown.`,
    projectType: 'Delivery',
  },
  noticeControls: {
    id: 'TC_PRJ_011', severity: 'normal',
    name: 'Project Type notice offers Ok and Do not show again',
    description: 'Verify the notice shows the title "Project Type", an Ok button and a "Do not show again" checkbox (Scenario: Project Type Immutable).',
    condition: 'Project Type set for the first time; notice not suppressed.',
    expected: 'Title "Project Type", Ok button and an unticked "Do not show again" checkbox.',
    projectType: 'Estimation',
  },
  noticeOk: {
    id: 'TC_PRJ_012', severity: 'normal',
    name: 'Ok dismisses the notice and keeps the selected type',
    description: 'Verify Ok closes the Project Type notice and the selected Project Type stays selected (Scenario button "Ok").',
    condition: 'Project Type notice shown.',
    expected: 'The notice closes; Project Type = Delivery.',
    projectType: 'Delivery',
  },
  noticeOnlyOnce: {
    id: 'TC_PRJ_013', severity: 'normal',
    name: 'Changing the Project Type again does not re-show the notice',
    description: 'Verify the notice only fires on the first selection - changing the selection afterwards does not raise it again (MF-3 note).',
    condition: 'Type set to Delivery and the notice acknowledged; user changes to Estimation.',
    expected: 'No notice on the second selection; Project Type = Estimation.',
    projectType: 'Delivery', changeTo: 'Estimation',
  },
  noticeEachForm: {
    id: 'TC_PRJ_014', severity: 'minor',
    name: 'Notice shows again on a new form when only Ok was clicked',
    description: 'Verify acknowledging the notice with Ok (without "Do not show again") does not suppress it on the next Create Project page.',
    condition: 'Notice acknowledged with Ok only; a new Create Project page is opened.',
    expected: 'The notice is shown again on the new form.',
    projectType: 'Estimation',
  },
  // --- MF-4 / MF-5 save ---
  createDelivery: {
    id: 'TC_PRJ_015', severity: 'blocker',
    name: 'Create a project on an existing Account',
    description: 'Verify a project with Account, Project Name, Project Template and Project Status (and Project Type = Delivery once the form has it) saves, opens View & Edit Project and belongs to the chosen existing Account (MF-4, MF-5).',
    condition: 'Existing Account; all required controls populated.',
    expected: '"Your new record has been added."; View & Edit Project shows the values and "Account Name:" links to the chosen Account.',
    projectName: projectName('Delivery'), projectType: 'Delivery',
  },
  createEstimation: {
    id: 'TC_PRJ_016', severity: 'blocker',
    name: 'Create an Estimation project',
    description: 'Verify an Estimation project saves and opens View & Edit Project (MF-4, MF-5).',
    condition: 'All required controls populated; Project Type = Estimation.',
    expected: 'The project saves and opens with Project Type = Estimation.',
    projectName: projectName('Estimation'), projectType: 'Estimation',
  },
  changedStatus: {
    id: 'TC_PRJ_017', severity: 'normal',
    name: 'Create a project with a non-default Project Status',
    description: 'Verify a Project Status chosen by the user (other than the default) is saved (MF-1, MF-4).',
    condition: 'User changes Project Status before saving.',
    expected: 'The saved project shows the chosen Project Status.',
    projectName: projectName('Status'), projectType: 'Delivery', changeStatus: true,
  },
  initialPhase: {
    id: 'TC_PRJ_018', severity: 'critical',
    name: 'New project starts in the template\'s first phase',
    description: 'Verify CurrentProjectPhase is set from the template phase with the lowest ExecutionOrder (BR.SERV.Project.Create.InitialPhaseFromTemplate).',
    condition: 'Project saved with the "Default / Version 1" template.',
    expected: 'Project Phase on the saved project = the first phase the template lists (e.g. Planning).',
    projectName: projectName('Phase'), projectType: 'Delivery',
  },
  templateSaved: {
    id: 'TC_PRJ_019', severity: 'critical',
    name: 'Selected Template Version is saved on the project',
    description: 'Verify AuthoritativeProjectTemplateVersion is set to the selected version (MF-4).',
    condition: 'Project saved with a chosen Template Version.',
    expected: 'The saved project shows the selected Template Version, or (when the template is not displayed) the phases of that template.',
    projectName: projectName('Template'), projectType: 'Estimation',
  },
  listedOnAccount: {
    id: 'TC_PRJ_020', severity: 'normal',
    name: 'New project is listed on the Account\'s Projects tab',
    description: 'Verify the saved project appears on its Account\'s Projects tab.',
    condition: 'Project saved on the seeded Account.',
    expected: 'The Account\'s Projects tab (All) lists the project.',
    projectName: projectName('Listed'), projectType: 'Delivery',
  },
  typeImmutable: {
    id: 'TC_PRJ_021', severity: 'critical',
    name: 'Project Type cannot be changed after the project is created',
    description: 'Verify the saved project shows its Project Type read-only (Project Type Immutable).',
    condition: 'Project saved with Project Type = Estimation.',
    expected: 'On View & Edit Project the Project Type is shown and cannot be edited.',
    projectName: projectName('Immutable'), projectType: 'Estimation',
  },
  statusHistory: {
    id: 'TC_PRJ_022', severity: 'normal',
    name: 'Creation is recorded in the project\'s Audit',
    description: 'Verify saving records the creation / initial Project Status (ProjectStatusHistory, 62382 Base Add) visible on the Audit tab (MF-4).',
    condition: 'Project saved; Audit tab opened.',
    expected: 'The Audit tab shows an entry for the new project / its status.',
    projectName: projectName('Audit'), projectType: 'Delivery',
  },
  manualAccount: {
    id: 'TC_PRJ_023', severity: 'normal',
    name: 'Create a project choosing the Account manually',
    description: 'Verify a project created from Add New (no AccountID) with the Account chosen in the selector saves (MF-1, MF-2, MF-4).',
    condition: 'Create Project opened from Add New; user selects the Account.',
    expected: 'The project saves on the chosen Account.',
    projectName: projectName('Manual Account'), projectType: 'Estimation',
  },
  // --- negative ---
  noType: {
    id: 'TC_PRJ_024', type: 'Negative', severity: 'critical',
    name: 'Save without a Project Type is rejected',
    description: 'Verify the project cannot be saved when Project Type is not chosen (MF-1: the user is required to populate it).',
    condition: 'All other controls populated; Project Type empty.',
    expected: 'A validation error is shown and the user stays on Create Project; no project is created.',
    projectName: projectName('No Type'),
  },
  noTemplate: {
    id: 'TC_PRJ_025', type: 'Negative', severity: 'critical',
    name: 'Save without a Template Version is rejected',
    description: 'Verify the project cannot be saved without a valid Project Template Version (BR.SERV.Project.Create.TemplateRequired).',
    condition: 'All other controls populated; Template Version empty.',
    expected: 'A validation error is shown and no project is created.',
    projectName: projectName('No Template'), projectType: 'Delivery',
  },
  emptyForm: {
    id: 'TC_PRJ_026', type: 'Negative', severity: 'normal',
    name: 'Save of an empty form is rejected',
    description: 'Verify saving the Create Project form with nothing entered is rejected with validation errors (62382 validation).',
    condition: 'Create Project opened without AccountID; nothing entered.',
    expected: 'Validation errors are shown and the user stays on Create Project.',
  },
  invalidAccount: {
    id: 'TC_PRJ_027', type: 'Negative', severity: 'minor',
    name: 'Unknown AccountID does not pre-populate an Account',
    description: 'Verify /Project/Create?AccountID=<unknown id> opens without an error and leaves the Account selector empty (MF-1).',
    condition: 'AccountID that does not exist (999999999).',
    expected: 'The page opens (no error page) and no Account is pre-populated.',
    accountId: '999999999',
  },
  doNotShowAgain: {
    id: 'TC_PRJ_028', severity: 'normal',
    name: '"Do not show again" suppresses the Project Type notice',
    description: 'Verify ticking "Do not show again" sets SuppressProjectTypeImmutableNotice for the user so the notice no longer appears (Scenario, SET.SERV.Project.SuppressProjectTypeImmutableNotice).',
    condition: 'PROJECT_ALLOW_SUPPRESS_NOTICE=true (changes the signed-in user\'s setting permanently).',
    expected: 'After ticking the box and Ok, a new Create Project page does not show the notice.',
    projectType: 'Delivery',
  },
  // --- fields the sandbox form has (Project Information / Billing / Schedule) ---
  nameRequired: {
    id: 'TC_PRJ_029', type: 'Negative', severity: 'critical',
    name: 'Save without a Project Name is rejected',
    description: 'Verify the project cannot be saved without the required Project Name (62382 validation).',
    condition: 'Account, Project Template and Project Status populated; Project Name empty.',
    expected: 'A "required" validation error is shown and no project is created.',
    clear: 'projectName', projectName: '', projectType: 'Delivery',
  },
  accountRequired: {
    id: 'TC_PRJ_030', type: 'Negative', severity: 'critical',
    name: 'Save without an Account is rejected',
    description: 'Verify the project cannot be saved without an Account ("Account is required").',
    condition: 'Create Project opened without AccountID; Project Name, Template and Status populated; Account empty.',
    expected: '"Account is required" is shown and no project is created.',
    clear: 'account', projectName: projectName('No Account'), projectType: 'Delivery', message: 'Account is required',
  },
  statusRequired: {
    id: 'TC_PRJ_031', type: 'Negative', severity: 'normal',
    name: 'Save without a Project Status is rejected',
    description: 'Verify the project cannot be saved when the Project Status is cleared ("Project Status is required").',
    condition: 'Project Status set to "Select"; all other required controls populated.',
    expected: '"Project Status is required" is shown and no project is created.',
    clear: 'projectStatus', projectName: projectName('No Status'), projectType: 'Delivery', message: 'Project Status is required',
  },
  optionalDetails: {
    id: 'TC_PRJ_032', severity: 'normal',
    name: 'Create a project with Project Code, Description and billing details',
    description: 'Verify the optional Project Code, Description, Primary Billing Type and Estimated Hours are saved with the project (MF-2, MF-4).',
    condition: 'Existing Account; required controls plus the optional fields populated.',
    expected: 'The saved project shows the Project Code, Description, Primary Billing Type and Estimated Hours entered.',
    projectName: projectName('Details'), projectType: 'Estimation',
    details: { projectCode: `PW-${tag.replace(/\D/g, '').slice(-6)}`, description: `${kw} project created by automation ${tag}`, billingType: 'Fixed Fee', estimatedHours: '120' },
  },
  scheduleDates: {
    id: 'TC_PRJ_033', severity: 'normal',
    name: 'Create a project with Scheduled Start Date and Due Date',
    description: 'Verify the Schedule dates entered on Create Project are saved (MF-2, MF-4).',
    condition: 'Existing Account; Scheduled Start Date and Due Date entered.',
    expected: 'The saved project shows the Scheduled Start Date and Due Date.',
    projectName: projectName('Schedule'), projectType: 'Delivery',
    details: { scheduledStart: '2026-11-02', dueDate: '2026-12-18' },
  },
  cancel: {
    id: 'TC_PRJ_034', type: 'Negative', severity: 'normal',
    name: 'Cancel does not create the project',
    description: 'Verify Cancel on Create Project discards the entered values and no project is created.',
    condition: 'Form filled in; user clicks Cancel instead of Save.',
    expected: 'The form is reset (Project Name empty), no project page opens and the Account does not list the project.',
    projectName: projectName('Canceled'), projectType: 'Delivery',
  },
};

module.exports = { MODULE, TEXT, TYPES, seedCompany, projectCases };
