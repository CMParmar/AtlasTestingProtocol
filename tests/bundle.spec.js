const { test, expect } = require('../fixtures/fixtures');
const { MODULE, MESSAGES, bundleCases: c } = require('../testData/bundleData');
const { LIST_PATH } = require('../pages/bundle/BundlePage');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUrl } = require('../utils/testCase');
const { expectNotSaved } = require('../utils/negative');

/**
 * Use case 63196 - Create Bundle (BILL): /Setting/BundleList -> "Create Bundle" -> Create Bundle panel -> Save.
 * Version number and Draft state are read from the Bundles list badge ("Draft (v1)").
 * Bundles are NOT deleted (the use case has no delete; archiving is out of scope); every bundle created is listed with
 * its URL in reports/excel/bundle/Atlas_Bundle_<YYYY-MM-DD>.xlsx (Created Bundles sheet).
 *
 * Not automated: AF missing PERM.BILL.Bundle.Create (needs a second user), BundleVersion columns that are not shown
 * (BundleVersionStatusIDF value, version-number reuse - database), rate card pricing, bundle lines and publishing
 * (63197 / rate card use cases).
 */

const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

/** Opens /Setting/BundleList -> Create Bundle panel and logs the list URL. */
async function openForm(bundlePage, testInfo, tc) {
  await applyAllureLabels(tc, MODULE);
  await test.step('Bundles list -> Create Bundle (MF-1)', () => bundlePage.openCreate());
  await recordUrl(testInfo, bundlePage.page.url(), 'Bundles');
}

/** Fills and saves a bundle (MF-2); logs it as created. Returns the record { url, id }. */
async function createBundle(bundlePage, testInfo, tc, data = tc.data, { log = true } = {}) {
  await openForm(bundlePage, testInfo, tc);
  return test.step(`Create bundle "${data.bundleName}" (MF-2)`, async () => {
    await bundlePage.fill(data);
    if (log) await recordTestValues(testInfo, { ...data, subscription: data.subscription === true });
    await shot(bundlePage.page, testInfo, 'create-bundle-panel');
    const record = await bundlePage.submitNew();
    await recordCreated(testInfo, MODULE, tc, { ...data, subscription: data.subscription === true }, record);
    observe(testInfo, `Saved and opened ${record.url}`);
    return record;
  });
}

/** View & Edit Bundle shows the saved name, description and (when displayed) the subscription setting. */
async function expectSaved(bundlePage, testInfo, data) {
  await test.step('View & Edit Bundle shows the saved values', async () => {
    await bundlePage.expectShown(data.bundleName.trim(), 'Bundle Name');
    if (data.description) await bundlePage.expectShown(data.description, 'Description');
    const subscription = await bundlePage.savedSubscription();
    if (subscription === null) observe(testInfo, 'View & Edit Bundle does not display the subscription setting');
    else expect(subscription, 'Subscription bundle on the first version').toBe(data.subscription === true);
  });
}

