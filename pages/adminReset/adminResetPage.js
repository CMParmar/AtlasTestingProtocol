const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { TEXT } = require('../../testData/adminResetData');
const { totp } = require('../../utils/totp');

/**
 * Admin Resets a User Account (use case 62294), started from the target Person's Manage Access page
 * (/Person/ManageAccess/{id}: "Manage Access: <name>" with Update Email & Roles / Reset Access / Revoke Access),
 * reached directly, via Person Actions -> "Manage Access", or via a quick search by email.
 * The screens after "Reset Access" have not been captured from the app yet, so they are located by the texts the
 * use case defines (prompts, checkbox labels, button names). Adjust here if the app's wording differs.
 */
class AdminResetPage extends BasePage {
  constructor(page) {
    super(page);
    this.actionsButton = page.locator('#actionsDropdown');
    this.manageAccessAction = page.locator('.dropdown-menu.show').getByText(/^\s*Manage Access\s*$/i);
    this.searchScopeButton = page.getByRole('button', { name: 'Scope' });
    this.manageAccessHeading = page.locator('main').getByText(/^Manage Access:/).first();
    // popups after Reset Access: Bootstrap modal, SweetAlert / bootbox, ARIA dialog; main = a full-page step
    this.popups = page.locator('main, .modal.show, .swal2-popup, .bootbox, [role="dialog"], [role="alertdialog"]').filter({ visible: true });
    // the use case calls it "Reset Account"; the app labels it "Reset Access"
    this.resetAccountAction = page.locator('main').getByRole('button', { name: /^Reset (Access|Account|User Account)$/i })
      .filter({ visible: true }).first();
    const visibleButton = name => page.getByRole('button', { name }).filter({ visible: true }).first();
    // MF-1
    this.confirmPrompt = page.getByText(TEXT.confirmPrompt).first();
    this.confirmButton = visibleButton(/^Confirm$/);
    this.changeEmailButton = visibleButton(/^Change Email$/);
    // MF-1.5 re-authentication (62302): password or TOTP code
    this.reauthPassword = page.locator('input[type="password"]').filter({ visible: true }).first();
    this.reauthCode = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[name*="Code" i]').filter({ visible: true }).first();
    this.reauthSubmit = visibleButton(/^(Verify|Authenticate|Submit|Continue|Confirm|Sign in)$/);
    this.reauthError = page.locator('.text-danger, .field-validation-error, .validation-summary-errors, .alert-danger')
      .filter({ visible: true, hasText: /[A-Za-z]{3}/ }).first();
    // MF-2 / MF-3 / MF-4
    this.channelQuestion = page.getByText(TEXT.channelQuestion).first();
    this.continueButton = visibleButton(/^(Continue|Acknowledge and Continue|Confirm)$/);
    this.cancelButton = visibleButton(/^Cancel$/);
    // MF-5 evidence template
    this.evidenceDateTime = page.getByLabel(/Verification Date\s*\/\s*Time/i).first();
    this.evidenceChannel = page.getByLabel(/^Channel$/i).first();
    this.evidenceChannelId = page.getByLabel(/phone number|Meeting ID/i).first();
    this.evidenceQuestion = page.getByLabel(/What question did you ask/i).first();
    // MF-6
    this.attestation = this.checkbox(TEXT.attestationCheckbox);
    this.resetButton = visibleButton(/^(Reset|Reset Account|Reset User Account|Execute Reset)$/);
    this.completedMessage = page.getByText(TEXT.completed).first();
    this.canceledMessage = page.getByText(TEXT.canceled).first();
    this.evidenceRequiredMessage = page.getByText(TEXT.evidenceRequired).first();
  }

  /** A checkbox by (the start of) its label text. */
  checkbox(text) {
    return this.page.getByRole('checkbox', { name: text }).or(this.page.getByLabel(text)).first();
  }

  /** A channel option (radio, button or labelled control). */
  channel(name) {
    return this.page.getByRole('radio', { name, exact: true })
      .or(this.page.getByRole('button', { name, exact: true }))
      .or(this.page.getByLabel(name, { exact: true })).first();
  }

  /** Primary email on the target's Person page (/Person/Edit/{id}). */
  async personEmail(personId) {
    await this.openRecord(`/Person/Edit/${personId}`);
    await expect(this.page).toHaveURL(new RegExp(`/Person/Edit/${personId}(?:[/?#]|$)`));
    return (await this.page.locator('#PrimaryEmail').inputValue().catch(() => '')).trim();
  }

