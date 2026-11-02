const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { MODULE, TEXT, TYPES, projectCases: c } = require('../testData/projectData');
const { ProjectPage } = require('../pages/project/projectPage');
const { resolveProjectAccount } = require('../utils/projectAccount');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUrl } = require('../utils/testCase');
const { expectNotSaved } = require('../utils/negative');

/**
 * Use case 62422 - Create Project.
 * Every project is created on an EXISTING Account (PROJECT_ACCOUNT_ID, else the first "Playwright Project Owner" /
 * "Playwright" account in the Account selector) and each saved project is checked to belong to it ("Account Name:"
 * link on View & Edit Project, Account's Projects tab). A Company + Account is created only when no such account exists.
 * Projects are NOT deleted; each one is listed with its URL in reports/excel/project/Atlas_Project_<YYYY-MM-DD>.xlsx.
 *
 * The sandbox form has no Project Type control yet (63342). TC_PRJ_006 reports that gap; the tests that need the
 * control (TC_PRJ_007, 008, 010-014, 016, 021, 024, 028) are Skipped until it exists and then run unchanged.
 * TC_PRJ_028 ticks "Do not show again" (permanent for USER_EMAIL) and runs only with PROJECT_ALLOW_SUPPRESS_NOTICE=true.
 *
 * Not automated: AF-1 missing PERM.SERV.Project.Create (needs a second user), the SERV.ProjectStatusHistory row
 * contents (ChangedAtUTC, isSystemGenerated - database), the Global-scope setting, deleted template versions.
 */

const TYPE_MISSING = 'No Project Type control on the Create Project form yet (use case 63342) - see TC_PRJ_006';
const NOTICE_MISSING = 'Project Type notice not shown (is SuppressProjectTypeImmutableNotice already on for this user?)';

/** Existing Account the projects are created on: { id, url, name }. */
let seed;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  seed = await resolveProjectAccount(browser);
});

const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });

/** Skips a test that needs the Project Type control while the form does not have it. */
async function needProjectType(projectPage) {
  test.skip(!(await projectPage.hasProjectType()), TYPE_MISSING);
}

/** Opens the Create Project form (on the existing Account unless noAccount) and logs its URL. */
async function openForm(projectPage, testInfo, tc, { noAccount = false } = {}) {
  await applyAllureLabels(tc, MODULE);
  await test.step(`Open ${ProjectPage.createPath(noAccount ? '' : seed.id)}`, () => projectPage.gotoCreate(noAccount ? '' : seed.id));
  await recordUrl(testInfo, projectPage.page.url(), 'Create Project');
}

/** Fills and saves a project on the existing Account (MF-2 to MF-5); logs it as created. Returns { values, record }. */
async function createProject(projectPage, testInfo, tc, { viaAddNew = false } = {}) {
  await applyAllureLabels(tc, MODULE);
  return test.step(`Fill and save the Project on Account "${seed.name}" (MF-2 to MF-5)`, async () => {
    if (viaAddNew) {
      await projectPage.openRecord('/RecentlyViewed');
      await projectPage.openFromAddNew();
    } else {
      await projectPage.gotoCreate(seed.id);
    }
    const values = await projectPage.fillForm({
      projectName: tc.projectName, accountId: seed.id, projectType: tc.projectType, changeStatus: tc.changeStatus, details: tc.details,
    });
    await recordTestValues(testInfo, { ...values, 'Account URL': seed.url });
    await testInfo.attach('project-form', { body: await projectPage.page.screenshot({ fullPage: true }), contentType: 'image/png' });
    const record = await projectPage.submitNew();
    await recordCreated(testInfo, MODULE, tc, values, record);
    await expect(projectPage.recordAddedMessage, '"Your new record has been added."').toBeVisible();
    await projectPage.expectLinkedToAccount(seed.id);
    return { values, record };
  });
}

/** The saved project shows the values it was created with (MF-5). */
async function expectSaved(projectPage, values) {
  await test.step('View & Edit Project shows the saved values', async () => {
    await expect(projectPage.projectName).toHaveValue(values.projectName);
    await projectPage.expectShown(values.projectStatus, 'Project Status');
    if (values.projectType) await projectPage.expectShown(values.projectType, 'Project Type');
  });
}

