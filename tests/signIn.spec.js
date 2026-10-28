// Sign In (use case 62290) -- login page, TOTP verification, throttle/lockout/disabled flows.
// Runs signed out (no storageState). Page objects: pages/login/*, pages/components/welcomeModal.js.

const { test, expect } = require('../fixtures/pages.fixture');
const { SIGN_IN, URL_PATTERNS } = require('../utils/constants');
const { getSignInUsers, getSignInSettings, getTotpSecret } = require('../utils/testData');

const users = getSignInUsers();
const settings = getSignInSettings();
// The main login (LOGIN_EMAIL) has no authenticator: correct credentials sign in directly.
// The verification-code (TOTP) tests need a separate user enrolled in an authenticator app.
const hasTotpUser = Boolean(users.totp.email && getTotpSecret());
const TOTP_SKIP_REASON = 'Set TOTP_EMAIL, TOTP_PASSWORD and TEST_TOTP_SECRET (user enrolled in an authenticator)';

// Wrong-password tests count as failed attempts; 5 of them lock the account for 15 min.
// Without a separate NEGATIVE_EMAIL user they would lock the main login, so those tests are skipped.
const sharedNegativeUser = users.negative === users.valid;
const SKIP_REASON = 'Set NEGATIVE_EMAIL/NEGATIVE_PASSWORD (throwaway user) so the main login is not locked';

