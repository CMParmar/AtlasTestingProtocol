const { test, expect } = require('../fixtures/fixtures');
const { MODULE, personUpdateCases, personUpdateExtraCases: c } = require('../testData/personUpdateData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUpdated } = require('../utils/testCase');
const { expectValidationMessage } = require('../utils/negative');

/**
 * Use case 62386 - View & Update Person.
 * Each test creates the person it works on (logged in "Person Test Data"), opens /Person/Edit/{id}
 * and edits it. Updated records are NOT deleted; they are listed with their URL in
 * reports/excel/person-update/Atlas_PersonUpdate_<YYYY-MM-DD>.xlsx.
 *
 * Not automated (need a second user, an agent person or fault injection): MF-5 Company affiliation,
 * MF-6 / AF-5 Assignments tab, AF-3 / AF-4 permission denied, AF-6 save error, AF-8 sync failure.
 */

/** Creates the person to be viewed/edited and returns { url, id }. */
async function seedPerson(personEditPage, testInfo, tc) {
  return test.step('Seed: create the person to be edited', async () => {
    const record = await personEditPage.createPerson(tc.seed);
    await recordCreated(testInfo, 'Person', tc, tc.seed, record);
    return record;
  });
}

test.describe('Person - View & Update Person (62386)', () => {
  for (const tc of personUpdateCases) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personEditPage, page }, testInfo) => {
      const after = { ...tc.seed, ...tc.update };
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.update);

      const record = await seedPerson(personEditPage, testInfo, tc);

      await test.step('View: open the record - saved values are shown (MF-1)', async () => {
        await personEditPage.gotoEdit(record.id);
        await personEditPage.expectDetails(tc.seed);
      });
      await test.step('Edit the fields (MF-2 to MF-4)', async () => {
        await personEditPage.updateForm(tc.update);
        await testInfo.attach('edited-form', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
      await test.step('Save (MF-7 to MF-9)', async () => {
        await personEditPage.save();
        await recordUpdated(testInfo, 'Person', tc, tc.seed, after, { url: page.url(), id: personEditPage.recordIdFromUrl() });
      });
      await test.step('Re-open: changes persisted, Display Name and Initials re-synced (MF-8)', async () => {
        await personEditPage.gotoEdit(record.id);
        await personEditPage.expectDetails(after);
        await testInfo.attach('updated-record', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    });
  }

  test(tcTitle(c.view), tcDetails(c.view, MODULE), async ({ personEditPage, page }, testInfo) => {
    const tc = c.view;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.seed);

    const record = await seedPerson(personEditPage, testInfo, tc);
    await personEditPage.gotoEdit(record.id);
    await personEditPage.expectDetails(tc.seed);
    for (const name of ['Details', 'Documents', 'Tasks', 'Audit']) await expect(personEditPage.tab(name), `"${name}" tab`).toBeVisible();
    await expect(personEditPage.saveButton).toBeEnabled();
    await expect(personEditPage.cancelEditButton.first()).toBeVisible();
    await testInfo.attach('viewed-record', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  for (const tc of [c.identityBlank, c.invalidEmail]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personEditPage }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.update);

      const record = await seedPerson(personEditPage, testInfo, tc);
      await personEditPage.gotoEdit(record.id);
      await personEditPage.updateForm(tc.update);
      await test.step('Click Save', () => personEditPage.trySave(tc.message));
      await expect(personEditPage.savedMessage, 'DEFECT: the app saved the invalid change').toBeHidden();
      await expectValidationMessage(personEditPage, tc.message);
      await test.step('Re-open: stored record is unchanged', async () => {
        await personEditPage.gotoEdit(record.id);
        await personEditPage.expectDetails(tc.seed);
      });
    });
  }

  test(tcTitle(c.unsavedCancel), tcDetails(c.unsavedCancel, MODULE), async ({ personEditPage, page }, testInfo) => {
    const tc = c.unsavedCancel;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.update);

    const record = await seedPerson(personEditPage, testInfo, tc);
    await personEditPage.gotoEdit(record.id);
    await personEditPage.updateForm(tc.update);
    const warning = await test.step('Click a sidebar link, then Cancel', () => personEditPage.leaveWithUnsavedChanges('cancel'));
    testInfo.annotations.push({ type: 'Observed', description: `Warning shown: "${warning}"` });
    await expect(page).toHaveURL(new RegExp(`/Person/Edit/${record.id}`));
    await expect(personEditPage.lastName, 'Edited value is kept after Cancel').toHaveValue(tc.update.lastName);
  });

  test(tcTitle(c.unsavedDiscard), tcDetails(c.unsavedDiscard, MODULE), async ({ personEditPage, page }, testInfo) => {
    const tc = c.unsavedDiscard;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.update);

    const record = await seedPerson(personEditPage, testInfo, tc);
    await personEditPage.gotoEdit(record.id);
    await personEditPage.updateForm(tc.update);
    const warning = await test.step('Click a sidebar link, then Continue Without Saving', () => personEditPage.leaveWithUnsavedChanges('continue'));
    testInfo.annotations.push({ type: 'Observed', description: `Warning shown: "${warning}"` });
    await expect(page).not.toHaveURL(/\/Person\/Edit\//);
    await test.step('Re-open: changes were discarded', async () => {
      await personEditPage.gotoEdit(record.id);
      await personEditPage.expectDetails(tc.seed);
    });
  });

  test(tcTitle(c.audit), tcDetails(c.audit, MODULE), async ({ personEditPage, page }, testInfo) => {
    const tc = c.audit;
    const after = { ...tc.seed, ...tc.update };
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.update);

    const record = await seedPerson(personEditPage, testInfo, tc);
    await personEditPage.gotoEdit(record.id);
    await personEditPage.updateForm(tc.update);
    await personEditPage.save();
    await recordUpdated(testInfo, 'Person', tc, tc.seed, after, { url: page.url(), id: personEditPage.recordIdFromUrl() });

    await test.step('Audit tab shows the previous Last Name', async () => {
      await personEditPage.openTab('Audit');
      // the old value no longer appears anywhere else on the page (e-mail/handle are lower-case)
      await expect(page.locator('main').getByText(new RegExp(`\\b${tc.seed.lastName}\\b`)).filter({ visible: true }).first()).toBeVisible();
      await testInfo.attach('audit-tab', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
  });
});