/** Digits of a yyyy-mm-dd date appear in the field, whatever format the app shows (yyyy-mm-dd or mm/dd/yyyy). */
async function expectDate(input, iso, what) {
  const [y, m, d] = iso.split('-');
  const digits = (await input.inputValue()).replace(/\D/g, '');
  expect([`${y}${m}${d}`, `${m}${d}${y}`], `${what} "${iso}" saved (shown "${await input.inputValue()}")`).toContain(digits);
}

test.describe('Project - Create Project (62422)', () => {
  // ---------- MF-1 page load ----------
  test(tcTitle(c.fromAddNew), tcDetails(c.fromAddNew, MODULE), async ({ projectPage }, testInfo) => {
    await applyAllureLabels(c.fromAddNew, MODULE);
    await projectPage.openRecord('/RecentlyViewed');
    await test.step('Add New -> Project', () => projectPage.openFromAddNew());
    await recordUrl(testInfo, projectPage.page.url(), 'Create Project');
    await recordTestValues(testInfo, { entry: 'Add New -> Project' });
    for (const [what, control] of [['Account', projectPage.account], ['Project Name', projectPage.projectName],
      ['Project Template', projectPage.templateVersion], ['Project Status', projectPage.projectStatus]]) {
      await expect(control, `${what} control`).toBeVisible();
    }
    await expect(projectPage.saveButton).toBeVisible();
  });

  test(tcTitle(c.directUrl), tcDetails(c.directUrl, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.directUrl, { noAccount: true });
    const account = await projectPage.valueText(projectPage.account);
    await recordTestValues(testInfo, { url: '/Project/Create', account: account || '(empty)' });
    expect(account, 'No Account pre-populated without an AccountID').toBe('');
  });

  test(tcTitle(c.accountParam), tcDetails(c.accountParam, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.accountParam);
    await recordTestValues(testInfo, { 'AccountID': seed.id, account: await projectPage.valueText(projectPage.account), 'Account URL': seed.url });
    await expect(projectPage.account, 'Account pre-populated from AccountID').toHaveValue(String(seed.id));
  });

  test(tcTitle(c.fromAccountTab), tcDetails(c.fromAccountTab, MODULE), async ({ projectPage, page }, testInfo) => {
    await applyAllureLabels(c.fromAccountTab, MODULE);
    await projectPage.openRecord(`/Account/Edit/${seed.id}`);
    await projectPage.openTab('Projects');
    const [tab] = await Promise.all([page.context().waitForEvent('page'), projectPage.addNewProjectLink.click()]);
    await tab.waitForLoadState('domcontentloaded');
    const form = new ProjectPage(tab);
    await form.expectFormOpen();
    await expect(tab).toHaveURL(new RegExp(`/Project/Create\\?AccountID=${seed.id}\\b`, 'i'));
    await recordUrl(testInfo, tab.url(), 'Create Project (from Account)');
    await recordTestValues(testInfo, { entry: 'Account -> Projects -> Add New Project', account: await form.valueText(form.account), 'Account URL': seed.url });
    await expect(form.account, 'Account pre-populated').toHaveValue(String(seed.id));
    await tab.close();
  });

  test(tcTitle(c.statusDefault), tcDetails(c.statusDefault, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.statusDefault);
    const before = await projectPage.valueText(projectPage.projectStatus);
    observe(testInfo, before ? `Default Project Status: "${before}"` : 'No effective default - Project Status left empty');
    const after = await test.step('Change the Project Status', async () => (before
      ? projectPage.selectOther(projectPage.projectStatus) : projectPage.ensureSelected(projectPage.projectStatus)));
    await recordTestValues(testInfo, { 'Default Status': before || '(empty)', 'Changed To': after });
    expect(after, 'The user can change Project Status').not.toBe(before);
  });

  test(tcTitle(c.typeNoDefault), tcDetails(c.typeNoDefault, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.typeNoDefault);
    const present = await projectPage.hasProjectType();
    await recordTestValues(testInfo, { 'Project Type control': present ? 'present' : 'missing' });
    expect(present, `NOT IMPLEMENTED: ${TYPE_MISSING.split(' - ')[0]}`).toBe(true);
    const type = await projectPage.typeValue();
    expect(type, 'Project Type has no default').toBe('');
    await expect(projectPage.typeNotice, 'No notice before the user sets the type').toHaveCount(0);
  });

  test(tcTitle(c.typeOptions), tcDetails(c.typeOptions, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.typeOptions);
    await needProjectType(projectPage);
    const options = await projectPage.typeOptions();
    await recordTestValues(testInfo, { 'Project Type options': options });
    expect([...options].sort()).toEqual([...TYPES].sort());
  });

  test(tcTitle(c.typeHelp), tcDetails(c.typeHelp, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.typeHelp);
    await needProjectType(projectPage);
    const help = await projectPage.typeHelpText();
    await recordTestValues(testInfo, { 'Help text': help || '(none)' });
    expect(help, 'Help text explaining the Project Type').not.toBe('');
    observe(testInfo, `Help text: "${help}"`);
  });

  test(tcTitle(c.templateControl), tcDetails(c.templateControl, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.templateControl);
    await expect(projectPage.templateVersion, 'Project Template control').toBeVisible();
    const options = await projectPage.optionTexts(projectPage.templateVersion);
    const initial = await projectPage.valueText(projectPage.templateVersion);
    await recordTestValues(testInfo, { 'Template Versions': options, 'Initially selected': initial || '(none)' });
    expect(options.length, 'At least one Template Version to choose').toBeGreaterThan(0);
  });

  // ---------- MF-3 Project Type Immutable ----------
  test(tcTitle(c.noticeShown), tcDetails(c.noticeShown, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.noticeShown;
    await openForm(projectPage, testInfo, tc);
    await needProjectType(projectPage);
    await recordTestValues(testInfo, { projectType: tc.projectType });
    await test.step(`Set Project Type = ${tc.projectType}`, () => projectPage.setProjectType(tc.projectType));
    expect(await projectPage.noticeAppears(10_000), NOTICE_MISSING).toBe(true);
    await expect(projectPage.typeNotice).toContainText(TEXT.typeNotice);
    observe(testInfo, `Shown: "${TEXT.typeNotice}"`);
    await projectPage.acknowledgeNotice();
  });

  test(tcTitle(c.noticeControls), tcDetails(c.noticeControls, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.noticeControls;
    await openForm(projectPage, testInfo, tc);
    await needProjectType(projectPage);
    await recordTestValues(testInfo, { projectType: tc.projectType });
    await projectPage.setProjectType(tc.projectType);
    expect(await projectPage.noticeAppears(10_000), NOTICE_MISSING).toBe(true);
    await expect(projectPage.typeNotice, 'Title').toContainText(TEXT.noticeTitle);
    await expect(projectPage.noticeOk, 'Ok button').toBeVisible();
    await expect(projectPage.typeNotice.getByText(TEXT.doNotShow), '"Do not show again"').toBeVisible();
    await expect(projectPage.noticeDoNotShow, '"Do not show again" is unticked').not.toBeChecked();
    await projectPage.acknowledgeNotice();   // Ok only - the setting is not changed
  });

  test(tcTitle(c.noticeOk), tcDetails(c.noticeOk, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.noticeOk;
    await openForm(projectPage, testInfo, tc);
    await needProjectType(projectPage);
    await recordTestValues(testInfo, { projectType: tc.projectType, action: 'Ok' });
    await projectPage.setProjectType(tc.projectType);
    expect(await projectPage.noticeAppears(10_000), NOTICE_MISSING).toBe(true);
    await test.step('Click Ok', () => projectPage.acknowledgeNotice());
    expect(await projectPage.typeValue(), 'Selected type kept').toBe(tc.projectType);
  });

  test(tcTitle(c.noticeOnlyOnce), tcDetails(c.noticeOnlyOnce, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.noticeOnlyOnce;
    await openForm(projectPage, testInfo, tc);
    await needProjectType(projectPage);
    await recordTestValues(testInfo, { projectType: `${tc.projectType} -> ${tc.changeTo}` });
    expect(await projectPage.setTypeAndAcknowledge(tc.projectType), NOTICE_MISSING).toBe(true);
    await test.step(`Change Project Type to ${tc.changeTo}`, () => projectPage.setProjectType(tc.changeTo));
    expect(await projectPage.noticeAppears(3_000), 'DEFECT: the notice was raised again when the selection changed').toBe(false);
    expect(await projectPage.typeValue()).toBe(tc.changeTo);
  });

  test(tcTitle(c.noticeEachForm), tcDetails(c.noticeEachForm, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.noticeEachForm;
    await openForm(projectPage, testInfo, tc);
    await needProjectType(projectPage);
    await recordTestValues(testInfo, { projectType: tc.projectType, action: 'Ok (Do not show again unticked), then a new form' });
    expect(await projectPage.setTypeAndAcknowledge(tc.projectType), NOTICE_MISSING).toBe(true);
    await test.step('Open a new Create Project page', () => projectPage.gotoCreate(seed.id));
    await projectPage.setProjectType(tc.projectType);
    expect(await projectPage.noticeAppears(10_000), 'DEFECT: the notice was suppressed although only Ok was clicked').toBe(true);
    await projectPage.acknowledgeNotice();
  });

  // ---------- MF-4 / MF-5 save (on the existing Account) ----------
  test(tcTitle(c.createDelivery), tcDetails(c.createDelivery, MODULE), async ({ projectPage }, testInfo) => {
    const { values } = await createProject(projectPage, testInfo, c.createDelivery);
    await expectSaved(projectPage, values);
  });

  test(tcTitle(c.createEstimation), tcDetails(c.createEstimation, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.createEstimation);
    await needProjectType(projectPage);
    const { values } = await createProject(projectPage, testInfo, c.createEstimation);
    await expectSaved(projectPage, values);
  });

  test(tcTitle(c.changedStatus), tcDetails(c.changedStatus, MODULE), async ({ projectPage }, testInfo) => {
    const { values } = await createProject(projectPage, testInfo, c.changedStatus);
    await expectSaved(projectPage, values);
  });

  test(tcTitle(c.initialPhase), tcDetails(c.initialPhase, MODULE), async ({ projectPage }, testInfo) => {
    const { values } = await createProject(projectPage, testInfo, c.initialPhase);
    const phase = await projectPage.currentPhaseText();
    const phases = await projectPage.phaseOptions();
    await recordTestValues(testInfo, { ...values, currentPhase: phase || '(not shown)', 'Template phases': phases, 'Account URL': seed.url });
    expect(phase, 'Current phase set from the template').not.toBe('');
    expect(phase, 'Current phase = the template phase with the lowest ExecutionOrder (first listed)').toBe(phases[0]);
    observe(testInfo, `Project Phase: "${phase}" (template ${values.templateVersion}; phases ${phases.join(', ')})`);
  });

  test(tcTitle(c.templateSaved), tcDetails(c.templateSaved, MODULE), async ({ projectPage }, testInfo) => {
    const { values } = await createProject(projectPage, testInfo, c.templateSaved);
    expect(values.templateVersion, 'A Template Version was selected').not.toBe('');
    const templateName = values.templateVersion.split('/')[0].trim();
    const shown = await projectPage.page.locator('main').getByText(templateName).filter({ visible: true }).count();
    if (shown) {
      await projectPage.expectShown(templateName, 'Template');
      observe(testInfo, `Template shown on the project: "${values.templateVersion}"`);
    } else {
      const phases = await projectPage.phaseOptions();
      expect(phases.length, 'The template\'s phases are available on the saved project').toBeGreaterThan(0);
      observe(testInfo, `Template not displayed on View & Edit Project; its phases are: ${phases.join(', ')}`);
    }
  });

  test(tcTitle(c.listedOnAccount), tcDetails(c.listedOnAccount, MODULE), async ({ projectPage }, testInfo) => {
    const { values, record } = await createProject(projectPage, testInfo, c.listedOnAccount);
    await test.step(`Account "${seed.name}" -> Projects tab (All) lists the project`, async () => {
      await projectPage.openRecord(`/Account/Edit/${seed.id}`);
      await projectPage.openTab('Projects');
      await projectPage.filterAccountProjects(values.projectName);
      const byLink = projectPage.accountProjectsTab.locator(`a[href*="/Project/"][href$="/${record.id}"]`);
      await expect(projectPage.accountProjectsTab.getByText(values.projectName).or(byLink).first(), 'Project listed on the Account').toBeVisible();
    });
  });

  test(tcTitle(c.typeImmutable), tcDetails(c.typeImmutable, MODULE), async ({ projectPage }, testInfo) => {
    await openForm(projectPage, testInfo, c.typeImmutable);
    await needProjectType(projectPage);
    const { values } = await createProject(projectPage, testInfo, c.typeImmutable);
    await projectPage.expectShown(values.projectType, 'Project Type');
    expect(await projectPage.typeEditable(), 'DEFECT: Project Type can still be changed on the saved project').toBe(false);
  });

  test(tcTitle(c.statusHistory), tcDetails(c.statusHistory, MODULE), async ({ projectPage }, testInfo) => {
    await createProject(projectPage, testInfo, c.statusHistory);
    await test.step('Audit tab', async () => {
      await projectPage.openTab('Audit');
      await expect(projectPage.page.locator('main'), 'Audit shows the creation / status entry').toContainText(/Created|Added|Insert|Project Status|Status/i);
    });
  });

  test(tcTitle(c.manualAccount), tcDetails(c.manualAccount, MODULE), async ({ projectPage }, testInfo) => {
    const { values } = await createProject(projectPage, testInfo, c.manualAccount, { viaAddNew: true });
    expect(values.account, 'Chosen Account').toBe(seed.name);
    await expectSaved(projectPage, values);
  });

  test(tcTitle(c.optionalDetails), tcDetails(c.optionalDetails, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.optionalDetails;
    const { values } = await createProject(projectPage, testInfo, tc);
    await expectSaved(projectPage, values);
    await test.step('Optional fields saved', async () => {
      await expect(projectPage.projectCode).toHaveValue(tc.details.projectCode);
      await expect(projectPage.description).toHaveValue(tc.details.description);
      expect(await projectPage.valueText(projectPage.billingType), 'Primary Billing Type').toBe(tc.details.billingType);
      expect(Number(await projectPage.estimatedHours.inputValue()), 'Estimated Hours').toBe(Number(tc.details.estimatedHours));
    });
  });

  test(tcTitle(c.scheduleDates), tcDetails(c.scheduleDates, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.scheduleDates;
    await createProject(projectPage, testInfo, tc);
    await expectDate(projectPage.scheduledStart, tc.details.scheduledStart, 'Scheduled Start Date');
    await expectDate(projectPage.dueDate, tc.details.dueDate, 'Due Date');
  });

  // ---------- negative ----------
  test(tcTitle(c.noType), tcDetails(c.noType, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.noType;
    await openForm(projectPage, testInfo, tc);
    await needProjectType(projectPage);   // without the control there is nothing to leave empty
    const values = await projectPage.fillForm({ projectName: tc.projectName, accountId: seed.id });
    const data = { ...values, projectType: '(empty)' };
    await recordTestValues(testInfo, data);
    const result = await test.step('Click Save', () => projectPage.trySave());
    await expectNotSaved(testInfo, MODULE, { ...tc, data }, result);
    await expect(projectPage.validationError, 'Expected a Project Type validation error').toBeVisible();
    observe(testInfo, `Validation shown: "${(await projectPage.validationError.innerText()).trim()}"`);
  });

  for (const tc of [c.noTemplate, c.nameRequired, c.accountRequired, c.statusRequired]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ projectPage }, testInfo) => {
      await openForm(projectPage, testInfo, tc, { noAccount: tc.clear === 'account' });
      const values = await projectPage.fillForm({
        projectName: tc.projectName, accountId: tc.clear === 'account' ? '' : seed.id, projectType: tc.projectType,
        skipTemplate: tc === c.noTemplate,
      });
      if (tc.clear === 'projectStatus') await projectPage.clearSelect(projectPage.projectStatus);
      if (tc === c.noTemplate && values.templateVersion && !(await projectPage.clearSelect(projectPage.templateVersion))) {
        test.skip(true, 'Project Template is pre-selected and has no empty option - it can never be left unset');
      }
      const data = await projectPage.formValues();
      await recordTestValues(testInfo, { ...data, 'Left empty': tc.clear || 'templateVersion' });
      const result = await test.step('Click Save', () => projectPage.trySave());
      await expectNotSaved(testInfo, MODULE, { ...tc, data }, result);
      if (tc.message) await expect(projectPage.validationMessage(tc.message), `"${tc.message}"`).toBeVisible();
      else await expect(projectPage.validationError, 'Expected a "required" validation error').toContainText(/required/i);
      observe(testInfo, `Validation shown: ${(await projectPage.validationErrors.allInnerTexts()).map(t => `"${t.trim()}"`).join(', ')}`);
    });
  }

  test(tcTitle(c.emptyForm), tcDetails(c.emptyForm, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.emptyForm;
    await openForm(projectPage, testInfo, tc, { noAccount: true });
    await projectPage.clearSelect(projectPage.projectStatus);
    const data = await projectPage.formValues();
    await recordTestValues(testInfo, { ...data, action: 'Save with nothing entered' });
    const result = await test.step('Click Save', () => projectPage.trySave());
    await expectNotSaved(testInfo, MODULE, { ...tc, data }, result);
    const messages = (await projectPage.validationErrors.allInnerTexts()).map(t => t.trim()).filter(Boolean);
    expect(messages.length, 'Validation errors shown').toBeGreaterThan(0);
    observe(testInfo, `Validation shown: ${messages.map(m => `"${m}"`).join(', ')}`);
  });

  test(tcTitle(c.invalidAccount), tcDetails(c.invalidAccount, MODULE), async ({ projectPage, page }, testInfo) => {
    const tc = c.invalidAccount;
    await applyAllureLabels(tc, MODULE);
    await projectPage.openRecord(ProjectPage.createPath(tc.accountId));
    await recordUrl(testInfo, page.url(), 'Create Project (unknown AccountID)');
    await expect(page.getByRole('heading', { name: /error|not found|exception/i }), 'No error page').toHaveCount(0);
    await projectPage.expectFormOpen();
    const account = await projectPage.valueText(projectPage.account);
    await recordTestValues(testInfo, { 'AccountID': tc.accountId, account: account || '(empty)' });
    expect(account, 'No Account pre-populated for an unknown AccountID').toBe('');
  });

  test(tcTitle(c.cancel), tcDetails(c.cancel, MODULE), async ({ projectPage, page }, testInfo) => {
    const tc = c.cancel;
    await openForm(projectPage, testInfo, tc);
    const values = await projectPage.fillForm({ projectName: tc.projectName, accountId: seed.id, projectType: tc.projectType });
    await recordTestValues(testInfo, { ...values, action: 'Cancel', 'Account URL': seed.url });
    await test.step('Click Cancel', async () => {
      page.once('dialog', d => d.accept());   // a native "leave page?" prompt, if the app raises one
      await projectPage.cancelLink.click();
      // the app's unsaved-changes modal, if shown: continue without saving
      await projectPage.dirtyModal.locator('.modal-footer [data-action="continue"]').click({ timeout: 3_000 }).catch(() => {});
    });
    await expect(page, 'No project page opened').toHaveURL(/\/Project\/Create/i);
    await expect(projectPage.projectName, 'Entered values discarded').toHaveValue('');
    await test.step(`Account "${seed.name}" does not list the canceled project`, async () => {
      await projectPage.openRecord(`/Account/Edit/${seed.id}`);
      await projectPage.openTab('Projects');
      await projectPage.filterAccountProjects(tc.projectName);
      await expect(projectPage.accountProjectsTab.getByText(tc.projectName)).toHaveCount(0);
    });
  });

  // ---------- setting (changes the signed-in user's setting) ----------
  test(tcTitle(c.doNotShowAgain), tcDetails(c.doNotShowAgain, MODULE), async ({ projectPage }, testInfo) => {
    const tc = c.doNotShowAgain;
    test.skip(!env.projectAllowSuppressNotice,
      'Suppresses the Project Type notice for USER_EMAIL permanently - set PROJECT_ALLOW_SUPPRESS_NOTICE=true and run it alone');
    await openForm(projectPage, testInfo, tc);
    await needProjectType(projectPage);
    await recordTestValues(testInfo, { projectType: tc.projectType, action: 'Tick "Do not show again", Ok, open a new form' });
    await projectPage.setProjectType(tc.projectType);
    expect(await projectPage.noticeAppears(10_000), NOTICE_MISSING).toBe(true);
    await test.step('Tick "Do not show again" and click Ok', () => projectPage.acknowledgeNotice({ doNotShowAgain: true }));
    await projectPage.gotoCreate(seed.id);
    await projectPage.setProjectType(tc.projectType);
    expect(await projectPage.noticeAppears(5_000), 'DEFECT: the notice is still shown after "Do not show again"').toBe(false);
  });
});
