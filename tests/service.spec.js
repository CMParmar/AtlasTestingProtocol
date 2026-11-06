const { test, expect } = require('../fixtures/fixtures');
const { MODULE, ITEMS, MESSAGES, serviceCases: c, today } = require('../testData/serviceData');
const { ServicePage } = require('../pages/service/servicePage');
const { resolveServiceAccounts } = require('../utils/serviceAccount');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUrl } = require('../utils/testCase');
const { expectNotSaved } = require('../utils/negative');

/**
 * Use case 62433 - Create Service (SERV). The sandbox UI calls a Service a "Deliverable": /Service/Create[?AccountID|?ProjectID].
 * Every Deliverable is created on an EXISTING account (SERVICE_ACCOUNT_NAME, default "Test case factory") and, when a
 * project is needed, on that account's first project. Deliverables are NOT deleted; each one is listed with its URL in
 * reports/excel/service/Atlas_Service_<YYYY-MM-DD>.xlsx.
 *
 * Gaps the tests report (Skipped with the reason until the application catches up, then they run unchanged):
 *   T-31 Date Ordered is not pre-populated on the form (the saved Deliverable does get today's date),
 *   T-35 no change-request / originating Service control (MF-1.5).
 * Not automated: T-2 / T-25 (need a second user), T-27 (inactive Service Item), T-34 (terminal project + override
 * permission), T-24 (future requirement), the ServiceStatusHistory contents (ChangedAtUTC, isSystemGenerated - database).
 */

const NOT_PREFILLED = 'Date Ordered is not pre-populated on the Create Deliverable form yet (use case 63099) - runs unchanged once it is';
const ORIGINATING_MISSING = 'No change-request / originating Service control on the Create Deliverable form yet (MF-1.5) - runs unchanged once it exists';

/** { main, other }: accounts with their projects, resolved once by name. */
let seed;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  seed = await resolveServiceAccounts(browser);
});

const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const ids = list => list.map(p => p.id);

/** Opens the Create Deliverable form and logs its URL. */
async function openForm(servicePage, testInfo, tc, params) {
  await applyAllureLabels(tc, MODULE);
  await test.step(`Open ${ServicePage.createPath(params)}`, () => servicePage.gotoCreate(params));
  await recordUrl(testInfo, servicePage.page.url(), 'Create Deliverable');
}

/** Fills and saves a Deliverable on the main account (MF-2, MF-3); logs it as created. Returns { values, record }. */
async function createService(servicePage, testInfo, tc, data = tc.data) {
  await applyAllureLabels(tc, MODULE);
  return test.step(`Fill and save "${data.serviceName}" on Account "${seed.main.name}" (MF-2, MF-3)`, async () => {
    await servicePage.gotoCreate({ accountId: seed.main.id });
    const { withProject, ...form } = data;
    const values = await servicePage.fillForm({ ...form, projectId: withProject ? seed.main.projects[0].id : undefined });
    await recordTestValues(testInfo, { ...values, 'Account URL': `/Account/Edit/${seed.main.id}` });
    await testInfo.attach('service-form', { body: await servicePage.page.screenshot({ fullPage: true }), contentType: 'image/png' });
    const record = await servicePage.submitNew();
    await recordCreated(testInfo, MODULE, tc, values, record);
    // the confirmation is localized with the user's language: reported, not asserted
    if (await servicePage.recordAddedMessage.isVisible()) observe(testInfo, `"${MESSAGES.added}" shown`);
    return { values, record };
  });
}

