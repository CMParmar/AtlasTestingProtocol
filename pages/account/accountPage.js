const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { clickContinue } = require('../components/PhoneDrawer');

/** EntityIDF values the app passes to /Account/Create (seen in the parent pages' "Add New Account" links). */
const ENTITY = { Company: 3, Person: 9 };

/**
 * Create Account (use case 61957): /Account/Create?EntityIDF={3|9}&EntityRecordID={parentId}, form #form-account.
 * Started from the parent's Actions menu ("+ Add New Account"); when the parent already has accounts the
 * parent page shows its Accounts tab with the "Existing Account Advisory" and the user continues from there.
 *
 * Billing address: the "Use <parent> Billing Address" switch (#UseParentBillingAddress).
 *   ON  - parent's billing address shown read-only (#account-parent-address-preview), i.e. inherited.
 *   OFF - the account's own address (#account-address-host), edited in a slide-out (override, MF-5).
 * When the parent has no billing address the switch starts OFF and cannot be turned on (AF-6).
 */
class AccountPage extends BasePage {
  constructor(page) {
    super(page);
    this.accountName = page.locator('#AccountName');
    this.accountNumber = page.locator('#AccountNumber');
    this.accountStatus = page.locator('#AccountStatusIDF');
    this.timeZone = page.locator('#AuthoritativeTimeZoneIDF');
    this.paymentTerm = page.locator('#PaymentTermIDF');
    this.billingType = page.locator('#DefaultBillingTypeIDF');
    this.accountingCustomerKey = page.locator('#AccountingCustomerKey');
    this.saveButton = page.locator('#form-account').getByRole('button', { name: 'Save', exact: true });
    // billing address
    this.useParentBilling = page.locator('#UseParentBillingAddress');
    this.useParentBillingSwitch = page.locator('label.status-switch').filter({ has: this.useParentBilling });
    this.parentAddressPreview = page.locator('#account-parent-address-preview');
    this.ownAddress = page.locator('#account-address-host');
    this.editOwnAddressButton = this.ownAddress.locator('.edit-address-btn').first();
    this.ownerBillingUnavailable = page.getByText('The account owner does not yet have a billing address');
    this.goBackButton = page.getByRole('button', { name: 'Go back', exact: true });
    // parent page (Person / Company)
    this.actionsButton = page.locator('#actionsDropdown');
    this.addNewAccountAction = page.locator('.dropdown-menu.show').getByText('Add New Account');
    this.advisory = page.locator('#divExistingAccountAdvisory');
    this.accountsTab = page.locator('.person-accounts-tab');
    this.accountRows = page.locator('#accounts-table tbody tr');
    this.validationError = page.locator('.field-validation-error, .text-danger, .invalid-feedback, .validation-summary-errors, .alert-danger')
      .filter({ visible: true, hasText: /[A-Za-z]{3}/ }).first();
  }

  static createPath(parentType, parentId) {
    return `/Account/Create?EntityIDF=${ENTITY[parentType]}&EntityRecordID=${parentId}`;
  }

  /**
   * MF-1 / MF-2: Actions -> "+ Add New Account" on the open parent page.
   * @returns {Promise<boolean>} true when the Existing Account Advisory was shown instead of the form
   */
  async startFromParent() {
    await this.actionsButton.click();
    await this.addNewAccountAction.click();
    await expect(this.accountNumber.or(this.advisory)).toBeVisible({ timeout: 30_000 });
    return this.advisory.isVisible();
  }

  /** MF-2 -> MF-3: continue from the advisory with the Accounts tab's "Add New Account" button. */
  async continueAfterAdvisory() {
    await this.accountsTab.getByRole('link', { name: /Add New Account/ }).first().click();
    await this.expectFormOpen();
  }

  /** AF-1: the user does not continue - dismisses the advisory and stays on the parent. */
  async dismissAdvisory() {
    await this.advisory.locator('.btn-close').click();
    await expect(this.advisory).toBeHidden();
  }

  async expectFormOpen() {
    await expect(this.page).toHaveURL(/\/Account\/Create/i);
    await expect(this.accountNumber).toBeVisible();
  }

  /**
   * Required dropdowns (Payment Term, Time Zone, Account Status) must be assigned to save (MF-6).
   * Keeps the default (MF-3) when there is one, otherwise picks `preferred` or the first real option.
   * Returns the selected option's text.
   */
  async ensureSelected(select, preferred) {
    if (!(await select.inputValue())) {
      const options = select.locator('option:not([value=""])');
      const pick = preferred && (await options.filter({ hasText: preferred }).count())
        ? options.filter({ hasText: preferred }).first() : options.first();
      await select.selectOption(await pick.getAttribute('value'));
    }
    return (await select.locator('option:checked').innerText()).trim();
  }

