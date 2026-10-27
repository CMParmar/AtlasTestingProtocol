// Framework-wide constants. Naming rule: every constant (and every key on a
// constant object) is ALL_CAPS. Pages, fixtures, utils and specs import
// from here instead of hardcoding routes, timeouts or enum values.

const ROUTES = Object.freeze({
  LOGIN: '/Identity/Account/Login',
});

const URL_PATTERNS = Object.freeze({
  LOGIN: /\/Identity\/Account\/Login/i,
});

const TIMEOUTS = Object.freeze({
  SHORT: 2 * 1000,
  EXPECT: 10 * 1000,
  LOGIN: 15 * 1000,
  ACTION: 15 * 1000,
  NAVIGATION: 30 * 1000,
  TEST: 45 * 1000,
});

const DEFAULT_ENV = 'qa';
const DEFAULT_BASE_URL = 'https://atlassandbox.xeosoftware.com';

module.exports = {
  ROUTES,
  URL_PATTERNS,
  TIMEOUTS,
  DEFAULT_ENV,
  DEFAULT_BASE_URL,
};
