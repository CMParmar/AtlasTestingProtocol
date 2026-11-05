// Framework-wide constants. Naming rule: every constant (and every key on a
// constant object) is ALL_CAPS. Pages, fixtures, utils and specs import
// from here instead of hardcoding routes, timeouts or enum values.

const ROUTES = Object.freeze({
  LOGIN: '/Identity/Account/Login',
  TASK: '/task',
  SIGNAL_CENTER: '/SignalCenter',
  SERVICE_CREATE: '/Service/Create',
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

  // ---- View & Edit Task ----
  // Tasks are seeded on this Project's "Tasks" tab (a Task with a related record is listed there and on /task).
  PROJECT_ID: process.env.TASK_PROJECT_ID || '819',
  SAVE_MESSAGE: 'Your changes have been saved.',
  NOT_DONE_STATUS_LABEL: 'Not Done',
  STATUS_LABELS: ['Not Done', 'Done'],
});

// Manage Tasks (/task "Assignments" page): scope toggle, record-type tabs, advanced filters, list sections.
const MANAGE_TASK = Object.freeze({
  SCOPE: Object.freeze({ MY: 'My', TEAM: 'Team' }),
  TAB: Object.freeze({ ALL: 'All', TASKS: 'Tasks', WORK_ITEMS: 'WorkItems', FAVORITES: 'Favorites' }),
  // Due Date filter pick list (BR-6; the design's list is authoritative)
  DUE_DATE_OPTIONS: ['All', 'Today', 'Tomorrow', 'This week', 'Next 7 days', 'Overdue', 'No Due Date'],
  DUE: Object.freeze({ TODAY: 'Today', OVERDUE: 'Overdue', NONE: 'No Due Date' }),
  TASK_STATUS_OPTIONS: ['All', 'Not Done', 'Done'],
  // Status Indicator filter (63255): the six display indicators
  INDICATOR_OPTIONS: ['Completed', 'Not ready to start', 'Ready to start', 'Ready to complete', 'Canceled', 'Temp'],
  INDICATOR: Object.freeze({
    COMPLETED: 'Completed',
    NOT_READY: 'Not ready to start',
    READY_TO_START: 'Ready to start',
    READY_TO_COMPLETE: 'Ready to complete',
    CANCELED: 'Canceled',
  }),
  GROUP: Object.freeze({ CANCELED: /^Canceled/i, COMPLETED_TASKS: /^Completed Tasks/i, NOT_DONE: /^Not Done/i, TASKS: /^Tasks/i }),
  NO_VALUE: '—',
  STAFF_ROLE: 'Developer',
  UNKNOWN_KEYWORD: 'zzzz-no-such-assignment-zzzz',
  DONE_STATUS_LABEL: 'Done',
  FILTER_SEARCH_TEXT: 'Vau',
});

// Sign In (use case 62290). Wording comes from the requirement document.
const DOCUMENT = Object.freeze({
  // Parent entity the Add Document suite works on: /Project/Edit/{id} (Projects have DocumentsEnabled in the sandbox)
  PARENT_PROJECT_ID: process.env.DOCUMENT_PROJECT_ID || process.env.TASK_PROJECT_ID || '819',
  STORAGE: Object.freeze({ FILE: 'file', CLOUD: 'cloud' }),
  STORAGE_ID: Object.freeze({ file: 2, cloud: 1 }),
  CATEGORIES: ['Specification', 'Prototype', 'Test', 'Issue Document'],
  INVALID_URL_MESSAGE: 'Please enter a valid URL.',
  UPLOAD_FAILED_MESSAGE: 'The file could not be uploaded. Please try again.',
  NO_PERMISSION_ADD_MESSAGE: 'You do not have permission to add documents to this record.',
  NO_PERMISSION_VIEWABLE_MESSAGE: 'You do not have permission to mark a document as customer viewable.',
  NAME_REQUIRED_MESSAGE: 'Document name is required',
  STORAGE_REQUIRED_MESSAGE: 'Please select a storage type (Upload file or Paste link)',
  URL_REQUIRED_MESSAGE: 'Document URL is required.',
  ADDED_MESSAGE: 'Your new record has been added.',
  GOOGLE_DOC_URL: 'https://docs.google.com/document/d/atlas-test-doc/edit',
  GOOGLE_DOC_DEFAULT_NAME: 'Google Doc',
  ONEDRIVE_URL: 'https://onedrive.live.com/view.aspx?resid=atlas-test',
  ONEDRIVE_DEFAULT_NAME: 'OneDrive Document',
  DROPBOX_URL: 'https://www.dropbox.com/s/atlas-test/file.pdf',
  DROPBOX_DEFAULT_NAME: 'Dropbox File',
  EXTERNAL_URL: 'https://example.com/shared/atlas-test',
  EXTERNAL_DEFAULT_NAME: 'External Document',
  BAD_URL: 'not a url',
});

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
// Signal Center (use case "View Signal Center"): filter tabs, sort, refresh, incremental load, list indicators.
const SIGNAL_CENTER = Object.freeze({
  FILTER: Object.freeze({ ALL: 'All', UNREAD: 'Unread', MENTIONED: 'Mentioned', STARRED: 'Starred' }),
  SORT: Object.freeze({ ASCENDING: 'Ascending', DESCENDING: 'Descending' }),
  // SET.COMM.SignalCenter.* defaults (the page also returns the live limits with every list response)
  DEFAULT_DORMANT_AFTER_DAYS: Number(process.env.SIGNAL_DORMANT_AFTER_DAYS || 30),
  DEFAULT_INITIAL_LOAD_LIMIT: 50,
  DEFAULT_SCROLL_BATCH_SIZE: 25,
  // messages (SC-[TBD] scenarios and the list error banner)
  EMPTY_MESSAGE: 'No messages yet. Start a conversation to share updates or ask a question.',
  FILTER_EMPTY_MESSAGE: 'No conversations match this filter.',
  LOAD_ERROR_MESSAGE: 'An error occurred while loading conversations',
  REFRESH_ERROR_MESSAGE: 'An error occurred while refreshing conversations',
  // endpoints behind the list (used to wait for / mock responses)
  API: Object.freeze({
    LIST: '/SignalCenter/GetConversations',
    REFRESH: '/SignalCenter/Refresh',
    STAR: '/SignalCenter/ToggleStar',
    SORT: '/SignalCenter/UpdateSortPreference',
    FILTER: '/SignalCenter/UpdateFilterPreference',
  }),
  // generous upper bound for one list load (TC "performance under max load")
  MAX_LOAD_MS: 15_000,
});

const DEFAULT_BASE_URL = 'https://atlassandbox.xeosoftware.com';

module.exports = {
  ROUTES,
  TASK,
  MANAGE_TASK,
  SIGNAL_CENTER,
  DOCUMENT,
  SIGN_IN,
  URL_PATTERNS,
  TIMEOUTS,
  DEFAULT_ENV,
  DEFAULT_BASE_URL,
};
