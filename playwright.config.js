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
  ['Search Results Config', 'Search Pages', 'Configure Search Results (62281)', 'search-results-config', 'Atlas_SearchResultsConfig'],
  ['Base Search', 'Search Pages', 'Base Search Entity Records (62383)', 'base-search', 'Atlas_BaseSearch'],
  ['Bundle', 'Bundles', 'Create Bundle (63196)', 'bundle', 'Atlas_Bundle', 'created'],
].map(([module, entity, title, dir, filePrefix, records]) => ['./reporters/module-reporter.js', {
  module, entity, title, outputDir: `${modulesDir}/${dir}`, filePrefix, ...(records ? { records } : {}),
}]) : [];

export default defineConfig({
  testDir: './tests',
  timeout: 190_000,
  expect: { timeout: 10_000 },
  retries: 1,
  // Lockout/throttle tests change server state for one user, so run serially
  workers: 1,
  // traces / screenshots / videos of failed tests
  outputDir: 'reports/artifacts',
  reporter: [
    ['list'],
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
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://atlassandbox.xeosoftware.com',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Logs in once and saves the session for the signed-in specs (createTask)
    { name: 'setup', testMatch: /auth\.setup\.js/ },

    // Signed-in specs: reuse the saved session
    {
      name: 'chromium-auth',
      testMatch: /(createTask|viewEditTask|manageTask|signalCenter)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // Sign In specs: must start signed out, so no storageState
    { name: 'chromium', testMatch: /signIn\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: /signIn\.spec\.js/, use: { ...devices['Pixel 7'] } },

    // Functional specs merged from the other project (person, company, account, admin-reset, project).
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
