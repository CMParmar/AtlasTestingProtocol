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

  // Stop at once on a sign-in error (wrong password, lockout, disabled account): waiting or retrying would only
  // add failed attempts and lock the shared sandbox user. Show the app's own message instead of a URL timeout.
  const signInError = loginPage.errorBanner.filter({ hasText: /\S/ });
  await page.waitForURL(TASK.TASK_URL_PATTERN, { timeout: 30_000 }).catch(() => { /* reported below */ });
  if (!TASK.TASK_URL_PATTERN.test(page.url())) {
    const message = (await signInError.innerText().catch(() => '')).trim();
    throw new Error(`Sign-in failed for ${email}: ${message || 'still on the Sign In page'}\n`
      + 'Check LOGIN_EMAIL / LOGIN_PASSWORD in .env (quote values that contain #). After a lockout, wait it out or ask an admin to unlock the user.');
  }
  await expect(page).toHaveURL(TASK.TASK_URL_PATTERN);
  await expect(taskPage.addTaskButton).toBeVisible();
  await page.context().storageState({ path: '.auth/user.json' });
});
