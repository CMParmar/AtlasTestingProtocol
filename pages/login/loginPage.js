// Page object for the login page.
// TODO: replace the placeholder selectors with the real ones.

const { BasePage } = require('../basePage');
const { ROUTES } = require('../../utils/constants');

class LoginPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Locators -------------------------------------------------
    this.emailTextBox = page.locator('#email');
    this.passwordTextBox = page.locator('#password');
    this.loginButton = page.locator('#login-submit');
    this.validationSummaryText = page.locator('#validationSummary');
    // userMenuIcon is inherited from BasePage.
    // -----------------------------------------------------------------
  }

  async navigateToLoginPage() {
    await this.goto(ROUTES.LOGIN);
  }

  async enterEmail(email) {
    await this.fill(this.emailTextBox, email);
  }

  async enterPassword(password) {
    await this.fill(this.passwordTextBox, password);
  }

  async fillLoginForm(email, password) {
    await this.enterEmail(email);
    await this.enterPassword(password);
  }

  async clickOnLoginButton() {
    await this.click(this.loginButton);
  }

  /** Full login flow: navigate, fill credentials, submit. */
  async loginWithCredentials(email, password) {
    await this.navigateToLoginPage();
    await this.fillLoginForm(email, password);
    await this.clickOnLoginButton();
  }
}

module.exports = { LoginPage };
