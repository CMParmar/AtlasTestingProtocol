const { env } = require('../utils/testData');

/**
 * Use case 62433 - Create Service (module SERV; the sandbox UI calls a Service a "Deliverable" and the Service Item a
 * "Deliverable Type"). Test-case ids are the use case's "Additional Test Cases" (T-1 .. T-28); T-29 and up are the
 * cases added for later change requests (workflow template list 63334, Date Ordered 63099, change request MF-1.5).
 * Names carry keyword + run tag so every run is unique.
 *
 * Environment (all optional):
 *   SERVICE_ACCOUNT_NAME   Account the Deliverables are created on        (default "Test case factory")
 *   SERVICE_OTHER_ACCOUNT  A second account that has projects              (default "Administration")
 */
const MODULE = 'Service';

const kw = env.keyword;
const tag = env.runTag;
const name = label => `${kw} ${label} Deliverable ${tag}`;

/** Accounts the suite works on, resolved by name from the Account selector (see utils/serviceAccount.js). */
const ACCOUNTS = {
  main: process.env.SERVICE_ACCOUNT_NAME || 'Test case factory',
  other: process.env.SERVICE_OTHER_ACCOUNT || 'Administration',
};

/**
 * Deliverable Types (Service Items) in the sandbox and what each one applies (observed on the Create form):
 *   AI Agent     default template "AI Agent Delivery" -> stage locked to the template's stage, Time & Material, 21 h
 *   Requirement  3 templates, default "Software Delivery"; billing Non-billable / Time & Material / Custom Bid
 *   Automation   one template, NOT the default -> nothing pre-selected; Fixed Price, 4 h
 *   Support      Time & Material, 2.25 h (differs from Automation, used to check AF-4)
 *   Method       only Non-billable is allowed
 */
const ITEMS = {
  withDefaultTemplate: { name: 'AI Agent', billingType: 'Time & Material', hours: '21', templateName: 'AI Agent Delivery', stage: 'Planning' },
  multiTemplate: { name: 'Requirement', defaultTemplate: 'Software Delivery' },
  noDefaultTemplate: { name: 'Automation', billingType: 'Fixed Price', hours: '4', templateName: 'Automation Delivery' },
  other: { name: 'Support', billingType: 'Time & Material', hours: '2.25' },
  onlyNonBillable: { name: 'Method', billingTypes: ['Non-billable'] },
};

const MESSAGES = {
  itemRequired: 'Deliverable Type is required',
  nameRequired: 'Deliverable Name is required',
  stageRequired: 'Deliverable Stage is required',
  added: 'Your new record has been added.',
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });
const CREATE = 'User has PERM.SERV.Service.Create and update access to the Account / Project.';
const SAVED = 'Deliverable is saved and opens showing the entered values.';
const NEG = { type: 'Negative' };

