/**
 * View & Update Reminder Settings (use case 63130, module COMM, docs/63130 View & Update Reminder Settings.md).
 * Case ids are TC-nn; `description` names the use-case step (MF-1, MF-2) or business rule (BR-n) it covers.
 * The screen is Settings > Notifications > Reminder settings (/Setting/NotificationSettings); the page object is shared with
 * the Update Setting use case (63131). Not automated: Global-scope inheritance (needs a Global setting) and effective-value
 * resolution across environments (not visible in the UI).
 */
const MODULE = 'Reminder Settings';

const KEYS = {
  email: 'SET.COMM.Reminder.IsEmailDeliveryEnabled',
  sms: 'SET.COMM.Reminder.IsSmsDeliveryEnabled',
  overdue: 'SET.COMM.Reminder.IsOverdueActionItemAndWorkItemNotificationEnabled',
  oneDay: 'SET.COMM.Reminder.IsAssignedWorkItemOneDayBeforeDueDateNotificationEnabled',
};

const DATA = {
  url: /\/Setting\/NotificationSettings/,
  heading: 'Notifications',
  savedMessage: 'Your changes have been saved.',
  channelTitle: 'Reminder channel',
  channelHelp: 'How you receive reminder alerts',
  overdueText: 'Notify on overdue all tasks and work items',
  overdueHelp: 'Alert even without an explicit reminder set',
  oneDayText: 'Always notify me 1 day before due date for all work items assigned to me.',
  allKeys: Object.values(KEYS),
};

const cases = {
  openPage: { id: 'TC-01', name: 'Reminder settings tab opens for a signed-in user', description: 'MF-1, Permission Required = None: open Settings > Notifications.', condition: 'Signed-in user.', expected: 'The Notifications page opens with the "Reminder settings" tab selected.', severity: 'critical' },
  sidebarLink: { id: 'TC-02', name: 'The Notifications sidebar entry opens the Reminder settings', description: 'MF-1: click Notifications in the Settings menu.', condition: 'Signed-in user on another page.', expected: 'The Reminder settings page is displayed.' },
  fourSettings: { id: 'TC-03', name: 'One control is displayed for each of the four reminder settings', description: 'MF-1, Section 6: inspect the controls and their SettingKey names.', condition: 'Signed-in user.', expected: 'Exactly four controls, each bound to one of the four SET.COMM.Reminder keys.', severity: 'critical' },
  labels: { id: 'TC-04', name: 'Channel and preference labels are displayed', description: 'MF-1: read the headings, labels and help text.', condition: 'Signed-in user.', expected: '"Reminder channel", Email, SMS, the overdue preference with its help text and the one-day-before preference are displayed.' },
  otherTab: { id: 'TC-05', name: 'The Other Notifications tab is not available', description: 'Scope: settings on other tabs are out of scope.', condition: 'Signed-in user.', expected: 'The "Other Notifications" tab is displayed disabled and the Reminder tab stays selected.' },
  effectiveValues: { id: 'TC-06', name: 'Displayed values equal the values saved for the user', description: 'MF-1, BR-6: reload and compare the displayed state with a second load.', condition: 'Signed-in user.', expected: 'Every control shows a boolean state that is identical after a reload.', severity: 'critical' },
  toggleEmail: { id: 'TC-07', name: 'Email delivery can be switched and is saved', description: 'MF-2, BR-2: change the Email checkbox.', condition: 'User-scope setting.', expected: 'The save succeeds, "Your changes have been saved." is shown and the new value is kept.', severity: 'critical' },
  toggleSms: { id: 'TC-08', name: 'SMS delivery can be switched and is saved', description: 'MF-2, BR-2: change the SMS checkbox.', condition: 'User-scope setting.', expected: 'The save succeeds, the saved message is shown and the new value is kept.', severity: 'critical' },
  toggleOverdue: { id: 'TC-09', name: 'The overdue notification preference can be switched and is saved', description: 'MF-2: change the overdue switch.', condition: 'User-scope setting.', expected: 'The save succeeds and the new value is kept.' },
  toggleOneDay: { id: 'TC-10', name: 'The one-day-before-due-date preference can be switched and is saved', description: 'MF-2: change the one-day switch.', condition: 'User-scope setting.', expected: 'The save succeeds and the new value is kept.' },
  persist: { id: 'TC-11', name: 'Changed values are still shown after the page is reloaded', description: 'MF-2: change all four settings, reload.', condition: 'User-scope settings.', expected: 'After reload every control shows the value that was saved.', severity: 'critical' },
  independent: { id: 'TC-12', name: 'Changing one setting leaves the other three unchanged', description: 'BR-4, MF-2: change each setting in turn and compare all four.', condition: 'Four settings.', expected: 'Only the changed control differs, on screen and after reload.', severity: 'critical' },
  bothChannelsOff: { id: 'TC-13', name: 'Email and SMS can both be disabled', description: 'BR-5: turn both channels off.', condition: 'Both channel settings saved.', expected: 'Both saves succeed, both stay off after reload and no validation message blocks it.', severity: 'critical' },
  bothChannelsOn: { id: 'TC-14', name: 'Email and SMS can both be enabled', description: 'BR-5: turn both channels on.', condition: 'Both channel settings saved.', expected: 'Both saves succeed and both stay on after reload.' },
  channelsIndependent: { id: 'TC-15', name: 'Email and SMS are saved independently of each other', description: 'BR-5, BR-4: enable one channel and disable the other.', condition: 'Both channel settings saved.', expected: 'Each channel keeps its own value after reload.' },
  switchBack: { id: 'TC-16', name: 'A setting can be changed twice and keeps the last value', description: 'MF-2: on, off, on in a row.', condition: 'User-scope setting that now exists.', expected: 'Every save succeeds and the last value is shown after reload.' },
  noSaveButton: { id: 'TC-17', name: 'A change is saved immediately without a Save button', description: 'MF-2: change a value and look for a submit control.', condition: 'Signed-in user.', expected: 'The save call fires on the change and no Save button is shown.' },
  valueRetained: { id: 'TC-18', name: 'The changed value stays displayed after a successful save', description: 'MF-2: change a setting and read the control after the save.', condition: 'User-scope setting.', expected: 'The control keeps the new value and the other settings keep theirs.' },
  ownScope: { id: 'TC-19', name: 'Saved values belong to the signed-in user only', description: 'BR-1, BR-2: the save request carries no user identifier.', condition: 'Signed-in user.', expected: 'The save request contains only keyName, enabled and the anti-forgery token; the user is taken from the session.', severity: 'critical' },
  booleanOnly: { id: 'TC-20', name: 'Every control accepts only enabled or disabled', description: 'BR-3: inspect the control types.', condition: 'Signed-in user.', expected: 'All four controls are checkboxes / switches.' },
  globalInheritance: { id: 'TC-21', name: 'A setting without a User value shows the Global / default value', description: 'BR-6: view a user that has no User-scope record.', condition: 'User with no saved settings.', expected: 'The effective value (Global or default 1/0/1/1) is displayed.' },
};

module.exports = { MODULE, KEYS, DATA, cases };
