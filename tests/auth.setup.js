// Logs in once via the real UI and persists storage state
// (auth/.auth/user.json) so every spec starts authenticated. Wired in as the
// "setup" project in playwright.config.js.

const { test: setup, expect } = require('@playwright/test');
const { login, saveAuthState } = require('../fixtures/auth.fixture');
const { TIMEOUTS } = require('../utils/constants');

setup('authenticate', async ({ page }) => {
  const loginPage = await login(page);

  await expect(loginPage.userMenuIcon).toBeVisible({ timeout: TIMEOUTS.LOGIN });

  await saveAuthState(page);
});
