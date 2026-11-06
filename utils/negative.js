const { test, expect } = require('@playwright/test');
const { recordCreated } = require('./testCase');

/** Stores the validation text the app actually showed (Excel "Actual Result" / Remarks). */
async function observe(locator) {
  const text = (await locator.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
  if (text) test.info().annotations.push({ type: 'Observed', description: `Validation shown: "${text}"` });
}

/**
 * Save-level negative check. If the app saved the record anyway, the record is logged
 * (Excel data sheets + Allure link) before the test fails with a DEFECT message.
 */
async function expectNotSaved(testInfo, module, tc, result) {
  if (result.saved) await recordCreated(testInfo, module, tc, tc.data, result);
  expect(result.saved, `DEFECT: the app saved the ${module} (record #${result.id}) instead of rejecting the invalid input`).toBe(false);
}

/** Asserts the expected validation message is visible and records it. */
async function expectValidationMessage(po, message) {
  const error = po.validationMessage(message);
  await expect(error, `Expected validation message "${message}"`).toBeVisible();
  await observe(error);
}

/**
 * Drawer-level negative check (phone / address): waits for either outcome, then asserts
 * the value was NOT added to the form, a validation message is shown and the drawer stays open.
 * @param {import('../pages/BasePage').BasePage} po  page object (Person or Company)
 * @param {import('@playwright/test').Locator|null} added  what the form shows if the value was accepted
 * @param {string} [message]  exact validation text; omitted = any validation error counts
 * @param {string} [defect]  what went wrong if the value is accepted (becomes the Excel "Actual Result")
 */
async function expectDrawerRejected(po, added, message, defect = 'the invalid value was accepted and added to the form') {
  const error = message ? po.validationMessage(message) : po.anyValidationError();
  await expect(added ? error.or(added) : error).toBeVisible();
  if (added) await expect(added, `DEFECT: ${defect}`).toHaveCount(0);
  await expect(error, message ? `Expected validation message "${message}"` : 'Expected a validation error').toBeVisible();
  await expect(po.openDrawer, 'Drawer should stay open so the user can correct the value').toHaveCount(1);
  await observe(error);
}

module.exports = { expectNotSaved, expectValidationMessage, expectDrawerRejected };
