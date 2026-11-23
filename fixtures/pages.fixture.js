// Custom fixture that injects Page Objects into tests, so specs never
// construct them directly. Pages are grouped by feature under pages/<feature>/.

const base = require('@playwright/test');
const { installSafeClick } = require('../utils/safeClick');
const { LoginPage } = require('../pages/login/loginPage');
const { VerificationPage } = require('../pages/login/verificationPage');
const { WelcomeModal } = require('../pages/components/welcomeModal');
const { TaskPage } = require('../pages/task/taskPage');
const { TaskEditPage } = require('../pages/task/taskEditPage');
const { ManageTaskPage } = require('../pages/task/manageTaskPage');
const { SignalCenterPage } = require('../pages/signalCenter/signalCenterPage');
const { getSignInUsers, generateTotp } = require('../utils/testData');

const test = base.test.extend({
  // sidebar-over-target clicks on CI: see utils/safeClick.js
  page: async ({ page }, use) => {
    installSafeClick(page);
    await use(page);
  },

  // ---- bandwidth monitoring (automatic: runs for every test using this fixture) ----
  // Counts bytes received over the wire (compressed transfer size, Chromium CDP) and bytes sent (request bodies),
  // stores them as a test annotation ('bandwidth') read by reporters/bandwidth-reporter.js, and attaches a JSON
  // file to the HTML report. Does nothing on non-Chromium browsers.
  bandwidth: [async ({ page, context }, use, testInfo) => {
    let received = 0;
    let sent = 0;
    let requests = 0;
    let cdp;
    try {
      cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      cdp.on('Network.loadingFinished', e => { received += e.encodedDataLength || 0; requests++; });
      page.on('request', r => { sent += (r.postDataBuffer() || []).length; });
    } catch { /* non-Chromium: no CDP, skip */ }

    await use();

    if (!cdp) return;
    const kb = n => Math.round((n / 1024) * 10) / 10;
    const result = { receivedKB: kb(received), sentKB: kb(sent), requests };
    testInfo.annotations.push({ type: 'bandwidth', description: JSON.stringify(result) });
    await testInfo.attach('bandwidth.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' }).catch(() => {});
    await cdp.detach().catch(() => {});
  }, { auto: true }],

  // ---- login feature ----
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  verificationPage: async ({ page }, use) => {
    await use(new VerificationPage(page));
  },

  /** Full sign-in for a TOTP-enrolled user: credentials, then the code from TEST_TOTP_SECRET. */
  signInWithTotp: async ({ loginPage, verificationPage }, use) => {
    await use(async (credentials = getSignInUsers().totp) => {
      await loginPage.signInWith(credentials.email, credentials.password);
      await verificationPage.waitForVisible(verificationPage.title);
      await verificationPage.submitCode(generateTotp());
    });
  },

  // ---- shared components ----
  welcomeModal: async ({ page }, use) => {
    await use(new WelcomeModal(page));
  },

  // ---- task feature ----
  taskPage: async ({ page }, use) => {
    await use(new TaskPage(page));
  },
  taskEditPage: async ({ page }, use) => {
    await use(new TaskEditPage(page));
  },
  manageTaskPage: async ({ page }, use) => {
    await use(new ManageTaskPage(page));
  },

  // ---- signal center feature ----
  signalCenterPage: async ({ page }, use) => {
    await use(new SignalCenterPage(page));
  },

  // ---- add new feature page fixtures below ----
});

module.exports = { test, expect: base.expect };
