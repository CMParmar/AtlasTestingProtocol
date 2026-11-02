// Framework-level base class that every Page Object (pages/<feature>/*) and
// shared component (pages/components/*) extends. Navigation, generic element
// actions, value getters used for validation, and waits live here once.
//
// Rules (apply to every subclass too):
//   - Locators are declared at the top of the constructor; methods only use them.
//   - No expect()/assertions -- methods perform actions or return values that
//     specs assert on.

const { expect } = require('@playwright/test');
const { waitForVisible, waitForHidden, isVisibleWithin } = require('../utils/waitHelpers');
const { TIMEOUTS } = require('../utils/constants');

class BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // ---- Common locators (shared across the whole app) ---------------
    // TODO: signed-in indicator, e.g. a user-menu icon.
    this.userMenuIcon = page.locator('#userMenu');

    // ---- Added for the Person / Company / Account / Project / Admin Reset pages ----
    this.userMenu = page.locator('#userMenu');
    this.quickSearchInput = page.locator('#quickSearchInput');
    this.quickSearchButton = page.locator('#quickSearchButton');
    this.sandboxBanner = page.getByText('This is the sandbox.');
    this.recordAddedMessage = page.getByText('Your new record has been added.');
    // slide-out drawers (phone / address): the panel carries "is-open" while shown.
    // (a closed drawer only slides off-screen, so visibility alone can't be trusted)
    this.openDrawer = page.locator('.is-open').filter({ has: page.locator('.right-drawer__close') });
    // record (edit) pages: CORE-2 "Record saved successfully." - must not match the sandbox banner ("...will not be saved long-term")
    this.savedMessage = page.getByText(/record saved successfully|(has|have) been (saved|updated)|(saved|updated) successfully/i)
      .filter({ visible: true }).first();
    this.dirtyModal = page.locator('#dirtyRecordWarningModal');
    // any sidebar link that is not marked jqBypassDirtyCheck triggers the dirty-record check
    this.leaveLink = page.locator('a.side-link[href="/RecentlyViewed"]');
    // -----------------------------------------------------------------
  }

  // ---- Added for the Person / Company / Account / Project / Admin Reset pages ----

  async open(path) {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }

  /** Opens a record page. A leftover "leave page?" browser prompt from a dirty form is accepted. */
  async openRecord(path) {
    const acceptLeave = d => (d.type() === 'beforeunload' ? d.accept() : d.dismiss());
    this.page.on('dialog', acceptLeave);
    try {
      await this.open(path);
    } finally {
      this.page.off('dialog', acceptLeave);
    }
  }

  /** Record tab (Details, People, Accounts, Documents, Tasks, Audit). */
  tab(name) {
    return this.page.locator('main').getByText(name, { exact: true }).filter({ visible: true }).first();
  }

  async openTab(name) {
    await this.tab(name).click();
  }

  /** Clicks a record page's Save button and waits for the post-back and the confirmation message. */
  async saveRecord(button, entity) {
    await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && new RegExp(entity, 'i').test(r.url()), { timeout: 30_000 }),
      button.click(),
    ]);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.savedMessage, 'Expected a "Record saved successfully." confirmation after Save').toBeVisible();
  }

  /**
   * Clicks a sidebar link while the form has unsaved changes and answers the warning.
   * Handles both the app's "Unsaved Changes" modal and a native browser prompt.
   * @param {'cancel'|'continue'} choice
   * @returns {Promise<string>} the warning text that was shown
   */
  async leaveWithUnsavedChanges(choice) {
    let dialogText = '';
    const onDialog = async d => {
      dialogText = d.message() || `(${d.type()} prompt)`;
      await (choice === 'continue' ? d.accept() : d.dismiss());
    };
    this.page.on('dialog', onDialog);
    try {
      await this.leaveLink.click();
      await expect.poll(async () => dialogText || ((await this.dirtyModal.isVisible()) ? 'modal' : ''),
        { message: 'DEFECT: no unsaved-changes warning was shown when leaving the page', timeout: 10_000 }).not.toBe('');
      if (dialogText) return dialogText;
      const text = (await this.dirtyModal.locator('.modal-body').innerText()).trim();
      await this.dirtyModal.locator(`.modal-footer [data-action="${choice}"]`).click();
      if (choice === 'cancel') await expect(this.dirtyModal).toBeHidden();
      return text;
    } finally {
      this.page.off('dialog', onDialog);
    }
  }

  async expectLoggedIn() {
    await expect(this.userMenu).toBeVisible();
    await expect(this.page).not.toHaveURL(/\/Identity\/Account\/Login/);
  }

  /** Drawers normally slide closed after "Continue"; close one manually only if it stays open. */
  async closeDrawerIfOpen() {
    try {
      await expect(this.openDrawer).toHaveCount(0, { timeout: 5_000 });
    } catch {
      await this.openDrawer.locator('.right-drawer__close').first().click();
      await expect(this.openDrawer).toHaveCount(0);
    }
  }

  /** A visible validation message with the given text (jQuery unobtrusive validation). */
  validationMessage(text) {
    return this.page.getByText(text).filter({ visible: true }).first();
  }

  /** Any visible validation message on the page (letters required, so "*" required-markers don't count). */
  anyValidationError() {
    return this.page.locator('.field-validation-error, .text-danger, .invalid-feedback')
      .filter({ visible: true, hasText: /[A-Za-z]{3}/ }).first();
  }

  /** Matches a phone number however the app formats it: "+1 2025550143", "(202) 555-0143", ... */
  phoneText(number) {
    return this.page.locator('main').getByText(new RegExp(number.replace(/\D/g, '').split('').join('\\D*'))).first();
  }

  /** Numeric record id at the end of the current URL, e.g. /Person/Edit/123 -> "123". */
  recordIdFromUrl() {
    const m = this.page.url().match(/\/(\d+)(?:[/?#].*)?$/);
    return m ? m[1] : '';
  }

  // ---- (end of added section) ----

  // ---- Navigation --------------------------------------------------

  async goto(path) {
    await this.page.goto(path);
  }

  async reload() {
    await this.page.reload();
  }

  async goBack() {
    await this.page.goBack();
  }

  async waitForUrl(urlOrPattern) {
    await this.page.waitForURL(urlOrPattern);
  }

  /** @param {'load'|'domcontentloaded'|'networkidle'} [state] */
  async waitForPageLoad(state = 'load') {
    await this.page.waitForLoadState(state);
  }

  getCurrentUrl() {
    return this.page.url();
  }

  async getTitle() {
    return this.page.title();
  }

  // ---- Generic element actions --------------------------------------

  /** @param {import('@playwright/test').Locator} locator */
  async click(locator) {
    await locator.click();
  }

  async doubleClick(locator) {
    await locator.dblclick();
  }

  async fill(locator, value) {
    await locator.fill(value);
  }

  async clear(locator) {
    await locator.clear();
  }

  /** Types one keystroke at a time so native constraints such as maxlength apply. */
  async type(locator, value) {
    await locator.fill('');
    await locator.pressSequentially(value);
  }

  async pressKey(locator, key) {
    await locator.press(key);
  }

  async selectOption(locator, value) {
    await locator.selectOption(value);
  }

  async check(locator) {
    await locator.check();
  }

  async uncheck(locator) {
    await locator.uncheck();
  }

  async hover(locator) {
    await locator.hover();
  }

  async scrollIntoView(locator) {
    await locator.scrollIntoViewIfNeeded();
  }

  async uploadFile(locator, filePath) {
    await locator.setInputFiles(filePath);
  }

  // ---- Value getters / validation support (no assertions) -----------

  async getText(locator) {
    return locator.textContent();
  }

  async getInnerText(locator) {
    return locator.innerText();
  }

  async getAllTexts(locator) {
    return locator.allTextContents();
  }

  async getCount(locator) {
    return locator.count();
  }

  async isVisible(locator) {
    return locator.isVisible();
  }

  async isHidden(locator) {
    return locator.isHidden();
  }

  async isEnabled(locator) {
    return locator.isEnabled();
  }

  async isDisabled(locator) {
    return locator.isDisabled();
  }

  async isChecked(locator) {
    return locator.isChecked();
  }

  async getAttribute(locator, name) {
    return locator.getAttribute(name);
  }

  async hasClass(locator, className) {
    const classes = (await this.getAttribute(locator, 'class')) || '';
    return classes.split(/\s+/).includes(className);
  }

  async getValue(locator) {
    return locator.inputValue();
  }

  /** Native HTML5 constraint-validation message. */
  async getValidationMessage(locator) {
    return locator.evaluate((el) => el.validationMessage);
  }

  /** All <option> values under a <select> locator. */
  async getOptionValues(locator) {
    return locator.locator('option').evaluateAll((opts) => opts.map((o) => o.value));
  }

  // ---- Waits ---------------------------------------------------------

  async waitForVisible(locator, options = {}) {
    await waitForVisible(locator, options);
  }

  async waitForHidden(locator, options = {}) {
    await waitForHidden(locator, options);
  }

  /** Resolves true/false instead of throwing -- for optional UI. */
  async isVisibleWithin(locator, timeout = TIMEOUTS.SHORT) {
    return isVisibleWithin(locator, timeout);
  }

  // ---- Common app-level actions -------------------------------------

  async isUserMenuIconDisplayed() {
    return this.isVisible(this.userMenuIcon);
  }

  async waitUntilUserMenuIconDisplayed(timeout = TIMEOUTS.LOGIN) {
    await this.waitForVisible(this.userMenuIcon, { timeout });
  }
}

module.exports = { BasePage };
