// Custom fixture that injects Page Objects into tests, so specs never
// construct them directly. Pages are grouped by feature under pages/<feature>/.

const base = require('@playwright/test');
const { LoginPage } = require('../pages/login/loginPage');

const test = base.test.extend({
  // ---- login feature ----
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  // ---- add new feature page fixtures below ----
});

module.exports = { test, expect: base.expect };
