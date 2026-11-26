/**
 * Simulate Workflow Template Version (use case 63102, module TASK, docs/63102 Simulate Workflow Template Version Use Case.md).
 * Case ids are TC-nn; `description` names the use-case step (MF-n) or business rule (BR-n) it covers.
 * Screen: Settings > Workflow Templates > a template > "Work Steps" tab > Simulate (/WorkflowTemplate/Edit/{id}).
 *
 * The cases run against a PUBLISHED template that has a prerequisite chain and a Project Phase gate. The default is the
 * sandbox's "Automation Delivery" (id 14): six steps, the 4th/5th step have two required prerequisites and the last step is
 * gated by the "Acceptance" phase. Override with WORKFLOW_TEMPLATE_ID (and keep the STEPS data in line with that template).
 *
 * Display indicator values (data-display-state of a step): NotReadyToStart, ReadyToComplete, Completed, TemporarilyBlocked, Canceled.
 *
 * Not automated: alternative (OR) prerequisite sets (the sandbox has no template with one), BR-2 "not available while the version
 * has unsaved changes" (needs an editable draft with a pending change), status filters isActive / IsDeleted (need catalog edits).
 *
 * Application defects found while writing the cases (cases with `defect` are expected to fail, see utils/testCase.js):
 *  - TC-09: the Project Phase list has no "None" entry and starts on the first phase (spec BR-7 / MF-1: None).
 *  - TC-30: a blocked / canceled step does not name which governing status (Account, Project or Service) caused it (MF-5, DL-6).
 */
const MODULE = 'Workflow Simulation';

const TEMPLATE = {
  id: process.env.WORKFLOW_TEMPLATE_ID || '14',
  name: 'Automation Delivery',
  subtitle: /^Automation Delivery, v\d+ \(Published\)$/,
};

const STEPS = [
  { name: 'Define automation outcome', prerequisites: [] },
  { name: 'Design automation flow', prerequisites: ['Define automation outcome'] },
  { name: 'Configure automation', prerequisites: ['Design automation flow'] },
  { name: 'Deploy to Sandbox', prerequisites: ['Configure automation'] },
  { name: 'Test automation', prerequisites: ['Configure automation', 'Deploy to Sandbox'] },
  { name: 'Activate automation', prerequisites: ['Test automation'], phase: 'Acceptance' },
];

const DATA = {
  title: 'Workflow Simulation',
  stepStatuses: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Skipped'],
  defaultStepStatus: 'Not Started',
  accountStatuses: ['Prospect', 'Active', 'On Hold', 'Inactive', 'Closed'],
  projectStatuses: ['Draft', 'Active', 'On Hold', 'Completed', 'Canceled'],
  serviceStatuses: ['Active', 'Canceled', 'Completed', 'Pause'],
  phases: ['Planning', 'Design', 'Development', 'Testing', 'Review', 'Acceptance'],
  initialGoverning: { account: 'Active', project: 'Active', service: 'Active' },
  initialPhase: 'None',
  gatedPhase: 'Acceptance',
  phasesBelowGate: ['Planning', 'Design', 'Development', 'Testing', 'Review'],
  // governing status -> indicator of every step
  blockingAccount: ['Prospect', 'On Hold', 'Inactive'],
  terminalAccount: ['Closed'],
  blockingProject: ['Draft', 'On Hold'],
  terminalProject: ['Completed', 'Canceled'],
  blockingService: ['Pause'],
  terminalService: ['Canceled', 'Completed'],
  evaluatePath: '/WorkflowTemplate/WorkflowSimulationEvaluate',
  states: {
    notReady: 'NotReadyToStart',
    readyComplete: 'ReadyToComplete',
    completed: 'Completed',
    blocked: 'TemporarilyBlocked',
    canceled: 'Canceled',
  },
  labels: {
    notReady: 'Not ready to start',
    readyComplete: 'Ready to complete',
    blocked: 'Temporarily blocked',
    canceled: 'Canceled',
    requiredHeading: 'Required prerequisites:',
    phaseHeading: 'Project Phase:',
  },
};

