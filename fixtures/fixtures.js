// Page-object fixtures for the Person / Company / Account / Admin Reset / Project specs
// (merged in from the other Atlas project). The older login/task specs keep using pages.fixture.js.
// Pages are grouped by feature under pages/<feature>/.
const base = require('@playwright/test');
const { installSafeClick } = require('../utils/safeClick');
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
const { AdvancedSearchPage } = require('../pages/search/advancedSearchPage');
const { QuickSearchPage } = require('../pages/search/quickSearchPage');
const { CompanySearchPage } = require('../pages/search/companySearchPage');
const { AccountSearchPage } = require('../pages/search/accountSearchPage');
const { RateCardPage } = require('../pages/ratecard/RateCardPage');
const { BundlePage } = require('../pages/bundle/BundlePage');
const { DocumentPage } = require('../pages/document/documentPage');
const { ServicePage } = require('../pages/service/servicePage');
const { ServiceEditPage } = require('../pages/service/serviceEditPage');
const { CancelServicePage } = require('../pages/service/cancelServicePage');
const { CompleteServicePage } = require('../pages/service/completeServicePage');
const { ConversationMessagePage } = require('../pages/conversation/conversationMessagePage');
const { ConversationFollowPage } = require('../pages/conversation/conversationFollowPage');
const { ConversationStarPage } = require('../pages/conversation/conversationStarPage');
const { NotifyUserPage } = require('../pages/notification/notifyUserPage');
const { TimeClockEditPage } = require('../pages/timeclock/timeClockEditPage');
const { ProjectDashboardPage } = require('../pages/dashboard/projectDashboardPage');
const { RecentlyViewedPage } = require('../pages/recentlyViewed/recentlyViewedPage');
const { NotificationSettingsPage } = require('../pages/setting/notificationSettingsPage');
const { WorkflowSimulationPage } = require('../pages/workflowTemplate/workflowSimulationPage');

/** Page objects injected into every test. */
const test = base.test.extend({
  // sidebar-over-target clicks on CI: see utils/safeClick.js
  page: async ({ page }, use) => {
    installSafeClick(page);
    await use(page);
  },

  // ---- network usage: bytes sent + received by the browser during the test (read by reporters/excel-reporter.js) ----
  // Runs automatically for every test; headers and bodies of every finished request of the context are counted.
  networkUsage: [async ({ context }, use, testInfo) => {
    const pending = [];
    const onDone = req => pending.push(
      req.sizes()
        .then(s => [s.requestBodySize, s.requestHeadersSize, s.responseBodySize, s.responseHeadersSize].reduce((a, n) => a + Math.max(0, n || 0), 0))
        .catch(() => 0));
    context.on('requestfinished', onDone);
    await use();
    context.off('requestfinished', onDone);
    const bytes = (await Promise.all(pending)).reduce((a, n) => a + n, 0);
    testInfo.annotations.push({ type: 'DataTransferredBytes', description: String(bytes) });
  }, { auto: true }],

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
  // Advanced Search Criteria Capture (62200)
  advancedSearchPage: async ({ page }, use) => use(new AdvancedSearchPage(page)),
  // Execute Quick Search (62466)
  quickSearchPage: async ({ page }, use) => use(new QuickSearchPage(page)),
  // Company Search criteria (62418)
  companySearchPage: async ({ page }, use) => use(new CompanySearchPage(page)),
  // Account Search specification (62828)
  accountSearchPage: async ({ page }, use) => use(new AccountSearchPage(page)),

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

  // ---- service feature (Cancel Service, 62476 - "Deliverable" in the UI) ----
  cancelServicePage: async ({ page }, use) => use(new CancelServicePage(page)),

  // ---- service feature (Complete Service, 62477 - "Deliverable" in the UI) ----
  completeServicePage: async ({ page }, use) => use(new CompleteServicePage(page)),

  // ---- conversation feature (Write Conversation Message - COMM) ----
  conversationMessagePage: async ({ page }, use) => use(new ConversationMessagePage(page)),

  // ---- conversation feature (Follow & Unfollow a Conversation - COMM) ----
  conversationFollowPage: async ({ page }, use) => use(new ConversationFollowPage(page)),

  // ---- conversation feature (Star & Unstar a Conversation - COMM) ----
  conversationStarPage: async ({ page }, use) => use(new ConversationStarPage(page)),

  // ---- notification feature (Notify User - COMM / Xselera) ----
  notifyUserPage: async ({ page }, use) => use(new NotifyUserPage(page)),

  // ---- time clock feature (View & Edit TimeClock - TASK, "Time Entry" in the UI) ----
  timeClockEditPage: async ({ page }, use) => use(new TimeClockEditPage(page)),

  // ---- dashboard feature (View Project Dashboard - SERV, Bold BI embed) ----
  projectDashboardPage: async ({ page }, use) => use(new ProjectDashboardPage(page)),

  // ---- core feature (View Recently Viewed Records - CORE, /RecentlyViewed) ----
  recentlyViewedPage: async ({ page }, use) => use(new RecentlyViewedPage(page)),

  // ---- settings feature (Update Setting / Save Setting - SETT, /Setting/NotificationSettings) ----
  notificationSettingsPage: async ({ page }, use) => use(new NotificationSettingsPage(page)),

  // ---- workflow template feature (Simulate Workflow Template Version - TASK, /WorkflowTemplate/Edit/{id}) ----
  workflowSimulationPage: async ({ page }, use) => use(new WorkflowSimulationPage(page)),
});

module.exports = { test, expect: base.expect };
