const { test, expect } = require('../fixtures/fixtures');
const { MODULE, MESSAGES, accountUpdateCases, accountUpdateExtraCases: c } = require('../testData/accountUpdateData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUpdated } = require('../utils/testCase');

/**
 * Use case 61959 - View and Update Account.
 * Each test creates a Company and an Account for it, opens /Account/Edit/{id} and works on it.
 * Updated Accounts are NOT deleted (TC_AEU_012-014 soft delete their own Account); every updated Account is
 * listed with its URL in reports/excel/account-update/Atlas_AccountUpdate_<YYYY-MM-DD>.xlsx.
 *
 * Not automated: all permission scenarios (QA-4, 6, 11, 16, 21, 29, 40 - need users without the special
 * permissions), QA-2 visibility (62553, second user), QA-12 / QA-17 unavailable values (only offered values can be
 * picked in the UI), QA-13 Payment Term change (the sandbox has a single Payment Term), QA-18-20 / QA-38
 * AccountPositions (StaffRole set-up), QA-25 / 26 / 30-37 related Projects, Services and financial records
 * (need those records), MF-9 / MF-10 Project / Service creation.
 */

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Creates the owner Company and an Account for it (optionally with its own billing address).
 * Returns { parent, account, before } where `before` is what the Account shows when opened.
 */
async function seedAccount({ companyEditPage, accountEditPage }, testInfo, tc, parentData = tc.parent, edits = {}) {
  return test.step(`Seed: Company "${parentData.tradeName}" + Account`, async () => {
    const parent = await companyEditPage.createCompany(parentData);
    await recordCreated(testInfo, 'Company', tc, parentData, parent);
    const account = await accountEditPage.createAccountFor('Company', parent.id, edits);
    await recordCreated(testInfo, 'Account', tc, account.values, account);
    const before = { ...account.values };
    if (edits.billingAddress) before.billingAddress = edits.billingAddress;
    else if (parentData.address) before.ownerAddress = parentData.address;
    return { parent, account, before };
  });
}

/** Negative save: blocked with a message, record unchanged after re-opening. */
async function expectSaveBlocked(accountEditPage, testInfo, tc, accountId, before) {
  await test.step('Click Save', () => accountEditPage.trySave(tc.message));
  await expect(accountEditPage.savedMessage, 'DEFECT: the app saved the invalid Account Number').toBeHidden();
  const error = accountEditPage.validationError;
  await expect(error, 'Expected a validation message').toBeVisible();
  const shown = (await error.innerText()).trim();
  testInfo.annotations.push({ type: 'Observed', description: `Validation shown: "${shown}"` });
  expect.soft(shown, 'Message text from the use case').toContain(tc.message.replace(/\.$/, ''));
  await test.step('Re-open: stored Account is unchanged', async () => {
    await accountEditPage.gotoEdit(accountId);
    await accountEditPage.expectDetails(before);
  });
}

test.describe('Account - View and Update Account (61959)', () => {
  for (const tc of accountUpdateCases) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ companyEditPage, accountEditPage, page }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.update);

      const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
      const after = { ...before, ...tc.update };
      if (tc.update.billingAddress) delete after.ownerAddress;

      await test.step('View: open the Account - saved values are shown (MF-1)', async () => {
        await accountEditPage.gotoEdit(account.id);
        await accountEditPage.expectDetails(before);
      });
      await test.step('Edit the Account (MF-2 to MF-5)', async () => {
        await accountEditPage.updateForm(tc.update);
        await testInfo.attach('edited-form', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
      await test.step('Save (MF-11)', async () => {
        await accountEditPage.save();
        await recordUpdated(testInfo, 'Account', tc, before, after, { url: page.url(), id: accountEditPage.recordIdFromUrl() });
      });
      await test.step('Re-open: changes persisted', async () => {
        await accountEditPage.gotoEdit(account.id);
        await accountEditPage.expectDetails(after);
        await testInfo.attach('updated-account', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    });
  }

  test(tcTitle(c.view), tcDetails(c.view, MODULE), async ({ companyEditPage, accountEditPage, page }, testInfo) => {
    const tc = c.view;
    await applyAllureLabels(tc, MODULE);

    const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { url: account.url, ...before });
    await accountEditPage.gotoEdit(account.id);
    await accountEditPage.expectDetails(before);
    await expect(accountEditPage.ownerLink(tc.parent.tradeName), 'Owner Company shown (read-only link)').toBeVisible();
    await expect(accountEditPage.ownerFields, 'EntityIDF / EntityRecordID cannot be edited (BR-3)').toHaveCount(0);
    await expect(accountEditPage.rateCardField, 'Active rate card is not displayed (BR-8)').toHaveCount(0);
    await expect(accountEditPage.saveButton, 'Account is editable for a user with update permissions').toBeEnabled();
    await testInfo.attach('viewed-account', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test(tcTitle(c.duplicateNumber), tcDetails(c.duplicateNumber, MODULE), async ({ companyEditPage, accountEditPage }, testInfo) => {
    const tc = c.duplicateNumber;
    await applyAllureLabels(tc, MODULE);

    const other = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc, tc.otherParent);
    const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
    const taken = other.account.values.accountNumber;
    await recordTestValues(testInfo, { accountNumber: taken, 'Number owned by': other.account.url });

    await accountEditPage.gotoEdit(account.id);
    await accountEditPage.updateForm({ accountNumber: taken });
    await expectSaveBlocked(accountEditPage, testInfo, tc, account.id, before);
  });

  test(tcTitle(c.blankNumber), tcDetails(c.blankNumber, MODULE), async ({ companyEditPage, accountEditPage }, testInfo) => {
    const tc = c.blankNumber;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { accountNumber: '(empty)' });

    const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
    await accountEditPage.gotoEdit(account.id);
    await accountEditPage.updateForm(tc.update);
    await expectSaveBlocked(accountEditPage, testInfo, tc, account.id, before);
  });

  test(tcTitle(c.useOwnerBilling), tcDetails(c.useOwnerBilling, MODULE), async ({ companyEditPage, accountEditPage, page }, testInfo) => {
    const tc = c.useOwnerBilling;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { ...tc.update, ownerAddress: tc.parent.address });

    const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc, tc.parent, { billingAddress: tc.ownAddress });
    const after = { ...before, ownerAddress: tc.parent.address };
    delete after.billingAddress;

    await accountEditPage.gotoEdit(account.id);
    await accountEditPage.expectDetails(before);
    const confirmation = await test.step('Turn "Use owner billing address" on and confirm (AF-14)', () => accountEditPage.updateForm(tc.update));
    testInfo.annotations.push({ type: 'Observed', description: `Confirmation shown: "${confirmation}"` });
    expect.soft(confirmation, 'Confirmation text from the use case').toContain(MESSAGES.useOwnerBilling);
    await accountEditPage.save();
    await recordUpdated(testInfo, 'Account', tc, before, after, { url: page.url(), id: accountEditPage.recordIdFromUrl() });
    await test.step('Re-open: owner billing address is used', async () => {
      await accountEditPage.gotoEdit(account.id);
      await accountEditPage.expectDetails(after);
    });
  });

  test(tcTitle(c.unsaved), tcDetails(c.unsaved, MODULE), async ({ companyEditPage, accountEditPage, page }, testInfo) => {
    const tc = c.unsaved;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.update);

    const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
    await accountEditPage.gotoEdit(account.id);
    await accountEditPage.updateForm(tc.update);

    const warning = await test.step('Click a sidebar link, then Cancel', () => accountEditPage.leaveWithUnsavedChanges('cancel'));
    testInfo.annotations.push({ type: 'Observed', description: `Warning shown: "${warning}"` });
    await expect(page).toHaveURL(new RegExp(`/Account/Edit/${account.id}`));
    await expect(accountEditPage.accountName, 'Edited value is kept after Cancel').toHaveValue(tc.update.accountName);

    await test.step('Click the link again, then Continue Without Saving', () => accountEditPage.leaveWithUnsavedChanges('continue'));
    await expect(page).not.toHaveURL(/\/Account\/Edit\//);
    await test.step('Re-open: changes were discarded', async () => {
      await accountEditPage.gotoEdit(account.id);
      await accountEditPage.expectDetails(before);
    });
  });

  test(tcTitle(c.audit), tcDetails(c.audit, MODULE), async ({ companyEditPage, accountEditPage, page }, testInfo) => {
    const tc = c.audit;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.update);

    const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
    await accountEditPage.gotoEdit(account.id);
    await accountEditPage.updateForm(tc.update);
    await accountEditPage.save();
    await recordUpdated(testInfo, 'Account', tc, before, { ...before, ...tc.update }, { url: page.url(), id: accountEditPage.recordIdFromUrl() });

    await test.step('Audit tab shows the previous Account Name', async () => {
      await accountEditPage.openTab('Audit');
      // the full old name (with its "-<number>" suffix) appears nowhere else once renamed
      await expect(page.locator('main').getByText(new RegExp(escape(before.accountName))).filter({ visible: true }).first()).toBeVisible();
      await testInfo.attach('audit-tab', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
  });

  test(tcTitle(c.softDelete), tcDetails(c.softDelete, MODULE), async ({ companyEditPage, accountEditPage, page }, testInfo) => {
    const tc = c.softDelete;
    await applyAllureLabels(tc, MODULE);

    const { account } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { url: account.url, accountNumber: account.values.accountNumber, action: 'Delete' });
    await accountEditPage.gotoEdit(account.id);
    await test.step('Delete the Account (MF-12)', () => accountEditPage.deleteAccount());
    await expect(page.getByText(MESSAGES.deleted).first(), 'Account Deleted Successfully scenario').toBeVisible();
    await testInfo.attach('deleted', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test(tcTitle(c.restore), tcDetails(c.restore, MODULE), async ({ companyEditPage, accountEditPage, page }, testInfo) => {
    const tc = c.restore;
    await applyAllureLabels(tc, MODULE);

    const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
    await recordTestValues(testInfo, { url: account.url, accountNumber: before.accountNumber, action: 'Delete, then Restore' });
    await accountEditPage.gotoEdit(account.id);
    await test.step('Delete the Account', async () => {
      await accountEditPage.deleteAccount();
      await expect(page.getByText(MESSAGES.deleted).first()).toBeVisible();
    });
    await test.step('Restore the Account (MF-13)', async () => {
      await accountEditPage.gotoEdit(account.id);
      await accountEditPage.restoreAccount();
      await expect(page.getByText(MESSAGES.restored).first(), 'Account Restored Successfully scenario').toBeVisible();
    });
    await test.step('Re-open: same Account Number and Name (QA-41)', async () => {
      await accountEditPage.gotoEdit(account.id);
      await accountEditPage.expectDetails(before);
    });
  });

  test(tcTitle(c.deletedNumber), tcDetails(c.deletedNumber, MODULE), async ({ companyEditPage, accountEditPage, page }, testInfo) => {
    const tc = c.deletedNumber;
    await applyAllureLabels(tc, MODULE);

    const other = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc, tc.otherParent);
    await test.step('Soft delete the Account that holds the number', async () => {
      await accountEditPage.gotoEdit(other.account.id);
      await accountEditPage.deleteAccount();
      await expect(page.getByText(MESSAGES.deleted).first()).toBeVisible();
    });
    const { account, before } = await seedAccount({ companyEditPage, accountEditPage }, testInfo, tc);
    const reserved = other.account.values.accountNumber;
    await recordTestValues(testInfo, { accountNumber: reserved, 'Number owned by (deleted)': other.account.url });

    await accountEditPage.gotoEdit(account.id);
    await accountEditPage.updateForm({ accountNumber: reserved });
    await expectSaveBlocked(accountEditPage, testInfo, tc, account.id, before);
  });
});
