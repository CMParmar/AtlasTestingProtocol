const { test, expect } = require('../fixtures/fixtures');
const {
  MODULE, TABS, DATE_ORDER, TERMINAL_EDITABLE, TERMINAL_READONLY,
  projectUpdateCases, projectNegativeCases, projectUpdateExtraCases: c,
} = require('../testData/projectUpdateData');
const { ProjectEditPage } = require('../pages/project/projectEditPage');
const { resolveProjectAccount } = require('../utils/projectAccount');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordUpdated, recordUrl } = require('../utils/testCase');

/**
 * Use case 61967 - View & Edit Project (/Project/Edit/{id}).
 * Every test seeds its own project on the EXISTING project Account (PROJECT_ACCOUNT_ID, else the first
 * "Playwright Project Owner" / "Playwright" account - utils/projectAccount.js), then views / updates it.
 * Projects are NOT deleted; every updated project is listed with its previous and updated values and its URL in
 * reports/excel/project-update/Atlas_ProjectUpdate_<YYYY-MM-DD>.xlsx.
 * Terminal statuses come from the app (Project Status options with data-is-terminal="true": Completed, Canceled).
 *
 * Not automated: all permission scenarios (Test Cases 10-12, 19, 22, 44, 45 - need users without
 * PERM.SERV.Project.Update / Close / Reopen), the Close Project command and Reopen with override (MF-6.5, 62529 -
 * future requirements), MF-6 staff role display (future), the Services / WorkItems Effort and progress-bar rules
 * (Test Cases 23-36 - need services, work items and time entries with exact hours), ProjectStatusHistory columns
 * (ChangedAtUTC, isSystemGenerated - database only).
 */

/** Existing Account the projects are created on: { id, name, url }. */
let account;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  account = await resolveProjectAccount(browser);
});

const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const shown = data => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? '(empty)' : v]));
const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

