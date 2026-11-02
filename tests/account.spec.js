const { test, expect } = require('../fixtures/fixtures');
const { MODULE, accountCases: c } = require('../testData/accountData');
const { CompanyEditPage } = require('../pages/company/companyEditPage');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated } = require('../utils/testCase');
const { expectNotSaved } = require('../utils/negative');

/**
 * Use case 61957 - Create Account (from an existing Person or Company).
 * Each test creates the parent it works on, opens it and starts "+ Add New Account" from the Actions menu.
 * Accounts are NOT deleted; each one is listed with its URL in
 * reports/excel/account/Atlas_Account_<YYYY-MM-DD>.xlsx.
 *
 * Not automated: PERM.ACCT.Account.Create missing (needs a second user), BR-2 account on a deleted parent
 * (the Delete Company flow is not confirmed yet), AF-5 clearing an overridden billing address
 * (the override-clear control is not known yet), Payment Term / Time Zone DefaultSelection precedence (needs settings).
 */

/** Creates the parent Person/Company and returns { url, id }. */
async function createParent({ personEditPage, companyEditPage }, testInfo, tc, data = tc.parent) {
  return test.step(`Seed: create the parent ${tc.parentType}`, async () => {
    const record = tc.parentType === 'Person' ? await personEditPage.createPerson(data) : await companyEditPage.createCompany(data);
    await recordCreated(testInfo, tc.parentType, tc, data, record);
    return record;
  });
}

const parentPage = (fx, tc) => (tc.parentType === 'Person' ? fx.personEditPage : fx.companyEditPage);

/** Display Name the parent shows (62247 for Person, 62248 for Company). */
const parentDisplayName = (tc, data = tc.parent) =>
  (tc.parentType === 'Person' ? `${data.firstName} ${data.lastName}` : CompanyEditPage.generatedDisplayName(data.tradeName || data.legalName));

/** Opens the parent and starts Account creation (MF-1); continues past the advisory if one is shown (MF-2). */
async function openAccountForm(fx, tc, parentId) {
  return test.step('Parent page: Actions -> + Add New Account', async () => {
    await parentPage(fx, tc).gotoEdit(parentId);
    const advisory = await fx.accountPage.startFromParent();
    if (advisory) await fx.accountPage.continueAfterAdvisory();
    return advisory;
  });
}

/**
 * Completes the open form (defaults kept; Account Status / Time Zone / Payment Term picked if unset),
 * applies `edits`, saves (MF-6) and logs the new Account. Returns the saved values and { url, id }.
 */
async function saveAccount(fx, testInfo, tc, edits = {}) {
  const { accountPage } = fx;
  return test.step('Fill and save the Account (MF-4 to MF-6)', async () => {
    await accountPage.completeRequired();
    if (edits.accountName) await accountPage.accountName.fill(edits.accountName);
    if (edits.billingAddress) await accountPage.enterOwnBillingAddress(edits.billingAddress);
    const values = await accountPage.formValues();
    const data = { parent: `${tc.parentType}: ${parentDisplayName(tc)}`, ...values, ...(edits.billingAddress ? { billingAddress: edits.billingAddress } : {}) };
    await recordTestValues(testInfo, data);
    await testInfo.attach('account-form', { body: await accountPage.page.screenshot({ fullPage: true }), contentType: 'image/png' });
    const record = await accountPage.save();
    await recordCreated(testInfo, MODULE, tc, data, record);
    return { values, record, data };
  });
}

/** The parent's Accounts tab lists the given account names. */
async function expectListedOnParent(fx, tc, parentId, names) {
  await test.step('Parent Accounts tab lists the Account', async () => {
    await parentPage(fx, tc).gotoEdit(parentId);
    await parentPage(fx, tc).openTab('Accounts');
    for (const n of names) await expect(fx.accountPage.accountsTab.getByText(n).first(), `Account "${n}" listed on the parent`).toBeVisible();
  });
}