const serviceCases = {
  // --- MF-1 Open Add Service ---
  open: tc('T-1', 'critical', 'Open Add Service shows an empty form', 'Verify Add Service opens with Account, Deliverable Type, Name, Project, Status, Stage and Save, with nothing pre-populated (MF-1).', CREATE, 'Blank form; Account and Project not pre-populated.'),
  noPermission: tc('T-2', 'critical', 'User without PERM.SERV.Service.Create cannot open Add Service', 'Verify access is denied without the Create permission (AF).', 'Second user without PERM.SERV.Service.Create (not automated).', 'Access denied.', NEG),
  accountParam: tc('T-3', 'critical', 'Account passed as a parameter is pre-populated', 'Verify /Service/Create?AccountID={id} pre-populates Account and offers only that Account\'s projects (MF-1).', CREATE, 'Account selected; Project list belongs to the Account.'),
  projectParam: tc('T-4', 'critical', 'Project passed as a parameter pre-populates Project and Account', 'Verify /Service/Create?ProjectID={id} (Add Deliverable on the project) pre-populates Project and its Account (MF-1).', CREATE, 'Project and Account pre-populated.'),
  accountSelect: tc('T-5', 'normal', 'Selecting an Account lists only its projects', 'Verify choosing an Account manually reloads the Project list with that Account\'s projects only (MF-1).', CREATE, 'Project list changes with the Account; two Accounts share no project.'),

  // --- MF-2 Enter Service Details ---
  itemDefaults: tc('T-6', 'critical', 'Deliverable Type applies Billing Type and Estimated Hours defaults', 'Verify choosing a Deliverable Type defaults Billing Type and Estimated Hours; the Deliverable Name is not overwritten (MF-2).', CREATE, 'Billing Type and Estimated Hours default from the type; Name stays as typed.'),
  templateDefault: tc('T-7', 'critical', 'Template with a default is pre-selected and locks the Stage', 'Verify a Deliverable Type whose template is the default selects it and makes Deliverable Stage read-only (MF-2, 63334).', CREATE, 'Template selected; Stage disabled and set from the template.'),
  noTemplateStage: tc('T-8', 'critical', 'Clearing the template keeps Stage editable', 'Verify with no template selected the Deliverable Stage can be chosen by the user (MF-2).', CREATE, 'Stage enabled and selectable.'),
  optionalFields: tc('T-9', 'normal', 'Optional fields accept valid input', 'Verify Project, Date Ordered, Scheduled Start, Due Date, Billing Type and Estimated Hours accept input (MF-2).', CREATE, 'Every entered value is kept in the form.'),
  hoursBlank: tc('T-10', 'normal', 'Estimated Hours left blank stays empty', 'Verify clearing Estimated Hours saves it as empty (MF-2, MF-3).', CREATE, 'Estimated Hours empty on the saved Deliverable.',
    { data: { item: ITEMS.noDefaultTemplate.name, serviceName: name('NoHours'), stage: 'Planning', estimatedHours: '' } }),
  templateList: tc('T-29', 'critical', 'Workflow Template list follows the Deliverable Type', 'Verify the Workflow Template list is empty until a Deliverable Type is chosen, then lists the compatible templates (MF-1, MF-2, 63334).', CREATE, 'Empty list before; compatible templates after.'),
  templateChange: tc('T-30', 'normal', 'Another compatible template can be chosen or removed', 'Verify a Deliverable Type with several templates lets the user switch template or remove the selection (MF-2, 63334).', CREATE, 'Template switchable and clearable.'),
  billingAllowed: tc('T-14', 'critical', 'Billing Type offers only the types the Deliverable Type allows', 'Verify the Billing Type list is limited to the types allowed for the chosen Deliverable Type (BR.SERV.Service.BillingType).', CREATE, 'Only allowed Billing Types are offered; the default is one of them.'),
  dateOrdered: tc('T-31', 'normal', 'Date Ordered defaults to today and can be cleared', 'Verify Date Ordered is pre-populated with the current date (account time zone) and the user can remove it (MF-1, 63099).', CREATE, 'Today\'s date pre-populated; editable.'),

  // --- MF-3 Save Service ---
  saveProject: tc('T-11', 'critical', 'Save a Deliverable on a Project', 'Verify a Deliverable with Account, Deliverable Type and Project saves (PERM.SERV.Project.Update) (MF-3).', CREATE, SAVED,
    { data: { item: ITEMS.noDefaultTemplate.name, serviceName: name('OnProject'), withProject: true, stage: 'Planning', description: 'Created by Playwright automation.' } }),
  saveAccount: tc('T-12', 'critical', 'Save a Deliverable on an Account only', 'Verify a Deliverable with no Project saves against the Account (PERM.SERV.Account.Update) (MF-3).', CREATE, SAVED,
    { data: { item: ITEMS.noDefaultTemplate.name, serviceName: name('AccountOnly'), stage: 'Planning' } }),
  requiredFields: tc('T-13', 'critical', 'Save without the required fields is rejected', 'Verify Save with nothing entered shows Deliverable Type, Name and Stage required messages and does not save (MF-3).', CREATE, 'Required messages shown; Deliverable not created.', NEG),
  workflow: tc('T-16', 'critical', 'Saving with a template materializes the work items', 'Verify a Deliverable saved with a workflow template gets its work items (MF-3, 63071).', CREATE, 'Work Items tab lists the template\'s steps.',
    { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('Workflow') } }),
  noWorkflow: tc('T-17', 'critical', 'Saving without a template creates no work items', 'Verify a Deliverable saved with the template cleared has no work items (MF-3).', CREATE, 'Work Items tab is empty.',
    { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('NoWorkflow'), noTemplate: true, stage: 'Planning' } }),
  history: tc('T-18', 'critical', 'Status history is recorded on save', 'Verify saving writes the initial status history for the Deliverable (MF-3).', CREATE, 'History tab shows the initial Active status and Stage by the current user.',
    { data: { item: ITEMS.noDefaultTemplate.name, serviceName: name('History'), stage: 'Planning' } }),
  stageUser: tc('T-19', 'critical', 'Stage chosen by the user is the stage saved', 'Verify the stage the user selected is passed to the stage use case and saved (MF-3, 62610).', CREATE, 'Saved Deliverable shows the chosen stage.',
    { data: { item: ITEMS.noDefaultTemplate.name, serviceName: name('UserStage'), stage: 'Design' } }),
  stageTemplate: tc('T-20', 'critical', 'Template default stage is saved when the user cannot choose one', 'Verify with a template the Deliverable is saved in the template\'s default stage (MF-3, 62610).', CREATE, 'Saved Deliverable shows the template\'s stage.',
    { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('TemplateStage') } }),
  audit: tc('T-21', 'normal', 'Base add records the creation in the Audit tab', 'Verify the add is audited with the entered fields (MF-3, 62382).', CREATE, 'Audit lists the Deliverable name and type as added.',
    { data: { item: ITEMS.noDefaultTemplate.name, serviceName: name('Audit'), stage: 'Planning' } }),
  allFields: tc('T-32', 'normal', 'Save with every optional field', 'Verify Description, Billing Type, Estimated Hours and the three dates are all saved (MF-2, MF-3).', CREATE, SAVED,
    { data: { item: ITEMS.noDefaultTemplate.name, serviceName: name('AllFields'), stage: 'Planning', description: 'All optional fields.', billingType: 'Custom Bid', estimatedHours: '12.5', orderedDate: today(), scheduledStart: inDays(1), dueDate: inDays(30) } }),
  cancel: tc('T-33', 'normal', 'Cancel discards the entered values', 'Verify Cancel leaves without creating a Deliverable (MF-3).', CREATE, 'No Deliverable created.',
    { data: { item: ITEMS.noDefaultTemplate.name, serviceName: name('Canceled') } }),

  // --- AF-4 change Service Item ---
  changeItem: tc('T-22', 'critical', 'Changing the Deliverable Type re-applies the defaults', 'Verify a new Deliverable Type resets Billing Type and Estimated Hours to its defaults (AF-4).', CREATE, 'Billing Type and Estimated Hours follow the new type.'),
  changeItemKeeps: tc('T-23', 'critical', 'Changing the Deliverable Type keeps the unrelated fields', 'Verify Name, Project and dates stay unchanged when the Deliverable Type changes (AF-4).', CREATE, 'Name, Project, Description and dates unchanged.'),

  // --- other ---
  duplicateName: tc('T-24', 'normal', 'Duplicate name in a Project is made unique (future requirement)', 'Future requirement: a name already used in the project gets a "(i)" suffix.', 'Not implemented yet.', 'Name suffixed "(2)".'),
  accountList: tc('T-25', 'normal', 'Only Accounts the user may update are listed', 'Verify the Account selector offers accounts the user can update.', 'Second user with limited permissions (not automated).', 'Only permitted Accounts.'),
  projectsEligible: tc('T-26', 'critical', 'Only eligible projects are offered', 'Verify the Project list holds only the selected Account\'s non-terminal projects the user may update (MF-1).', CREATE, 'Every offered project belongs to the Account (and is not terminal).'),
  inactiveItem: tc('T-27', 'normal', 'Inactive Deliverable Type cannot be used', 'Verify an inactive / deleted Service Item cannot be assigned.', 'Needs an inactive Service Item (database; not automated).', 'Not offered.', NEG),
  accountMismatch: tc('T-28', 'critical', 'A Project of another Account cannot be kept', 'Verify changing the Account drops a Project that belongs to the previous Account.', CREATE, 'Project cleared; only the new Account\'s projects offered.', NEG),
  terminalProject: tc('T-34', 'normal', 'Terminal projects cannot be assigned', 'Verify a Service cannot be assigned to a terminal project without the override permission.', 'Needs a terminal project / second user (not automated).', 'Blocked.', NEG),
  changeRequest: tc('T-35', 'normal', 'A change request can be created from an originating Service', 'Verify the form lets the user pick an originating Service (non-derived) and locks the Account to it (MF-1.5).', CREATE, 'An originating Service control exists.'),
};

module.exports = { MODULE, ACCOUNTS, ITEMS, MESSAGES, serviceCases, today, inDays };
