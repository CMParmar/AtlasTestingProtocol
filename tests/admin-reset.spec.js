const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { MODULE, TEXT, CHANNELS, adminResetCases: c } = require('../testData/adminResetData');
const { LoginPage } = require('../pages/login/loginPage');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordUpdated, recordUrl } = require('../utils/testCase');

/**
 * Use case 62294 - Admin Resets a User Account.
 *
 * SAFETY: the reset wipes the target user's password and TOTP. The suite only works on the DEDICATED test user
 * RESET_TARGET_PERSON_ID (.env) and refuses to run against the signed-in admin (USER_EMAIL). TC_ARU_001-014 always
 * cancel before attestation (no change); TC_ARU_015 / 016 execute the reset and run only with RESET_ALLOW_EXECUTE=true.
 * TC_ARU_019 / 020 are the agreed scenarios: Person -> Actions -> Manage Access -> Reset Access -> Cancel + Ok
 * (no change) and -> Confirm + Ok / Save (confirms the reset of the test user; runs last).
 *
 * A step that times out (screen / button not in the app) marks the test Skipped, not Failed, with the step in
 * Actual Result. Assertion failures (wrong data, defects) still fail.
 *
 * Not automated: AUTH.SecurityEventLog contents (database), alert e-mail / SMS and welcome e-mail delivery,
 * session revocation on the target's devices, TOTP wipe (needs the target's authenticator), Change Email (62316),
 * missing AUTH.User.Reset permission (second admin).
 */

const admin = { password: env.userPassword, totpSecret: env.adminTotpSecret };

const isTimeout = e => /timed? ?out/i.test(`${e?.name} ${e?.message}`);

