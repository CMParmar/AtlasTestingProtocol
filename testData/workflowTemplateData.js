const { env } = require('../utils/testData');

/**
 * Use case 63069 - Create Workflow Template (module TASK).
 *
 * Sandbox (observed): Settings -> Workflow Templates (/Setting/WorkflowTemplateList) -> "Create Template" opens the wizard
 * "Create workflow template":
 *   Step 1 of 2 - "Start from scratch" | "Copy existing" cards, Continue (disabled until a card is chosen), Cancel
 *   Step 2 (scratch) - Name * (maxlength 100, "Name is required."), Description (maxlength 500), Go Back, Cancel,
 *                      Create Template -> POST /WorkflowTemplate/Create; a duplicate name opens a pop-up (AF-4)
 *   Step 2 (copy)    - "select a source version": Result count, search (by name), one row per Published / Unpublished
 *                      template version (name links to the template, expand shows its Workflow Steps), Create Template
 *                      (enabled once a row is selected) -> POST /WorkflowTemplate/CreateFromCopy
 * Both redirect to the new template: /WorkflowTemplate/Edit/{id} - status badge (Draft), "Version 1", Created by,
 * Last edited by, Active: Yes; tabs Details, Versions, Deliverable items, Work Steps, Tasks, Audit.
 *
 * Standard templates are named "Playwright WF <label> <MMDD-HHmmss>" (keyword from TEST_KEYWORD). Copies get the name the
 * system generates ("Copy of <source>", "Copy (2) of <source>", ... BR-8), so they cannot carry the keyword: they are
 * listed with their source in the dated workbook. NO CLEANUP: every template created stays in the sandbox.
 *
 * Optional environment (source templates for copy creation; each copy test uses its own source so parallel runs do not
 * race for the same "Copy (n) of" name):
 *   WF_COPY_SOURCE            published source for the basic copy test          (default "Trigger Delivery")
 *   WF_COPY_STRUCTURE_SOURCE  published source whose steps are compared          (default "Support Resolution")
 *   WF_COPY_REPEAT_SOURCE     published source copied twice (numbering)         (default "Widget Delivery")
 *   WF_COPY_UNPUBLISHED       preferred Unpublished source (default "Software Delivery - No Design"; when it has no Unpublished
 *                             version any other Unpublished source is used, and TC_WF_025 is skipped if there is none)
 *   WF_NO_PERMISSION_EMAIL / WF_NO_PERMISSION_PASSWORD   user without PERM.TASK.WorkflowTemplate.Create (else skipped)
 */
const MODULE = 'Create Workflow Template';

const kw = env.keyword;
const tag = env.runTag;
const name = label => `${kw} WF ${label} ${tag}`;
// pads with "Z" to exactly `length` characters (never ends with a space, which the server might trim)
const fit = (text, length) => `${text} ${'Z'.repeat(length)}`.slice(0, length);

const SOURCES = {
  published: process.env.WF_COPY_SOURCE || 'Trigger Delivery',
  structure: process.env.WF_COPY_STRUCTURE_SOURCE || 'Support Resolution',
  repeat: process.env.WF_COPY_REPEAT_SOURCE || 'Widget Delivery',
  unpublished: process.env.WF_COPY_UNPUBLISHED || 'Software Delivery - No Design',
};

const TEXT = {
  wizardTitle: 'Create workflow template',
  step1: 'Step 1 of 2 - choose a creation method',
  step2Standard: 'Step 2 of 2 - template details',
  step2Copy: 'Step 2 of 2 - select a source version',
  scratch: 'Start from scratch',
  copy: 'Copy existing',
  nameRequired: 'Name is required.',
  duplicate: /already exists|already in use|duplicate/i,
  draft: 'Draft',
  active: 'Yes',
  version1: 'Version 1',
};

const LIMITS = { name: 100, description: 500 };

const CREATE = 'User is signed in and has PERM.TASK.WorkflowTemplate.Create.';
const NEG = { type: 'Negative' };
const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });

