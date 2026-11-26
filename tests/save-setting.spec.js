// Update Setting / Save Setting domain use case (module SETT, docs/63131 Update Setting Domain Use Case.md).
// Uses the authenticated storageState from the setup project (functional project, no retries).
// The use case has no screen; the only UI that saves a User-scope setting is Settings > Notifications > Reminder settings
// (POST /Setting/SaveReminderSetting), so these cases drive that page and, for the negative cases, post the same call directly.
//
// All cases change the signed-in user's own reminder settings, so the file runs in order on ONE worker and every test restores
// the values it changed (finally block).
//
// Not automated (no UI / API reaches them): TC-14..TC-22 -- Global / Account / Project scope, scope permission and scope-entity
// validation, Product Default protection, KeyVault storage and failure, empty-string handling for character keys.

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, KEYS, DATA, cases: c } = require('../testData/saveSettingData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordUrl, knownDefectFor } = require('../utils/testCase');

test.describe('Update Setting', () => {
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

  test.beforeEach(async ({}, testInfo) => knownDefectFor(testInfo, c));

  // ================= MF-1: open the settings page =================
  test(tcTitle(c.openPage), tcDetails(c.openPage, MODULE), async ({ notificationSettingsPage: p, page }, testInfo) => {
    await applyAllureLabels(c.openPage, MODULE);
    await p.goto();
    await recordUrl(testInfo, page.url(), 'Notification settings');
    await expect(page).toHaveURL(DATA.url);
    await expect(p.heading).toBeVisible();
    await expect(p.reminderTab).toHaveAttribute('aria-selected', 'true');
    await expect(p.allToggles).toHaveCount(DATA.allKeys.length);
    for (const key of DATA.allKeys) await expect(p.toggleFor(key), `control of ${key}`).toBeAttached();
  });

  // ================= MF-1: insert / update =================
  test(tcTitle(c.update), tcDetails(c.update, MODULE), async ({ notificationSettingsPage: p }, testInfo) => {
    await applyAllureLabels(c.update, MODULE);
    await withRestore(p, async original => {
      const target = !original[KEYS.sms];
      await recordTestValues(testInfo, { 'Setting key': KEYS.sms, 'Before': original[KEYS.sms], 'Proposed value': target });
      const result = await p.clickToggle(KEYS.sms);
      expect(result.success, 'save succeeded').toBe(true);
      expect(result.message).toBe(DATA.savedMessage);
      await expect(p.savedToast.first()).toBeVisible();
      expect(await p.isOn(KEYS.sms)).toBe(target);
    });
  });

  test(tcTitle(c.persistUpdate), tcDetails(c.persistUpdate, MODULE), async ({ notificationSettingsPage: p }, testInfo) => {
    await applyAllureLabels(c.persistUpdate, MODULE);
    await withRestore(p, async original => {
      const target = !original[KEYS.overdue];
      await recordTestValues(testInfo, { 'Setting key': KEYS.overdue, 'Before': original[KEYS.overdue], 'Proposed value': target });
      expect((await p.clickToggle(KEYS.overdue)).success).toBe(true);
      await p.goto();
      expect(await p.isOn(KEYS.overdue), 'value after reload').toBe(target);
    });
  });

  test(tcTitle(c.revert), tcDetails(c.revert, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.revert, MODULE);
    await withRestore(p, async original => {
      expect((await p.clickToggle(KEYS.oneDay)).success, 'first save').toBe(true);
      expect((await p.clickToggle(KEYS.oneDay)).success, 'second save (update of the existing record)').toBe(true);
      await p.goto();
      expect(await p.isOn(KEYS.oneDay), 'value after reload').toBe(original[KEYS.oneDay]);
    });
  });

  // ================= BR-5 / AF-7: explicit and unchanged values =================
  test(tcTitle(c.explicitValue), tcDetails(c.explicitValue, MODULE), async ({ notificationSettingsPage: p }, testInfo) => {
    await applyAllureLabels(c.explicitValue, MODULE);
    await withRestore(p, async original => {
      const current = original[KEYS.email];
      await recordTestValues(testInfo, { 'Setting key': KEYS.email, 'Proposed value': current });
      const { body } = await p.postSave({ keyName: KEYS.email, enabled: String(current) });
      expect(body.success, 'explicit value saved').toBe(true);
      await p.goto();
      expect(await p.isOn(KEYS.email), 'value after reload').toBe(current);
    });
  });

  test(tcTitle(c.unchanged), tcDetails(c.unchanged, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.unchanged, MODULE);
    await withRestore(p, async original => {
      const current = String(original[KEYS.sms]);
      const first = await p.postSave({ keyName: KEYS.sms, enabled: current });
      const second = await p.postSave({ keyName: KEYS.sms, enabled: current });
      expect(first.body.success).toBe(true);
      expect(second.body.success, 'the same value again').toBe(true);
      expect(second.body.message).toBe(DATA.savedMessage);
      await p.goto();
      expect(await p.snapshot()).toEqual(original);
    });
  });

  // ================= BR-1: one Target Setting per key =================
  test(tcTitle(c.independent), tcDetails(c.independent, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.independent, MODULE);
    await withRestore(p, async original => {
      expect((await p.clickToggle(KEYS.sms)).success).toBe(true);
      await p.goto();
      const after = await p.snapshot();
      const changed = Object.keys(after).filter(k => after[k] !== original[k]);
      expect(changed, 'only the saved key changed').toEqual([KEYS.sms]);
    });
  });

  test(tcTitle(c.eachKey), tcDetails(c.eachKey, MODULE), async ({ notificationSettingsPage: p }, testInfo) => {
    await applyAllureLabels(c.eachKey, MODULE);
    await withRestore(p, async original => {
      await recordTestValues(testInfo, { 'Setting keys': DATA.allKeys.join(', ') });
      for (const key of DATA.allKeys) {
        const target = !original[key];
        expect((await p.clickToggle(key)).success, `save ${key}`).toBe(true);
        await p.goto();
        expect(await p.isOn(key), `${key} after reload`).toBe(target);
        expect((await p.clickToggle(key)).success, `restore ${key}`).toBe(true);
      }
      await p.goto();
      expect(await p.snapshot()).toEqual(original);
    });
  });

  // ================= AF-1, AF-4, AF-6, BR-10: rejected saves =================
  test(tcTitle(c.unknownKey), tcDetails(c.unknownKey, MODULE), async ({ notificationSettingsPage: p }, testInfo) => {
    await applyAllureLabels(c.unknownKey, MODULE);
    await withRestore(p, async original => {
      await recordTestValues(testInfo, { 'Setting key': DATA.unknownKey, 'Proposed value': 'true' });
      const { body } = await p.postSave({ keyName: DATA.unknownKey, enabled: 'true' });
      expect(body.success, 'unknown key rejected').toBe(false);
      expect(body.message).toBe(DATA.invalidKeyMessage);
      await p.goto();
      expect(await p.snapshot()).toEqual(original);
    });
  });

  test(tcTitle(c.missingKey), tcDetails(c.missingKey, MODULE), async ({ notificationSettingsPage: p }) => {
    await applyAllureLabels(c.missingKey, MODULE);
    await withRestore(p, async original => {
      const { body } = await p.postSave({ enabled: 'true' });
      expect(body.success, 'missing key rejected').toBe(false);
      await p.goto();
      expect(await p.snapshot()).toEqual(original);
    });
  });

  // For the three cases below the SMS setting is first turned On, so a rejected save leaves it On and an accepted one (coerced to Off) is visible.
  for (const [tc, form] of [
    [c.missingValue, { keyName: KEYS.sms }],
    [c.invalidValue, { keyName: KEYS.sms, enabled: 'notabool' }],
    [c.emptyValue, { keyName: KEYS.sms, enabled: '' }],
  ]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ notificationSettingsPage: p }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await withRestore(p, async () => {
        await p.setValue(KEYS.sms, true);
        await recordTestValues(testInfo, { 'Setting key': KEYS.sms, 'Proposed value': form.enabled === undefined ? '(not sent)' : form.enabled === '' ? '(zero-length)' : form.enabled });
        const { body } = await p.postSave(form);
        expect(body.success, 'invalid Proposed Value rejected').toBe(false);
        await p.goto();
        expect(await p.isOn(KEYS.sms), 'SMS setting still On').toBe(true);
      });
    });
  }

  // ================= not automated =================
  test.skip(tcTitle(c.globalScope), tcDetails(c.globalScope, MODULE), async () => { /* no UI / API saves a Global-scope setting */ });
  test.skip(tcTitle(c.accountScope), tcDetails(c.accountScope, MODULE), async () => { /* no UI / API saves an Account-scope setting */ });
  test.skip(tcTitle(c.projectScope), tcDetails(c.projectScope, MODULE), async () => { /* no UI / API saves a Project-scope setting */ });
  test.skip(tcTitle(c.scopeNotPermitted), tcDetails(c.scopeNotPermitted, MODULE), async () => { /* scope is fixed (User) by the screen */ });
  test.skip(tcTitle(c.invalidScopeEntity), tcDetails(c.invalidScopeEntity, MODULE), async () => { /* the Scope Entity is always the signed-in user */ });
  test.skip(tcTitle(c.productDefault), tcDetails(c.productDefault, MODULE), async () => { /* environment is not visible in the UI */ });
  test.skip(tcTitle(c.keyVault), tcDetails(c.keyVault, MODULE), async () => { /* the reminder keys are Local settings; Key Vault is not accessible */ });
  test.skip(tcTitle(c.keyVaultFailure), tcDetails(c.keyVaultFailure, MODULE), async () => { /* needs Key Vault fault injection */ });
  test.skip(tcTitle(c.emptyString), tcDetails(c.emptyString, MODULE), async () => { /* needs a character-type SettingKey */ });
});
