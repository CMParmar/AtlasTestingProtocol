// Page object for the login page.
// TODO: replace the placeholder selectors with the real ones.

const { BasePage } = require('../basePage');
const { ROUTES } = require('../../utils/constants');

class LoginPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Locators -------------------------------------------------
    this.welcomeHeading = page.getByRole('heading', { name: 'Welcome to Xeo' });
    this.emailTextBox = page.locator('input[type="email"][placeholder="name@example.com"]');
    this.passwordTextBox = page.locator('input[placeholder="Password"]').first();
    this.showPasswordButton = page.getByRole('button', { name: 'Show password' });
    this.loginButton = page.getByRole('button', { name: 'Continue with email' });
    this.needHelpLink = page.getByRole('link', { name: 'Need help Signing In?' });
    this.resetPasswordHeading = page.getByRole('heading', { name: 'Reset your password' });
    this.resetEmailTextBox = page.getByPlaceholder('Enter your email');
    this.sendResetLinkButton = page.getByRole('button', { name: 'Send reset link' });
    this.validationSummaryText = page.locator('.text-danger, [role="alert"]').filter({ hasText: /\S/ });
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
