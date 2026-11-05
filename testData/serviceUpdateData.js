const { env } = require('../utils/testData');
const { ITEMS } = require('./serviceData');

/**
 * View & Edit Service (module SERV; the sandbox UI calls a Service a "Deliverable" and the Service Item a "Deliverable Type").
 * Test-case ids are the use case's "Additional Test Cases" (T-1 .. T-38); T-39 and up are the cases added for the later
 * change requests (Create / Link change request 62877, View change requests 62940, Scheduled / Actual Start Date).
 * Every test creates its own Deliverable on SERVICE_ACCOUNT_NAME (default "Test case factory") so tests never depend on each other.
 * Names carry keyword + run tag so every run is unique.
 */
const MODULE = 'Service Update';

const kw = env.keyword;
const tag = env.runTag;
const name = label => `${kw} ${label} Deliverable ${tag}`;

const today = () => new Date().toISOString().slice(0, 10);
const inDays = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Statuses / stages of the sandbox (observed on /Service/Edit): Active, Pause = open; Completed, Canceled = terminal. */
const STATUS = { active: 'Active', paused: 'Pause', completed: 'Completed', canceled: 'Canceled' };
const STAGES = { planning: 'Planning', design: 'Design', review: 'Review' };

/**
 * Billing types the Deliverable Type allows (observed): Automation = Fixed Price / Custom Bid / Non-billable
 * (Time & Material is NOT allowed); Method = Non-billable only.
 */
const BILLING = {
  automation: { allowed: ['Fixed Price', 'Custom Bid', 'Non-billable'], disallowed: 'Time & Material', change: 'Custom Bid' },
  method: { only: 'Non-billable' },
};

const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });
const EDITOR = 'User has PERM.SERV.Service.View and PERM.SERV.Service.Update.';
const NEG = { type: 'Negative' };
const BASE = { item: ITEMS.noDefaultTemplate.name, stage: STAGES.planning };

