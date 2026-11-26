const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { MODULE, TEXT, SCENARIO, MAIN_STEPS, LINEAGE_STEPS, LINEAGE_V2, materializeCases: c } = require('../testData/materializeWorkflowData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues, recordCreated, recordUpdated, recordUrl } = require('../utils/testCase');

/**
 * Use case 63071 - Materialize Workflow for Service (module TASK).
 * Materialization has no screen of its own: it runs when a Deliverable (Service) is created with a workflow template
 * (62433) and when the Deliverable's workflow is changed (Change Workflow, 63073). These tests build the data through the
 * UI, trigger both paths and check the result on the Deliverable's Work Items tab and in the work item drawer.
 *
 * 26 test cases (TC_MW_001 - TC_MW_026):
 *   scenario A  materialization at Create Service - authoritative version, one work item per step, field mapping
 *               (name, description, role, hours, type, service), default status, empty assignee / due date, readiness
 *               after materialization, materialized dependencies (Completed / Started conditions), phase gate
 *               (BR-2, BR-5, BR-6, BR-8, BR-9)
 *   scenario B  Deliverable without a workflow template: nothing materialized, no error (AF-1)
 *   scenario C  Change Workflow to a new template version - lineage-token matching: only the new step is created, no
 *               duplicates, matched work items updated in place (name, hours) while status / assignee are kept,
 *               dependencies rebuilt, re-applying the same version creates nothing (BR-5, BR-8, BR-11, MF-1)
 *   validity    only templates valid for the Deliverable are offered (BR-4)
 * Not automated: AF-3 (no default work item status - a configuration fault), BR-10 transactional integrity and BR-1
 * (no permission of its own).
 *
 * ONE WORKER, in file order (mode 'default'; the npm scripts add --workers=1): each scenario's data (Deliverable Type,
 * workflow templates, Deliverables - see testData/materializeWorkflowData.js) is built once by the first test that needs
 * it and reused by the next tests; the readiness tests TC_MW_014 / 015 change the scenario A work items, so the order
 * matters. The built scenarios are saved in reports/.cache/materialize-<RUN_ID>.json: when a test fails and Playwright
 * restarts the worker, the next test reuses them instead of building them again. A scenario whose build was interrupted
 * is rebuilt with " R2", " R3", ... appended to its names, so it never collides with the records already created.
 * NO CLEANUP: every record stays in the sandbox and is listed in
 * reports/excel/materialize-workflow/Atlas_MaterializeWorkflow_<date>.xlsx.
 */

// Scenario data shared by the tests, kept on disk for this run (RUN_ID is the same for every worker of one run).
const CACHE_FILE = path.join(process.cwd(), 'reports', '.cache', `materialize-${env.runId}.json`);
const cache = (() => { try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; } })();
function saveCache() {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}
/** Counts the build attempts of a scenario; attempt 2+ gets " R<n>" on its names (the first attempt left records behind). */
function nextAttempt(key) {
  cache.attempts = cache.attempts || {};
  cache.attempts[key] = (cache.attempts[key] || 0) + 1;
  saveCache();
  return cache.attempts[key];
}
const suffixed = (text, n) => (n > 1 ? `${text} R${n}` : text);
const num = v => Number(String(v).replace(/[^\d.-]/g, ''));
const sorted = list => [...list].sort();
// readiness labels of the Work Items tab (observed): an item that may start shows "Ready to start" or "Ready to complete";
// one that may not shows "Not ready to start" (unmet prerequisite / phase gate) or "Temporarily blocked"
const isReady = label => /^Ready to (start|complete)$/i.test(label || '');

