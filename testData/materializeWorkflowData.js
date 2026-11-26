const { env } = require('../utils/testData');

/**
 * Use case 63071 - Materialize Workflow for Service (module TASK). There is no screen of its own: it runs when a
 * Deliverable (Service) is created with a workflow template (62433) and when its workflow is changed (Change Workflow,
 * 63073). The tests drive those screens and check the result on the Deliverable's Work Items tab.
 *
 * Sandbox (observed):
 *   Deliverable /Service/Edit/{id}: Work Items tab rows tr.work-item-row[data-workitem-id] - Title, Description, Staff
 *   Role, Effort (actual / estimate), Due Date, Status, Assigned Person; the status icon's label is the readiness
 *   ("Ready to start", "Not ready to start", "Completed", ...). A row opens the work item drawer (#formWorkItem):
 *   WorkItemName, Description, StaffRoleIDF, AssignedPersonIDF, WorkItemStatusIDF (default "Not Started"),
 *   EstimatedHours, DueDate, hidden ServiceIDF / WorkItemTypeIDF.
 *   Actions -> Change Workflow: pick a compatible template -> Confirm (preview: work items to create / matched) -> Save.
 *
 * Test data - built once per scenario by the first test that needs it (the spec runs on ONE worker, in order) and reused:
 *   Deliverable Type "Playwright MW Deliverable Type <tag>" (Fixed Price, Hour)
 *   Project "Playwright MW Project <tag>" on the account, status Active (Add Project defaults). The scenario Deliverables
 *               are created on it: a template with a project phase gate is refused without a project ("Workflow template
 *               requires a project"), and on the account's existing project "Initial" (status Draft) every work item
 *               showed "Temporarily blocked", which hides the dependency results.
 *   Scenario A  template "Playwright MW Main Flow <tag>", published, compatible + default for the type:
 *                 Kickoff (no prerequisite) -> Build (start needs Kickoff Completed) -> Review (start needs Build Started),
 *                 Sign-off (no prerequisite, project phase gate "Acceptance")
 *               Deliverable "Playwright MW Main Deliverable <tag>" on the Playwright MW project
 *   Scenario B  Deliverable "Playwright MW No Workflow <tag>" created with no workflow template
 *   Scenario C  template "Playwright MW Lineage Flow <tag>": v1 Plan -> Execute (needs Plan Completed) -> Close;
 *               Deliverable "Playwright MW Lineage Deliverable <tag>" (on the Playwright MW project) on v1 (Plan set In Progress + assigned to the user);
 *               v2 = Create Draft from v1: Execute renamed "Execute And Verify" (5 h -> 7.5 h), its prerequisite removed,
 *               new step Handover (needs Close Completed); v2 published; then Change Workflow on the Deliverable.
 * NO CLEANUP: every record stays in the sandbox and is listed in the dated workbook.
 *
 * Readiness labels (observed): an item that may start shows "Ready to start" or "Ready to complete"; one that may not
 * shows "Not ready to start" or "Temporarily blocked". Change Workflow lists the OTHER compatible templates - never the
 * one already governing the Deliverable.
 *
 * Optional environment: SERVICE_ACCOUNT_NAME (account the Deliverables are created on, default "Test case factory").
 */
const MODULE = 'Materialize Workflow';

const kw = env.keyword;
const tag = env.runTag;
const name = label => `${kw} MW ${label} ${tag}`;

const step = (label, staffRole, serviceStage, estimatedHours, workItemType = 'Execution', description) => ({
  stepName: `${kw} ${label}`, description: description || `${kw} ${label} work for the materialization test.`,
  staffRole, workItemType, serviceStage, estimatedHours, percentComplete: '',
});

const MAIN_STEPS = {
  kickoff: step('Kickoff', 'Project Manager', 'Planning', '2', 'Execution', 'Kick-off with the client and confirm the scope.'),
  build: step('Build', 'Developer', 'Development', '8', 'Execution', 'Build and configure the deliverable.'),
  review: step('Review', 'QA Reviewer', 'Review', '3', 'Acceptance', 'Review the result with the client.'),
  signoff: step('Sign-off', 'Client Success', 'Review', '1', 'Acceptance', 'Formal client sign-off once the project reaches Acceptance.'),
};
const LINEAGE_STEPS = {
  plan: step('Plan', 'Project Manager', 'Planning', '2'),
  execute: step('Execute', 'Developer', 'Development', '5'),
  close: step('Close', 'Client Success', 'Review', '1'),
};
const LINEAGE_V2 = {
  renamed: { from: LINEAGE_STEPS.execute.stepName, stepName: `${kw} Execute And Verify`, estimatedHours: '7.5' },
  added: step('Handover', 'Deployment Manager', 'Review', '1.5', 'Execution', 'Hand the result over to operations.'),
};

