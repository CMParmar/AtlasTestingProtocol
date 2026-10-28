// Page object for the "Enter Verification Code" (TOTP) screen shown after valid credentials.
// No assertions here -- methods act or return values; specs assert.

const { BasePage } = require('../basePage');
const { SIGN_IN } = require('../../utils/constants');

class VerificationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Locators -------------------------------------------------
    this.title = page.getByText(SIGN_IN.VERIFICATION_TITLE_PATTERN);
    this.codeBoxes = page.locator('input[maxlength="1"], input[inputmode="numeric"]');
    this.verifyButton = page.getByRole('button', { name: /^verify$/i });
    this.errorMessage = page.getByRole('alert').or(page.getByText(/invalid|incorrect|expired/i));
    // -----------------------------------------------------------------
  }

  /** The 6 boxes auto-advance, so typing the code into the first one is enough. */
  async enterCode(code) {
    await this.click(this.codeBoxes.first());
    await this.page.keyboard.type(code, { delay: 50 });
  }

  async clickOnVerifyButton() {
    await this.click(this.verifyButton);
  }

  async submitCode(code) {
    await this.enterCode(code);
    await this.clickOnVerifyButton();
  }
}

module.exports = { VerificationPage };
