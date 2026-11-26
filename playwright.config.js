// playwright.config.js
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';

// Single environment file: root .env
dotenv.config();

// RUN_ID is created once here in the main process and inherited by every worker through process.env,
// so all tests in one run share it. It is appended to created records to avoid duplicate detection clashes.
if (!process.env.RUN_ID) {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  process.env.RUN_ID = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const AUTH_FILE = '.auth/user.json'; // written by tests/auth.setup.js

// ---- Reports: everything is written under ./reports ----
//   reports/html            Playwright HTML report
//   reports/allure-results  raw Allure data (npm run allure:generate -> reports/allure-report)
//   reports/excel           dated Excel workbooks + history-store.json (needs reporters/excel-reporter.js)
//   reports/artifacts       traces / screenshots / videos of failed tests
const modulesDir = 'reports/excel';
const hasReporter = file => fs.existsSync(`${process.cwd()}/reporters/${file}`);

// One workbook per use-case module; only enabled once reporters/module-reporter.js is in the project
const moduleReporters = hasReporter('module-reporter.js') ? [
  ['Person', 'Persons', 'Add Person', 'person', 'Atlas_Person', 'created'],
  ['Person Update', 'Persons', 'View & Update Person (62386)', 'person-update', 'Atlas_PersonUpdate'],
  ['Company', 'Companies', 'Add Company', 'company', 'Atlas_Company', 'created'],
  ['Company Update', 'Companies', 'View & Edit Company (62385)', 'company-update', 'Atlas_CompanyUpdate'],
  ['Account', 'Accounts', 'Create Account (61957)', 'account', 'Atlas_Account', 'created'],
  ['Account Update', 'Accounts', 'View and Update Account (61959)', 'account-update', 'Atlas_AccountUpdate'],
  ['Admin Reset', 'Users', 'Admin Resets a User Account (62294)', 'admin-reset', 'Atlas_AdminReset'],
  ['Project', 'Projects', 'Create Project (62422)', 'project', 'Atlas_Project', 'created'],
  ['Project Update', 'Projects', 'View & Edit Project (61967)', 'project-update', 'Atlas_ProjectUpdate'],
  ['Message Search', 'Messages', 'Conversation Message Search (62151)', 'message-search', 'Atlas_MessageSearch'],
  ['Person Search', 'Persons', 'Person Search Criteria (62237)', 'person-search', 'Atlas_PersonSearch'],
  ['Company Search', 'Companies', 'Company Search Criteria (62418)', 'company-search', 'Atlas_CompanySearch'],
  ['Account Search', 'Accounts', 'Account Search Specification (62828)', 'account-search', 'Atlas_AccountSearch'],
  ['Search Results Config', 'Search Pages', 'Configure Search Results (62281)', 'search-results-config', 'Atlas_SearchResultsConfig'],
  ['Base Search', 'Search Pages', 'Base Search Entity Records (62383)', 'base-search', 'Atlas_BaseSearch'],
  ['Bundle', 'Bundles', 'Create Bundle (63196)', 'bundle', 'Atlas_Bundle', 'created'],
  ['Service', 'Deliverables', 'Create Service (62433)', 'service', 'Atlas_Service', 'created'],
  ['Service Update', 'Deliverables', 'View & Edit Service', 'service-update', 'Atlas_ServiceUpdate'],
  ['Conversation Message', 'Conversations', 'Write Conversation Message', 'conversation-message', 'Atlas_ConversationMessage'],
  ['Conversation Follow', 'Conversations', 'Follow & Unfollow a Conversation', 'conversation-follow', 'Atlas_ConversationFollow'],
  ['Conversation Star', 'Conversations', 'Star & Unstar a Conversation', 'conversation-star', 'Atlas_ConversationStar'],
  ['Notify User', 'Conversations', 'Notify User (mention notification eligibility)', 'notify-user', 'Atlas_NotifyUser'],
].map(([module, entity, title, dir, filePrefix, records]) => ['./reporters/module-reporter.js', {
  module, entity, title, outputDir: `${modulesDir}/${dir}`, filePrefix, ...(records ? { records } : {}),
}]) : [];

export default defineConfig({
  testDir: './tests',
  timeout: 120000,  
  expect: { timeout: 10000 },
  retries: 1,
  // Every test of every file is spread over 5 workers (override with WORKERS=n, e.g. `WORKERS=8 npx playwright test`).
  // To run one file in order on a single worker, add test.describe.configure({ mode: 'default' }) to it.
  workers: Number(process.env.WORKERS) || 5,
  fullyParallel: true,
  outputDir: 'reports/artifacts',
  reporter: [
    ['list'],
    ['./reporters/bandwidth-reporter.js', { outputDir: 'reports/bandwidth' }],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['allure-playwright', {
      resultsDir: 'reports/allure-results',
      detail: true,
      suiteTitle: false,
      environmentInfo: {
        Application: 'Atlas (Xeo Software) - Sandbox',
        BaseURL: process.env.BASE_URL || 'https://atlassandbox.xeosoftware.com',
        User: process.env.USER_EMAIL || process.env.LOGIN_EMAIL || '',
        Node: process.version,
        OS: `${os.platform()} ${os.release()}`,
      },
    }],
    // Excel summary workbook (dated) + run history, as in the other project
    ...(hasReporter('excel-reporter.js')
      ? [['./reporters/excel-reporter.js', { outputDir: 'reports/excel', fileName: 'Atlas_TestReport.xlsx' }]]
      : []),
    ...moduleReporters,
    // Create User (Grant Access 62284): one dated workbook per day, every run of the day appended (reports/excel/create-user)
    ['./reporters/createuser-reporter.js', { module: 'Create User', outputDir: `${modulesDir}/create-user`, filePrefix: 'Atlas_CreateUser' }],
    // Create Service Item (62419, "Deliverable Type"): dated workbook with bandwidth usage, every run of the day appended (reports/excel/create-service-item)
    ['./reporters/serviceitem-reporter.js', { module: 'Create Service Item', outputDir: `${modulesDir}/create-service-item`, filePrefix: 'Atlas_CreateServiceItem' }],
    // View & Update Service Item (62420): same reporter, own dated workbook (+ "Updates" sheet: old -> new values) in reports/excel/view-update-service-item
    ['./reporters/serviceitem-reporter.js', { module: 'View & Update Service Item', outputDir: `${modulesDir}/view-update-service-item`, filePrefix: 'Atlas_ViewUpdateServiceItem',
      shortTitle: 'View & Update Service Item (62420)', useCase: '62420 View & Update Service Item (sandbox: Deliverable Type record page /ServiceItem/Edit/{id})' }],
    // Create Workflow Template (63069): same reporter (bandwidth summary), own dated workbook in reports/excel/create-workflow-template
    ['./reporters/serviceitem-reporter.js', { module: 'Create Workflow Template', outputDir: `${modulesDir}/create-workflow-template`, filePrefix: 'Atlas_CreateWorkflowTemplate',
      shortTitle: 'Create Workflow Template (63069)', useCase: '63069 Create Workflow Template (sandbox: Settings -> Workflow Templates -> Create Template, /Setting/WorkflowTemplateList)',
      records: { label: 'Workflow Templates', columns: [['Template Name', 'Template Name', 44], ['Creation Method', 'Creation Method', 20], ['Source Template', 'Source Template', 28],
        ['Source Version', 'Source Version', 22], ['Description', 'Description', 44], ['Version Status', 'Version Status', 12], ['Version Number', 'Version Number', 10], ['Workflow Steps', 'Workflow Steps', 10]] } }],
    // Materialize Workflow for Service (63071): same reporter, own dated workbook (records: Deliverable Type, templates, Deliverables; Updates sheet)
    ['./reporters/serviceitem-reporter.js', { module: 'Materialize Workflow', outputDir: `${modulesDir}/materialize-workflow`, filePrefix: 'Atlas_MaterializeWorkflow',
      shortTitle: 'Materialize Workflow for Service (63071)', useCase: '63071 Materialize Workflow for Service (sandbox: Add Deliverable with a workflow template; Deliverable Actions -> Change Workflow; Work Items tab)',
      records: { label: 'Records', columns: [['Name', 'Name', 50], ['Record Type', 'Record Type', 18], ['Details', 'Details', 90]] } }],
    // Publish Workflow Template Version (63090): same reporter, own dated workbook (+ "Updates" sheet = version states before / after)
    ['./reporters/serviceitem-reporter.js', { module: 'Publish Workflow Template', outputDir: `${modulesDir}/publish-workflow-template`, filePrefix: 'Atlas_PublishWorkflowTemplate',
      shortTitle: 'Publish Workflow Template Version (63090)', useCase: '63090 Publish Workflow Template Version (sandbox: /WorkflowTemplate/Edit/{id} -> Versions tab: Publish / Unpublish)',
      records: { label: 'Workflow Templates', columns: [['Template Name', 'Template Name', 44], ['Default Service Stage', 'Default Service Stage', 16], ['Setup', 'Setup', 60],
        ['Version Status', 'Version Status', 34], ['Version Number', 'Version Number', 10], ['Workflow Steps', 'Workflow Steps', 10], ['Description', 'Description', 44]] } }],
    // View & Edit Workflow Template (63063): same reporter, own dated workbook (+ "Updates" sheet) in reports/excel/view-edit-workflow-template
    ['./reporters/serviceitem-reporter.js', { module: 'View & Edit Workflow Template', outputDir: `${modulesDir}/view-edit-workflow-template`, filePrefix: 'Atlas_ViewEditWorkflowTemplate',
      shortTitle: 'View & Edit Workflow Template (63063)', useCase: '63063 View & Edit Workflow Template (sandbox: /WorkflowTemplate/Edit/{id})',
      records: { label: 'Workflow Templates', columns: [['Template Name', 'Template Name', 44], ['Creation Method', 'Creation Method', 20], ['Default Service Stage', 'Default Service Stage', 16],
        ['Description', 'Description', 44], ['Version Status', 'Version Status', 12], ['Version Number', 'Version Number', 10], ['Workflow Steps', 'Workflow Steps', 10]] } }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://atlassandbox.xeosoftware.com',
    actionTimeout: 15_000,
    navigationTimeout: 90_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Logs in once and saves the session for the signed-in specs (createTask)
    // No retries: a retried failed sign-in only adds failed attempts and locks the shared sandbox user.
    { name: 'setup', testMatch: /auth\.setup\.js/, retries: 0 },

    // Signed-in specs: reuse the saved session
    {
      name: 'chromium-auth',
      testMatch: /(createTask|viewEditTask|manageTask|signalCenter)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // Sign In specs: must start signed out, so no storageState. Mobile starts after desktop so the two runs'
    // wrong-password / throttle / lockout tests do not hit the same test users at the same time.
    { name: 'chromium', testMatch: /signIn\.spec\.js/, use: { ...devices['Desktop Chrome'] } },

    // Functional specs (person, company, account, project, service, every search spec, ... and every new spec).
    // Reuse the saved session; no retries: a retried "create" test would add a second record.
    {
      name: 'functional',
      testIgnore: [/signIn\.spec\.js/, /createTask\.spec\.js/, /viewEditTask\.spec\.js/, /manageTask\.spec\.js/, /signalCenter\.spec\.js/, /auth\.setup\.js/, /login\.spec\.js/],
      retries: 0,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: AUTH_FILE },
    },
  ],
});