const SCENARIO = {
  deliverableType: { serviceItemName: name('Deliverable Type'), description: `${kw} Deliverable Type for the workflow materialization tests`,
    accountName: 'Materialize Revenue', accountingId: `ACC-MW-${tag.replace(/\D/g, '')}`, isTaxable: false, allowedBillingTypes: ['Fixed Price'],
    defaultBillingType: '', unitOfMeasure: 'Hour', typicalHours: '' },
  main: {
    template: { templateName: name('Main Flow'), description: `${kw} main workflow: Kickoff, Build, Review, Sign-off.`, defaultStage: 'Planning', steps: Object.values(MAIN_STEPS) },
    gates: [
      { dependent: MAIN_STEPS.build.stepName, prerequisite: MAIN_STEPS.kickoff.stepName, condition: 'Completed' },
      { dependent: MAIN_STEPS.review.stepName, prerequisite: MAIN_STEPS.build.stepName, condition: 'Started' },
    ],
    phaseGate: { step: MAIN_STEPS.signoff.stepName, phase: 'Acceptance' },
    deliverable: name('Main Deliverable'),
  },
  project: { projectName: name('Project') },
  noWorkflow: { deliverable: name('No Workflow') },
  lineage: {
    template: { templateName: name('Lineage Flow'), description: `${kw} lineage workflow: Plan, Execute, Close.`, defaultStage: 'Planning', steps: Object.values(LINEAGE_STEPS) },
    gates: [{ dependent: LINEAGE_STEPS.execute.stepName, prerequisite: LINEAGE_STEPS.plan.stepName, condition: 'Completed' }],
    v2Gate: { dependent: LINEAGE_V2.added.stepName, prerequisite: LINEAGE_STEPS.close.stepName, condition: 'Completed' },
    deliverable: name('Lineage Deliverable'),
    keptStatus: 'In Progress',
  },
  account: process.env.SERVICE_ACCOUNT_NAME || 'Test case factory',
  stage: 'Planning',
};

const TEXT = {
  defaultStatus: 'Not Started',
  ready: 'Ready to start',
  notReady: 'Not ready to start',
  completed: 'Completed',
  workItemType: { Execution: '1', Acceptance: '2' },
};

const MAIN = 'Deliverable created with the published "Main Flow" template (scenario A, built by the first test that needs it).';
const LIN = 'Deliverable created on "Lineage Flow" v1, then the template\'s v2 published (scenario C).';
const NEG = { type: 'Negative' };
// Confirmed application defect (cases with `defect` are expected to fail and are reported as "Known Defect"; when the app
// is fixed they fail as "unexpectedly passed" - then remove the `defect`).
const DEPENDENCY_DEFECT = "Readiness on the Deliverable ignores the materialized step prerequisites (BR-8 / BR-9): the template's start gates are saved (checked on /WorkflowTemplate/StartGateEditor), the project phase gate is honoured, but a step whose prerequisite is not met still shows \"Ready to complete\".";
const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });

