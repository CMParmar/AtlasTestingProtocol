const { test, expect } = require('../fixtures/fixtures');
const { companyNegativeCases: c } = require('../testData/companyNegativeData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues } = require('../utils/testCase');
const { expectNotSaved, expectValidationMessage, expectDrawerRejected } = require('../utils/negative');

const MODULE = 'Company';

// Invalid / missing input must be rejected. A company saved by mistake is NOT deleted;
// it is logged in the Excel "Company Test Data" sheet and the test fails as a defect.
test.describe('Company - Negative validation', () => {
  /** Reaches the Add Company form through the duplicate-check step. */
  async function openCreateForm(companyPage, tradeName) {
    await companyPage.gotoSearch();
    await companyPage.proceedToCreate({ tradeName });
  }

  test(tcTitle(c.noName), tcDetails(c.noName, MODULE), async ({ companyPage }, testInfo) => {
    const tc = c.noName;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.data);

    await openCreateForm(companyPage, tc.searchName);
    await test.step('Clear Trade Name and Legal Name', async () => {
      await companyPage.tradeName.fill('');
      await companyPage.legalName.fill('');
      await companyPage.entityType.selectOption({ label: tc.data.entityType });
      await companyPage.website.fill(tc.data.website);
    });
    const result = await test.step('Click Save & View', () => companyPage.trySave(tc.message));
    await expectNotSaved(testInfo, MODULE, tc, result);
    await expectValidationMessage(companyPage, tc.message);
    await expect(companyPage.page).toHaveURL(/\/Company\/Create/);
  });

  for (const tc of [c.invalidEin, c.invalidWebsite]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ companyPage }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.data);

      await openCreateForm(companyPage, tc.data.tradeName);
      await test.step('Fill the form with the invalid value', () => companyPage.fillForm(tc.data));
      const result = await test.step('Click Save & View', () => companyPage.trySave(tc.message));
      await expectNotSaved(testInfo, MODULE, tc, result);
      await expectValidationMessage(companyPage, tc.message);
      await expect(companyPage.page).toHaveURL(/\/Company\/Create/);
    });
  }

  test(tcTitle(c.shortPhone), tcDetails(c.shortPhone, MODULE), async ({ companyPage, page }, testInfo) => {
    const tc = c.shortPhone;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.data);

    await openCreateForm(companyPage, tc.data.tradeName);
    await test.step('Fill the phone drawer and click Continue', () => companyPage.phoneDrawer.fillAndContinue(tc.data.phone));
    await test.step('Phone is rejected', () =>
      expectDrawerRejected(companyPage, page.locator('form').getByText('Primary Phone Number', { exact: true }), undefined,
        `phone number "${tc.data.phone.number}" was accepted and added to the company`));
  });

  test(tcTitle(c.invalidZip), tcDetails(c.invalidZip, MODULE), async ({ companyPage }, testInfo) => {
    const tc = c.invalidZip;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.data);

    await openCreateForm(companyPage, tc.data.tradeName);
    await test.step('Fill the address drawer with an invalid ZIP', () => companyPage.addressDrawer.fillAndContinue(tc.data.address));
    await test.step('Address is rejected', () =>
      expectDrawerRejected(companyPage, companyPage.addressDrawer.addedAddress(tc.data.address.address1), undefined,
        `ZIP "${tc.data.address.postalCode}" was accepted for ${tc.data.address.state} and the address was added - no ZIP format validation`));
  });
});
