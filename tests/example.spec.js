// Smoke test template -- replace with real feature specs (one spec per feature).
// Specs use fixtures from ../fixtures/pages.fixture and never hardcode data.

const { test, expect } = require('../fixtures/pages.fixture');

test.describe('Smoke', () => {
  test('user is signed in', async ({ page, loginPage }) => {
    await page.goto('/');
    await expect(loginPage.userMenuIcon).toBeVisible();
  });
});