  /**
   * Clicks `trigger`, then answers the popups that follow, in order - an in-page modal / alert, or a native browser
   * dialog (accepted or dismissed per answer). Returns the text each popup showed.
   * @param {{ label: string, name: RegExp, accept: boolean }[]} answers
   */
  async clickThroughPopups(trigger, answers, timeout = 15_000) {
    const shown = [];
    let native = null;
    let current = 0;   // which answer a native dialog arriving now belongs to
    const onDialog = async d => {
      native = d.message() || `(${d.type()} dialog)`;
      await (answers[Math.min(current, answers.length - 1)].accept ? d.accept() : d.dismiss());
    };
    this.page.on('dialog', onDialog);
    try {
      await trigger.click();
      for (let step = 0; step < answers.length; step++) {
        const { label, name } = answers[step];
        // the popup offering this button (main is the fallback when the step is a page, not a popup)
        const popup = this.popups.filter({ has: this.page.getByRole('button', { name }).filter({ visible: true }) }).last();
        const button = popup.getByRole('button', { name }).filter({ visible: true }).first();
        await expect.poll(async () => native !== null || await button.isVisible().catch(() => false),
          { message: `Popup with "${label}"`, timeout }).toBe(true);
        current = step + 1;
        if (native !== null) {
          shown.push(native);
          native = null;
          continue;
        }
        shown.push((await popup.innerText()).replace(/\s+/g, ' ').trim().slice(0, 300));
        await button.click();
      }
    } finally {
      this.page.off('dialog', onDialog);
    }
    return shown;
  }

