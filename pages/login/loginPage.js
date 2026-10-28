// Page object for the login / Sign In page (use case 62290).
// No assertions here -- methods act or return values; specs assert.

const { BasePage } = require('../basePage');
const { ROUTES, SIGN_IN, URL_PATTERNS, TIMEOUTS } = require('../../utils/constants');

class LoginPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Locators -------------------------------------------------
    this.welcomeHeading = page.getByRole('heading', { name: 'Welcome to Xeo' });
    this.brandingLogo = page.locator('.branding:visible').first(); // CSS background, not an <img>

    // SSO buttons (form#external-account)
    this.googleButton = page.locator('button[name="provider"][value="Google"]');
    this.microsoftButton = page.locator('button[name="provider"][value="Microsoft"]');
    this.appleButton = page.locator('button[name="provider"][value="Apple"]');

    // Email + password form (form#account)
    this.emailTextBox = page.locator('#Input_Email');
    this.passwordTextBox = page.locator('#password');
    this.showPasswordButton = page.locator('#togglePassword'); // aria-label flips Show/Hide password
    this.loginButton = page.locator('#login-submit');
    this.needHelpLink = page.locator('#need-help-link');

    // Client-side validation messages (jQuery unobtrusive)
    this.emailError = page.locator('span[data-valmsg-for="Input.Email"]');
    this.passwordError = page.locator('span[data-valmsg-for="Input.Password"]');

    // Server-side banner, throttle countdown and AF-x messages
    this.errorBanner = page.locator('#validationSummary'); // hidden until an error is shown
    this.throttleMessage = page.locator('#throttleDelayMessage');
    this.invalidCredentialsMessage = this.errorBanner.getByText(SIGN_IN.INVALID_CREDENTIALS_PATTERN);
    this.lockoutMessage = page.getByText(SIGN_IN.LOCKOUT_PATTERN);
    this.disabledMessage = page.getByText(SIGN_IN.DISABLED_PATTERN);
    this.supportText = page.getByText(SIGN_IN.SUPPORT_PATTERN);
    this.unhandledMessage = page.getByText(SIGN_IN.UNHANDLED_PATTERN);
    this.unhandledNote = page.getByText(SIGN_IN.UNHANDLED_NOTE_PATTERN);
    this.serverErrorLeak = page.getByText(SIGN_IN.SERVER_ERROR_LEAK_PATTERN);

    // Reset password (out of scope for Sign In, kept for the reset flow)
    this.resetPasswordHeading = page.getByRole('heading', { name: 'Reset your password' });
    this.resetEmailTextBox = page.getByPlaceholder('Enter your email');
    this.sendResetLinkButton = page.getByRole('button', { name: 'Send reset link' });
    this.validationSummaryText = page.locator('.text-danger, [role="alert"]').filter({ hasText: /\S/ });
    // userMenuIcon is inherited from BasePage.
    // -----------------------------------------------------------------
  }

  // ---- Navigation ---------------------------------------------------

  /** Opens the page and waits for the network to settle (the eye toggle is wired after its icons load). */
  async navigateToLoginPage() {
    await this.goto(ROUTES.LOGIN);
    await this.waitForPageLoad('networkidle');
  }

  async navigateToLoginPageWithReason(reason) {
    await this.goto(`${ROUTES.LOGIN}?reason=${reason}`);
    await this.waitForPageLoad('networkidle');
  }

  // ---- Actions ------------------------------------------------------

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

  /** Fills the form and submits it. */
  async signInWith(email, password) {
    await this.fillLoginForm(email, password);
    await this.clickOnLoginButton();
  }

  /** Full login flow: navigate, fill credentials, submit. */
  async loginWithCredentials(email, password) {
    await this.navigateToLoginPage();
    await this.signInWith(email, password);
  }

  /** Submits and returns the JSON answer of the login POST (errors, throttleDelay, remainingSeconds...). */
  async submitAndGetResponse() {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => URL_PATTERNS.LOGIN.test(r.url()) && r.request().method() === 'POST'),
      this.click(this.loginButton),
    ]);
    return response.json().catch(() => ({}));
  }

  async pressEnterOnPassword() {
    await this.pressKey(this.passwordTextBox, 'Enter');
  }

  async clickOnShowPassword() {
    await this.click(this.showPasswordButton);
  }

  async clickOnNeedHelp() {
    await this.click(this.needHelpLink);
  }

  async focusEmail() {
    await this.emailTextBox.focus();
  }

  // ---- Waits --------------------------------------------------------

  /** Waits for either the generic error banner or the lockout message. */
  async waitForInvalidOrLockout(timeout = TIMEOUTS.ACTION * 2) {
    await this.waitForVisible(this.invalidCredentialsMessage.or(this.lockoutMessage), { timeout });
  }

  /** The throttle countdown (spinner + message) disappears when the delay is over. */
  async waitForThrottleToEnd(timeout = 60 * 1000) {
    await this.waitForHidden(this.throttleMessage, { timeout });
  }

  /** Gives the page a moment to run any scripts triggered by the last action. */
  async settle(ms = 1000) {
    await this.page.waitForTimeout(ms);
  }

  // ---- Getters (specs assert on these) --------------------------------

  async getPasswordFieldType() {
    return this.getAttribute(this.passwordTextBox, 'type');
  }

  async isLockedOut() {
    return this.isVisible(this.lockoutMessage);
  }

  /** Top edge (px) of an element, used to compare vertical order on the page. */
  async getTopPosition(locator) {
    const box = await locator.boundingBox();
    return box ? box.y : null;
  }

  /** Computed styles that change when the email field shows a focus stroke. */
  async getEmailFocusStyle() {
    return this.emailTextBox.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.borderColor, s.outlineStyle, s.outlineColor, s.boxShadow].join('|');
    });
  }

  /** Cookies of the current browser context (session-cookie security checks). */
  async getCookies() {
    return this.page.context().cookies();
  }

  /** Starts recording alert/confirm/prompt dialogs; `shown` flips to true if one opens. */
  watchDialogs() {
    const state = { shown: false };
    this.page.on('dialog', async (dialog) => {
      state.shown = true;
      await dialog.dismiss();
    });
    return state;
  }
}

module.exports = { LoginPage };
