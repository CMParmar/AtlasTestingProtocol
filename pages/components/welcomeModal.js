// Shared component: the "Welcome!" message shown on a user's first sign-in (MF-5).
// No assertions here -- methods act or return values; specs assert.

const { BasePage } = require('../basePage');

class WelcomeModal extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Locators -------------------------------------------------
    this.welcomeText = page.getByText(/^welcome!?$/i);
    this.dismissButton = page.getByRole('button', { name: /^(ok|got it|continue|close)$/i });
    // -----------------------------------------------------------------
  }

  /** Dismisses the message if it appears (returning users don't see it). */
  async dismissIfShown() {
    if (await this.isVisibleWithin(this.welcomeText)) {
      await this.click(this.dismissButton);
    }
  }
}

module.exports = { WelcomeModal };
