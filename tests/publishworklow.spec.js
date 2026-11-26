const { test, expect } = require('../fixtures/fixtures');
const { MODULE, TEXT, STEPS, HANDOVER, STEP_NAMES, publishWorkflowCases: c } = require('../testData/publishWorkflowData');
const { WorkflowPublishPage } = require('../pages/workflow/workflowPublishPage');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues, recordCreated, recordUpdated, recordUrl } = require('../utils/testCase');

/**
 * Use case 63090 - Publish Workflow Template Version (module TASK): /WorkflowTemplate/Edit/{id}, Versions tab.
 *
 * 31 test cases (TC_PWT_001 - TC_PWT_031):
 *   publish a draft        confirmation + Go Back, publish, draft reference cleared, audit, list, read-only (MF-1, MF-2,
 *                          MF-5, BR-5, BR-7, BR-23)
 *   publish over published the previous version becomes Unpublished, stamped by the user, versions keep their own steps
 *                          (MF-4, BR-6)
 *   rollback               "Publish previous version?" + Go Back, rollback, published definition, existing draft kept,
 *                          republish without a published version, unpublished stamps kept (MF-3, BR-5, BR-8)
 *   unpublish              confirmation + Go Back, unpublish, no draft created, existing draft kept, audit, list
 *                          (MF-6, MF-7, BR-10, BR-11, BR-23)
 *   readiness / AFs        no Unpublish without a published version (AF-10), no steps (AF-2), no default stage (AF-8),
 *                          terminal stage not offered (AF-9), self dependency (AF-5), circular (AF-7), single OR, valid
 *                          dependencies and phase gate publish (BR-13), refused publication changes nothing (BR-22)
 * Not automated: BR-1 permission (needs a user without PERM.TASK.WorkflowTemplate.Publish), BR-12 (the sandbox has no
 * isActive control), AF-3 / AF-6 (the step drawer and gate drawer do not let an invalid step or a duplicate dependency be
 * saved), BR-20 compatibility rows and BR-21 services (not visible on this page).
 *
 * Every test builds its own template first (testData/publishWorkflowData.js): "Playwright PWT <label> <MMDD-HHmmss>",
 * Default Service Stage, 3 steps, optional gates and the version history it needs (publish / Create Draft / unpublish).
 * ONE WORKER, in file order (mode 'default'; the npm scripts add --workers=1).
 * NO CLEANUP: every template stays in the sandbox and is listed in
 * reports/excel/publish-workflow-template/Atlas_PublishWorkflowTemplate_<date>.xlsx.
 */

const allCases = Object.fromEntries(Object.values(c).map(tc => [tc.id, tc]));
const names = steps => steps.map(s => s.stepName);
const summary = WorkflowPublishPage.summary;
const { INTAKE, CONFIGURE } = STEP_NAMES;

