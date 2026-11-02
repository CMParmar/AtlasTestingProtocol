const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { companyTestCases } = require('../testData/companyData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated } = require('../utils/testCase');

const MODULE = 'Company';

// NOTE: records created here are intentionally NOT deleted - they stay in the sandbox
// and are listed in reports/excel/Atlas_TestReport.xlsx ("Company Test Data" sheet).
test.describe('Company - Add Company', () => {
  for (const tc of companyTestCases) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ companyPage, page }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.data);

      let record;
      await test.step('Run the duplicate check and continue to Add Company', async () => {
        await companyPage.gotoSearch();
        await companyPage.proceedToCreate(tc.data);
      });
      await test.step('Fill the company form', async () => {
        await companyPage.fillForm(tc.data);
        await testInfo.attach('filled-form', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
      await test.step('Save & View', async () => {
        await companyPage.saveAndView();
        record = { url: page.url(), id: companyPage.recordIdFromUrl() };
        await recordCreated(testInfo, MODULE, tc, tc.data, record);
      });
      await test.step('Saved record shows the company details', async () => {
        await companyPage.expectCompanySaved(tc.data);
        await testInfo.attach('saved-record', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    });
  }

  const duplicateCase = {
    id: 'TC_COM_006',
    name: 'Duplicate check warns about an existing company',
    description: 'Verify that entering the trade name of an existing company shows the "similar records" warning with the matching record and an "Open Existing Company" link, and does not move on to the Add Company form (no record is saved).',
    condition: `Company "${env.duplicateCheckCompany}" already exists in the sandbox.`,
    expected: '"We found similar records" warning is shown with the existing company and an "Open Existing Company" link; user stays on the search step.',
    type: 'Negative',
    severity: 'critical',
  };
  test(tcTitle(duplicateCase), tcDetails(duplicateCase, MODULE), async ({ companyPage }, testInfo) => {
    await applyAllureLabels(duplicateCase, MODULE);
    await recordTestValues(testInfo, { tradeName: env.duplicateCheckCompany });

    await companyPage.gotoSearch();
    await companyPage.searchCompany({ tradeName: env.duplicateCheckCompany });
    await expect(companyPage.similarRecordsAlert).toBeVisible();
    await expect(companyPage.page.locator('main').getByText(env.duplicateCheckCompany, { exact: true }).first()).toBeVisible();
    await expect(companyPage.openExistingCompanyLink.first()).toBeVisible();
    await expect(companyPage.openExistingCompanyLink.first()).toHaveAttribute('href', /\/Company\/Edit\/\d+/);
    // user must explicitly confirm with "Add Company" - the form is not opened automatically
    await expect(companyPage.continueButton).toHaveText(/Add Company/);
    await expect(companyPage.page).toHaveURL(/\/Company\/SearchCompany/);
  });

  const entityCase = {
    id: 'TC_COM_007',
    name: 'Entity Type dropdown lists all entity types',
    description: 'Verify the Add Company form offers every entity type and all four company roles (form is not saved).',
    condition: 'User is logged in; a unique trade name passes the duplicate check.',
    expected: 'Entity Type lists LLC, Corporation, S Corporation, Partnership, Sole Proprietorship, Nonprofit and Other; all four company roles are shown.',
    severity: 'minor',
  };
  test(tcTitle(entityCase), tcDetails(entityCase, MODULE), async ({ companyPage }, testInfo) => {
    const expectedTypes = ['LLC', 'Corporation', 'S Corporation', 'Partnership', 'Sole Proprietorship', 'Nonprofit', 'Other'];
    const tradeName = `${env.keyword} Form Check ${env.runTag}`;
    await applyAllureLabels(entityCase, MODULE);
    await recordTestValues(testInfo, { tradeName, entityType: expectedTypes.join(', '), roles: ['Prospect', 'Client', 'Partner', 'Vendor'] });

    await companyPage.gotoSearch();
    await companyPage.proceedToCreate({ tradeName });
    await expect(companyPage.tradeName).toHaveValue(tradeName);
    const options = (await companyPage.entityType.locator('option').allTextContents()).map(t => t.trim());
    expect(options).toEqual(expect.arrayContaining(expectedTypes));
    for (const r of ['Prospect', 'Client', 'Partner', 'Vendor']) await expect(companyPage.role(r)).toBeVisible();
    await expect(companyPage.saveAndViewButton).toBeEnabled();
  });
});