const workflowTemplateCases = {
  // ------------------------------------------------------------------ MF-1 the wizard
  wizard: tc('TC_WF_001', 'critical', 'Create Template opens the wizard with both creation methods',
    'Verify the create command opens "Create workflow template" Step 1 with "Start from scratch" and "Copy existing", and Continue stays disabled until a method is chosen (MF-1).',
    CREATE, 'Step 1 shown; both methods offered; Continue disabled, then enabled after choosing one.'),
  standardForm: tc('TC_WF_002', 'normal', 'Start from scratch asks for Name and Description',
    'Verify choosing standard creation shows Step 2 with Name (required, max 100) and optional Description (max 500), Go Back, Cancel and Create Template (MF-2).',
    CREATE, 'Step 2 "template details" with empty Name and Description.'),
  copyForm: tc('TC_WF_003', 'critical', 'Copy existing: only Published / Unpublished source versions can be selected',
    'Verify choosing copy creation lists the templates with Result count; only rows with a Published or Unpublished version can be selected, templates with only a Draft are shown disabled (BR-7); names link to the template; Create Template is enabled only while a row is selected (MF-4).',
    CREATE, 'Result = rows; selectable rows only Published / Unpublished, the others disabled; Create Template disabled -> enabled on select -> disabled on deselect.'),
  goBack: tc('TC_WF_004', 'normal', 'Go Back returns to the creation method',
    'Verify Go Back on Step 2 returns to Step 1 without creating anything (MF-1).',
    CREATE, 'Step 1 shown again; nothing created.', { data: { templateName: name('Go Back Check') } }),
  cancel: tc('TC_WF_005', 'normal', 'Cancel closes the wizard and resets it',
    'Verify Cancel closes the wizard without creating a template, and reopening starts again at Step 1 with nothing chosen and empty fields.',
    CREATE, 'Wizard closed; not created; reopened wizard is reset.', { data: { templateName: name('Cancelled Entry') } }),

  // ------------------------------------------------------------------ MF-3 standard creation
  standard: tc('TC_WF_006', 'critical', 'Create a template from scratch with name and description',
    'Verify standard creation creates an active template with the entered name and description and presents it: Draft, Version 1, Active Yes, created and last edited by the current user (MF-3, BR-4, BR-5).',
    CREATE, 'Template page opens with the name, description, status Draft, Version 1, Active Yes, Created by = Last edited by = current user.',
    { data: { templateName: name('Client Onboarding'), description: 'Onboarding workflow for new managed-service clients: kickoff, access setup, handover.' } }),
  nameOnly: tc('TC_WF_007', 'critical', 'Create a template with a name only (description optional)',
    'Verify Description is optional: a template is created with just a name (MF-2, MF-3).',
    CREATE, 'Created; Description empty.', { data: { templateName: name('Quick Fix Flow') } }),
  versions: tc('TC_WF_008', 'critical', 'New template has exactly one draft Version 1',
    'Verify the new template has exactly one version: Version 1, status Draft (BR-5).',
    CREATE, 'Versions tab: one card, Version 1, Draft.', { data: { templateName: name('Version Check'), description: 'Checks the initial draft version.' } }),
  noSteps: tc('TC_WF_009', 'critical', 'Standard creation creates no workflow steps',
    'Verify a template created from scratch has no workflow steps (BR-6).',
    CREATE, 'Work Steps tab lists no steps.', { data: { templateName: name('Empty Steps Check') } }),
  listed: tc('TC_WF_010', 'normal', 'New template is listed as active Draft Version 1',
    'Verify the Workflow Templates list shows the new template with Active Yes, Status Draft and Version 1 (BR-4, BR-5).',
    CREATE, 'List row: Active Yes, Draft, Version 1.', { data: { templateName: name('Listed Check'), description: 'Appears in the template list.' } }),
  name100: tc('TC_WF_011', 'normal', 'Name of exactly 100 characters is accepted',
    'Verify the boundary value: a 100-character name creates the template and is saved unchanged.',
    CREATE, 'Created; name has 100 characters.', { data: { templateName: fit(name('Max Length'), LIMITS.name) } }),
  special: tc('TC_WF_012', 'normal', 'Name and description with special characters are saved as entered',
    'Verify punctuation and symbols (& / - ( ) # % .) in the name and description are saved unchanged.',
    CREATE, 'Created; name and description shown exactly as entered.',
    { data: { templateName: name('R&D / QA - Phase (2) #1'), description: 'R&D / QA hand-off: 100% coverage (unit + e2e), sign-off by #release team.' } }),
  description500: tc('TC_WF_013', 'normal', 'Description of exactly 500 characters is accepted',
    'Verify the boundary value: a 500-character description is saved unchanged.',
    CREATE, 'Created; description has 500 characters.', { data: { templateName: name('Long Description'), description: fit(`${kw} long description for the workflow template boundary test.`, LIMITS.description) } }),

  // ------------------------------------------------------------------ standard creation validation (nothing created)
  emptyName: tc('TC_WF_014', 'critical', 'Name is required',
    'Verify Create Template with an empty name shows "Name is required." and nothing is created.',
    CREATE, `"${TEXT.nameRequired}" shown; wizard stays open; no request sent.`, { ...NEG, data: { templateName: '', description: 'No name given.' } }),
  blankName: tc('TC_WF_015', 'normal', 'Name of only spaces is treated as missing',
    'Verify a name made only of spaces is rejected with "Name is required.".',
    CREATE, `"${TEXT.nameRequired}" shown; nothing created.`, { ...NEG, data: { templateName: '      ' } }),
  nameOver: tc('TC_WF_016', 'normal', 'Name longer than 100 characters is not accepted',
    'Verify typing 120 characters into Name keeps only 100 (maxlength). Nothing is created.',
    CREATE, 'Field keeps 100 characters.', { ...NEG, typed: fit(name('Overflow'), 120), limit: LIMITS.name }),
  descriptionOver: tc('TC_WF_017', 'normal', 'Description longer than 500 characters is not accepted',
    'Verify typing 520 characters into Description keeps only 500 (maxlength). Nothing is created.',
    CREATE, 'Field keeps 500 characters.', { ...NEG, typed: fit(`${kw} overflow description`, 520), limit: LIMITS.description }),
  duplicate: tc('TC_WF_018', 'critical', 'Duplicate name is blocked',
    'Verify standard creation with the name of an existing (non-deleted) template is blocked with the duplicate-name message and no second template is created (BR-3, AF-4).',
    `${CREATE} A template with the same name exists - created by the test first.`, 'Duplicate-name pop-up; wizard stays open; only one template with the name.',
    { ...NEG, data: { templateName: name('Duplicate Original'), description: 'Original for the duplicate check.' } }),
  duplicateCase: tc('TC_WF_019', 'normal', 'Duplicate name in different case is blocked',
    'Verify the uniqueness check ignores case: the existing name in upper case is also blocked (BR-3).',
    `${CREATE} A template with the same name (other case) exists - created by the test first.`, 'Duplicate-name pop-up; nothing created.',
    { ...NEG, data: { templateName: name('Case Original') } }),

  // ------------------------------------------------------------------ MF-4 copy creation
  draftNotSource: tc('TC_WF_020', 'critical', 'A template with only a Draft version cannot be the copy source',
    'Verify a template that has only its Draft version (created by the test from scratch) cannot be chosen as a copy source: it is not listed, or listed disabled ("You cannot copy Draft") and cannot be selected (BR-7).',
    `${CREATE} A draft-only template exists - created by the test first.`, 'Its row is missing or disabled; clicking it does not select it; Create Template stays disabled.',
    { ...NEG, data: { templateName: name('Draft Only Source') } }),
  copySearch: tc('TC_WF_021', 'normal', 'Copy source list can be searched and expanded',
    'Verify the copy list search narrows the rows by name, the Result count follows, a search without match shows the empty state, and expanding a row shows the source\'s Workflow Steps (MF-4).',
    CREATE, 'Matching rows only; Result count updated; empty state for no match; expand shows the step list.',
    { source: SOURCES.structure, noMatch: `zz-${kw}-no-template-${tag}` }),
  copy: tc('TC_WF_022', 'critical', 'Copy a published template',
    'Verify copy creation from a Published version creates an active template named "Copy of <source>" (or the next free "Copy (n) of" name), Draft Version 1, created and last edited by the current user (MF-4, BR-4, BR-5, BR-8, BR-12).',
    `${CREATE} Source "${SOURCES.published}" has a Published version.`, 'New template with the generated name; Draft, Version 1, Active Yes; Created by = Last edited by = current user (not the source author).',
    { source: SOURCES.published }),
  copyStructure: tc('TC_WF_023', 'critical', 'Copy keeps the source description and workflow steps',
    'Verify the copy gets the source template\'s Description (BR-10) and one step per source step, with the same names in the same order (BR-11).',
    `${CREATE} Source "${SOURCES.structure}" has a Published version with steps.`, 'Description equals the source\'s; Work Steps equal the source steps.',
    { source: SOURCES.structure }),
  copyNumbering: tc('TC_WF_024', 'critical', 'Copying the same source again generates the next numbered name',
    'Verify two copies of the same source get unique names: the first free of "Copy of <source>", "Copy (2) of <source>", ... and the next one after it (BR-8).',
    `${CREATE} Source "${SOURCES.repeat}" has a Published version.`, 'Second copy is named "Copy (n+1) of <source>" (the next free number).',
    { source: SOURCES.repeat }),
  copyUnpublished: tc('TC_WF_025', 'normal', 'An Unpublished version can be the copy source',
    'Verify copy creation is allowed from an Unpublished source version and creates a Draft Version 1 copy (BR-7).',
    `${CREATE} A template with an Unpublished version exists ("${SOURCES.unpublished}" if it still has one, else the first Unpublished source offered; skipped if none).`, 'Copy created: Draft, Version 1.',
    { source: SOURCES.unpublished }),

  // ------------------------------------------------------------------ BR-1 permission
  noPermission: tc('TC_WF_026', 'critical', 'User without the Create permission cannot create a template',
    'Verify a user without PERM.TASK.WorkflowTemplate.Create is not offered Create Template (BR-1).',
    'Second user WITHOUT PERM.TASK.WorkflowTemplate.Create (WF_NO_PERMISSION_EMAIL / WF_NO_PERMISSION_PASSWORD in .env).',
    'Create Template is not offered (or the list is not accessible).',
    { ...NEG, user: { email: process.env.WF_NO_PERMISSION_EMAIL || '', password: process.env.WF_NO_PERMISSION_PASSWORD || '' } }),
  listSearch: tc('TC_WF_027', 'normal', 'New template can be found with the list search',
    'Verify searching the Workflow Templates list by part of the new name returns it, and a name that does not exist returns no row.',
    CREATE, 'Search finds the new template; no-match search shows no rows.',
    { data: { templateName: name('Searchable Flow'), description: 'Found by the list search.' }, noMatch: `zz-${kw}-missing-${tag}` }),
};

module.exports = { MODULE, TEXT, LIMITS, SOURCES, workflowTemplateCases };