  /** Quick search (scope Person) by name or email; opens the matching Person (personId when known) and returns its id. */
  async searchPerson(text, personId = '') {
    // the header search exists on every app page, but not on a blank tab
    if (!(await this.quickSearchInput.isVisible())) await this.openRecord('/RecentlyViewed');
    await expect(this.quickSearchInput, 'Header quick search').toBeVisible();
    // scope = Person (custom dropdown over a hidden <select>)
    if (!/Person/.test(await this.searchScopeButton.innerText())) {
      await this.searchScopeButton.click();
      await this.page.getByRole('option', { name: 'Person', exact: true }).filter({ visible: true }).first().click();
    }
    await this.quickSearchInput.fill(text);
    await this.quickSearchButton.click();
    const onPerson = () => /\/Person\/Edit\/\d+/.test(this.page.url());
    // result: the known person's link, else a person link in an entry showing the text (or the only person link)
    const results = this.page.locator('main a[href*="/Person/Edit/"]').filter({ visible: true });
    const hit = (personId
      ? this.page.locator(`main a[href$="/Person/Edit/${personId}"], main a[href*="/Person/Edit/${personId}?"]`)
      : this.page.locator('main').locator('tr, .card, .list-group-item, li, [class*="result"]')
        .filter({ hasText: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).locator('a[href*="/Person/Edit/"]'))
      .filter({ visible: true }).first();
    await expect.poll(async () => onPerson() || await hit.isVisible() || (await results.count()) === 1,
      { message: `Search result for "${text}"`, timeout: 30_000 }).toBe(true);
    if (!onPerson()) await ((await hit.isVisible()) ? hit : results.first()).click();
    await expect(this.page).toHaveURL(/\/Person\/Edit\/\d+/);
    return this.recordIdFromUrl();
  }

  /** Person page -> Actions -> Manage Access. */
  async manageAccessFromActions(personId) {
    if (!new RegExp(`/Person/Edit/${personId}(?:[/?#]|$)`).test(this.page.url())) await this.openRecord(`/Person/Edit/${personId}`);
    await this.actionsButton.click();
    await this.manageAccessAction.click();
    await expect(this.page).toHaveURL(new RegExp(`/Person/ManageAccess/${personId}(?:[/?#]|$)`), { timeout: 30_000 });
    await expect(this.manageAccessHeading, 'Manage Access page').toBeVisible();
  }

  /** Manage Access page opened by its URL. */
  async openManageAccess(personId) {
    await this.openRecord(`/Person/ManageAccess/${personId}`);
    await expect(this.page).toHaveURL(new RegExp(`/Person/ManageAccess/${personId}(?:[/?#]|$)`));
    await expect(this.manageAccessHeading, 'Manage Access page').toBeVisible();
  }

  /**
   * Opens the target's Manage Access page the chosen way and returns the target's email.
   * @param {'url'|'actions'|'search'} entry
   */
  async openTarget({ personId, email, searchText, entry = 'url' }) {
    let id = personId;
    if (entry === 'search') {
      const text = searchText || email;
      id = await this.searchPerson(text, personId);
      if (personId) expect(id, `Search for "${text}" opened person ${personId}`).toBe(String(personId));
    }
    const shown = await this.personEmail(id);
    if (entry === 'url') await this.openManageAccess(id);
    else await this.manageAccessFromActions(id);
    return { id, email: shown || email };
  }

  /** MF-1: Manage Access -> Reset Access -> email confirmation screen. */
  async startReset() {
    await this.resetAccountAction.click();
    await expect(this.confirmPrompt, 'MF-1 confirmation prompt').toBeVisible({ timeout: 30_000 });
  }

  /** Manage Access offers Reset Access (next to Update Email & Roles and Revoke Access); nothing is clicked. */
  async expectResetOffered() {
    await expect(this.resetAccountAction, 'Reset Access offered on Manage Access').toBeVisible();
    await expect(this.resetAccountAction).toBeEnabled();
  }

  /** MF-1.5: answers re-authentication with a password or a TOTP code (generated from ADMIN_TOTP_SECRET). */
  async reauthenticate({ password, code, totpSecret }) {
    await expect(this.reauthPassword.or(this.reauthCode).first(), 'Re-authentication challenge (62302)').toBeVisible({ timeout: 30_000 });
    if (await this.reauthPassword.isVisible()) {
      await this.reauthPassword.fill(password);
    } else {
      const value = code || (totpSecret ? totp(totpSecret) : '');
      if (!value) throw new Error('Re-authentication asks for a TOTP code: set ADMIN_TOTP_SECRET in .env');
      await this.reauthCode.fill(value);
    }
    await this.reauthSubmit.click();
  }

  /** MF-1 + MF-1.5 with the admin's valid credentials; ends on the channel question (MF-2). */
  async confirmAndReauthenticate(admin) {
    await this.confirmButton.click();
    await this.reauthenticate(admin);
    await expect(this.channelQuestion, 'MF-2 channel question').toBeVisible({ timeout: 30_000 });
  }

  /** Ticks a gate checkbox, asserting Continue is disabled before and enabled after. */
  async passGate(checkboxText) {
    const box = this.checkbox(checkboxText);
    await expect(box, `Checkbox "${checkboxText}"`).toBeVisible();
    await expect(this.continueButton, 'Continue disabled until the box is ticked').toBeDisabled();
    await box.check();
    await expect(this.continueButton).toBeEnabled();
    await this.continueButton.click();
  }

  /** MF-3 + MF-4 for a channel; ends on the evidence form (phone / zoom / non-live) or the attestation (face-to-face). */
  async verifyChannel(channel) {
    await this.channel(channel).click();
    if (['Email', 'Text / SMS', 'Other'].includes(channel)) {
      await expect(this.page.getByText(TEXT.socialEngineeringWarning).first(), 'MF-3 A warning').toBeVisible();
      await this.passGate(TEXT.warningCheckbox);
      await expect(this.page.getByText(TEXT.liveVerificationPrompt).first(), 'MF-4 prompt').toBeVisible();
      await this.passGate(TEXT.liveVerificationCheckbox);
    } else if (channel === 'Face-to-face') {
      await expect(this.page.getByText(TEXT.faceToFacePrompt).first(), 'MF-3 C prompt').toBeVisible();
      await this.passGate(TEXT.faceToFaceCheckbox);
    } else {
      await expect(this.page.getByText(TEXT.liveGuidance).first(), 'MF-3 B guidance').toBeVisible();
      await this.passGate(TEXT.liveCheckbox);
    }
  }

  /** MF-5: fills the evidence template ('' leaves a field empty) and clicks Continue. */
  async fillEvidence({ channelId, question }) {
    await expect(this.evidenceQuestion, 'MF-5 evidence template').toBeVisible();
    await this.evidenceChannelId.fill(channelId);
    await this.evidenceQuestion.fill(question);
    if (await this.continueButton.isEnabled()) await this.continueButton.click();
  }

  /** AF-1: Cancel, then "Account reset canceled..." */
  async cancel() {
    await this.cancelButton.click();
    await expect(this.canceledMessage, 'AF-1 cancel message').toBeVisible();
  }
}

module.exports = { AdminResetPage };
