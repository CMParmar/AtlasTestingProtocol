// Custom fixture that injects Page Objects into tests, so specs never
// construct them directly. Pages are grouped by feature under pages/<feature>/.

const base = require('@playwright/test');
const { LoginPage } = require('../pages/login/loginPage');
const { VerificationPage } = require('../pages/login/verificationPage');
const { WelcomeModal } = require('../pages/components/welcomeModal');
const { TaskPage } = require('../pages/task/taskPage');
const { getSignInUsers, generateTotp } = require('../utils/testData');

const test = base.test.extend({
  // ---- login feature ----
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  verificationPage: async ({ page }, use) => {
    await use(new VerificationPage(page));
  },

  /** Full sign-in for a TOTP-enrolled user: credentials, then the code from TEST_TOTP_SECRET. */
  signInWithTotp: async ({ loginPage, verificationPage }, use) => {
    await use(async (credentials = getSignInUsers().totp) => {
      await loginPage.signInWith(credentials.email, credentials.password);
      await verificationPage.waitForVisible(verificationPage.title);
      await verificationPage.submitCode(generateTotp());
    });
  },

  // ---- shared components ----
  welcomeModal: async ({ page }, use) => {
    await use(new WelcomeModal(page));
  },

  // ---- task feature ----
  taskPage: async ({ page }, use) => {
    await use(new TaskPage(page));
  },

  // ---- add new feature page fixtures below ----
});

module.exports = { test, expect: base.expect };
