const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { LoginPage } = require('../pages/login/loginPage');
const { ServiceItemPage } = require('../pages/service/serviceItemPage');
const { MODULE, TEXT, ALL_BILLING, UNITS, LIMITS, serviceItemCases: c } = require('../testData/serviceItemData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUrl, knownDefectFor } = require('../utils/testCase');

/**
 * Use case 62419 - SERV.Create Service Item ("Deliverable Type" in the sandbox UI): Add New (+) -> Deliverable Type ->
 * /ServiceItem/Create -> Save -> /ServiceItem/Edit/{id} (62420 View & Update Service Item).
 *
 * 31 test cases (TC_SI_001 - TC_SI_031): page load and dirty tracking (MF-1), successful creation with the use case's
 * data (MF-2 to MF-7), billing-type rules (MF-3, BR-1, BR-2), the duplicate-name soft warning (MF-4, BR-5), required /
 * data-type validation (MF-5), postconditions (Recently Viewed, Audit, the new type used by Add Deliverable), the
 * use-case fields missing from the sandbox form (TC_SI_029, known defect) and the permission check (TC_SI_030, needs a
 * second user - skipped without one).
 *
 * Test data: testData/serviceItemData.js - every name is "Playwright <label> <MMDD-HHmmss>". NO CLEANUP: every
 * Deliverable Type a test creates stays in the sandbox and is listed in
 * reports/excel/create-service-item/Atlas_CreateServiceItem_<date>.xlsx (sheet "Deliverable Types Created").
 *
 * Not automated: use-case TC 3 (EntityField metadata cannot be made unavailable from the browser).
 * The tests are independent (each creates its own records), so they may run on several workers.
 */

const allCases = Object.fromEntries([...c.created.map(tc => [tc.id, tc]), ...Object.entries(c).filter(([k]) => k !== 'created')]);
const sorted = list => [...list].sort();
const sameNumber = (shown, entered) => Number(shown) === Number(entered);
/** Values for the report: arrays joined, no default shown as "(none)". */
const shownValues = data => ({ ...data, defaultBillingType: data.defaultBillingType || (data.allowedBillingTypes ? '(none)' : undefined) });
const caseVariant = (text, variant) => (variant === 'upper' ? text.toUpperCase() : text.toLowerCase());

test.describe('Service Item - Create Deliverable Type (62419)', () => {
  test.describe.configure({ timeout: 180_000 });

  // TC_SI_029 checks a known gap of the sandbox: Playwright expects it to fail (Excel: "Known Defect")
  test.beforeEach(async ({}, testInfo) => knownDefectFor(testInfo, allCases));

  async function snap(page, testInfo, label) {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }

  async function observe(testInfo, text) {
    testInfo.annotations.push({ type: 'Observed', description: text });
  }

  /** Opens Add Deliverable Type and logs its URL. */
  async function openForm(serviceItemPage, testInfo, tc) {
    await applyAllureLabels(tc, MODULE);
    await test.step('Open Add Deliverable Type (/ServiceItem/Create)', () => serviceItemPage.gotoCreate());
    await recordUrl(testInfo, serviceItemPage.page.url(), 'Add Deliverable Type');
  }

  /** Fills the form with `data`, saves it, expects View & Update and logs the new record. Returns { id, url }. */
  async function createItem(serviceItemPage, testInfo, tc, data, label = 'Create') {
    return test.step(`${label}: save "${data.serviceItemName}" (MF-2 to MF-7)`, async () => {
      if (!serviceItemPage.isOnCreate()) await serviceItemPage.gotoCreate();
      await serviceItemPage.fillForm(data);
      await snap(serviceItemPage.page, testInfo, `${label.toLowerCase().replace(/\W+/g, '-')}-form`);
      const record = await serviceItemPage.saveNew();
      await recordCreated(testInfo, MODULE, tc, shownValues(data), record);
      await recordUrl(testInfo, record.url, `Deliverable Type #${record.id}`);
      await expect(serviceItemPage.recordAddedMessage.first(), `"${TEXT.added}"`).toBeVisible({ timeout: 30_000 });
      return record;
    });
  }

  /** View & Update shows exactly the entered values (MF-6, MF-7). */
  async function expectSaved(serviceItemPage, data) {
    await test.step('View & Update shows the saved values', async () => {
      const shown = await serviceItemPage.readForm();
      expect(shown.serviceItemName, 'Deliverable Type Name').toBe(data.serviceItemName);
      expect(shown.description, 'Description').toBe(data.description);
      expect(shown.accountName, 'Account Name').toBe(data.accountName);
      expect(shown.accountingId, 'Accounting ID').toBe(data.accountingId);
      expect(shown.isTaxable, 'Taxable').toBe(!!data.isTaxable);
      expect(sorted(shown.allowedBillingTypes), 'Allowed Billing Types').toEqual(sorted(data.allowedBillingTypes));
      if (data.defaultBillingType) expect(shown.defaultBillingType, 'Default Billing Type').toBe(data.defaultBillingType);
      else if (data.allowedBillingTypes.length > 1) expect(shown.defaultBillingType, 'No default Billing Type').toBe('');
      expect(shown.unitOfMeasure, 'Unit Of Measure').toBe(data.unitOfMeasure);
      if (data.typicalHours !== '') {
        expect(sameNumber(shown.typicalHours, data.typicalHours), `Typical Estimated Hours ${data.typicalHours} (shown "${shown.typicalHours}")`).toBe(true);
      }
      await expect(serviceItemPage.statusBadge, 'New record is Active').toHaveText(new RegExp(TEXT.activeStatus, 'i'));
    });
  }

  /** Add Deliverable (/Service/Create) with the new Deliverable Type chosen; returns the defaults it applied. */
  async function deliverableDefaults(servicePage, itemName) {
    return test.step(`Add Deliverable -> Deliverable Type "${itemName}"`, async () => {
      await expect(async () => {
        await servicePage.gotoCreate();
        await expect(servicePage.serviceItem.locator('option', { hasText: itemName }), 'New Deliverable Type is offered').toHaveCount(1, { timeout: 5_000 });
      }).toPass({ timeout: 90_000, intervals: [5_000, 10_000] });
      await servicePage.selectItem(itemName);
      return servicePage.itemDefaults();
    });
  }

  /** Save is blocked: a validation message shows and the form stays on Add Deliverable Type. */
  async function expectBlocked(serviceItemPage, testInfo, tc) {
    await serviceItemPage.clickSave();
    const outcome = await serviceItemPage.saveOutcome(30_000).catch(() => 'none');
    if (outcome === 'saved') {
      const record = await serviceItemPage.savedRecord();
      await recordCreated(testInfo, MODULE, tc, shownValues(tc.data || {}), record);
      throw new Error(`DEFECT: the Deliverable Type was saved (${record.url}) although ${tc.name.toLowerCase()}`);
    }
    await observe(testInfo, `Shown: ${await serviceItemPage.visibleMessages() || '(no message)'}`);
    await snap(serviceItemPage.page, testInfo, 'validation');
    await expect(serviceItemPage.page, 'Still on Add Deliverable Type - nothing saved').toHaveURL(/\/ServiceItem\/Create/i);
  }

  // ================================================================== MF-1 open the page / dirty tracking
  test(tcTitle(c.open), tcDetails(c.open, MODULE), async ({ serviceItemPage, page }, testInfo) => {
    await applyAllureLabels(c.open, MODULE);
    await test.step('Add New (+) -> Deliverable Type', () => serviceItemPage.openFromAddNew());
    await recordUrl(testInfo, page.url(), 'Add Deliverable Type');
    await recordTestValues(testInfo, { entry: 'Add New (+) -> Deliverable Type' });
    await snap(page, testInfo, 'add-form');

    await test.step('Add Mode with every field', async () => {
      await expect(serviceItemPage.heading, 'Heading').toContainText(TEXT.heading);
      for (const [what, control] of [['Deliverable Type Name', serviceItemPage.serviceItemName], ['Description', serviceItemPage.description],
        ['Account Name', serviceItemPage.accountName], ['Accounting ID', serviceItemPage.accountingId], ['Unit Of Measure', serviceItemPage.unitOfMeasure],
        ['Typical Estimated Hours', serviceItemPage.typicalHours], ['Taxable switch', serviceItemPage.taxableTrack], ['Save', serviceItemPage.saveButton],
        ['Cancel', serviceItemPage.cancelLink], ['Clear Default', serviceItemPage.clearDefaultLink]]) {
        await expect(control, `${what} is shown`).toBeVisible();
      }
    });
    await test.step('Nothing is pre-filled', async () => {
      const shown = await serviceItemPage.readForm();
      expect(shown, 'Empty Add form').toEqual({ serviceItemName: '', description: '', accountName: '', accountingId: '', isTaxable: false,
        allowedBillingTypes: [], defaultBillingType: '', unitOfMeasure: '', typicalHours: '' });
    });
    await test.step('Allowed Billing Types multi-select and Unit Of Measure options', async () => {
      expect(sorted(await serviceItemPage.billingTypeNames()), 'Billing types offered (usysBillingType)').toEqual(sorted(ALL_BILLING));
      await expect(serviceItemPage.defaultRadios, 'One default radio per billing type').toHaveCount(ALL_BILLING.length);
      expect(await serviceItemPage.unitOptions(), 'Unit Of Measure options').toEqual(UNITS);
    });
    const missing = [];
    for (const [field, locator] of Object.entries(serviceItemPage.specOnlyFields())) if (!(await locator.count())) missing.push(field);
    if (missing.length) await observe(testInfo, `Use-case fields not on the sandbox Add form: ${missing.join(', ')} (see TC_SI_029)`);
  });

  test(tcTitle(c.dirtyStay), tcDetails(c.dirtyStay, MODULE), async ({ serviceItemPage, page }, testInfo) => {
    const tc = c.dirtyStay;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, tc.data);
    await serviceItemPage.fillForm(tc.data);
    const warning = await test.step('Leave the page -> unsaved-changes warning -> Cancel', () => serviceItemPage.leaveWithUnsavedChanges('cancel'));
    await observe(testInfo, `Warning: ${warning}`);
    await expect(page, 'Still on Add Deliverable Type').toHaveURL(/\/ServiceItem\/Create/i);
    await expect(serviceItemPage.serviceItemName, 'Typed name kept').toHaveValue(tc.data.serviceItemName);
  });

  test(tcTitle(c.dirtyLeave), tcDetails(c.dirtyLeave, MODULE), async ({ serviceItemPage, page }, testInfo) => {
    const tc = c.dirtyLeave;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, tc.data);
    await serviceItemPage.fillForm(tc.data);
    const warning = await test.step('Leave the page -> unsaved-changes warning -> Continue without saving', () => serviceItemPage.leaveWithUnsavedChanges('continue'));
    await observe(testInfo, `Warning: ${warning}`);
    await expect(page, 'Page left (Recently Viewed)').toHaveURL(/\/RecentlyViewed/i, { timeout: 60_000 });
    await expect(page.locator('main').getByText(tc.data.serviceItemName), 'Name was not saved').toHaveCount(0);
  });

  // ================================================================== MF-2 .. MF-7 successful creation
  for (const tc of c.created) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ serviceItemPage, servicePage, page }, testInfo) => {
      await openForm(serviceItemPage, testInfo, tc);
      await recordTestValues(testInfo, shownValues(tc.data));
      await createItem(serviceItemPage, testInfo, tc, tc.data);
      await snap(page, testInfo, 'view-and-update');
      await expectSaved(serviceItemPage, tc.data);

      if (tc.checkTabs) {
        await test.step('View & Update (62420) record tabs', async () => {
          const tabs = await serviceItemPage.tabNames();
          for (const name of ['Details', 'Workflow Templates', 'Documents', 'Tasks', 'Audit']) expect(tabs, `"${name}" tab`).toContain(name);
        });
      }
      if (tc.checkDeliverable) {
        const d = await deliverableDefaults(servicePage, tc.data.serviceItemName);
        await observe(testInfo, `Add Deliverable: billing types ${d.billingTypes.join(', ')}; selected "${d.billingType}"`);
        expect(d.billingTypes, 'Only the allowed billing type is offered').toEqual(tc.data.allowedBillingTypes);
        expect(d.billingType, 'The single allowed billing type is the default').toBe(tc.data.allowedBillingTypes[0]);
      }
    });
  }

  // ================================================================== MF-4 duplicate name (soft warning)
  /** Creates the original, then fills the form again with the same name in another case and saves. */
  async function saveDuplicate(serviceItemPage, testInfo, tc) {
    const original = await createItem(serviceItemPage, testInfo, tc, tc.original, 'Original');
    const duplicate = { ...tc.original, serviceItemName: caseVariant(tc.original.serviceItemName, tc.caseVariant), accountingId: `${tc.original.accountingId}-B` };
    await recordTestValues(testInfo, { 'Existing Name': tc.original.serviceItemName, 'Existing Record': original.url, ...shownValues(duplicate) });
    await test.step(`Save "${duplicate.serviceItemName}" (same name, ${tc.caseVariant} case)`, async () => {
      await serviceItemPage.gotoCreate();
      await serviceItemPage.fillForm(duplicate);
      await serviceItemPage.clickSave();
    });
    const outcome = await serviceItemPage.saveOutcome();
    await snap(serviceItemPage.page, testInfo, 'after-duplicate-save');
    if (outcome === 'saved') {
      const record = await serviceItemPage.savedRecord();
      await recordCreated(testInfo, MODULE, tc, shownValues(duplicate), record);
      throw new Error(`DEFECT (MF-4): the duplicate name was saved (${record.url}) without a warning`);
    }
    expect(outcome, `MF-4 duplicate-name warning (shown: ${await serviceItemPage.visibleMessages()})`).toBe('duplicate');
    const warning = await serviceItemPage.duplicateDetails();
    await observe(testInfo, `Warning: ${warning.text}${warning.href ? ` (link ${warning.href})` : ''}`);
    return { original, duplicate, warning };
  }

  test(tcTitle(c.duplicateWarning), tcDetails(c.duplicateWarning, MODULE), async ({ serviceItemPage, page }, testInfo) => {
    const tc = c.duplicateWarning;
    await openForm(serviceItemPage, testInfo, tc);
    const { original, warning } = await saveDuplicate(serviceItemPage, testInfo, tc);
    expect(warning.text, 'Warning text').toMatch(/\S/);
    expect(warning.id, `Warning links to the existing record #${original.id} (href "${warning.href}")`).toBe(original.id);
    await expect(page, 'Soft warning: the form stays open, nothing saved yet').toHaveURL(/\/ServiceItem\/Create/i);
  });

  test(tcTitle(c.duplicateProceed), tcDetails(c.duplicateProceed, MODULE), async ({ serviceItemPage }, testInfo) => {
    const tc = c.duplicateProceed;
    await openForm(serviceItemPage, testInfo, tc);
    const { original, duplicate } = await saveDuplicate(serviceItemPage, testInfo, tc);
    const record = await test.step('Proceed with the duplicate name', async () => {
      if (!(await serviceItemPage.duplicateProceedButton.isVisible().catch(() => false))) await serviceItemPage.fillForm(duplicate);
      return serviceItemPage.proceedAfterDuplicate();
    });
    await recordCreated(testInfo, MODULE, tc, shownValues(duplicate), record);
    await recordUrl(testInfo, record.url, `Deliverable Type #${record.id}`);
    expect(record.id, 'A second, separate record is created').not.toBe(original.id);
    await expectSaved(serviceItemPage, duplicate);
  });

  test(tcTitle(c.duplicateRevise), tcDetails(c.duplicateRevise, MODULE), async ({ serviceItemPage }, testInfo) => {
    const tc = c.duplicateRevise;
    await openForm(serviceItemPage, testInfo, tc);
    const { duplicate } = await saveDuplicate(serviceItemPage, testInfo, tc);
    const revised = { ...duplicate, serviceItemName: tc.revisedName };
    await test.step(`Revise the name to "${revised.serviceItemName}" and save`, async () => {
      if (await serviceItemPage.duplicateProceedButton.isVisible().catch(() => false)) {
        // a dialog-style warning: close it without proceeding, then edit the name
        await serviceItemPage.page.keyboard.press('Escape');
      }
      await serviceItemPage.fillForm(revised);
      await serviceItemPage.clickSave();
    });
    const outcome = await serviceItemPage.saveOutcome();
    expect(outcome, `Saved under the revised name without another warning (shown: ${await serviceItemPage.visibleMessages()})`).toBe('saved');
    const record = await serviceItemPage.savedRecord();
    await recordCreated(testInfo, MODULE, tc, shownValues(revised), record);
    await recordUrl(testInfo, record.url, `Deliverable Type #${record.id}`);
    await expectSaved(serviceItemPage, revised);
  });

  // ==================================================================== MF-5 validation
  test(tcTitle(c.emptyForm), tcDetails(c.emptyForm, MODULE), async ({ serviceItemPage }, testInfo) => {
    const tc = c.emptyForm;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, { action: 'Save with every field empty' });
    await expectBlocked(serviceItemPage, testInfo, tc);
    for (const [field, message] of [['ServiceItemName', TEXT.nameRequired], ['AccountingID', TEXT.accountingIdRequired],
      ['UnitOfMeasureIDF', TEXT.unitRequired], ['billing', TEXT.billingRequired]]) {
      await expect(serviceItemPage.fieldMessage(field), `"${message}"`).toHaveText(message);
    }
  });

  for (const tc of [c.noBilling, c.noName, c.noAccountingId, c.noUnit, c.blankName]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ serviceItemPage }, testInfo) => {
      await openForm(serviceItemPage, testInfo, tc);
      await recordTestValues(testInfo, shownValues(tc.data));
      await serviceItemPage.fillForm(tc.data);
      await expectBlocked(serviceItemPage, testInfo, tc);
      const message = serviceItemPage.fieldMessage(tc.field);
      if (tc.message) {
        await expect(message, `"${tc.message}"`).toHaveText(tc.message);
      } else {
        // Spaces pass the browser check; the server refuses the name and returns the form with the name cleared
        // (observed: no message is shown then). Rejected = a message for the field, or the name sent back empty.
        await expect.poll(async () => ((await message.innerText().catch(() => '')).trim() ? 'message'
          : (await serviceItemPage.serviceItemName.inputValue()) === '' ? 'name cleared' : ''),
        { message: 'Name rejected: validation message shown or the name sent back empty', timeout: 30_000 }).not.toBe('');
        const shown = (await message.innerText().catch(() => '')).trim();
        await observe(testInfo, shown ? `Message: ${shown}` : 'Rejected by the server: the form came back with the name cleared and no validation message (billing types also cleared)');
      }
    });
  }

  // ================================================================== BR-1 default handling
  test(tcTitle(c.oneDefault), tcDetails(c.oneDefault, MODULE), async ({ serviceItemPage }, testInfo) => {
    const tc = c.oneDefault;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, { ...shownValues(tc.data), 'Defaults Clicked': tc.defaultsTried });
    await serviceItemPage.fillForm({ ...tc.data, defaultBillingType: '' });
    for (const type of tc.defaultsTried) {
      await test.step(`Mark "${type}" as default`, async () => {
        await serviceItemPage.markDefault(type);
        await expect(serviceItemPage.defaultRadios.and(serviceItemPage.page.locator(':checked')), 'Exactly one default').toHaveCount(1);
        expect(await serviceItemPage.defaultBillingType(), 'The last one marked is the default').toBe(type);
      });
    }
    await createItem(serviceItemPage, testInfo, tc, tc.data);
    await expectSaved(serviceItemPage, tc.data);
  });

  test(tcTitle(c.clearDefault), tcDetails(c.clearDefault, MODULE), async ({ serviceItemPage }, testInfo) => {
    const tc = c.clearDefault;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, { ...shownValues(tc.data), 'Default Before Clear': tc.defaultBeforeClear });
    await serviceItemPage.fillForm({ ...tc.data, defaultBillingType: tc.defaultBeforeClear });
    expect(await serviceItemPage.defaultBillingType(), 'Default marked').toBe(tc.defaultBeforeClear);
    await test.step('Clear Default', () => serviceItemPage.clearDefault());
    expect(await serviceItemPage.defaultBillingType(), 'No default after Clear Default').toBe('');
    expect(sorted(await serviceItemPage.checkedBillingTypes()), 'Billing types stay ticked').toEqual(sorted(tc.data.allowedBillingTypes));
    await createItem(serviceItemPage, testInfo, tc, tc.data);
    await expectSaved(serviceItemPage, tc.data);
  });

  // ================================================================== MF-2 data type / length
  test(tcTitle(c.lengths), tcDetails(c.lengths, MODULE), async ({ serviceItemPage }, testInfo) => {
    const tc = c.lengths;
    await openForm(serviceItemPage, testInfo, tc);
    const fields = [['serviceItemName', serviceItemPage.serviceItemName], ['description', serviceItemPage.description],
      ['accountName', serviceItemPage.accountName], ['accountingId', serviceItemPage.accountingId]];
    const typed = {};
    for (const [key, control] of fields) {
      const value = `${env.keyword}${'x'.repeat(LIMITS[key] + tc.overflow)}`.slice(0, LIMITS[key] + tc.overflow);
      typed[key] = `${value.length} characters`;
      await test.step(`Type ${value.length} characters into ${key} (max ${LIMITS[key]})`, async () => {
        await control.fill('');
        await control.pressSequentially(value);
        expect((await control.inputValue()).length, `${key} keeps ${LIMITS[key]} characters`).toBe(LIMITS[key]);
      });
    }
    await recordTestValues(testInfo, typed);
  });

  test(tcTitle(c.hoursNumeric), tcDetails(c.hoursNumeric, MODULE), async ({ serviceItemPage }, testInfo) => {
    const tc = c.hoursNumeric;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, { 'Typed Into Typical Estimated Hours': tc.typed });
    await serviceItemPage.typicalHours.pressSequentially(tc.typed);
    await expect(serviceItemPage.typicalHours, `Only "${tc.expectedValue}" is kept`).toHaveValue(tc.expectedValue);
  });

  test(tcTitle(c.cancel), tcDetails(c.cancel, MODULE), async ({ serviceItemPage, page }, testInfo) => {
    const tc = c.cancel;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, shownValues(tc.data));
    await serviceItemPage.fillForm(tc.data);
    const acceptLeave = d => d.accept();   // a leftover browser "leave page?" prompt is accepted
    page.on('dialog', acceptLeave);
    try {
      await test.step('Cancel', async () => {
        await serviceItemPage.cancelLink.click();
        await page.waitForLoadState('domcontentloaded');
      });
    } finally {
      page.off('dialog', acceptLeave);
    }
    await expect(page).toHaveURL(/\/ServiceItem\/Create/i);
    await expect(serviceItemPage.serviceItemName, 'Form is empty again').toHaveValue('', { timeout: 30_000 });
    expect(await serviceItemPage.checkedBillingTypes(), 'No billing type ticked').toEqual([]);
  });

  // ================================================================== postconditions
  test(tcTitle(c.recentlyViewed), tcDetails(c.recentlyViewed, MODULE), async ({ serviceItemPage, page }, testInfo) => {
    const tc = c.recentlyViewed;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, shownValues(tc.data));
    await createItem(serviceItemPage, testInfo, tc, tc.data);
    await test.step('Recently Viewed lists the new Deliverable Type', async () => {
      await expect(async () => {
        await serviceItemPage.openRecord('/RecentlyViewed', { timeout: 60_000 });
        await expect(page.locator('main').getByText(tc.data.serviceItemName).first()).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 90_000, intervals: [3_000, 5_000] });
    });
    await snap(page, testInfo, 'recently-viewed');
  });

  test(tcTitle(c.audit), tcDetails(c.audit, MODULE), async ({ serviceItemPage, page }, testInfo) => {
    const tc = c.audit;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, shownValues(tc.data));
    const record = await createItem(serviceItemPage, testInfo, tc, tc.data);
    await test.step('Audit tab lists the created values', async () => {
      await expect(async () => {
        await serviceItemPage.openEdit(record.id);
        await serviceItemPage.openAuditTab();
        await expect(serviceItemPage.auditPane).toContainText(tc.data.serviceItemName, { timeout: 10_000 });
      }).toPass({ timeout: 90_000, intervals: [3_000, 5_000] });
    });
    await observe(testInfo, `Audit: ${(await serviceItemPage.auditPane.innerText()).replace(/\s+/g, ' ').slice(0, 300)}`);
    await snap(page, testInfo, 'audit');
  });

  test(tcTitle(c.usableOnDeliverable), tcDetails(c.usableOnDeliverable, MODULE), async ({ serviceItemPage, servicePage, page }, testInfo) => {
    const tc = c.usableOnDeliverable;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, shownValues(tc.data));
    await createItem(serviceItemPage, testInfo, tc, tc.data);
    const d = await deliverableDefaults(servicePage, tc.data.serviceItemName);
    await observe(testInfo, `Add Deliverable: billing types ${d.billingTypes.join(', ')}; selected "${d.billingType}"; hours ${d.estimatedHours}`);
    await snap(page, testInfo, 'add-deliverable');
    expect(sorted(d.billingTypes), 'Only the allowed billing types').toEqual(sorted(tc.data.allowedBillingTypes));
    expect(d.billingType, 'The default billing type is selected').toBe(tc.data.defaultBillingType);
    expect(sameNumber(d.estimatedHours, tc.data.typicalHours), `Estimated Hours = ${tc.data.typicalHours} (shown "${d.estimatedHours}")`).toBe(true);
  });

  // ================================================================== gaps / permissions
  test(tcTitle(c.specFields), tcDetails(c.specFields, MODULE), async ({ serviceItemPage }, testInfo) => {
    const tc = c.specFields;
    await openForm(serviceItemPage, testInfo, tc);
    await recordTestValues(testInfo, { 'Fields Checked': Object.keys(serviceItemPage.specOnlyFields()) });
    const fields = serviceItemPage.specOnlyFields();
    const missing = [];
    for (const [field, locator] of Object.entries(fields)) if (!(await locator.count())) missing.push(field);
    await observe(testInfo, missing.length ? `Missing on the Add form: ${missing.join(', ')}` : 'All use-case fields are on the Add form');
    for (const [field, locator] of Object.entries(fields)) await expect(locator.first(), `"${field}" on the Add form (MF-1.2)`).toBeVisible({ timeout: 3_000 });
  });

  test(tcTitle(c.noPermission), tcDetails(c.noPermission, MODULE), async ({ browser }, testInfo) => {
    const tc = c.noPermission;
    test.skip(!tc.user.email || !tc.user.password, 'Set SI_NO_PERMISSION_EMAIL / SI_NO_PERMISSION_PASSWORD (a user without SERV.ServiceItem.Create) in .env');
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { 'Signed-in User': tc.user.email });
    const context = await browser.newContext({ baseURL: env.baseURL, viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      const loginPage = new LoginPage(page);
      await page.goto('/task', { waitUntil: 'domcontentloaded' });
      await loginPage.signInWith(tc.user.email, tc.user.password);
      await page.waitForURL(url => !/Identity\/Account\/Login/i.test(url.toString()), { timeout: 30_000 });
      await page.goto(ServiceItemPage.createPath, { waitUntil: 'domcontentloaded' });
      await recordUrl(testInfo, page.url(), 'Create attempt');
      await testInfo.attach('no-permission', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await expect(page.locator('#form-serviceitem'), 'No Add Deliverable Type form for a user without the permission').toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