test.describe('Bundle - Create Bundle (63196)', () => {
  // ---------- MF-1 initiate bundle creation ----------
  test(tcTitle(c.fromSettings), tcDetails(c.fromSettings, MODULE), async ({ bundlePage, page }, testInfo) => {
    await applyAllureLabels(c.fromSettings, MODULE);
    await bundlePage.openRecord('/Setting');
    await test.step('Settings -> Bundles', async () => {
      await expect(bundlePage.settingsBundlesLink, '"Bundles" link on the Settings page').toBeVisible();
      await bundlePage.settingsBundlesLink.click();
    });
    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}(?:[?#]|$)`, 'i'));
    await expect(bundlePage.createCommand, '"Create Bundle" button').toBeVisible();
    await recordUrl(testInfo, page.url(), 'Bundles');
    await recordTestValues(testInfo, { entry: 'Sidebar Settings -> Bundles', url: page.url() });
    await shot(page, testInfo, 'bundles-page');
  });

  test(tcTitle(c.openCreate), tcDetails(c.openCreate, MODULE), async ({ bundlePage, page }, testInfo) => {
    await applyAllureLabels(c.openCreate, MODULE);
    await bundlePage.openBundles();
    await recordUrl(testInfo, page.url(), 'Bundles');
    await recordTestValues(testInfo, { entry: `${LIST_PATH} -> Create Bundle` });
    await test.step('Click "Create Bundle"', () => bundlePage.createCommand.click());
    await bundlePage.expectFormOpen();
    await shot(page, testInfo, 'create-bundle-panel');
  });

  test(tcTitle(c.fields), tcDetails(c.fields, MODULE), async ({ bundlePage }, testInfo) => {
    await openForm(bundlePage, testInfo, c.fields);
    await recordTestValues(testInfo, { 'Fields checked': 'Name, Description, Subscription bundle' });
    await expect(bundlePage.name, 'Bundle.Name').toBeVisible();
    await expect(bundlePage.description, 'Bundle.Description').toBeVisible();
    await expect(bundlePage.subscription, 'BundleVersion.isSubscriptionBundle (switch)').toBeVisible();
    await expect(bundlePage.drawer.getByText('Subscription bundle', { exact: true })).toBeVisible();
  });

  test(tcTitle(c.subscriptionDefault), tcDetails(c.subscriptionDefault, MODULE), async ({ bundlePage }, testInfo) => {
    await openForm(bundlePage, testInfo, c.subscriptionDefault);
    const value = await bundlePage.subscriptionValue();
    await recordTestValues(testInfo, { subscription: value });
    expect(value, 'Subscription bundle presented as false (off)').toBe(false);
  });

  test(tcTitle(c.nameRequiredMarker), tcDetails(c.nameRequiredMarker, MODULE), async ({ bundlePage }, testInfo) => {
    await openForm(bundlePage, testInfo, c.nameRequiredMarker);
    // required = HTML required, or a "*" in the field's label inside the panel
    const required = loc => loc.evaluate(e => {
      const label = e.closest('#slideOutPanel').querySelector(`label[for="${e.id}"]`);
      return e.required || /\*/.test(label ? label.textContent : '');
    });
    const name = await required(bundlePage.name);
    const description = await required(bundlePage.description);
    await recordTestValues(testInfo, { 'Name required': name, 'Description required': description });
    expect(name, 'Name is required').toBe(true);
    expect(description, 'Description is optional').toBe(false);
  });

  test(tcTitle(c.noVersionInput), tcDetails(c.noVersionInput, MODULE), async ({ bundlePage }, testInfo) => {
    await openForm(bundlePage, testInfo, c.noVersionInput);
    const count = await bundlePage.versionNumberInput.count();
    await recordTestValues(testInfo, { 'Version fields in the panel': count });
    expect(count, 'DEFECT: the Version Number can be entered by the user (BR-2)').toBe(0);
  });

  // ---------- MF-2 save ----------
  for (const tc of [c.oneTime, c.subscriptionBundle, c.nameOnly, c.specialChars, c.longDescription, c.subscriptionUntouched]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ bundlePage, page }, testInfo) => {
      await createBundle(bundlePage, testInfo, tc);
      await expectSaved(bundlePage, testInfo, tc.data);
      await shot(page, testInfo, 'saved-bundle');
    });
  }

  test(tcTitle(c.versionOne), tcDetails(c.versionOne, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.versionOne;
    await createBundle(bundlePage, testInfo, tc);
    const row = await test.step('Bundles list row', () => bundlePage.listRow(tc.data.bundleName));
    observe(testInfo, `Bundles list shows "${row.status}"`);
    expect(row.status, 'First version number = 1 (BR-2)').toMatch(/\bv\s*1\b/i);
  });

  test(tcTitle(c.draftState), tcDetails(c.draftState, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.draftState;
    await createBundle(bundlePage, testInfo, tc);
    const row = await test.step('Bundles list row', () => bundlePage.listRow(tc.data.bundleName));
    observe(testInfo, `Bundles list shows "${row.status}"`);
    expect(row.status, 'First version in the Draft state').toMatch(/^Draft\b/i);
  });

  test(tcTitle(c.createdBy), tcDetails(c.createdBy, MODULE), async ({ bundlePage }, testInfo) => {
    const user = await test.step('Signed-in user', async () => {
      await bundlePage.openBundles();
      return bundlePage.currentUserName();
    });
    await createBundle(bundlePage, testInfo, c.createdBy);
    let where = (await bundlePage.main.getByText(user).filter({ visible: true }).count()) ? 'Details' : '';
    for (const tab of ['Versions', 'History', 'Audit']) {
      if (where || !(await bundlePage.tab(tab).count())) continue;
      await bundlePage.openTab(tab);
      if (await bundlePage.main.getByText(user).filter({ visible: true }).first().isVisible({ timeout: 5_000 }).catch(() => false)) where = tab;
    }
    observe(testInfo, where ? `Creator "${user}" shown on ${where}` : `Creator "${user}" not shown on View & Edit Bundle`);
    test.skip(!where, `View & Edit Bundle does not display the creating user ("${user}") - nothing to verify in the UI`);
  });

  test(tcTitle(c.listed), tcDetails(c.listed, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.listed;
    await createBundle(bundlePage, testInfo, tc);
    const row = await test.step('Bundles list shows the bundle', () => bundlePage.listRow(tc.data.bundleName));
    observe(testInfo, `Listed: "${tc.data.bundleName}" - ${row.subtitle} - ${row.status}`);
    expect(row.href, 'Row links to the bundle').toMatch(/\/Bundle\/Edit\/\d+/i);
  });

  test(tcTitle(c.similarNames), tcDetails(c.similarNames, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.similarNames;
    await recordTestValues(testInfo, { 'First bundle': tc.data.bundleName, 'Second bundle': tc.second.bundleName });
    await createBundle(bundlePage, testInfo, tc, tc.data, { log: false });
    await createBundle(bundlePage, testInfo, tc, tc.second, { log: false });
    await expectSaved(bundlePage, testInfo, tc.second);
  });

  test(tcTitle(c.editsContents), tcDetails(c.editsContents, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.editsContents;
    const record = await createBundle(bundlePage, testInfo, tc);
    expect(record.url, 'Left the Bundles list').not.toMatch(new RegExp(LIST_PATH, 'i'));
    expect(record.id, 'URL carries the new bundle id').not.toBe('');
    await expect(bundlePage.contentsSection, 'View & Edit Bundle offers the version contents (bundle lines)').toBeVisible();
    observe(testInfo, `Opened ${record.url}; contents section: "${(await bundlePage.contentsSection.innerText()).trim()}"`);
  });

  // ---------- negative ----------
  for (const tc of [c.emptyName, c.blankName]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ bundlePage }, testInfo) => {
      await openForm(bundlePage, testInfo, tc);
      await bundlePage.fill(tc.data);
      await recordTestValues(testInfo, { ...tc.data, bundleName: tc.data.bundleName ? `"${tc.data.bundleName}" (spaces only)` : '(empty)' });
      const result = await test.step('Click Save', () => bundlePage.trySave());
      await expectNotSaved(testInfo, MODULE, { ...tc, data: tc.data }, result);
      await expect(bundlePage.nameError, `"${MESSAGES.nameRequired}"`).toHaveText(MESSAGES.nameRequired);
      observe(testInfo, `Validation shown: "${(await bundlePage.nameError.innerText()).trim()}"`);
      await expect(bundlePage.drawer, 'Panel stays open so the user can correct the name').toBeVisible();
    });
  }

  test(tcTitle(c.duplicate), tcDetails(c.duplicate, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.duplicate;
    const second = { bundleName: tc.data.bundleName, ...tc.second };
    await recordTestValues(testInfo, { bundleName: tc.data.bundleName, 'Second bundle': second.description, subscription: second.subscription });
    await createBundle(bundlePage, testInfo, tc, tc.data, { log: false });
    await openForm(bundlePage, testInfo, tc);
    await bundlePage.fill(second);
    const result = await test.step('Save a second bundle with the same name', () => bundlePage.trySave());
    await expectNotSaved(testInfo, MODULE, { ...tc, data: second }, result);
    await expect(bundlePage.duplicateModal, `"${MESSAGES.duplicate}"`).toBeVisible();
    await expect(bundlePage.duplicateModal, 'Scenario title').toContainText(MESSAGES.duplicateTitle);
    observe(testInfo, `Shown: "${(await bundlePage.duplicateModal.innerText()).replace(/\s+/g, ' ').trim()}"`);
    await test.step('Ok closes the message', () => bundlePage.acknowledgeDuplicate());
  });

  test(tcTitle(c.duplicateRecover), tcDetails(c.duplicateRecover, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.duplicateRecover;
    await recordTestValues(testInfo, { 'Duplicate name': tc.data.bundleName, 'Corrected name': tc.second.bundleName, description: tc.second.description });
    await createBundle(bundlePage, testInfo, tc, tc.data, { log: false });
    await openForm(bundlePage, testInfo, tc);
    await bundlePage.fill({ ...tc.second, bundleName: tc.data.bundleName });
    const result = await bundlePage.trySave();
    await expectNotSaved(testInfo, MODULE, { ...tc, data: tc.second }, result);
    await expect(bundlePage.duplicateModal).toBeVisible();
    await bundlePage.acknowledgeDuplicate();
    await expect(bundlePage.description, 'Entered description kept after the error').toHaveValue(tc.second.description);
    await test.step('Enter a different name and save', async () => {
      await bundlePage.name.fill(tc.second.bundleName);
      const record = await bundlePage.submitNew();
      await recordCreated(testInfo, MODULE, tc, tc.second, record);
    });
    await expectSaved(bundlePage, testInfo, tc.second);
  });

  test(tcTitle(c.cancel), tcDetails(c.cancel, MODULE), async ({ bundlePage, page }, testInfo) => {
    const tc = c.cancel;
    await openForm(bundlePage, testInfo, tc);
    await bundlePage.fill(tc.data);
    await recordTestValues(testInfo, { ...tc.data, action: 'Close the panel (X)' });
    await test.step('Close the panel without saving', () => bundlePage.closeWithoutSaving());
    await expect(page, 'No bundle page opened').toHaveURL(new RegExp(LIST_PATH, 'i'));
    expect(await bundlePage.listed(tc.data.bundleName), 'DEFECT: the discarded bundle was created').toBe(false);
  });

  test(tcTitle(c.nameMax), tcDetails(c.nameMax, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.nameMax;
    await openForm(bundlePage, testInfo, tc);
    const max = Number(await bundlePage.name.getAttribute('maxlength')) || 0;
    test.skip(!max, 'The Name field has no maxlength - nothing to check on the form');
    await recordTestValues(testInfo, { 'Characters typed': max + 5, 'Limit': max });
    await bundlePage.name.pressSequentially('B'.repeat(max + 5));
    const kept = (await bundlePage.name.inputValue()).length;
    observe(testInfo, `Name holds ${kept} characters`);
    expect(kept, `Name limited to ${max} characters`).toBe(max);
  });

  test(tcTitle(c.archivedReuse), tcDetails(c.archivedReuse, MODULE), async ({ bundlePage }, testInfo) => {
    const tc = c.archivedReuse;
    const second = { bundleName: tc.data.bundleName, ...tc.second };
    await recordTestValues(testInfo, { bundleName: tc.data.bundleName, action: 'Create, archive, create again with the same name' });
    await createBundle(bundlePage, testInfo, tc, tc.data, { log: false });
    const archived = await test.step('Archive the bundle', () => bundlePage.archive());
    test.skip(!archived, 'No Archive command on View & Edit Bundle (archiving is outside this use case)');
    const record = await createBundle(bundlePage, testInfo, tc, second, { log: false });
    observe(testInfo, `Reused name saved as ${record.url}`);
  });
});
