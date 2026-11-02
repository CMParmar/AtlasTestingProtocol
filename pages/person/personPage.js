const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { PhoneDrawer } = require('../components/PhoneDrawer');
const { AddressDrawer } = require('../components/AddressDrawer');

/** Add Person page: /Person/Create */
class PersonPage extends BasePage {
  constructor(page) {
    super(page);
    this.firstName = page.locator('#FirstName');
    this.middleName = page.locator('#MiddleName');
    this.lastName = page.locator('#LastName');
    this.handle = page.locator('#Handle');
    this.email = page.locator('#PrimaryEmail');
    this.addPersonButton = page.getByRole('button', { name: 'Add Person' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' }).or(page.getByRole('link', { name: 'Cancel' }));
    this.phoneDrawer = new PhoneDrawer(page);
    this.addressDrawer = new AddressDrawer(page);
  }

  async gotoCreate() {
    await this.open('/Person/Create');
    await expect(this.firstName).toBeVisible();
  }

  /** @param {import('../../testData/personData').PersonData} p */
  async fillForm(p) {
    if (p.firstName) await this.firstName.fill(p.firstName);
    if (p.middleName) await this.middleName.fill(p.middleName);
    if (p.lastName) await this.lastName.fill(p.lastName);
    if (p.handle) await this.handle.fill(p.handle);
    if (p.email) await this.email.fill(p.email);
    if (p.phone) {
      await this.phoneDrawer.add(p.phone);
      await this.closeDrawerIfOpen();
    }
    if (p.address) {
      await this.addressDrawer.add(p.address);
      await this.closeDrawerIfOpen();
    }
  }

  async submit() {
    await this.addPersonButton.click();
    await expect(this.page).not.toHaveURL(/\/Person\/Create/, { timeout: 30_000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Clicks "Add Person" for a negative test and waits for either outcome:
   * the given validation message, or the record being saved anyway.
   * @returns {Promise<{ saved: boolean, url: string, id: string }>}
   */
  async trySubmit(expectedMessage) {
    await this.addPersonButton.click();
    await expect(this.validationMessage(expectedMessage).or(this.recordAddedMessage)).toBeVisible({ timeout: 30_000 });
    const saved = /\/Person\/Edit\/\d+/.test(this.page.url());
    return { saved, url: this.page.url(), id: saved ? this.recordIdFromUrl() : '' };
  }

  /** Full create flow; returns the saved record's URL and id. */
  async createPerson(p) {
    await this.gotoCreate();
    await this.fillForm(p);
    await this.submit();
    return { url: this.page.url(), id: this.recordIdFromUrl() };
  }

  /** After saving, the app opens /Person/Edit/{id} with the same field ids pre-filled. */
  async expectPersonSaved(p) {
    await expect(this.page).toHaveURL(/\/Person\/Edit\/\d+/);
    await expect(this.recordAddedMessage).toBeVisible();
    await expect(this.firstName).toHaveValue(p.firstName);
    if (p.middleName) await expect(this.middleName).toHaveValue(p.middleName);
    await expect(this.lastName).toHaveValue(p.lastName);
    if (p.handle) await expect(this.handle).toHaveValue(p.handle);
    if (p.email) await expect(this.email).toHaveValue(p.email);
    if (p.phone) await expect(this.phoneText(p.phone.number)).toBeVisible();
    if (p.address) await expect(this.page.locator('main').getByText(p.address.address1).first()).toBeVisible();
  }
}

module.exports = { PersonPage };