test.describe('Workflow Template - Publish Workflow Template Version (63090)', () => {
  // one worker, in file order (also when the whole suite runs with several workers)
  test.describe.configure({ mode: 'default', timeout: 600_000 });

  // confirmed app defects (cases with `defect` in the test data) are expected to fail
  test.beforeEach(async ({}, testInfo) => knownDefectFor(testInfo, allCases));

  async function snap(page, testInfo, label) {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }

  async function observe(testInfo, text) {
    testInfo.annotations.push({ type: 'Observed', description: text });
  }

  /** One version history action of the seed (see testData: 'publish' | 'unpublish' | { draftFrom, addStep, deleteSteps }). */
  async function applyHistory(wfp, record, action) {
    if (action === 'publish') {
      const draft = (await wfp.reloadCards(record.id)).find(v => v.isDraft);
      const { result } = await wfp.publishVersion(draft.number);
      expect((await wfp.reloadCards(record.id)).find(v => v.number === draft.number).status, `Setup: v${draft.number} published (${result.text})`).toBe(TEXT.published);
    } else if (action === 'unpublish') {
      await wfp.openTemplate(record.id);
      const { result } = await wfp.unpublish();
      expect((await wfp.reloadCards(record.id)).some(v => v.status === TEXT.published), `Setup: unpublished (${result.text})`).toBe(false);
    } else {
      await wfp.openTemplate(record.id);
      await wfp.openCreateDraft(action.draftFrom);
      await wfp.saveCreateDraft();
      if (action.addStep || action.deleteSteps) await wfp.openWorkSteps();
      if (action.addStep) await wfp.addStep(action.addStep);
      for (const s of action.deleteSteps || []) await wfp.deleteStep(s, true);
    }
  }

  async function saveGate(wfp, dependent, deps) {
    await wfp.openGate(dependent, 'start');
    for (const d of deps) await wfp.setDependency(d.step, d.selection, d.condition);
    const r = await wfp.saveGate();
    expect(r.success, `Setup: gate of "${dependent}" saved (${r.error || r.message})`).toBe(true);
  }

  /**
   * Builds the test's template: standard creation (63069) -> Default Service Stage -> steps -> gates / phase gate ->
   * version history. Logs it as created and returns { id, url, cards }.
   */
  async function build(wfp, testInfo, tc, s = tc.seed) {
    return test.step(`Build "${s.templateName}" - ${s.historyText}`, async () => {
      await wfp.gotoList();
      await wfp.openWizard();
      await wfp.chooseMethod('scratch');
      await wfp.fillStandard({ templateName: s.templateName, description: s.description });
      expect(await wfp.submitStandard(), `"${s.templateName}" created`).toBe('created');
      const record = wfp.record();
      if (s.defaultStage) {
        await wfp.fillDetails({ defaultStage: s.defaultStage });
        const saved = await wfp.saveDetails();
        expect(saved.outcome, `Default Service Stage saved (${saved.text})`).toBe('saved');
      }
      if (s.steps.length) {
        await wfp.openWorkSteps();
        for (const step of s.steps) await wfp.addStep(step);
        for (const g of s.gates) await saveGate(wfp, g.dependent, g.deps);
        if (s.phaseGate) {
          await wfp.openGate(s.phaseGate.step, 'start');
          await wfp.setPhase(s.phaseGate.phase);
          const r = await wfp.saveGate();
          expect(r.success, `Setup: phase gate saved (${r.error || r.message})`).toBe(true);
        }
      }
      for (const action of s.history) await applyHistory(wfp, record, action);
      const cards = await wfp.reloadCards(record.id);
      const latest = cards[cards.length - 1];
      await recordCreated(testInfo, MODULE, tc, {
        templateName: s.templateName, description: s.description, defaultStage: s.defaultStage || '(none)', setup: s.historyText,
        versionStatus: summary(cards), versionNumber: String(latest.number), stepCount: String(s.steps.length),
      }, record);
      await recordUrl(testInfo, record.url, `Workflow Template #${record.id}`);
      return { ...record, cards };
    });
  }

  async function start(wfp, testInfo, tc, values = {}) {
    await applyAllureLabels(tc, MODULE);
    const s = tc.seed;
    await recordTestValues(testInfo, {
      'Template Name': s.templateName, 'Default Service Stage': s.defaultStage || '(empty)',
      Steps: s.steps.length ? names(s.steps) : '(none)', Setup: s.historyText, ...values,
    });
    return build(wfp, testInfo, tc);
  }

  /** Logs the version states before / after the action under test (Excel "Updates" sheet). */
  async function logChange(testInfo, tc, record, before, after) {
    await recordUpdated(testInfo, MODULE, tc, { templateName: tc.seed.templateName, versions: summary(before) },
      { templateName: tc.seed.templateName, versions: summary(after) }, record);
  }

  const byNumber = (cards, n) => cards.find(v => v.number === n);
  const auditRow = (group, field) => group.rows.find(r => r.field === field);

  // ================================================================== publish a draft (MF-1, MF-2, MF-5)
  test(tcTitle(c.confirmDraft), tcDetails(c.confirmDraft, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.confirmDraft
    const record = await start(wfp, testInfo, tc, { Action: 'Publish -> Go Back' });
    const opened = await wfp.openPublish(1);
    await snap(page, testInfo, 'publish-draft-popup');
    await observe(testInfo, `Pop-up: ${opened.title} | ${opened.body}`);
    expect(opened.kind, 'Draft confirmation pop-up').toBe('draft');
    expect(opened.title, 'Title').toBe(TEXT.publishDraftTitle);
    expect(opened.body, 'Confirm Publish Draft text').toContain(TEXT.publishDraftBody);
    expect(await wfp.modalVersionId('draft'), 'The pop-up publishes Version 1').toBe(byNumber(record.cards, 1).id);
    expect(await wfp.goBack(opened), 'No publish request after Go Back').toBe(0);
    const cards = await wfp.reloadCards(record.id);
    expect(summary(cards), 'Still Draft').toBe('v1 Draft');
  });

  test(tcTitle(c.publishDraft), tcDetails(c.publishDraft, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.publishDraft
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1' });
    const user = await wfp.currentUserName();
    const { result } = await wfp.publishVersion(1);
    await observe(testInfo, `Result: ${result.text || '(no message)'}`);
    await snap(page, testInfo, 'published');
    expect(result.text, 'Workflow Template Version Published message').toMatch(TEXT.published_msg);
    await wfp.openVersion(record.id, byNumber(record.cards, 1).id);
    const header = await wfp.templateSummary();
    expect(header.status, 'Header status').toBe(TEXT.published);
    expect(header.version, 'Header version').toBe('Version 1');
    const cards = await wfp.cards();
    expect(summary(cards), 'Version states').toBe('v1 Published');
    if (user) expect(byNumber(cards, 1).meta, 'Published by the current user').toContain(`Published by ${user}`);
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.draftCleared), tcDetails(c.draftCleared, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.draftCleared
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1' });
    await wfp.publishVersion(1);
    await wfp.openVersion(record.id, byNumber(record.cards, 1).id);
    const cards = await wfp.cards();
    await observe(testInfo, `Versions: ${summary(cards)}; header buttons: publish=${await wfp.headerPublish.count()}, unpublish=${await wfp.headerUnpublish.count()}`);
    expect(cards.filter(v => v.isDraft), 'No draft left (BR-7)').toEqual([]);
    expect(cards.map(v => v.status), 'Only Version 1, Published').toEqual([TEXT.published]);
    expect(byNumber(cards, 1).canCreateDraft, 'Create Draft offered again').toBe(true);
    await expect(wfp.headerUnpublish, 'Header: Unpublish Version').toHaveCount(1);
    await expect(wfp.headerPublish, 'Header: no Publish Version').toHaveCount(0);
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.auditPublish), tcDetails(c.auditPublish, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.auditPublish
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1', 'Audit Fields': Object.values(TEXT.audit) });
    const user = await wfp.currentUserName();
    await wfp.publishVersion(1);
    await wfp.openTemplate(record.id);
    const group = await wfp.latestAuditWith(TEXT.audit.publishedVersion);
    await observe(testInfo, `Audit ${group.date} by ${group.by}: ${group.rows.map(r => `${r.field} "${r.old}" -> "${r.new}"`).join('; ')}`);
    await snap(page, testInfo, 'audit');
    if (user) expect(group.by, 'Changed by the current user').toBe(user);
    expect(auditRow(group, TEXT.audit.status), 'Status Draft -> Published').toMatchObject({ old: TEXT.draft, new: TEXT.published });
    expect(auditRow(group, TEXT.audit.publishedVersion)?.new, 'Published version = v1').toBe('v1');
    if (user) expect(auditRow(group, TEXT.audit.publishedBy)?.new, 'Published by').toBe(user);
    expect(auditRow(group, TEXT.audit.publishedAt)?.new, 'Published at (UTC timestamp)').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(auditRow(group, TEXT.audit.draftVersion), 'Draft reference cleared').toMatchObject({ old: 'v1', new: '' });
  });

  test(tcTitle(c.listPublished), tcDetails(c.listPublished, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.listPublished
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1' });
    await wfp.publishVersion(1);
    const row = await wfp.listRow(tc.seed.templateName);
    await observe(testInfo, `List row: ${JSON.stringify(row)}`);
    await snap(page, testInfo, 'list');
    expect(row.id, 'The template').toBe(record.id);
    expect(row.status, 'Status').toBe(TEXT.published);
    expect(row.version, 'Version').toBe('1');
  });

  test(tcTitle(c.readOnly), tcDetails(c.readOnly, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.readOnly
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1' });
    await wfp.publishVersion(1);
    await wfp.openVersion(record.id, byNumber(record.cards, 1).id);
    await wfp.openWorkSteps();
    await snap(page, testInfo, 'published-steps');
    expect(await wfp.canEditSteps(), 'Published version is read-only').toBe(false);
    await expect(wfp.addStepButton, 'No Add Step').toBeHidden();
    expect((await wfp.gridSteps()).map(r => r.name), 'Steps kept').toEqual(names(STEPS));
  });

  // ================================================================== publish over a published version (MF-4, BR-6)
  test(tcTitle(c.publishOver), tcDetails(c.publishOver, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.publishOver
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 2' });
    expect(summary(record.cards), 'Setup').toBe('v1 Published, v2 Draft');
    const { opened, result } = await wfp.publishVersion(2);
    await observe(testInfo, `Pop-up: ${opened.title}; result: ${result.text}`);
    expect(opened.kind, 'Draft pop-up for a draft version').toBe('draft');
    expect(result.text, 'Published message').toMatch(TEXT.published_msg);
    await wfp.openVersion(record.id, byNumber(record.cards, 2).id);
    expect((await wfp.templateSummary()).version, 'Header').toBe('Version 2');
    const cards = await wfp.cards();
    await snap(page, testInfo, 'versions');
    expect(summary(cards), 'v1 Unpublished, v2 Published').toBe('v1 Unpublished, v2 Published');
    expect(cards.filter(v => v.status === TEXT.published).length, 'Exactly one Published version').toBe(1);
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.previousStamped), tcDetails(c.previousStamped, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.previousStamped
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 2' });
    const user = await wfp.currentUserName();
    await wfp.publishVersion(2);
    const cards = await wfp.reloadCards(record.id);
    const v1 = byNumber(cards, 1);
    await observe(testInfo, `v1 card: ${v1.meta}`);
    if (user) expect(v1.meta, 'v1 stamped "Unpublished by <user>"').toContain(`Unpublished by ${user}`);
    const group = await wfp.latestAuditWith(TEXT.audit.publishedVersion);
    await observe(testInfo, `Audit ${group.date} by ${group.by}: ${group.rows.map(r => `${r.field} "${r.old}" -> "${r.new}"`).join('; ')}`);
    await snap(page, testInfo, 'audit');
    expect(auditRow(group, TEXT.audit.publishedVersion), 'Published version v1 -> v2').toMatchObject({ old: 'v1', new: 'v2' });
    expect(group.rows.some(r => r.field === TEXT.audit.status && r.old === TEXT.published && r.new === TEXT.unpublished), 'v1 Published -> Unpublished').toBe(true);
    expect(group.rows.some(r => r.field === TEXT.audit.status && r.old === TEXT.draft && r.new === TEXT.published), 'v2 Draft -> Published').toBe(true);
    if (user) expect(auditRow(group, TEXT.audit.unpublishedBy)?.new, 'Unpublished by').toBe(user);
    expect(auditRow(group, TEXT.audit.unpublishedAt)?.new, 'Unpublished at (UTC timestamp)').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  test(tcTitle(c.newVersionSteps), tcDetails(c.newVersionSteps, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.newVersionSteps
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 2', 'Version 2 Extra Step': HANDOVER.stepName });
    await wfp.publishVersion(2);
    await wfp.openVersion(record.id, byNumber(record.cards, 2).id);
    const v2 = await wfp.workSteps();
    await wfp.openVersion(record.id, byNumber(record.cards, 1).id);
    const v1 = await wfp.workSteps();
    await observe(testInfo, `v2: ${v2.join(', ')} | v1: ${v1.join(', ')}`);
    expect(v2, 'Version 2 (Published)').toEqual([...names(STEPS), HANDOVER.stepName]);
    expect(v1, 'Version 1 (Unpublished)').toEqual(names(STEPS));
  });

  // ================================================================== rollback (MF-3, BR-8)
  test(tcTitle(c.confirmPrevious), tcDetails(c.confirmPrevious, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.confirmPrevious
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1 -> Go Back' });
    expect(summary(record.cards), 'Setup').toBe('v1 Unpublished, v2 Published');
    const opened = await wfp.openPublish(1);
    await snap(page, testInfo, 'publish-previous-popup');
    await observe(testInfo, `Pop-up: ${opened.title} | ${opened.body}`);
    expect(opened.kind, 'Previous-version pop-up').toBe('previous');
    expect(opened.title, 'Title').toBe(TEXT.publishPreviousTitle);
    expect(opened.body, 'Confirm Publish Previous text').toContain(TEXT.publishPreviousBody);
    expect(await wfp.modalVersionId('previous'), 'Publishes Version 1').toBe(byNumber(record.cards, 1).id);
    expect(await wfp.goBack(opened), 'No publish request after Go Back').toBe(0);
    expect(summary(await wfp.reloadCards(record.id)), 'Unchanged').toBe('v1 Unpublished, v2 Published');
  });

  test(tcTitle(c.rollback), tcDetails(c.rollback, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.rollback
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1 (rollback)' });
    const { opened, result } = await wfp.publishVersion(1);
    await observe(testInfo, `Pop-up: ${opened.title}; result: ${result.text}`);
    expect(opened.kind, 'Previous-version pop-up').toBe('previous');
    expect(result.text, 'Published message').toMatch(TEXT.published_msg);
    const cards = await wfp.reloadCards(record.id);
    await snap(page, testInfo, 'versions');
    expect(summary(cards), 'v1 Published, v2 Unpublished').toBe('v1 Published, v2 Unpublished');
    expect(cards.filter(v => v.status === TEXT.published).length, 'Exactly one Published version').toBe(1);
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.rollbackSteps), tcDetails(c.rollbackSteps, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.rollbackSteps
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1 (rollback)' });
    await wfp.publishVersion(1);
    await wfp.openVersion(record.id, byNumber(record.cards, 1).id);
    const header = await wfp.templateSummary();
    const steps = await wfp.workSteps();
    await observe(testInfo, `Header ${header.status} ${header.version}; steps: ${steps.join(', ')}`);
    await snap(page, testInfo, 'rolled-back');
    expect(header.status, 'Version 1 is Published').toBe(TEXT.published);
    expect(header.version, 'Version 1').toBe('Version 1');
    expect(steps, 'Version 1 steps, no Handover').toEqual(names(STEPS));
    await expect(wfp.headerUnpublish, 'Header: Unpublish Version').toHaveCount(1);
  });

  test(tcTitle(c.rollbackKeepsDraft), tcDetails(c.rollbackKeepsDraft, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.rollbackKeepsDraft
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1 (rollback) while Version 3 is Draft' });
    expect(summary(record.cards), 'Setup').toBe('v1 Unpublished, v2 Published, v3 Draft');
    await wfp.publishVersion(1);
    const cards = await wfp.reloadCards(record.id);
    await observe(testInfo, `Versions: ${summary(cards)}`);
    expect(summary(cards), 'v3 still Draft').toBe('v1 Published, v2 Unpublished, v3 Draft');
    expect(byNumber(cards, 3).id, 'Same draft version').toBe(byNumber(record.cards, 3).id);
    expect(byNumber(cards, 3).isDraft, 'v3 is the draft').toBe(true);
    const group = await wfp.latestAuditWith(TEXT.audit.publishedVersion);
    await observe(testInfo, `Audit: ${group.rows.map(r => `${r.field} "${r.old}" -> "${r.new}"`).join('; ')}`);
    expect(auditRow(group, TEXT.audit.publishedVersion), 'Published v2 -> v1').toMatchObject({ old: 'v2', new: 'v1' });
    expect(auditRow(group, TEXT.audit.draftVersion), 'Draft reference not changed (BR-8)').toBeUndefined();
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.republish), tcDetails(c.republish, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.republish
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1 again' });
    expect(summary(record.cards), 'Setup').toBe('v1 Unpublished');
    const { opened, result } = await wfp.publishVersion(1);
    await observe(testInfo, `Pop-up: ${opened.title}; result: ${result.text}`);
    expect(opened.kind, 'Previous-version pop-up').toBe('previous');
    expect(result.text, 'Published message').toMatch(TEXT.published_msg);
    const cards = await wfp.reloadCards(record.id);
    expect(summary(cards), 'v1 Published').toBe('v1 Published');
    expect(byNumber(cards, 1).canUnpublish, 'Unpublish offered again').toBe(true);
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.republishKeepsStamps), tcDetails(c.republishKeepsStamps, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.republishKeepsStamps
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1 again' });
    const user = await wfp.currentUserName();
    await wfp.publishVersion(1);
    const cards = await wfp.reloadCards(record.id);
    const group = await wfp.latestAuditWith(TEXT.audit.publishedVersion);
    await observe(testInfo, `Audit ${group.date}: ${group.rows.map(r => `${r.field} "${r.old}" -> "${r.new}"`).join('; ')}; v1 card: ${byNumber(cards, 1).meta}`);
    await snap(page, testInfo, 'audit');
    expect(auditRow(group, TEXT.audit.status), 'Unpublished -> Published').toMatchObject({ old: TEXT.unpublished, new: TEXT.published });
    expect(auditRow(group, TEXT.audit.publishedVersion)?.new, 'Published version = v1').toBe('v1');
    // The audit only lists changed fields: v1 was first published by this same user, so PublishedByPersonIDF keeps its
    // value and has no row (observed). When it is listed it must name the current user; the v1 card must show it anyway.
    const publishedBy = auditRow(group, TEXT.audit.publishedBy);
    if (user && publishedBy) expect(publishedBy.new, 'Published by').toBe(user);
    if (user) expect(byNumber(cards, 1).meta, 'v1 card: Published by the current user').toContain(`Published by ${user}`);
    const publishedAt = auditRow(group, TEXT.audit.publishedAt);
    if (publishedAt) expect(publishedAt.new, 'Published at re-stamped (UTC timestamp)').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(auditRow(group, TEXT.audit.unpublishedAt), 'UnpublishedAtUtc kept').toBeUndefined();
    expect(auditRow(group, TEXT.audit.unpublishedBy), 'UnpublishedByPersonIDF kept').toBeUndefined();
  });

  // ================================================================== unpublish (MF-6, MF-7, BR-10, BR-11)
  test(tcTitle(c.confirmUnpublish), tcDetails(c.confirmUnpublish, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.confirmUnpublish
    const record = await start(wfp, testInfo, tc, { Action: 'Unpublish -> Go Back' });
    await wfp.openTemplate(record.id);
    const opened = await wfp.openUnpublish();
    await snap(page, testInfo, 'unpublish-popup');
    await observe(testInfo, `Pop-up: ${opened.title} | ${opened.body}`);
    expect(opened.kind, 'Unpublish pop-up').toBe('unpublish');
    expect(opened.title, 'Title').toBe(TEXT.unpublishTitle);
    expect(opened.body, 'Confirm Unpublish text').toContain(TEXT.unpublishBody);
    expect(await wfp.goBack(opened), 'No unpublish request after Go Back').toBe(0);
    expect(summary(await wfp.reloadCards(record.id)), 'Still Published').toBe('v1 Published');
  });

  test(tcTitle(c.unpublish), tcDetails(c.unpublish, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.unpublish
    const record = await start(wfp, testInfo, tc, { Action: 'Unpublish' });
    const user = await wfp.currentUserName();
    await wfp.openTemplate(record.id);
    const { result } = await wfp.unpublish();
    await observe(testInfo, `Result: ${result.text || '(no message)'}`);
    await snap(page, testInfo, 'unpublished');
    expect(result.text, 'Workflow Template Unpublished message').toMatch(TEXT.unpublished_msg);
    await wfp.openVersion(record.id, byNumber(record.cards, 1).id);
    const cards = await wfp.cards();
    const v1 = byNumber(cards, 1);
    expect(summary(cards), 'v1 Unpublished').toBe('v1 Unpublished');
    if (user) expect(v1.meta, 'Unpublished by the current user').toContain(`Unpublished by ${user}`);
    expect(v1.canUnpublish, 'Unpublish no longer offered').toBe(false);
    await expect(wfp.headerUnpublish, 'Header: no Unpublish Version').toHaveCount(0);
    expect(v1.canPublish, 'Publish offered on v1 (rollback possible)').toBe(true);
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.unpublishNoDraft), tcDetails(c.unpublishNoDraft, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.unpublishNoDraft
    const record = await start(wfp, testInfo, tc, { Action: 'Unpublish' });
    await wfp.openTemplate(record.id);
    await wfp.unpublish();
    const cards = await wfp.reloadCards(record.id);
    await observe(testInfo, `Versions: ${summary(cards)}`);
    expect(cards.length, 'No version added').toBe(1);
    expect(cards.filter(v => v.isDraft || v.status === TEXT.draft), 'No draft created (BR-11)').toEqual([]);
    expect(byNumber(cards, 1).id, 'Same version').toBe(byNumber(record.cards, 1).id);
    expect(byNumber(cards, 1).canCreateDraft, 'Create Draft offered').toBe(true);
  });

  test(tcTitle(c.unpublishKeepsDraft), tcDetails(c.unpublishKeepsDraft, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.unpublishKeepsDraft
    const record = await start(wfp, testInfo, tc, { Action: 'Unpublish while Version 2 is Draft' });
    expect(summary(record.cards), 'Setup').toBe('v1 Published, v2 Draft');
    await wfp.openTemplate(record.id);
    const { result } = await wfp.unpublish();
    const cards = await wfp.reloadCards(record.id);
    await observe(testInfo, `Result: ${result.text}; versions: ${summary(cards)}`);
    expect(summary(cards), 'v1 Unpublished, v2 still Draft').toBe('v1 Unpublished, v2 Draft');
    expect(byNumber(cards, 2).id, 'Same draft version').toBe(byNumber(record.cards, 2).id);
    expect(byNumber(cards, 2).isDraft, 'v2 is the draft').toBe(true);
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.auditUnpublish), tcDetails(c.auditUnpublish, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.auditUnpublish
    const record = await start(wfp, testInfo, tc, { Action: 'Unpublish', 'Audit Fields': Object.values(TEXT.audit) });
    const user = await wfp.currentUserName();
    await wfp.openTemplate(record.id);
    await wfp.unpublish();
    await wfp.openTemplate(record.id);
    const group = await wfp.latestAuditWith(TEXT.audit.unpublishedBy);
    await observe(testInfo, `Audit ${group.date} by ${group.by}: ${group.rows.map(r => `${r.field} "${r.old}" -> "${r.new}"`).join('; ')}`);
    await snap(page, testInfo, 'audit');
    if (user) expect(group.by, 'Changed by the current user').toBe(user);
    expect(auditRow(group, TEXT.audit.status), 'Published -> Unpublished').toMatchObject({ old: TEXT.published, new: TEXT.unpublished });
    if (user) expect(auditRow(group, TEXT.audit.unpublishedBy)?.new, 'Unpublished by').toBe(user);
    expect(auditRow(group, TEXT.audit.unpublishedAt)?.new, 'Unpublished at (UTC timestamp)').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(auditRow(group, TEXT.audit.publishedVersion), 'Published reference cleared').toMatchObject({ old: 'v1', new: '' });
    expect(auditRow(group, TEXT.audit.draftVersion), 'Draft reference untouched').toBeUndefined();
  });

  test(tcTitle(c.listUnpublished), tcDetails(c.listUnpublished, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.listUnpublished
    const record = await start(wfp, testInfo, tc, { Action: 'Unpublish' });
    await wfp.openTemplate(record.id);
    await wfp.unpublish();
    const row = await wfp.listRow(tc.seed.templateName);
    await observe(testInfo, `List row: ${JSON.stringify(row)}`);
    await snap(page, testInfo, 'list');
    expect(row.id, 'The template').toBe(record.id);
    expect(row.status, 'Status').toBe(TEXT.unpublished);
  });

  // ================================================================== alternate flows / publication readiness
  test(tcTitle(c.noPublishedVersion), tcDetails(c.noPublishedVersion, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.noPublishedVersion
    const record = await start(wfp, testInfo, tc, { Check: 'Unpublish offered?' });
    await wfp.openTemplate(record.id);
    const cards = await wfp.cards();
    await snap(page, testInfo, 'draft-only');
    await observe(testInfo, `Versions: ${summary(cards)}; header unpublish=${await wfp.headerUnpublish.count()}, publish=${await wfp.headerPublish.count()}`);
    await expect(wfp.headerUnpublish, 'Header: no Unpublish Version').toHaveCount(0);
    expect(cards.some(v => v.canUnpublish), 'No Unpublish on any version').toBe(false);
    await expect(wfp.headerPublish, 'Header: Publish Version').toHaveCount(1);
  });

  /** Publishes the draft `number` expecting a refusal; returns the message and the versions afterwards. */
  async function refusedPublish(wfp, page, testInfo, record, number) {
    const opened = await wfp.openPublish(number);
    const result = await wfp.confirm(opened);
    await snap(page, testInfo, 'refused');
    const cards = await wfp.reloadCards(record.id);
    await observe(testInfo, `Result: ${result.text || '(no message)'}; versions: ${summary(cards)}`);
    return { text: result.text, cards };
  }

  test(tcTitle(c.noSteps), tcDetails(c.noSteps, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.noSteps
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1 (no steps)' });
    const { text, cards } = await refusedPublish(wfp, page, testInfo, record, 1);
    expect(summary(cards), 'Not published').toBe('v1 Draft');
    expect(text, 'Workflow Step Required message').toMatch(TEXT.stepRequired);
  });

  test(tcTitle(c.noStage), tcDetails(c.noStage, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.noStage
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 1 (no Default Service Stage)' });
    expect((await wfp.detailsValues()).defaultStage, 'Precondition: no Default Service Stage').toBe('');
    const { text, cards } = await refusedPublish(wfp, page, testInfo, record, 1);
    expect(summary(cards), 'Not published').toBe('v1 Draft');
    expect(text, 'Default Service Stage Required message').toMatch(TEXT.stageRequired);
  });

  test(tcTitle(c.terminalStage), tcDetails(c.terminalStage, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.terminalStage
    await start(wfp, testInfo, tc, { 'Terminal Stage': TEXT.terminalStage });
    await wfp.openTab('Details');
    const defaults = await wfp.stageOptions();
    await wfp.openWorkSteps();
    await wfp.openNewStep();
    const stepStages = await wfp.stageOptions(wfp.stepForm.locator('#ServiceStageIDF'));
    await wfp.closeDrawer();
    await observe(testInfo, `Default Service Stage options: ${defaults.join(', ')} | step stages: ${stepStages.join(', ')}`);
    expect(stepStages, `"${TEXT.terminalStage}" exists (offered for steps)`).toContain(TEXT.terminalStage);
    expect(defaults, `"${TEXT.terminalStage}" not offered as Default Service Stage`).not.toContain(TEXT.terminalStage);
  });

  test(tcTitle(c.selfDependency), tcDetails(c.selfDependency, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.selfDependency
    const record = await start(wfp, testInfo, tc, { 'Gate Opened': `Start gate of "${CONFIGURE}"` });
    await wfp.openTemplate(record.id);
    await wfp.openWorkSteps();
    await wfp.openGate(CONFIGURE, 'start');
    const g = await wfp.readGate();
    await snap(page, testInfo, 'gate-self');
    const self = g.rows.find(r => r.name === CONFIGURE);
    await observe(testInfo, `Own row: ${JSON.stringify(self)}`);
    expect(self.dependent, 'Own row is the dependent step').toBe(true);
    expect(self.badge, `"${TEXT.dependentBadge}"`).toBe(TEXT.dependentBadge);
    expect(self.hasChoice, 'Cannot select itself as prerequisite').toBe(false);
    await wfp.closeDrawer();
  });

  test(tcTitle(c.circular), tcDetails(c.circular, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.circular
    const record = await start(wfp, testInfo, tc, { 'First Dependency': `${CONFIGURE} requires ${INTAKE}`, 'Second Dependency': `${INTAKE} requires ${CONFIGURE} (circular)` });
    await wfp.openTemplate(record.id);
    await wfp.openWorkSteps();
    await saveGate(wfp, CONFIGURE, [{ step: INTAKE, selection: 'Required', condition: 'Completed' }]);
    const circular = await test.step(`${INTAKE} requires ${CONFIGURE} (circular)`, async () => {
      await wfp.openGate(INTAKE, 'start');
      await wfp.setDependency(CONFIGURE, 'Required', 'Completed');
      return wfp.saveGate();
    });
    await observe(testInfo, `Circular save: success=${circular.success}; ${circular.error || circular.message}`);
    await snap(page, testInfo, 'circular');
    expect(circular.success, 'Circular dependency refused').toBe(false);
    expect(`${circular.error}${circular.message}`, 'Message').toMatch(/\S/);
    await wfp.closeDrawer().catch(() => {});
    await wfp.openTemplate(record.id);
    const { result } = await wfp.publishVersion(1);
    await observe(testInfo, `Publish without the cycle: ${result.text}`);
    expect(summary(await wfp.reloadCards(record.id)), 'The valid draft is published').toBe('v1 Published');
  });

  test(tcTitle(c.singleOr), tcDetails(c.singleOr, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.singleOr
    const record = await start(wfp, testInfo, tc, { Gate: `Start gate of "${STEP_NAMES.VERIFY}"`, Alternatives: [INTAKE] });
    await wfp.openTemplate(record.id);
    await wfp.openWorkSteps();
    await wfp.openGate(STEP_NAMES.VERIFY, 'start');
    await wfp.setDependency(INTAKE, 'Alternative', 'Completed');
    const r = await wfp.saveGate();
    await observe(testInfo, `Save: success=${r.success}; ${r.error || r.message}`);
    await snap(page, testInfo, 'single-or');
    expect(r.success, 'A single OR dependency is refused').toBe(false);
    expect(`${r.error}${r.message}`, 'Message').toMatch(/\S/);
  });

  test(tcTitle(c.dependencies), tcDetails(c.dependencies, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.dependencies
    const record = await start(wfp, testInfo, tc, { Gates: tc.seed.gates.map(g => `${g.dependent} <- ${g.deps.map(d => `${d.step} (${d.selection}, ${d.condition})`).join(' / ')}`), Action: 'Publish Version 1' });
    const { result } = await wfp.publishVersion(1);
    await observe(testInfo, `Result: ${result.text}`);
    expect(result.text, 'Published message').toMatch(TEXT.published_msg);
    const cards = await wfp.reloadCards(record.id);
    expect(summary(cards), 'Published').toBe('v1 Published');
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.phaseGate), tcDetails(c.phaseGate, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.phaseGate
    const record = await start(wfp, testInfo, tc, { 'Phase Gate': `${tc.seed.phaseGate.step}: ${tc.seed.phaseGate.phase}`, Action: 'Publish Version 1' });
    const { result } = await wfp.publishVersion(1);
    await observe(testInfo, `Result: ${result.text}`);
    expect(result.text, 'Published message').toMatch(TEXT.published_msg);
    const cards = await wfp.reloadCards(record.id);
    expect(summary(cards), 'Published').toBe('v1 Published');
    await logChange(testInfo, tc, record, record.cards, cards);
  });

  test(tcTitle(c.blockedKeepsPublished), tcDetails(c.blockedKeepsPublished, MODULE), async ({ workflowPublishPage: wfp, page }, testInfo) => {
    const tc = c.blockedKeepsPublished
    const record = await start(wfp, testInfo, tc, { Action: 'Publish Version 2 (all steps deleted)' });
    expect(summary(record.cards), 'Setup').toBe('v1 Published, v2 Draft');
    const { text, cards } = await refusedPublish(wfp, page, testInfo, record, 2);
    expect(text, 'Workflow Step Required message').toMatch(TEXT.stepRequired);
    expect(summary(cards), 'Nothing changed').toBe('v1 Published, v2 Draft');
    expect(byNumber(cards, 1).id, 'Same published version').toBe(byNumber(record.cards, 1).id);
  });
});
