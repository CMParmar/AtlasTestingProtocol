// @ts-check
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');
const { AUTH_FILE } = require('./fixtures/auth.fixture');
const { TIMEOUTS, DEFAULT_ENV, DEFAULT_BASE_URL } = require('./utils/constants');

// TEST_ENV selects config/.env.<TEST_ENV> (default "qa").
// Example: TEST_ENV=uat npx playwright test
const TEST_ENV = process.env.TEST_ENV || DEFAULT_ENV;
require('dotenv').config({ path: path.join(__dirname, 'config', `.env.${TEST_ENV}`) });

const BASE_URL = process.env.BASE_URL || DEFAULT_BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  timeout: TIMEOUTS.TEST,
  expect: { timeout: TIMEOUTS.EXPECT },
  fullyParallel: false, // shared, stateful environment
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true, suiteTitle: true }],
    ['playwright-qase-reporter', {
      mode: process.env.QASE_MODE || 'off', // 'testops' = send to Qase, 'off' = local only
      fallback: 'report',
      debug: false,
      logging: { console: true, file: true },
      testops: {
        api: { token: process.env.QASE_TESTOPS_API_TOKEN },
        project: process.env.QASE_TESTOPS_PROJECT, // Qase project CODE (case-sensitive)
        uploadAttachments: true,
        run: {
          title: `Atlas Testing Protocol run - ${new Date().toLocaleString()}`,
          complete: true,
        },
      },
    }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: TIMEOUTS.ACTION,
    navigationTimeout: TIMEOUTS.NAVIGATION,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },
  ],
});
