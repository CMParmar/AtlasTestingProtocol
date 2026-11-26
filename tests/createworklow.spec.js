const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { LoginPage } = require('../pages/login/loginPage');
const { WorkflowTemplatePage } = require('../pages/workflow/workflowTemplatePage');
const { MODULE, TEXT, LIMITS, workflowTemplateCases: c } = require('../testData/workflowTemplateData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUrl } = require('../utils/testCase');

/**
 * Use case 63069 - Create Workflow Template (module TASK).
 * Sandbox: Settings -> Workflow Templates (/Setting/WorkflowTemplateList) -> Create Template -> wizard:
 * "Start from scratch" (name + description) or "Copy existing" (a Published / Unpublished source version) ->
 * the new template opens at /WorkflowTemplate/Edit/{id}.
 *
 * 27 test cases (TC_WF_001 - TC_WF_027): the wizard (MF-1, MF-2), standard creation and its results (MF-3, BR-4 to BR-6),
 * name / description validation and the duplicate-name block (BR-3, AF-4), copy creation - source eligibility, generated
 * names, copied description and steps, author of the copy (MF-4, BR-7, BR-8, BR-10 to BR-12), the list search, and the
 * permission check (BR-1, needs a second user - skipped without one).
 * Not automated: BR-9 (name truncation needs a published source with a ~95-character name; publishing is out of scope),
 * BR-11 dependency fields and BR-12 audit columns (not shown in the UI).
 *
 * Test data: testData/workflowTemplateData.js. Standard templates are "Playwright WF <label> <MMDD-HHmmss>"; copies carry
 * the generated "Copy of ..." name. NO CLEANUP: every template created stays in the sandbox and is listed in
 * reports/excel/create-workflow-template/Atlas_CreateWorkflowTemplate_<date>.xlsx.
 */

/** BR-8: "Copy of <source>", then "Copy (2) of <source>", ... - the first one no existing template uses (case-insensitive). */
function expectedCopyName(source, existingNames) {
  const used = new Set(existingNames.map(n => n.toLowerCase()));
  let candidate = `Copy of ${source}`;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `Copy (${n}) of ${source}`;
  return candidate;
}

test.describe('Workflow Template - Create Workflow Template (63069)', () => {
  test.describe.configure({ timeout: 180_000 });

  async function snap(page, testInfo, label) {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }

  async function observe(testInfo, text) {
    testInfo.annotations.push({ type: 'Observed', description: text });
  }

  /** List -> Create Template -> wizard, method chosen. */
  async function openWizard(workflowTemplatePage, testInfo, tc, method) {
    await applyAllureLabels(tc, MODULE);
    await test.step('Settings -> Workflow Templates', () => workflowTemplatePage.gotoList());
    await recordUrl(testInfo, workflowTemplatePage.page.url(), 'Workflow Templates');
    await test.step('Create Template', () => workflowTemplatePage.openWizard());
    if (method) await test.step(method === 'copy' ? 'Copy existing -> Continue' : 'Start from scratch -> Continue', () => workflowTemplatePage.chooseMethod(method));
  }

  /** Standard creation (MF-2, MF-3); logs the new template. Returns { id, url }. */
  async function createStandard(workflowTemplatePage, testInfo, tc, data) {
    await openWizard(workflowTemplatePage, testInfo, tc, 'scratch');
    return test.step(`Create "${data.templateName}" from scratch`, async () => {
      await workflowTemplatePage.fillStandard(data);
      const outcome = await workflowTemplatePage.submitStandard();
      expect(outcome, `Template created (shown: ${await workflowTemplatePage.serverError.innerText().catch(() => '')})`).toBe('created');
      const record = workflowTemplatePage.record();
      await recordCreated(testInfo, MODULE, tc, { templateName: data.templateName, description: data.description || '', creationMethod: 'Standard (from scratch)',
        versionStatus: TEXT.draft, versionNumber: '1', stepCount: '0' }, record);
      await recordUrl(testInfo, record.url, `Workflow Template #${record.id}`);
      return record;
    });
  }

  /** Copy creation (MF-4) with the expected generated name; logs the new template. Returns { record, source, summary, expected }. */
  async function createCopy(workflowTemplatePage, testInfo, tc, sourceName) {
    await applyAllureLabels(tc, MODULE);
    await test.step('Settings -> Workflow Templates', () => workflowTemplatePage.gotoList());
    const existing = await workflowTemplatePage.allNames();
    const expected = expectedCopyName(sourceName, existing);
    await test.step('Create Template', () => workflowTemplatePage.openWizard());
    await test.step('Copy existing -> Continue', () => workflowTemplatePage.chooseMethod('copy'));
    const source = await test.step(`Select "${sourceName}" and Create Template`, () => workflowTemplatePage.createCopyOf(sourceName));
    const record = workflowTemplatePage.record();
    const summary = await workflowTemplatePage.templateSummary();
    await recordCreated(testInfo, MODULE, tc, { templateName: summary.name, description: summary.description, creationMethod: 'Copy existing',
      sourceTemplate: sourceName, sourceVersion: `Version ${source.version} (${source.status})`, versionStatus: summary.status,
      versionNumber: summary.version.replace(/\D/g, ''), stepCount: String(source.steps.length) }, record);
    await recordUrl(testInfo, record.url, `Workflow Template #${record.id} (copy of ${sourceName})`);
    await snap(workflowTemplatePage.page, testInfo, 'copied-template');
    return { record, source, summary, expected };
  }

  /** The new template: Draft, Version 1, Active Yes, created and last edited by the current user (BR-4, BR-5, BR-12). */
  async function expectNewTemplate(workflowTemplatePage, summary, expected) {
    await test.step('New template: Draft, Version 1, Active, created by the current user', async () => {
      expect(summary.name, 'Template name').toBe(expected.name);
      if (expected.description !== undefined) expect(summary.description, 'Description').toBe(expected.description);
      expect(summary.status, 'Status (BR-5)').toBe(TEXT.draft);
      expect(summary.version, 'Version (BR-5)').toBe(TEXT.version1);
      expect(summary.active, 'Active (BR-4)').toBe(TEXT.active);
      const user = await workflowTemplatePage.currentUserName();
      if (user) expect(summary.createdBy, 'Created by the current user (BR-12)').toBe(user);
      expect(summary.lastEditedBy, 'Last edited by the current user').toBe(summary.createdBy);
    });
  }

  // ================================================================== MF-1 / MF-2 the wizard
  test(tcTitle(c.wizard), tcDetails(c.wizard, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.wizard;
    await openWizard(workflowTemplatePage, testInfo, tc);
    await recordTestValues(testInfo, { entry: 'Settings -> Workflow Templates -> Create Template' });
    await snap(page, testInfo, 'wizard-step-1');
    await expect(workflowTemplatePage.wizardTitle).toHaveText(TEXT.wizardTitle);
    await expect(workflowTemplatePage.step1).toContainText(TEXT.step1);
    await expect(workflowTemplatePage.scratchCard).toContainText(TEXT.scratch);
    await expect(workflowTemplatePage.copyCard).toContainText(TEXT.copy);
    await expect(workflowTemplatePage.continueButton, 'Continue disabled until a method is chosen').toBeDisabled();
    for (const card of [workflowTemplatePage.scratchCard, workflowTemplatePage.copyCard]) {
      await card.click();
      await expect(card, 'Chosen card is highlighted').toHaveClass(/wt-option-card--selected/);
      await expect(workflowTemplatePage.continueButton, 'Continue enabled').toBeEnabled();
    }
  });

  test(tcTitle(c.standardForm), tcDetails(c.standardForm, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.standardForm;
    await openWizard(workflowTemplatePage, testInfo, tc, 'scratch');
    await recordTestValues(testInfo, { 'Creation Method': TEXT.scratch });
    await snap(page, testInfo, 'wizard-standard');
    await expect(workflowTemplatePage.stepStandard).toContainText(TEXT.step2Standard);
    await expect(workflowTemplatePage.nameInput).toHaveValue('');
    await expect(workflowTemplatePage.nameInput).toHaveAttribute('maxlength', String(LIMITS.name));
    await expect(workflowTemplatePage.descriptionInput).toHaveValue('');
    await expect(workflowTemplatePage.descriptionInput).toHaveAttribute('maxlength', String(LIMITS.description));
    for (const [what, control] of [['Go Back', workflowTemplatePage.visibleStepButton('back')], ['Cancel', workflowTemplatePage.visibleStepButton('cancel')],
      ['Create Template', workflowTemplatePage.createStandardButton]]) {
      await expect(control, `${what} button`).toBeVisible();
    }
  });

  test(tcTitle(c.copyForm), tcDetails(c.copyForm, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.copyForm;
    await openWizard(workflowTemplatePage, testInfo, tc, 'copy');
    await snap(page, testInfo, 'wizard-copy');
    await expect(workflowTemplatePage.stepCopy).toContainText(TEXT.step2Copy);
    const sources = await workflowTemplatePage.copySources();
    await recordTestValues(testInfo, { 'Creation Method': TEXT.copy, 'Sources Offered': sources.length });
    expect(sources.length, 'Source versions offered').toBeGreaterThan(0);
    expect(await workflowTemplatePage.copyCountValue(), 'Result count = rows').toBe(sources.length);
    // templates that only have a Draft are listed too, but disabled ("You can't copy Draft"): only the selectable rows count
    const selectable = sources.filter(s => s.eligible && !s.disabled);
    const disabled = sources.filter(s => !s.eligible || s.disabled);
    const statuses = [...new Set(selectable.map(s => s.status))];
    await observe(testInfo, `Selectable: ${selectable.length} (${statuses.join(', ')}); disabled: ${disabled.length}${disabled.length ? ` (${disabled.map(s => s.name).slice(0, 5).join(', ')}...)` : ''}`);
    expect(selectable.length, 'Selectable source versions').toBeGreaterThan(0);
    expect(statuses.every(s => ['published', 'unpublished'].includes(s)), `Only Published / Unpublished versions can be selected (BR-7): ${statuses.join(', ')}`).toBe(true);
    for (const s of disabled) expect(s.status, `"${s.name}" (not selectable) has no Published / Unpublished version`).not.toMatch(/^(published|unpublished)$/);
    for (const s of sources) expect(s.href, `"${s.name}" links to its template`).toMatch(new RegExp(`/WorkflowTemplate/Edit/${s.templateId}$`));
    await expect(workflowTemplatePage.createCopyButton, 'Create Template disabled before a source is selected').toBeDisabled();
    await workflowTemplatePage.toggleCopyRow(selectable[0].name);
    await expect(workflowTemplatePage.createCopyButton, 'Enabled once a source is selected').toBeEnabled();
    await workflowTemplatePage.toggleCopyRow(selectable[0].name);
    await expect(workflowTemplatePage.createCopyButton, 'Disabled again after deselecting').toBeDisabled();
  });

  test(tcTitle(c.goBack), tcDetails(c.goBack, MODULE), async ({ workflowTemplatePage }, testInfo) => {
    const tc = c.goBack;
    await openWizard(workflowTemplatePage, testInfo, tc, 'scratch');
    await recordTestValues(testInfo, tc.data);
    await workflowTemplatePage.fillStandard(tc.data);
    await workflowTemplatePage.visibleStepButton('back').click();
    await expect(workflowTemplatePage.step1, 'Back on Step 1').toBeVisible();
    await expect(workflowTemplatePage.stepStandard).toBeHidden();
    await workflowTemplatePage.cancelWizard();
    expect(await workflowTemplatePage.searchList(tc.data.templateName), 'Nothing was created').toHaveLength(0);
  });

  test(tcTitle(c.cancel), tcDetails(c.cancel, MODULE), async ({ workflowTemplatePage }, testInfo) => {
    const tc = c.cancel;
    await openWizard(workflowTemplatePage, testInfo, tc, 'scratch');
    await recordTestValues(testInfo, tc.data);
    await workflowTemplatePage.fillStandard(tc.data);
    await test.step('Cancel', () => workflowTemplatePage.cancelWizard());
    expect(await workflowTemplatePage.searchList(tc.data.templateName), 'Nothing was created').toHaveLength(0);
    await test.step('Reopen: the wizard is reset', async () => {
      await workflowTemplatePage.openWizard();
      await expect(workflowTemplatePage.continueButton).toBeDisabled();
      await expect(workflowTemplatePage.wizard.locator('.wt-option-card--selected')).toHaveCount(0);
      await workflowTemplatePage.chooseMethod('scratch');
      await expect(workflowTemplatePage.nameInput, 'Name is empty again').toHaveValue('');
    });
  });

  // ================================================================== MF-3 standard creation
  test(tcTitle(c.standard), tcDetails(c.standard, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.standard;
    await recordTestValues(testInfo, tc.data);
    await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    await snap(page, testInfo, 'new-template');
    const summary = await workflowTemplatePage.templateSummary();
    await observe(testInfo, `Created by ${summary.createdBy}; ${summary.status}; ${summary.version}; Active ${summary.active}`);
    await expectNewTemplate(workflowTemplatePage, summary, { name: tc.data.templateName, description: tc.data.description });
  });

  test(tcTitle(c.nameOnly), tcDetails(c.nameOnly, MODULE), async ({ workflowTemplatePage }, testInfo) => {
    const tc = c.nameOnly;
    await recordTestValues(testInfo, { ...tc.data, description: '(empty)' });
    await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    await expectNewTemplate(workflowTemplatePage, await workflowTemplatePage.templateSummary(), { name: tc.data.templateName, description: '' });
  });

  test(tcTitle(c.versions), tcDetails(c.versions, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.versions;
    await recordTestValues(testInfo, tc.data);
    await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    const versions = await workflowTemplatePage.versions();
    await observe(testInfo, `Versions: ${versions.map(v => `Version ${v.number} ${v.status}`).join(', ')}`);
    await snap(page, testInfo, 'versions');
    expect(versions, 'Exactly one version: Version 1, Draft (BR-5)').toEqual([{ number: '1', status: TEXT.draft, isDraft: true }]);
  });

  test(tcTitle(c.noSteps), tcDetails(c.noSteps, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.noSteps;
    await recordTestValues(testInfo, tc.data);
    await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    const steps = await workflowTemplatePage.workSteps();
    await snap(page, testInfo, 'work-steps');
    expect(steps, 'No workflow steps (BR-6)').toEqual([]);
  });

  test(tcTitle(c.listed), tcDetails(c.listed, MODULE), async ({ workflowTemplatePage }, testInfo) => {
    const tc = c.listed;
    await recordTestValues(testInfo, tc.data);
    const record = await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    await workflowTemplatePage.gotoList();
    const rows = await workflowTemplatePage.searchList(tc.data.templateName);
    await observe(testInfo, `List row: ${JSON.stringify(rows[0] || {})}`);
    expect(rows.map(r => r.id), 'Listed once').toEqual([record.id]);
    expect(rows[0].active, 'Active').toBe(TEXT.active);
    expect(rows[0].status, 'Status').toBe(TEXT.draft);
    expect(rows[0].version.replace(/\D/g, ''), 'Version').toBe('1');
  });

  for (const tc of [c.name100, c.special, c.description500]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ workflowTemplatePage }, testInfo) => {
      await recordTestValues(testInfo, { ...tc.data, 'Name Length': tc.data.templateName.length, ...(tc.data.description ? { 'Description Length': tc.data.description.length } : {}) });
      await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
      const summary = await workflowTemplatePage.templateSummary();
      expect(summary.detailName, 'Name saved unchanged').toBe(tc.data.templateName);
      expect(summary.name, 'Header shows the name').toBe(tc.data.templateName);
      if (tc.data.description) expect(summary.description, 'Description saved unchanged').toBe(tc.data.description);
    });
  }

  // ================================================================== validation (nothing created)
  for (const tc of [c.emptyName, c.blankName]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
      await openWizard(workflowTemplatePage, testInfo, tc, 'scratch');
      await recordTestValues(testInfo, { templateName: tc.data.templateName ? `"${tc.data.templateName}" (spaces only)` : '(empty)', ...(tc.data.description ? { description: tc.data.description } : {}) });
      await workflowTemplatePage.fillStandard(tc.data);
      let posted = false;
      const onRequest = r => { if (r.method() === 'POST' && /\/WorkflowTemplate\/Create/i.test(r.url())) posted = true; };
      page.on('request', onRequest);
      const outcome = await workflowTemplatePage.submitStandard(15_000).catch(() => 'none');
      page.off('request', onRequest);
      await snap(page, testInfo, 'validation');
      expect(outcome, 'Blocked with a validation message').toBe('invalid');
      await expect(workflowTemplatePage.nameMessage).toHaveText(TEXT.nameRequired);
      expect(posted, 'No create request was sent').toBe(false);
      await expect(workflowTemplatePage.stepStandard, 'Wizard stays open').toBeVisible();
    });
  }

  for (const tc of [c.nameOver, c.descriptionOver]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ workflowTemplatePage }, testInfo) => {
      await openWizard(workflowTemplatePage, testInfo, tc, 'scratch');
      await recordTestValues(testInfo, { 'Typed Length': tc.typed.length, 'Typed Text': tc.typed });
      const control = tc === c.nameOver ? workflowTemplatePage.nameInput : workflowTemplatePage.descriptionInput;
      await control.pressSequentially(tc.typed);
      expect((await control.inputValue()).length, `Field keeps ${tc.limit} characters`).toBe(tc.limit);
      await workflowTemplatePage.cancelWizard();
    });
  }

  test(tcTitle(c.duplicate), tcDetails(c.duplicate, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.duplicate;
    await recordTestValues(testInfo, { ...tc.data, 'Second Name': tc.data.templateName });
    const original = await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    await openWizard(workflowTemplatePage, testInfo, tc, 'scratch');
    await workflowTemplatePage.fillStandard({ templateName: tc.data.templateName, description: 'Second template with the same name.' });
    const outcome = await workflowTemplatePage.submitStandard();
    await snap(page, testInfo, 'duplicate');
    if (outcome === 'created') throw new Error(`DEFECT (BR-3, AF-4): a second template "${tc.data.templateName}" was created (${page.url()})`);
    expect(outcome, 'Duplicate-name pop-up (AF-4)').toBe('duplicate');
    const text = await workflowTemplatePage.duplicateText();
    await observe(testInfo, `Pop-up: ${text}`);
    expect(text, 'Duplicate-name message').toMatch(TEXT.duplicate);
    await workflowTemplatePage.closeDuplicate();
    await expect(workflowTemplatePage.stepStandard, 'Wizard stays open to change the name').toBeVisible();
    await workflowTemplatePage.cancelWizard();
    expect((await workflowTemplatePage.searchList(tc.data.templateName)).map(r => r.id), 'Only the original exists').toEqual([original.id]);
  });

  test(tcTitle(c.duplicateCase), tcDetails(c.duplicateCase, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.duplicateCase;
    const upper = tc.data.templateName.toUpperCase();
    await recordTestValues(testInfo, { ...tc.data, 'Second Name': upper });
    await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    await openWizard(workflowTemplatePage, testInfo, tc, 'scratch');
    await workflowTemplatePage.fillStandard({ templateName: upper });
    const outcome = await workflowTemplatePage.submitStandard();
    await snap(page, testInfo, 'duplicate-case');
    if (outcome === 'created') {
      const record = workflowTemplatePage.record();
      await recordCreated(testInfo, MODULE, tc, { templateName: upper, creationMethod: 'Standard (from scratch)', versionStatus: TEXT.draft, versionNumber: '1', stepCount: '0' }, record);
      throw new Error(`DEFECT (BR-3): "${upper}" was created although "${tc.data.templateName}" exists (${record.url})`);
    }
    expect(outcome, 'Duplicate-name pop-up').toBe('duplicate');
    await observe(testInfo, `Pop-up: ${await workflowTemplatePage.duplicateText()}`);
    expect(await workflowTemplatePage.duplicateText()).toMatch(TEXT.duplicate);
  });

  // ================================================================== MF-4 copy creation
  test(tcTitle(c.draftNotSource), tcDetails(c.draftNotSource, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.draftNotSource;
    await recordTestValues(testInfo, tc.data);
    await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    await openWizard(workflowTemplatePage, testInfo, tc, 'copy');
    await workflowTemplatePage.searchCopy(tc.data.templateName);
    await snap(page, testInfo, 'copy-search-draft');
    const rows = (await workflowTemplatePage.copySources()).filter(s => s.name === tc.data.templateName);
    if (!rows.length) {
      await observe(testInfo, 'The draft-only template is not listed as a copy source');
      await expect(workflowTemplatePage.copyNoResults, 'No-results state').toBeVisible();
      return;
    }
    // observed: the template is listed but disabled ("You can't copy Draft") and cannot be selected
    await observe(testInfo, `Listed but disabled: status "${rows[0].status}", tooltip "${rows[0].tooltip}"`);
    expect(rows.every(r => !r.eligible && r.disabled), 'Draft-only template is listed only as a disabled row (BR-7)').toBe(true);
    await workflowTemplatePage.toggleCopyRow(tc.data.templateName);
    await expect(workflowTemplatePage.copyRow(tc.data.templateName), 'Clicking it does not select it').not.toHaveClass(/wt-copy-row--selected/);
    await expect(workflowTemplatePage.createCopyButton, 'Create Template stays disabled').toBeDisabled();
  });

  test(tcTitle(c.copySearch), tcDetails(c.copySearch, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.copySearch;
    await openWizard(workflowTemplatePage, testInfo, tc, 'copy');
    const term = tc.source.slice(0, Math.min(tc.source.length, 7)).toLowerCase();
    await recordTestValues(testInfo, { 'Search Text': term, 'Source Expanded': tc.source, 'No-match Search': tc.noMatch });
    const all = await workflowTemplatePage.copySources();
    await test.step(`Search "${term}"`, async () => {
      await workflowTemplatePage.searchCopy(term);
      const rows = await workflowTemplatePage.copySources();
      expect(rows.map(r => r.name), 'Source found').toContain(tc.source);
      expect(rows.every(r => r.name.toLowerCase().includes(term)), 'Only names containing the text').toBe(true);
      expect(rows.length, 'Fewer rows than unfiltered').toBeLessThanOrEqual(all.length);
      expect(await workflowTemplatePage.copyCountValue(), 'Result count follows').toBe(rows.length);
    });
    await test.step(`Expand "${tc.source}" -> its Workflow Steps`, async () => {
      const source = (await workflowTemplatePage.copySources()).find(s => s.name === tc.source);
      const steps = await workflowTemplatePage.sourceStepNames(source.templateId);
      await workflowTemplatePage.copyRow(tc.source).locator('.wt-copy-expand-btn').click();
      await expect(workflowTemplatePage.copyChildSteps, 'Expanded step list').toHaveCount(steps.length);
      await observe(testInfo, `${tc.source}: ${steps.length} steps - ${steps.join(', ')}`);
      await snap(page, testInfo, 'copy-expanded');
    });
    await test.step('Search with no match', async () => {
      await workflowTemplatePage.searchCopy(tc.noMatch);
      await expect(workflowTemplatePage.copyVisibleRows).toHaveCount(0);
      expect(await workflowTemplatePage.copyCountValue()).toBe(0);
      await expect(workflowTemplatePage.copyNoResults).toBeVisible();
    });
  });

  test(tcTitle(c.copy), tcDetails(c.copy, MODULE), async ({ workflowTemplatePage }, testInfo) => {
    const tc = c.copy;
    const { summary, expected, source } = await createCopy(workflowTemplatePage, testInfo, tc, tc.source);
    await recordTestValues(testInfo, { 'Source Template': tc.source, 'Source Version': `Version ${source.version} (${source.status})`, 'Expected Name': expected, 'Generated Name': summary.name });
    await observe(testInfo, `Generated name "${summary.name}"; created by ${summary.createdBy}`);
    await expectNewTemplate(workflowTemplatePage, summary, { name: expected });
  });

  test(tcTitle(c.copyStructure), tcDetails(c.copyStructure, MODULE), async ({ workflowTemplatePage, page }, testInfo) => {
    const tc = c.copyStructure;
    const { record, source, summary } = await createCopy(workflowTemplatePage, testInfo, tc, tc.source);
    const sourceDescription = await test.step(`Description of the source "${tc.source}"`, async () => {
      await workflowTemplatePage.openTemplate(source.templateId);
      return workflowTemplatePage.detailDescription.inputValue();
    });
    await recordTestValues(testInfo, { 'Source Template': tc.source, 'Source Steps': source.steps, 'Source Description': sourceDescription, 'Generated Name': summary.name });
    expect(summary.description, 'Description copied from the source (BR-10)').toBe(sourceDescription);
    await workflowTemplatePage.openTemplate(record.id);
    const steps = await workflowTemplatePage.workSteps();
    await observe(testInfo, `Copied steps: ${steps.join(', ')}`);
    await snap(page, testInfo, 'copied-steps');
    expect(steps, 'One step per source step, same names and order (BR-11)').toEqual(source.steps);
  });

  test(tcTitle(c.copyNumbering), tcDetails(c.copyNumbering, MODULE), async ({ workflowTemplatePage }, testInfo) => {
    const tc = c.copyNumbering;
    const first = await createCopy(workflowTemplatePage, testInfo, tc, tc.source);
    expect(first.summary.name, 'First copy name').toBe(first.expected);
    const second = await createCopy(workflowTemplatePage, testInfo, tc, tc.source);
    await recordTestValues(testInfo, { 'Source Template': tc.source, 'First Copy': first.summary.name, 'Second Copy': second.summary.name });
    await observe(testInfo, `Copies: "${first.summary.name}", "${second.summary.name}"`);
    expect(second.summary.name, 'Second copy gets the next free name (BR-8)').toBe(second.expected);
    expect(second.summary.name, 'Second copy name is numbered').toMatch(/^Copy \(\d+\) of /);
    expect(second.record.id, 'Two different templates').not.toBe(first.record.id);
  });

  test(tcTitle(c.copyUnpublished), tcDetails(c.copyUnpublished, MODULE), async ({ workflowTemplatePage }, testInfo) => {
    const tc = c.copyUnpublished;
    // the configured source may have lost its Unpublished version (then it is listed as a disabled draft): use it only
    // while it is a copyable Unpublished version, otherwise any other Unpublished source
    const sourceName = await test.step('Find a copyable Unpublished source version', async () => {
      await workflowTemplatePage.gotoList();
      await workflowTemplatePage.openWizard();
      await workflowTemplatePage.chooseMethod('copy');
      const unpublished = (await workflowTemplatePage.allCopySources()).filter(s => s.status === 'unpublished' && s.eligible && !s.disabled);
      await workflowTemplatePage.cancelWizard();
      const chosen = unpublished.find(s => s.name === tc.source) || unpublished[0];
      await observe(testInfo, chosen ? `Unpublished source: "${chosen.name}"${chosen.name !== tc.source ? ` ("${tc.source}" has no Unpublished version now)` : ''}` : 'No Unpublished source version in the sandbox');
      return chosen ? chosen.name : '';
    });
    test.skip(!sourceName, 'No template has an Unpublished version in the sandbox now (set WF_COPY_UNPUBLISHED to one that has)');
    const { summary, source, expected } = await createCopy(workflowTemplatePage, testInfo, tc, sourceName);
    await recordTestValues(testInfo, { 'Source Template': sourceName, 'Source Version': `Version ${source.version} (${source.status})`, 'Generated Name': summary.name });
    expect(source.status, `"${sourceName}" is an Unpublished source`).toBe('unpublished');
    await expectNewTemplate(workflowTemplatePage, summary, { name: expected });
  });

  // ================================================================== list / permission
  test(tcTitle(c.listSearch), tcDetails(c.listSearch, MODULE), async ({ workflowTemplatePage }, testInfo) => {
    const tc = c.listSearch;
    await recordTestValues(testInfo, { ...tc.data, 'No-match Search': tc.noMatch });
    const record = await createStandard(workflowTemplatePage, testInfo, tc, tc.data);
    await workflowTemplatePage.gotoList();
    const part = tc.data.templateName.replace(`${env.keyword} WF `, '');   // "Searchable Flow <tag>"
    expect((await workflowTemplatePage.searchList(part)).map(r => r.id), `Search "${part}" finds it`).toContain(record.id);
    expect(await workflowTemplatePage.searchList(tc.noMatch), 'No-match search').toHaveLength(0);
  });

  test(tcTitle(c.noPermission), tcDetails(c.noPermission, MODULE), async ({ browser }, testInfo) => {
    const tc = c.noPermission;
    test.skip(!tc.user.email || !tc.user.password, 'Set WF_NO_PERMISSION_EMAIL / WF_NO_PERMISSION_PASSWORD (a user without PERM.TASK.WorkflowTemplate.Create) in .env');
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { 'Signed-in User': tc.user.email });
    const context = await browser.newContext({ baseURL: env.baseURL, viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto('/task', { waitUntil: 'domcontentloaded' });
      await new LoginPage(page).signInWith(tc.user.email, tc.user.password);
      await page.waitForURL(url => !/Identity\/Account\/Login/i.test(url.toString()), { timeout: 30_000 });
      await page.goto(WorkflowTemplatePage.listPath, { waitUntil: 'domcontentloaded' });
      await recordUrl(testInfo, page.url(), 'Workflow Templates (no permission)');
      await testInfo.attach('no-permission', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await expect(page.locator('#wtBtnOpenCreateWizard'), 'Create Template not offered').toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
