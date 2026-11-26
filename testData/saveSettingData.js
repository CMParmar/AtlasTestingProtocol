/**
 * Update Setting / Save Setting domain use case (module SETT, docs/63131 Update Setting Domain Use Case.md).
 * Case ids are TC-nn; `description` names the use-case step (MF-1, AF-n) or business rule (BR-n) it covers.
 *
 * The use case has no screen of its own. The only UI that saves a setting is Settings > Notifications > Reminder settings,
 * which saves a User-scope, Local, boolean setting per control (POST /Setting/SaveReminderSetting). The automated cases use it.
 * Rules the UI cannot reach (Global / Account / Project scope, scope-entity assignment, Product Default, KeyVault storage, empty
 * strings, Setting Key scope permissions) are listed as skipped cases so the matrix stays complete.
 */
const MODULE = 'Update Setting';

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
  invalidKeyMessage: 'Invalid reminder setting.',
  unknownKey: 'SET.NOPE.DoesNotExist',
  allKeys: Object.values(KEYS),
};

const cases = {
  openPage: { id: 'TC-01', name: 'Notification settings open with one control per setting key', description: 'MF-1: open Settings > Notifications; each control is bound to a SettingKey.KeyName.', condition: 'Signed-in user (Permission Required = None).', expected: 'The Reminder settings tab shows the Email, SMS, overdue and one-day controls, each with its SettingKey name.', severity: 'critical' },
  update: { id: 'TC-02', name: 'Changing a user-scope value saves it and shows the saved message', description: 'MF-1: flip the SMS delivery setting.', condition: 'User-scope Local setting; known starting value.', expected: 'The save call returns success, "Your changes have been saved." is shown and the control shows the new value.', severity: 'critical' },
  persistUpdate: { id: 'TC-03', name: 'The saved value is returned after the page is reloaded', description: 'MF-1: save a new value, reload the page.', condition: 'User-scope Local setting.', expected: 'After reload the control shows the saved value (the Target Setting was persisted in SettingValue).', severity: 'critical' },
  revert: { id: 'TC-04', name: 'An existing Target Setting can be updated again to its previous value', description: 'MF-1: change a value and change it back.', condition: 'Target Setting already exists after the first save.', expected: 'Both saves succeed and, after reload, the control shows the last value.' },
  explicitValue: { id: 'TC-05', name: 'A value equal to the default is still saved explicitly', description: 'BR-5: save the value the control already inherits and reload.', condition: 'Setting whose value matches the Product Default / wider scope value.', expected: 'The save succeeds and the explicit value is kept after reload.' },
  unchanged: { id: 'TC-06', name: 'Saving the same value again succeeds and keeps the value', description: 'AF-7: post the value the setting already has.', condition: 'Target Setting exists with the same value.', expected: 'The call is accepted ("Your changes have been saved.") and the value is unchanged after reload.' },
  independent: { id: 'TC-07', name: 'Saving one key does not change the other keys', description: 'BR-1: change one setting and compare every control before and after.', condition: 'Four user-scope settings for the same user.', expected: 'Only the control that was changed differs; each key keeps its own Target Setting.', severity: 'critical' },
  eachKey: { id: 'TC-08', name: 'Every reminder setting key can be saved and restored', description: 'MF-1: flip each of the four keys, reload, restore it.', condition: 'Four user-scope Local boolean settings.', expected: 'Each key saves and reloads with the new value, then is restored to its original value.' },
  unknownKey: { id: 'TC-09', name: 'An unknown setting key is rejected', description: 'AF-1: post a key name that is not a SettingKey.', condition: 'KeyName "SET.NOPE.DoesNotExist".', expected: 'The save is rejected with success = false ("Invalid reminder setting.") and no setting changes.', type: 'Negative' },
  missingKey: { id: 'TC-10', name: 'A save without a key name is rejected', description: 'AF-1: post without keyName.', condition: 'keyName missing from the request.', expected: 'The save is rejected with success = false and no setting changes.', type: 'Negative' },
  missingValue: { id: 'TC-11', name: 'A save without a value does not change the setting', description: 'AF-4, BR-6: post the key without a value (null Proposed Value).', condition: 'SMS setting is On; the request carries no "enabled" value.', expected: 'The save is rejected (success = false) and the setting is still On after reload.', type: 'Negative', defect: `Spec BR-6/BR-7/BR-10 (AF-4/AF-5/AF-6): POST /Setting/SaveReminderSetting with a request without a value returns success = true ("Your changes have been saved.") instead of rejecting the invalid Proposed Value.` },
  invalidValue: { id: 'TC-12', name: 'A value that is not a boolean does not change the setting', description: 'AF-6, BR-7: post "notabool" for a boolean setting.', condition: 'SMS setting is On; Proposed Value "notabool".', expected: 'The save is rejected (success = false) and the setting is still On after reload.', type: 'Negative', defect: `Spec BR-6/BR-7/BR-10 (AF-4/AF-5/AF-6): POST /Setting/SaveReminderSetting with the value "notabool" returns success = true ("Your changes have been saved.") instead of rejecting the invalid Proposed Value.` },
  emptyValue: { id: 'TC-13', name: 'A zero-length value for a boolean setting does not change the setting', description: 'BR-10, AF-5: post an empty string for a non-character data type.', condition: 'SMS setting is On; Proposed Value "" (AllowEmptyString has no effect for boolean).', expected: 'The save is rejected (success = false) and the setting is still On after reload.', type: 'Negative', defect: `Spec BR-6/BR-7/BR-10 (AF-4/AF-5/AF-6): POST /Setting/SaveReminderSetting with a zero-length value returns success = true ("Your changes have been saved.") instead of rejecting the invalid Proposed Value.` },

  // ---- not reachable from the UI ----
  globalScope: { id: 'TC-14', name: 'Global scope save stores no Scope Entity', description: 'BR-3: save at Global scope (AccountIDF, ProjectIDF, UserIDF null).', condition: 'Domain call only.', expected: 'Target Setting saved with all Scope Entity IDs null.' },
  accountScope: { id: 'TC-15', name: 'Account scope save stores only AccountIDF', description: 'BR-3: save at Account scope.', condition: 'Domain call only.', expected: 'Target Setting saved with AccountIDF populated, ProjectIDF and UserIDF null.' },
  projectScope: { id: 'TC-16', name: 'Project scope save stores only ProjectIDF', description: 'BR-3: save at Project scope.', condition: 'Domain call only.', expected: 'Target Setting saved with ProjectIDF populated, AccountIDF and UserIDF null.' },
  scopeNotPermitted: { id: 'TC-17', name: 'A scope the SettingKey does not permit is rejected', description: 'AF-2, BR-2: save at a scope whose Allow flag is 0.', condition: 'Domain call only.', expected: 'Scope Not Permitted outcome; nothing is saved.', type: 'Negative' },
  invalidScopeEntity: { id: 'TC-18', name: 'A mismatched Scope Entity ID is rejected', description: 'AF-3, BR-3: Account scope with a UserIDF, or an ID that matches no record.', condition: 'Domain call only.', expected: 'Invalid Scope Entity Assignment outcome; nothing is saved.', type: 'Negative' },
  productDefault: { id: 'TC-19', name: 'A Product Default (null environment) cannot be saved', description: 'BR-4: the saved Setting always references the current Environment.', condition: 'Domain call only.', expected: 'The saved record carries the current EnvironmentIDF; a null-environment record is never created or changed.' },
  keyVault: { id: 'TC-20', name: 'A KeyVault setting is stored in Key Vault under SettingID, SettingValue stays null', description: 'BR-9, BR-11: save a KeyVault setting.', condition: 'Domain call + Key Vault access.', expected: 'Secret saved with the string SettingID as record locator; Setting.SettingValue is null.' },
  keyVaultFailure: { id: 'TC-21', name: 'A Key Vault failure keeps the previous state and hides the value', description: 'AF-8, BR-11: make the Key Vault operation fail.', condition: 'Domain call + Key Vault fault injection.', expected: 'Key Vault Operation Failed outcome; previous state preserved; Proposed Value not in response or logs.', type: 'Negative' },
  emptyString: { id: 'TC-22', name: 'A zero-length string is valid only for a character key with AllowEmptyString = 1', description: 'BR-10: save "" for character keys with AllowEmptyString 1 and 0.', condition: 'Domain call only.', expected: 'Accepted when AllowEmptyString = 1; Zero Length String Value Not Permitted when 0.' },
};

module.exports = { MODULE, KEYS, DATA, cases };
