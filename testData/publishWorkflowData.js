const { env } = require('../utils/testData');

/**
 * Use case 63090 - Publish Workflow Template Version (module TASK). Template page: /WorkflowTemplate/Edit/{id}.
 *
 * Sandbox (observed):
 *   Versions tab  each version card shows "Published by / Unpublished by / Created by <user> · <date>"; Draft and
 *                 Unpublished cards offer Publish, the Published card offers Unpublish (also "Unpublish Version" in the
 *                 header while the published version is viewed). Only one version is Published at a time.
 *   Pop-ups       Draft -> "Publish version?", Unpublished -> "Publish previous version?", Unpublish -> "Unpublish workflow
 *                 template?" - texts below (Scenarios of the use case); Publish / Unpublish or Go Back.
 *   Audit tab     every publish / unpublish is logged with the user and the changed fields (BR-23).
 *
 * Test data - every test builds its own template first ("Playwright PWT <label> <MMDD-HHmmss>"): standard creation
 * (63069), Default Service Stage, the 3 steps below, optional gates, then the version history the test needs:
 *   'publish'                 publish the draft
 *   { draftFrom: n, ... }     Create Draft from version n (addStep: one more step; deleteSteps: remove these steps)
 *   'unpublish'               unpublish the published version
 * NO CLEANUP: every template stays in the sandbox and is listed in the dated workbook.
 */
const MODULE = 'Publish Workflow Template';

const kw = env.keyword;
const tag = env.runTag;
const name = label => `${kw} PWT ${label} ${tag}`;

const step = (label, staffRole, serviceStage, estimatedHours, workItemType, description) => ({
  stepName: `${kw} ${label}`, description, staffRole, workItemType, serviceStage, estimatedHours, percentComplete: '',
});
const STEPS = [
  step('Intake', 'Project Manager', 'Planning', '2', 'Execution', 'Collect the client request and confirm the scope.'),
  step('Configure', 'Developer', 'Development', '6', 'Execution', 'Configure the deliverable to the agreed scope.'),
  step('Verify', 'QA Reviewer', 'Review', '3', 'Acceptance', 'Verify the result with the client before sign-off.'),
];
const [INTAKE, CONFIGURE, VERIFY] = STEPS.map(s => s.stepName);
const HANDOVER = step('Handover', 'Deployment Manager', 'Review', '1.5', 'Execution', 'Hand the result over to operations (added in Version 2).');
const ARCHIVE = step('Archive Docs', 'Client Success', 'Review', '1', 'Execution', 'Archive the project documents (added in Version 3).');

const TEXT = {
  draft: 'Draft',
  published: 'Published',
  unpublished: 'Unpublished',
  // pop-ups (Scenarios: Confirm Publish Draft / Confirm Publish Previous / Confirm Unpublish)
  publishDraftTitle: 'Publish version?',
  publishDraftBody: 'Publish this workflow template version? It will become the current published version.',
  publishPreviousTitle: 'Publish previous version?',
  publishPreviousBody: 'Publish this previous workflow template version? It will become the current published version and will replace the existing published version, if one exists.',
  unpublishTitle: 'Unpublish workflow template?',
  unpublishBody: 'Existing services will keep their current workflows, but this template will not be available for new services until a version is published.',
  // results (Scenarios: Workflow Template Version Published / Workflow Template Unpublished / AF-2 / AF-8)
  published_msg: /Workflow template version published/i,
  unpublished_msg: /Workflow template unpublished/i,
  stepRequired: /Add at least one workflow step before publishing/i,
  stageRequired: /Select a default service stage before publishing/i,
  terminalStage: 'Delivered',
  dependentBadge: 'Dependent Step',
  // audit fields (TASK.WorkflowTemplate / WorkflowTemplateVersion)
  audit: {
    status: 'WorkflowTemplateVersionStatusIDF', publishedVersion: 'PublishedWorkflowTemplateVersionIDF', draftVersion: 'DraftWorkflowTemplateVersionIDF',
    publishedAt: 'PublishedAtUtc', publishedBy: 'PublishedByPersonIDF', unpublishedAt: 'UnpublishedAtUtc', unpublishedBy: 'UnpublishedByPersonIDF',
  },
};

