// Merges the static testData/*.json fixtures with environment values from the
// root .env file, so specs have one place to pull business data from instead
// of hardcoding values.

const path = require('path');
const { authenticator } = require('otplib');
const users = require('../testData/users.json');

/** Settings for the use-case specs; RUN_ID is created in playwright.config.js. */
const env = {
  baseURL: process.env.BASE_URL || 'https://atlassandbox.xeosoftware.com',
  // USER_* falls back to this project's LOGIN_* so one set of credentials is enough
  userEmail: process.env.USER_EMAIL || process.env.LOGIN_EMAIL,
  userPassword: process.env.USER_PASSWORD || process.env.LOGIN_PASSWORD,
  keyword: process.env.TEST_KEYWORD || 'Playwright',
  duplicateCheckCompany: process.env.DUPLICATE_CHECK_COMPANY || 'Xeo Software',
  runId: process.env.RUN_ID,
  // short form (MMDD-HHmmss) used inside record names to keep them readable
  runTag: process.env.RUN_ID.slice(4),
  storageState: path.resolve(__dirname, '..', '.auth', 'user.json'),
  // 62294 Admin Resets a User Account - a DEDICATED test user only (its credentials get wiped)
  resetTargetPersonId: process.env.RESET_TARGET_PERSON_ID || '',
  resetTargetEmail: process.env.RESET_TARGET_EMAIL || '',
  // display name of the same person, used by the "search by person" scenarios
  resetTargetName: process.env.RESET_TARGET_NAME || '',
  // how the tests reach /Person/ManageAccess/{id}: url (direct) | actions (Person Actions -> Manage Access) | search (by email)
  resetEntry: (process.env.RESET_ENTRY || 'url').toLowerCase(),
  resetAllowExecute: /^(1|true|yes)$/i.test(process.env.RESET_ALLOW_EXECUTE || ''),
  resetTargetPassword: process.env.RESET_TARGET_PASSWORD || '',
  // 62422 Create Project: existing Account to create projects on (empty = a Company + Account is seeded per worker)
  projectAccountId: process.env.PROJECT_ACCOUNT_ID || '',
  // true = also run TC_PRJ_028, which ticks "Do not show again" (suppresses the notice for USER_EMAIL permanently)
  projectAllowSuppressNotice: /^(1|true|yes)$/i.test(process.env.PROJECT_ALLOW_SUPPRESS_NOTICE || ''),
  // base32 TOTP secret of the admin (USER_EMAIL), only needed when re-authentication asks for a TOTP code
  adminTotpSecret: process.env.ADMIN_TOTP_SECRET || '',
  // 63150 View & Edit Rate Card: rate card under test (/RateCard/Edit/{id}); archiving is permanent, so opt-in
  rateCardId: process.env.RATE_CARD_ID || '1',
  rateCardAllowArchive: /^(1|true|yes)$/i.test(process.env.RATE_CARD_ALLOW_ARCHIVE || ''),
};

if (!env.userEmail || !env.userPassword) {
  throw new Error('USER_EMAIL / USER_PASSWORD (or LOGIN_EMAIL / LOGIN_PASSWORD) are missing in the root .env file.');
}

function getUsers() {
  return users;
}

/** Login credentials, sourced from the root .env (LOGIN_EMAIL / LOGIN_PASSWORD). */
function getLoginCredentials() {
  return {
    email: process.env.LOGIN_EMAIL,
    password: process.env.LOGIN_PASSWORD,
  };
}

/** Secret (Base32) of a QA user enrolled in an authenticator app; empty = TOTP tests skip. */
function getTotpSecret() {
  return process.env.TEST_TOTP_SECRET;
}

/** Current 6-digit code for the QA user's authenticator secret. */
function generateTotp(secret = getTotpSecret()) {
  return authenticator.generate(secret);
}

/**
 * Sign In users from the root .env. `negative` falls back to the main user (same object),
 * so specs can detect that wrong-password tests would lock the main login.
 */
function getSignInUsers() {
  const env = process.env;
  const valid = { email: env.LOGIN_EMAIL, password: env.LOGIN_PASSWORD };
  return {
    valid,
    negative: env.NEGATIVE_EMAIL ? { email: env.NEGATIVE_EMAIL, password: env.NEGATIVE_PASSWORD } : valid,
    // User enrolled in an authenticator app (sees the verification-code screen); secret in TEST_TOTP_SECRET
    totp: { email: env.TOTP_EMAIL, password: env.TOTP_PASSWORD },
    lockout: { email: env.LOCKOUT_EMAIL, password: env.LOCKOUT_PASSWORD },
    disabled: { email: env.DISABLED_EMAIL, password: env.DISABLED_PASSWORD },
  };
}

/** Sign In settings mirrored from the sandbox (see use case 62290). */
function getSignInSettings() {
  const env = process.env;
  return {
    landingPath: env.LANDING_PATH || '/',
    deepLinkPath: env.DEEP_LINK_PATH || '',
    failedAttemptsLimit: Number(env.FAILED_ATTEMPTS_LIMIT || 5),
  };
}

module.exports = {
  env,
  getUsers,
  getLoginCredentials,
  getTotpSecret,
  generateTotp,
  getSignInUsers,
  getSignInSettings,
};