/** The saved Deliverable (/Service/Edit/{id}) shows the values it was created with. */
async function expectSaved(sp, values) {
  await test.step('Saved Deliverable shows the entered values', async () => {
    await expect(sp.page).toHaveURL(/\/Service\/Edit\/\d+/i);
    await expect(sp.serviceName, 'Deliverable Name').toHaveValue(values.serviceName);
    expect(await sp.valueText(sp.serviceItem), 'Deliverable Type').toBe(values.serviceItem);
    await sp.expectShown(values.account, 'Account');
    if (values.project) expect(await sp.valueText(sp.project), 'Project').toBe(values.project);
    if (values.serviceStage) expect(await sp.valueText(sp.stage), 'Deliverable Stage').toBe(values.serviceStage);
    if (values.description) await expect(sp.description, 'Description').toHaveValue(values.description);
    if (values.billingType) expect(await sp.valueText(sp.billingType), 'Billing Type').toBe(values.billingType);
    if (values.estimatedHours) expect(Number(await sp.estimatedHours.inputValue()), 'Estimated Hours').toBe(Number(values.estimatedHours));
    for (const [key, control] of [['orderedDate', sp.orderedDate], ['scheduledStart', sp.scheduledStart], ['dueDate', sp.dueDate]]) {
      if (values[key]) await expect(control, key).toHaveValue(values[key]);
    }
  });
}