test.describe('Sign In', () => {
  test.beforeEach(async ({ loginPage }) => {
    // Do NOT sign in here; sign-in is the feature under test.
    await loginPage.navigateToLoginPage();
  });

  // ======================= FUNCTIONAL =======================
  test.describe('Functional', () => {
    test('TC_SIGN_001 Sign In page loads with SSO on top and local sign-in below', async ({ loginPage }) => {
      await expect(loginPage.welcomeHeading).toBeVisible();
      await expect(loginPage.googleButton).toBeVisible();
      await expect(loginPage.emailTextBox).toBeVisible();
      await expect(loginPage.passwordTextBox).toBeVisible();
      await expect(loginPage.loginButton).toBeVisible();
      const ssoTop = await loginPage.getTopPosition(loginPage.googleButton);
      const emailTop = await loginPage.getTopPosition(loginPage.emailTextBox);
      expect(ssoTop).toBeLessThan(emailTop);
    });

    test('TC_SIGN_003 Valid credentials of a TOTP-enrolled user show the verification code screen', async ({ loginPage, verificationPage }) => {
      test.skip(!hasTotpUser, TOTP_SKIP_REASON);
      await loginPage.signInWith(users.totp.email, users.totp.password);
      await expect(verificationPage.title).toBeVisible();
      await expect(verificationPage.verifyButton).toBeVisible();
    });

    test('TC_SIGN_002 / TC_SIGN_005 Valid email + password signs in and lands on default page', async ({ loginPage, welcomeModal }) => {
      await loginPage.signInWith(users.valid.email, users.valid.password);
      await welcomeModal.dismissIfShown(); // MF-5 only for first-time users
      await expect.poll(() => loginPage.getCurrentUrl()).toContain(settings.landingPath);
    });

    test('TC_SIGN_002a Valid email + password + TOTP signs in (TOTP-enrolled user)', async ({ loginPage, signInWithTotp, welcomeModal, verificationPage }) => {
      test.skip(!hasTotpUser, TOTP_SKIP_REASON);
      await signInWithTotp();
      await welcomeModal.dismissIfShown();
      await expect.poll(() => loginPage.getCurrentUrl()).toContain(settings.landingPath);
      await expect(verificationPage.title).toBeHidden();
    });

    test('TC_SIGN_004 Redirect to protected deep link after sign-in', async ({ loginPage }) => {
      test.skip(!settings.deepLinkPath, 'Set DEEP_LINK_PATH to a protected page, e.g. /task');
      await loginPage.goto(settings.deepLinkPath); // unauthenticated, bounces to Sign In
      await loginPage.signInWith(users.valid.email, users.valid.password);
      await expect.poll(() => loginPage.getCurrentUrl()).toContain(settings.deepLinkPath);
    });

    test('TC_SIGN_010 Enter key submits the sign-in form', async ({ loginPage }) => {
      await loginPage.fillLoginForm(users.valid.email, users.valid.password);
      await loginPage.pressEnterOnPassword();
      await expect.poll(() => loginPage.getCurrentUrl()).not.toMatch(URL_PATTERNS.LOGIN);
    });
  });

  // ======================= VALIDATION =======================
  test.describe('Validation', () => {
    // Client-side jQuery validation messages (from data-val-* attributes in the page)
    test('TC_SIGN_013 Both fields empty', async ({ loginPage, verificationPage }) => {
      await loginPage.clickOnLoginButton();
      await expect(loginPage.emailError).toHaveText(SIGN_IN.EMAIL_REQUIRED_MESSAGE);
      await expect(loginPage.passwordError).toHaveText(SIGN_IN.PASSWORD_REQUIRED_MESSAGE);
      await expect(verificationPage.title).toBeHidden();
    });

    test('TC_SIGN_014 Empty email', async ({ loginPage, verificationPage }) => {
      await loginPage.enterPassword(users.valid.password);
      await loginPage.clickOnLoginButton();
      await expect(loginPage.emailError).toHaveText(SIGN_IN.EMAIL_REQUIRED_MESSAGE);
      await expect(verificationPage.title).toBeHidden();
    });

    test('TC_SIGN_015 Empty password', async ({ loginPage, verificationPage }) => {
      await loginPage.enterEmail(users.valid.email);
      await loginPage.clickOnLoginButton();
      await expect(loginPage.passwordError).toHaveText(SIGN_IN.PASSWORD_REQUIRED_MESSAGE);
      await expect(verificationPage.title).toBeHidden();
    });

    test('TC_SIGN_016 Invalid email format (no @)', async ({ loginPage, verificationPage }) => {
      await loginPage.fillLoginForm('abc.com', users.valid.password);
      await loginPage.clickOnLoginButton();
      await expect(loginPage.emailError).toHaveText(SIGN_IN.EMAIL_INVALID_MESSAGE);
      await expect(verificationPage.title).toBeHidden();
    });

    test('TC_SIGN_018 Email with leading/trailing spaces', async ({ loginPage }) => {
      await loginPage.signInWith(`  ${users.valid.email}  `, users.valid.password);
      // Either the spaces are trimmed (signed in) or a clear error shows; must not crash
      await expect
        .poll(async () => (await loginPage.isVisible(loginPage.errorBanner)) || !URL_PATTERNS.LOGIN.test(loginPage.getCurrentUrl()))
        .toBe(true);
    });

    test('TC_SIGN_019 Password with trailing space is not trimmed', async ({ loginPage }) => {
      test.skip(sharedNegativeUser, SKIP_REASON);
      await loginPage.signInWith(users.negative.email, `${users.negative.password} `);
      await expect(loginPage.invalidCredentialsMessage).toBeVisible();
    });

    test('TC_SIGN_020 Email is case-insensitive', async ({ loginPage }) => {
      await loginPage.signInWith(users.valid.email.toUpperCase(), users.valid.password);
      await expect.poll(() => loginPage.getCurrentUrl()).not.toMatch(URL_PATTERNS.LOGIN); // signed in
    });

    test('TC_SIGN_021 Password is case-sensitive', async ({ loginPage }) => {
      test.skip(sharedNegativeUser, SKIP_REASON);
      await loginPage.signInWith(users.negative.email, users.negative.password.toLowerCase());
      await expect(loginPage.invalidCredentialsMessage).toBeVisible();
    });

    test('TC_SIGN_022 Password is masked by default', async ({ loginPage }) => {
      expect(await loginPage.getPasswordFieldType()).toBe('password');
    });

    test('TC_SIGN_023 Show/hide password toggle', async ({ loginPage }) => {
      await loginPage.enterPassword('Secret123!');
      await loginPage.clickOnShowPassword();
      await expect(loginPage.passwordTextBox).toHaveAttribute('type', 'text');
      await loginPage.clickOnShowPassword();
      await expect(loginPage.passwordTextBox).toHaveAttribute('type', 'password');
    });
  });

  // ======================= NEGATIVE =======================
  test.describe('Negative', () => {
    test('TC_SIGN_031 Wrong password shows generic message (AF-1)', async ({ loginPage }) => {
      await loginPage.signInWith(users.negative.email, SIGN_IN.WRONG_PASSWORD);
      await expect(loginPage.invalidCredentialsMessage).toBeVisible();
      await expect(loginPage.emailTextBox).toBeVisible(); // stays on Sign In for a retry
      await expect(loginPage.passwordTextBox).toBeVisible();
    });

    // NOTE: on the sandbox an unknown email currently ends on Login?reason=UnhandledException instead of the
    // generic message (AF-1). That is an application issue, not a locator issue, so this test is expected to fail.
    test('TC_SIGN_032 Unregistered email shows the same message (no enumeration)', async ({ loginPage }) => {
      test.fail(true, 'Known defect: an unknown email ends on the unhandled-error page instead of the generic AF-1 message');
      await loginPage.signInWith(`nouser_${Date.now()}@example.com`, SIGN_IN.WRONG_PASSWORD);
      await expect(loginPage.invalidCredentialsMessage).toBeVisible();
    });

    // The page posts via fetch(); on a failed attempt the server answers with JSON
    // { errors, throttleDelay, remainingSeconds, message } and the page shows a countdown in #throttleDelayMessage.
    test('TC_SIGN_034 Throttle: first failure returns a ~1s delay (AF-1)', async ({ loginPage }) => {
      test.skip(sharedNegativeUser, SKIP_REASON);
      await loginPage.fillLoginForm(users.negative.email, SIGN_IN.WRONG_PASSWORD);
      const result = await loginPage.submitAndGetResponse();
      await expect(loginPage.invalidCredentialsMessage).toBeVisible();
      expect(result.throttleDelay).toBeTruthy();
      expect(result.remainingSeconds).toBeGreaterThanOrEqual(1); // AUTH.SignInThrottleInitialDelaySeconds
    });

    test('TC_SIGN_035 Throttle: delay grows on consecutive failures', async ({ loginPage }) => {
      test.skip(sharedNegativeUser, SKIP_REASON);
      test.setTimeout(120 * 1000);
      const delays = [];
      await loginPage.fillLoginForm(users.negative.email, SIGN_IN.WRONG_PASSWORD);
      for (let i = 0; i < 3; i++) {
        const result = await loginPage.submitAndGetResponse();
        delays.push(result.remainingSeconds ?? 0);
        await loginPage.waitForThrottleToEnd(); // wait for the countdown before retrying
        await loginPage.enterPassword(`${SIGN_IN.WRONG_PASSWORD}${i}`);
      }
      // Expected ~1s, 2s, 4s (x2.0 multiplier)
      expect(delays[2]).toBeGreaterThan(delays[0]);
    });

    test('TC_SIGN_039 / TC_SIGN_041 Account locks after limit; valid password refused while locked (AF-2)', async ({ loginPage, verificationPage }) => {
      test.skip(!users.lockout.email, 'Needs dedicated LOCKOUT_EMAIL user (will be locked!)');
      test.setTimeout(180 * 1000);
      await loginPage.fillLoginForm(users.lockout.email, SIGN_IN.WRONG_PASSWORD);
      for (let i = 0; i < settings.failedAttemptsLimit; i++) {
        await loginPage.clickOnLoginButton();
        await loginPage.waitForInvalidOrLockout();
        if (await loginPage.isLockedOut()) break;
        await loginPage.waitForThrottleToEnd(); // attempts during a throttle delay are not counted
        await loginPage.enterPassword(`${SIGN_IN.WRONG_PASSWORD}${i}`);
      }
      await expect(loginPage.lockoutMessage).toBeVisible();
      await expect(loginPage.supportText).toBeVisible();

      // TC_SIGN_041: correct password must still be refused during lockout
      await loginPage.navigateToLoginPage();
      await loginPage.signInWith(users.lockout.email, users.lockout.password);
      await expect(loginPage.lockoutMessage).toBeVisible();
      await expect(verificationPage.title).toBeHidden();
    });

    test('TC_SIGN_049 Wrong TOTP code is rejected', async ({ loginPage, verificationPage }) => {
      test.skip(!hasTotpUser, TOTP_SKIP_REASON);
      await loginPage.signInWith(users.totp.email, users.totp.password);
      await expect(verificationPage.title).toBeVisible();
      await verificationPage.submitCode(SIGN_IN.INVALID_TOTP_CODE);
      await expect(verificationPage.errorMessage).toBeVisible();
      await expect(verificationPage.title).toBeVisible(); // still not signed in
    });

    test('TC_SIGN_058 Disabled account is denied (AF-4)', async ({ loginPage }) => {
      test.skip(!users.disabled.email, 'Needs DISABLED_EMAIL user');
      await loginPage.signInWith(users.disabled.email, users.disabled.password);
      await expect(loginPage.disabledMessage).toBeVisible();
      await expect(loginPage.supportText).toBeVisible();
    });

    test('TC_SIGN_060 Unhandled error message (AF-5)', async ({ loginPage }) => {
      await loginPage.navigateToLoginPageWithReason(SIGN_IN.UNHANDLED_EXCEPTION_REASON);
      await expect(loginPage.unhandledMessage).toBeVisible();
      await expect(loginPage.unhandledNote).toBeVisible();
    });

    test('TC_SIGN_061 SQL injection in email is rejected', async ({ loginPage, verificationPage }) => {
      await loginPage.fillLoginForm(SIGN_IN.SQL_INJECTION_EMAIL, 'x');
      await loginPage.clickOnLoginButton();
      await expect(verificationPage.title).toBeHidden();
      await expect(loginPage.serverErrorLeak).toBeHidden();
    });

    test('TC_SIGN_062 SQL injection in password is rejected', async ({ loginPage }) => {
      test.skip(sharedNegativeUser, SKIP_REASON);
      await loginPage.signInWith(users.negative.email, SIGN_IN.SQL_INJECTION_PASSWORD);
      await expect(loginPage.invalidCredentialsMessage).toBeVisible();
    });

    test('TC_SIGN_063 XSS string in email does not execute', async ({ loginPage }) => {
      const dialog = loginPage.watchDialogs();
      await loginPage.fillLoginForm(SIGN_IN.XSS_EMAIL, 'x');
      await loginPage.clickOnLoginButton();
      await loginPage.settle();
      expect(dialog.shown).toBe(false);
    });
  });

  // ======================= UI =======================
  test.describe('UI', () => {
    test('TC_SIGN_066 Page elements match Figma', async ({ loginPage }) => {
      await expect(loginPage.welcomeHeading).toBeVisible();
      await expect(loginPage.brandingLogo).toBeVisible(); // Xeo logo is a CSS background (.branding), not an <img>
      await expect(loginPage.googleButton).toBeVisible();
      await expect(loginPage.microsoftButton).toBeVisible();
      await expect(loginPage.appleButton).toBeVisible();
      await expect(loginPage.emailTextBox).toBeVisible();
      await expect(loginPage.passwordTextBox).toBeVisible();
      await expect(loginPage.loginButton).toBeVisible();
      await expect(loginPage.needHelpLink).toHaveText(/need help signing in/i);
    });

    test('TC_SIGN_067 Focused field shows a stroke (outline/border change)', async ({ loginPage }) => {
      const before = await loginPage.getEmailFocusStyle();
      await loginPage.focusEmail();
      expect(await loginPage.getEmailFocusStyle()).not.toBe(before);
    });

    test('TC_SIGN_068 Error banner is shown above the fields (AF-1)', async ({ loginPage }) => {
      test.skip(sharedNegativeUser, SKIP_REASON);
      await loginPage.signInWith(users.negative.email, SIGN_IN.WRONG_PASSWORD);
      await expect(loginPage.invalidCredentialsMessage).toBeVisible();
      const bannerTop = await loginPage.getTopPosition(loginPage.errorBanner);
      const emailTop = await loginPage.getTopPosition(loginPage.emailTextBox);
      expect(bannerTop).toBeLessThan(emailTop);
    });

    test('TC_SIGN_098 "Need help Signing In?" link navigates to ResetPassword', async ({ loginPage }) => {
      await loginPage.clickOnNeedHelp();
      await expect.poll(() => loginPage.getCurrentUrl()).toMatch(SIGN_IN.RESET_PASSWORD_URL_PATTERN);
    });
  });

  // ======================= SECURITY (simple to automate) =======================
  test.describe('Security', () => {
    test('TC_SIGN_091 Session cookie has HttpOnly, Secure, SameSite=Strict', async ({ loginPage }) => {
      await loginPage.signInWith(users.valid.email, users.valid.password);
      await expect.poll(() => loginPage.getCurrentUrl()).not.toMatch(URL_PATTERNS.LOGIN); // signed in
      // Login/session cookies only (the antiforgery token cookie is not the session cookie)
      const authCookies = (await loginPage.getCookies()).filter((c) => c.httpOnly && !/antiforgery/i.test(c.name));
      expect(authCookies.length).toBeGreaterThan(0);
      for (const c of authCookies) {
        expect.soft(c.secure, `${c.name}: Secure flag`).toBe(true);
        expect.soft(c.sameSite, `${c.name}: SameSite`).toBe('Strict');
      }
    });

    test('TC_SIGN_088 Password is never placed in the URL', async ({ loginPage }) => {
      await loginPage.signInWith(users.valid.email, users.valid.password);
      expect(loginPage.getCurrentUrl()).not.toContain(users.valid.password);
      expect(loginPage.getCurrentUrl()).not.toContain(encodeURIComponent(users.valid.password));
    });
  });
});

/*
Not automated (manual testing recommended): SSO (real IdP), IP block (50+ failures), lockout email content,
lockout/IP-block expiry waits, admin reset, session max lifetime, multi-tab/concurrent sessions, offline behaviour,
log retention, accessibility with screen readers, responsive/device checks, cookie replay on another browser,
role-based landing pages (needs role users).
*/
