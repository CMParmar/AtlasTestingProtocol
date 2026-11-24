const { expect } = require('@playwright/test');

/**
 * "+ Add Phone Number" slide-out drawer (shared by Person and Company forms).
 * The drawer clones the hidden template, so live fields carry a "slideout_" id prefix.
 */
class PhoneDrawer {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    // on a saved record that already has a phone the button reads "+ Add another phone number"
    this.openButton = page.locator('button.add-phone-btn').filter({ visible: true }).first();   // by class: the caption is localized per user
    this.numberInput = page.locator('#slideout_new_phone_numberRaw');
    this.continueButton = page.locator('#slideout_new_phone_continue_btn');
  }

  typeOption(type) {
    // radios are visually hidden Bootstrap .btn-check inputs - click their label
    return this.page.locator(`label[for="slideout_new_phone_phoneType_${type.toLowerCase()}"]`);
  }

  /** Text of the phone as copied back to the main form ("+1 2025550143"). */
  addedPhone(number) {
    return this.page.locator('form').getByText(number.replace(/\D/g, '') || number).first();
  }

  /** Opens the drawer, fills it and clicks Continue - no assertion on the outcome. */
  async fillAndContinue(phone) {
    // the click can land before the page script binds the handler: retry until the drawer is open
    await expect(async () => {
      if (!(await this.numberInput.isVisible())) await this.openButton.click();
      await expect(this.numberInput).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    // on a slow page the drawer script can reset the field after the fill ("Phone number is required"): fill until it sticks
    await expect(async () => {
      await this.numberInput.fill(phone.number);
      await expect(this.numberInput).toHaveValue(/\d/, { timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await this.typeOption(phone.type || 'Mobile').click();
    await clickContinue(this.continueButton);
  }

  /** @param {{ number: string, type?: 'Mobile'|'Landline'|'Fax'|'VoIP' }} phone */
  async add(phone) {
    await this.fillAndContinue(phone);
    await expect(this.addedPhone(phone.number)).toBeVisible();
  }
}

/**
 * Clicks a drawer's Continue button. The app sometimes validates as you type and disables
 * Continue for invalid input - that is already a rejection, so a disabled button is not an error.
 */
async function clickContinue(button) {
  try {
    await button.click({ timeout: 5_000 });
  } catch (e) {
    if (await button.isDisabled()) return;
    throw e;
  }
}

module.exports = { PhoneDrawer, clickContinue };
