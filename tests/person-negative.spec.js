const { test, expect } = require('../fixtures/fixtures');
const { personNegativeCases: c } = require('../testData/personNegativeData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues } = require('../utils/testCase');
const { expectNotSaved, expectValidationMessage, expectDrawerRejected } = require('../utils/negative');

const MODULE = 'Person';

// Invalid / missing input must be rejected. A record saved by mistake is NOT deleted;
// it is logged in the Excel "Person Test Data" sheet and the test fails as a defect.
test.describe('Person - Negative validation', () => {
  test.beforeEach(async ({ personPage }) => personPage.gotoCreate());

  test(tcTitle(c.noNameNoEmail), tcDetails(c.noNameNoEmail, MODULE), async ({ personPage }, testInfo) => {
    const tc = c.noNameNoEmail;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.data);

    await personPage.fillForm(tc.data);
    const result = await test.step('Click Add Person', () => personPage.trySubmit(tc.message));
    await expectNotSaved(testInfo, MODULE, tc, result);
    await expectValidationMessage(personPage, tc.message);
    await expect(personPage.page).toHaveURL(/\/Person\/Create/);
  });

  test(tcTitle(c.invalidEmail), tcDetails(c.invalidEmail, MODULE), async ({ personPage }, testInfo) => {
    const tc = c.invalidEmail;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.data);

    await personPage.fillForm(tc.data);
    const result = await test.step('Click Add Person', () => personPage.trySubmit(tc.message));
    await expectNotSaved(testInfo, MODULE, tc, result);
    await expectValidationMessage(personPage, tc.message);
    await expect(personPage.page).toHaveURL(/\/Person\/Create/);
  });

  for (const tc of [c.phoneRequired, c.phoneNonNumeric]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personPage, page }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.data);

      await test.step('Fill the phone drawer and click Continue', () => personPage.phoneDrawer.fillAndContinue(tc.data.phone));
      await test.step('Phone is rejected', () =>
        expectDrawerRejected(personPage, page.locator('form').getByText('Primary Phone Number', { exact: true }), tc.message,
        `phone number "${tc.data.phone.number}" was accepted and added to the person`));
    });
  }

  test(tcTitle(c.addressRequired), tcDetails(c.addressRequired, MODULE), async ({ personPage }, testInfo) => {
    const tc = c.addressRequired;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.data);

    await test.step('Click Continue with the required fields empty', () => personPage.addressDrawer.fillAndContinue(tc.data.address));
    await test.step('Address is rejected', () => expectDrawerRejected(personPage, null, tc.message));
  });

  test(tcTitle(c.invalidZip), tcDetails(c.invalidZip, MODULE), async ({ personPage }, testInfo) => {
    const tc = c.invalidZip;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.data);

    await test.step('Fill the address drawer with an invalid ZIP', () => personPage.addressDrawer.fillAndContinue(tc.data.address));
    await test.step('Address is rejected', () =>
      expectDrawerRejected(personPage, personPage.addressDrawer.addedAddress(tc.data.address.address1), undefined,
        `ZIP "${tc.data.address.postalCode}" was accepted for ${tc.data.address.state} and the address was added - no ZIP format validation`));
  });
});