test.describe('Account - Create Account (61957)', () => {
  for (const tc of [c.fromCompany, c.fromPerson]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
      const fx = { personEditPage, companyEditPage, accountPage };
      await applyAllureLabels(tc, MODULE);

      const parent = await createParent(fx, testInfo, tc);
      const advisory = await openAccountForm(fx, tc, parent.id);
      expect(advisory, 'A new parent has no Account, so no advisory is expected').toBe(false);

      await test.step('Defaults prepared (MF-3)', async () => {
        const number = await accountPage.accountNumber.inputValue();
        expect(number, 'Account Number is pre-filled from NextAccountNumber').not.toBe('');
        await expect(accountPage.accountName, 'Account Name = [DisplayName]-[AccountNumber]').toHaveValue(`${parentDisplayName(tc)}-${number}`);
      });
      const { values } = await saveAccount(fx, testInfo, tc);
      await test.step('New Account opens after save', () => accountPage.expectAccountOpened(values));
      await expectListedOnParent(fx, tc, parent.id, [values.accountName]);
    });
  }

  test(tcTitle(c.inheritedBilling), tcDetails(c.inheritedBilling, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
    const tc = c.inheritedBilling;
    const fx = { personEditPage, companyEditPage, accountPage };
    await applyAllureLabels(tc, MODULE);

    const parent = await createParent(fx, testInfo, tc);
    await openAccountForm(fx, tc, parent.id);
    await expect(accountPage.useParentBilling, '"Use parent billing address" is on by default').toBeChecked();
    await expect(accountPage.parentAddressPreview, 'Parent billing address is shown as inherited').toContainText(tc.parent.address.address1);
    const { values, data } = await saveAccount(fx, testInfo, tc);
    await recordTestValues(testInfo, { ...data, billingAddress: tc.parent.address });
    await accountPage.expectAccountOpened(values);
    await expect(accountPage.addressText(tc.parent.address), 'Account still shows the inherited billing address').toBeVisible();
  });

  test(tcTitle(c.overrideBilling), tcDetails(c.overrideBilling, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
    const tc = c.overrideBilling;
    const fx = { personEditPage, companyEditPage, accountPage };
    await applyAllureLabels(tc, MODULE);

    const parent = await createParent(fx, testInfo, tc);
    await openAccountForm(fx, tc, parent.id);
    await expect(accountPage.parentAddressPreview, 'Parent billing address is shown as inherited').toContainText(tc.parent.address.address1);
    const { values } = await saveAccount(fx, testInfo, tc, { billingAddress: tc.billingAddress });
    await accountPage.expectAccountOpened(values);
    await expect(accountPage.addressText(tc.billingAddress), 'Account shows its own billing address').toBeVisible();
  });

  test(tcTitle(c.customName), tcDetails(c.customName, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
    const tc = c.customName;
    const fx = { personEditPage, companyEditPage, accountPage };
    await applyAllureLabels(tc, MODULE);

    const parent = await createParent(fx, testInfo, tc);
    await openAccountForm(fx, tc, parent.id);
    const { values } = await saveAccount(fx, testInfo, tc, { accountName: tc.accountName });
    expect(values.accountName).toBe(tc.accountName);
    await accountPage.expectAccountOpened(values);
    await expectListedOnParent(fx, tc, parent.id, [tc.accountName]);
  });

  test(tcTitle(c.noParentBilling), tcDetails(c.noParentBilling, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
    const tc = c.noParentBilling;
    const fx = { personEditPage, companyEditPage, accountPage };
    await applyAllureLabels(tc, MODULE);

    const parent = await createParent(fx, testInfo, tc);
    await openAccountForm(fx, tc, parent.id);
    await test.step('No inherited address; own address can optionally be entered', async () => {
      await expect(accountPage.parentAddressPreview, 'No inherited billing address').toBeHidden();
      await expect(accountPage.useParentBilling, '"Use parent billing address" is off').not.toBeChecked();
      await expect(accountPage.editOwnAddressButton, 'An address can optionally be entered').toBeEnabled();
    });
    await test.step('Turning "Use parent billing address" on is refused', async () => {
      await accountPage.useParentBillingSwitch.click();
      await expect(accountPage.ownerBillingUnavailable).toBeVisible();
      testInfo.annotations.push({ type: 'Observed', description: 'Shown: "The account owner does not yet have a billing address..."' });
      await accountPage.goBackButton.click();
      await expect(accountPage.useParentBilling).not.toBeChecked();
    });
    const { values } = await saveAccount(fx, testInfo, tc);
    await accountPage.expectAccountOpened(values);
  });

  test(tcTitle(c.advisory), tcDetails(c.advisory, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
    const tc = c.advisory;
    const fx = { personEditPage, companyEditPage, accountPage };
    await applyAllureLabels(tc, MODULE);

    const parent = await createParent(fx, testInfo, tc);
    await openAccountForm(fx, tc, parent.id);
    const first = await saveAccount(fx, testInfo, tc);

    await test.step('Start a second Account - advisory is shown (MF-2)', async () => {
      await companyEditPage.gotoEdit(parent.id);
      const advisory = await accountPage.startFromParent();
      expect(advisory, 'DEFECT: no Existing Account Advisory for a Company that already has an Account').toBe(true);
      await expect(accountPage.advisory).toContainText(tc.message);
      testInfo.annotations.push({ type: 'Observed', description: `Advisory shown: "${tc.message}"` });
      await accountPage.continueAfterAdvisory();
    });
    const second = await saveAccount(fx, testInfo, tc);
    await recordTestValues(testInfo, { 'Account 1': first.values.accountNumber, 'Account 2': second.values.accountNumber, parent: first.data.parent });
    expect(second.values.accountNumber, 'Each Account Number is unique (BR-4)').not.toBe(first.values.accountNumber);
    await expectListedOnParent(fx, tc, parent.id, [first.values.accountName, second.values.accountName]);
  });

  test(tcTitle(c.numberIncrements), tcDetails(c.numberIncrements, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
    const tc = c.numberIncrements;
    const fx = { personEditPage, companyEditPage, accountPage };
    await applyAllureLabels(tc, MODULE);

    const parent = await createParent(fx, testInfo, tc);
    await openAccountForm(fx, tc, parent.id);
    const first = await accountPage.accountNumber.inputValue();
    await openAccountForm(fx, tc, parent.id);   // first form left unsaved
    const second = await accountPage.accountNumber.inputValue();
    await recordTestValues(testInfo, { 'Account Number (1st form)': first, 'Account Number (2nd form)': second });

    expect(first, 'Account Number is numeric').toMatch(/^\d+$/);
    expect(second, 'Account Number is numeric').toMatch(/^\d+$/);
    expect(Number(second), 'NextAccountNumber is incremented when a form is prepared (BR-5)').toBeGreaterThan(Number(first));
  });

  for (const tc of [c.nameRequired, c.numberRequired, c.paymentTermRequired, c.timeZoneRequired]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
      const fx = { personEditPage, companyEditPage, accountPage };
      await applyAllureLabels(tc, MODULE);

      const parent = await createParent(fx, testInfo, tc);
      await openAccountForm(fx, tc, parent.id);
      await accountPage.completeRequired();
      await test.step(`Clear ${tc.clear}`, async () => {
        if (tc.clear === 'accountName' || tc.clear === 'accountNumber') {
          await accountPage[tc.clear].fill('');
        } else if (!(await accountPage.clearSelect(accountPage[tc.clear]))) {
          test.skip(true, `${tc.clear} has no empty option - the field can never be unassigned`);
        }
      });
      const values = await accountPage.formValues();
      const data = { parent: `${tc.parentType}: ${parentDisplayName(tc)}`, ...values };
      await recordTestValues(testInfo, data);

      const result = await test.step('Click Save', () => accountPage.trySave());
      await expectNotSaved(testInfo, MODULE, { ...tc, data }, result);
      await expect(accountPage.validationError, 'Expected a validation error').toBeVisible();
      testInfo.annotations.push({ type: 'Observed', description: `Validation shown: "${(await accountPage.validationError.innerText()).trim()}"` });
    });
  }

  test(tcTitle(c.duplicateNumber), tcDetails(c.duplicateNumber, MODULE), async ({ personEditPage, companyEditPage, accountPage }, testInfo) => {
    const tc = c.duplicateNumber;
    const fx = { personEditPage, companyEditPage, accountPage };
    await applyAllureLabels(tc, MODULE);

    const owner = await createParent(fx, testInfo, tc, tc.existingParent);
    await openAccountForm(fx, tc, owner.id);
    const existing = await saveAccount(fx, testInfo, { ...tc, parent: tc.existingParent });

    const parent = await createParent(fx, testInfo, tc);
    await openAccountForm(fx, tc, parent.id);
    await accountPage.completeRequired();
    await accountPage.accountNumber.fill(existing.values.accountNumber);
    const values = await accountPage.formValues();
    const data = { parent: `${tc.parentType}: ${parentDisplayName(tc)}`, ...values };
    await recordTestValues(testInfo, { ...data, 'Existing Account': `${existing.values.accountNumber} (${existing.record.url})` });

    const result = await test.step('Click Save', () => accountPage.trySave());
    await expectNotSaved(testInfo, MODULE, { ...tc, data }, result);
    await expect(accountPage.validationError, 'Expected a duplicate Account Number error').toBeVisible();
    testInfo.annotations.push({ type: 'Observed', description: `Validation shown: "${(await accountPage.validationError.innerText()).trim()}"` });
  });

  test(tcTitle(c.cancel), tcDetails(c.cancel, MODULE), async ({ personEditPage, companyEditPage, accountPage, page }, testInfo) => {
    const tc = c.cancel;
    const fx = { personEditPage, companyEditPage, accountPage };
    await applyAllureLabels(tc, MODULE);

    const parent = await createParent(fx, testInfo, tc);
    await openAccountForm(fx, tc, parent.id);
    const first = await saveAccount(fx, testInfo, tc);
    await recordTestValues(testInfo, { ...first.data, action: 'Add New Account -> advisory -> dismiss (do not continue)' });

    await test.step('Start a second Account - advisory is shown (MF-2)', async () => {
      await companyEditPage.gotoEdit(parent.id);
      expect(await accountPage.startFromParent(), 'Existing Account Advisory shown').toBe(true);
    });
    await test.step('Cancel at the advisory (AF-1)', () => accountPage.dismissAdvisory());
    await expect(page, 'User stays on the parent Company').toHaveURL(new RegExp(`/Company/Edit/${parent.id}`));
    await expect(accountPage.accountNumber, 'Create Account form is not opened').toHaveCount(0);
    await companyEditPage.gotoEdit(parent.id);
    await companyEditPage.openTab('Accounts');
    await expect(accountPage.accountRows, 'No extra Account was created').toHaveCount(1);
  });
});
