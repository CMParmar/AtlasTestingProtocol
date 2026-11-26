const { env } = require('../utils/testData');

/**
 * Use case 63063 - View & Edit Workflow Template (module TASK). Template page: /WorkflowTemplate/Edit/{id}[?versionId=]
 *
 * Sandbox (observed on a draft template):
 *   header   name, status badge (Draft / Published / Unpublished), "Version n", Publish Version (draft) / Unpublish Version,
 *            Signals; Created by, Last edited by, Active (text only - there is no isActive control)
 *   Actions  Update Workflow for multiple services, Archive Template (only while no version is Published),
 *            Delete Draft Version (while a draft exists) - each asks for confirmation (Yes / Go Back or Cancel)
 *   Details  Name * (max 100), Description (max 500), Default Service Stage * (terminal stages such as "Delivered" are not
 *            offered, BR-10), Save / Cancel - a normal form post
 *   Versions version cards; "Create Draft" on a Published / Unpublished version (pop-up: source, its steps, Save) while the
 *            template has no draft (BR-6)
 *   Work Steps (draft only) + Add Step / click a row -> step drawer: Step Name * (max 250), Description, Estimated Hours
 *            (>= 0), % Complete (0-100), Staff Role *, Type (Execution / Acceptance), Deliverable Stage; X -> "Delete step?";
 *            Start Gate / Completion Gate -> gate drawer: Project Phase (phase gate) and, for every other step,
 *            None / Required / Alternative + Started / Completed
 *
 * Every test builds its own template first ("Playwright WFE <label> <MMDD-HHmmss>"): standard creation (63069), Default
 * Service Stage set, the steps below added, and - where a Published version is needed - published.
 * NO CLEANUP: the templates stay in the sandbox. Only the Delete / Archive tests remove the template they built for it.
 */
const MODULE = 'View & Edit Workflow Template';

const kw = env.keyword;
const tag = env.runTag;
const name = label => `${kw} WFE ${label} ${tag}`;

const STEPS = [
  { stepName: `${kw} Kickoff`, description: 'Kick-off meeting and scope confirmation with the client.', staffRole: 'Project Manager', workItemType: 'Execution', serviceStage: 'Planning', estimatedHours: '2', percentComplete: '10' },
  { stepName: `${kw} Build`, description: 'Configure and build the deliverable.', staffRole: 'Developer', workItemType: 'Execution', serviceStage: 'Development', estimatedHours: '8', percentComplete: '60' },
  { stepName: `${kw} Review`, description: 'QA review and client acceptance.', staffRole: 'QA Reviewer', workItemType: 'Acceptance', serviceStage: 'Review', estimatedHours: '3', percentComplete: '100' },
];
const [KICKOFF, BUILD, REVIEW] = STEPS.map(s => s.stepName);

const TEXT = {
  draft: 'Draft',
  published: 'Published',
  active: 'Yes',
  tabs: ['Details', 'Versions', 'Deliverable items', 'Work Steps', 'Tasks', 'Audit'],
  versionsHelp: 'Only the draft can be edited.',
  nameRequired: 'Name is required.',
  stageRequired: 'Default service stage is required',
  stepNameRequired: 'Step name is required',
  staffRoleRequired: 'Staff Role is required',
  hoursNegative: 'Estimated hours cannot be negative',
  duplicate: /already exists|already in use|already used|duplicate|unique/i,
  deleteStepTitle: 'Delete step?',
  archiveTitle: 'Are you sure you want to archive this Workflow Template?',
  deleteDraftTitle: /Delete draft/i,
  dependentBadge: 'Dependent Step',
  terminalStage: 'Delivered',
};

const EDIT = 'User has PERM.TASK.WorkflowTemplate.View and .Edit; the template was built by the test.';
const NEG = { type: 'Negative' };
const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });
const seed = (label, extra = {}) => ({ templateName: name(label), description: `${kw} seed template for View & Edit (${label}).`, defaultStage: 'Planning', steps: STEPS, ...extra });

