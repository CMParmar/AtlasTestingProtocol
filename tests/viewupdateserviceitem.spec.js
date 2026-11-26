const { test, expect } = require('../fixtures/fixtures');
const { ACCOUNTS } = require('../testData/serviceData');
const { MODULE, TEXT, TABS, serviceItemUpdateCases: c } = require('../testData/serviceItemUpdateData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUpdated, recordUrl, knownDefectFor } = require('../utils/testCase');

/**
 * Use case 62420 - View & Update Service Item ("Deliverable Type" in the sandbox UI): /ServiceItem/Edit/{id}.
 *
 * 39 test cases (TC_SIU_001 - TC_SIU_039): loading the record (MF-1), saving field / billing-type changes (MF-4),
 * the duplicate-name warning (MF-2, SERV-1), validation and boundaries, unsaved-changes warning (CORE-1), Recently Viewed
 * and Audit after a save, downstream use by Add Deliverable, the compatible workflow templates panel (MF-6, 63454), the
 * Documents / Tasks / Audit tabs and Signals, soft delete allowed / blocked (MF-5, AF-SoftDeleteBlocked, SERV-3), and the
 * use-case parts missing from the sandbox (TC_SIU_038 DefaultRate / isActive, TC_SIU_039 related Services panel - both
 * known defects, reported as "Known Defect").
 *
 * Every test first creates its own Deliverable Type ("Playwright VU <label> <MMDD-HHmmss>", testData/serviceItemUpdateData.js)
 * through Add Deliverable Type (62419) and then works on it, so the tests are independent and may run in parallel.
 * NO CLEANUP: the records stay in the sandbox; only TC_SIU_036 soft-deletes the record it created to test Delete.
 * Excel: reports/excel/view-update-service-item/Atlas_ViewUpdateServiceItem_<date>.xlsx
 */

const allCases = Object.fromEntries(Object.values(c).map(tc => [tc.id, tc]));
const sorted = list => [...list].sort();
const sameNumber = (a, b) => Number(a) === Number(b);
const shownValues = data => ({ ...data, defaultBillingType: data.defaultBillingType || (data.allowedBillingTypes ? '(none)' : undefined) });
const caseVariant = (text, variant) => (variant === 'upper' ? text.toUpperCase() : variant === 'lower' ? text.toLowerCase() : text);

test.describe('Service Item - View & Update Deliverable Type (62420)', () => {
  test.describe.configure({ timeout: 240_000 });

  // TC_SIU_038 / 039 check known gaps of the sandbox: Playwright expects them to fail (Excel: "Known Defect")
  test.beforeEach(async ({}, testInfo) => knownDefectFor(testInfo, allCases));

  async function snap(page, testInfo, label) {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }

  async function observe(testInfo, text) {
    testInfo.annotations.push({ type: 'Observed', description: text });
  }

  /** Creates a Deliverable Type through Add Deliverable Type (62419) and opens it fresh in View & Update. Returns { id, url }. */
  async function createItem(serviceItemEditPage, testInfo, tc, data, label = 'Seed') {
    return test.step(`${label}: create "${data.serviceItemName}" (62419)`, async () => {
      await serviceItemEditPage.gotoCreate();
      await serviceItemEditPage.fillForm(data);
      const record = await serviceItemEditPage.saveNew();
      await recordCreated(testInfo, MODULE, tc, shownValues(data), record);
      await serviceItemEditPage.openEdit(record.id);   // fresh page: no "record added" alert left on screen
      return record;
    });
  }

  /** Labels, test values, seed record and its URL - the start of every test. */
  async function start(serviceItemEditPage, testInfo, tc, values) {
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, values || { ...prefix('Seed', shownValues(tc.seed)), ...(tc.update ? prefix('Update', shownValues(tc.update)) : {}) });
    const record = await createItem(serviceItemEditPage, testInfo, tc, tc.seed);
    await recordUrl(testInfo, record.url, `Deliverable Type #${record.id}`);
    return record;
  }

  /** { Seed Name: ..., ... } - keys prefixed so seed and update values both fit in "Test Values". */
  function prefix(p, data) {
    const labels = { serviceItemName: 'Name', description: 'Description', accountName: 'Account Name', accountingId: 'Accounting ID', isTaxable: 'Taxable',
      allowedBillingTypes: 'Billing Types', defaultBillingType: 'Default Billing Type', unitOfMeasure: 'Unit Of Measure', typicalHours: 'Typical Hours' };
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [`${p} ${labels[k] || k}`, v]));
  }

  /** The form shows `expected` (only the keys given). */
  async function expectValues(serviceItemEditPage, expected, what = 'Record') {
    const shown = await serviceItemEditPage.readForm();
    for (const [k, v] of Object.entries(expected)) {
      if (k === 'allowedBillingTypes') expect(sorted(shown[k]), `${what}: Allowed Billing Types`).toEqual(sorted(v));
      else if (k === 'typicalHours') { if (v !== '') expect(sameNumber(shown[k], v), `${what}: Typical Estimated Hours ${v} (shown "${shown[k]}")`).toBe(true); }
      else if (k === 'isTaxable') expect(shown[k], `${what}: Taxable`).toBe(!!v);
      else expect(shown[k], `${what}: ${k}`).toBe(v);
    }
    return shown;
  }

  /** Save, expect "Record saved successfully", re-open and expect the values; logs the update. */
  async function saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, after) {
    await test.step('Save (MF-4) - "Record saved successfully"', async () => {
      const outcome = await serviceItemEditPage.saveChanges();
      expect(outcome, `Saved (shown: ${await serviceItemEditPage.visibleMessages() || 'nothing'})`).toBe('saved');
    });
    await snap(serviceItemEditPage.page, testInfo, 'after-save');
    await test.step('Re-open: the changes persist', async () => {
      await serviceItemEditPage.openEdit(record.id);
      await expectValues(serviceItemEditPage, after, 'Re-opened record');
    });
    await recordUpdated(testInfo, MODULE, tc, before, { ...before, ...after }, record);
  }

  /** Add Deliverable with the Deliverable Type chosen; returns the defaults it applied. Waits until the type is offered. */
  async function deliverableDefaults(servicePage, itemName) {
    return test.step(`Add Deliverable -> Deliverable Type "${itemName}"`, async () => {
      await offeredOnAddDeliverable(servicePage, itemName, true);
      await servicePage.selectItem(itemName);
      return servicePage.itemDefaults();
    });
  }

  /** Waits until Add Deliverable offers (or no longer offers) the Deliverable Type. */
  async function offeredOnAddDeliverable(servicePage, itemName, offered) {
    await expect(async () => {
      await servicePage.gotoCreate();
      const options = (await servicePage.serviceItem.locator('option').allInnerTexts()).map(t => t.trim());
      expect(options.includes(itemName), `"${itemName}" ${offered ? 'is' : 'is not'} offered by Add Deliverable`).toBe(offered);
    }).toPass({ timeout: 120_000, intervals: [5_000, 10_000] });
  }

  // ================================================================== MF-1 open
  test(tcTitle(c.load), tcDetails(c.load, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.load;
    const record = await start(serviceItemEditPage, testInfo, tc);
    await snap(page, testInfo, 'view-and-update');
    await test.step('Every editable field shows the saved value', () => expectValues(serviceItemEditPage, tc.seed));
    await test.step('Header: name, Active status, Signals', async () => {
      await expect(serviceItemEditPage.pageTitle, 'Page header shows the name').toContainText(tc.seed.serviceItemName);
      await expect(serviceItemEditPage.statusBadge, 'Status').toHaveText(new RegExp(TEXT.activeStatus, 'i'));
      await expect(serviceItemEditPage.signalsButton, 'Signals for this record').toHaveAttribute('data-entity-record-id', record.id);
    });
    await test.step('Related tabs', async () => {
      const tabs = await serviceItemEditPage.tabNames();
      for (const name of TABS) expect(tabs, `"${name}" tab`).toContain(name);
      await observe(testInfo, `Tabs: ${tabs.join(', ')}`);
    });
    await test.step('Actions -> Delete Deliverable Type is offered', async () => {
      await serviceItemEditPage.openDeleteConfirmation();
      await serviceItemEditPage.goBackFromDelete();
    });
  });

  // ================================================================== MF-4 field updates
  for (const tc of [c.textFields, c.unit, c.taxableOn, c.taxableOff, c.hours, c.rename, c.billingAdd, c.billingRemove, c.defaultChange]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ serviceItemEditPage }, testInfo) => {
      const record = await start(serviceItemEditPage, testInfo, tc);
      const before = await serviceItemEditPage.readForm();
      await test.step('Change the values', () => serviceItemEditPage.fillForm(tc.update));
      await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, tc.update);
      if (tc.update.defaultBillingType) {
        await expect(serviceItemEditPage.defaultRadios.and(serviceItemEditPage.page.locator(':checked')), 'Exactly one default billing type').toHaveCount(1);
      }
      if (tc.update.serviceItemName) await expect(serviceItemEditPage.pageTitle, 'Header shows the new name').toContainText(tc.update.serviceItemName);
    });
  }

  test(tcTitle(c.defaultClear), tcDetails(c.defaultClear, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.defaultClear;
    const record = await start(serviceItemEditPage, testInfo, tc);
    const before = await serviceItemEditPage.readForm();
    expect(before.defaultBillingType, 'Saved default').toBe(tc.seed.defaultBillingType);
    await test.step('Clear Default', () => serviceItemEditPage.clearDefault());
    expect(await serviceItemEditPage.defaultBillingType(), 'No default after Clear Default').toBe('');
    await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, { allowedBillingTypes: tc.seed.allowedBillingTypes, defaultBillingType: '' });
  });

  test(tcTitle(c.oneDefault), tcDetails(c.oneDefault, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.oneDefault;
    const record = await start(serviceItemEditPage, testInfo, tc, { ...prefix('Seed', shownValues(tc.seed)), 'Defaults Clicked': tc.defaultsTried });
    const before = await serviceItemEditPage.readForm();
    for (const type of tc.defaultsTried) {
      await test.step(`Mark "${type}" as default`, async () => {
        await serviceItemEditPage.markDefault(type);
        await expect(serviceItemEditPage.defaultRadios.and(page.locator(':checked')), 'Exactly one default').toHaveCount(1);
        expect(await serviceItemEditPage.defaultBillingType(), 'The last one marked is the default').toBe(type);
      });
    }
    await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, tc.update);
  });

  test(tcTitle(c.labor), tcDetails(c.labor, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.labor;
    const record = await start(serviceItemEditPage, testInfo, tc, { ...prefix('Seed', shownValues(tc.seed)), ...prefix('Update', shownValues(tc.update)), 'Labor Each Billing Period': 'On' });
    const before = await serviceItemEditPage.readForm();
    expect(await serviceItemEditPage.laborShown(), 'Labor switch hidden without Subscription').toBe(false);
    await serviceItemEditPage.fillForm(tc.update);
    await expect.poll(() => serviceItemEditPage.laborShown(), { message: 'Labor switch shown once Subscription is ticked' }).toBe(true);
    await serviceItemEditPage.toggleTo(serviceItemEditPage.laborSwitch, true);
    await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, tc.update);
    await expect(serviceItemEditPage.laborSwitch, '"Labor needed each billing period" saved On').toBeChecked();
  });

  // ================================================================== validation (nothing is saved)
  for (const tc of [c.noBilling, c.noName, c.noAccountingId]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ serviceItemEditPage }, testInfo) => {
      const record = await start(serviceItemEditPage, testInfo, tc);
      const before = await serviceItemEditPage.readForm();
      await serviceItemEditPage.fillForm(tc.update);
      const outcome = await serviceItemEditPage.saveChanges(30_000);
      await observe(testInfo, `Shown: ${await serviceItemEditPage.visibleMessages() || '(no message)'}`);
      await snap(serviceItemEditPage.page, testInfo, 'validation');
      expect(outcome, 'Save is blocked with a validation message').toBe('invalid');
      await expect(serviceItemEditPage.fieldMessage(tc.field), `"${tc.message}"`).toHaveText(tc.message);
      await test.step('Re-open: the saved values are unchanged', async () => {
        await serviceItemEditPage.openEdit(record.id);
        await expectValues(serviceItemEditPage, before, 'Re-opened record');
      });
    });
  }

  test(tcTitle(c.accounting100), tcDetails(c.accounting100, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.accounting100;
    const record = await start(serviceItemEditPage, testInfo, tc, { 'Accounting ID Length': tc.update.accountingId.length, 'Accounting ID': tc.update.accountingId });
    const before = await serviceItemEditPage.readForm();
    await serviceItemEditPage.fillForm(tc.update);
    await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, tc.update);
    expect((await serviceItemEditPage.accountingId.inputValue()).length, 'Saved Accounting ID length').toBe(100);
  });

  test(tcTitle(c.accountingOver), tcDetails(c.accountingOver, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.accountingOver;
    const record = await start(serviceItemEditPage, testInfo, tc, { 'Typed Length': tc.typed.length, 'Typed Accounting ID': tc.typed });
    const before = await serviceItemEditPage.readForm();
    await test.step(`Type ${tc.typed.length} characters into Accounting ID`, async () => {
      await serviceItemEditPage.accountingId.fill('');
      await serviceItemEditPage.accountingId.pressSequentially(tc.typed);
      expect((await serviceItemEditPage.accountingId.inputValue()).length, `Field keeps ${tc.limit} characters`).toBe(tc.limit);
    });
    await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, { accountingId: tc.typed.slice(0, tc.limit) });
  });

  test(tcTitle(c.noChanges), tcDetails(c.noChanges, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.noChanges;
    const record = await start(serviceItemEditPage, testInfo, tc);
    const before = await serviceItemEditPage.readForm();
    await test.step('Save without changes', async () => {
      const outcome = await serviceItemEditPage.saveChanges();
      expect(outcome, `Saved (shown: ${await serviceItemEditPage.visibleMessages() || 'nothing'})`).toBe('saved');
    });
    await serviceItemEditPage.openEdit(record.id);
    await expectValues(serviceItemEditPage, before, 'Re-opened record (unchanged)');
  });

  // ================================================================== MF-2 duplicate name
  /** Creates the other record and the record under test, renames the latter to the other's name and saves. */
  async function saveDuplicate(serviceItemEditPage, testInfo, tc) {
    await applyAllureLabels(tc, MODULE);
    const other = await createItem(serviceItemEditPage, testInfo, tc, tc.other, 'Existing record');
    const duplicateName = caseVariant(tc.other.serviceItemName, tc.variant);
    await recordTestValues(testInfo, { 'Existing Name': tc.other.serviceItemName, 'Existing Record': other.url, 'Seed Name': tc.seed.serviceItemName, 'New Name': duplicateName });
    const record = await createItem(serviceItemEditPage, testInfo, tc, tc.seed);
    await recordUrl(testInfo, record.url, `Deliverable Type #${record.id}`);
    await serviceItemEditPage.fillForm({ serviceItemName: duplicateName });
    const outcome = await serviceItemEditPage.saveChanges();
    await snap(serviceItemEditPage.page, testInfo, 'after-duplicate-save');
    if (outcome === 'saved') throw new Error(`DEFECT (MF-2, SERV-1): renamed to the existing name "${duplicateName}" without a warning`);
    expect(outcome, `SERV-1 duplicate-name warning (shown: ${await serviceItemEditPage.visibleMessages()})`).toBe('duplicate');
    const warning = await serviceItemEditPage.duplicateDetails();
    await observe(testInfo, `Warning: ${warning.text}${warning.href ? ` (link ${warning.href})` : ''}`);
    expect(warning.id, `Warning links to the other record #${other.id} (href "${warning.href}")`).toBe(other.id);
    return { record, other, duplicateName };
  }

  test(tcTitle(c.duplicate), tcDetails(c.duplicate, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.duplicate;
    const { record, duplicateName } = await saveDuplicate(serviceItemEditPage, testInfo, tc);
    await test.step('Proceed with the duplicate name', async () => {
      if (!(await serviceItemEditPage.duplicateProceedButton.isVisible().catch(() => false))) await serviceItemEditPage.fillForm({ serviceItemName: duplicateName });
      await serviceItemEditPage.proceedOnEdit();
    });
    await serviceItemEditPage.openEdit(record.id);
    await expectValues(serviceItemEditPage, { serviceItemName: duplicateName }, 'Re-opened record');
    await recordUpdated(testInfo, MODULE, tc, { serviceItemName: tc.seed.serviceItemName }, { serviceItemName: duplicateName }, record);
  });

  test(tcTitle(c.duplicateCase), tcDetails(c.duplicateCase, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.duplicateCase;
    const { record } = await saveDuplicate(serviceItemEditPage, testInfo, tc);
    await test.step('Not saved until the user proceeds', async () => {
      await serviceItemEditPage.openEdit(record.id);
      await expectValues(serviceItemEditPage, { serviceItemName: tc.seed.serviceItemName }, 'Re-opened record');
    });
  });

  test(tcTitle(c.duplicateRevise), tcDetails(c.duplicateRevise, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.duplicateRevise;
    const { record } = await saveDuplicate(serviceItemEditPage, testInfo, tc);
    await test.step(`Revise the name to "${tc.revisedName}" and save`, async () => {
      if (await serviceItemEditPage.duplicateProceedButton.isVisible().catch(() => false)) await serviceItemEditPage.page.keyboard.press('Escape');
      await serviceItemEditPage.fillForm({ serviceItemName: tc.revisedName });
      const outcome = await serviceItemEditPage.saveChanges();
      expect(outcome, `Saved under the revised name without another warning (shown: ${await serviceItemEditPage.visibleMessages()})`).toBe('saved');
    });
    await serviceItemEditPage.openEdit(record.id);
    await expectValues(serviceItemEditPage, { serviceItemName: tc.revisedName }, 'Re-opened record');
    await recordUpdated(testInfo, MODULE, tc, { serviceItemName: tc.seed.serviceItemName }, { serviceItemName: tc.revisedName }, record);
  });

  // ================================================================== CORE-1 unsaved changes / Cancel
  test(tcTitle(c.dirtyStay), tcDetails(c.dirtyStay, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.dirtyStay;
    const record = await start(serviceItemEditPage, testInfo, tc);
    await serviceItemEditPage.fillForm(tc.update);
    const warning = await test.step('Leave -> Dirty Record Warning -> Cancel', () => serviceItemEditPage.leaveWithUnsavedChanges('cancel'));
    await observe(testInfo, `Warning: ${warning}`);
    await expect(page, 'Still on the record').toHaveURL(new RegExp(`/ServiceItem/Edit/${record.id}`, 'i'));
    await expect(serviceItemEditPage.description, 'The change is kept').toHaveValue(tc.update.description);
  });

  test(tcTitle(c.dirtyLeave), tcDetails(c.dirtyLeave, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.dirtyLeave;
    const record = await start(serviceItemEditPage, testInfo, tc);
    await serviceItemEditPage.fillForm(tc.update);
    const warning = await test.step('Leave -> Dirty Record Warning -> Continue without saving', () => serviceItemEditPage.leaveWithUnsavedChanges('continue'));
    await observe(testInfo, `Warning: ${warning}`);
    await expect(page, 'Page left').toHaveURL(/\/RecentlyViewed/i, { timeout: 60_000 });
    await serviceItemEditPage.openEdit(record.id);
    await expectValues(serviceItemEditPage, { accountName: tc.seed.accountName }, 'Re-opened record (change discarded)');
  });

  test(tcTitle(c.cancel), tcDetails(c.cancel, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.cancel;
    const record = await start(serviceItemEditPage, testInfo, tc);
    await serviceItemEditPage.fillForm(tc.update);
    const accept = d => d.accept();
    page.on('dialog', accept);
    try {
      await test.step('Cancel', async () => {
        await serviceItemEditPage.editCancelLink.click();
        await page.waitForLoadState('domcontentloaded');
      });
    } finally {
      page.off('dialog', accept);
    }
    await serviceItemEditPage.openEdit(record.id);
    await expectValues(serviceItemEditPage, { accountName: tc.seed.accountName, unitOfMeasure: tc.seed.unitOfMeasure }, 'Saved values');
  });

  // ================================================================== after a save
  test(tcTitle(c.recentlyViewed), tcDetails(c.recentlyViewed, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.recentlyViewed;
    const record = await start(serviceItemEditPage, testInfo, tc);
    const before = await serviceItemEditPage.readForm();
    await serviceItemEditPage.fillForm(tc.update);
    await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, tc.update);
    await test.step('Recently Viewed lists the updated record', async () => {
      await expect(async () => {
        await serviceItemEditPage.openRecord('/RecentlyViewed', { timeout: 60_000 });
        await expect(page.locator('main').getByText(tc.update.serviceItemName).first()).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 90_000, intervals: [3_000, 5_000] });
    });
    await snap(page, testInfo, 'recently-viewed');
  });

  test(tcTitle(c.audit), tcDetails(c.audit, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.audit;
    const record = await start(serviceItemEditPage, testInfo, tc);
    const before = await serviceItemEditPage.readForm();
    await serviceItemEditPage.fillForm(tc.update);
    await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, tc.update);
    await test.step('Audit lists the old and the new Accounting ID', async () => {
      await expect(async () => {
        await serviceItemEditPage.openEdit(record.id);
        await serviceItemEditPage.openAuditTab();
        await expect(serviceItemEditPage.auditPane).toContainText(tc.update.accountingId, { timeout: 10_000 });
        await expect(serviceItemEditPage.auditPane).toContainText(tc.seed.accountingId, { timeout: 5_000 });
      }).toPass({ timeout: 90_000, intervals: [3_000, 5_000] });
    });
    await observe(testInfo, `Audit: ${(await serviceItemEditPage.auditPane.innerText()).replace(/\s+/g, ' ').slice(0, 300)}`);
    await snap(page, testInfo, 'audit');
  });

  test(tcTitle(c.deliverable), tcDetails(c.deliverable, MODULE), async ({ serviceItemEditPage, servicePage, page }, testInfo) => {
    const tc = c.deliverable;
    const record = await start(serviceItemEditPage, testInfo, tc);
    const before = await serviceItemEditPage.readForm();
    await serviceItemEditPage.fillForm(tc.update);
    await saveAndVerify(serviceItemEditPage, testInfo, tc, record, before, tc.update);
    const d = await deliverableDefaults(servicePage, tc.update.serviceItemName);
    await observe(testInfo, `Add Deliverable: billing types ${d.billingTypes.join(', ')}; selected "${d.billingType}"`);
    await snap(page, testInfo, 'add-deliverable');
    expect(sorted(d.billingTypes), 'Only the updated allowed billing types').toEqual(sorted(tc.update.allowedBillingTypes));
    expect(d.billingType, 'The updated default is selected').toBe(tc.update.defaultBillingType);
  });

  // ================================================================== MF-6 compatible workflow templates (63454)
  /** Opens the Workflow Templates tab and returns published templates that are not compatible yet. */
  async function incompatiblePublished(serviceItemEditPage, count) {
    await serviceItemEditPage.openWorkflowTemplatesTab();
    const list = (await serviceItemEditPage.allTemplates()).filter(t => !t.compatible && t.published);
    expect(list.length, `At least ${count} published, incompatible workflow template(s)`).toBeGreaterThanOrEqual(count);
    return list.slice(0, count);
  }

  test(tcTitle(c.wtFilter), tcDetails(c.wtFilter, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.wtFilter;
    await start(serviceItemEditPage, testInfo, tc, { ...prefix('Seed', shownValues(tc.seed)), 'No-match Search': tc.noMatch });
    await serviceItemEditPage.openWorkflowTemplatesTab();
    await test.step('Compatible filter (default): Result = visible rows, all compatible', async () => {
      await expect(serviceItemEditPage.wtCompatibleFilter).toBeChecked();
      const rows = await serviceItemEditPage.visibleTemplates();
      expect(await serviceItemEditPage.resultCount(), 'Result count').toBe(rows.length);
      expect(rows.every(r => r.compatible), 'Only compatible templates').toBe(true);
    });
    const incompatible = await test.step('Incompatible filter: Result = visible rows, none compatible', async () => {
      await serviceItemEditPage.filterTemplates('Incompatible');
      const rows = await serviceItemEditPage.visibleTemplates();
      expect(rows.length, 'Incompatible templates listed').toBeGreaterThan(0);
      expect(await serviceItemEditPage.resultCount(), 'Result count').toBe(rows.length);
      expect(rows.every(r => !r.compatible), 'Only incompatible templates').toBe(true);
      return rows;
    });
    const target = incompatible[0];
    const term = target.name.slice(1, Math.min(target.name.length, 6)).toLowerCase();
    await test.step(`Search "${term}" (name or description CONTAINS)`, async () => {
      await serviceItemEditPage.searchTemplates(term);
      await expect.poll(async () => (await serviceItemEditPage.visibleTemplates()).map(r => r.id), { message: 'Searched template listed' }).toContain(target.id);
      const rows = await serviceItemEditPage.visibleTemplates();
      expect(rows.every(r => `${r.name} ${r.description}`.toLowerCase().includes(term)), 'Every row contains the search text').toBe(true);
      expect(await serviceItemEditPage.resultCount(), 'Result count follows the search').toBe(rows.length);
      await observe(testInfo, `Search "${term}": ${rows.length} of ${incompatible.length} incompatible templates`);
    });
    await test.step('Search with no match', async () => {
      await serviceItemEditPage.searchTemplates(tc.noMatch);
      await expect(serviceItemEditPage.wtVisibleRows, 'No rows').toHaveCount(0);
      await expect(serviceItemEditPage.wtResultCount).toHaveText('0');
      await expect(serviceItemEditPage.wtEmpty, `"${TEXT.noTemplateMatch}"`).toBeVisible();
      await expect(serviceItemEditPage.wtEmpty).toHaveText(TEXT.noTemplateMatch);
    });
  });

  test(tcTitle(c.wtCompatible), tcDetails(c.wtCompatible, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.wtCompatible;
    const record = await start(serviceItemEditPage, testInfo, tc);
    const [template] = await incompatiblePublished(serviceItemEditPage, 1);
    await observe(testInfo, `Template: ${template.name} (#${template.id})`);
    await test.step(`Tick Compatible on "${template.name}"`, async () => {
      const resp = await serviceItemEditPage.setCompatible(template.id, true);
      expect(resp && resp.success, 'Server accepted the change').toBe(true);
      await expect(serviceItemEditPage.templateRow(template.id), 'Not made the default').toHaveAttribute('data-default', 'false');
      await serviceItemEditPage.filterTemplates('Compatible');
      await expect(serviceItemEditPage.templateRow(template.id), 'Listed under Compatible').toBeVisible();
    });
    await test.step('Reload: still compatible', async () => {
      await serviceItemEditPage.openEdit(record.id);
      await serviceItemEditPage.openWorkflowTemplatesTab();
      await expect(serviceItemEditPage.templateRow(template.id)).toHaveAttribute('data-compatible', 'true');
    });
    await recordUpdated(testInfo, MODULE, tc, { serviceItemName: tc.seed.serviceItemName, compatibleTemplate: '' }, { serviceItemName: tc.seed.serviceItemName, compatibleTemplate: template.name }, record);
  });

  test(tcTitle(c.wtDefault), tcDetails(c.wtDefault, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.wtDefault;
    const record = await start(serviceItemEditPage, testInfo, tc);
    const [first, second] = await incompatiblePublished(serviceItemEditPage, 2);
    await observe(testInfo, `Templates: ${first.name} (#${first.id}), ${second.name} (#${second.id})`);
    await test.step('Make both compatible', async () => {
      await serviceItemEditPage.setCompatible(first.id, true);
      await serviceItemEditPage.setCompatible(second.id, true);
      await serviceItemEditPage.filterTemplates('Compatible');
    });
    await test.step(`Default "${first.name}", then "${second.name}"`, async () => {
      await serviceItemEditPage.setDefaultTemplate(first.id);
      expect(await serviceItemEditPage.defaultTemplateIds(), 'First is the only default').toEqual([first.id]);
      await serviceItemEditPage.setDefaultTemplate(second.id);
      expect(await serviceItemEditPage.defaultTemplateIds(), 'Only the second is the default').toEqual([second.id]);
    });
    await test.step('Reload: only the second is the default', async () => {
      await serviceItemEditPage.openEdit(record.id);
      await serviceItemEditPage.openWorkflowTemplatesTab();
      await expect.poll(() => serviceItemEditPage.defaultTemplateIds(), { message: 'One default after reload' }).toEqual([second.id]);
    });
    await recordUpdated(testInfo, MODULE, tc, { serviceItemName: tc.seed.serviceItemName, defaultTemplate: '' }, { serviceItemName: tc.seed.serviceItemName, defaultTemplate: second.name, compatibleTemplates: `${first.name}, ${second.name}` }, record);
  });

  test(tcTitle(c.wtRemoveDefault), tcDetails(c.wtRemoveDefault, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.wtRemoveDefault;
    const record = await start(serviceItemEditPage, testInfo, tc);
    const [template] = await incompatiblePublished(serviceItemEditPage, 1);
    await serviceItemEditPage.setCompatible(template.id, true);
    await serviceItemEditPage.filterTemplates('Compatible');
    await serviceItemEditPage.setDefaultTemplate(template.id);
    await test.step('Untick the default -> confirmation -> Cancel keeps it', async () => {
      await serviceItemEditPage.untickDefaultTemplate(template.id);
      await expect(serviceItemEditPage.wtConfirmModal).toContainText(TEXT.removeDefaultTitle);
      await observe(testInfo, `Confirmation: ${(await serviceItemEditPage.wtConfirmModal.innerText()).replace(/\s+/g, ' ').trim()}`);
      await snap(page, testInfo, 'remove-default-confirmation');
      await serviceItemEditPage.wtRemoveDefaultCancel.click();
      await expect(serviceItemEditPage.wtConfirmModal).toBeHidden({ timeout: 15_000 });
      await expect(serviceItemEditPage.templateRow(template.id)).toHaveAttribute('data-compatible', 'true');
      await expect(serviceItemEditPage.templateRow(template.id)).toHaveAttribute('data-default', 'true');
    });
    await test.step('Untick again -> Continue removes it; no default left', async () => {
      await serviceItemEditPage.untickDefaultTemplate(template.id);
      await Promise.all([
        page.waitForResponse(r => /SetWorkflowTemplateCompatible/i.test(r.url()), { timeout: 30_000 }),
        serviceItemEditPage.wtRemoveDefaultContinue.click(),
      ]);
      await expect(serviceItemEditPage.templateRow(template.id)).toHaveAttribute('data-compatible', 'false');
      expect(await serviceItemEditPage.defaultTemplateIds(), 'No default template').toEqual([]);
    });
    await test.step('Reload: incompatible, no default', async () => {
      await serviceItemEditPage.openEdit(record.id);
      await serviceItemEditPage.openWorkflowTemplatesTab();
      await expect(serviceItemEditPage.templateRow(template.id)).toHaveAttribute('data-compatible', 'false');
      expect(await serviceItemEditPage.defaultTemplateIds(), 'No default template').toEqual([]);
    });
  });

  test(tcTitle(c.wtReadOnly), tcDetails(c.wtReadOnly, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.wtReadOnly;
    await start(serviceItemEditPage, testInfo, tc);
    await serviceItemEditPage.openWorkflowTemplatesTab();
    await serviceItemEditPage.filterTemplates('Incompatible');
    const rows = await serviceItemEditPage.visibleTemplates();
    expect(rows.length, 'Incompatible templates listed').toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.defaultDisabled, `Default disabled for incompatible "${r.name}"`).toBe(true);
      expect(r.href, `"${r.name}" links to its detail page`).toMatch(new RegExp(`/WorkflowTemplate/Edit/${r.id}$`, 'i'));
    }
    const tip = await serviceItemEditPage.templateRow(rows[0].id).locator('.si-wt-default-wrap')
      .evaluate(w => w.getAttribute('data-bs-original-title') || w.getAttribute('title') || w.getAttribute('aria-label') || '');
    await observe(testInfo, `Tooltip: ${tip}`);
    expect(tip, 'Explanation tooltip').toContain('cannot be set as default');
  });

  // ================================================================== MF-6 other tabs
  test(tcTitle(c.tabs), tcDetails(c.tabs, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.tabs;
    const record = await start(serviceItemEditPage, testInfo, tc);
    await test.step('Documents tab', async () => {
      await serviceItemEditPage.openTab('Documents');
      await expect(serviceItemEditPage.documentsPane).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#btnaddDocument'), 'Add New Document').toBeVisible({ timeout: 30_000 });
    });
    await test.step('Tasks tab', async () => {
      await serviceItemEditPage.openTab('Tasks');
      await expect(serviceItemEditPage.tasksPane).toBeVisible({ timeout: 30_000 });
      await expect(serviceItemEditPage.tasksPane).toContainText(/\S/);
    });
    await test.step('Audit tab lists the creation', async () => {
      await serviceItemEditPage.openAuditTab();
      await expect(serviceItemEditPage.auditPane).toContainText(tc.seed.serviceItemName, { timeout: 30_000 });
    });
    await test.step('Signals is wired to this record', async () => {
      await expect(serviceItemEditPage.signalsButton).toHaveAttribute('data-entity-record-id', record.id);
    });
    await snap(page, testInfo, 'tabs');
  });

  // ================================================================== MF-5 soft delete
  test(tcTitle(c.deleteGoBack), tcDetails(c.deleteGoBack, MODULE), async ({ serviceItemEditPage, page }, testInfo) => {
    const tc = c.deleteGoBack;
    const record = await start(serviceItemEditPage, testInfo, tc);
    await serviceItemEditPage.openDeleteConfirmation();
    await expect(serviceItemEditPage.deleteModalTitle).toHaveText(TEXT.deleteConfirm);
    await snap(page, testInfo, 'delete-confirmation');
    await serviceItemEditPage.goBackFromDelete();
    await expect(page).toHaveURL(new RegExp(`/ServiceItem/Edit/${record.id}`, 'i'));
    await serviceItemEditPage.openEdit(record.id);
    await expect(serviceItemEditPage.statusBadge, 'Still Active').toHaveText(new RegExp(TEXT.activeStatus, 'i'));
  });

  test(tcTitle(c.deleteAllowed), tcDetails(c.deleteAllowed, MODULE), async ({ serviceItemEditPage, servicePage, page }, testInfo) => {
    const tc = c.deleteAllowed;
    const record = await start(serviceItemEditPage, testInfo, tc);
    await serviceItemEditPage.openDeleteConfirmation();
    const status = await test.step('Delete', () => serviceItemEditPage.confirmDelete());
    await observe(testInfo, `Delete answered ${status}; now on ${page.url()}; shown: ${await serviceItemEditPage.serverMessage(10_000) || '(nothing)'}`);
    await snap(page, testInfo, 'after-delete');
    expect(status, 'Delete request succeeded').toBeLessThan(400);
    // the deleted record is never opened again (the sandbox's error page for it would sign the session out)
    await test.step('No longer offered by Add Deliverable', () => offeredOnAddDeliverable(servicePage, tc.seed.serviceItemName, false));
    await recordUpdated(testInfo, MODULE, tc, { serviceItemName: tc.seed.serviceItemName, status: 'Active' }, { serviceItemName: tc.seed.serviceItemName, status: 'Deleted (soft)' }, record);
  });

  test(tcTitle(c.deleteBlocked), tcDetails(c.deleteBlocked, MODULE), async ({ serviceItemEditPage, servicePage, page }, testInfo) => {
    const tc = c.deleteBlocked;
    const record = await start(serviceItemEditPage, testInfo, tc, { ...prefix('Seed', shownValues(tc.seed)), 'Deliverable Name': tc.deliverableName, 'Deliverable Account': ACCOUNTS.main });
    const deliverable = await test.step(`Create the Deliverable "${tc.deliverableName}" that uses it`, async () => {
      await offeredOnAddDeliverable(servicePage, tc.seed.serviceItemName, true);
      const accountId = await servicePage.account.locator('option').evaluateAll((os, n) => (os.find(o => o.text.trim() === n) || os.find(o => o.value) || {}).value, ACCOUNTS.main);
      await servicePage.fillForm({ accountId, item: tc.seed.serviceItemName, serviceName: tc.deliverableName, stage: tc.stage });
      return servicePage.submitNew();
    });
    await recordUrl(testInfo, deliverable.url, `Deliverable #${deliverable.id} using the type`);
    await serviceItemEditPage.openEdit(record.id);
    await serviceItemEditPage.openDeleteConfirmation();
    const status = await test.step('Delete', () => serviceItemEditPage.confirmDelete());
    // the refusal is a TempData alert rendered by script a moment after the page reloads
    const shown = await serviceItemEditPage.serverMessage();
    await observe(testInfo, `Delete answered ${status}; now on ${page.url()}; shown: ${shown || '(nothing)'}`);
    await snap(page, testInfo, 'delete-blocked');
    await test.step('The Deliverable Type was not deleted (still offered by Add Deliverable)', async () => {
      await servicePage.gotoCreate();
      const options = (await servicePage.serviceItem.locator('option').allInnerTexts()).map(t => t.trim());
      // checked before re-opening: a deleted record must not be opened (the error page signs the session out)
      if (!options.includes(tc.seed.serviceItemName)) throw new Error('DEFECT (AF-SoftDeleteBlocked): the Deliverable Type was deleted although a Deliverable uses it');
    });
    expect(shown, 'SERV-3 message: the type is used and cannot be deleted').toMatch(TEXT.deleteBlocked);
    await test.step('Still visible, editable and Active', async () => {
      await serviceItemEditPage.openEdit(record.id);
      await expect(serviceItemEditPage.statusBadge).toHaveText(new RegExp(TEXT.activeStatus, 'i'));
      await expect(serviceItemEditPage.serviceItemName).toBeEditable();
    });
  });

  // ================================================================== gaps of the sandbox (known defects)
  test(tcTitle(c.specFields), tcDetails(c.specFields, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.specFields;
    await start(serviceItemEditPage, testInfo, tc, { 'Fields Checked': ['Default Rate', 'Is Active'] });
    const fields = serviceItemEditPage.specOnlyEditFields();
    const missing = [];
    for (const [field, locator] of Object.entries(fields)) if (!(await locator.count())) missing.push(field);
    await observe(testInfo, missing.length ? `Missing on View & Update: ${missing.join(', ')}` : 'Both fields are shown');
    for (const [field, locator] of Object.entries(fields)) await expect(locator.first(), `"${field}" on View & Update`).toBeVisible({ timeout: 3_000 });
  });

  test(tcTitle(c.servicesPanel), tcDetails(c.servicesPanel, MODULE), async ({ serviceItemEditPage }, testInfo) => {
    const tc = c.servicesPanel;
    await start(serviceItemEditPage, testInfo, tc, { 'Panel Checked': 'Services / Deliverables' });
    await observe(testInfo, `Tabs: ${(await serviceItemEditPage.tabNames()).join(', ')}`);
    await expect(serviceItemEditPage.servicesPanel().first(), 'Related Services panel or tab').toBeVisible({ timeout: 3_000 });
  });
});