const DRAFT_FROM_1 = { draftFrom: 1, addStep: HANDOVER };
const HISTORY = {
  draft: [],
  published: ['publish'],
  publishedWithDraft: ['publish', DRAFT_FROM_1],
  republished: ['publish', DRAFT_FROM_1, 'publish'],
  republishedWithDraft: ['publish', DRAFT_FROM_1, 'publish', { draftFrom: 2, addStep: ARCHIVE }],
  unpublished: ['publish', 'unpublish'],
  publishedWithEmptyDraft: ['publish', { draftFrom: 1, deleteSteps: [INTAKE, CONFIGURE, VERIFY] }],
};
const HISTORY_TEXT = {
  draft: 'Version 1 Draft (ready: Default Service Stage + 3 steps).',
  published: 'Version 1 Published by the test.',
  publishedWithDraft: 'Version 1 Published; Version 2 Draft created from it (+ Handover).',
  republished: 'Version 1 published, Version 2 (+ Handover) published over it: v1 Unpublished, v2 Published.',
  republishedWithDraft: 'v1 Unpublished, v2 Published (+ Handover), Version 3 Draft created from v2 (+ Archive Docs).',
  unpublished: 'Version 1 published and then unpublished: no Published version.',
  publishedWithEmptyDraft: 'Version 1 Published; Version 2 Draft created from it with all 3 steps deleted.',
};

const PUB = 'User has PERM.TASK.WorkflowTemplate.Publish; the template was built by the test:';
const NEG = { type: 'Negative' };
const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });
/** Template the test builds. history: key of HISTORY. */
const seed = (label, history = 'draft', extra = {}) => ({
  templateName: name(label), description: `${kw} template for Publish Workflow Template Version (${label}).`,
  defaultStage: 'Planning', steps: STEPS, gates: [], phaseGate: null, history: HISTORY[history], historyText: HISTORY_TEXT[history], ...extra,
});
const cond = (s, more = '') => `${PUB} ${s.historyText}${more ? ` ${more}` : ''}`;
const make = (id, severity, title, description, s, expected, extra = {}, more = '') => tc(id, severity, title, description, cond(s, more), expected, { seed: s, ...extra });