const workflowTemplateEditCases = {
  // ------------------------------------------------------------------ MF-1 view
  view: tc('TC_WFE_001', 'critical', 'Workflow template page shows the template, its version and attribution',
    'Verify opening a template shows its name, Draft status, Version 1, Created by / Last edited by the current user, Active Yes, the tabs and the Details fields with the saved values (MF-1).',
    EDIT, 'Header, attribution, tabs and Details values as saved.', { seed: seed('View Check') }),
  versions: tc('TC_WFE_002', 'normal', 'Versions tab lists the version history',
    'Verify the Versions tab lists Version 1 (Draft) as the version being viewed, with the note that only the draft can be edited (MF-1).',
    EDIT, 'One card: Version 1, Draft, "Viewing now".', { seed: seed('Versions Tab') }),
  steps: tc('TC_WFE_003', 'normal', 'Work Steps tab shows the draft structure',
    'Verify the Work Steps tab lists the steps in order with Type, Staff Role, Deliverable Stage, Est. Hrs and % Complete, and offers Add Step, Start Gate and Completion Gate on the draft (MF-1, MF-5).',
    EDIT, 'Three steps as entered, in order; Add Step and gate buttons offered.', { seed: seed('Steps Tab') }),

  // ------------------------------------------------------------------ MF-2 / MF-3 template and draft version fields
  rename: tc('TC_WFE_004', 'critical', 'Update the template name and description',
    'Verify Name and Description can be changed and saved; the header and the Workflow Templates list show the new name (MF-2).',
    EDIT, 'Saved; new name in header, Details and list; description saved.',
    { seed: seed('Rename Source', { steps: [] }), update: { templateName: name('Renamed Target'), description: `${kw} updated description - quarterly operations workflow.` } }),
  duplicateName: tc('TC_WFE_005', 'critical', 'Renaming to an existing template name is blocked',
    'Verify saving a Name already used by another (non-deleted) template is blocked and the name is not changed (AF-4, BR-4).',
    `${EDIT} A second template exists (built by the test).`, 'Save blocked with a duplicate-name message; name unchanged after reload.',
    { ...NEG, seed: seed('Duplicate Edit', { steps: [] }), other: seed('Duplicate Existing', { steps: [] }) }),
  nameRequired: tc('TC_WFE_006', 'critical', 'Name is required',
    'Verify clearing the Name blocks the save with "Name is required." (MF-2).',
    EDIT, `"${TEXT.nameRequired}"; nothing saved.`, { ...NEG, seed: seed('Name Required', { steps: [] }) }),
  stageRequired: tc('TC_WFE_007', 'normal', 'Default Service Stage is required',
    'Verify clearing the Default Service Stage of the draft version blocks the save (MF-3).',
    EDIT, `"${TEXT.stageRequired}"; nothing saved.`, { ...NEG, seed: seed('Stage Required', { steps: [] }) }),
  stageChange: tc('TC_WFE_008', 'normal', 'Change the Default Service Stage of the draft version',
    'Verify the draft version\'s Default Service Stage can be changed and persists; Last edited by stays the current user (MF-3).',
    EDIT, 'Saved; Default Service Stage = Design after reload.', { seed: seed('Stage Change', { steps: [] }), update: { defaultStage: 'Design' } }),
  stageTerminal: tc('TC_WFE_009', 'normal', 'A terminal stage cannot be the Default Service Stage',
    `Verify the Default Service Stage list does not offer a terminal stage ("${TEXT.terminalStage}"), although steps may use it (BR-10).`,
    EDIT, `"${TEXT.terminalStage}" offered for steps but not as Default Service Stage.`, { ...NEG, seed: seed('Terminal Stage', { steps: [] }) }),
  isActive: tc('TC_WFE_010', 'normal', 'isActive can be changed on the template',
    'Verify the template\'s isActive flag can be maintained (MF-2, BR-2).',
    EDIT, 'An Active control is offered on the template.',
    { seed: seed('Active Flag', { steps: [] }), defect: 'The sandbox template page shows "Active: Yes" as text only; there is no control to change isActive (use case 63063 MF-2, BR-2).' }),

  // ------------------------------------------------------------------ MF-5 draft workflow steps
  addStep: tc('TC_WFE_011', 'critical', 'Add a workflow step to the draft',
    'Verify Add Step with every field saves the step and the grid shows its name, type, staff role, stage, hours and % complete (MF-5).',
    EDIT, 'New step listed last with the entered values.',
    { seed: seed('Add Step'), newStep: { stepName: `${kw} Deploy`, description: 'Deploy to production and hand over.', staffRole: 'Deployment Manager', workItemType: 'Execution', serviceStage: 'Awaiting Sandbox Deployment', estimatedHours: '1.5', percentComplete: '90' } }),
  stepRole: tc('TC_WFE_012', 'critical', 'Staff Role is required on a step',
    'Verify a step without a Staff Role is not saved: "Staff Role is required" (BR-15).',
    EDIT, `"${TEXT.staffRoleRequired}"; step not added.`, { ...NEG, seed: seed('Step Role', { steps: [] }), newStep: { stepName: `${kw} No Role Step`, estimatedHours: '1' } }),
  stepName: tc('TC_WFE_013', 'normal', 'Step name is required',
    'Verify a step without a name is not saved: "Step name is required" (MF-5).',
    EDIT, `"${TEXT.stepNameRequired}"; step not added.`, { ...NEG, seed: seed('Step Name', { steps: [] }), newStep: { staffRole: 'Developer', estimatedHours: '1' } }),
  stepHours: tc('TC_WFE_014', 'normal', 'Negative estimated hours are rejected',
    'Verify a step with negative Estimated Hours is not saved: "Estimated hours cannot be negative" (MF-5).',
    EDIT, `"${TEXT.hoursNegative}"; step not added.`, { ...NEG, seed: seed('Step Hours', { steps: [] }), newStep: { stepName: `${kw} Negative Hours`, staffRole: 'Developer', estimatedHours: '-2' } }),
  stepPercent: tc('TC_WFE_015', 'normal', 'Percent complete above 100 is rejected',
    'Verify a step with % Complete 150 is not saved (must be between 0 and 100) (MF-5).',
    EDIT, 'A validation message; step not added with 150%.', { ...NEG, seed: seed('Step Percent', { steps: [] }), newStep: { stepName: `${kw} Over Percent`, staffRole: 'Developer', percentComplete: '150' } }),
  editStep: tc('TC_WFE_016', 'critical', 'Edit an existing draft step',
    'Verify a step\'s name, staff role, hours and % complete can be changed and the grid shows the new values (MF-5).',
    EDIT, 'Grid shows the updated step.',
    { seed: seed('Edit Step'), target: BUILD, change: { stepName: `${kw} Build And Configure`, staffRole: 'Architect', estimatedHours: '12', percentComplete: '70' } }),
  deleteStep: tc('TC_WFE_017', 'critical', 'Delete a draft step after confirmation',
    'Verify X on a step asks "Delete step?"; Cancel keeps it, Delete step removes it and the remaining steps are renumbered (MF-5, BR-5).',
    EDIT, 'Cancel keeps 3 steps; Delete leaves 2 steps numbered 1-2.', { seed: seed('Delete Step'), target: BUILD }),

  // ------------------------------------------------------------------ MF-7 draft dependencies
  gateRequired: tc('TC_WFE_018', 'critical', 'Save a Required start-gate dependency',
    'Verify Build\'s Start Gate can require Kickoff to be Completed; the dependency is saved and shown when the gate is reopened (MF-7, BR-11).',
    EDIT, 'Saved; reopened gate shows Kickoff = Required, Completed.', { seed: seed('Gate Required'), dependent: BUILD, prerequisite: KICKOFF, condition: 'Completed' }),
  gatePhase: tc('TC_WFE_019', 'normal', 'Set a project phase gate on a step',
    'Verify Build\'s Start Gate can be gated on the project phase "Development" and the phase is saved (BR-14, change 2026-07-06).',
    EDIT, 'Saved; reopened gate shows Project Phase = Development.', { seed: seed('Gate Phase'), dependent: BUILD, phase: 'Development' }),
  gateSingleOr: tc('TC_WFE_020', 'critical', 'A single Alternative (OR) dependency is rejected',
    'Verify a gate with only one Alternative prerequisite cannot be saved - an OR set needs at least two (BR-11, AF-10).',
    EDIT, 'Save blocked with a message; no dependency saved.', { ...NEG, seed: seed('Gate Single Or'), dependent: REVIEW, alternatives: [KICKOFF] }),
  gateOrPair: tc('TC_WFE_021', 'normal', 'Two Alternative (OR) dependencies are saved',
    'Verify Review\'s Start Gate with Kickoff OR Build (both Alternative) saves (BR-11).',
    EDIT, 'Saved; reopened gate shows both as Alternative.', { seed: seed('Gate Or Pair'), dependent: REVIEW, alternatives: [KICKOFF, BUILD] }),
  gateCircular: tc('TC_WFE_022', 'critical', 'A circular dependency is blocked',
    'Verify that after Build requires Kickoff, making Kickoff require Build is refused as a circular dependency (BR-12, AF-10).',
    EDIT, 'Second save blocked with a message; Kickoff has no prerequisite.', { ...NEG, seed: seed('Gate Circular'), first: { dependent: BUILD, prerequisite: KICKOFF }, second: { dependent: KICKOFF, prerequisite: BUILD } }),
  gateBothGates: tc('TC_WFE_023', 'normal', 'The same step pair may be used for the Start and the Completion gate',
    'Verify Review may require Build for its Start gate and again for its Completion gate (BR-13).',
    EDIT, 'Both gates saved with Build as Required.', { seed: seed('Gate Both'), dependent: REVIEW, prerequisite: BUILD }),
  gateSelf: tc('TC_WFE_024', 'normal', 'A step cannot depend on itself',
    'Verify the gate drawer marks the step itself as "Dependent Step" with no selection, so it cannot be its own prerequisite (BR-12).',
    EDIT, `The step's own row shows "${TEXT.dependentBadge}" and no None / Required / Alternative choice.`, { ...NEG, seed: seed('Gate Self'), dependent: BUILD }),
  deleteCleanup: tc('TC_WFE_025', 'critical', 'Deleting a step removes its dependencies',
    'Verify that when Kickoff (a prerequisite of Build) is deleted, Build\'s Start Gate no longer has it (BR-9).',
    EDIT, 'Build\'s gate lists no Kickoff and no Required prerequisite.', { seed: seed('Delete Cleanup'), dependent: BUILD, prerequisite: KICKOFF }),

  // ------------------------------------------------------------------ MF-4 / AF-6 versions (template published by the test)
  createDraft: tc('TC_WFE_026', 'critical', 'Create a new draft version from the published version',
    'Verify Create Draft on the Published Version 1 shows the source and its steps, and Save creates Version 2 as Draft with the same steps, created by the current user (MF-4, BR-7, BR-8).',
    `${EDIT} The template was published by the test (Version 1 Published, no draft).`, 'Pop-up lists the 3 source steps; Version 2 Draft with the same 3 steps.',
    { seed: seed('Create Draft', { publish: true }) }),
  draftExists: tc('TC_WFE_027', 'critical', 'A second draft cannot be created while a draft exists',
    'Verify that once a draft exists, Create Draft is no longer offered on any version (AF-6, BR-6).',
    `${EDIT} Published Version 1 and a draft Version 2 exist.`, 'No Create Draft button; one draft only.', { ...NEG, seed: seed('Draft Exists', { publish: true }) }),
  readOnlyPublished: tc('TC_WFE_028', 'critical', 'A published version is read-only',
    'Verify the Published version\'s Work Steps cannot be changed: no Add Step, no delete, no gate editing (BR-2).',
    `${EDIT} The template was published by the test.`, 'Published version: Work Steps read-only; Default Service Stage not editable.', { ...NEG, seed: seed('Read Only', { publish: true }) }),

  // ------------------------------------------------------------------ MF-8 / MF-9 delete and archive
  deleteDraftOnly: tc('TC_WFE_029', 'critical', 'Delete the only draft version deletes the template',
    'Verify Delete Draft Version on a template whose only version is the draft asks for confirmation (Cancel keeps it) and Yes hard-deletes the version and the template (MF-8, BR-5).',
    EDIT, 'Confirmation; Cancel keeps; Yes -> template no longer listed.', { seed: seed('Delete Only Draft', { steps: STEPS.slice(0, 1) }) }),
  deleteDraftKeep: tc('TC_WFE_030', 'critical', 'Delete a draft version that is not the only version',
    'Verify deleting the draft Version 2 of a published template removes only the draft: the template stays with its Published Version 1 (MF-8, BR-5).',
    `${EDIT} Published Version 1 and a draft Version 2 exist.`, 'Template still listed, Published, Version 1; no draft.', { seed: seed('Delete Second Draft', { publish: true }) }),
  archive: tc('TC_WFE_031', 'critical', 'Archive a template that has no published version',
    'Verify Archive Template asks for confirmation (Go Back keeps it) and Yes archives the template: it is removed from the active list (MF-9, BR-3, BR-5).',
    `${EDIT} The template has only a draft version.`, 'Confirmation; Go Back keeps; Yes -> template no longer listed.', { seed: seed('Archive Draft', { steps: STEPS.slice(0, 1) }) }),
  archiveBlocked: tc('TC_WFE_032', 'critical', 'Archive is not offered while a version is Published',
    'Verify a template with a Published version cannot be archived: Archive Template is not offered (AF-9, BR-5).',
    `${EDIT} The template was published by the test.`, 'Actions menu has no Archive Template.', { ...NEG, seed: seed('Archive Blocked', { publish: true }) }),

  // ------------------------------------------------------------------ unsaved changes
  dirty: tc('TC_WFE_033', 'normal', 'Unsaved changes warning on the Details tab',
    'Verify leaving the page after changing the Description shows the unsaved-changes warning and Cancel keeps the change (CORE Generic Add or Update).',
    `${EDIT} Description changed, not saved.`, 'Warning shown; still on the template with the change.', { seed: seed('Dirty Details', { steps: [] }), update: { description: `${kw} unsaved description change` } }),
};

module.exports = { MODULE, TEXT, STEPS, workflowTemplateEditCases };
