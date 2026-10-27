// Login automation: TC-P-05, TC-P-13, TC-N-02, TC-N-03, TC-N-06
// (see Login_TestCases.md). None of these can trigger account lockout.

const { test, expect } = require('../fixtures/pages.fixture');
const { URL_PATTERNS } = require('../utils/constants');
const { uniqueEmail } = require('../utils/testDataGenerator');

// Login tests must start logged out (the chromium project injects a logged-in state).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigateToLoginPage();
    await expect(loginPage.welcomeHeading).toBeVisible();
  });

  test('TC-P-05: show password toggle reveals and re-masks password', async ({ loginPage }) => {
    await loginPage.enterPassword('Sample@123');
    await expect(loginPage.passwordTextBox).toHaveAttribute('type', 'password');

    await loginPage.showPasswordButton.click();
    await expect(loginPage.passwordTextBox).toHaveAttribute('type', 'text');

    await loginPage.showPasswordButton.click();
    await expect(loginPage.passwordTextBox).toHaveAttribute('type', 'password');
  });

  test('TC-P-13: "Need help Signing In?" opens reset password flow', async ({ loginPage }) => {
    await loginPage.needHelpLink.click();
    await expect(loginPage.resetPasswordHeading).toBeVisible();
    await expect(loginPage.resetEmailTextBox).toBeVisible();
    await expect(loginPage.sendResetLinkButton).toBeVisible();
  });

  test('TC-N-03: empty email and password are not submitted', async ({ page, loginPage }) => {
    await loginPage.clickOnLoginButton();
    await expect(page).toHaveURL(URL_PATTERNS.LOGIN);
    expect(await loginPage.emailTextBox.evaluate((el) => el.checkValidity())).toBe(false);
  });

  test('TC-N-06: invalid email format (no @) is rejected', async ({ page, loginPage }) => {
    await loginPage.fillLoginForm('chiragparmar.idb.bz', 'Sample@123');
    await loginPage.clickOnLoginButton();
    await expect(page).toHaveURL(URL_PATTERNS.LOGIN);
    expect(await loginPage.emailTextBox.evaluate((el) => el.checkValidity())).toBe(false);
  });

  test('TC-N-02: unregistered email is rejected with a generic error', async ({ page, loginPage }) => {
    await loginPage.fillLoginForm(uniqueEmail('nouser'), 'Sample@123');
    await loginPage.clickOnLoginButton();

    await expect(page).toHaveURL(URL_PATTERNS.LOGIN);
    await expect(loginPage.emailTextBox).toBeVisible();
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    expect(bodyText).not.toMatch(/user does not exist|no account found/);
  });
});