/** A yyyy-mm-dd date that is today (the app uses the Account's time zone, so +/- 1 day). */
function expectToday(iso, what) {
  expect(iso, `${what} is set`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const days = Math.abs(Date.parse(`${iso}T12:00:00Z`) - Date.now()) / 86_400_000;
  expect(days, `${what} "${iso}" = today (Account time zone)`).toBeLessThanOrEqual(1.5);
}

/** Creates the project the test works on (status Active unless tc.seedStatus). Returns { id, url, before }. */
async function seedProject({ projectPage, projectEditPage }, testInfo, tc) {
  await applyAllureLabels(tc, MODULE);
  return test.step(`Seed: project "${tc.seed.projectName}" on Account "${account.name}"`, async () => {
    await projectPage.gotoCreate(account.id);
    await projectPage.fillForm({ projectName: tc.seed.projectName, accountId: account.id, details: tc.seed.details });
    if (tc.seedStatus) await projectEditPage.select(projectPage.projectStatus, tc.seedStatus);
    const record = await projectPage.submitNew();
    await expect(projectPage.recordAddedMessage, '"Your new record has been added."').toBeVisible();
    await projectEditPage.expectEditOpen();
    await recordUrl(testInfo, record.url, `Project #${record.id}`);
    return { ...record, before: await projectEditPage.values() };
  });
}

/** Edits (MF-2), saves (MF-7 / MF-8), logs previous vs saved values and re-opens. Returns the values after re-opening. */
async function editAndSave(projectEditPage, testInfo, tc, project, update, before = project.before) {
  await test.step(`Edit ${Object.keys(update).join(', ')} (MF-2)`, () => projectEditPage.update(update));
  await shot(projectEditPage.page, testInfo, 'edited-form');
  await test.step('Save (MF-7, MF-8)', () => projectEditPage.save());
  await recordUpdated(testInfo, MODULE, tc, before, await projectEditPage.values(), project);
  return test.step('Re-open the project', async () => {
    await projectEditPage.gotoEdit(project.id);
    return projectEditPage.values();
  });
}

/** Moves the project to a terminal status and saves it. Returns the values after re-opening. */
async function closeProject(projectEditPage, testInfo, tc, project, status = tc.close) {
  const closed = await editAndSave(projectEditPage, testInfo, tc, project, { projectStatus: status });
  expect(closed.projectStatus, `Project saved as ${status}`).toBe(status);
  return closed;
}

/** MF-1.5: every restricted field is read-only on a terminal project. */
async function expectTerminal(projectEditPage) {
  await test.step('Terminal state: restricted fields are read-only (MF-1.5)', async () => {
    for (const key of TERMINAL_READONLY) {
      expect(await projectEditPage.editable(key), `DEFECT: ${key} can still be edited on a terminal project`).toBe(false);
    }
  });
}

test.describe('Project - View & Edit Project (61967)', () => {
  // ---------- MF-1 view ----------
  test(tcTitle(c.view), tcDetails(c.view, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.view;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await test.step('Open the project (MF-1)', () => projectEditPage.gotoEdit(project.id));
    const values = await projectEditPage.values();
    await recordTestValues(testInfo, { url: project.url, ...shown(values) });
    const d = tc.seed.details;
    await projectEditPage.expectValues({
      projectName: tc.seed.projectName, projectCode: d.projectCode, projectStatus: 'Active', description: d.description,
      billingType: d.billingType, estimatedHours: d.estimatedHours, scheduledStart: d.scheduledStart, dueDate: d.dueDate,
    });
    await test.step('Edit Mode: fields and Save are enabled', async () => {
      for (const key of ['projectStatus', ...TERMINAL_EDITABLE, ...TERMINAL_READONLY]) {
        expect(await projectEditPage.editable(key), `${key} editable on an active project`).toBe(true);
      }
      await expect(projectEditPage.saveButton).toBeEnabled();
    });
    await shot(page, testInfo, 'viewed-project');
  });

  test(tcTitle(c.header), tcDetails(c.header, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, c.header);
    await projectEditPage.gotoEdit(project.id);
    const accountHref = new RegExp(`/Account/Edit/${account.id}(?:[/?#]|$)`);
    await expect(projectEditPage.accountNameLink, 'Account Name links to the owning Account').toHaveAttribute('href', accountHref);
    await expect(projectEditPage.accountNumberLink, 'Account Number links to the owning Account').toHaveAttribute('href', accountHref);
    await expect(projectEditPage.accountOwnerLink, 'Account Owner links to the owner record').toHaveAttribute('href', /\/(Company|Person)\/Edit\/\d+/);
    await recordTestValues(testInfo, {
      account: (await projectEditPage.accountNameLink.innerText()).trim(),
      'Account Owner': (await projectEditPage.accountOwnerLink.innerText()).trim(),
      'Account Number': (await projectEditPage.accountNumberLink.innerText()).trim(),
      'Account URL': account.url,
    });
  });

  test(tcTitle(c.tabs), tcDetails(c.tabs, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, c.tabs);
    await projectEditPage.gotoEdit(project.id);
    const names = await projectEditPage.tabNames();
    await recordTestValues(testInfo, { Tabs: names });
    for (const name of TABS) expect(names, `"${name}" tab`).toContain(name);
  });

  test(tcTitle(c.dateOrder), tcDetails(c.dateOrder, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, c.dateOrder);
    await projectEditPage.gotoEdit(project.id);
    const captions = await projectEditPage.dateCaptions();
    await recordTestValues(testInfo, { 'Date fields shown': captions.join(' > ') });
    expect(captions, 'Start Date, Due Date, Actual Start Date, Actual Completion Date').toEqual(DATE_ORDER);
  });

  test(tcTitle(c.readOnlyDates), tcDetails(c.readOnlyDates, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, c.readOnlyDates);
    await projectEditPage.gotoEdit(project.id);
    const values = await projectEditPage.values();
    await recordTestValues(testInfo, shown(pick(values, ['actualStart', 'actualCompletion'])));
    await expect(projectEditPage.actualStart, 'Actual Start Date shown').toBeVisible();
    await expect(projectEditPage.actualCompletion, 'Actual Completion Date shown').toBeVisible();
    expect(await projectEditPage.editable('actualStart'), 'DEFECT: Actual Start Date can be edited').toBe(false);
    expect(await projectEditPage.editable('actualCompletion'), 'DEFECT: Actual Completion Date can be edited').toBe(false);
  });

  test(tcTitle(c.fromAccount), tcDetails(c.fromAccount, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.fromAccount;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { entry: 'Account -> Projects -> project', 'Account URL': account.url, projectName: tc.seed.projectName });
    await test.step(`Account "${account.name}" -> Projects tab`, async () => {
      await projectPage.openRecord(`/Account/Edit/${account.id}`);
      await projectPage.openTab('Projects');
      await projectPage.filterAccountProjects(tc.seed.projectName);
    });
    const link = projectPage.accountProjectsTab.locator(`a[href*="/Project/"][href$="/${project.id}"]`)
      .or(projectPage.accountProjectsTab.getByRole('link', { name: tc.seed.projectName })).first();
    const [popup] = await Promise.all([page.context().waitForEvent('page', { timeout: 5_000 }).catch(() => null), link.click()]);
    if (popup) await popup.waitForLoadState('domcontentloaded');
    const target = popup ? new ProjectEditPage(popup) : projectEditPage;
    await target.expectEditOpen();
    await expect(target.page).toHaveURL(new RegExp(`/Project/Edit/${project.id}(?:[/?#]|$)`));
    await expect(target.projectName).toHaveValue(tc.seed.projectName);
    if (popup) await popup.close();
  });

  test(tcTitle(c.recentlyViewed), tcDetails(c.recentlyViewed, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.recentlyViewed;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { projectName: tc.seed.projectName, url: project.url });
    await projectEditPage.gotoEdit(project.id);
    await test.step('Recently viewed lists the project', async () => {
      await projectEditPage.openRecord('/RecentlyViewed');
      await expect(page.locator('main').getByText(tc.seed.projectName).first()).toBeVisible();
    });
  });

  // ---------- MF-2 / MF-7 / MF-8 updates (non-terminal) ----------
  for (const tc of projectUpdateCases) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
      const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
      await recordTestValues(testInfo, tc.update);
      await test.step('View: open the project (MF-1)', () => projectEditPage.gotoEdit(project.id));
      const after = await editAndSave(projectEditPage, testInfo, tc, project, tc.update);
      await test.step('Changes persisted', () => projectEditPage.expectValues(tc.update));
      expect(after.projectStatus, 'Project Status unchanged').toBe(project.before.projectStatus);
      await shot(page, testInfo, 'updated-project');
    });
  }

  // ---------- status changes ----------
  test(tcTitle(c.onHold), tcDetails(c.onHold, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.onHold;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    const rowsBefore = await projectEditPage.historyRows.count();
    const after = await editAndSave(projectEditPage, testInfo, tc, project, tc.update);
    expect(after.projectStatus).toBe('On Hold');
    await test.step('History tab: one new status row "On Hold"', async () => {
      await projectEditPage.openTab('History');
      await expect(projectEditPage.historyRows, 'ProjectStatusHistory row inserted').toHaveCount(rowsBefore + 1);
      expect(await projectEditPage.historyStates()).toContain('On Hold');
      await shot(page, testInfo, 'status-history');
    });
  });

  test(tcTitle(c.draftNoActualStart), tcDetails(c.draftNoActualStart, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, c.draftNoActualStart);
    await projectEditPage.gotoEdit(project.id);
    const v = await projectEditPage.values();
    await recordTestValues(testInfo, shown(pick(v, ['projectStatus', 'scheduledStart', 'actualStart'])));
    expect(v.projectStatus).toBe('Draft');
    expect(v.actualStart, 'DEFECT: Actual Start Date shows the Scheduled Start Date').not.toBe(v.scheduledStart);
    if (v.actualStart) {
      // Draft is configured as a snapshot status in this sandbox: the date is the day it entered Draft
      expectToday(v.actualStart, 'Actual Start Date');
      observe(testInfo, `Draft counts as a snapshot status here - Actual Start Date = ${v.actualStart}`);
    } else {
      observe(testInfo, 'Actual Start Date is empty (no snapshot status entered yet)');
    }
  });

  test(tcTitle(c.draftToActive), tcDetails(c.draftToActive, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const tc = c.draftToActive;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    const after = await editAndSave(projectEditPage, testInfo, tc, project, tc.update);
    expect(after.projectStatus).toBe('Active');
    if (project.before.actualStart) expect(after.actualStart, 'Actual Start Date of the first snapshot entry kept').toBe(project.before.actualStart);
    else expectToday(after.actualStart, 'Actual Start Date');
    observe(testInfo, `Actual Start Date: "${project.before.actualStart || '(empty)'}" -> "${after.actualStart}"`);
    await projectEditPage.openTab('History');
    expect(await projectEditPage.historyStates(), 'History shows the Active status').toContain('Active');
  });

  test(tcTitle(c.noStatusChange), tcDetails(c.noStatusChange, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const tc = c.noStatusChange;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    const rowsBefore = await projectEditPage.historyRows.count();
    await editAndSave(projectEditPage, testInfo, tc, project, tc.update);
    await projectEditPage.expectValues(tc.update);
    await expect(projectEditPage.historyRows, 'DEFECT: a status history row was added without a status change').toHaveCount(rowsBefore);
    observe(testInfo, `History rows: ${rowsBefore} before and after`);
  });

  test(tcTitle(c.confirmation), tcDetails(c.confirmation, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.confirmation;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    await projectEditPage.update(tc.update);
    await test.step('Save (MF-8)', () => projectEditPage.save());
    await recordUpdated(testInfo, MODULE, tc, project.before, await projectEditPage.values(), project);
    await expect(projectEditPage.savedMessage, 'Save confirmation (MF-8)').toBeVisible();
    observe(testInfo, `Confirmation shown: "${(await projectEditPage.savedMessage.innerText()).trim()}"`);
    await test.step('Leave the page: no unsaved-changes warning', async () => {
      let prompted = '';
      const onDialog = d => { prompted = d.message() || d.type(); return d.accept(); };
      page.on('dialog', onDialog);
      try {
        await projectEditPage.leaveLink.click();
        await expect(page, 'DEFECT: dirty state not cleared - the page could not be left after saving').toHaveURL(/\/RecentlyViewed/);
      } finally {
        page.off('dialog', onDialog);
      }
      expect(prompted, 'DEFECT: an unsaved-changes prompt was raised after a successful save').toBe('');
    });
  });

  test(tcTitle(c.audit), tcDetails(c.audit, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.audit;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    await editAndSave(projectEditPage, testInfo, tc, project, tc.update);
    await test.step('Audit tab shows the previous Project Name', async () => {
      await projectEditPage.openTab('Audit');
      await expect(projectEditPage.auditPane.getByText(project.before.projectName).first()).toBeVisible();
      await shot(page, testInfo, 'audit-tab');
    });
  });

  test(tcTitle(c.actualStartRetained), tcDetails(c.actualStartRetained, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const tc = c.actualStartRetained;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    const start = project.before.actualStart;
    await recordTestValues(testInfo, { 'Status path': 'Active -> On Hold -> Active', actualStart: start || '(empty)' });
    expect(start, 'An Active project has an Actual Start Date').not.toBe('');
    const onHold = await editAndSave(projectEditPage, testInfo, tc, project, tc.update);
    const after = await editAndSave(projectEditPage, testInfo, tc, project, tc.then, onHold);
    expect(after.projectStatus).toBe('Active');
    expect(after.actualStart, 'Actual Start Date of the first entry is kept').toBe(start);
  });

  // ---------- terminal state ----------
  test(tcTitle(c.complete), tcDetails(c.complete, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.complete;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    const terminal = await projectEditPage.terminalStatuses();
    observe(testInfo, `Terminal statuses: ${terminal.join(', ')}`);
    expect(terminal, 'Completed is a terminal status').toContain('Completed');
    const after = await editAndSave(projectEditPage, testInfo, tc, project, tc.update);
    expect(after.projectStatus).toBe('Completed');
    expectToday(after.actualCompletion, 'Actual Completion Date');
    await expectTerminal(projectEditPage);
    await projectEditPage.openTab('History');
    expect(await projectEditPage.historyStates(), 'History shows the Completed status').toContain('Completed');
    await shot(page, testInfo, 'completed-project');
  });

  test(tcTitle(c.terminalFields), tcDetails(c.terminalFields, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.terminalFields;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { projectStatus: tc.close });
    await closeProject(projectEditPage, testInfo, tc, project);
    await test.step('Name, Project Code and Description stay editable', async () => {
      for (const key of TERMINAL_EDITABLE) expect(await projectEditPage.editable(key), `${key} editable on a terminal project`).toBe(true);
    });
    await expectTerminal(projectEditPage);
    observe(testInfo, `Project Status on the terminal project is ${(await projectEditPage.editable('projectStatus')) ? 'editable' : 'read-only'}`);
    await shot(page, testInfo, 'terminal-project');
  });

  test(tcTitle(c.terminalEdit), tcDetails(c.terminalEdit, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const tc = c.terminalEdit;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    const closed = await closeProject(projectEditPage, testInfo, tc, project);
    const after = await editAndSave(projectEditPage, testInfo, tc, project, tc.update, closed);
    await projectEditPage.expectValues(tc.update);
    expect(after.projectStatus, 'Project stays in its terminal status').toBe(tc.close);
  });

  test(tcTitle(c.terminalCreation), tcDetails(c.terminalCreation, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.terminalCreation;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { projectStatus: tc.close, 'Checked': 'Add Deliverable, Clock In' });
    await closeProject(projectEditPage, testInfo, tc, project);
    await projectEditPage.openTab('Deliverables');
    await expect(page.locator('#pane-services'), 'Deliverables tab').toBeVisible();
    await expect(projectEditPage.addDeliverable, 'DEFECT: Add Deliverable offered on a terminal project').toBeHidden();
    await expect(projectEditPage.clockIn, 'DEFECT: Clock In (new time entry) offered on a terminal project').toBeHidden();
    await shot(page, testInfo, 'terminal-deliverables');
  });

  test(tcTitle(c.terminalStaffing), tcDetails(c.terminalStaffing, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.terminalStaffing;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { projectStatus: tc.close });
    await closeProject(projectEditPage, testInfo, tc, project);
    await projectEditPage.openTab('Staffing');
    await expect(page.locator('#pane-project-staffing'), 'Staffing tab').toBeVisible();
    expect(await projectEditPage.staffingAddable(), 'DEFECT: staff can still be added on a terminal project').toBe(0);
  });

  test(tcTitle(c.terminalAnnotations), tcDetails(c.terminalAnnotations, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const tc = c.terminalAnnotations;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { projectStatus: tc.close, 'Checked': 'Add New Document, Signals' });
    await closeProject(projectEditPage, testInfo, tc, project);
    await projectEditPage.openTab('Documents');
    await expect(projectEditPage.addDocument, 'Documents stay available').toBeVisible();
    await expect(projectEditPage.signalsButton, 'Conversations (Signals) stay available').toBeEnabled();
  });

  test(tcTitle(c.cancelStatus), tcDetails(c.cancelStatus, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const tc = c.cancelStatus;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    expect(await projectEditPage.terminalStatuses(), 'Canceled is a terminal status').toContain('Canceled');
    const after = await editAndSave(projectEditPage, testInfo, tc, project, tc.update);
    expect(after.projectStatus).toBe('Canceled');
    expect(after.actualCompletion, 'Only Completed sets the completion date').toBe('');
    await expectTerminal(projectEditPage);
  });

  test(tcTitle(c.reopenClears), tcDetails(c.reopenClears, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const tc = c.reopenClears;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { 'Status path': `Active -> ${tc.close} -> ${tc.update.projectStatus}` });
    const closed = await closeProject(projectEditPage, testInfo, tc, project);
    expectToday(closed.actualCompletion, 'Actual Completion Date');
    test.skip(!(await projectEditPage.editable('projectStatus')),
      'Project Status is read-only on a terminal project - reopening needs the override (62529, future requirement)');
    const after = await editAndSave(projectEditPage, testInfo, tc, project, tc.update, closed);
    expect(after.projectStatus).toBe(tc.update.projectStatus);
    expect(after.actualCompletion, 'DEFECT: Actual Completion Date kept after leaving Completed').toBe('');
  });

  // ---------- related sections ----------
  test(tcTitle(c.deliverables), tcDetails(c.deliverables, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, c.deliverables);
    await projectEditPage.gotoEdit(project.id);
    await projectEditPage.openTab('Deliverables');
    const pane = page.locator('#pane-services');
    await expect(pane).toBeVisible();
    await expect(pane, 'Services listed with a result count').toContainText(/Results\s+\d+/);
    await expect(projectEditPage.addDeliverable, 'Add Deliverable (Add Service)').toBeVisible();
    await expect(projectEditPage.addDeliverable).toHaveAttribute('href', new RegExp(`ProjectID=${project.id}\\b`));
    await recordTestValues(testInfo, { 'Deliverables': (await pane.getByText(/Results\s+\d+/).first().innerText()).trim(), 'Add Deliverable': await projectEditPage.addDeliverable.getAttribute('href') });
  });

  test(tcTitle(c.documentsSignals), tcDetails(c.documentsSignals, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, c.documentsSignals);
    await recordTestValues(testInfo, { 'Checked': 'Documents tab, Signals' });
    await projectEditPage.gotoEdit(project.id);
    await projectEditPage.openTab('Documents');
    await expect(page.locator('#pane-docs'), 'Documents tab displayed').toBeVisible();
    await expect(projectEditPage.addDocument, 'Add New Document').toBeVisible();
    await expect(projectEditPage.signalsButton, 'Signal interface option').toBeEnabled();
  });

  // ---------- negative ----------
  for (const tc of projectNegativeCases) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
      const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
      await recordTestValues(testInfo, shown(tc.update));
      await test.step(`Edit ${Object.keys(tc.update).join(', ')}`, () => projectEditPage.update(tc.update));
      const result = await test.step('Click Save', () => projectEditPage.trySave());
      if (result.saved) await recordUpdated(testInfo, MODULE, tc, project.before, await projectEditPage.values(), project);
      expect(result.saved, 'DEFECT: the app saved the invalid project values').toBe(false);
      const message = projectEditPage.validationMessage(tc.message);
      await expect(message, `"${tc.message}"`).toBeVisible();
      observe(testInfo, `Validation shown: "${(await message.innerText()).trim()}"`);
      await test.step('Re-open: stored project unchanged', async () => {
        await projectEditPage.gotoEdit(project.id);
        await projectEditPage.expectValues(pick(project.before, Object.keys(tc.update)));
      });
    });
  }

  test(tcTitle(c.cancelLink), tcDetails(c.cancelLink, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.cancelLink;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { ...tc.update, action: 'Cancel' });
    await projectEditPage.gotoEdit(project.id);
    await projectEditPage.update(tc.update);
    await test.step('Click Cancel', async () => {
      page.once('dialog', d => d.accept());   // a native "leave page?" prompt, if the app raises one
      await projectEditPage.cancelLink.click();
    });
    await expect(projectEditPage.projectName, 'Stored Project Name back').toHaveValue(project.before.projectName);
    await expect(projectEditPage.description, 'Stored Description back').toHaveValue(project.before.description);
    await expect(page).toHaveURL(new RegExp(`/Project/Edit/${project.id}(?:[/?#]|$)`));
  });

  test(tcTitle(c.unsavedWarning), tcDetails(c.unsavedWarning, MODULE), async ({ projectPage, projectEditPage, page }, testInfo) => {
    const tc = c.unsavedWarning;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    await recordTestValues(testInfo, tc.update);
    await projectEditPage.gotoEdit(project.id);
    await projectEditPage.update(tc.update);
    const warning = await test.step('Click a sidebar link, then Cancel', () => projectEditPage.leaveWithUnsavedChanges('cancel'));
    observe(testInfo, `Warning shown: "${warning}"`);
    await expect(page).toHaveURL(new RegExp(`/Project/Edit/${project.id}`));
    await expect(projectEditPage.projectName, 'Edited value kept after Cancel').toHaveValue(tc.update.projectName);
    await test.step('Click the link again, then Continue Without Saving', () => projectEditPage.leaveWithUnsavedChanges('continue'));
    await expect(page).not.toHaveURL(/\/Project\/Edit\//);
    await test.step('Re-open: changes were discarded', async () => {
      await projectEditPage.gotoEdit(project.id);
      await projectEditPage.expectValues(pick(project.before, ['projectName']));
    });
  });

  test(tcTitle(c.nameMax), tcDetails(c.nameMax, MODULE), async ({ projectPage, projectEditPage }, testInfo) => {
    const tc = c.nameMax;
    const project = await seedProject({ projectPage, projectEditPage }, testInfo, tc);
    const typed = 'N'.repeat(tc.length);
    await recordTestValues(testInfo, { 'Characters typed': tc.length, 'Limit': tc.max });
    await projectEditPage.gotoEdit(project.id);
    await projectEditPage.projectName.fill('');
    await projectEditPage.projectName.pressSequentially(typed);
    const kept = (await projectEditPage.projectName.inputValue()).length;
    observe(testInfo, `Project Name holds ${kept} characters`);
    expect(kept, `Project Name limited to ${tc.max} characters`).toBe(tc.max);
  });

  test(tcTitle(c.unknownProject), tcDetails(c.unknownProject, MODULE), async ({ projectEditPage, page }, testInfo) => {
    const tc = c.unknownProject;
    await applyAllureLabels(tc, MODULE);
    await projectEditPage.openRecord(ProjectEditPage.editPath(tc.projectId));
    await recordUrl(testInfo, page.url(), 'Unknown project');
    await recordTestValues(testInfo, { 'Project ID': tc.projectId });
    await expect(page.locator(`#form-project #ProjectID[value="${tc.projectId}"]`), 'DEFECT: an editable project was shown for an unknown id').toHaveCount(0);
    observe(testInfo, `Shown: "${await page.title()}" (${page.url()})`);
  });
});