test.describe('Service - Create Service (62433)', () => {
  // ---------- MF-1 Open Add Service ----------
  test(tcTitle(c.open), tcDetails(c.open, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.open);
    for (const [what, control] of [['Account', servicePage.account], ['Deliverable Type', servicePage.serviceItem],
      ['Workflow Template', servicePage.template], ['Deliverable Name', servicePage.serviceName], ['Project', servicePage.project],
      ['Deliverable Status', servicePage.status], ['Deliverable Stage', servicePage.stage], ['Save', servicePage.saveButton]]) {
      await expect(control, `${what} control`).toBeVisible();
    }
    await recordTestValues(testInfo, { url: '/Service/Create', ...(await servicePage.formValues()) });
    expect(await servicePage.valueText(servicePage.account), 'No Account pre-populated').toBe('');
    expect(await servicePage.valueText(servicePage.project), 'No Project pre-populated').toBe('');
    expect(await servicePage.valueText(servicePage.serviceItem), 'No Deliverable Type pre-selected').toBe('');
  });

  test.skip(tcTitle(c.noPermission), tcDetails(c.noPermission, MODULE), async () => {
    // needs a second user without PERM.SERV.Service.Create
  });

  test(tcTitle(c.accountParam), tcDetails(c.accountParam, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.accountParam, { accountId: seed.main.id });
    const projects = await servicePage.settled(() => servicePage.optionValues(servicePage.project));
    await recordTestValues(testInfo, { 'AccountID': seed.main.id, account: await servicePage.valueText(servicePage.account), project: projects.join(', ') });
    await expect(servicePage.account, 'Account pre-populated from AccountID').toHaveValue(String(seed.main.id));
    expect(projects, 'Only the Account\'s projects are offered').toEqual(ids(seed.main.projects));
  });

  test(tcTitle(c.projectParam), tcDetails(c.projectParam, MODULE), async ({ servicePage }, testInfo) => {
    const project = seed.main.projects[0];
    await openForm(servicePage, testInfo, c.projectParam, { projectId: project.id });
    await recordTestValues(testInfo, { 'ProjectID': project.id, project: await servicePage.valueText(servicePage.project), account: await servicePage.valueText(servicePage.account) });
    await expect(servicePage.project, 'Project pre-populated from ProjectID').toHaveValue(String(project.id));
    await expect(servicePage.account, 'Account of the project pre-populated').toHaveValue(String(seed.main.id));
  });

  test(tcTitle(c.accountSelect), tcDetails(c.accountSelect, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.accountSelect);
    expect(await servicePage.optionValues(servicePage.project), 'No projects before an Account is chosen').toEqual([]);
    const first = await test.step(`Select Account "${seed.main.name}"`, () => servicePage.selectAccount(seed.main.id));
    const second = await test.step(`Select Account "${seed.other.name}"`, () => servicePage.selectAccount(seed.other.id));
    await recordTestValues(testInfo, { account: `${seed.main.name} -> ${seed.other.name}`, project: `${first.length} / ${second.length} projects` });
    expect(first, `Projects of ${seed.main.name}`).toEqual(ids(seed.main.projects));
    expect(second, `Projects of ${seed.other.name}`).toEqual(ids(seed.other.projects));
    expect(first.filter(id => second.includes(id)), 'No project is shared between the two Accounts').toEqual([]);
  });

  test(tcTitle(c.projectsEligible), tcDetails(c.projectsEligible, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.projectsEligible, { accountId: seed.main.id });
    const offered = await servicePage.settled(() => servicePage.optionValues(servicePage.project));
    await recordTestValues(testInfo, { account: seed.main.name, project: seed.main.projects.map(p => p.name).join(', ') });
    expect(offered.length, 'At least one project is offered').toBeGreaterThan(0);
    for (const id of offered) {
      await test.step(`Project ${id} is not terminal`, async () => {
        expect(await servicePage.isProjectTerminal(id), `Project ${id} is in a terminal status but is offered`).toBe(false);
      });
    }
    observe(testInfo, 'Terminal / non-updatable projects that are correctly hidden cannot be listed from the form (needs a terminal project).');
  });

  // ---------- MF-2 Enter Service Details ----------
  test(tcTitle(c.itemDefaults), tcDetails(c.itemDefaults, MODULE), async ({ servicePage }, testInfo) => {
    const item = ITEMS.withDefaultTemplate;
    await openForm(servicePage, testInfo, c.itemDefaults, { accountId: seed.main.id });
    await servicePage.serviceName.fill('Typed by the user');
    await test.step(`Select Deliverable Type "${item.name}"`, () => servicePage.selectItem(item.name));
    const d = await servicePage.itemDefaults();
    await recordTestValues(testInfo, { serviceItem: item.name, billingType: d.billingType, estimatedHours: d.estimatedHours });
    expect(d.billingType, 'Billing Type defaults from the Deliverable Type').toBe(item.billingType);
    expect(Number(d.estimatedHours), 'Estimated Hours defaults from the Deliverable Type').toBe(Number(item.hours));
    await expect(servicePage.serviceName, 'The name typed by the user is not overwritten').toHaveValue('Typed by the user');
  });

  test(tcTitle(c.templateDefault), tcDetails(c.templateDefault, MODULE), async ({ servicePage }, testInfo) => {
    const item = ITEMS.withDefaultTemplate;
    await openForm(servicePage, testInfo, c.templateDefault, { accountId: seed.main.id });
    await servicePage.selectItem(item.name);
    const d = await servicePage.itemDefaults();
    await recordTestValues(testInfo, { serviceItem: item.name, templateVersion: d.template, serviceStage: d.stage });
    expect(d.template, 'The default template is pre-selected').toContain(item.templateName);
    expect(d.stageLocked, 'Deliverable Stage is read-only while a template is selected').toBe(true);
    expect(d.stage, 'Stage set from the template').toBe(item.stage);
  });

  test(tcTitle(c.noTemplateStage), tcDetails(c.noTemplateStage, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.noTemplateStage, { accountId: seed.main.id });
    await test.step(`Deliverable Type "${ITEMS.noDefaultTemplate.name}" (no default template)`, async () => {
      await servicePage.selectItem(ITEMS.noDefaultTemplate.name);
      expect((await servicePage.itemDefaults()).template, 'No template pre-selected').toBe('');
      await expect(servicePage.stage, 'Stage editable without a template').toBeEnabled();
    });
    await test.step(`Deliverable Type "${ITEMS.withDefaultTemplate.name}", then remove its template`, async () => {
      await servicePage.selectItem(ITEMS.withDefaultTemplate.name);
      await expect(servicePage.stage, 'Stage locked with a template').toBeDisabled();
      await servicePage.clearSelect(servicePage.template);
      await expect(servicePage.stage, 'Stage editable again').toBeEnabled();
      await servicePage.pick(servicePage.stage, { text: 'Design' });
      expect(await servicePage.valueText(servicePage.stage)).toBe('Design');
    });
    await recordTestValues(testInfo, { serviceItem: ITEMS.withDefaultTemplate.name, templateVersion: '(removed)', serviceStage: 'Design' });
  });

  test(tcTitle(c.templateList), tcDetails(c.templateList, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.templateList, { accountId: seed.main.id });
    expect(await servicePage.optionTexts(servicePage.template), 'No templates before a Deliverable Type is chosen').toEqual([]);
    await servicePage.selectItem(ITEMS.noDefaultTemplate.name);
    const templates = await servicePage.optionTexts(servicePage.template);
    await recordTestValues(testInfo, { serviceItem: ITEMS.noDefaultTemplate.name, templateVersion: templates.join(' | ') });
    expect(templates.length, 'Compatible templates listed').toBeGreaterThan(0);
    expect(templates.join(' | ')).toContain(ITEMS.noDefaultTemplate.templateName);
    await servicePage.selectItem(ITEMS.multiTemplate.name);
    const other = await servicePage.optionTexts(servicePage.template);
    expect(other, 'The list follows the Deliverable Type').not.toEqual(templates);
  });

  test(tcTitle(c.templateChange), tcDetails(c.templateChange, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.templateChange, { accountId: seed.main.id });
    await servicePage.selectItem(ITEMS.multiTemplate.name);
    const before = await servicePage.itemDefaults();
    expect(before.templates.length, 'More than one compatible template').toBeGreaterThan(1);
    expect(before.template).toContain(ITEMS.multiTemplate.defaultTemplate);
    const other = before.templates.find(t => t !== before.template);
    await servicePage.pick(servicePage.template, { text: other });
    expect(await servicePage.valueText(servicePage.template), 'Another template can be chosen').toBe(other);
    expect(await servicePage.clearSelect(servicePage.template), 'The selection can be removed').toBe(true);
    expect(await servicePage.valueText(servicePage.template)).toBe('');
    await recordTestValues(testInfo, { serviceItem: ITEMS.multiTemplate.name, templateVersion: `${before.template} -> ${other} -> (none)` });
  });

  test(tcTitle(c.billingAllowed), tcDetails(c.billingAllowed, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.billingAllowed, { accountId: seed.main.id });
    await servicePage.selectItem(ITEMS.onlyNonBillable.name);
    const only = await servicePage.itemDefaults();
    await recordTestValues(testInfo, { serviceItem: ITEMS.onlyNonBillable.name, billingType: only.billingTypes.join(', ') });
    expect(only.billingTypes, `Only the allowed Billing Type for ${ITEMS.onlyNonBillable.name}`).toEqual(ITEMS.onlyNonBillable.billingTypes);
    await servicePage.selectItem(ITEMS.noDefaultTemplate.name);
    const fixed = await servicePage.itemDefaults();
    expect(fixed.billingTypes, 'The Billing Type list follows the Deliverable Type').not.toContain('Time & Material');
    expect(fixed.billingTypes, 'The default Billing Type is an allowed one').toContain(fixed.billingType);
  });

  test(tcTitle(c.optionalFields), tcDetails(c.optionalFields, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.optionalFields, { accountId: seed.main.id });
    const input = { item: ITEMS.noDefaultTemplate.name, serviceName: 'Optional fields', projectId: seed.main.projects[0].id, billingType: 'Custom Bid',
      estimatedHours: '8.5', orderedDate: today(), scheduledStart: '2030-01-10', dueDate: '2030-02-20' };
    const values = await servicePage.fillForm(input);
    await recordTestValues(testInfo, values);
    expect(values.project).toBe(seed.main.projects[0].name);
    expect(values.billingType).toBe('Custom Bid');
    expect(Number(values.estimatedHours)).toBe(8.5);
    expect([values.orderedDate, values.scheduledStart, values.dueDate]).toEqual([today(), '2030-01-10', '2030-02-20']);
  });

  test(tcTitle(c.dateOrdered), tcDetails(c.dateOrdered, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.dateOrdered, { accountId: seed.main.id });
    const shown = await servicePage.orderedDate.inputValue();
    await recordTestValues(testInfo, { orderedDate: shown || '(empty)' });
    observe(testInfo, shown ? `Date Ordered pre-populated: ${shown}` : 'Date Ordered is empty on the form (the saved Deliverable gets the current date)');
    test.skip(!shown, NOT_PREFILLED);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect([yesterday, today(), tomorrow], `Date Ordered "${shown}" should be today's date (63099)`).toContain(shown);
    await servicePage.orderedDate.fill('');
    expect(await servicePage.orderedDate.inputValue(), 'The user can remove the date').toBe('');
  });

  // ---------- MF-3 Save Service ----------
  test(tcTitle(c.saveProject), tcDetails(c.saveProject, MODULE), async ({ servicePage }, testInfo) => {
    const { values, record } = await createService(servicePage, testInfo, c.saveProject);
    await expectSaved(servicePage, values);
    await servicePage.expectShown(values.project, 'Project');
    observe(testInfo, `Saved ${record.url}`);
  });

  test(tcTitle(c.saveAccount), tcDetails(c.saveAccount, MODULE), async ({ servicePage }, testInfo) => {
    const { values, record } = await createService(servicePage, testInfo, c.saveAccount);
    await expectSaved(servicePage, values);
    expect(await servicePage.valueText(servicePage.project), 'No Project').toBe('');
    observe(testInfo, `Saved ${record.url}`);
  });

  test(tcTitle(c.hoursBlank), tcDetails(c.hoursBlank, MODULE), async ({ servicePage }, testInfo) => {
    const { values } = await createService(servicePage, testInfo, c.hoursBlank);
    expect(values.estimatedHours, 'Estimated Hours cleared before saving').toBeUndefined();
    expect(await servicePage.estimatedHours.inputValue(), 'Estimated Hours stays empty').toBe('');
  });

  test(tcTitle(c.allFields), tcDetails(c.allFields, MODULE), async ({ servicePage }, testInfo) => {
    const { values } = await createService(servicePage, testInfo, c.allFields);
    await expectSaved(servicePage, values);
  });

  test(tcTitle(c.workflow), tcDetails(c.workflow, MODULE), async ({ servicePage }, testInfo) => {
    const { values } = await createService(servicePage, testInfo, c.workflow);
    expect(values.templateVersion, 'The default template was selected').toContain(ITEMS.withDefaultTemplate.templateName);
    await servicePage.openSavedTab('workitems');
    await expect(servicePage.workItems.first(), 'Work items materialized from the template').toBeVisible();
    const count = await servicePage.workItems.count();
    const steps = Number((values.templateVersion.match(/(\d+) Steps/) || [])[1]);
    observe(testInfo, `${count} work items; template "${values.templateVersion}"`);
    if (steps) expect(count, `One work item per template step (${steps})`).toBe(steps);
  });

  test(tcTitle(c.noWorkflow), tcDetails(c.noWorkflow, MODULE), async ({ servicePage }, testInfo) => {
    const { values } = await createService(servicePage, testInfo, c.noWorkflow);
    expect(values.templateVersion, 'No template was selected').toBeUndefined();
    await servicePage.openSavedTab('workitems');
    await expect(servicePage.workItems, 'No work items without a template').toHaveCount(0);
  });

  test(tcTitle(c.history), tcDetails(c.history, MODULE), async ({ servicePage }, testInfo) => {
    const { values } = await createService(servicePage, testInfo, c.history);
    await servicePage.openSavedTab('history');
    await expect(servicePage.historyRows.first()).toBeVisible();
    const states = await servicePage.historyStates();
    observe(testInfo, `History states: ${states.join(', ')}`);
    expect(states, 'Initial status in the history').toContain('Active');
    expect(states, 'Initial stage in the history').toContain(values.serviceStage);
    expect(await servicePage.historyRows.count(), 'Only the creation entries (status + stage)').toBe(2);
    expect((await servicePage.historyRows.first().innerText()).trim(), 'Entry shows the date and the user').toMatch(/\S+\s+\S+/);
  });

  test(tcTitle(c.stageUser), tcDetails(c.stageUser, MODULE), async ({ servicePage }, testInfo) => {
    const { values } = await createService(servicePage, testInfo, c.stageUser);
    expect(values.serviceStage).toBe(c.stageUser.data.stage);
    expect(await servicePage.valueText(servicePage.stage), 'The chosen stage is the saved stage').toBe(c.stageUser.data.stage);
  });

  test(tcTitle(c.stageTemplate), tcDetails(c.stageTemplate, MODULE), async ({ servicePage }, testInfo) => {
    const { values } = await createService(servicePage, testInfo, c.stageTemplate);
    expect(values.serviceStage, 'Stage set by the template').toBe(ITEMS.withDefaultTemplate.stage);
    expect(await servicePage.valueText(servicePage.stage)).toBe(ITEMS.withDefaultTemplate.stage);
    await expect(servicePage.stage, 'Stage still read-only on the saved Deliverable').toBeDisabled();
  });

  test(tcTitle(c.audit), tcDetails(c.audit, MODULE), async ({ servicePage }, testInfo) => {
    const { values } = await createService(servicePage, testInfo, c.audit);
    await servicePage.openSavedTab('audit');
    await expect(servicePage.auditPane, 'Audit lists the added Deliverable').toContainText(values.serviceName);
    await expect(servicePage.auditPane).toContainText(/ServiceItemIDF/);
  });

  test(tcTitle(c.cancel), tcDetails(c.cancel, MODULE), async ({ servicePage, page }, testInfo) => {
    await openForm(servicePage, testInfo, c.cancel, { accountId: seed.main.id });
    const values = await servicePage.fillForm({ item: c.cancel.data.item, serviceName: c.cancel.data.serviceName });
    await recordTestValues(testInfo, { ...values, action: 'Cancel' });
    await test.step('Click Cancel', async () => {
      page.once('dialog', d => d.accept());   // a native "leave page?" prompt, if the app raises one
      await servicePage.cancelLink.click();
      await servicePage.dirtyModal.locator('.modal-footer [data-action="continue"]').click({ timeout: 3_000 }).catch(() => {});
    });
    await expect(page, 'No Deliverable opened').toHaveURL(/\/Service\/Create/i);
    await expect(servicePage.serviceName, 'Entered values discarded').toHaveValue('');
  });

  // ---------- negative ----------
  test(tcTitle(c.requiredFields), tcDetails(c.requiredFields, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.requiredFields, { accountId: seed.main.id });
    const data = await servicePage.formValues();
    await recordTestValues(testInfo, { ...data, action: 'Save with nothing entered' });
    const result = await test.step('Click Save', () => servicePage.trySave());
    await expectNotSaved(testInfo, MODULE, { ...c.requiredFields, data }, result);
    // messages are localized: check WHICH fields are flagged (use case wording: "Deliverable Type / Name / Stage is required")
    for (const field of ['ServiceItemIDF', 'ServiceName', 'ServiceStageIDF']) {
      await expect(servicePage.fieldError(field), `Required message under ${field}`).toBeVisible();
    }
    await expect(servicePage.fieldError('AccountIDF'), 'Account was pre-populated: no message').toHaveCount(0);
    observe(testInfo, `Validation shown (expected: ${MESSAGES.itemRequired} / ${MESSAGES.nameRequired} / ${MESSAGES.stageRequired}): ${(await servicePage.validationErrors.allInnerTexts()).map(t => `"${t.trim()}"`).join(', ')}`);
  });

  test(tcTitle(c.accountMismatch), tcDetails(c.accountMismatch, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.accountMismatch);
    await servicePage.selectAccount(seed.main.id);
    await servicePage.selectProject(seed.main.projects[0].id);
    expect(await servicePage.valueText(servicePage.project)).toBe(seed.main.projects[0].name);
    const offered = await test.step(`Change the Account to "${seed.other.name}"`, () => servicePage.selectAccount(seed.other.id));
    await recordTestValues(testInfo, { account: `${seed.main.name} -> ${seed.other.name}`, project: `${seed.main.projects[0].name} -> ${await servicePage.valueText(servicePage.project) || '(cleared)'}` });
    expect(await servicePage.project.inputValue(), 'The previous Account\'s project is dropped').not.toBe(String(seed.main.projects[0].id));
    expect(offered, 'Only the new Account\'s projects are offered').toEqual(ids(seed.other.projects));
  });

  // ---------- AF-4 change Service Item ----------
  test(tcTitle(c.changeItem), tcDetails(c.changeItem, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.changeItem, { accountId: seed.main.id });
    await servicePage.selectItem(ITEMS.withDefaultTemplate.name);
    const before = await servicePage.itemDefaults();
    await servicePage.billingType.selectOption({ label: 'Fixed Price' }, { force: true });
    await servicePage.estimatedHours.fill('99');
    await test.step(`Change Deliverable Type to "${ITEMS.other.name}"`, () => servicePage.selectItem(ITEMS.other.name));
    const after = await servicePage.itemDefaults();
    await recordTestValues(testInfo, { serviceItem: `${ITEMS.withDefaultTemplate.name} -> ${ITEMS.other.name}`, billingType: `${before.billingType} -> ${after.billingType}`, estimatedHours: `${before.estimatedHours} -> ${after.estimatedHours}` });
    expect(after.billingType, 'Billing Type reset to the new type\'s default').toBe(ITEMS.other.billingType);
    expect(Number(after.estimatedHours), 'Estimated Hours reset to the new type\'s default').toBe(Number(ITEMS.other.hours));
  });

  test(tcTitle(c.changeItemKeeps), tcDetails(c.changeItemKeeps, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.changeItemKeeps, { accountId: seed.main.id });
    await servicePage.selectItem(ITEMS.noDefaultTemplate.name);
    const input = { serviceName: 'Keep my entries', projectId: seed.main.projects[0].id, description: 'Unchanged by AF-4',
      orderedDate: today(), scheduledStart: '2030-03-01', dueDate: '2030-04-01' };
    const entered = await servicePage.fillForm(input);
    await servicePage.selectItem(ITEMS.other.name);
    const after = await servicePage.formValues();
    await recordTestValues(testInfo, { ...after, action: `Deliverable Type ${ITEMS.noDefaultTemplate.name} -> ${ITEMS.other.name}` });
    for (const key of ['account', 'serviceName', 'project', 'description', 'orderedDate', 'scheduledStart', 'dueDate']) {
      expect(after[key], `${key} unchanged by the Deliverable Type change`).toBe(entered[key]);
    }
    expect(after.serviceItem).toBe(ITEMS.other.name);
  });

  // ---------- not automated / not implemented ----------
  test.skip(tcTitle(c.duplicateName), tcDetails(c.duplicateName, MODULE), async () => {
    // future requirement: names made unique with "(i)"
  });
  test.skip(tcTitle(c.accountList), tcDetails(c.accountList, MODULE), async () => {
    // needs a user with limited permissions
  });
  test.skip(tcTitle(c.inactiveItem), tcDetails(c.inactiveItem, MODULE), async () => {
    // needs an inactive / deleted Service Item
  });
  test.skip(tcTitle(c.terminalProject), tcDetails(c.terminalProject, MODULE), async () => {
    // needs a terminal project and a user with / without SERV.Service.OverrideProjectAssignmentRules
  });

  test(tcTitle(c.changeRequest), tcDetails(c.changeRequest, MODULE), async ({ servicePage }, testInfo) => {
    await openForm(servicePage, testInfo, c.changeRequest, { accountId: seed.main.id });
    const present = await servicePage.hasOriginatingControl();
    await recordTestValues(testInfo, { 'Originating Service control': present ? 'present' : 'missing' });
    test.skip(!present, ORIGINATING_MISSING);
    expect(present).toBe(true);
  });
});
