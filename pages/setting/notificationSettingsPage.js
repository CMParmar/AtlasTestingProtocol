const { BasePage } = require('../basePage');

/**
 * Update Setting / Save Setting (use case 63131, module SETT) -- the only UI that saves a User-scope setting is
 * Settings > Notifications > Reminder settings (/Setting/NotificationSettings). Every checkbox / switch carries the
 * SettingKey.KeyName in data-key and saves on change with POST /Setting/SaveReminderSetting (multipart: keyName, enabled,
 * __RequestVerificationToken) -> {"success":true,"message":"Your changes have been saved."} or
 * {"success":false,"message":"Invalid reminder setting."}. The green banner "Your changes have been saved." confirms a save.
 * Keys: SET.COMM.Reminder.IsEmailDeliveryEnabled (#reminderEmail), ...IsSmsDeliveryEnabled (#reminderSms),
 *       ...IsOverdueActionItemAndWorkItemNotificationEnabled (#reminderOverdue),
 *       ...IsAssignedWorkItemOneDayBeforeDueDateNotificationEnabled (#reminderOneDay).
 * No assertions -- methods act or return values; specs assert.
 */
class NotificationSettingsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- page ----
    this.heading = page.getByRole('heading', { name: 'Notifications' });
    this.reminderTab = page.getByRole('tab', { name: 'Reminder settings' });
    this.otherTab = page.getByRole('tab', { name: 'Other Notifications' });
    this.sidebarLink = page.locator('a[href="/Setting/NotificationSettings"]');
    this.antiForgeryToken = page.locator('input[name="__RequestVerificationToken"]').first();

    // ---- settings controls (data-key = SettingKey.KeyName) ----
    this.emailToggle = page.locator('#reminderEmail');
    this.smsToggle = page.locator('#reminderSms');
    this.overdueToggle = page.locator('#reminderOverdue');
    this.oneDayToggle = page.locator('#reminderOneDay');
    this.allToggles = page.locator('input.reminder-setting-input');

    // ---- labels / help text (View & Update Reminder Settings, 63130) ----
    this.channelTitle = page.locator('.reminder-settings__section-title');
    this.channelHelp = page.locator('.reminder-settings__section-help');
    this.emailLabel = page.locator('label[for="reminderEmail"]');
    this.smsLabel = page.locator('label[for="reminderSms"]');
    this.overdueTitle = page.locator('.reminder-settings__pref-title').filter({ hasText: 'overdue' });
    this.oneDayTitle = page.locator('.reminder-settings__pref-title').filter({ hasText: '1 day before due date' });
    this.overdueHelp = page.locator('.reminder-settings__pref-help');

    // ---- feedback ----
    this.savedToast = page.getByText('Your changes have been saved.').filter({ visible: true });
  }

  /** Opens the page by URL and waits for the controls. */
  async goto() {
    await this.openRecord('/Setting/NotificationSettings');
    await this.emailToggle.waitFor({ state: 'attached', timeout: 60_000 });
  }

  /** Locator of the control that holds a SettingKey, by its data-key. */
  toggleFor(keyName) {
    return this.page.locator(`input.reminder-setting-input[data-key="${keyName}"]`);
  }

  /** Current checked state of the control of a key. */
  async isOn(keyName) {
    return this.toggleFor(keyName).isChecked();
  }

  /**
   * Sets a control to `on` the way a user does (click) and waits for the save call. Does nothing when it already shows `on`.
   * Returns the parsed JSON of the save response, or null when no call was needed.
   */
  async setValue(keyName, on) {
    const toggle = this.toggleFor(keyName);
    if ((await toggle.isChecked()) === on) return null;
    return this.clickToggle(keyName);
  }

  /** Clicks a control (the input is visually hidden behind the switch, so the click is dispatched on it) and returns the save response JSON. */
  async clickToggle(keyName) {
    const saved = this.page.waitForResponse(r => r.url().includes('/Setting/SaveReminderSetting') && r.request().method() === 'POST', { timeout: 30_000 });
    await this.toggleFor(keyName).evaluate(el => el.click());
    return (await saved).json();
  }

  /** Posts the save call directly with arbitrary form values (the browser session + anti-forgery token are reused). */
  async postSave(form) {
    const token = await this.antiForgeryToken.inputValue();
    const response = await this.page.request.post('/Setting/SaveReminderSetting', {
      multipart: { __RequestVerificationToken: token, ...form },
      failOnStatusCode: false,
    });
    return { status: response.status(), body: await response.json().catch(() => null) };
  }

  /** State of every control as { keyName: boolean }. */
  async snapshot() {
    return this.allToggles.evaluateAll(els => Object.fromEntries(els.map(e => [e.dataset.key, e.checked])));
  }
}

module.exports = { NotificationSettingsPage };
