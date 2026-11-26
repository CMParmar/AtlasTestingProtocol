// View & Update Reminder Settings (module COMM, docs/63130 View & Update Reminder Settings.md).
// Uses the authenticated storageState from the setup project. Screen: Settings > Notifications > Reminder settings.
// Every case changes the signed-in user's own reminder settings, so the file runs in order on ONE worker and each test
// restores the values it changed (finally block).
//
// Not automated: TC-21 (needs a user without any User-scope setting / a Global value to inherit).

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, KEYS, DATA, cases: c } = require('../testData/reminderSettingsData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordUrl } = require('../utils/testCase');

test.describe('View & Update Reminder Settings', () => {
  test.describe.configure({ mode: 'default', timeout: 120_000 });

  /** Runs `body` and puts every reminder setting back to the value it had before. */
  async function withRestore(p, body) {
    await p.goto();
    const original = await p.snapshot();
    try {
      await body(original);
    } finally {
      await p.goto();
      for (const key of Object.keys(original)) await p.setValue(key, original[key]);
    }
  }

  /** Flips one setting, checks the save response and the displayed value. */
  async function flipAndCheck(p, key, original, testInfo) {
    const target = !original[key];
    await recordTestValues(testInfo, { 'Setting key': key, 'Before': original[key], 'New value': target });
    const result = await p.clickToggle(key);
    expect(result.success, 'save succeeded').toBe(true);
    expect(result.message).toBe(DATA.savedMessage);
    await expect(p.savedToast.first()).toBeVisible();
    expect(await p.isOn(key), 'value after save').toBe(target);
    await p.goto();
    expect(await p.isOn(key), 'value after reload').toBe(target);
  }

  // ================= MF-1: view =================
  test(tcTitle(c.openPage), tcDetails(c.openPage, MODULE), async ({ notificationSettingsPage: p, page }, testInfo) => {
    await applyAllureLabels(c.openPage, MODULE);
    await p.goto();
    await recordUrl(testInfo, page.url(), 'Reminder settings');
    await expect(page).toHaveURL(DATA.url);
    await expect(p.heading).toBeVisible();
    await expect(p.reminderTab).toHaveAttribute('aria-selected', 'true');
  });

  test(tcTitle(c.sidebarLink), tcDetails(c.sidebarLink, MODULE), async ({ notificationSettingsPage: p, page }) => {
    await applyAllureLabels(c.sidebarLink, MODULE);
    await p.goto();
    await expect(p.sidebarLink.first()).toBeAttached();
    await p.sidebarLink.first().evaluate(el => el.click());
    await expect(page).toHaveURL(DATA.url);
    await expect(p.reminderTab).toHaveAttribute('aria-selected', 'true');
  });

  test(tcTitle(c.fourSettings), tcDetails(c.fourSettings, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.fourSettings, MODULE);
    await p.goto();
    await expect(p.allToggles).toHaveCount(DATA.allKeys.length);
    for (const key of DATA.allKeys) await expect(p.toggleFor(key), `control of ${key}`).toBeAttached();
  });

  test(tcTitle(c.labels), tcDetails(c.labels, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.labels, MODULE);
    await p.goto();
    await expect(p.channelTitle).toHaveText(DATA.channelTitle);
    await expect(p.channelHelp).toHaveText(DATA.channelHelp);
    await expect(p.emailLabel).toHaveText('Email');
    await expect(p.smsLabel).toHaveText('SMS');
    await expect(p.overdueTitle).toHaveText(DATA.overdueText);
    await expect(p.overdueHelp).toHaveText(DATA.overdueHelp);
    await expect(p.oneDayTitle).toHaveText(DATA.oneDayText);
  });

  test(tcTitle(c.otherTab), tcDetails(c.otherTab, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.otherTab, MODULE);
    await p.goto();
    await expect(p.otherTab).toBeVisible();
    await expect(p.otherTab).toHaveClass(/disabled/);
    await expect(p.reminderTab).toHaveAttribute('aria-selected', 'true');
  });

  test(tcTitle(c.effectiveValues), tcDetails(c.effectiveValues, MODULE), async ({ notificationSettingsPage: p }, testInfo) => {
    await applyAllureLabels(c.effectiveValues, MODULE);
    await p.goto();
    const first = await p.snapshot();
    await recordTestValues(testInfo, { 'Displayed values': JSON.stringify(first) });
    expect(Object.keys(first).sort()).toEqual([...DATA.allKeys].sort());
    for (const v of Object.values(first)) expect(typeof v).toBe('boolean');
    await p.goto();
    expect(await p.snapshot(), 'values after reload').toEqual(first);
  });

  // ================= MF-2: update each setting =================
  for (const [tc, key] of [[c.toggleEmail, KEYS.email], [c.toggleSms, KEYS.sms], [c.toggleOverdue, KEYS.overdue], [c.toggleOneDay, KEYS.oneDay]]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ notificationSettingsPage: p }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await withRestore(p, original => flipAndCheck(p, key, original, testInfo));
    });
  }

  test(tcTitle(c.persist), tcDetails(c.persist, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.persist, MODULE);
    await withRestore(p, async original => {
      for (const key of DATA.allKeys) expect((await p.clickToggle(key)).success, `save ${key}`).toBe(true);
      await p.goto();
      const after = await p.snapshot();
      for (const key of DATA.allKeys) expect(after[key], `${key} after reload`).toBe(!original[key]);
    });
  });

  test(tcTitle(c.independent), tcDetails(c.independent, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.independent, MODULE);
    await withRestore(p, async original => {
      for (const key of DATA.allKeys) {
        expect((await p.clickToggle(key)).success, `save ${key}`).toBe(true);
        const onScreen = await p.snapshot();
        await p.goto();
        const reloaded = await p.snapshot();
        for (const snap of [onScreen, reloaded]) {
          const changed = Object.keys(snap).filter(k => snap[k] !== original[k]);
          expect(changed, `only ${key} changed`).toEqual([key]);
        }
        expect((await p.clickToggle(key)).success, `restore ${key}`).toBe(true);
      }
    });
  });

  // ================= BR-5: channels are optional and independent =================
  test(tcTitle(c.bothChannelsOff), tcDetails(c.bothChannelsOff, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.bothChannelsOff, MODULE);
    await withRestore(p, async () => {
      await p.setValue(KEYS.email, false);
      await p.setValue(KEYS.sms, false);
      await p.goto();
      expect(await p.isOn(KEYS.email), 'Email off').toBe(false);
      expect(await p.isOn(KEYS.sms), 'SMS off').toBe(false);
    });
  });

  test(tcTitle(c.bothChannelsOn), tcDetails(c.bothChannelsOn, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.bothChannelsOn, MODULE);
    await withRestore(p, async () => {
      await p.setValue(KEYS.email, true);
      await p.setValue(KEYS.sms, true);
      await p.goto();
      expect(await p.isOn(KEYS.email), 'Email on').toBe(true);
      expect(await p.isOn(KEYS.sms), 'SMS on').toBe(true);
    });
  });

  test(tcTitle(c.channelsIndependent), tcDetails(c.channelsIndependent, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.channelsIndependent, MODULE);
    await withRestore(p, async () => {
      await p.setValue(KEYS.email, true);
      await p.setValue(KEYS.sms, false);
      await p.goto();
      expect([await p.isOn(KEYS.email), await p.isOn(KEYS.sms)]).toEqual([true, false]);
      await p.setValue(KEYS.email, false);
      await p.setValue(KEYS.sms, true);
      await p.goto();
      expect([await p.isOn(KEYS.email), await p.isOn(KEYS.sms)]).toEqual([false, true]);
    });
  });

  // ================= MF-2: save behaviour =================
  test(tcTitle(c.switchBack), tcDetails(c.switchBack, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.switchBack, MODULE);
    await withRestore(p, async original => {
      for (let i = 0; i < 3; i++) expect((await p.clickToggle(KEYS.oneDay)).success, `save ${i + 1}`).toBe(true);
      await p.goto();
      expect(await p.isOn(KEYS.oneDay), 'last value').toBe(!original[KEYS.oneDay]);
    });
  });

  test(tcTitle(c.noSaveButton), tcDetails(c.noSaveButton, MODULE), async ({ notificationSettingsPage: p, page }) => {
    await applyAllureLabels(c.noSaveButton, MODULE);
    await withRestore(p, async () => {
      await expect(page.locator('#reminderSettings').getByRole('button', { name: /^save/i })).toHaveCount(0);
      const result = await p.clickToggle(KEYS.sms);
      expect(result.success, 'saved on change').toBe(true);
    });
  });

  test(tcTitle(c.valueRetained), tcDetails(c.valueRetained, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.valueRetained, MODULE);
    await withRestore(p, async original => {
      expect((await p.clickToggle(KEYS.overdue)).success).toBe(true);
      const after = await p.snapshot();
      expect(after[KEYS.overdue]).toBe(!original[KEYS.overdue]);
      for (const key of DATA.allKeys.filter(k => k !== KEYS.overdue)) expect(after[key], `${key} unchanged`).toBe(original[key]);
    });
  });

  // ================= BR-1 / BR-2: own settings, User scope =================
  test(tcTitle(c.ownScope), tcDetails(c.ownScope, MODULE), async ({ notificationSettingsPage: p, page }) => {
    await applyAllureLabels(c.ownScope, MODULE);
    await withRestore(p, async () => {
      const requestPromise = page.waitForRequest(r => r.url().includes('/Setting/SaveReminderSetting') && r.method() === 'POST');
      const saved = p.clickToggle(KEYS.sms);
      const body = (await requestPromise).postData() || '';
      expect((await saved).success).toBe(true);
      expect(body).toContain('name="keyName"');
      expect(body).toContain('name="enabled"');
      expect(body).not.toMatch(/name="(userId|userIdf|scope|scopeEntityId)"/i);
    });
  });

  // ================= BR-3: boolean values =================
  test(tcTitle(c.booleanOnly), tcDetails(c.booleanOnly, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.booleanOnly, MODULE);
    await p.goto();
    const types = await p.allToggles.evaluateAll(els => els.map(e => e.type));
    expect(types).toEqual(Array(DATA.allKeys.length).fill('checkbox'));
  });

  // ================= not automated =================
  test.skip(tcTitle(c.globalInheritance), tcDetails(c.globalInheritance, MODULE), async () => { /* needs a user with no User-scope settings */ });
});