const serviceUpdateCases = {
  // --- MF-1 Open Service Detail ---
  openReadOnly: tc('T-1', 'critical', 'Read-only user sees the Service but cannot edit it', 'Verify a user with PERM.SERV.Service.View only sees every field, links and tabs but no editable control or Cancel / Complete command (MF-1).', 'Second user with View only (not automated).', 'All fields read-only; commands hidden.'),
  openEditor: tc('T-2', 'critical', 'Open Service detail as an editor', 'Verify the editor sees Account / Project as deep links, enabled editable fields, only same-account projects, no SortOrder, and the Documents, Work Items, Related and History tabs (MF-1).', EDITOR, 'Editable fields enabled; Account and Project are links; tabs shown; SortOrder not displayed.', { data: { ...BASE, serviceName: name('Open'), withProject: true } }),

  // --- MF-2 Edit Service Fields ---
  stageManual: tc('T-3', 'critical', 'Stage is editable and saved when no workflow is connected', 'Verify a manual Service (no workflow template) lets the user change Deliverable Stage and saves it (MF-2, MF-6).', EDITOR, 'Stage editable and saved.', { data: { ...BASE, serviceName: name('StageManual'), stage: STAGES.planning } }),
  stageWorkflow: tc('T-4', 'critical', 'Stage cannot be edited when a workflow is connected', 'Verify a Service with a workflow template shows Deliverable Stage read-only (MF-1, MF-2).', EDITOR, 'Stage control disabled; value unchanged by saving.', { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('StageWorkflow') } }),
  statusChange: tc('T-5', 'critical', 'Change Service Status to another non-terminal status', 'Verify changing Active to Pause saves and leaves Deliverable Stage unchanged (MF-2).', EDITOR, 'Status saved; Stage unchanged.', { data: { ...BASE, serviceName: name('StatusChange') } }),
  statusTerminal: tc('T-6', 'critical', 'Terminal statuses are not selectable in the Status dropdown', 'Verify the Status dropdown lists only non-terminal statuses (MF-1, MF-2).', EDITOR, 'Completed and Canceled are not offered.', { data: { ...BASE, serviceName: name('StatusTerminal') } }),
  billingAllowed: tc('T-7', 'critical', 'Billing Type allowed by the Deliverable Type can be selected', 'Verify an allowed Billing Type can be chosen and saved (MF-2).', EDITOR, 'Billing Type saved.', { data: { ...BASE, serviceName: name('BillingAllowed') } }),
  billingDisallowed: tc('T-8', 'critical', 'Billing Type not allowed by the Deliverable Type is not offered', 'Verify the Billing Type list is limited to the types allowed for the Deliverable Type (MF-1, MF-2).', EDITOR, 'Only allowed Billing Types offered.', { type: 'Negative', data: { ...BASE, serviceName: name('BillingDisallowed') } }),
  billingSingle: tc('T-9', 'normal', 'Single allowed Billing Type is shown as a label', 'Verify a Deliverable Type allowing one Billing Type shows it read-only rather than in a dropdown (MF-1, MF-2).', EDITOR, 'Value shown without a dropdown.', { data: { item: ITEMS.onlyNonBillable.name, serviceName: name('BillingSingle'), stage: STAGES.planning } }),
  itemChange: tc('T-10', 'critical', 'Service Item can be changed before delivery has started', 'Verify a user with PERM.SERV.Service.ChangeServiceItem can change the Deliverable Type after a confirmation; work items are recreated and Billing Type reset if needed (MF-2).', 'User has PERM.SERV.Service.ChangeServiceItem and no lock rule applies.', 'Confirmation shown; work items recreated.', { data: { ...BASE, serviceName: name('ItemChange') } }),
  itemLocked: tc('T-11', 'critical', 'Service Item is read-only once delivery has started', 'Verify the Deliverable Type is read-only after the Deliverable has started (BR.SERV.Service.LockServiceItem).', EDITOR, 'Deliverable Type control disabled.', { data: { ...BASE, serviceName: name('ItemLocked') } }),

  // --- MF-3 Manage Project Association ---
  projectDropdown: tc('T-18', 'critical', 'Project dropdown offers only non-terminal projects of the same Account', 'Verify the Project dropdown holds only the Account\'s projects and none in a terminal status (MF-1, AF-3).', EDITOR, 'Every offered project belongs to the Account and is not terminal.', { data: { ...BASE, serviceName: name('ProjectList') } }),
  projectAssign: tc('T-13', 'critical', 'Assign a Project to a Service that has none', 'Verify a Deliverable without a project can be assigned a valid project and saved (MF-3).', EDITOR, 'Project saved and shown as a link.', { data: { ...BASE, serviceName: name('ProjectAssign') } }),
  projectMigrate: tc('T-12', 'critical', 'Move a Service to another Project of the same Account', 'Verify a Deliverable on a project can be moved to another non-terminal project of the Account (MF-3).', 'Account has at least two non-terminal projects (skipped otherwise).', 'New project saved.', { data: { ...BASE, serviceName: name('ProjectMigrate'), withProject: true } }),
  projectBlocked: tc('T-14', 'normal', 'Project migration blocked by billing documents', 'Obsolete: projects no longer impact billing, so no billing check exists on a project change.', 'Not applicable to the current schema.', 'No check.', NEG),
  projectNoOverride: tc('T-15', 'critical', 'Terminal Project cannot be chosen without the override permission', 'Verify a user without PERM.SERV.Service.OverrideProjectAssignmentRules cannot move a Service to a terminal project (AF-2).', 'Second user without the override permission and a terminal project (not automated).', 'Blocked; scenario shown.', NEG),
  projectOverride: tc('T-16', 'critical', 'Terminal Project override with justification', 'Verify a user with the override permission must justify moving to a terminal project; the justification is recorded (AF-2, MF-6).', 'User has the override permission and a terminal project exists (not automated).', 'Justification required; migration succeeds.'),
  projectOverrideCancel: tc('T-17', 'normal', 'Cancelling the override dialog keeps the Project', 'Verify cancelling the override dialog leaves the Project unchanged (AF-2).', 'As T-16 (not automated).', 'Migration not applied.'),
  projectOverrideList: tc('T-19', 'normal', 'Override user sees terminal projects flagged', 'Verify a user with the override permission also sees terminal projects, visibly flagged (AF-3).', 'As T-16 (not automated).', 'Terminal projects visible with an indicator.'),

  // --- MF-6 Save ---
  saveValid: tc('T-20', 'critical', 'Save valid changes', 'Verify edited Name, Description, Estimated Hours, Customer Facing and dates (including Scheduled Start Date) are saved and shown after the page reloads (MF-6, 62382).', EDITOR, 'Changes persisted and shown.', { data: { ...BASE, serviceName: name('Save') } }),
  saveAudit: tc('T-20.1', 'normal', 'Saved changes are written to the Audit tab', 'Verify the change appears on the Audit tab with its old and new value (MF-6, 62382).', EDITOR, 'Audit lists the changed field.', { data: { ...BASE, serviceName: name('SaveAudit') } }),
  saveStatusHistory: tc('T-21', 'critical', 'Status change is recorded in the status history', 'Verify saving a changed status adds a History row for the new status by the current user (MF-6).', EDITOR, 'History lists the new status.', { data: { ...BASE, serviceName: name('StatusHistory') } }),
  saveStageManual: tc('T-22', 'critical', 'Stage change saves through the Update Service Stage use case', 'Verify a changed stage is saved and recorded in the History tab (MF-6, 62610).', EDITOR, 'Stage saved and listed in History.', { data: { ...BASE, serviceName: name('StageSave') } }),
  saveStageWorkflow: tc('T-23', 'critical', 'Stage stays unchanged on save when a workflow is connected', 'Verify saving other changes on a workflow Service does not change its stage (MF-6).', EDITOR, 'Stage unchanged.', { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('WorkflowSave') } }),
  saveRequired: tc('T-20.2', 'normal', 'Save without a Deliverable Name is rejected', 'Verify clearing the required Name blocks the save with a validation message (MF-6).', EDITOR, 'Name required message; record unchanged.', { type: 'Negative', data: { ...BASE, serviceName: name('SaveRequired') } }),
  cancelEdit: tc('T-20.3', 'normal', 'Cancel discards unsaved edits', 'Verify Cancel reloads the saved values (MF-2).', EDITOR, 'Saved values shown again.', { data: { ...BASE, serviceName: name('CancelEdit') } }),

  // --- MF-7 Cancel / Complete ---
  cancelCommand: tc('T-24', 'critical', 'Cancel Service command', 'Verify the Cancel Service command (62476) cancels the Service. The sandbox offers no Cancel command; the terminal "Canceled" status is chosen with the status dropdown.', 'Cancel command offered (not available in the sandbox).', 'Service canceled.'),
  completeCommand: tc('T-25', 'critical', 'Complete Service command', 'Verify completing a Service (62477): choose Completed, Save, confirm; the status is Completed and Actual Completion Date is set (MF-7).', EDITOR, 'Completion confirmed; status Completed.', { data: { ...BASE, serviceName: name('Complete') } }),

  // --- MF-5 Work Items ---
  workItems: tc('T-26', 'critical', 'Work Items tab lists the Service\'s work items', 'Verify a workflow Service lists its work items with name, status and a deep link (MF-5).', EDITOR, 'Work items listed.', { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('WorkItems') } }),
  workItemsSort: tc('T-27', 'normal', 'Work items can be sorted', 'Verify clicking a column header sorts the work items (MF-5).', EDITOR, 'Order changes with the sort.', { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('WorkItemsSort') } }),
  workItemLink: tc('T-28', 'normal', 'Work item row opens the work item', 'Verify each work item row links to its WorkItem detail (MF-5).', EDITOR, 'Row carries the WorkItem link and opens it.', { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('WorkItemLink') } }),
  workItemsEmpty: tc('T-26.1', 'normal', 'Work Items tab is empty without a workflow', 'Verify a manual Service shows the empty Work Items tab (MF-5).', EDITOR, 'No work items.', { data: { ...BASE, serviceName: name('WorkItemsEmpty') } }),

  // --- Documents ---
  documents: tc('T-29', 'normal', 'Documents tab is available', 'Verify the Documents tab opens and offers adding a document (MF-1).', EDITOR, 'Documents list and Add control shown.', { data: { ...BASE, serviceName: name('Documents') } }),

  // --- Terminal restrictions ---
  terminalService: tc('T-30', 'critical', 'Terminal Service restriction', 'Verify a completed Service blocks field updates unless the user holds PERM.SERV.Service.OverrideProjectAssignmentRules (BR.SERV.Service.TerminalServiceRestriction).', 'Second user without the override permission (not automated; the sandbox user can edit).', 'Update blocked.', NEG),
  terminalProject: tc('T-31', 'critical', 'Terminal Project restriction', 'Verify a Service of a terminal project cannot be updated without the override permission (BR.SERV.Service.TerminalProjectRestriction).', 'Terminal project and a second user (not automated).', 'Update blocked.', NEG),
  overrideAudit: tc('T-32', 'normal', 'Override is recorded with its justification', 'Verify the override justification is stored in Core.BusinessRuleOverride.', 'Override used (database; not automated).', 'BusinessRuleOverride row written.'),
  completionSet: tc('T-33', 'critical', 'Actual Completion Date is set when the Service is completed', 'Verify completing the Service fills the read-only Actual Completion Date with the current date in the account time zone (BR).', EDITOR, 'Actual Completion Date populated.', { data: { ...BASE, serviceName: name('CompletionSet') } }),
  completionReset: tc('T-34', 'critical', 'Actual Completion Date is cleared when the Service is reopened', 'Verify changing the status away from Completed clears Actual Completion Date (BR).', EDITOR, 'Actual Completion Date empty.', { data: { ...BASE, serviceName: name('CompletionReset') } }),
  lowRisk: tc('T-35', 'normal', 'Low-risk annotations are allowed on a terminal Service', 'Verify Tags, Documents and Conversations can still be added to a completed Service.', 'Terminal Service (covered by the document specs; not automated).', 'Allowed without override.'),

  // --- Workflow ---
  unlinkWorkflow: tc('T-36', 'critical', 'Remove the workflow from a Service', 'Verify a user with PERM.SERV.Service.UnlinkWorkflow can remove the workflow; the template is cleared and the stage becomes editable (MF-1, 62709).', 'Workflow-connected Service and the Unlink permission (skipped when the command is not offered).', 'Workflow template empty; Stage editable.', { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('Unlink') } }),
  workflowMenu: tc('T-36.1', 'normal', 'Change / Remove Workflow offered only with a workflow', 'Verify the Actions menu offers Change Workflow and Remove Workflow only for a Service connected to a template.', EDITOR, 'Commands match the workflow state.', { data: { item: ITEMS.withDefaultTemplate.name, serviceName: name('WorkflowMenu') } }),

  // --- Navigation ---
  recentlyViewed: tc('T-37', 'normal', 'Opening a Service adds it to Recently Viewed', 'Verify the opened Service is tracked in RecentlyViewed (62382).', 'Recently Viewed has no UI in the sandbox (database; not automated).', 'Entry added.'),
  unsavedWarning: tc('T-38', 'critical', 'Unsaved changes warning', 'Verify leaving the page with unsaved edits shows the browser\'s unsaved-changes prompt (62382).', EDITOR, 'Prompt shown; no prompt when nothing changed.', { data: { ...BASE, serviceName: name('Unsaved') } }),

  // --- Actual / Scheduled Start Date ---
  actualStart: tc('T-39', 'critical', 'Actual Start Date is read-only and set when the Service first becomes active', 'Verify Actual Start Date is a disabled field populated with the date the Service first entered a snapshot status, and that it keeps that date when the status changes and comes back (BR).', EDITOR, 'Read-only; populated; not overwritten.', { data: { ...BASE, serviceName: name('ActualStart') } }),
  actualCompletionReadOnly: tc('T-40', 'normal', 'Actual Completion Date is read-only and empty until completion', 'Verify Actual Completion Date is disabled and empty on an open Service (BR, MF-1).', EDITOR, 'Disabled and empty.', { data: { ...BASE, serviceName: name('ActualCompletionRO') } }),
  scheduledStart: tc('T-41', 'normal', 'Scheduled Start Date is user-entered, optional and saved', 'Verify Scheduled Start Date can be set and cleared independently of any Project dates (BR).', EDITOR, 'Date saved; empty after clearing.', { data: { ...BASE, serviceName: name('ScheduledStart') } }),

  // --- Change requests (MF-2.5, MF-7.5, 62877, 62940) ---
  crMenu: tc('T-42', 'critical', 'Create / Link Change Request commands are offered on a regular Service', 'Verify the Actions menu offers Create Change Request and Link as Change Request while the Service is not derived (MF-1, MF-7.5).', EDITOR, 'Both commands offered.', { data: { ...BASE, serviceName: name('CrMenu') } }),
  crCreate: tc('T-43', 'critical', 'Create Change Request opens Create Service with the originating Service', 'Verify Create Change Request opens /Service/Create?OriginatingServiceID={id} without changing the current Service (MF-7.5).', EDITOR, 'Create form opened for the originating Service; current Service unchanged.', { data: { ...BASE, serviceName: name('CrCreate') } }),
  crLinkList: tc('T-44', 'critical', 'Originating Service choices are same-Account, non-derived and exclude the Service itself', 'Verify the Link as Change Request dialog lists only Services of the same Account, never the current Service (MF-2.5).', EDITOR, 'Current Service absent; only same-Account Services.', { data: { ...BASE, serviceName: name('CrList') } }),
  crLink: tc('T-45', 'critical', 'Designate a Service as a change request', 'Verify linking a Service to an originating Service saves it as derived: the originating Service lists it under Related Deliverables and the derived one no longer offers Create / Link Change Request (MF-2.5, MF-6, 62940).', EDITOR, 'Derived Service saved; originating Service lists it.', { data: { ...BASE, serviceName: name('CrLink') } }),
  crReadOnly: tc('T-46', 'normal', 'Originating Service cannot be changed once saved', 'Verify a derived Service offers no command to change or remove its originating Service (BR).', EDITOR, 'Link command absent on the derived Service.', { data: { ...BASE, serviceName: name('CrReadOnly') } }),
  crTabHidden: tc('T-47', 'normal', 'Related Deliverables tab is empty when there are no change requests', 'Verify a Service nothing references shows the empty Related Deliverables tab (MF-1, 62940).', EDITOR, 'Result: 0 and no rows.', { data: { ...BASE, serviceName: name('CrEmpty') } }),
};

module.exports = { MODULE, STATUS, STAGES, BILLING, serviceUpdateCases, name, today, inDays };
