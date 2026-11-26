const { test, expect } = require('../fixtures/fixtures');
const { MODULE, TEXT, STEPS, workflowTemplateEditCases: c } = require('../testData/workflowTemplateEditData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUpdated, recordUrl, knownDefectFor } = require('../utils/testCase');

/**
 * Use case 63063 - View & Edit Workflow Template (module TASK): /WorkflowTemplate/Edit/{id}.
 *
 * 33 test cases (TC_WFE_001 - TC_WFE_033): viewing the template, its versions and steps (MF-1); template and draft-version
 * fields - rename, duplicate name, required fields, Default Service Stage, terminal stage (MF-2, MF-3, AF-4, BR-4, BR-10);
 * draft steps - add, required Staff Role / name, invalid hours / percent, edit, delete (MF-5, BR-15); dependencies -
 * Required, phase gate, OR sets, circular, Start + Completion gate, self, cleanup on step delete (MF-7, BR-9, BR-11 - BR-14,
 * AF-10); versions - Create Draft from a Published version, one draft only, Published version read-only (MF-4, AF-6, BR-2,
 * BR-6 - BR-8); Delete Draft Version and Archive (MF-8, MF-9, AF-9, BR-5); the unsaved-changes warning; and the isActive
 * control missing from the sandbox (TC_WFE_010, known defect).
 *
 * Every test builds its own template first (testData/workflowTemplateEditData.js): "Playwright WFE <label> <MMDD-HHmmss>"
 * created from scratch, Default Service Stage = Planning, the 3 "Playwright ..." steps, and - where a Published version is
 * needed - published. The tests run on ONE worker, one after the other (mode 'default'; the npm scripts add --workers=1).
 * NO CLEANUP: the templates stay in the sandbox; only TC_WFE_029 / 031 delete / archive the template they built for it
 * (an archived template still opens, with "This Workflow Template was Archived on ..."; a deleted one is checked in the list).
 * Not automated: permissions BR-1 / BR-3 (need users without View / Delete), drag-and-drop reordering, VersionDescription
 * (not shown separately in the sandbox).
 * Excel: reports/excel/view-edit-workflow-template/Atlas_ViewEditWorkflowTemplate_<date>.xlsx
 */

const allCases = Object.fromEntries(Object.values(c).map(tc => [tc.id, tc]));
const names = steps => steps.map(s => s.stepName);
const num = v => Number(String(v).replace(/[^\d.-]/g, ''));

test.describe('Workflow Template - View & Edit Workflow Template (63063)', () => {
  // one worker, in file order (also when the whole suite runs with several workers)
  test.describe.configure({ mode: 'default', timeout: 300_000 });

  // TC_WFE_010 checks a known gap of the sandbox: Playwright expects it to fail (Excel: "Known Defect")
  test.beforeEach(async ({}, testInfo) => knownDefectFor(testInfo, allCases));

  async function snap(page, testInfo, label) {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }

  async function observe(testInfo, text) {
    testInfo.annotations.push({ type: 'Observed', description: text });
  }

  /**
   * Builds the test's template: standard creation (63069) -> Default Service Stage -> steps -> (publish). Opens it fresh
   * and logs it as created. Returns { id, url }.
   */
  async function build(wfe, testInfo, tc, s = tc.seed) {
    return test.step(`Build "${s.templateName}" (${s.steps.length} steps${s.publish ? ', published' : ''})`, async () => {
      await wfe.gotoList();
      await wfe.openWizard();
      await wfe.chooseMethod('scratch');
      await wfe.fillStandard({ templateName: s.templateName, description: s.description });
      expect(await wfe.submitStandard(), `"${s.templateName}" created`).toBe('created');
      const record = wfe.record();
      await wfe.fillDetails({ defaultStage: s.defaultStage });
      const saved = await wfe.saveDetails();
      expect(saved.outcome, `Default Service Stage saved (${saved.text})`).toBe('saved');
      if (s.steps.length) {
        await wfe.openWorkSteps();
        for (const step of s.steps) await wfe.addStep(step);
      }
      if (s.publish) await wfe.publishDraft();
      await recordCreated(testInfo, MODULE, tc, { templateName: s.templateName, description: s.description, creationMethod: 'Standard (test setup)',
        defaultStage: s.defaultStage, versionStatus: s.publish ? TEXT.published : TEXT.draft, versionNumber: '1', stepCount: String(s.steps.length) }, record);
      await recordUrl(testInfo, record.url, `Workflow Template #${record.id}`);
      await wfe.openTemplate(record.id);
      return record;
    });
  }

  async function start(wfe, testInfo, tc, values = {}) {
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { 'Template Name': tc.seed.templateName, 'Default Service Stage': tc.seed.defaultStage,
      ...(tc.seed.steps.length ? { Steps: names(tc.seed.steps) } : {}), ...(tc.seed.publish ? { 'Published By Test': true } : {}), ...values });
    return build(wfe, testInfo, tc);
  }

  // ================================================================== MF-1 view
  test(tcTitle(c.view), tcDetails(c.view, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.view;
    await start(wfe, testInfo, tc);
    await snap(page, testInfo, 'template');
    const summary = await wfe.templateSummary();
    const user = await wfe.currentUserName();
    await observe(testInfo, `${summary.status}; ${summary.version}; created by ${summary.createdBy}; last edited by ${summary.lastEditedBy}; Active ${summary.active}`);
    expect(summary.name, 'Name').toBe(tc.seed.templateName);
    expect(summary.status, 'Status').toBe(TEXT.draft);
    expect(summary.version, 'Version').toBe('Version 1');
    expect(summary.active, 'Active').toBe(TEXT.active);
    if (user) {
      expect(summary.createdBy, 'Created by').toBe(user);
      expect(summary.lastEditedBy, 'Last edited by').toBe(user);
    }
    const tabs = (await page.locator('main .nav-tabs [role="tab"]').allInnerTexts()).map(t => t.trim());
    for (const t of TEXT.tabs) expect(tabs, `"${t}" tab`).toContain(t);
    expect(await wfe.detailsValues(), 'Details').toEqual({ templateName: tc.seed.templateName, description: tc.seed.description, defaultStage: tc.seed.defaultStage });
  });

  test(tcTitle(c.versions), tcDetails(c.versions, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.versions;
    await start(wfe, testInfo, tc);
    const versions = await wfe.versions();
    await snap(page, testInfo, 'versions');
    expect(versions, 'Version 1, Draft').toEqual([{ number: '1', status: TEXT.draft, isDraft: true }]);
    await expect(page.locator('#pane-versions')).toContainText(TEXT.versionsHelp);
    await expect(wfe.versionCards.first(), 'The version being viewed').toContainText('Viewing now');
  });

  test(tcTitle(c.steps), tcDetails(c.steps, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.steps;
    await start(wfe, testInfo, tc);
    await wfe.openWorkSteps();
    await snap(page, testInfo, 'work-steps');
    const grid = await wfe.gridSteps();
    expect(grid.map(r => r.name), 'Steps in order').toEqual(names(STEPS));
    expect(grid.map(r => r.index), 'Numbered 1-3').toEqual(['1', '2', '3']);
    STEPS.forEach((s, i) => {
      expect(grid[i].type, `${s.stepName} type`).toBe(s.workItemType);
      expect(grid[i].role, `${s.stepName} staff role`).toBe(s.staffRole);
      expect(grid[i].stage, `${s.stepName} stage`).toBe(s.serviceStage);
      expect(num(grid[i].hours), `${s.stepName} hours`).toBe(num(s.estimatedHours));
      expect(num(grid[i].pct), `${s.stepName} % complete`).toBe(num(s.percentComplete));
    });
    expect(await wfe.canEditSteps(), 'Draft is editable').toBe(true);
    await expect(wfe.addStepButton, 'Add Step').toBeVisible();
    await expect(page.locator('.wft-worksteps__gate'), 'Start + Completion gate per step').toHaveCount(STEPS.length * 2);
  });

  // ================================================================== MF-2 / MF-3 fields
  test(tcTitle(c.rename), tcDetails(c.rename, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.rename;
    const record = await start(wfe, testInfo, tc, { 'New Name': tc.update.templateName, 'New Description': tc.update.description });
    const before = await wfe.detailsValues();
    await wfe.fillDetails(tc.update);
    const saved = await wfe.saveDetails();
    await observe(testInfo, `Save: ${saved.text || '(no message)'}`);
    expect(saved.outcome, 'Saved').toBe('saved');
    await wfe.openTemplate(record.id);
    expect(await wfe.detailsValues(), 'Saved values').toEqual({ ...before, ...tc.update });
    await expect(wfe.title, 'Header').toHaveText(tc.update.templateName);
    await wfe.gotoList();
    expect((await wfe.searchList(tc.update.templateName)).map(r => r.id), 'List shows the new name').toEqual([record.id]);
    await recordUpdated(testInfo, MODULE, tc, before, { ...before, ...tc.update }, record);
  });

  test(tcTitle(c.duplicateName), tcDetails(c.duplicateName, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.duplicateName;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { 'Template Name': tc.seed.templateName, 'Existing Name Used': tc.other.templateName });
    await build(wfe, testInfo, tc, tc.other);
    const record = await build(wfe, testInfo, tc);
    await wfe.fillDetails({ templateName: tc.other.templateName });
    const saved = await wfe.saveDetails();
    await observe(testInfo, `Save: ${saved.text || '(no message)'}`);
    await snap(page, testInfo, 'duplicate-name');
    expect(saved.text, 'Duplicate-name message (AF-4)').toMatch(TEXT.duplicate);
    await wfe.openTemplate(record.id);
    expect((await wfe.detailsValues()).templateName, 'Name unchanged').toBe(tc.seed.templateName);
  });

  for (const [tc, field, message, change] of [
    [c.nameRequired, 'WorkflowTemplateName', TEXT.nameRequired, { templateName: '' }],
    [c.stageRequired, 'DefaultServiceStageIDF', TEXT.stageRequired, { defaultStage: '' }],
  ]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
      const record = await start(wfe, testInfo, tc, { Change: field === 'WorkflowTemplateName' ? 'Name cleared' : 'Default Service Stage cleared' });
      const before = await wfe.detailsValues();
      await wfe.fillDetails(change);
      const saved = await wfe.saveDetails();
      await observe(testInfo, `Save: ${saved.outcome}${saved.text ? ` - ${saved.text}` : ''}`);
      await snap(page, testInfo, 'required');
      expect(['invalid', 'error'], 'Save blocked').toContain(saved.outcome);
      await expect(wfe.detailsMessage(field), `"${message}"`).toHaveText(message);
      await wfe.openTemplate(record.id);
      expect(await wfe.detailsValues(), 'Nothing saved').toEqual(before);
    });
  }

  test(tcTitle(c.stageChange), tcDetails(c.stageChange, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.stageChange;
    const record = await start(wfe, testInfo, tc, { 'New Default Service Stage': tc.update.defaultStage });
    const before = await wfe.detailsValues();
    await wfe.fillDetails(tc.update);
    expect((await wfe.saveDetails()).outcome, 'Saved').toBe('saved');
    await wfe.openTemplate(record.id);
    expect((await wfe.detailsValues()).defaultStage, 'Default Service Stage').toBe(tc.update.defaultStage);
    const user = await wfe.currentUserName();
    if (user) expect((await wfe.templateSummary()).lastEditedBy, 'Last edited by the current user (MF-3)').toBe(user);
    await recordUpdated(testInfo, MODULE, tc, before, { ...before, ...tc.update }, record);
  });

  test(tcTitle(c.stageTerminal), tcDetails(c.stageTerminal, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.stageTerminal;
    await start(wfe, testInfo, tc, { 'Terminal Stage': TEXT.terminalStage });
    const defaults = await wfe.stageOptions();
    await wfe.openWorkSteps();
    await wfe.openNewStep();
    const stepStages = await wfe.stageOptions(wfe.stepForm.locator('#ServiceStageIDF'));
    await observe(testInfo, `Default Service Stage options: ${defaults.join(', ')} | step stages: ${stepStages.join(', ')}`);
    expect(stepStages, `Steps may use "${TEXT.terminalStage}"`).toContain(TEXT.terminalStage);
    expect(defaults, `"${TEXT.terminalStage}" is not offered as Default Service Stage (BR-10)`).not.toContain(TEXT.terminalStage);
  });

  test(tcTitle(c.isActive), tcDetails(c.isActive, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.isActive;
    await start(wfe, testInfo, tc, { 'Control Checked': 'isActive' });
    const control = page.locator('main #IsActive, main [name="IsActive"], main [name="isActive"]').or(page.locator('main form').getByLabel(/^\s*(is )?active\s*$/i));
    await observe(testInfo, `Active shown as text: "${(await wfe.templateSummary()).active}"; controls found: ${await control.count()}`);
    await expect(control.first(), 'isActive control on the template (MF-2)').toBeVisible({ timeout: 3_000 });
  });

  // ================================================================== MF-5 steps
  test(tcTitle(c.addStep), tcDetails(c.addStep, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.addStep;
    const record = await start(wfe, testInfo, tc, { 'New Step': `${tc.newStep.stepName} (${tc.newStep.staffRole}, ${tc.newStep.serviceStage}, ${tc.newStep.estimatedHours} h, ${tc.newStep.percentComplete}%)` });
    await wfe.openWorkSteps();
    await wfe.addStep(tc.newStep);
    await wfe.openTemplate(record.id);
    await wfe.openWorkSteps();
    const grid = await wfe.gridSteps();
    await snap(page, testInfo, 'step-added');
    expect(grid.map(r => r.name), 'Added last').toEqual([...names(STEPS), tc.newStep.stepName]);
    const row = grid[grid.length - 1];
    expect(row.role).toBe(tc.newStep.staffRole);
    expect(row.type).toBe(tc.newStep.workItemType);
    expect(row.stage).toBe(tc.newStep.serviceStage);
    expect(num(row.hours)).toBe(num(tc.newStep.estimatedHours));
    expect(num(row.pct)).toBe(num(tc.newStep.percentComplete));
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, steps: names(STEPS).join(', ') }, { templateName: tc.seed.templateName, steps: grid.map(r => r.name).join(', ') }, record);
  });

  for (const [tc, field, message] of [
    [c.stepRole, 'StaffRoleIDF', TEXT.staffRoleRequired],
    [c.stepName, 'StepName', TEXT.stepNameRequired],
    [c.stepHours, 'EstimatedHours', TEXT.hoursNegative],
    [c.stepPercent, 'PercentComplete', null],
  ]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
      await start(wfe, testInfo, tc, Object.fromEntries(Object.entries(tc.newStep).map(([k, v]) => [`Step ${k}`, v])));
      await wfe.openWorkSteps();
      await wfe.openNewStep();
      await wfe.fillStep(tc.newStep);
      const result = await wfe.saveStep();
      const fieldText = (await wfe.stepForm.locator(`[data-valmsg-for="${field}"]`).innerText().catch(() => '')).trim();
      const invalidField = (result.invalid || []).find(i => i.field === field);
      await observe(testInfo, `Save: posted=${result.posted}, success=${result.success}; ${result.message} ${result.fieldErrors} ${fieldText}`.trim()
        + (invalidField ? `; ${field} marked invalid by the browser${invalidField.message ? ` ("${invalidField.message}")` : ' (no message text shown)'}` : ''));
      await snap(page, testInfo, 'step-validation');
      expect(result.success, 'Step not saved').toBe(false);
      if (message) expect(`${fieldText} | ${result.fieldErrors} | ${result.message}`, `"${message}"`).toContain(message);
      // % Complete (max 100) is stopped by the browser and only marked invalid - no message text is shown (observed)
      else expect(!!`${fieldText}${result.fieldErrors}${result.message}`.trim() || !!invalidField, `${field} rejected (validation message or field marked invalid)`).toBe(true);
      if (tc.newStep.stepName) expect((await wfe.gridSteps()).map(r => r.name), 'Not added to the grid').not.toContain(tc.newStep.stepName);
    });
  }

  test(tcTitle(c.editStep), tcDetails(c.editStep, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.editStep;
    const record = await start(wfe, testInfo, tc, { 'Step Edited': tc.target, ...Object.fromEntries(Object.entries(tc.change).map(([k, v]) => [`New ${k}`, v])) });
    await wfe.openWorkSteps();
    await wfe.openStep(tc.target);
    await wfe.fillStep(tc.change);
    const result = await wfe.saveStep();
    expect(result.success, `Step saved (${result.message} ${result.fieldErrors})`).toBe(true);
    await wfe.openTemplate(record.id);
    await wfe.openWorkSteps();
    const grid = await wfe.gridSteps();
    await snap(page, testInfo, 'step-edited');
    const row = grid.find(r => r.name === tc.change.stepName);
    expect(row, `"${tc.change.stepName}" listed`).toBeTruthy();
    expect(row.index, 'Same position').toBe('2');
    expect(row.role).toBe(tc.change.staffRole);
    expect(num(row.hours)).toBe(num(tc.change.estimatedHours));
    expect(num(row.pct)).toBe(num(tc.change.percentComplete));
    expect(grid.map(r => r.name), 'Old name gone').not.toContain(tc.target);
    const old = STEPS.find(s => s.stepName === tc.target);
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, stepName: old.stepName, staffRole: old.staffRole, estimatedHours: old.estimatedHours, percentComplete: old.percentComplete },
      { templateName: tc.seed.templateName, ...tc.change }, record);
  });

  test(tcTitle(c.deleteStep), tcDetails(c.deleteStep, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.deleteStep;
    const record = await start(wfe, testInfo, tc, { 'Step Deleted': tc.target });
    await wfe.openWorkSteps();
    const text = await test.step('X -> Cancel keeps the step', () => wfe.deleteStep(tc.target, false));
    await observe(testInfo, `Pop-up: ${text}`);
    expect(text, '"Delete step?"').toContain(TEXT.deleteStepTitle);
    expect((await wfe.gridSteps()).map(r => r.name), 'Still 3 steps').toEqual(names(STEPS));
    await test.step('X -> Delete step', () => wfe.deleteStep(tc.target, true));
    await wfe.openTemplate(record.id);
    await wfe.openWorkSteps();
    const grid = await wfe.gridSteps();
    await snap(page, testInfo, 'step-deleted');
    expect(grid.map(r => r.name), 'Step removed').toEqual(names(STEPS).filter(n => n !== tc.target));
    expect(grid.map(r => r.index), 'Renumbered').toEqual(['1', '2']);
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, steps: names(STEPS).join(', ') }, { templateName: tc.seed.templateName, steps: grid.map(r => r.name).join(', ') }, record);
  });

  // ================================================================== MF-7 dependencies
  /** Re-opens the template's Work Steps and reads a gate of a step. */
  async function reread(wfe, record, stepName, gate = 'start') {
    await wfe.openTemplate(record.id);
    await wfe.openWorkSteps();
    await wfe.openGate(stepName, gate);
    const g = await wfe.readGate();
    await wfe.closeDrawer();
    return g;
  }
  const rowOf = (g, stepName) => g.rows.find(r => r.name === stepName) || {};

  test(tcTitle(c.gateRequired), tcDetails(c.gateRequired, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.gateRequired;
    const record = await start(wfe, testInfo, tc, { Gate: `Start gate of "${tc.dependent}"`, Prerequisite: `${tc.prerequisite} = Required, ${tc.condition}` });
    await wfe.openWorkSteps();
    await wfe.openGate(tc.dependent, 'start');
    await wfe.setDependency(tc.prerequisite, 'Required', tc.condition);
    await snap(page, testInfo, 'gate');
    const result = await wfe.saveGate();
    expect(result.success, `Gate saved (${result.error || result.message})`).toBe(true);
    const g = await reread(wfe, record, tc.dependent);
    expect(rowOf(g, tc.prerequisite), 'Saved dependency').toMatchObject({ selection: 'Required', condition: tc.condition });
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, startGate: '' }, { templateName: tc.seed.templateName, startGate: `${tc.dependent} <- ${tc.prerequisite} (Required, ${tc.condition})` }, record);
  });

  test(tcTitle(c.gatePhase), tcDetails(c.gatePhase, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.gatePhase;
    const record = await start(wfe, testInfo, tc, { Gate: `Start gate of "${tc.dependent}"`, 'Project Phase Gate': tc.phase });
    await wfe.openWorkSteps();
    await wfe.openGate(tc.dependent, 'start');
    await wfe.setPhase(tc.phase);
    const result = await wfe.saveGate();
    expect(result.success, `Phase gate saved (${result.error || result.message})`).toBe(true);
    expect((await reread(wfe, record, tc.dependent)).phase, 'Project Phase').toBe(tc.phase);
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, phaseGate: '' }, { templateName: tc.seed.templateName, phaseGate: `${tc.dependent}: ${tc.phase}` }, record);
  });

  test(tcTitle(c.gateSingleOr), tcDetails(c.gateSingleOr, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.gateSingleOr;
    const record = await start(wfe, testInfo, tc, { Gate: `Start gate of "${tc.dependent}"`, Alternatives: tc.alternatives });
    await wfe.openWorkSteps();
    await wfe.openGate(tc.dependent, 'start');
    for (const p of tc.alternatives) await wfe.setDependency(p, 'Alternative', 'Completed');
    const result = await wfe.saveGate();
    await observe(testInfo, `Save: success=${result.success}; ${result.error || result.message}`);
    await snap(page, testInfo, 'single-or');
    expect(result.success, 'A single OR dependency is refused (BR-11)').toBe(false);
    expect(`${result.error}${result.message}`, 'Message').toMatch(/\S/);
    const g = await reread(wfe, record, tc.dependent);
    for (const p of tc.alternatives) expect(rowOf(g, p).selection, `${p} not saved`).toBe('None');
  });

  test(tcTitle(c.gateOrPair), tcDetails(c.gateOrPair, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.gateOrPair;
    const record = await start(wfe, testInfo, tc, { Gate: `Start gate of "${tc.dependent}"`, Alternatives: tc.alternatives });
    await wfe.openWorkSteps();
    await wfe.openGate(tc.dependent, 'start');
    for (const p of tc.alternatives) await wfe.setDependency(p, 'Alternative', 'Completed');
    const result = await wfe.saveGate();
    expect(result.success, `OR pair saved (${result.error || result.message})`).toBe(true);
    const g = await reread(wfe, record, tc.dependent);
    for (const p of tc.alternatives) expect(rowOf(g, p).selection, `${p} Alternative`).toBe('Alternative');
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, startGate: '' }, { templateName: tc.seed.templateName, startGate: `${tc.dependent} <- ${tc.alternatives.join(' OR ')}` }, record);
  });

  test(tcTitle(c.gateCircular), tcDetails(c.gateCircular, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.gateCircular;
    const record = await start(wfe, testInfo, tc, { 'First Dependency': `${tc.first.dependent} requires ${tc.first.prerequisite}`, 'Second Dependency': `${tc.second.dependent} requires ${tc.second.prerequisite}` });
    await wfe.openWorkSteps();
    await test.step(`${tc.first.dependent} requires ${tc.first.prerequisite}`, async () => {
      await wfe.openGate(tc.first.dependent, 'start');
      await wfe.setDependency(tc.first.prerequisite, 'Required', 'Completed');
      expect((await wfe.saveGate()).success, 'First dependency saved').toBe(true);
    });
    const result = await test.step(`${tc.second.dependent} requires ${tc.second.prerequisite} (circular)`, async () => {
      await wfe.openGate(tc.second.dependent, 'start');
      await wfe.setDependency(tc.second.prerequisite, 'Required', 'Completed');
      return wfe.saveGate();
    });
    await observe(testInfo, `Circular save: success=${result.success}; ${result.error || result.message}`);
    await snap(page, testInfo, 'circular');
    expect(result.success, 'Circular dependency refused (BR-12)').toBe(false);
    expect(`${result.error}${result.message}`, 'Message').toMatch(/\S/);
    expect(rowOf(await reread(wfe, record, tc.second.dependent), tc.second.prerequisite).selection, 'Not saved').toBe('None');
  });

  test(tcTitle(c.gateBothGates), tcDetails(c.gateBothGates, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.gateBothGates;
    const record = await start(wfe, testInfo, tc, { Dependent: tc.dependent, Prerequisite: tc.prerequisite, Gates: 'Start and Completion' });
    await wfe.openWorkSteps();
    for (const gate of ['start', 'completion']) {
      await test.step(`${gate} gate: ${tc.dependent} requires ${tc.prerequisite}`, async () => {
        await wfe.openGate(tc.dependent, gate);
        await wfe.setDependency(tc.prerequisite, 'Required', 'Completed');
        const result = await wfe.saveGate();
        expect(result.success, `${gate} gate saved (${result.error || result.message})`).toBe(true);
      });
    }
    for (const gate of ['start', 'completion']) {
      expect(rowOf(await reread(wfe, record, tc.dependent, gate), tc.prerequisite).selection, `${gate} gate keeps ${tc.prerequisite}`).toBe('Required');
    }
  });

  test(tcTitle(c.gateSelf), tcDetails(c.gateSelf, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.gateSelf;
    await start(wfe, testInfo, tc, { 'Step Opened': tc.dependent });
    await wfe.openWorkSteps();
    await wfe.openGate(tc.dependent, 'start');
    const g = await wfe.readGate();
    await snap(page, testInfo, 'gate-self');
    const self = rowOf(g, tc.dependent);
    expect(self.dependent, 'Own row is the dependent step').toBe(true);
    expect(self.badge, `"${TEXT.dependentBadge}"`).toBe(TEXT.dependentBadge);
    expect(self.hasChoice, 'No None / Required / Alternative for itself').toBe(false);
    expect(g.rows.filter(r => r.dependent).length, 'Only itself is the dependent').toBe(1);
  });

  test(tcTitle(c.deleteCleanup), tcDetails(c.deleteCleanup, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.deleteCleanup;
    const record = await start(wfe, testInfo, tc, { Dependency: `${tc.dependent} requires ${tc.prerequisite}`, 'Step Deleted': tc.prerequisite });
    await wfe.openWorkSteps();
    await wfe.openGate(tc.dependent, 'start');
    await wfe.setDependency(tc.prerequisite, 'Required', 'Completed');
    expect((await wfe.saveGate()).success, 'Dependency saved').toBe(true);
    await wfe.deleteStep(tc.prerequisite, true);
    const g = await reread(wfe, record, tc.dependent);
    await observe(testInfo, `Gate after delete: ${g.rows.map(r => `${r.name}=${r.selection}`).join(', ')}`);
    expect(g.rows.map(r => r.name), `${tc.prerequisite} gone`).not.toContain(tc.prerequisite);
    expect(g.rows.filter(r => r.selection !== 'None'), 'No dependency left (BR-9)').toEqual([]);
  });

  // ================================================================== MF-4 / AF-6 / BR-2 versions
  /** Create Draft from Version 1 (Published) and save. Returns what the pop-up showed. */
  async function createDraft(wfe) {
    const shown = await wfe.openCreateDraft(1);
    await wfe.saveCreateDraft();
    return shown;
  }

  test(tcTitle(c.createDraft), tcDetails(c.createDraft, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.createDraft;
    const record = await start(wfe, testInfo, tc);
    const shown = await test.step('Versions -> Create Draft on Version 1', () => wfe.openCreateDraft(1));
    await observe(testInfo, `Pop-up: source "${shown.source}", ${shown.stepCount} steps: ${shown.steps.join(', ')}`);
    await snap(page, testInfo, 'create-draft');
    expect(shown.source, 'Source version').toContain(tc.seed.templateName);
    expect(shown.source, 'Source version').toMatch(/v1 \(Published\)/i);
    expect(shown.stepCount, 'Step count').toBe(STEPS.length);
    expect(shown.steps, 'Source steps').toEqual(names(STEPS));
    await test.step('Save', () => wfe.saveCreateDraft());
    const summary = await wfe.templateSummary();
    expect(summary.status, 'New version is a Draft').toBe(TEXT.draft);
    expect(summary.version, 'Next version number (BR-7)').toBe('Version 2');
    const versions = await wfe.versions();
    expect(versions.map(v => `${v.number}:${v.status}`).sort(), 'Version 1 Published + Version 2 Draft').toEqual(['1:Published', '2:Draft']);
    const user = await wfe.currentUserName();
    if (user) await expect(wfe.versionCards.filter({ has: page.locator('.report-version-card__title', { hasText: 'Version 2' }) }).first(), 'Created by the current user').toContainText(user);
    expect(await wfe.workSteps(), 'Steps copied (BR-8)').toEqual(names(STEPS));
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, versions: 'Version 1 (Published)' }, { templateName: tc.seed.templateName, versions: 'Version 1 (Published), Version 2 (Draft)' }, record);
  });

  test(tcTitle(c.draftExists), tcDetails(c.draftExists, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.draftExists;
    const record = await start(wfe, testInfo, tc);
    await createDraft(wfe);
    await wfe.openTemplate(record.id);
    const versions = await wfe.versions();
    await observe(testInfo, `Versions: ${versions.map(v => `v${v.number} ${v.status}`).join(', ')}`);
    expect(versions.filter(v => v.isDraft), 'One draft').toHaveLength(1);
    await expect(wfe.createDraftButtons, 'Create Draft not offered while a draft exists (AF-6)').toHaveCount(0);
    const v1 = await wfe.versionIdOf(1);
    await wfe.openVersion(record.id, v1);
    await wfe.openTab('Versions');
    await expect(wfe.createDraftButtons, 'Not offered on the Published version either').toHaveCount(0);
  });

  test(tcTitle(c.readOnlyPublished), tcDetails(c.readOnlyPublished, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.readOnlyPublished;
    await start(wfe, testInfo, tc);
    expect((await wfe.templateSummary()).status, 'Viewing the Published version').toBe(TEXT.published);
    await expect(wfe.defaultStage, 'Default Service Stage not editable').toBeDisabled();
    await wfe.openWorkSteps();
    await snap(page, testInfo, 'published-steps');
    expect(await wfe.canEditSteps(), 'Work Steps read-only').toBe(false);
    await expect(wfe.addStepButton, 'No Add Step').toHaveCount(0);
    await expect(page.locator('.wft-worksteps__btn-delete').filter({ visible: true }), 'No step delete').toHaveCount(0);
    await expect(page.locator('.wft-worksteps__gate:not([disabled])').filter({ visible: true }), 'No editable gates').toHaveCount(0);
  });

  // ================================================================== MF-8 / MF-9 delete and archive
  test(tcTitle(c.deleteDraftOnly), tcDetails(c.deleteDraftOnly, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.deleteDraftOnly;
    await start(wfe, testInfo, tc);
    const text = await test.step('Actions -> Delete Draft Version -> Cancel', async () => {
      const t = await wfe.openAction(wfe.deleteDraftAction);
      await snap(page, testInfo, 'delete-draft-confirmation');
      await wfe.dismissConfirmation();
      return t;
    });
    await observe(testInfo, `Pop-up: ${text}`);
    expect(text, 'Confirmation').toMatch(TEXT.deleteDraftTitle);
    await expect(wfe.title, 'Still there after Cancel').toHaveText(tc.seed.templateName);
    const json = await test.step('Delete Draft Version -> Yes', async () => {
      await wfe.openAction(wfe.deleteDraftAction);
      return wfe.confirmDestructive(wfe.deleteDraftYes, /\/WorkflowTemplate\/DeleteDraftVersion\//i);
    });
    expect(json.success, `Deleted (${json.message || ''})`).toBe(true);
    await observe(testInfo, `After delete: ${json.url}`);
    // the deleted template is not re-opened; the list proves it is gone
    await wfe.gotoList();
    expect(await wfe.searchList(tc.seed.templateName), 'Template hard-deleted with its only version').toHaveLength(0);
  });

  test(tcTitle(c.deleteDraftKeep), tcDetails(c.deleteDraftKeep, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.deleteDraftKeep;
    const record = await start(wfe, testInfo, tc);
    await createDraft(wfe);
    const text = await wfe.openAction(wfe.deleteDraftAction);
    await observe(testInfo, `Pop-up: ${text}`);
    const json = await wfe.confirmDestructive(wfe.deleteDraftYes, /\/WorkflowTemplate\/DeleteDraftVersion\//i);
    expect(json.success, `Draft deleted (${json.message || ''})`).toBe(true);
    await observe(testInfo, `After delete: ${json.url}`);
    await wfe.gotoList();
    const rows = await wfe.searchList(tc.seed.templateName);
    expect(rows.map(r => r.id), 'Template kept').toEqual([record.id]);
    expect(rows[0].status, 'Still Published').toBe(TEXT.published);
    await wfe.openTemplate(record.id);
    expect((await wfe.versions()).map(v => `${v.number}:${v.status}`), 'Only Version 1 Published').toEqual(['1:Published']);
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, versions: 'Version 1 (Published), Version 2 (Draft)' }, { templateName: tc.seed.templateName, versions: 'Version 1 (Published)' }, record);
  });

  test(tcTitle(c.archive), tcDetails(c.archive, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.archive;
    await start(wfe, testInfo, tc);
    const text = await test.step('Actions -> Archive Template -> Go Back', async () => {
      const t = await wfe.openAction(wfe.archiveAction);
      await snap(page, testInfo, 'archive-confirmation');
      await wfe.dismissConfirmation();
      return t;
    });
    await observe(testInfo, `Pop-up: ${text}`);
    expect(text, 'Confirmation').toContain(TEXT.archiveTitle);
    await expect(wfe.title, 'Still there after Go Back').toHaveText(tc.seed.templateName);
    const json = await test.step('Archive Template -> Yes', async () => {
      await wfe.openAction(wfe.archiveAction);
      return wfe.confirmDestructive(wfe.archiveYes, /\/WorkflowTemplate\/DeleteWorkflowTemplate\//i);
    });
    expect(json.success, `Archived (${json.message || ''})`).toBe(true);
    // the page returns to the template, which now shows "This Workflow Template was Archived on <date> at <time>"
    await expect(wfe.archivedBanner(), 'Archived banner').toBeVisible({ timeout: 30_000 });
    await observe(testInfo, `After archive: ${(await wfe.archivedBanner().innerText()).trim()} (${json.url})`);
    await snap(page, testInfo, 'archived');
    await wfe.gotoList();
    expect(await wfe.searchList(tc.seed.templateName), 'Removed from the active list').toHaveLength(0);
  });

  test(tcTitle(c.archiveBlocked), tcDetails(c.archiveBlocked, MODULE), async ({ workflowTemplateEditPage: wfe }, testInfo) => {
    const tc = c.archiveBlocked;
    await start(wfe, testInfo, tc);
    const actions = await wfe.actionNames();
    await observe(testInfo, `Actions: ${actions.join(', ')}`);
    expect(actions, 'Archive Template not offered (AF-9)').not.toContain('Archive Template');
    await expect(wfe.archiveAction).toHaveCount(0);
  });

  // ================================================================== unsaved changes
  test(tcTitle(c.dirty), tcDetails(c.dirty, MODULE), async ({ workflowTemplateEditPage: wfe, page }, testInfo) => {
    const tc = c.dirty;
    const record = await start(wfe, testInfo, tc, { 'Unsaved Description': tc.update.description });
    await wfe.fillDetails(tc.update);
    const warning = await test.step('Leave -> warning -> Cancel', () => wfe.leaveWithUnsavedChanges('cancel'));
    await observe(testInfo, `Warning: ${warning}`);
    await expect(page, 'Still on the template').toHaveURL(new RegExp(`/WorkflowTemplate/Edit/${record.id}`));
    await expect(wfe.editDescription, 'Change kept').toHaveValue(tc.update.description);
  });
});
