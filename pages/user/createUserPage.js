const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { totp } = require('../../utils/totp');

// Last TOTP code this worker submitted: the server refuses a code that was already used (replay protection),
// so two re-authentications inside the same 30 s window must wait for the next code.
let lastCode = '';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A fresh code from the admin's base32 secret: never the previous one, never one about to expire. */
async function freshTotp(secret) {
  for (;;) {
    const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
    const code = totp(secret);
    if (code !== lastCode && secondsLeft > 3) {
      lastCode = code;
      return code;
    }
    await sleep(secondsLeft * 1000 + 250);
  }
}

/**
 * Grant Access (Create User, use case 62284), started from the Person detail page (/Person/Edit/{id}):
 * Actions -> Grant Access -> "Grant Access" page with "Sign In Email" (pre-filled from the Person), the "Select Roles"
 * checkbox group and "Create User".
 * A Confirmation (Confirm / Back) or an admin re-authentication step after Create User is handled when it appears.
 */
class CreateUserPage extends BasePage {
  constructor(page) {
    super(page);
    const visibleButton = name => page.getByRole('button', { name }).filter({ visible: true }).first();
    const notBanner = { hasNotText: /This is the sandbox/i };

    // ---- Person page: Actions menu ----
    this.actionsButton = page.locator('#actionsDropdown');
    const menu = page.locator('.dropdown-menu.show');
    this.grantAccessAction = menu.locator('a[href*="GrantAccess" i], a[href*="CreateUser" i], [data-action*="grant" i]')
      .or(menu.getByText(/^\s*Grant Access\s*$/i)).first();
    this.manageAccessAction = menu.locator('a[href*="ManageAccess" i]')
      .or(menu.getByText(/^\s*Manage Access\s*$/i)).first();

    // ---- Grant Access form ----
    this.heading = page.locator('main').getByText(/^\s*Grant Access\s*$/i).first();
    this.signInEmail = page.getByRole('textbox', { name: /sign[\s-]?in e-?mail/i })
      .or(page.locator('#SignInEmail, input[name*="SignInEmail" i]'))
      .filter({ visible: true }).first();
    this.rolesGroup = page.getByRole('group', { name: /Select Roles/i });
    this.roleCheckboxes = this.rolesGroup.getByRole('checkbox');
    this.createUserButton = visibleButton(/^Create User$/i);

    // ---- optional steps after Create User ----
    this.confirmButton = visibleButton(/^Confirm$/i);
    this.backButton = page.getByRole('button', { name: /^Back$/i }).or(page.getByRole('link', { name: /^Back$/i }))
      .filter({ visible: true }).first();
    this.reauthPassword = page.locator('input[type="password"]').filter({ visible: true }).first();
    this.reauthCode = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[name*="Code" i], input[id*="Code" i]')
      .filter({ visible: true }).first();
    this.reauthChallenge = this.reauthPassword.or(this.reauthCode).first();
    this.reauthSubmit = visibleButton(/^(Verify|Authenticate|Submit|Continue|Sign in)$/i);

    // ---- outcome (the red sandbox banner is never an error / success message) ----
    this.successMessage = page.getByText(/activation (e-?mail|link)|access (has been |was )?granted|user (has been |was )?(created|added)|invitation (has been |was )?sent|welcome e-?mail|record has been (added|saved)|created successfully/i)
      .or(page.locator('.alert-success, .toast-success, .swal2-icon-success'))
      .filter({ visible: true, ...notBanner }).first();
    // a validation shown as a browser alert() is recorded (and dismissed) here
    this.lastDialog = '';
    page.on('dialog', d => {
      if (d.type() === 'beforeunload') return;   // BasePage.openRecord answers "leave page?" prompts
      this.lastDialog = d.message();
      d.dismiss().catch(() => {});
    });
    // the Grant Access validations are plain text under the field (no error class), e.g. "This sign-in email is
    // already in use. Please enter a different address and try again or Click Here to manage the existing user."
    this.inlineValidation = page.locator('main')
      .getByText(/already in use|not a valid e-?mail|select at least one role/i).filter({ visible: true });
    this.errorMessage = page.locator('.alert-danger, .validation-summary-errors, .field-validation-error, .text-danger, .invalid-feedback, .swal2-html-container, .toast-error')
      .filter({ visible: true, hasText: /[A-Za-z]{3}/, ...notBanner })
      .or(this.inlineValidation).first();
  }

