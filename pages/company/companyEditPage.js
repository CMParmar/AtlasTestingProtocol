const { expect } = require('@playwright/test');
const { CompanyPage } = require('./companyPage');

const TEXT_FIELDS = ['tradeName', 'legalName', 'ein', 'website', 'displayName'];

/**
 * Company detail / edit page: /Company/Edit/{id} (use case 62385 View & Edit Company).
 * Same field ids as Add Company, plus Display Name, Save, the record tabs, Signals and the Actions menu.
 * Extends CompanyPage so a test can create the company it edits (createCompany).
 */
class CompanyEditPage extends CompanyPage {
  constructor(page) {
    super(page);
    this.displayName = page.getByLabel('Display Name', { exact: true });
    this.saveButton = page.getByRole('button', { name: /^Save( & View)?$/ }).first();
    this.signalsButton = page.getByRole('button', { name: /Signals/ }).or(page.getByRole('link', { name: /Signals/ })).first();
    this.actionsMenu = page.locator('main').getByText('Actions', { exact: true }).filter({ visible: true }).first();
  }

  async gotoEdit(id) {
    await this.openRecord(`/Company/Edit/${id}`);
    await expect(this.page).toHaveURL(new RegExp(`/Company/Edit/${id}(?:[/?#]|$)`));
    await expect(this.tradeName).toBeVisible();
  }

  async uncheckRole(name) {
    if (await this.role(name).isChecked()) {
      await this.page.locator('label.role-item').filter({ hasText: name }).click();
    }
    await expect(this.role(name)).not.toBeChecked();
  }

  /**
   * Changes only the keys present in `u`; an empty string clears the field.
   * `u.roles` is the complete new role set: roles in `currentRoles` but not in `u.roles` are unticked.
   */
  async updateForm(u, currentRoles = []) {
    for (const key of TEXT_FIELDS) {
      if (key in u) await this[key].fill(u[key] || '');
    }
    if (u.entityType) await this.entityType.selectOption({ label: u.entityType });
    if (u.roles) {
      for (const r of new Set([...currentRoles, ...u.roles])) {
        if (u.roles.includes(r)) await this.checkRole(r);
        else await this.uncheckRole(r);
      }
    }
    if (u.phone) {
      await this.phoneDrawer.add(u.phone);
      await this.closeDrawerIfOpen();
    }
    if (u.address) {
      await this.addressDrawer.add(u.address);
      await this.closeDrawerIfOpen();
    }
  }

  /** Clicks Save and waits for the post-back and "Record saved successfully." (MF-11). */
  async save() {
    await this.saveRecord(this.saveButton, 'company');
    await expect(this.page).toHaveURL(/\/Company\/Edit\/\d+/);
  }

  /** Clicks Save for a negative test and waits for either the validation message or a (wrong) save confirmation. */
  async trySave(expectedMessage) {
    await this.saveButton.click();
    await expect(this.validationMessage(expectedMessage).or(this.savedMessage)).toBeVisible({ timeout: 30_000 });
  }

  /** 62248 MF-3: LTRIM(LEFT(name, 200)), whitespace trimmed and repeated spaces collapsed. */
  static generatedDisplayName(name = '') {
    return name.slice(0, 200).replace(/\s+/g, ' ').trim();
  }

  /** Display Name maintained by 62248: Trade Name, else Legal Name, unless the user overwrote it. */
  static displayNameOf(c) {
    return c.displayName || CompanyEditPage.generatedDisplayName(c.tradeName || c.legalName);
  }

  /** Item of the open Actions dropdown, e.g. "Delete" / "Restore". */
  actionItem(name) {
    return this.page.locator('.dropdown-menu').filter({ visible: true }).getByText(name).first();
  }

  /**
   * Runs an Actions menu command (Delete / Restore) and confirms it, whether the app
   * asks with a Bootstrap modal or a native confirm().
   */
  async runAction(name) {
    const accept = d => d.accept();
    this.page.on('dialog', accept);
    try {
      await this.actionsMenu.click();
      await this.actionItem(name).click();
      const confirm = this.page.locator('.modal.show').getByRole('button', { name: /^(Delete|Restore|Yes|Confirm|OK)\b/i }).first();
      if (await confirm.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) await confirm.click();
      await this.page.waitForLoadState('domcontentloaded');
    } finally {
      this.page.off('dialog', accept);
    }
  }

  /**
   * Every value of `c` is shown on the open record.
   * @param {string[]} [knownRoles] roles to check both ways (ticked when in c.roles, unticked otherwise)
   */
  async expectDetails(c, knownRoles = c.roles || []) {
    await expect(this.page).toHaveURL(/\/Company\/Edit\/\d+/);
    await expect(this.tradeName).toHaveValue(c.tradeName || '');
    await expect(this.legalName).toHaveValue(c.legalName || '');
    if (c.entityType) await expect(this.entityType.locator('option:checked')).toHaveText(c.entityType);
    await expect(this.ein).toHaveValue(c.ein || '');
    await expect(this.website).toHaveValue(c.website || '');
    for (const r of knownRoles) {
      if ((c.roles || []).includes(r)) await expect(this.role(r), `Role "${r}" should be assigned`).toBeChecked();
      else await expect(this.role(r), `Role "${r}" should be removed`).not.toBeChecked();
    }
    if (c.phone) await expect(this.phoneText(c.phone.number)).toBeVisible();
    if (c.address) await expect(this.page.locator('main').getByText(c.address.address1).first()).toBeVisible();

    const display = CompanyEditPage.displayNameOf(c);
    await expect(this.displayName, 'Display Name should be maintained by 62248').toHaveValue(display);
    await expect(this.page.locator('main').getByText(display, { exact: true }).first(), 'Header shows the Display Name').toBeVisible();
  }
}

module.exports = { CompanyEditPage };
