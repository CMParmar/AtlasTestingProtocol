// Merges the static testData/*.json fixtures with environment values from the
// root .env file, so specs have one place to pull business data from instead
// of hardcoding values.

const { authenticator } = require('otplib');
const users = require('../testData/users.json');

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
  getUsers,
  getLoginCredentials,
  getTotpSecret,
  generateTotp,
  getSignInUsers,
  getSignInSettings,
};
