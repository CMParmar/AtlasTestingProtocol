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
const { MessageSearchPage } = require('../pages/search/messageSearchPage');
const { PersonSearchPage } = require('../pages/search/personSearchPage');
const { SearchResultsConfigPage } = require('../pages/search/searchResultsConfigPage');
const { BaseSearchPage } = require('../pages/search/baseSearchPage');
const { RateCardPage } = require('../pages/ratecard/RateCardPage');
const { BundlePage } = require('../pages/bundle/BundlePage');
const { DocumentPage } = require('../pages/document/documentPage');
const { ServicePage } = require('../pages/service/servicePage');
const { ServiceEditPage } = require('../pages/service/serviceEditPage');

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

  // ---- search feature (Message Search 62151, Person Search 62237, Configure Search Results 62281, Base Search 62383) ----
  messageSearchPage: async ({ page }, use) => use(new MessageSearchPage(page)),
  personSearchPage: async ({ page }, use) => use(new PersonSearchPage(page)),
  searchResultsConfigPage: async ({ page }, use) => use(new SearchResultsConfigPage(page)),
  baseSearchPage: async ({ page }, use) => use(new BaseSearchPage(page)),

  // ---- rate card feature ----
  rateCardPage: async ({ page }, use) => use(new RateCardPage(page)),

  // ---- bundle feature ----
  bundlePage: async ({ page }, use) => use(new BundlePage(page)),

  // ---- document feature (Add Document, 62431) ----
  documentPage: async ({ page }, use) => use(new DocumentPage(page)),

  // ---- service feature (Create Service, 62433 - "Deliverable" in the UI) ----
  servicePage: async ({ page }, use) => use(new ServicePage(page)),

  // ---- service feature (View & Edit Service - "Deliverable" in the UI) ----
  serviceEditPage: async ({ page }, use) => use(new ServiceEditPage(page)),
});

module.exports = { test, expect: base.expect };