const publishWorkflowCases = {
  // ------------------------------------------------------------------ MF-1 / MF-2 / MF-5 publish a draft
  confirmDraft: make('TC_PWT_001', 'critical', 'Publishing a draft asks for confirmation; Go Back changes nothing',
    'Verify Publish on the Draft version opens "Publish version?" with the Confirm Publish Draft text, and Go Back closes it without publishing (MF-2).',
    seed('Confirm Draft'), `Pop-up "${TEXT.publishDraftTitle}" - "${TEXT.publishDraftBody}"; after Go Back no request was sent and Version 1 is still Draft.`),
  publishDraft: make('TC_PWT_002', 'critical', 'Publish a ready draft version',
    'Verify confirming the publication makes Version 1 the Published version, shows "Workflow template version published." and stamps the version "Published by <current user>" (MF-5, BR-5).',
    seed('Publish Draft'), 'Message shown; header Published / Version 1; card "Published by <user>".'),
  draftCleared: make('TC_PWT_003', 'critical', 'Publishing the draft clears the draft reference',
    'Verify after publishing the draft the template has no Draft any more: the only version is Published, Create Draft is offered again, the header offers Unpublish Version and no Publish Version (BR-7).',
    seed('Draft Cleared'), 'One card, Published, not a draft; Create Draft offered; header: Unpublish Version only.'),
  auditPublish: make('TC_PWT_004', 'critical', 'Publishing is audited with the user and the time',
    'Verify the Audit tab logs the publication by the current user: status Draft -> Published, PublishedWorkflowTemplateVersionIDF = v1, PublishedByPersonIDF = user, PublishedAtUtc set, DraftWorkflowTemplateVersionIDF cleared (BR-5, BR-7, BR-23).',
    seed('Audit Publish'), 'Newest audit entry by the user with those field changes.'),
  listPublished: make('TC_PWT_005', 'normal', 'The template list shows the published status',
    'Verify Settings -> Workflow Templates lists the template as Published, Version 1 after the publication (MF-5).',
    seed('List Published'), 'List row: Status Published, Version 1.'),
  readOnly: make('TC_PWT_006', 'normal', 'A published version is read-only',
    'Verify the published version\'s Work Steps can no longer be edited: no Add Step (Published versions are read-only).',
    seed('Read Only'), 'Work Steps not editable; Add Step not offered.'),

  // ------------------------------------------------------------------ MF-4 / BR-6 publish over a published version
  publishOver: make('TC_PWT_007', 'critical', 'Publishing a new draft replaces the published version',
    'Verify publishing the Draft Version 2 while Version 1 is Published makes v2 Published and v1 Unpublished - only one version is Published (MF-4, MF-5, BR-6).',
    seed('Publish Over', 'publishedWithDraft'), 'v1 Unpublished, v2 Published; exactly one Published; header "Version 2".'),
  previousStamped: make('TC_PWT_008', 'critical', 'The replaced version is stamped as unpublished by the user',
    'Verify the replaced Version 1 shows "Unpublished by <user>" and the audit logs v1 Published -> Unpublished with UnpublishedByPersonIDF / UnpublishedAtUtc and PublishedWorkflowTemplateVersionIDF v1 -> v2 (BR-6, BR-23).',
    seed('Previous Stamped', 'publishedWithDraft'), 'v1 card "Unpublished by <user>"; audit fields as described.'),
  newVersionSteps: make('TC_PWT_009', 'normal', 'The newly published version carries its own steps',
    'Verify after publishing Version 2 its Work Steps are the 3 steps + Handover, while Version 1 keeps its 3 steps (versions are separate definitions).',
    seed('New Version Steps', 'publishedWithDraft'), 'v2 (Published): 4 steps incl. Handover; v1 (Unpublished): 3 steps.'),

  // ------------------------------------------------------------------ MF-3 / BR-8 rollback
  confirmPrevious: make('TC_PWT_010', 'critical', 'Publishing a previous version asks for confirmation; Go Back changes nothing',
    'Verify Publish on the Unpublished Version 1 opens "Publish previous version?" with the Confirm Publish Previous text for that version, and Go Back changes nothing (MF-3).',
    seed('Confirm Previous', 'republished'), `Pop-up "${TEXT.publishPreviousTitle}" - "${TEXT.publishPreviousBody}"; posts v1's id; after Go Back no request and v1 Unpublished / v2 Published.`),
  rollback: make('TC_PWT_011', 'critical', 'Roll back to a previous version',
    'Verify confirming the publication of the Unpublished Version 1 makes it Published again and the current Version 2 Unpublished (MF-3, MF-4, MF-5, BR-6 - rollback).',
    seed('Rollback', 'republished'), 'Message shown; v1 Published, v2 Unpublished; one Published.'),
  rollbackSteps: make('TC_PWT_012', 'normal', 'After a rollback the published definition is the previous one',
    'Verify after rolling back to Version 1 the published version shows Version 1\'s 3 steps (no Handover) and Unpublish Version in the header.',
    seed('Rollback Steps', 'republished'), 'Published version = Version 1 with its 3 steps.'),
  rollbackKeepsDraft: make('TC_PWT_013', 'critical', 'A rollback leaves the existing draft unchanged',
    'Verify publishing the Unpublished Version 1 while a Draft Version 3 exists keeps v3 as the Draft (same version) and the audit entry does not touch DraftWorkflowTemplateVersionIDF (BR-8).',
    seed('Rollback Keeps Draft', 'republishedWithDraft'), 'v1 Published, v2 Unpublished, v3 still Draft (same id); no Draft change in the audit.'),
  republish: make('TC_PWT_014', 'critical', 'Publish a previous version when no version is published',
    'Verify an Unpublished Version 1 of a template without a Published version can be published again ("Publish previous version?" pop-up) and becomes Published (MF-3, MF-5).',
    seed('Republish', 'unpublished'), 'Pop-up "Publish previous version?"; v1 Published; Unpublish offered again.'),
  republishKeepsStamps: make('TC_PWT_015', 'normal', 'Republishing keeps the version\'s unpublished stamps',
    'Verify the audit entry of republishing Version 1 sets status Unpublished -> Published and points the template at v1, the v1 card shows "Published by <user>", and UnpublishedAtUtc / UnpublishedByPersonIDF are not changed (BR-5). The audit lists only changed fields, so PublishedByPersonIDF appears only if a different user publishes.',
    seed('Republish Stamps', 'unpublished'), 'Audit: status and published version changed; Unpublished fields untouched; v1 card "Published by <user>".'),

  // ------------------------------------------------------------------ MF-6 / MF-7 / BR-10 / BR-11 unpublish
  confirmUnpublish: make('TC_PWT_016', 'critical', 'Unpublishing asks for confirmation; Go Back changes nothing',
    'Verify Unpublish opens "Unpublish workflow template?" with the Confirm Unpublish text and Go Back keeps the version Published (MF-6).',
    seed('Confirm Unpublish', 'published'), `Pop-up "${TEXT.unpublishTitle}" - "${TEXT.unpublishBody}"; after Go Back no request and v1 Published.`),
  unpublish: make('TC_PWT_017', 'critical', 'Unpublish the published version',
    'Verify confirming Unpublish shows "Workflow template unpublished.", Version 1 becomes Unpublished ("Unpublished by <user>"), the template has no Published version and Unpublish is no longer offered (MF-7, BR-10).',
    seed('Unpublish', 'published'), 'Message shown; v1 Unpublished, stamped by the user; no Published version; Publish offered on v1.'),
  unpublishNoDraft: make('TC_PWT_018', 'critical', 'Unpublishing does not create a draft',
    'Verify unpublishing neither creates a Draft nor turns a version into a Draft: still one version, Unpublished, no Draft (BR-11).',
    seed('Unpublish No Draft', 'published'), 'One card, Unpublished, not a draft; Create Draft offered.'),
  unpublishKeepsDraft: make('TC_PWT_019', 'critical', 'Unpublishing leaves the existing draft unchanged',
    'Verify unpublishing Version 1 while the Draft Version 2 exists keeps v2 as the same Draft and leaves no Published version (BR-10, BR-11).',
    seed('Unpublish Keeps Draft', 'publishedWithDraft'), 'v1 Unpublished; v2 still Draft (same id); no Published.'),
  auditUnpublish: make('TC_PWT_020', 'critical', 'Unpublishing is audited with the user and the time',
    'Verify the audit logs the unpublish by the current user: status Published -> Unpublished, UnpublishedByPersonIDF = user, UnpublishedAtUtc set, PublishedWorkflowTemplateVersionIDF cleared, Draft reference untouched (BR-10, BR-23).',
    seed('Audit Unpublish', 'published'), 'Newest audit entry by the user with those field changes; no DraftWorkflowTemplateVersionIDF change.'),
  listUnpublished: make('TC_PWT_021', 'normal', 'The template list shows the unpublished status',
    'Verify Settings -> Workflow Templates lists the template as Unpublished after the unpublish (MF-7).',
    seed('List Unpublished', 'published'), 'List row: Status Unpublished.'),

  // ------------------------------------------------------------------ alternate flows / readiness (BR-13)
  noPublishedVersion: make('TC_PWT_022', 'normal', 'Unpublish is not offered without a published version',
    'Verify a template whose only version is a Draft offers no Unpublish - neither in the header nor on a version card - so an unpublish without a Published version cannot be requested (AF-10).',
    seed('No Published Version'), 'No Unpublish Version / Unpublish button; Publish Version offered.', NEG),
  noSteps: make('TC_PWT_023', 'critical', 'A draft without workflow steps cannot be published',
    'Verify publishing a Draft that has a Default Service Stage but no workflow step is refused with the Workflow Step Required message; the version stays Draft (AF-2, BR-13).',
    seed('No Steps', 'draft', { steps: [] }), 'Message "Add at least one workflow step before publishing this workflow template version."; v1 still Draft.', NEG,
    'The draft has no workflow step.'),
  noStage: make('TC_PWT_024', 'critical', 'A draft without a default service stage cannot be published',
    'Verify publishing a Draft with steps but no Default Service Stage is refused with the Default Service Stage Required message; the version stays Draft (AF-8, BR-13).',
    seed('No Stage', 'draft', { defaultStage: '' }), 'Message "Select a default service stage before publishing this workflow template version."; v1 still Draft.', NEG,
    'The Default Service Stage is left empty.'),
  terminalStage: make('TC_PWT_025', 'normal', 'A terminal stage cannot become the default service stage',
    `Verify the Default Service Stage list does not offer the terminal stage "${TEXT.terminalStage}", so a version cannot reach publication with an ineligible default stage (AF-9, BR-13).`,
    seed('Terminal Stage'), `"${TEXT.terminalStage}" not offered as Default Service Stage.`, NEG),
  selfDependency: make('TC_PWT_026', 'normal', 'A step cannot be its own prerequisite',
    'Verify the gate of a step shows the step itself as "Dependent Step" without None / Required / Alternative, so a self-dependency cannot reach publication (AF-5, BR-13).',
    seed('Self Dependency'), `Own row "${TEXT.dependentBadge}", no choice.`, NEG),
  circular: make('TC_PWT_027', 'critical', 'A circular dependency is refused; the valid structure publishes',
    'Verify that after Configure requires Intake, making Intake require Configure is refused as circular; the draft without the cycle then publishes (AF-7, BR-13).',
    seed('Circular'), 'Circular gate refused with a message; publication of the valid draft succeeds.', NEG),
  singleOr: make('TC_PWT_028', 'normal', 'A single alternative (OR) dependency is refused',
    'Verify a gate with only one Alternative prerequisite cannot be saved - OR dependencies need at least two (BR-13 IsOrDependency rule).',
    seed('Single Or'), 'Gate save refused with a message.', NEG),
  dependencies: make('TC_PWT_029', 'critical', 'A draft with valid dependencies is published',
    'Verify a draft whose Configure requires Intake (Completed) and whose Verify has an OR set (Intake Completed or Configure Started) satisfies publication readiness and is published (BR-13).',
    seed('Dependencies', 'draft', { gates: [
      { dependent: CONFIGURE, deps: [{ step: INTAKE, selection: 'Required', condition: 'Completed' }] },
      { dependent: VERIFY, deps: [{ step: INTAKE, selection: 'Alternative', condition: 'Completed' }, { step: CONFIGURE, selection: 'Alternative', condition: 'Started' }] },
    ] }), 'Published; message shown.', {}, 'Gates: Configure <- Intake (Required, Completed); Verify <- Intake OR Configure.'),
  phaseGate: make('TC_PWT_030', 'normal', 'A draft with an active project phase gate is published',
    'Verify a draft whose Verify step has the project phase gate "Acceptance" (an active phase) is published (BR-13, AF-4).',
    seed('Phase Gate', 'draft', { phaseGate: { step: VERIFY, phase: 'Acceptance' } }), 'Published; message shown.', {}, 'Phase gate: Verify waits for "Acceptance".'),
  blockedKeepsPublished: make('TC_PWT_031', 'critical', 'A refused publication leaves the published version unchanged',
    'Verify publishing a Draft Version 2 without steps is refused (Workflow Step Required) and nothing changes: v1 stays Published, v2 stays Draft (AF-2, BR-22 atomic state change).',
    seed('Blocked Keeps Published', 'publishedWithEmptyDraft'), 'Refused with the message; v1 Published, v2 Draft.', NEG),
};

module.exports = { MODULE, TEXT, STEPS, HANDOVER, ARCHIVE, STEP_NAMES: { INTAKE, CONFIGURE, VERIFY }, publishWorkflowCases };
