// @ts-check
// Logs in once through the login page object and saves the session for signed-in specs.
// Credentials come from the single root .env file (loaded by playwright.config.js).

const { test: setup, expect } = require('../fixtures/pages.fixture');
const { getLoginCredentials } = require('../utils/testData');
const { TASK } = require('../utils/constants');

setup('login once and save session', async ({ page, loginPage, taskPage }) => {
  const { email, password } = getLoginCredentials();
  if (!email || !password) throw new Error('Set LOGIN_EMAIL and LOGIN_PASSWORD in the root .env file');

  await taskPage.navigateToTaskPage(); // not signed in yet, so this lands on the login page
  await loginPage.signInWith(email, password);
  await expect(page).toHaveURL(TASK.TASK_URL_PATTERN);
  await expect(taskPage.addTaskButton).toBeVisible();
  await page.context().storageState({ path: '.auth/user.json' });
});