  /** Assigns every required dropdown the form leaves empty (Account Status is not defaulted by the app). */
  async completeRequired() {
    await this.ensureSelected(this.accountStatus, 'Active');
    await this.ensureSelected(this.timeZone);
    await this.ensureSelected(this.paymentTerm);
  }

  /** Turns "Use <parent> Billing Address" off (ON -> OFF is silent) so the account gets its own address. */
  async useOwnBillingAddress() {
    if (await this.useParentBilling.isChecked()) await this.useParentBillingSwitch.click();
    await expect(this.useParentBilling).not.toBeChecked();
    await expect(this.ownAddress).toBeVisible();
  }

  /** MF-5: enters the account's own billing address in the address slide-out. */
  async enterOwnBillingAddress(a) {
    await this.useOwnBillingAddress();
    await this.editOwnAddressButton.click();
    const f = name => this.page.locator(`#slideout_Addresses_0__${name}`);
    await expect(f('recipientName')).toBeVisible();
    await f('recipientName').fill(a.recipientName);
    await f('address1').fill(a.address1);
    if (a.address2) await f('address2').fill(a.address2);
    await f('city').fill(a.city);
    // native <select> sits under a custom dropdown button; labels are upper-case state names
    await f('RegionIDF').selectOption({ label: a.state.toUpperCase() }, { force: true });
    await f('postalCode').fill(a.postalCode);
    await clickContinue(this.page.locator('button[onclick^="fnValidateAndSetDataInForm"]').filter({ visible: true }));
    await this.closeDrawerIfOpen();
    await expect(this.ownAddress.getByText(a.address1).first(), 'Entered address shown on the form').toBeVisible();
  }

  /** Sets a dropdown to its empty option; returns false when it has none (field can never be unassigned). */
  async clearSelect(select) {
    if (!(await select.locator('option[value=""]').count())) return false;
    await select.selectOption('', { force: true });
    return true;
  }

  /** Reads the values the form currently holds. */
  async formValues() {
    const selected = async s => ((await s.inputValue()) ? (await s.locator('option:checked').innerText()).trim() : '');
    return {
      accountNumber: await this.accountNumber.inputValue(),
      accountName: await this.accountName.inputValue(),
      accountStatus: await selected(this.accountStatus),
      timeZone: await selected(this.timeZone),
      paymentTerm: await selected(this.paymentTerm),
      billingType: await selected(this.billingType),
      accountingCustomerKey: await this.accountingCustomerKey.inputValue(),
    };
  }

  /**
   * Seeds an Account for another use case: opens the Create form directly for the parent, keeps the defaults,
   * optionally enters an own billing address, saves. Returns { url, id, values }.
   */
  async createAccountFor(parentType, parentId, edits = {}) {
    await this.openRecord(AccountPage.createPath(parentType, parentId));
    await this.expectFormOpen();
    await this.completeRequired();
    if (edits.billingAddress) await this.enterOwnBillingAddress(edits.billingAddress);
    const values = await this.formValues();
    const record = await this.submitNew();
    return { ...record, values };
  }

  /** MF-6: saves and waits for the new account to open (61959 View & Edit Account). */
  async save() {
    return this.submitNew();
  }

  /** Create-form submit; separate from save() so AccountEditPage can override save() for the Edit page. */
  async submitNew() {
    await this.saveButton.click();
    await expect(this.page, 'Account saved and opened (still on /Account/Create means the save was rejected)')
      .not.toHaveURL(/\/Account\/Create/i, { timeout: 30_000 });
    await expect(this.page).toHaveURL(/\/Account\//i);
    await this.page.waitForLoadState('domcontentloaded');
    return { url: this.page.url(), id: this.recordIdFromUrl() };
  }

  /**
   * Save for a negative test: waits for either a validation error on the create page or a (wrong) save.
   * @returns {Promise<{ saved: boolean, url: string, id: string }>}
   */
  async trySave() {
    await this.saveButton.click();
    await expect.poll(async () => {
      if (!/\/Account\/Create/i.test(this.page.url())) return 'saved';
      return (await this.validationError.isVisible()) ? 'rejected' : '';
    }, { timeout: 30_000 }).not.toBe('');
    const saved = !/\/Account\/Create/i.test(this.page.url());
    return { saved, url: this.page.url(), id: saved ? this.recordIdFromUrl() : '' };
  }

  /** A value is shown on the opened account, as a field value or as text. */
  async expectShown(field, value) {
    if (await field.count()) await expect(field).toHaveValue(value);
    else await expect(this.page.locator('main').getByText(value).first()).toBeVisible();
  }

  /** The saved account opened with its number and name (MF-6 step 3). */
  async expectAccountOpened(values) {
    await this.expectShown(this.accountNumber, values.accountNumber);
    await this.expectShown(this.accountName, values.accountName);
  }

  /** Street line of a billing address shown on the page (inherited or account-specific). */
  addressText(address) {
    return this.page.locator('main').getByText(address.address1).first();
  }
}

module.exports = { AccountPage, ENTITY };
