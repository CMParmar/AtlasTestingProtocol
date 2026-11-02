const { expect } = require('@playwright/test');
const { AccountPage } = require('./accountPage');

const TEXT_FIELDS = ['accountName', 'accountNumber', 'accountingCustomerKey'];
const SELECT_FIELDS = ['accountStatus', 'timeZone', 'paymentTerm', 'billingType'];

/**
 * Account detail / edit page: /Account/Edit/{id} (use case 61959 View and Update Account).
 * Uses the same field partials as Create Account (#AccountName, #AccountNumber, #AccountStatusIDF,
 * #AuthoritativeTimeZoneIDF, #PaymentTermIDF, #DefaultBillingTypeIDF, #AccountingCustomerKey) and the same
 * "Use <owner> Billing Address" switch. Extends AccountPage so a test can create the account it edits.
 */
class AccountEditPage extends AccountPage {
  constructor(page) {
    super(page);
    // Save stays the #form-account button inherited from AccountPage (the Edit form has the same id)
    this.actionsButton = page.locator('#accountActionsDropdown');
    this.deleteButton = page.locator('#btnDeleteAccount');
    this.deleteConfirmButton = page.locator('#btnDeleteAccountConfirm');
    this.restoreButton = page.locator('#btnRestoreAccount');
    this.restoreConfirmButton = page.locator('#btnRestoreAccountConfirm');
    // the owner is shown as a link ("Account Owner: <name>"), never as an editable field (BR-3)
    this.ownerFields = page.locator('input[name="EntityIDF"], input[name="EntityRecordID"], select[name="EntityIDF"], select[name="EntityRecordID"]')
      .filter({ visible: true });
    this.rateCardField = page.locator('main').getByText(/Rate Card/i).filter({ visible: true });
    this.useParentConfirmButton = page.locator('#btnUseParentConfirm');
  }

  async gotoEdit(id) {
    await this.openRecord(`/Account/Edit/${id}`);
    await expect(this.page).toHaveURL(new RegExp(`/Account/Edit/${id}(?:[/?#]|$)`));
    await expect(this.accountNumber).toBeVisible();
  }

  /** Header link to the owner: "Account Owner: <Company / Person display name>". */
  ownerLink(name) {
    return this.page.locator('main').getByRole('link', { name, exact: true }).first();
  }

  /**
   * Changes only the keys present in `u`. Text fields take strings ('' clears); dropdowns take the option text;
   * `billingAddress` enters the account's own address (MF-5); `useParentBilling: true` switches back to the owner's (AF-14).
   * @returns {Promise<string>} text of the AF-14 confirmation, when one was shown
   */
  async updateForm(u) {
    for (const key of TEXT_FIELDS) {
      if (key in u) await this[key].fill(u[key] || '');
    }
    for (const key of SELECT_FIELDS) {
      if (u[key]) await this[key].selectOption({ label: u[key] });
    }
    if (u.billingAddress) await this.enterOwnBillingAddress(u.billingAddress);
    if (u.useParentBilling) return this.switchToOwnerBilling();
    return '';
  }

  /** AF-14: OFF -> ON with an own address entered asks for confirmation; Continue replaces it with the owner's. */
  async switchToOwnerBilling() {
    await this.useParentBillingSwitch.click();
    await expect(this.useParentConfirmButton, 'Confirmation before the account address is replaced').toBeVisible();
    const text = (await this.page.locator('.modal.show .modal-body').innerText()).trim().replace(/\s+/g, ' ');
    await this.useParentConfirmButton.click();
    await expect(this.useParentBilling).toBeChecked();
    await expect(this.parentAddressPreview).toBeVisible();
    return text;
  }

  /** MF-11: Save, then the standard "Record saved successfully." confirmation (62382). */
  async save() {
    await this.saveRecord(this.saveButton, 'account');
    await expect(this.page).toHaveURL(/\/Account\/Edit\/\d+/);
  }

  /** Save for a negative test: waits for the expected message or a (wrong) save confirmation. */
  async trySave(expectedMessage) {
    await this.saveButton.click();
    const expected = expectedMessage ? this.validationMessage(expectedMessage).or(this.validationError) : this.validationError;
    await expect(expected.or(this.savedMessage).first()).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Actions -> command -> confirmation modal -> confirm (the form posts and the page reloads).
   * Falls back to accepting a native confirm(), which the page uses when its modal helper is missing.
   */
  async runAction(button, confirmButton) {
    const accept = d => d.accept();
    this.page.on('dialog', accept);
    try {
      await this.actionsButton.click();
      await button.click();
      if (await confirmButton.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)) {
        await Promise.all([this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }), confirmButton.click()]);
      }
      await this.page.waitForLoadState('domcontentloaded');
    } finally {
      this.page.off('dialog', accept);
    }
  }

  /** MF-12: Actions -> "Delete Account" -> "Are you sure you want to delete this account?" -> Delete. */
  async deleteAccount() {
    await this.runAction(this.deleteButton, this.deleteConfirmButton);
  }

  /** MF-13: Actions -> Restore (offered on a deleted account) -> "Restore this Account?" -> Restore Account. */
  async restoreAccount() {
    await this.runAction(this.restoreButton, this.restoreConfirmButton);
  }

  /** Every value of `v` is shown on the open account. */
  async expectDetails(v) {
    await expect(this.page).toHaveURL(/\/Account\/Edit\/\d+/);
    for (const key of TEXT_FIELDS) {
      if (key in v) await expect(this[key], key).toHaveValue(v[key] || '');
    }
    for (const key of SELECT_FIELDS) {
      if (v[key]) await expect(this[key].locator('option:checked'), key).toHaveText(v[key]);
    }
    if (v.billingAddress) {
      await expect(this.useParentBilling, 'Account uses its own billing address').not.toBeChecked();
      await expect(this.ownAddress.getByText(v.billingAddress.address1).first()).toBeVisible();
    }
    if (v.ownerAddress) {
      await expect(this.useParentBilling, 'Account uses the owner billing address').toBeChecked();
      await expect(this.parentAddressPreview).toContainText(v.ownerAddress.address1);
    }
  }
}

module.exports = { AccountEditPage };
