// Framework-level base class that every Page Object (pages/<feature>/*) and
// shared component (pages/components/*) extends. Navigation, generic element
// actions, value getters used for validation, and waits live here once.
//
// Rules (apply to every subclass too):
//   - Locators are declared at the top of the constructor; methods only use them.
//   - No expect()/assertions -- methods perform actions or return values that
//     specs assert on.

const { waitForVisible, waitForHidden, isVisibleWithin } = require('../utils/waitHelpers');
const { TIMEOUTS } = require('../utils/constants');

class BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // ---- Common locators (shared across the whole app) ---------------
    // TODO: signed-in indicator, e.g. a user-menu icon.
    this.userMenuIcon = page.locator('#userMenu');
    // -----------------------------------------------------------------
  }

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