const materializeCases = {
  // ------------------------------------------------------------------ scenario A: materialization at Create Service
  governed: tc('TC_MW_001', 'critical', 'Deliverable is governed by the authoritative template version',
    'Verify the Deliverable created with the template records it as its workflow ("<template>, v.1") - the authoritative version materialization reads (BR-2, MF-1).',
    MAIN, 'Current workflow = "Playwright MW Main Flow ..., v.1".'),
  count: tc('TC_MW_002', 'critical', 'One work item per workflow step',
    'Verify materialization created exactly one work item for each of the 4 workflow steps (BR-5).',
    MAIN, '4 work items.'),
  names: tc('TC_MW_003', 'critical', 'Work item names come from the step names',
    'Verify WorkItemName = WorkflowStep.StepName for every work item (BR-6).',
    MAIN, 'Kickoff, Build, Review, Sign-off.'),
  descriptions: tc('TC_MW_004', 'normal', 'Work item descriptions come from the steps',
    'Verify WorkItem.Description = WorkflowStep.Description (BR-6).',
    MAIN, 'Each description equals its step\'s.'),
  roles: tc('TC_MW_005', 'critical', 'Staff roles come from the steps',
    'Verify WorkItem.StaffRoleIDF = WorkflowStep.StaffRoleIDF (BR-6).',
    MAIN, 'Project Manager, Developer, QA Reviewer, Client Success.'),
  hours: tc('TC_MW_006', 'normal', 'Estimated hours come from the steps',
    'Verify WorkItem.EstimatedHours = WorkflowStep.EstimatedHours (BR-6).',
    MAIN, '2, 8, 3, 1 hours.'),
  status: tc('TC_MW_007', 'critical', 'Every work item gets the default status',
    'Verify each materialized work item has the effective default WorkItemStatus "Not Started" (BR-5, 62203).',
    MAIN, 'All 4 work items "Not Started".'),
  blankFields: tc('TC_MW_008', 'normal', 'Assignee and due date are left empty',
    'Verify AssignedPersonIDF and DueDate are null at materialization (BR-6).',
    MAIN, 'No assignee and no due date on any work item.'),
  types: tc('TC_MW_009', 'normal', 'Work item type comes from the step',
    'Verify WorkItem.WorkItemTypeIDF = WorkflowStep.WorkItemTypeIDF (Execution / Acceptance) (BR-6).',
    MAIN, 'Kickoff, Build Execution; Review, Sign-off Acceptance.'),
  service: tc('TC_MW_010', 'normal', 'Work items belong to the Deliverable',
    'Verify WorkItem.ServiceIDF = the Deliverable for every work item (BR-5, BR-6).',
    MAIN, 'Every work item references the Deliverable id.'),
  readyNoPrereq: tc('TC_MW_011', 'critical', 'A step without prerequisites is ready to start',
    'Verify readiness was calculated after materialization: Kickoff (no prerequisite, no phase gate) may start - "Ready to start" or "Ready to complete" (BR-9, 63072).',
    MAIN, 'Kickoff: Ready to start / Ready to complete.'),
  notReadyDependent: tc('TC_MW_012', 'critical', 'A step with an unmet prerequisite is not ready',
    'Verify the materialized dependency blocks Build (needs Kickoff Completed) and Review (needs Build Started) (BR-8, BR-9).',
    MAIN, 'Build and Review: Not ready to start.',
    { defect: `${DEPENDENCY_DEFECT} Observed: Build (needs Kickoff Completed) and Review (needs Build Started) show "Ready to complete" while Kickoff is Not Started.` }),
  phaseGate: tc('TC_MW_013', 'normal', 'A phase-gated step waits for the project phase',
    'Verify Sign-off, which has no prerequisite but the project phase gate "Acceptance" (copied to WorkItem.ProjectPhaseGateIDF), may not start while that phase is not reached (BR-6, BR-9).',
    `${MAIN} The Deliverable is on the new Playwright MW project, whose phase has not reached "Acceptance".`, 'Sign-off is not ready (Kickoff, without a gate, is).'),
  completedCondition: tc('TC_MW_014', 'critical', 'Completing a prerequisite releases the dependent step',
    'Verify the materialized "Completed" dependency: when Kickoff is set Completed, Build becomes "Ready to start" (BR-8 PrerequisiteCondition, BR-9).',
    MAIN, 'Kickoff Completed -> Build Ready to start.',
    { defect: `${DEPENDENCY_DEFECT} Observed: Review (needs Build Started) shows "Ready to complete" while Build is Not Started.` }),
  startedCondition: tc('TC_MW_015', 'normal', 'A "Started" prerequisite releases on start',
    'Verify the materialized "Started" dependency: when Build is set In Progress, Review becomes "Ready to start" (BR-8 PrerequisiteCondition, BR-9).',
    `${MAIN} Kickoff already Completed (TC_MW_014).`, 'Build In Progress -> Review Ready to start.'),

  // ------------------------------------------------------------------ scenario B: no workflow (AF-1)
  noWorkflow: tc('TC_MW_016', 'critical', 'Deliverable without a workflow template gets no work items',
    'Verify a Deliverable saved without a workflow template version is created normally and nothing is materialized - no work items, no error (AF-1, BR-2).',
    'Deliverable Type with a default template; the template is removed on the form before Save.', 'Saved; Work Items tab empty; no error.', NEG),

  // ------------------------------------------------------------------ scenario C: re-materialization and lineage tokens
  preview: tc('TC_MW_017', 'critical', 'Change Workflow to the new version creates only the new step',
    'Verify the Change Workflow confirmation for v2 announces 1 work item to create - the 3 steps that share a lineage token with existing work items are matched instead of duplicated (BR-5, MF-1).',
    LIN, 'Preview: 1 work item to create; 3 matched.'),
  noDuplicates: tc('TC_MW_018', 'critical', 'No duplicate work items after re-materialization',
    'Verify that after changing to v2 the Deliverable has 4 work items - one per v2 step - and no two work items for the same lineage (BR-5).',
    `${LIN} Workflow changed to v2.`, '4 work items, names unique.'),
  sameRecord: tc('TC_MW_019', 'critical', 'A matched work item is updated in place with the new step name',
    'Verify the work item of the renamed step keeps its id and now carries the v2 name (BR-11).',
    `${LIN} Workflow changed to v2.`, 'Same work item id; name "Playwright Execute And Verify".'),
  updatedHours: tc('TC_MW_020', 'normal', 'A matched work item takes the new estimated hours',
    'Verify the updated work item has the v2 EstimatedHours 7.5 (BR-11).',
    `${LIN} Workflow changed to v2.`, 'Estimated Hours 7.5.'),
  keptFields: tc('TC_MW_021', 'critical', 'Fields outside BR-11 are kept on matched work items',
    'Verify re-materialization does not touch the status and assignee of a matched work item: Plan stays "In Progress" and assigned to the user (BR-11 "No other fields are updated").',
    `${LIN} Plan set In Progress and assigned before the change.`, 'Plan: In Progress, same assignee.'),
  newItem: tc('TC_MW_022', 'normal', 'The new step is materialized with the default status',
    'Verify the step added in v2 becomes a new work item with the default status, its staff role and hours (BR-5, BR-6).',
    `${LIN} Workflow changed to v2.`, 'Handover: Not Started, Deployment Manager, 1.5 h.'),
  governedV2: tc('TC_MW_023', 'normal', 'The Deliverable is governed by v2 after the change',
    'Verify the Deliverable now references the v2 template version ("<template>, v.2") (BR-2).',
    `${LIN} Workflow changed to v2.`, 'Current workflow "..., v.2".'),
  dependenciesRebuilt: tc('TC_MW_024', 'critical', 'Dependencies are rebuilt from the new version',
    'Verify the old dependencies were deleted and the v2 ones created: Execute And Verify (prerequisite removed in v2) is ready to start although Plan is not completed, and Handover (needs Close Completed) is not ready (MF-1, BR-8).',
    `${LIN} Workflow changed to v2.`, 'Execute And Verify may start; Handover may not.',
    { defect: `${DEPENDENCY_DEFECT} Observed: Handover (v2, needs Close Completed) shows "Ready to complete" while Close is Not Started.` }),
  reapply: tc('TC_MW_025', 'normal', 'Re-applying the same version creates nothing',
    'Verify the version the Deliverable already has cannot produce duplicates: Change Workflow does not offer the governing template again, and the server preview for it announces 0 work items to create; the work items are unchanged (BR-5 lineage match).',
    `${LIN} Workflow already on v2.`, 'Not offered again; preview: 0 to create; same 4 work item ids.'),

  // ------------------------------------------------------------------ BR-4 validity
  validity: tc('TC_MW_026', 'normal', 'Only templates valid for the Deliverable are offered',
    'Verify Change Workflow offers the other templates compatible with the Deliverable Type (Lineage Flow), not the one already governing it, and not a published template that is not compatible with it ("Support Resolution") (BR-4, 63085).',
    MAIN, 'The other compatible template (Lineage Flow) offered; the governing one (Main Flow) not repeated; Support Resolution not offered.', { ...NEG, incompatible: process.env.MW_INCOMPATIBLE_TEMPLATE || 'Support Resolution' }),
};

module.exports = { MODULE, TEXT, SCENARIO, MAIN_STEPS, LINEAGE_STEPS, LINEAGE_V2, materializeCases };