test.describe('Workflow - Materialize Workflow for Service (63071)', () => {
  test.describe.configure({ mode: 'default', timeout: 900_000 });

  // confirmed app defects (cases with `defect` in the test data: TC_MW_012 / 014 / 024) are expected to fail
  test.beforeEach(async ({}, testInfo) => knownDefectFor(testInfo, c));

  async function snap(page, testInfo, label) {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }

  async function observe(testInfo, text) {
    testInfo.annotations.push({ type: 'Observed', description: text });
  }

  async function logRecord(testInfo, tc, type, recordName, details, record) {
    await recordCreated(testInfo, MODULE, tc, { 'Record Type': type, Name: recordName, Details: details }, record);
    await recordUrl(testInfo, record.url, `${type} #${record.id}`);
  }

  // ================================================================== scenario builders (run once, reused)
  async function deliverableType(f, testInfo, tc) {
    if (cache.dt) return cache.dt;
    const n = nextAttempt('dt');
    const d = { ...SCENARIO.deliverableType, serviceItemName: suffixed(SCENARIO.deliverableType.serviceItemName, n),
      accountingId: n > 1 ? `${SCENARIO.deliverableType.accountingId}-R${n}` : SCENARIO.deliverableType.accountingId };
    cache.dt = await test.step(`Build the Deliverable Type "${d.serviceItemName}"`, async () => {
      await f.sie.gotoCreate();
      await f.sie.fillForm(d);
      const record = await f.sie.saveNew();
      await logRecord(testInfo, tc, 'Deliverable Type', d.serviceItemName, `${d.allowedBillingTypes.join(', ')}; ${d.unitOfMeasure}`, record);
      return { ...record, name: d.serviceItemName };
    });
    saveCache();
    return cache.dt;
  }

  /** Workflow template from scratch: stage, steps, gates, phase gate, published. */
  async function publishedTemplate(f, testInfo, tc, t, gates = [], phaseGate) {
    return test.step(`Build and publish the template "${t.templateName}"`, async () => {
      const wfe = f.wfe;
      await wfe.gotoList();
      await wfe.openWizard();
      await wfe.chooseMethod('scratch');
      await wfe.fillStandard({ templateName: t.templateName, description: t.description });
      expect(await wfe.submitStandard(), `"${t.templateName}" created`).toBe('created');
      const record = wfe.record();
      await wfe.fillDetails({ defaultStage: t.defaultStage });
      expect((await wfe.saveDetails()).outcome, 'Default Service Stage saved').toBe('saved');
      await wfe.openWorkSteps();
      for (const s of t.steps) await wfe.addStep(s);
      for (const g of gates) await saveGate(wfe, g.dependent, g.prerequisite, 'Required', g.condition);
      if (phaseGate) {
        await wfe.openGate(phaseGate.step, 'start');
        await wfe.setPhase(phaseGate.phase);
        const r = await wfe.saveGate();
        expect(r.success, `Phase gate saved (${r.error || r.message})`).toBe(true);
      }
      await wfe.publishDraft();
      await logRecord(testInfo, tc, 'Workflow Template', t.templateName,
        `Published v1; steps: ${t.steps.map(s => s.stepName).join(', ')}; gates: ${gates.map(g => `${g.dependent} <- ${g.prerequisite} (${g.condition})`).join('; ') || 'none'}${phaseGate ? `; phase gate ${phaseGate.step}: ${phaseGate.phase}` : ''}`, record);
      return { ...record, name: t.templateName };
    });
  }

  async function saveGate(wfe, dependent, prerequisite, selection, condition) {
    await wfe.openGate(dependent, 'start');
    await wfe.setDependency(prerequisite, selection, condition);
    const r = await wfe.saveGate();
    expect(r.success, `Gate of "${dependent}" saved (${r.error || r.message})`).toBe(true);
  }

  /** Deliverable Type -> Workflow Templates: the template becomes compatible (and the default). */
  async function makeCompatible(f, dtId, templateId, makeDefault) {
    await test.step(`Deliverable Type: template #${templateId} compatible${makeDefault ? ' + default' : ''}`, async () => {
      await f.sie.openEdit(dtId);
      await f.sie.openWorkflowTemplatesTab();
      await f.sie.setCompatible(templateId, true);
      if (makeDefault) await f.sie.setDefaultTemplate(templateId);
    });
  }

  /**
   * Project "Playwright MW Project <tag>" on the scenario account, status Active (the Add Project default). The scenario
   * Deliverables are created on it: a template with a project phase gate is refused without a project ("Workflow template
   * requires a project"), and on the account's existing project "Initial" (status Draft) every work item showed
   * "Temporarily blocked".
   */
  async function scenarioProject(f, testInfo, tc) {
    if (cache.P) return cache.P;
    const n = nextAttempt('P');
    const projectName = suffixed(SCENARIO.project.projectName, n);
    return test.step(`Create the Active project "${projectName}"`, async () => {
      const pp = f.pp;
      await pp.gotoCreate();
      const account = (await pp.accountOptions()).find(a => a.name === SCENARIO.account);
      if (!account) throw new Error(`Account "${SCENARIO.account}" is not offered on Add Project`);
      const values = await pp.fillForm({ projectName, accountId: account.id });
      expect(values.projectStatus, 'Project Status').toBe('Active');
      const record = await pp.submitNew();
      const phase = await pp.currentPhaseText().catch(() => '');
      await logRecord(testInfo, tc, 'Project', projectName,
        `Account ${values.account}; status ${values.projectStatus}; template ${values.templateVersion}; phase ${phase || 'none'}`, record);
      cache.P = { ...record, name: projectName, accountId: account.id, values, phase };
      saveCache();
      return cache.P;
    });
  }

  /** Add Deliverable on the scenario account (and the given project) with the Deliverable Type and template. */
  async function createDeliverable(f, testInfo, tc, { name, templateName, noTemplate = false, project = null }) {
    return test.step(`Create the Deliverable "${name}"`, async () => {
      const wip = f.wip;
      const dt = await deliverableType(f, testInfo, tc);
      let accountId = '';
      await expect(async () => {
        await wip.gotoCreate();
        accountId = await wip.account.locator('option').evaluateAll((os, n) => (os.find(o => o.text.trim() === n) || os.find(o => o.value) || {}).value, SCENARIO.account);
        await expect(wip.serviceItem.locator('option', { hasText: dt.name }), 'Deliverable Type offered').toHaveCount(1, { timeout: 5_000 });
      }).toPass({ timeout: 120_000, intervals: [5_000, 10_000] });
      const projects = await wip.selectAccount(accountId);
      if (project) {
        expect(projects.map(String), `Project "${project.name}" offered for the account`).toContain(String(project.id));
        await wip.selectProject(project.id);
      }
      await wip.selectItem(dt.name);
      if (templateName) await wip.chooseTemplate(templateName);
      if (noTemplate) {
        await wip.clearSelect(wip.template);
        await expect(wip.stage, 'Stage editable without a template').toBeEnabled();
      }
      await wip.serviceName.fill(name);
      if (!(await wip.stage.isDisabled())) await wip.pick(wip.stage, { text: SCENARIO.stage });
      const values = await wip.formValues();
      const record = await wip.submitNew();
      await logRecord(testInfo, tc, 'Deliverable', name,
        `Deliverable Type ${dt.name}; workflow ${values.templateVersion || 'none'}; account ${values.account}${values.project ? `; project ${values.project}` : ''}`, record);
      return { ...record, name, values };
    });
  }

  /** Scenario A: Main Flow template (published, compatible, default) and a Deliverable created with it. */
  async function scenarioA(f, testInfo, tc) {
    if (cache.A) return cache.A;
    const s = SCENARIO.main;
    const n = nextAttempt('A');
    const dt = await deliverableType(f, testInfo, tc);
    const tpl = await publishedTemplate(f, testInfo, tc, { ...s.template, templateName: suffixed(s.template.templateName, n) }, s.gates, s.phaseGate);
    await makeCompatible(f, dt.id, tpl.id, true);
    const project = await scenarioProject(f, testInfo, tc);
    const del = await createDeliverable(f, testInfo, tc, { name: suffixed(s.deliverable, n), templateName: tpl.name, project });
    cache.A = { dt, tpl, del, project };
    saveCache();
    return cache.A;
  }

  /** Scenario C: Lineage Flow v1 -> Deliverable (Plan In Progress, assigned) -> v2 published -> Change Workflow to v2. */
  async function scenarioC(f, testInfo, tc) {
    if (cache.C) return cache.C;
    const s = SCENARIO.lineage;
    const { wfe, wip } = f;
    const n = nextAttempt('C');
    const dt = await deliverableType(f, testInfo, tc);
    const tpl = await publishedTemplate(f, testInfo, tc, { ...s.template, templateName: suffixed(s.template.templateName, n) }, s.gates);
    await makeCompatible(f, dt.id, tpl.id, false);
    const project = await scenarioProject(f, testInfo, tc);
    const del = await createDeliverable(f, testInfo, tc, { name: suffixed(s.deliverable, n), templateName: tpl.name, project });
    await wip.openWorkItems(del.id);
    const user = (await wip.page.locator('#userMenu .user-name').first().textContent() || '').trim();
    await test.step(`Plan: status ${s.keptStatus}, assigned to ${user}`, () => wip.updateWorkItem(LINEAGE_STEPS.plan.stepName, { status: s.keptStatus, assignee: user }));
    await wip.openWorkItems(del.id);
    const itemsV1 = await wip.listWorkItems();
    const workflowV1 = await wip.currentWorkflow();

    await test.step('Template v2: Create Draft, rename Execute (7.5 h), drop its prerequisite, add Handover (needs Close), publish', async () => {
      await wfe.openTemplate(tpl.id);
      await wfe.openCreateDraft(1);
      await wfe.saveCreateDraft();
      await wfe.openWorkSteps();
      await wfe.openStep(LINEAGE_V2.renamed.from);
      await wfe.fillStep({ stepName: LINEAGE_V2.renamed.stepName, estimatedHours: LINEAGE_V2.renamed.estimatedHours });
      const saved = await wfe.saveStep();
      expect(saved.success, `Step renamed (${saved.message} ${saved.fieldErrors})`).toBe(true);
      await saveGate(wfe, LINEAGE_V2.renamed.stepName, LINEAGE_STEPS.plan.stepName, 'None');
      await wfe.addStep(LINEAGE_V2.added);
      await saveGate(wfe, s.v2Gate.dependent, s.v2Gate.prerequisite, 'Required', s.v2Gate.condition);
      await wfe.publishDraft();
      await recordUpdated(testInfo, MODULE, tc, { serviceName: tpl.name, versions: 'v1 Published', steps: Object.values(LINEAGE_STEPS).map(x => x.stepName).join(', ') },
        { serviceName: tpl.name, versions: 'v2 Published', steps: [LINEAGE_STEPS.plan.stepName, LINEAGE_V2.renamed.stepName, LINEAGE_STEPS.close.stepName, LINEAGE_V2.added.stepName].join(', ') }, tpl);
    });

    const { preview } = await test.step('Deliverable: Change Workflow to the new version', async () => {
      await wip.openWorkItems(del.id);
      await wip.openChangeWorkflow();
      const p = await wip.previewChange(tpl.name);
      await snap(wip.page, testInfo, 'change-workflow-confirmation');
      await wip.saveChange(del.id);
      return { preview: p };
    });
    const itemsV2 = await wip.listWorkItems();
    const workflowV2 = await wip.currentWorkflow();
    await recordUpdated(testInfo, MODULE, tc, { serviceName: del.name, workflow: workflowV1, workItems: itemsV1.map(w => w.name).join(', ') },
      { serviceName: del.name, workflow: workflowV2, workItems: itemsV2.map(w => w.name).join(', ') }, del);
    cache.C = { dt, tpl, del, user, itemsV1, itemsV2, preview, workflowV1, workflowV2 };
    saveCache();
    return cache.C;
  }

  /** Re-opens the Deliverable until `check(label)` holds for the work item (or 60 s pass); returns the last label. */
  async function readinessUntil(wip, serviceId, name, check, message) {
    let label = '';
    try {
      await expect.poll(async () => {
        await wip.openWorkItems(serviceId);
        label = await wip.readiness(name);
        return check(label);
      }, { timeout: 60_000, intervals: [3_000, 5_000, 10_000] }).toBe(true);
    } catch {
      throw new Error(`${message} - after 60 s "${name}" still shows "${label}"`);
    }
    return label;
  }

  const fx = ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }) => ({ sie: serviceItemEditPage, wfe: workflowTemplateEditPage, wip: workItemsPage, pp: projectPage });

  async function start(f, testInfo, tc, scenario, values = {}) {
    await applyAllureLabels(tc, MODULE);
    const data = await scenario(f, testInfo, tc);
    await recordTestValues(testInfo, {
      'Deliverable Type': data.dt.name, 'Workflow Template': data.tpl.name, Deliverable: `${data.del.name} (#${data.del.id})`, ...values,
    });
    await recordUrl(testInfo, data.del.url || `/Service/Edit/${data.del.id}`, `Deliverable #${data.del.id}`);
    await f.wip.openWorkItems(data.del.id);
    return data;
  }

  const mainSteps = Object.values(MAIN_STEPS);

  // ================================================================== scenario A - materialization at Create Service
  test(tcTitle(c.governed), tcDetails(c.governed, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const A = await start(f, testInfo, c.governed, scenarioA);
    const current = await f.wip.currentWorkflow();
    await observe(testInfo, `Current workflow: ${current}`);
    expect(current, 'Authoritative template version').toMatch(new RegExp(`^${A.tpl.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\\s*v\\.?\\s*1$`));
  });

  test(tcTitle(c.count), tcDetails(c.count, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    await start(f, testInfo, c.count, scenarioA, { 'Workflow Steps': mainSteps.length });
    await snap(f.wip.page, testInfo, 'work-items');
    const items = await f.wip.listWorkItems();
    await observe(testInfo, `Work items: ${items.map(w => w.name).join(', ')}`);
    expect(items, 'One work item per step').toHaveLength(mainSteps.length);
  });

  test(tcTitle(c.names), tcDetails(c.names, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    await start(f, testInfo, c.names, scenarioA, { 'Step Names': mainSteps.map(s => s.stepName) });
    expect(sorted((await f.wip.listWorkItems()).map(w => w.name)), 'Names = step names').toEqual(sorted(mainSteps.map(s => s.stepName)));
  });

  for (const [tc, field, label, expected] of [
    [c.descriptions, 'description', 'Description', s => s.description],
    [c.roles, 'role', 'Staff Role', s => s.staffRole],
    [c.hours, 'estimatedHours', 'Estimated Hours', s => s.estimatedHours],
    [c.status, 'status', 'Status', () => TEXT.defaultStatus],
    [c.types, 'workItemType', 'Work Item Type', s => TEXT.workItemType[s.workItemType]],
  ]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
      const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
      await start(f, testInfo, tc, scenarioA, { [`Expected ${label}`]: mainSteps.map(s => `${s.stepName}: ${expected(s)}`) });
      const shown = [];
      for (const s of mainSteps) {
        const v = await f.wip.readWorkItem(s.stepName);
        shown.push(`${s.stepName}: ${v[field]}`);
        if (field === 'estimatedHours') expect(num(v[field]), `${s.stepName} - ${label}`).toBe(num(expected(s)));
        else expect(v[field], `${s.stepName} - ${label}`).toBe(expected(s));
      }
      await observe(testInfo, shown.join(' | '));
    });
  }

  test(tcTitle(c.blankFields), tcDetails(c.blankFields, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    await start(f, testInfo, c.blankFields, scenarioA);
    for (const s of mainSteps) {
      const v = await f.wip.readWorkItem(s.stepName);
      expect(v.assignee, `${s.stepName} - no assignee`).toBe('');
      expect(v.dueDate, `${s.stepName} - no due date`).toBe('');
    }
  });

  test(tcTitle(c.service), tcDetails(c.service, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const A = await start(f, testInfo, c.service, scenarioA);
    for (const s of mainSteps) expect((await f.wip.readWorkItem(s.stepName)).serviceId, `${s.stepName} - Deliverable`).toBe(String(A.del.id));
  });

  test(tcTitle(c.readyNoPrereq), tcDetails(c.readyNoPrereq, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    await start(f, testInfo, c.readyNoPrereq, scenarioA, { Step: MAIN_STEPS.kickoff.stepName });
    const items = await f.wip.listWorkItems();
    await observe(testInfo, `Readiness: ${items.map(w => `${w.name}=${w.readiness}`).join(', ')}`);
    const kickoff = items.find(w => w.name === MAIN_STEPS.kickoff.stepName)?.readiness;
    expect(isReady(kickoff), `Kickoff may start (shown: "${kickoff}")`).toBe(true);
  });

  test(tcTitle(c.notReadyDependent), tcDetails(c.notReadyDependent, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    await start(f, testInfo, c.notReadyDependent, scenarioA, { Dependencies: SCENARIO.main.gates.map(g => `${g.dependent} <- ${g.prerequisite} ${g.condition}`) });
    const items = await f.wip.listWorkItems();
    await observe(testInfo, `Readiness: ${items.map(w => `${w.name}=${w.readiness}`).join(', ')}`);
    const build = await f.wip.readiness(MAIN_STEPS.build.stepName);
    const review = await f.wip.readiness(MAIN_STEPS.review.stepName);
    expect(isReady(build), `Build (needs Kickoff Completed) may not start (shown: "${build}")`).toBe(false);
    expect(isReady(review), `Review (needs Build Started) may not start (shown: "${review}")`).toBe(false);
  });

  test(tcTitle(c.phaseGate), tcDetails(c.phaseGate, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const A = await start(f, testInfo, c.phaseGate, scenarioA, { Step: MAIN_STEPS.signoff.stepName, 'Phase Gate': SCENARIO.main.phaseGate.phase });
    const readiness = await f.wip.readiness(MAIN_STEPS.signoff.stepName);
    const kickoff = await f.wip.readiness(MAIN_STEPS.kickoff.stepName);
    await observe(testInfo, `Sign-off (phase gate ${SCENARIO.main.phaseGate.phase}, no prerequisite): ${readiness}; Kickoff (no gate): ${kickoff}; project: ${A.del.values.project || 'none'}`);
    expect(isReady(readiness), `Sign-off waits for the project phase "${SCENARIO.main.phaseGate.phase}" (shown: "${readiness}")`).toBe(false);
  });

  test(tcTitle(c.completedCondition), tcDetails(c.completedCondition, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const A = await start(f, testInfo, c.completedCondition, scenarioA, { Change: `${MAIN_STEPS.kickoff.stepName} -> ${TEXT.completed}` });
    await f.wip.updateWorkItem(MAIN_STEPS.kickoff.stepName, { status: TEXT.completed });
    await readinessUntil(f.wip, A.del.id, MAIN_STEPS.build.stepName, isReady, 'Build released once Kickoff is Completed');
    await snap(f.wip.page, testInfo, 'after-kickoff-completed');
    // recorded before the Review check (a known defect), so the workbook keeps the update
    await recordUpdated(testInfo, MODULE, c.completedCondition, { serviceName: A.del.name, workItem: `${MAIN_STEPS.kickoff.stepName}: ${TEXT.defaultStatus}` },
      { serviceName: A.del.name, workItem: `${MAIN_STEPS.kickoff.stepName}: ${TEXT.completed}` }, A.del);
    const review = await f.wip.readiness(MAIN_STEPS.review.stepName);
    expect(isReady(review), `Review still waits for Build to start (shown: "${review}")`).toBe(false);
  });

  test(tcTitle(c.startedCondition), tcDetails(c.startedCondition, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const A = await start(f, testInfo, c.startedCondition, scenarioA, { Change: `${MAIN_STEPS.build.stepName} -> In Progress` });
    if ((await f.wip.readWorkItem(MAIN_STEPS.kickoff.stepName)).status !== TEXT.completed) {
      await f.wip.updateWorkItem(MAIN_STEPS.kickoff.stepName, { status: TEXT.completed });   // scenario rebuilt after a failure
    }
    await f.wip.updateWorkItem(MAIN_STEPS.build.stepName, { status: 'In Progress' });
    await readinessUntil(f.wip, A.del.id, MAIN_STEPS.review.stepName, isReady, 'Review released once Build is started');
    await snap(f.wip.page, testInfo, 'after-build-started');
    await recordUpdated(testInfo, MODULE, c.startedCondition, { serviceName: A.del.name, workItem: `${MAIN_STEPS.build.stepName}: ${TEXT.defaultStatus}` },
      { serviceName: A.del.name, workItem: `${MAIN_STEPS.build.stepName}: In Progress` }, A.del);
  });

  // ================================================================== scenario B - no workflow template (AF-1)
  test(tcTitle(c.noWorkflow), tcDetails(c.noWorkflow, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const tc = c.noWorkflow;
    await applyAllureLabels(tc, MODULE);
    await scenarioA(f, testInfo, tc);   // the Deliverable Type then has a default template, which is removed on the form
    await recordTestValues(testInfo, { 'Deliverable Type': cache.dt.name, Deliverable: SCENARIO.noWorkflow.deliverable, 'Workflow Template': '(removed before Save)' });
    const del = await createDeliverable(f, testInfo, tc, { name: SCENARIO.noWorkflow.deliverable, noTemplate: true });
    await f.wip.openWorkItems(del.id);
    await snap(f.wip.page, testInfo, 'no-workflow');
    expect(await f.wip.listWorkItems(), 'No work items').toEqual([]);
    // the page shows "—" when the Deliverable has no workflow
    expect(['', '—', '-'], 'No workflow').toContain((await f.wip.currentWorkflow()).trim());
    await expect(f.wip.page.locator('#alert-js-error .alert, .alert-danger').filter({ visible: true }), 'No error shown').toHaveCount(0);
  });

  // ================================================================== scenario C - re-materialization / lineage tokens
  const v2Names = [LINEAGE_STEPS.plan.stepName, LINEAGE_V2.renamed.stepName, LINEAGE_STEPS.close.stepName, LINEAGE_V2.added.stepName];

  test(tcTitle(c.preview), tcDetails(c.preview, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const C = await start(f, testInfo, c.preview, scenarioC, { 'v2 Steps': v2Names });
    await observe(testInfo, `Preview: ${JSON.stringify({ create: C.preview.workItemsToCreateCount, touched: C.preview.touchedCount, untouched: C.preview.untouchedCount, steps: C.preview.newStepCount, info: C.preview.info })}`);
    expect(C.preview.newStepCount, 'v2 has 4 steps').toBe(4);
    expect(C.preview.workItemsToCreateCount, 'Only the new step is created').toBe(1);
  });

  test(tcTitle(c.noDuplicates), tcDetails(c.noDuplicates, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const C = await start(f, testInfo, c.noDuplicates, scenarioC, { 'Work Items Before': C_names(cache.C && cache.C.itemsV1) });
    const items = await f.wip.listWorkItems();
    await observe(testInfo, `Before: ${C.itemsV1.map(w => w.name).join(', ')} | after: ${items.map(w => w.name).join(', ')}`);
    expect(items, 'One work item per v2 step').toHaveLength(4);
    expect(sorted(items.map(w => w.name)), 'v2 names').toEqual(sorted(v2Names));
    expect(new Set(items.map(w => w.id)).size, 'Distinct work items').toBe(4);
  });

  test(tcTitle(c.sameRecord), tcDetails(c.sameRecord, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const C = await start(f, testInfo, c.sameRecord, scenarioC, { 'Old Name': LINEAGE_V2.renamed.from, 'New Name': LINEAGE_V2.renamed.stepName });
    const before = C.itemsV1.find(w => w.name === LINEAGE_V2.renamed.from);
    const after = (await f.wip.listWorkItems()).find(w => w.name === LINEAGE_V2.renamed.stepName);
    expect(after, `"${LINEAGE_V2.renamed.stepName}" listed`).toBeTruthy();
    await observe(testInfo, `Work item #${before.id} "${before.name}" -> #${after.id} "${after.name}"`);
    expect(after.id, 'Same work item updated in place (BR-11)').toBe(before.id);
    expect((await f.wip.listWorkItems()).map(w => w.name), 'Old name gone').not.toContain(LINEAGE_V2.renamed.from);
  });

  test(tcTitle(c.updatedHours), tcDetails(c.updatedHours, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    await start(f, testInfo, c.updatedHours, scenarioC, { 'v1 Hours': LINEAGE_STEPS.execute.estimatedHours, 'v2 Hours': LINEAGE_V2.renamed.estimatedHours });
    expect(num((await f.wip.readWorkItem(LINEAGE_V2.renamed.stepName)).estimatedHours), 'Estimated Hours').toBe(num(LINEAGE_V2.renamed.estimatedHours));
  });

  test(tcTitle(c.keptFields), tcDetails(c.keptFields, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const C = await start(f, testInfo, c.keptFields, scenarioC, { 'Work Item': LINEAGE_STEPS.plan.stepName, 'Status Before': SCENARIO.lineage.keptStatus });
    const v = await f.wip.readWorkItem(LINEAGE_STEPS.plan.stepName);
    await observe(testInfo, `Plan after the change: status ${v.status}, assignee ${v.assignee}`);
    expect(v.status, 'Status kept').toBe(SCENARIO.lineage.keptStatus);
    if (C.user) expect(v.assignee, 'Assignee kept').toBe(C.user);
  });

  test(tcTitle(c.newItem), tcDetails(c.newItem, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    await start(f, testInfo, c.newItem, scenarioC, { 'New Step': `${LINEAGE_V2.added.stepName} (${LINEAGE_V2.added.staffRole}, ${LINEAGE_V2.added.estimatedHours} h)` });
    const v = await f.wip.readWorkItem(LINEAGE_V2.added.stepName);
    expect(v.status, 'Default status').toBe(TEXT.defaultStatus);
    expect(v.role, 'Staff Role').toBe(LINEAGE_V2.added.staffRole);
    expect(num(v.estimatedHours), 'Estimated Hours').toBe(num(LINEAGE_V2.added.estimatedHours));
    expect(v.assignee, 'No assignee').toBe('');
  });

  test(tcTitle(c.governedV2), tcDetails(c.governedV2, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const C = await start(f, testInfo, c.governedV2, scenarioC);
    const current = await f.wip.currentWorkflow();
    await observe(testInfo, `Workflow: ${C.workflowV1} -> ${current}`);
    expect(current, 'Governed by v2').toMatch(/v\.?\s*2$/);
    expect(current, 'Same template').toContain(C.tpl.name);
  });

  test(tcTitle(c.dependenciesRebuilt), tcDetails(c.dependenciesRebuilt, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    await start(f, testInfo, c.dependenciesRebuilt, scenarioC, { 'v1 Dependency': `${LINEAGE_STEPS.execute.stepName} <- ${LINEAGE_STEPS.plan.stepName}`, 'v2 Dependency': `${LINEAGE_V2.added.stepName} <- ${LINEAGE_STEPS.close.stepName}` });
    const items = await f.wip.listWorkItems();
    await observe(testInfo, `Readiness: ${items.map(w => `${w.name}=${w.readiness}`).join(', ')}`);
    const renamed = await f.wip.readiness(LINEAGE_V2.renamed.stepName);
    expect(isReady(renamed), `${LINEAGE_V2.renamed.stepName}: v1 prerequisite removed, may start (shown: "${renamed}")`).toBe(true);
    await readinessUntil(f.wip, cache.C.del.id, LINEAGE_V2.added.stepName, l => !isReady(l),
      `${LINEAGE_V2.added.stepName}: the v2 prerequisite (${LINEAGE_STEPS.close.stepName} Completed) is materialized, so it may not start while ${LINEAGE_STEPS.close.stepName} is not completed`);
  });

  test(tcTitle(c.reapply), tcDetails(c.reapply, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const C = await start(f, testInfo, c.reapply, scenarioC);
    const before = await f.wip.listWorkItems();
    // Change Workflow never lists the template that already governs the Deliverable (observed), so the same version cannot
    // be applied again from the screen; the server's preview for it (read-only GET) must announce nothing to create
    await f.wip.openChangeWorkflow();
    const offered = await f.wip.offeredTemplates();
    await f.wip.cancelChange();
    const preview = await f.wip.previewFor(C.del.id, C.tpl.id);
    await observe(testInfo, `Offered: ${offered.join(', ') || '(none)'}; preview for the current version: ${JSON.stringify({ create: preview.workItemsToCreateCount, touched: preview.touchedCount, untouched: preview.untouchedCount, steps: preview.newStepCount })}`);
    expect(offered, 'The governing template is not offered again').not.toContain(C.tpl.name);
    expect(preview.workItemsToCreateCount, 'Re-materializing the same version would create nothing').toBe(0);
    await f.wip.openWorkItems(C.del.id);
    expect(sorted((await f.wip.listWorkItems()).map(w => w.id)), 'Work items unchanged').toEqual(sorted(before.map(w => w.id)));
  });

  // ================================================================== BR-4 validity
  test(tcTitle(c.validity), tcDetails(c.validity, MODULE), async ({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage }, testInfo) => {
    const f = fx({ serviceItemEditPage, workflowTemplateEditPage, workItemsPage, projectPage });
    const tc = c.validity;
    const A = await start(f, testInfo, tc, scenarioA, { 'Incompatible Template': tc.incompatible });
    await f.wip.openChangeWorkflow();
    const offered = await f.wip.offeredTemplates();
    await observe(testInfo, `Offered: ${offered.join(', ')}`);
    await snap(f.wip.page, testInfo, 'change-workflow-list');
    await f.wip.cancelChange();
    // the list holds the OTHER compatible templates: the one governing this Deliverable (Main Flow) is not repeated (observed)
    expect(offered, 'The governing template is not repeated').not.toContain(A.tpl.name);
    if (cache.C) expect(offered, 'The other compatible template (Lineage Flow) is offered').toContain(cache.C.tpl.name);
    expect(offered, `"${tc.incompatible}" (not compatible) not offered`).not.toContain(tc.incompatible);
  });
});

function C_names(items) {
  return items ? items.map(w => w.name) : '(built by this test)';
}
