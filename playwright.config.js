// playwright.config.js
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Single environment file: root .env
dotenv.config();

const AUTH_FILE = '.auth/user.json'; // written by tests/auth.setup.js

export default defineConfig({
  testDir: './tests',
  timeout: 190_000,
  expect: { timeout: 10_000 },
  retries: 1,
  // Lockout/throttle tests change server state for one user, so run serially
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure-results' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://atlassandbox.xeosoftware.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Logs in once and saves the session for the signed-in specs (createTask)
    { name: 'setup', testMatch: /auth\.setup\.js/ },

    // Signed-in specs: reuse the saved session
    {
      name: 'chromium-auth',
      testMatch: /createTask\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // Sign In specs: must start signed out, so no storageState
    { name: 'chromium', testMatch: /signIn\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: /signIn\.spec\.js/, use: { ...devices['Pixel 7'] } },
  ],
});
