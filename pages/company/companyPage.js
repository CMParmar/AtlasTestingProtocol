const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { PhoneDrawer } = require('../components/PhoneDrawer');
const { AddressDrawer } = require('../components/AddressDrawer');

/**
 * Company is a two-step flow:
 *   1. /Company/SearchCompany - duplicate check on Trade/Legal name, EIN, website
 *   2. /Company/Create        - full form, saved with "Save & View"
 */
class CompanyPage extends BasePage {
  constructor(page) {
    super(page);
    // shared ids on both steps
    this.tradeName = page.locator('#TradeName');
    this.legalName = page.locator('#LegalName');
    this.ein = page.locator('#EIN');
    this.website = page.locator('#Website');
    // step 1
    this.continueButton = page.locator('#btn-continue');
    this.similarRecordsAlert = page.getByText('We found similar records in the database');
    this.openExistingCompanyLink = page.getByRole('link', { name: 'Open Existing Company' });
    // step 2
    this.entityType = page.locator('#CompanyEntityTypeIDF');
    this.saveAndViewButton = page.getByRole('button', { name: 'Save & View' });
    this.saveAndAddAnotherButton = page.getByRole('button', { name: 'Save & Add Another' });
    this.phoneDrawer = new PhoneDrawer(page);
    this.addressDrawer = new AddressDrawer(page);
  }

  /** Company role checkbox input (visually hidden; styled by its <label class="role-item">). */
  role(name) {
    return this.page.getByLabel(name, { exact: true });
  }

  async checkRole(name) {
    if (!(await this.role(name).isChecked())) {
      await this.page.locator('label.role-item').filter({ hasText: name }).click();
    }
    await expect(this.role(name)).toBeChecked();
  }

  async gotoSearch() {
    await this.open('/Company/SearchCompany');
    await expect(this.tradeName).toBeVisible();
  }

  /**
   * Step 1: runs the duplicate check (async fetch). Resolves once the app either
   * moved on to /Company/Create (no matches) or listed similar records.
   */
  async searchCompany({ tradeName = '', legalName = '', ein = '', website = '' }) {
    await this.tradeName.fill(tradeName);
    if (legalName) await this.legalName.fill(legalName);
    if (ein) await this.ein.fill(ein);
    if (website) await this.website.fill(website);
    await this.continueButton.click();
    await expect(this.entityType.or(this.similarRecordsAlert)).toBeVisible({ timeout: 30_000 });
  }

  /** Step 1 -> 2. When similar records are listed the button becomes "Add Company"; click it to continue. */
  async proceedToCreate(c) {
    await this.searchCompany({ tradeName: c.tradeName });
    if (await this.similarRecordsAlert.isVisible()) {
      await expect(this.continueButton).toHaveText(/Add Company/);
      await expect(this.continueButton).toBeEnabled();
      await this.continueButton.click();
    }
    await expect(this.page).toHaveURL(/\/Company\/Create/);
    await expect(this.entityType).toBeVisible();
  }

  /** @param {import('../../testData/companyData').CompanyData} c */
  async fillForm(c) {
    await this.tradeName.fill(c.tradeName);
    if (c.legalName) await this.legalName.fill(c.legalName);
    if (c.entityType) await this.entityType.selectOption({ label: c.entityType });
    if (c.ein) await this.ein.fill(c.ein);
    for (const r of c.roles || []) await this.checkRole(r);
    if (c.website) await this.website.fill(c.website);
    if (c.phone) {
      await this.phoneDrawer.add(c.phone);
      await this.closeDrawerIfOpen();
    }
    if (c.address) {
      await this.addressDrawer.add(c.address);
      await this.closeDrawerIfOpen();
    }
  }

  async saveAndView() {
    await this.saveAndViewButton.click();
    await expect(this.page).not.toHaveURL(/\/Company\/(Create|SearchCompany)/, { timeout: 30_000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Clicks "Save & View" for a negative test and waits for either outcome:
   * the given validation message, or the record being saved anyway.
   * @returns {Promise<{ saved: boolean, url: string, id: string }>}
   */
  async trySave(expectedMessage) {
    await this.saveAndViewButton.click();
    await expect(this.validationMessage(expectedMessage).or(this.recordAddedMessage)).toBeVisible({ timeout: 30_000 });
    const saved = !/\/Company\/(Create|SearchCompany)/.test(this.page.url());
    return { saved, url: this.page.url(), id: saved ? this.recordIdFromUrl() : '' };
  }

  /** Full create flow; returns the saved record's URL and id. */
  async createCompany(c) {
    await this.gotoSearch();
    await this.proceedToCreate(c);
    await this.fillForm(c);
    await this.saveAndView();
    return { url: this.page.url(), id: this.recordIdFromUrl() };
  }

  /** After "Save & View" the saved company opens with the same field ids pre-filled. */
  async expectCompanySaved(c) {
    await expect(this.recordAddedMessage).toBeVisible();
    await expect(this.tradeName).toHaveValue(c.tradeName);
    if (c.legalName) await expect(this.legalName).toHaveValue(c.legalName);
    if (c.entityType) await expect(this.entityType.locator('option:checked')).toHaveText(c.entityType);
    if (c.ein) await expect(this.ein).toHaveValue(c.ein);
    if (c.website) await expect(this.website).toHaveValue(c.website);
    for (const r of c.roles || []) await expect(this.role(r)).toBeChecked();
    if (c.phone) await expect(this.phoneText(c.phone.number)).toBeVisible();
    if (c.address) await expect(this.page.locator('main').getByText(c.address.address1).first()).toBeVisible();
  }
}

module.exports = { CompanyPage };
