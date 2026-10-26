// Authenticated-state helpers: logs in via the real UI (see tests/auth.setup.js)
// and exposes the storageState path shared by playwright.config.js.

const path = require('path');
const { LoginPage } = require('../pages/login/loginPage');
const { getLoginCredentials } = require('../utils/testData');

const AUTH_FILE = path.join(__dirname, '..', 'auth', '.auth', 'user.json');

/** Logs in through the UI and returns the LoginPage for the caller to assert on. */
async function login(page, credentials = getLoginCredentials()) {
  const loginPage = new LoginPage(page);
  await loginPage.loginWithCredentials(credentials.email, credentials.password);
  return loginPage;
}

/** Persists the current browser context's storage state to AUTH_FILE. */
async function saveAuthState(page) {
  await page.context().storageState({ path: AUTH_FILE });
}

module.exports = { AUTH_FILE, login, saveAuthState };
