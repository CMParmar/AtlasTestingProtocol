// Merges the static testData/*.json fixtures with per-environment overrides
// (config/.env.qa, config/.env.uat, ...), so specs have one place to pull
// business data from instead of hardcoding values.

const users = require('../testData/users.json');

function getUsers() {
  return users;
}

/** Login credentials, sourced from config/.env.<TEST_ENV>. */
function getLoginCredentials() {
  return {
    email: process.env.LOGIN_EMAIL,
    password: process.env.LOGIN_PASSWORD,
  };
}

module.exports = { getUsers, getLoginCredentials };