  /** The Grant Access panel: an open dialog, else the page's main area. */
  async panel() {
    const dialog = this.page.locator('.modal.show, [role="dialog"]').filter({ visible: true }).last();
    return (await dialog.count()) ? dialog : this.page.locator('main');
  }

  /** Opens the Person's Actions menu (it can be toggled shut by a late re-render: reopen once). */
  async openActionsMenu(personId) {
    if (!new RegExp(`/Person/Edit/${personId}(?:[/?#]|$)`).test(this.page.url())) await this.openCreatedRecord(`/Person/Edit/${personId}`);
    const anyAction = this.grantAccessAction.or(this.manageAccessAction).first();
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.actionsButton.click();
      if (await anyAction.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) return;
    }
    await expect(anyAction, 'Person Actions menu offers Grant Access / Manage Access').toBeVisible();
  }

  /**
   * MF-1 stimulus: Person -> Actions -> Grant Access; ends on the Grant Access form (/Person/CreateUser/{id}).
   * The page loads slowly on the sandbox, so the click does not wait for the navigation; the URL / form checks do.
   */
  async startGrantAccess(personId) {
    await this.openActionsMenu(personId);
    await expect(this.grantAccessAction, 'Actions -> Grant Access (the Person has no user yet)').toBeVisible();
    await this.grantAccessAction.click({ noWaitAfter: true });
    await this.page.waitForURL(/\/Person\/CreateUser\//i, { timeout: 60_000, waitUntil: 'domcontentloaded' })
      .catch(() => { /* the form check below reports it */ });
    await this.expectForm();
  }

  async expectForm() {
    await expect(this.signInEmail, 'Grant Access form: Sign In Email').toBeVisible({ timeout: 60_000 });
    await expect(this.createUserButton, 'Grant Access form: Create User').toBeVisible();
  }

  /** Which access action the Person's Actions menu offers now; the menu is closed again. */
  async accessActions(personId) {
    await this.openCreatedRecord(`/Person/Edit/${personId}`);
    await this.openActionsMenu(personId);
    const result = { grant: await this.grantAccessAction.isVisible(), manage: await this.manageAccessAction.isVisible() };
    await this.page.keyboard.press('Escape');
    return result;
  }

  /**
   * The Person's Actions menu offers Manage Access (the user exists). The sandbox can take a moment to finish
   * creating the user, so the Person page is reloaded and checked again for up to `timeout`.
   */
  async waitForManageAccess(personId, timeout = 90_000) {
    let last = { grant: false, manage: false };
    await expect.poll(async () => {
      last = await this.accessActions(personId);
      return last.manage;
    }, { message: 'Person Actions menu offers Manage Access (the user was created)', timeout, intervals: [5_000, 10_000] }).toBe(true);
    return last;
  }

  async fillSignInEmail(value) {
    await this.signInEmail.fill(value);
  }

  /** Role names offered in "Select Roles". */
  async availableRoles() {
    await expect(this.roleCheckboxes.first(), 'Select Roles offers roles').toBeVisible();
    return this.roleCheckboxes.evaluateAll(els => els.map(el =>
      ((el.labels && el.labels[0] && el.labels[0].innerText)
        || (el.closest('label') && el.closest('label').innerText)
        || (el.nextElementSibling && el.nextElementSibling.innerText)
        || el.getAttribute('aria-label') || el.value || '').trim()));
  }

  role(name) {
    return this.rolesGroup.getByRole('checkbox', { name, exact: true });
  }

  /** Role names currently ticked. */
  async checkedRoles() {
    const names = await this.availableRoles();
    const out = [];
    for (let i = 0; i < names.length; i++) if (await this.roleCheckboxes.nth(i).isChecked()) out.push(names[i]);
    return out;
  }

  /**
   * Ticks exactly `roles` (every other role is unticked).
   * The app draws a <span class="checkbox-custom"> over each real <input class="role-checkbox">, which blocks a
   * pointer click on the input ("intercepts pointer events"), so the input is toggled with its own click() - the
   * same click / change events the app listens to - and the new state is verified.
   */
  async setRoles(roles) {
    const names = await this.availableRoles();
    for (const r of roles) expect(names, `Role "${r}" is offered`).toContain(r);
    for (let i = 0; i < names.length; i++) {
      const box = this.roleCheckboxes.nth(i);
      const want = roles.includes(names[i]);
      if ((await box.isChecked()) !== want) await box.evaluate(el => el.click());
      if (want) await expect(box, `Role "${names[i]}" ticked`).toBeChecked();
      else await expect(box, `Role "${names[i]}" unticked`).not.toBeChecked();
    }
  }

  async clearRoles() {
    await this.setRoles([]);
  }

  /** Create User. The post-back can be slow: nextState() waits for the outcome. */
  async submit() {
    this.lastDialog = '';
    await this.createUserButton.click({ noWaitAfter: true });
  }

  /**
   * After Create User / Confirm / re-authentication: which screen follows.
   * @returns {Promise<'reauth'|'confirmation'|'error'|'success'|'left-form'>}
   */
  async nextState(timeout = 60_000) {
    let state = '';
    await expect.poll(async () => {
      if (await this.reauthChallenge.isVisible()) state = 'reauth';
      else if (await this.confirmButton.isVisible()) state = 'confirmation';
      else if (this.lastDialog || await this.errorMessage.isVisible()) state = 'error';
      else if (await this.successMessage.isVisible()) state = 'success';
      else if (!/\/Person\/CreateUser\//i.test(this.page.url())
        || (!(await this.signInEmail.isVisible()) && !(await this.createUserButton.isVisible()))) state = 'left-form';
      else state = '';
      return state;
    }, { message: 'Screen shown after Create User', timeout }).not.toBe('');
    return state;
  }

  /**
   * "Confirm details" modal (Email, Roles, "Notify user about changes" ticked by default): Confirm, then wait until
   * the modal closes. A click while the modal is still fading in is ignored by the app, so Confirm is clicked again
   * only when the modal is still open after a while - never in a quick burst (that could post the user twice).
   */
  async confirmDetails() {
    await expect(async () => {
      if (await this.confirmButton.isVisible()) await this.confirmButton.click({ timeout: 5_000 });
      await expect(this.confirmButton, 'Confirm details modal closes after Confirm').toBeHidden({ timeout: 15_000 });
    }).toPass({ timeout: 60_000, intervals: [1_000] });
  }

  /**
   * After the Confirm details modal closed: waits for the outcome (success message, error, or leaving the form).
   * The app may also stay on the page without a message; that returns 'confirmed' - the Person's Actions menu
   * (Manage Access) is the proof the user exists.
   */
  async outcomeAfterConfirm(timeout = 30_000) {
    let state = 'confirmed';
    await expect.poll(async () => {
      if (this.lastDialog || await this.errorMessage.isVisible()) state = 'error';
      else if (await this.successMessage.isVisible()) state = 'success';
      else if (!/\/Person\/CreateUser\//i.test(this.page.url())) state = 'left-form';
      else return false;
      return true;
    }, { timeout }).toBe(true).catch(() => { /* no message: 'confirmed' */ });
    return state;
  }

  /** Answers a re-authentication challenge: a password, or a fresh code from the admin's TOTP secret. */
  async reauthenticate({ password, totpSecret }) {
    if (await this.reauthCode.isVisible()) {
      if (!totpSecret) throw new Error('Re-authentication asks for a TOTP code: set ADMIN_TOTP_SECRET in .env');
      await this.reauthCode.fill(await freshTotp(totpSecret));
    } else {
      await this.reauthPassword.fill(password);
    }
    await this.reauthSubmit.click();
  }

  /** Number of editable inputs on the current panel that hold `value` (0 = shown read-only). */
  async editableInputsWithValue(value) {
    const panel = await this.panel();
    return panel.locator('input:not([type="hidden"]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])')
      .filter({ visible: true })
      .evaluateAll((els, v) => els.filter(e => e.value.trim().toLowerCase() === v.toLowerCase()).length, value);
  }

  /** Visible text of the Grant Access panel. */
  async panelText() {
    return (await (await this.panel()).innerText()).replace(/\s+/g, ' ').trim();
  }

  async errorText() {
    return this.lastDialog || (await this.errorMessage.innerText({ timeout: 2_000 }).catch(() => '')).trim();
  }

  /** The HTML5 validity message of the sign-in email input ('' when the browser accepts the value). */
  async nativeEmailValidity() {
    return this.signInEmail.evaluate(el => el.validationMessage || '', undefined, { timeout: 1_000 }).catch(() => '');
  }
}

module.exports = { CreateUserPage };