const cases = {
  simulateButton: { id: 'TC-01', name: 'Simulate button is available on the Work Steps tab', description: 'MF-1, BR-1: open a saved version and go to Work Steps.', condition: 'User with PERM.TASK.WorkflowTemplate.View; published template version.', expected: 'A Simulate button is displayed on the Work Steps tab.', severity: 'critical' },
  openSimulation: { id: 'TC-02', name: 'Workflow Simulation opens for a saved version', description: 'MF-1, BR-2: click Simulate.', condition: 'Saved template version.', expected: 'The "Workflow Simulation" dialog opens and its subtitle shows the template name, version number and version status.', severity: 'critical' },
  stepsListed: { id: 'TC-03', name: 'Every workflow step is listed as a simulated work item', description: 'MF-1: each persisted WorkflowStep is represented once.', condition: 'Template with six steps.', expected: 'The Steps list shows all steps of the version, once each, in step order.', severity: 'critical' },
  initialStepStatus: { id: 'TC-04', name: 'Every simulated work item starts on the default status', description: 'MF-1: initialize to the effective default WorkItemStatus (62203).', condition: 'Simulation just opened.', expected: 'Every step shows the status "Not Started".', severity: 'critical' },
  stepStatusOptions: { id: 'TC-05', name: 'Each step offers the selectable work item statuses', description: 'BR-6: active, not deleted statuses in SortOrder.', condition: 'Simulation open.', expected: 'Every step status dropdown lists Not Started, In Progress, On Hold, Completed, Skipped in that order.' },
  governingOptions: { id: 'TC-06', name: 'Account, Project and Service Status dropdowns list the selectable statuses', description: 'BR-15: active, not deleted values in SortOrder.', condition: 'Simulation open.', expected: 'Each dropdown lists its catalog values in SortOrder.' },
  governingInitial: { id: 'TC-07', name: 'Governing statuses start on a value that allows execution', description: 'MF-1, DL-4: first selectable value with AllowsWorkItemExecution = 1.', condition: 'Simulation just opened.', expected: 'Account Status, Project Status and Service Status each start on "Active".', severity: 'critical' },
  phaseOptions: { id: 'TC-08', name: 'Project Phase dropdown lists the selectable phases', description: 'BR-7: the active, not deleted phases.', condition: 'Simulation open.', expected: 'Planning, Design, Development, Testing, Review and Acceptance are listed in SortOrder.' },
  phaseInitialNone: { id: 'TC-09', name: 'Project Phase starts on None', description: 'MF-1, BR-7: initialize the simulated Project Phase to None.', condition: 'Simulation just opened.', expected: 'The Project Phase dropdown offers "None" and starts on it.', defect: 'The Project Phase list has no "None" entry and starts on "Planning" (63102 BR-7 / MF-1 require None).', severity: 'critical' },
  initialIndicators: { id: 'TC-10', name: 'Opening the simulation displays an indicator for every step', description: 'MF-1, BR-10: one display indicator per simulated work item.', condition: 'Default state.', expected: 'The first step (no prerequisites) is not "Not ready to start"; all steps that depend on another step show "Not ready to start".', severity: 'critical' },
  completeUnlocksNext: { id: 'TC-11', name: 'Completing a step satisfies the next step\'s prerequisite', description: 'MF-2, BR-8: set step 1 to Completed.', condition: 'Default state.', expected: 'Step 1 shows "Completed" and step 2 changes from "Not ready to start" to "Ready to complete".', severity: 'critical' },
  skippedCompletes: { id: 'TC-12', name: 'A Skipped step counts as completed', description: 'MF-2: Skipped has IsCompletedStatusForWorkItemDependency = 1.', condition: 'Default state.', expected: 'Step 1 shows "Completed" and step 2 is no longer "Not ready to start".' },
  inProgressNotCompleted: { id: 'TC-13', name: 'An In Progress step does not satisfy a completion prerequisite', description: 'MF-2, BR-8: only completed statuses satisfy "has completed".', condition: 'Default state.', expected: 'Step 2 stays "Not ready to start" while step 1 is In Progress.' },
  onHoldBlocked: { id: 'TC-14', name: 'An On Hold step is displayed as Temporarily blocked', description: 'MF-2, BR-10: display indicator of a held status.', condition: 'Default state.', expected: 'Step 1 shows "Temporarily blocked".' },
  recalculateAll: { id: 'TC-15', name: 'Changing a status recalculates every step', description: 'MF-2: readiness of all work items is recalculated.', condition: 'Chain of dependent steps.', expected: 'Completing steps one after another moves the "Not ready to start" indicator down the chain; undoing the first step restores it for the following steps.', severity: 'critical' },
  unmetRequired: { id: 'TC-16', name: 'Unmet required prerequisite is explained', description: 'MF-5, BR-12: open the explanation of a not-ready step.', condition: 'Default state.', expected: 'The step shows "Not ready to start", the lead-in "can start when all of the following are satisfied" and the required prerequisite "Define automation outcome has completed".', severity: 'critical' },
  unmetMultiple: { id: 'TC-17', name: 'Each unmet required prerequisite is listed as its own blocker', description: 'BR-12, MF-5: a step with two required prerequisites.', condition: 'Step "Test automation".', expected: 'Both "Configure automation has completed" and "Deploy to Sandbox has completed" are listed under Required prerequisites.' },
  unmetDisappears: { id: 'TC-18', name: 'A satisfied prerequisite leaves the explanation', description: 'MF-5: complete one of two prerequisites.', condition: 'Step "Test automation", prerequisites open.', expected: 'After "Configure automation" is completed only "Deploy to Sandbox has completed" remains.' },
  phaseGateText: { id: 'TC-19', name: 'An unmet Project Phase requirement is explained', description: 'MF-5, BR-12: step gated by a phase.', condition: 'Chain completed, phase below Acceptance.', expected: 'The last step is "Not ready to start" and lists Project Phase: The project has reached the "Acceptance" phase.', severity: 'critical' },
  phaseGateSatisfied: { id: 'TC-20', name: 'Selecting the gated phase satisfies the Project Phase gate', description: 'MF-3, BR-7: selected SortOrder >= gated SortOrder.', condition: 'Chain completed.', expected: 'With Acceptance selected the last step is "Ready to complete"; with Review it stays "Not ready to start".', severity: 'critical' },
  phaseBackward: { id: 'TC-21', name: 'The Project Phase can be moved backward again', description: 'MF-3, BR-7: move freely forward and backward.', condition: 'Chain completed.', expected: 'Acceptance then Design makes the last step "Not ready to start" again; every move recalculates.' },
  accountBlocking: { id: 'TC-22', name: 'An Account Status that does not allow execution blocks every step', description: 'MF-3.5, BR-8: Prospect, On Hold and Inactive.', condition: 'Other statuses Active.', expected: 'Every step shows "Temporarily blocked" for each of these Account Statuses.', severity: 'critical' },
  accountTerminal: { id: 'TC-23', name: 'A terminal Account Status cancels every step', description: 'MF-3.5, BR-10: Closed.', condition: 'Other statuses Active.', expected: 'Every step shows "Canceled".', severity: 'critical' },
  projectBlocking: { id: 'TC-24', name: 'A Project Status that does not allow execution blocks every step', description: 'MF-3.5: Draft and On Hold.', condition: 'Other statuses Active.', expected: 'Every step shows "Temporarily blocked".', severity: 'critical' },
  projectTerminal: { id: 'TC-25', name: 'A terminal Project Status cancels every step', description: 'MF-3.5: Completed and Canceled.', condition: 'Other statuses Active.', expected: 'Every step shows "Canceled".', severity: 'critical' },
  serviceBlocking: { id: 'TC-26', name: 'A Service Status that does not allow execution blocks every step', description: 'MF-3.5: Pause.', condition: 'Other statuses Active.', expected: 'Every step shows "Temporarily blocked".', severity: 'critical' },
  serviceTerminal: { id: 'TC-27', name: 'A terminal Service Status cancels every step', description: 'MF-3.5: Canceled and Completed.', condition: 'Other statuses Active.', expected: 'Every step shows "Canceled".', severity: 'critical' },
  governingIndependent: { id: 'TC-28', name: 'Governing statuses are selected independently and can be restored', description: 'BR-15, MF-3.5: change one, then back.', condition: 'Simulation open.', expected: 'Changing one status leaves the other two selections untouched; returning it to Active restores the previous readiness.' },
  workItemStatusKept: { id: 'TC-29', name: 'Step statuses are kept while governing statuses change', description: 'MF-3.5: the governing change recalculates the indicators only.', condition: 'Step 1 Completed.', expected: 'Step 1 still shows the selected status "Completed" while the account is On Hold and after it is Active again.' },
  governingAttribution: { id: 'TC-30', name: 'The explanation names which governing status blocks the step', description: 'MF-5, DL-6: identify Account, Project or Service.', condition: 'Account Status On Hold.', expected: 'The explanation of a blocked step states that the Account Status is the cause.', defect: 'A blocked step only shows "Temporarily blocked"; it does not name the Account, Project or Service status that causes it (63102 MF-5 / DL-6).' },
  expandCollapse: { id: 'TC-31', name: 'A step explanation can be expanded and collapsed', description: 'MF-5: user requests the explanation of a step.', condition: 'Simulation open.', expected: 'Clicking a step row expands its explanation; clicking again collapses it.' },
  anyStepExplained: { id: 'TC-32', name: 'The explanation is available for a step that is ready', description: 'DL-7, MF-5: not only blocked steps.', condition: 'Default state.', expected: 'Step 1 expands and shows "Ready to complete".' },
  reset: { id: 'TC-33', name: 'Reset restores the opening state without confirmation', description: 'MF-6: change statuses, phase and governing statuses, then click Reset.', condition: 'Changed simulation.', expected: 'All steps, the phase and the governing statuses return to the opening state immediately; no confirmation appears.', severity: 'critical' },
  closeDiscards: { id: 'TC-34', name: 'Closing the simulation discards its state without confirmation', description: 'MF-7, BR-14: change values, close, reopen.', condition: 'Changed simulation.', expected: 'The dialog closes at once; reopening shows the opening state.', severity: 'critical' },
  noPersistence: { id: 'TC-35', name: 'Simulating changes nothing in the database', description: 'BR-14, Scope: no operational records are created or updated.', condition: 'Any simulation session.', expected: 'The only write-type requests are the evaluate calls; the template page shows the same version and steps after a reload.', severity: 'critical' },
  noRecordsInRequest: { id: 'TC-36', name: 'The evaluate request carries only simulated inputs', description: 'DL-1: no Account, Project or Service record is referenced.', condition: 'Simulation open.', expected: 'The request contains the template and version ids, the phase, three status ids and the step statuses - no account, project or service record id.' },
  versionHeader: { id: 'TC-37', name: 'Simulation subtitle matches the version it was opened from', description: 'MF-1: the persisted version is loaded.', condition: 'Version shown on the page.', expected: 'The version number in the subtitle equals the "Version n" shown on the template page.' },
};

module.exports = { MODULE, TEMPLATE, STEPS, DATA, cases };
