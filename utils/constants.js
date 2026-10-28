// Framework-wide constants. Naming rule: every constant (and every key on a
// constant object) is ALL_CAPS. Pages, fixtures, utils and specs import
// from here instead of hardcoding routes, timeouts or enum values.

const ROUTES = Object.freeze({
  LOGIN: '/Identity/Account/Login',
  TASK: '/task',
});

const TASK = Object.freeze({
  TASK_URL_PATTERN: /\/task/i,
  TITLE_MAX_LENGTH: 200,
  DEFAULT_OWNER_LABEL: 'Me',
  DEFAULT_STATUS_LABEL: 'Not Done',
  DONE_STATUS_LABEL: 'Done',
  REMINDER_PLACEHOLDER: 'Set a reminder',
  REMINDER_TIME: '10:00',
  OTHER_OWNER_LABEL: 'Alina Loza',
  TITLE_REQUIRED_MESSAGE: 'Title is required',
  REMINDER_FUTURE_MESSAGE: 'Select a reminder date and time in the future.',
  SUCCESS_MESSAGE: 'Your new record has been added.',
  PAST_DATE: '2020-01-01',
});

// Sign In (use case 62290). Wording comes from the requirement document.
const SIGN_IN = Object.freeze({
  EMAIL_REQUIRED_MESSAGE: 'The Email field is required.',
  PASSWORD_REQUIRED_MESSAGE: 'The Password field is required.',
  EMAIL_INVALID_MESSAGE: 'The Email field is not a valid e-mail address.',
  INVALID_CREDENTIALS_PATTERN: /Email or password is incorrect\. Please try again\./i,
  LOCKOUT_PATTERN: /Too many failed attempts\. Try again in \d+ minutes?\./i,
  DISABLED_PATTERN: /Your account is disabled\./i,
  IP_BLOCK_PATTERN: /Access temporarily blocked due to unusual activity\./i,
  UNHANDLED_PATTERN: /Something went wrong, and we signed you out\. Please sign in again\./i,
  UNHANDLED_NOTE_PATTERN: /Our tech team was alerted and will look into it\./i,
  // URL / Email / Fallback variant depends on SETT.SupportContact* settings, so accept any
  SUPPORT_PATTERN: /(support request here|contact support at|contact your administrator)/i,
  SERVER_ERROR_LEAK_PATTERN: /exception|stack trace|sql/i,
  VERIFICATION_TITLE_PATTERN: /enter verification code/i,
  RESET_PASSWORD_URL_PATTERN: /ResetPassword/i,
  UNHANDLED_EXCEPTION_REASON: 'UnhandledException',
  WRONG_PASSWORD: 'WrongPassword!1',
  INVALID_TOTP_CODE: '000000',
  SQL_INJECTION_EMAIL: "' OR 1=1 --",
  SQL_INJECTION_PASSWORD: "' OR '1'='1",
  XSS_EMAIL: '<script>alert(1)</script>',
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
  TASK,
  SIGN_IN,
  URL_PATTERNS,
  TIMEOUTS,
  DEFAULT_ENV,
  DEFAULT_BASE_URL,
};
