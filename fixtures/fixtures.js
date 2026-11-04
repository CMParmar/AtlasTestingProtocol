// Page-object fixtures for the Person / Company / Account / Admin Reset / Project specs
// (merged in from the other Atlas project). The older login/task specs keep using pages.fixture.js.
// Pages are grouped by feature under pages/<feature>/.
const base = require('@playwright/test');
const { LoginPage } = require('../pages/login/loginPage');
const { PersonPage } = require('../pages/person/personPage');
const { PersonEditPage } = require('../pages/person/personEditPage');
const { CompanyPage } = require('../pages/company/companyPage');
const { CompanyEditPage } = require('../pages/company/companyEditPage');
const { AccountPage } = require('../pages/account/accountPage');
const { AccountEditPage } = require('../pages/account/accountEditPage');
const { AdminResetPage } = require('../pages/adminReset/adminResetPage');
const { ProjectPage } = require('../pages/project/projectPage');
const { ProjectEditPage } = require('../pages/project/projectEditPage');
const { RateCardPage } = require('../pages/ratecard/RateCardPage');
const { BundlePage } = require('../pages/bundle/BundlePage');

/** Page objects injected into every test. */
const test = base.test.extend({
  // ---- login feature ----
  loginPage: async ({ page }, use) => use(new LoginPage(page)),

  // ---- person feature ----
  personPage: async ({ page }, use) => use(new PersonPage(page)),
  personEditPage: async ({ page }, use) => use(new PersonEditPage(page)),

  // ---- company feature ----
  companyPage: async ({ page }, use) => use(new CompanyPage(page)),
  companyEditPage: async ({ page }, use) => use(new CompanyEditPage(page)),

  // ---- account feature ----
  accountPage: async ({ page }, use) => use(new AccountPage(page)),
  accountEditPage: async ({ page }, use) => use(new AccountEditPage(page)),

  // ---- admin reset feature ----
  adminResetPage: async ({ page }, use) => use(new AdminResetPage(page)),

  // ---- project feature ----
  projectPage: async ({ page }, use) => use(new ProjectPage(page)),
  projectEditPage: async ({ page }, use) => use(new ProjectEditPage(page)),

  // ---- rate card feature ----
  rateCardPage: async ({ page }, use) => use(new RateCardPage(page)),

  // ---- bundle feature ----
  bundlePage: async ({ page }, use) => use(new BundlePage(page)),
});

module.exports = { test, expect: base.expect };
