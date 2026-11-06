const { expect } = require('@playwright/test');
const { clickContinue } = require('./PhoneDrawer');

/** "Add Address" slide-out drawer (shared by Person and Company forms). */
class AddressDrawer {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.openButton = page.getByRole('button', { name: /Add Address/ });
    const f = name => page.locator(`#slideout_Addresses___INDEX____${name}`);
    this.recipientName = f('recipientName');
    this.address1 = f('address1');
    this.address2 = f('address2');
    this.city = f('city');
    this.state = f('RegionIDF');
    this.postalCode = f('postalCode');
    this.continueButton = page.locator('button[onclick="fnValidateAndAddAddress()"]').filter({ visible: true });
  }

  typeButton(type) {
    return this.page.locator('.address-type-btn').filter({ hasText: type, visible: true });
  }

  /** Street line as shown on the main form once the address is accepted. */
  addedAddress(address1) {
    return this.page.locator('form').getByText(address1).first();
  }

  /** Opens the drawer, fills whatever is provided and clicks Continue - no assertion on the outcome. */
  async fillAndContinue(address) {
    await this.openButton.click();
    await expect(this.recipientName).toBeVisible();
    if (address.type) await this.typeButton(address.type).click();
    if (address.recipientName) await this.recipientName.fill(address.recipientName);
    if (address.address1) await this.address1.fill(address.address1);
    if (address.address2) await this.address2.fill(address.address2);
    if (address.city) await this.city.fill(address.city);
    // native <select> sits under a custom dropdown button; labels are upper-case state names
    if (address.state) await this.state.selectOption({ label: address.state.toUpperCase() }, { force: true });
    if (address.postalCode) await this.postalCode.fill(address.postalCode);
    await clickContinue(this.continueButton);
  }

  /**
   * @param {{ type?: 'Billing'|'Mailing'|'Shipping', recipientName: string, address1: string,
   *           address2?: string, city: string, state: string, postalCode: string }} address
   */
  async add(address) {
    await this.fillAndContinue(address);
    await expect(this.addedAddress(address.address1)).toBeVisible();
  }
}

module.exports = { AddressDrawer };
