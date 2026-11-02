const { test, expect } = require('../fixtures/fixtures');
const { personTestCases } = require('../testData/personData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated } = require('../utils/testCase');

const MODULE = 'Person';

// NOTE: records created here are intentionally NOT deleted - they stay in the sandbox
// and are listed in reports/excel/Atlas_TestReport.xlsx ("Person Test Data" sheet).
test.describe('Person - Add Person', () => {
  for (const tc of personTestCases) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personPage, page }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.data);

      let record;
      await test.step('Open Add Person and fill the form', async () => {
        await personPage.gotoCreate();
        await personPage.fillForm(tc.data);
        await testInfo.attach('filled-form', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
      await test.step('Save the person', async () => {
        await personPage.submit();
        record = { url: page.url(), id: personPage.recordIdFromUrl() };
        await recordCreated(testInfo, MODULE, tc, tc.data, record);
      });
      await test.step('Saved record shows the person details', async () => {
        await personPage.expectPersonSaved(tc.data);
        await testInfo.attach('saved-record', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    });
  }

  const formCase = {
    id: 'TC_PER_006',
    name: 'Add Person form shows all expected fields',
    description: 'Verify the Add Person page renders Personal Details, Contact Details and Address controls (no record is saved).',
    condition: 'User is logged in; Add Person page is opened from /Person/Create.',
    expected: 'First/Middle/Last Name, Handle and Email are editable; Add Phone Number, Add Address and Add Person buttons are available.',
    severity: 'minor',
  };
  test(tcTitle(formCase), tcDetails(formCase, MODULE), async ({ personPage }, testInfo) => {
    await applyAllureLabels(formCase, MODULE);
    await recordTestValues(testInfo, { url: '/Person/Create' });

    await personPage.gotoCreate();
    for (const field of [personPage.firstName, personPage.middleName, personPage.lastName, personPage.handle, personPage.email]) {
      await expect(field).toBeVisible();
      await expect(field).toBeEditable();
    }
    await expect(personPage.phoneDrawer.openButton).toBeVisible();
    await expect(personPage.addressDrawer.openButton).toBeVisible();
    await expect(personPage.addPersonButton).toBeEnabled();
  });
});