/** test() that turns a timeout into Skipped (reason in Actual Result); other errors still fail. */
function rtest(tc, body) {
  test(tcTitle(tc), tcDetails(tc, MODULE), async ({ adminResetPage, page, browser }, testInfo) => {
    try {
      await body({ adminResetPage, page, browser }, testInfo);
    } catch (e) {
      if (!isTimeout(e)) throw e;
      const reason = String(e.message).replace(/\x1b\[[0-9;]*m/g, '').split('\n').find(Boolean).slice(0, 250);
      testInfo.annotations.push({ type: 'Observed', description: `Skipped - timed out: ${reason}` });
      test.skip(true, `Timed out: ${reason}`);
    }
  });
}

test.describe('Admin - Reset User Account (62294)', () => {
  // one worker, in order: every test works on the same test user
  test.describe.configure({ mode: 'default' });
  test.skip(!env.resetTargetPersonId && !env.resetTargetEmail,
    'Set RESET_TARGET_PERSON_ID and/or RESET_TARGET_EMAIL in .env to a dedicated sandbox test user');

  const ENTRY = { url: 'URL /Person/ManageAccess/{id}', actions: 'Person page -> Actions -> Manage Access', search: 'Search person -> Actions -> Manage Access' };

  /** Opens the target's Manage Access page and guards against resetting the admin / the wrong person. */
  async function openTarget(adminResetPage, testInfo, entry, values = {}, searchText = env.resetTargetEmail) {
    const usedEntry = env.resetTargetPersonId ? entry : 'search';
    const { id, email } = await test.step(`Open Manage Access (${ENTRY[usedEntry]})`, () =>
      adminResetPage.openTarget({ personId: env.resetTargetPersonId, email: env.resetTargetEmail, searchText, entry: usedEntry }));
    expect(email.toLowerCase(), 'SAFETY: the reset target must not be the signed-in admin').not.toBe(env.userEmail.toLowerCase());
    if (env.resetTargetEmail) expect(email.toLowerCase(), 'SAFETY: the person is the configured reset target').toBe(env.resetTargetEmail.toLowerCase());
    const url = `${env.baseURL}/Person/ManageAccess/${id}`;
    await recordUrl(testInfo, url, 'Target user - Manage Access');
    await recordTestValues(testInfo, { targetEmail: email, entry: ENTRY[usedEntry], ...values });
    return { id, email, url };
  }

  /** Opens the target, then starts Reset Account (MF-1). */
  async function begin(adminResetPage, testInfo, tc, values = {}) {
    await applyAllureLabels(tc, MODULE);
    const target = await openTarget(adminResetPage, testInfo, env.resetEntry, values);
    await test.step('Manage Access -> Reset Access (MF-1)', () => adminResetPage.startReset());
    return target;
  }

  /** MF-1 + MF-1.5 + MF-3 / MF-4 up to the evidence form or the attestation. */
  async function upToChannel(adminResetPage, channel) {
    await test.step('Confirm the email and re-authenticate (MF-1, MF-1.5)', () => adminResetPage.confirmAndReauthenticate(admin));
    await test.step(`Channel "${channel}" and its verification gates (MF-2 to MF-4)`, () => adminResetPage.verifyChannel(channel));
  }

  /**
   * Agreed scenarios, steps 1-5: search the person by name (falls back to /Person/Edit/{id} when the search times out),
   * Actions -> Manage Access, Reset Access, then the popups' buttons in order. Returns the target and the popup texts.
   */
  async function runScenario(adminResetPage, testInfo, tc) {
    await applyAllureLabels(tc, MODULE);
    const steps = ['Reset Access', ...tc.answers.map(a => a.label)].join(' -> ');
    const searchText = env.resetTargetName || env.resetTargetEmail;
    const notes = [];
    let target;
    if (searchText) {
      try {
        target = await openTarget(adminResetPage, testInfo, 'search', { search: searchText, steps }, searchText);
      } catch (e) {
        if (!isTimeout(e)) throw e;
        notes.push(`Search for "${searchText}" timed out - opened /Person/Edit/${env.resetTargetPersonId} instead`);
      }
    }
    if (!target) target = await openTarget(adminResetPage, testInfo, 'actions', { steps });
    const shown = await test.step(steps, () => adminResetPage.clickThroughPopups(adminResetPage.resetAccountAction, tc.answers));
    notes.push(...shown.map((text, i) => `Popup before "${tc.answers[i].label}": ${text}`));
    testInfo.annotations.push({ type: 'Observed', description: notes.join(' | ') });
    await expect(adminResetPage.page.locator('.alert-danger, .swal2-icon-error, .validation-summary-errors').filter({ visible: true }),
      'No error shown after the last popup').toHaveCount(0);
    return target;
  }

  rtest(c.scenarioCancel, async ({ adminResetPage }, testInfo) => {
    const { id } = await runScenario(adminResetPage, testInfo, c.scenarioCancel);
    await expect(adminResetPage.completedMessage, 'Cancel must not reset the account').toHaveCount(0);
    await test.step('Access unchanged: Manage Access still offers Reset Access', async () => {
      await adminResetPage.openManageAccess(id);
      await adminResetPage.expectResetOffered();
    });
  });

  rtest(c.confirmEmail, async ({ adminResetPage, page }, testInfo) => {
    const { email } = await begin(adminResetPage, testInfo, c.confirmEmail);
    // the reset panel (a dialog, or the page itself) - not the Person form behind a dialog
    const panel = (await page.locator('.modal.show').count()) ? page.locator('.modal.show') : page.locator('main');
    await expect(panel.getByText(email).first(), 'Target email shown').toBeVisible();
    const editable = await panel.locator('input:not([type="hidden"]):not([readonly]):not([disabled])')
      .evaluateAll((els, e) => els.filter(x => x.value === e).length, email);
    expect(editable, 'Email is read-only on this screen').toBe(0);
    await expect(adminResetPage.confirmButton).toBeVisible();
    await expect(adminResetPage.changeEmailButton).toBeVisible();
    const cont = page.getByRole('button', { name: /^Continue$/ }).filter({ visible: true });
    if (await cont.count()) await expect(cont.first(), 'Continue disabled until Confirm').toBeDisabled();
    await adminResetPage.cancel();
  });

  rtest(c.reauth, async ({ adminResetPage }, testInfo) => {
    await begin(adminResetPage, testInfo, c.reauth, { reauth: env.adminTotpSecret ? 'TOTP code (generated)' : 'Admin password' });
    await adminResetPage.confirmButton.click();
    await expect(adminResetPage.channelQuestion, 'Channel question must not appear before re-authentication').toBeHidden();
    await test.step('Re-authenticate (MF-1.5)', () => adminResetPage.reauthenticate(admin));
    await expect(adminResetPage.channelQuestion).toBeVisible({ timeout: 30_000 });
    await adminResetPage.cancel();
  });

  rtest(c.wrongReauth, async ({ adminResetPage }, testInfo) => {
    const tc = c.wrongReauth;
    await begin(adminResetPage, testInfo, tc, { reauth: `wrong password "${tc.value.password}" / code ${tc.value.code}` });
    await adminResetPage.confirmButton.click();
    await test.step('Answer re-authentication wrongly', () => adminResetPage.reauthenticate(tc.value));
    await expect(adminResetPage.reauthError.or(adminResetPage.channelQuestion).first()).toBeVisible({ timeout: 30_000 });
    await expect(adminResetPage.channelQuestion, 'DEFECT: reset continued after a failed re-authentication').toBeHidden();
    testInfo.annotations.push({ type: 'Observed', description: `Re-authentication error: "${(await adminResetPage.reauthError.innerText().catch(() => '')).trim()}"` });
    await adminResetPage.cancel();
  });

  rtest(c.channels, async ({ adminResetPage }, testInfo) => {
    await begin(adminResetPage, testInfo, c.channels, { channel: CHANNELS.join(', ') });
    await adminResetPage.confirmAndReauthenticate(admin);
    for (const ch of CHANNELS) await expect(adminResetPage.channel(ch), `Channel option "${ch}"`).toBeVisible();
    await adminResetPage.cancel();
  });

  for (const tc of c.nonLive) {
    rtest(tc, async ({ adminResetPage }, testInfo) => {
      await begin(adminResetPage, testInfo, tc, { channel: tc.channel });
      await upToChannel(adminResetPage, tc.channel);
      await expect(adminResetPage.evidenceQuestion, 'After live verification the evidence form follows (MF-5)').toBeVisible();
      await adminResetPage.cancel();
    });
  }

  for (const tc of [c.phone, c.zoom]) {
    rtest(tc, async ({ adminResetPage }, testInfo) => {
      await begin(adminResetPage, testInfo, tc, { channel: tc.channel });
      await upToChannel(adminResetPage, tc.channel);
      await test.step('Evidence template (MF-5)', async () => {
        await expect(adminResetPage.evidenceDateTime, 'Date/Time pre-filled').not.toHaveValue('');
        await expect(adminResetPage.evidenceChannel).toHaveValue(new RegExp(tc.channel === 'Phone call' ? 'Phone' : 'Zoom', 'i'));
        await expect(adminResetPage.evidenceChannelId, tc.channel === 'Phone call' ? 'Phone number field' : 'Meeting ID field').toHaveValue('');
        await expect(adminResetPage.evidenceQuestion).toHaveValue('');
        await expect(adminResetPage.resetButton, 'Reset disabled until the evidence is complete').toHaveCount(0);
      });
      await adminResetPage.cancel();
    });
  }

  rtest(c.faceToFace, async ({ adminResetPage }, testInfo) => {
    await begin(adminResetPage, testInfo, c.faceToFace, { channel: c.faceToFace.channel });
    await upToChannel(adminResetPage, c.faceToFace.channel);
    await expect(adminResetPage.attestation, 'Goes straight to attestation (MF-6)').toBeVisible();
    await expect(adminResetPage.evidenceQuestion, 'No evidence form for face-to-face').toHaveCount(0);
    await adminResetPage.cancel();
  });

  for (const tc of [c.missingChannelId, c.missingQuestion]) {
    rtest(tc, async ({ adminResetPage }, testInfo) => {
      await begin(adminResetPage, testInfo, tc, { channel: tc.channel, channelId: tc.evidence.channelId || '(empty)', question: tc.evidence.question || '(empty)' });
      await upToChannel(adminResetPage, tc.channel);
      await test.step('Submit incomplete evidence (AF-2)', () => adminResetPage.fillEvidence(tc.evidence));
      await expect(adminResetPage.attestation, 'DEFECT: attestation reachable with incomplete evidence').toHaveCount(0);
      await expect(adminResetPage.resetButton, 'Reset controls stay unavailable').toHaveCount(0);
      if (await adminResetPage.evidenceRequiredMessage.isVisible()) {
        testInfo.annotations.push({ type: 'Observed', description: `Shown: "${TEXT.evidenceRequired}"` });
      } else {
        await expect(adminResetPage.continueButton, 'Continue stays disabled while evidence is incomplete').toBeDisabled();
        testInfo.annotations.push({ type: 'Observed', description: 'Continue stayed disabled (AF-2 message not shown)' });
      }
      await adminResetPage.cancel();
    });
  }

  rtest(c.attestationGate, async ({ adminResetPage }, testInfo) => {
    await begin(adminResetPage, testInfo, c.attestationGate, { channel: c.attestationGate.channel });
    await upToChannel(adminResetPage, c.attestationGate.channel);
    await expect(adminResetPage.resetButton, 'Reset disabled until attested').toBeDisabled();
    await adminResetPage.attestation.check();
    await expect(adminResetPage.resetButton, 'Reset enabled once attested').toBeEnabled();
    await adminResetPage.attestation.uncheck();
    await expect(adminResetPage.resetButton).toBeDisabled();
    await adminResetPage.cancel();   // never executed here
  });

  rtest(c.cancel, async ({ adminResetPage }, testInfo) => {
    const tc = c.cancel;
    await begin(adminResetPage, testInfo, tc, { channel: tc.channel, action: 'Cancel on the evidence form' });
    await upToChannel(adminResetPage, tc.channel);
    await test.step('Cancel (AF-1)', () => adminResetPage.cancel());
    await expect(adminResetPage.attestation).toHaveCount(0);
  });

  for (const [tc, entry] of [[c.viaActions, 'actions'], [c.viaSearch, 'search']]) {
    rtest(tc, async ({ adminResetPage }, testInfo) => {
      if (entry === 'search') test.skip(!env.resetTargetEmail, 'Set RESET_TARGET_EMAIL in .env');
      if (entry === 'actions') test.skip(!env.resetTargetPersonId, 'Set RESET_TARGET_PERSON_ID in .env');
      await applyAllureLabels(tc, MODULE);
      await openTarget(adminResetPage, testInfo, entry, entry === 'search' ? { search: env.resetTargetEmail } : {});
      await test.step('Reset Access is offered (no reset started)', () => adminResetPage.expectResetOffered());
    });
  }

  for (const tc of [c.executeFaceToFace, c.executePhone]) {
    rtest(tc, async ({ adminResetPage, browser }, testInfo) => {
      test.skip(!env.resetAllowExecute, 'Executes a real credential reset - set RESET_ALLOW_EXECUTE=true to run');
      const { id, email, url } = await begin(adminResetPage, testInfo, tc, { channel: tc.channel, ...(tc.evidence || {}) });
      await upToChannel(adminResetPage, tc.channel);
      if (tc.evidence) await test.step('Complete the evidence (MF-5)', () => adminResetPage.fillEvidence(tc.evidence));
      await test.step('Attest and execute the reset (MF-6)', async () => {
        await adminResetPage.attestation.check();
        await adminResetPage.resetButton.click();
        await expect(adminResetPage.completedMessage, 'Completion message').toBeVisible({ timeout: 30_000 });
      });
      await recordUpdated(testInfo, 'User', tc,
        { targetName: email, credentials: 'Password + TOTP active' },
        { targetName: email, credentials: 'Invalidated - welcome e-mail sent' },
        { url, id });

      if (env.resetTargetPassword) {
        await test.step('Old password no longer signs in', async () => {
          const context = await browser.newContext({ storageState: undefined });
          const login = new LoginPage(await context.newPage());
          await login.navigateToLoginPage();
          await login.signInWith(email, env.resetTargetPassword);
          await expect(login.loginButton, 'Still on the Sign In page').toBeVisible();
          await expect(login.page).toHaveURL(/\/Identity\/Account\/Login/);
          await expect(login.userMenu, 'DEFECT: old password still works after the reset').toHaveCount(0);
          await context.close();
        });
      }
    });
  }

  // last: Confirm resets the test user's access
  rtest(c.scenarioConfirm, async ({ adminResetPage }, testInfo) => {
    const tc = c.scenarioConfirm;
    const { id, email, url } = await runScenario(adminResetPage, testInfo, tc);
    await recordUpdated(testInfo, 'User', tc,
      { targetName: email, credentials: 'Access active' },
      { targetName: email, credentials: 'Reset Access confirmed' },
      { url, id });
  });
});
