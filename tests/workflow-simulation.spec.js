// Simulate Workflow Template Version (module TASK, docs/63102 Simulate Workflow Template Version Use Case.md).
// Uses the authenticated storageState from the setup project. Screen: Settings > Workflow Templates > template > Work Steps > Simulate.
// The simulation is read-only (BR-14): nothing is created, so no cleanup is needed and the cases can run in parallel.
//
// Not automated: alternative (OR) prerequisite sets (no sandbox template has one), the "unsaved changes" rule (BR-2) and the
// isActive / IsDeleted catalog filters (BR-6, BR-7, BR-15) - they need an editable draft or catalog changes.

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, TEMPLATE, STEPS, DATA, cases: c } = require('../testData/workflowSimulationData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefectFor, recordTestValues, recordUrl } = require('../utils/testCase');

const S = DATA.states;
const allSteps = state => Array(STEPS.length).fill(state);

test.describe('Simulate Workflow Template Version', () => {
  // read-only simulation: a retry on the slow, shared sandbox cannot create duplicates
  test.describe.configure({ timeout: 180_000, retries: 1 });

  test.beforeEach(async ({ workflowSimulationPage: p }, testInfo) => {
    knownDefectFor(testInfo, c); // confirmed app defects (cases with `defect`) are expected to fail
    await p.goto(TEMPLATE.id);
  });

  // ================= MF-1: open =================
  test(tcTitle(c.simulateButton), tcDetails(c.simulateButton, MODULE), async ({ workflowSimulationPage: p, page }, testInfo) => {
    await applyAllureLabels(c.simulateButton, MODULE);
    await recordUrl(testInfo, page.url(), 'Workflow template');
    await p.worksStepsTab.click();
    await expect(p.simulateButton).toBeVisible();
    await expect(p.simulateButton).toBeEnabled();
  });

  test(tcTitle(c.openSimulation), tcDetails(c.openSimulation, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.openSimulation, MODULE);
    await p.openSimulation();
    await expect(p.dialog).toBeVisible();
    await expect(p.title).toHaveText(DATA.title);
    await expect(p.subtitle).toHaveText(TEMPLATE.subtitle);
  });

  test(tcTitle(c.versionHeader), tcDetails(c.versionHeader, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.versionHeader, MODULE);
    const shown = (await p.versionLabel.innerText()).match(/\d+/)[0];
    await p.openSimulation();
    await expect(p.subtitle).toContainText(`v${shown} (`);
  });

  test(tcTitle(c.stepsListed), tcDetails(c.stepsListed, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.stepsListed, MODULE);
    await p.openSimulation();
    await expect(p.steps).toHaveCount(STEPS.length);
    expect(await p.stepNames()).toEqual(STEPS.map(s => s.name));
  });

  test(tcTitle(c.initialStepStatus), tcDetails(c.initialStepStatus, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.initialStepStatus, MODULE);
    await p.openSimulation();
    expect(await p.stepStatuses()).toEqual(allSteps(DATA.defaultStepStatus));
  });

  test(tcTitle(c.stepStatusOptions), tcDetails(c.stepStatusOptions, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.stepStatusOptions, MODULE);
    await p.openSimulation();
    for (let i = 0; i < STEPS.length; i++) expect(await p.optionTexts(p.stepStatus(i)), `statuses of step ${i + 1}`).toEqual(DATA.stepStatuses);
  });

  test(tcTitle(c.governingOptions), tcDetails(c.governingOptions, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.governingOptions, MODULE);
    await p.openSimulation();
    expect(await p.optionTexts(p.accountStatus), 'Account Status').toEqual(DATA.accountStatuses);
    expect(await p.optionTexts(p.projectStatus), 'Project Status').toEqual(DATA.projectStatuses);
    expect(await p.optionTexts(p.serviceStatus), 'Service Status').toEqual(DATA.serviceStatuses);
  });

  test(tcTitle(c.governingInitial), tcDetails(c.governingInitial, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.governingInitial, MODULE);
    await p.openSimulation();
    expect(await p.selected(p.accountStatus)).toBe(DATA.initialGoverning.account);
    expect(await p.selected(p.projectStatus)).toBe(DATA.initialGoverning.project);
    expect(await p.selected(p.serviceStatus)).toBe(DATA.initialGoverning.service);
  });

  test(tcTitle(c.phaseOptions), tcDetails(c.phaseOptions, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.phaseOptions, MODULE);
    await p.openSimulation();
    const options = await p.optionTexts(p.projectPhase);
    expect(options.filter(o => o !== 'None')).toEqual(DATA.phases);
  });

  test(tcTitle(c.phaseInitialNone), tcDetails(c.phaseInitialNone, MODULE), async ({ workflowSimulationPage: p }, testInfo) => {
    await applyAllureLabels(c.phaseInitialNone, MODULE);
    await p.openSimulation();
    await recordTestValues(testInfo, { 'Phase options': (await p.optionTexts(p.projectPhase)).join(', '), 'Selected phase': await p.selected(p.projectPhase) });
    expect(await p.optionTexts(p.projectPhase)).toContain(DATA.initialPhase);
    expect(await p.selected(p.projectPhase)).toBe(DATA.initialPhase);
  });

  test(tcTitle(c.initialIndicators), tcDetails(c.initialIndicators, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.initialIndicators, MODULE);
    await p.openSimulation();
    const states = await p.states();
    expect(states).toHaveLength(STEPS.length);
    expect(states[0], 'step without prerequisites').not.toBe(S.notReady);
    expect(states.slice(1), 'steps with prerequisites').toEqual(allSteps(S.notReady).slice(1));
  });

  // ================= MF-2: change a step status =================
  test(tcTitle(c.completeUnlocksNext), tcDetails(c.completeUnlocksNext, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.completeUnlocksNext, MODULE);
    await p.openSimulation();
    expect(await p.state(1)).toBe(S.notReady);
    await p.setStepStatus(0, 'Completed');
    expect(await p.state(0)).toBe(S.completed);
    expect(await p.state(1)).toBe(S.readyComplete);
    expect(await p.state(2), 'step 3 still waits for step 2').toBe(S.notReady);
  });

  test(tcTitle(c.skippedCompletes), tcDetails(c.skippedCompletes, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.skippedCompletes, MODULE);
    await p.openSimulation();
    await p.setStepStatus(0, 'Skipped');
    expect(await p.state(0)).toBe(S.completed);
    expect(await p.state(1)).not.toBe(S.notReady);
  });

  test(tcTitle(c.inProgressNotCompleted), tcDetails(c.inProgressNotCompleted, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.inProgressNotCompleted, MODULE);
    await p.openSimulation();
    await p.setStepStatus(0, 'In Progress');
    expect(await p.state(1)).toBe(S.notReady);
  });

  test(tcTitle(c.onHoldBlocked), tcDetails(c.onHoldBlocked, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.onHoldBlocked, MODULE);
    await p.openSimulation();
    await p.setStepStatus(0, 'On Hold');
    expect(await p.state(0)).toBe(S.blocked);
    expect(await p.stepStatuses()).toEqual(['On Hold', ...Array(STEPS.length - 1).fill(DATA.defaultStepStatus)]);
  });

  test(tcTitle(c.recalculateAll), tcDetails(c.recalculateAll, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.recalculateAll, MODULE);
    await p.openSimulation();
    await p.setStepStatus(0, 'Completed');
    await p.setStepStatus(1, 'Completed');
    expect((await p.states()).slice(0, 3)).toEqual([S.completed, S.completed, S.readyComplete]);
    expect((await p.states()).slice(3)).toEqual(allSteps(S.notReady).slice(3));
    await p.setStepStatus(0, 'Not Started');
    const after = await p.states();
    expect(after[1], 'completed step 2 stays completed').toBe(S.completed);
    expect(after[2], 'step 3 follows step 2').toBe(S.readyComplete);
  });

  // ================= MF-5 / BR-12: unmet reasons =================
  test(tcTitle(c.unmetRequired), tcDetails(c.unmetRequired, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.unmetRequired, MODULE);
    await p.openSimulation();
    const e = await p.explanation(1);
    expect(e.status).toBe(DATA.labels.notReady);
    expect(e.leadin).toContain(`"${STEPS[1].name}" can start when all of the following are satisfied`);
    expect(e.headings).toContain(DATA.labels.requiredHeading);
    expect(e.items).toEqual([`"${STEPS[0].name}" has completed`]);
  });

  test(tcTitle(c.unmetMultiple), tcDetails(c.unmetMultiple, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.unmetMultiple, MODULE);
    await p.openSimulation();
    const e = await p.explanation(4);
    expect(e.items).toEqual(STEPS[4].prerequisites.map(n => `"${n}" has completed`));
  });

  test(tcTitle(c.unmetDisappears), tcDetails(c.unmetDisappears, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.unmetDisappears, MODULE);
    await p.openSimulation();
    await p.expand(4);
    await expect(p.unmetItems(4)).toHaveCount(2);
    await p.setStepStatus(2, 'Completed');
    await expect(p.unmetItems(4)).toHaveText([`"${STEPS[4].prerequisites[1]}" has completed`]);
  });

  // ================= MF-3 / BR-7: project phase =================
  test(tcTitle(c.phaseGateText), tcDetails(c.phaseGateText, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.phaseGateText, MODULE);
    await p.openSimulation();
    await p.completeFirst(STEPS.length - 1);
    await p.setProjectPhase(DATA.phasesBelowGate[0]);
    const last = STEPS.length - 1;
    expect(await p.state(last)).toBe(S.notReady);
    const e = await p.explanation(last);
    expect(e.headings).toContain(DATA.labels.phaseHeading);
    expect(e.text).toContain(`The project has reached the "${DATA.gatedPhase}" phase`);
  });

  test(tcTitle(c.phaseGateSatisfied), tcDetails(c.phaseGateSatisfied, MODULE), async ({ workflowSimulationPage: p }, testInfo) => {
    await applyAllureLabels(c.phaseGateSatisfied, MODULE);
    await p.openSimulation();
    await p.completeFirst(STEPS.length - 1);
    const last = STEPS.length - 1;
    for (const phase of DATA.phasesBelowGate) {
      await p.setProjectPhase(phase);
      expect(await p.state(last), `phase ${phase}`).toBe(S.notReady);
    }
    await p.setProjectPhase(DATA.gatedPhase);
    expect(await p.state(last), `phase ${DATA.gatedPhase}`).toBe(S.readyComplete);
    await recordTestValues(testInfo, { 'Gated phase': DATA.gatedPhase, 'Phases below': DATA.phasesBelowGate.join(', ') });
  });

  test(tcTitle(c.phaseBackward), tcDetails(c.phaseBackward, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.phaseBackward, MODULE);
    await p.openSimulation();
    await p.completeFirst(STEPS.length - 1);
    const last = STEPS.length - 1;
    await p.setProjectPhase(DATA.gatedPhase);
    expect(await p.state(last)).toBe(S.readyComplete);
    await p.setProjectPhase('Design');
    expect(await p.state(last)).toBe(S.notReady);
    await p.setProjectPhase(DATA.gatedPhase);
    expect(await p.state(last)).toBe(S.readyComplete);
  });

  // ================= MF-3.5 / BR-15: governing statuses =================
  /** Sets one governing status for each value and checks the indicator of every step; restores Active afterwards. */
  async function checkGoverning(p, setter, values, expected) {
    for (const value of values) {
      await setter(value);
      expect(await p.states(), `status ${value}`).toEqual(allSteps(expected));
    }
  }

  test(tcTitle(c.accountBlocking), tcDetails(c.accountBlocking, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.accountBlocking, MODULE);
    await p.openSimulation();
    await checkGoverning(p, v => p.setAccountStatus(v), DATA.blockingAccount, S.blocked);
  });

  test(tcTitle(c.accountTerminal), tcDetails(c.accountTerminal, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.accountTerminal, MODULE);
    await p.openSimulation();
    await checkGoverning(p, v => p.setAccountStatus(v), DATA.terminalAccount, S.canceled);
  });

  test(tcTitle(c.projectBlocking), tcDetails(c.projectBlocking, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.projectBlocking, MODULE);
    await p.openSimulation();
    await checkGoverning(p, v => p.setProjectStatus(v), DATA.blockingProject, S.blocked);
  });

  test(tcTitle(c.projectTerminal), tcDetails(c.projectTerminal, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.projectTerminal, MODULE);
    await p.openSimulation();
    await checkGoverning(p, v => p.setProjectStatus(v), DATA.terminalProject, S.canceled);
  });

  test(tcTitle(c.serviceBlocking), tcDetails(c.serviceBlocking, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.serviceBlocking, MODULE);
    await p.openSimulation();
    await checkGoverning(p, v => p.setServiceStatus(v), DATA.blockingService, S.blocked);
  });

  test(tcTitle(c.serviceTerminal), tcDetails(c.serviceTerminal, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.serviceTerminal, MODULE);
    await p.openSimulation();
    await checkGoverning(p, v => p.setServiceStatus(v), DATA.terminalService, S.canceled);
  });

  test(tcTitle(c.governingIndependent), tcDetails(c.governingIndependent, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.governingIndependent, MODULE);
    await p.openSimulation();
    const before = await p.states();
    await p.setAccountStatus('On Hold');
    expect(await p.selected(p.projectStatus)).toBe('Active');
    expect(await p.selected(p.serviceStatus)).toBe('Active');
    await p.setProjectStatus('Draft');
    expect(await p.selected(p.accountStatus)).toBe('On Hold');
    expect(await p.selected(p.serviceStatus)).toBe('Active');
    await p.setAccountStatus('Active');
    expect(await p.states(), 'project Draft still blocks').toEqual(allSteps(S.blocked));
    await p.setProjectStatus('Active');
    expect(await p.states()).toEqual(before);
  });

  test(tcTitle(c.workItemStatusKept), tcDetails(c.workItemStatusKept, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.workItemStatusKept, MODULE);
    await p.openSimulation();
    await p.setStepStatus(0, 'Completed');
    await p.setAccountStatus('On Hold');
    expect((await p.stepStatuses())[0]).toBe('Completed');
    await p.setAccountStatus('Active');
    expect((await p.stepStatuses())[0]).toBe('Completed');
    expect(await p.state(0)).toBe(S.completed);
    expect(await p.state(1)).toBe(S.readyComplete);
  });

  test(tcTitle(c.governingAttribution), tcDetails(c.governingAttribution, MODULE), async ({ workflowSimulationPage: p }, testInfo) => {
    await applyAllureLabels(c.governingAttribution, MODULE);
    await p.openSimulation();
    await p.setAccountStatus('On Hold');
    const e = await p.explanation(0);
    await recordTestValues(testInfo, { 'Account Status': 'On Hold', 'Explanation': e.text });
    expect(e.status).toBe(DATA.labels.blocked);
    expect(e.text).toMatch(/account/i);
  });

  // ================= MF-5: explanation behaviour =================
  test(tcTitle(c.expandCollapse), tcDetails(c.expandCollapse, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.expandCollapse, MODULE);
    await p.openSimulation();
    expect(await p.isExpanded(1)).toBe(false);
    await p.stepRow(1).click();
    expect(await p.isExpanded(1)).toBe(true);
    await expect(p.stepDetails(1)).toBeVisible();
    await p.stepRow(1).click();
    expect(await p.isExpanded(1)).toBe(false);
  });

  test(tcTitle(c.anyStepExplained), tcDetails(c.anyStepExplained, MODULE), async ({ workflowSimulationPage: p }) => {
    await applyAllureLabels(c.anyStepExplained, MODULE);
    await p.openSimulation();
    const e = await p.explanation(0);
    expect(e.status).toBe(DATA.labels.readyComplete);
  });

  // ================= MF-6 / MF-7: reset and close =================
  test(tcTitle(c.reset), tcDetails(c.reset, MODULE), async ({ workflowSimulationPage: p, page }) => {
    await applyAllureLabels(c.reset, MODULE);
    await p.openSimulation();
    const initial = await p.states();
    await p.setStepStatus(0, 'Completed');
    await p.setProjectPhase(DATA.gatedPhase);
    await p.setServiceStatus('Pause');
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
    await p.reset();
    expect(dialogs, 'no browser confirmation').toEqual([]);
    await expect(p.openModals).toHaveCount(1); // only the simulation itself, no confirmation dialog
    expect(await p.stepStatuses()).toEqual(allSteps(DATA.defaultStepStatus));
    expect(await p.selected(p.serviceStatus)).toBe(DATA.initialGoverning.service);
    expect(await p.selected(p.accountStatus)).toBe(DATA.initialGoverning.account);
    expect(await p.selected(p.projectStatus)).toBe(DATA.initialGoverning.project);
    expect(await p.selected(p.projectPhase)).not.toBe(DATA.gatedPhase);
    expect(await p.states()).toEqual(initial);
  });

  test(tcTitle(c.closeDiscards), tcDetails(c.closeDiscards, MODULE), async ({ workflowSimulationPage: p, page }) => {
    await applyAllureLabels(c.closeDiscards, MODULE);
    await p.openSimulation();
    const initial = await p.states();
    await p.setStepStatus(0, 'Completed');
    await p.setAccountStatus('On Hold');
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
    await p.closeSimulation();
    expect(dialogs, 'no browser confirmation').toEqual([]);
    await p.openSimulation();
    expect(await p.stepStatuses()).toEqual(allSteps(DATA.defaultStepStatus));
    expect(await p.selected(p.accountStatus)).toBe(DATA.initialGoverning.account);
    expect(await p.states()).toEqual(initial);
  });

  // ================= BR-14 / DL-1: nothing is saved, no operational records =================
  test(tcTitle(c.noPersistence), tcDetails(c.noPersistence, MODULE), async ({ workflowSimulationPage: p, page }) => {
    await applyAllureLabels(c.noPersistence, MODULE);
    const writes = [];
    page.on('request', r => { if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && !/^\/(api\/session|hubs)\//.test(new URL(r.url()).pathname)) writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    await p.openSimulation();
    await p.setStepStatus(0, 'Completed');
    await p.setProjectPhase(DATA.gatedPhase);
    await p.setAccountStatus('On Hold');
    await p.reset();
    await p.closeSimulation();
    expect([...new Set(writes)], 'write requests').toEqual([DATA.evaluatePath].map(x => `POST ${x}`));
    await p.goto(TEMPLATE.id);
    await p.openSimulation();
    expect(await p.stepNames()).toEqual(STEPS.map(s => s.name));
  });

  test(tcTitle(c.noRecordsInRequest), tcDetails(c.noRecordsInRequest, MODULE), async ({ workflowSimulationPage: p }, testInfo) => {
    await applyAllureLabels(c.noRecordsInRequest, MODULE);
    await p.openSimulation();
    const response = await p.setAccountStatus('On Hold');
    const body = JSON.parse(response.request().postData());
    await recordTestValues(testInfo, { 'Request fields': Object.keys(body).join(', ') });
    expect(Object.keys(body).sort()).toEqual(
      ['currentAccountStatusID', 'currentProjectPhaseID', 'currentProjectStatusID', 'currentServiceStatusID', 'stepStatuses', 'workflowTemplateID', 'workflowTemplateVersionID'].sort());
    expect(Object.keys(body).filter(k => /^(account|project|service)(id|idf)$/i.test(k))).toEqual([]);
    expect(body.stepStatuses).toHaveLength(STEPS.length);
  });
});
