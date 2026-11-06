const { test, expect } = require('../fixtures/fixtures');
const { CompanyEditPage } = require('../pages/company/companyEditPage');
const {
  MODULE, ROLES, companyUpdateCases, companyUpdateExtraCases: c, displayNameFlows, displayNameExtraCases: d,
} = require('../testData/companyUpdateData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUpdated } = require('../utils/testCase');
const { expectValidationMessage } = require('../utils/negative');

/**
 * Use case 62385 - View & Edit Company.
 * Each test creates the company it works on (logged in "Company Test Data"), opens /Company/Edit/{id}
 * and edits it. Updated records are NOT deleted; they are listed with their URL in
 * reports/excel/company-update/Atlas_CompanyUpdate_<YYYY-MM-DD>.xlsx.
 *
 * Not automated (need a second user, a settings change, Account records or the People tab design):
 * QA-2 / QA-3 permissions, QA-9 duplicate EIN allowed, QA-12 duplicate role (checkboxes cannot duplicate),
 * QA-13 to QA-19 affiliations, QA-20 / QA-21 associated Accounts, QA-22 Create Account, QA-24 delete blocked by Account.
 *
 * Use case 62248 - Maintain Company Display Name is covered by TC_CEU_001 (MF-6), TC_CEU_007 (A3-1),
 * TC_CEU_010 (MF-2) and the "Maintain Company Display Name" block below (TC_CEU_016 to TC_CEU_023).
 * Reset (MF-5) is done by clearing the Display Name field, as the page has no separate reset control.
 */

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NAME_LABELS = { tradeName: 'Trade Name', legalName: 'Legal Name', displayName: 'Display Name' };
/** Long values shortened for step titles / Test Values. */
const shorten = v => (v === '' ? '(empty)' : v.length > 60 ? `${v.slice(0, 40)}... (${v.length} chars)` : v);
/** "Trade Name = (empty); Legal Name = Playwright ..." */
const describeStep = step => Object.entries(step).map(([k, v]) => `${NAME_LABELS[k] || k} = ${shorten(v)}`).join('; ');

/** Creates a company and returns { url, id }. */
async function seedCompany(companyEditPage, testInfo, tc, data = tc.seed) {
  return test.step(`Seed: create "${data.tradeName}"`, async () => {
    const record = await companyEditPage.createCompany(data);
    await recordCreated(testInfo, 'Company', tc, data, record);
    return record;
  });
}

test.describe('Company - View & Edit Company (62385)', () => {
  for (const tc of companyUpdateCases) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ companyEditPage, page }, testInfo) => {
      const after = { ...tc.seed, ...tc.update };
      const knownRoles = [...new Set([...(tc.seed.roles || []), ...(after.roles || [])])];
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.update);

      const record = await seedCompany(companyEditPage, testInfo, tc);

      await test.step('View: open the record - saved values are shown (MF-1, MF-2)', async () => {
        await companyEditPage.gotoEdit(record.id);
        await companyEditPage.expectDetails(tc.seed);
      });
      await test.step('Edit the company (MF-3, MF-4)', async () => {
        await companyEditPage.updateForm(tc.update, tc.seed.roles);
        await testInfo.attach('edited-form', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
      await test.step('Save (MF-11)', async () => {
        await companyEditPage.save();
        await recordUpdated(testInfo, 'Company', tc, tc.seed, after, { url: page.url(), id: companyEditPage.recordIdFromUrl() });
      });
      await test.step('Re-open: changes persisted, Display Name maintained by 62248', async () => {
        await companyEditPage.gotoEdit(record.id);
        await companyEditPage.expectDetails(after, knownRoles);
        await testInfo.attach('updated-record', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    });
  }

  test(tcTitle(c.view), tcDetails(c.view, MODULE), async ({ companyEditPage, page }, testInfo) => {
    const tc = c.view;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.seed);

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await companyEditPage.gotoEdit(record.id);
    await companyEditPage.expectDetails(tc.seed, ROLES);
    for (const name of ['Details', 'People', 'Documents', 'Tasks', 'Audit']) await expect(companyEditPage.tab(name), `"${name}" tab`).toBeVisible();
    await expect(companyEditPage.signalsButton, 'Signals is enabled for Company').toBeVisible();
    await expect(companyEditPage.saveButton, 'Record is editable for a user with ACCT.Company.Update').toBeEnabled();
    await testInfo.attach('viewed-record', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test(tcTitle(c.displayOverride), tcDetails(c.displayOverride, MODULE), async ({ companyEditPage, page }, testInfo) => {
    const tc = c.displayOverride;
    const overridden = { ...tc.seed, ...tc.override };
    const after = { ...overridden, ...tc.update };
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { ...tc.override, ...tc.update });

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await test.step('Overwrite Display Name and save', async () => {
      await companyEditPage.gotoEdit(record.id);
      await companyEditPage.updateForm(tc.override);
      await companyEditPage.save();
    });
    await test.step('Change Trade Name and save', async () => {
      await companyEditPage.gotoEdit(record.id);
      await companyEditPage.updateForm(tc.update);
      await companyEditPage.save();
      await recordUpdated(testInfo, 'Company', tc, tc.seed, after, { url: page.url(), id: companyEditPage.recordIdFromUrl() });
    });
    await test.step('Re-open: user-entered Display Name is preserved', async () => {
      await companyEditPage.gotoEdit(record.id);
      await companyEditPage.expectDetails(after);
    });
  });

  for (const tc of [c.invalidEin, c.duplicateEin, c.noName]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ companyEditPage }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, tc.update);

      if (tc.existing) await seedCompany(companyEditPage, testInfo, tc, tc.existing);
      const record = await seedCompany(companyEditPage, testInfo, tc);
      await companyEditPage.gotoEdit(record.id);
      await companyEditPage.updateForm(tc.update);
      await test.step('Click Save', () => companyEditPage.trySave(tc.message));
      await expect(companyEditPage.savedMessage, 'DEFECT: the app saved the invalid change').toBeHidden();
      await expectValidationMessage(companyEditPage, tc.message);
      await test.step('Unsaved changes are preserved on the page', async () => {
        if ('ein' in tc.update) await expect(companyEditPage.ein).toHaveValue(tc.update.ein);
        if ('tradeName' in tc.update) await expect(companyEditPage.tradeName).toHaveValue(tc.update.tradeName);
      });
      await test.step('Re-open: stored record is unchanged', async () => {
        await companyEditPage.gotoEdit(record.id);
        await companyEditPage.expectDetails(tc.seed);
      });
    });
  }

  test(tcTitle(c.unsaved), tcDetails(c.unsaved, MODULE), async ({ companyEditPage, page }, testInfo) => {
    const tc = c.unsaved;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.update);

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await companyEditPage.gotoEdit(record.id);
    await companyEditPage.updateForm(tc.update);

    const warning = await test.step('Click a sidebar link, then Cancel', () => companyEditPage.leaveWithUnsavedChanges('cancel'));
    testInfo.annotations.push({ type: 'Observed', description: `Warning shown: "${warning}"` });
    await expect(page).toHaveURL(new RegExp(`/Company/Edit/${record.id}`));
    await expect(companyEditPage.tradeName, 'Edited value is kept after Cancel').toHaveValue(tc.update.tradeName);

    await test.step('Click the link again, then Continue Without Saving', () => companyEditPage.leaveWithUnsavedChanges('continue'));
    await expect(page).not.toHaveURL(/\/Company\/Edit\//);
    await test.step('Re-open: changes were discarded', async () => {
      await companyEditPage.gotoEdit(record.id);
      await companyEditPage.expectDetails(tc.seed);
    });
  });

  test(tcTitle(c.audit), tcDetails(c.audit, MODULE), async ({ companyEditPage, page }, testInfo) => {
    const tc = c.audit;
    const after = { ...tc.seed, ...tc.update };
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.update);

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await companyEditPage.gotoEdit(record.id);
    await companyEditPage.updateForm(tc.update);
    await companyEditPage.save();
    await recordUpdated(testInfo, 'Company', tc, tc.seed, after, { url: page.url(), id: companyEditPage.recordIdFromUrl() });

    await test.step('Audit tab shows the previous Legal Name', async () => {
      await companyEditPage.openTab('Audit');
      // the old Legal Name no longer appears anywhere else on the page (the header shows the Trade Name)
      await expect(page.locator('main').getByText(new RegExp(escape(tc.seed.legalName))).filter({ visible: true }).first()).toBeVisible();
      await testInfo.attach('audit-tab', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
  });

  test(tcTitle(c.accountsHidden), tcDetails(c.accountsHidden, MODULE), async ({ companyEditPage }, testInfo) => {
    const tc = c.accountsHidden;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.seed);

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await companyEditPage.gotoEdit(record.id);
    await expect(companyEditPage.tab('Details')).toBeVisible();
    await expect(companyEditPage.tab('Accounts'), 'DEFECT: Accounts tab is shown for a company with no Account').toBeHidden();
  });

  test(tcTitle(c.recentlyViewed), tcDetails(c.recentlyViewed, MODULE), async ({ companyEditPage, page }, testInfo) => {
    const tc = c.recentlyViewed;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.seed);

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await companyEditPage.gotoEdit(record.id);
    await companyEditPage.open('/RecentlyViewed');
    await expect(page.locator('main').getByText(tc.seed.tradeName).first(), 'Company is listed in Recently Viewed').toBeVisible();
  });

  test(tcTitle(c.deleteRestore), tcDetails(c.deleteRestore, MODULE), async ({ companyEditPage, page }, testInfo) => {
    const tc = c.deleteRestore;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, tc.seed);

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await companyEditPage.gotoEdit(record.id);
    await test.step('Delete (MF-12) - record is soft deleted and offers Restore', async () => {
      await companyEditPage.runAction('Delete');
      await companyEditPage.gotoEdit(record.id);
      await companyEditPage.actionsMenu.click();
      await expect(companyEditPage.actionItem('Restore'), 'Soft-deleted company offers Restore').toBeVisible();
      await page.keyboard.press('Escape');
      await testInfo.attach('soft-deleted', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
    await test.step('Restore (MF-13) - record is active again with its data intact', async () => {
      await companyEditPage.runAction('Restore');
      await companyEditPage.gotoEdit(record.id);
      await companyEditPage.expectDetails(tc.seed);
      await companyEditPage.actionsMenu.click();
      await expect(companyEditPage.actionItem('Delete'), 'Restored company offers Delete again').toBeVisible();
      await page.keyboard.press('Escape');
    });
  });
});

test.describe('Company - Maintain Company Display Name (62248)', () => {
  for (const tc of displayNameFlows) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ companyEditPage, page }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      await recordTestValues(testInfo, Object.fromEntries(tc.steps.map((s, i) => [`Save ${i + 1}`, describeStep(s)])));

      const record = await seedCompany(companyEditPage, testInfo, tc);
      let state = { ...tc.seed };
      for (const [i, step] of tc.steps.entries()) {
        await test.step(`Save ${i + 1}: ${describeStep(step)}`, async () => {
          await companyEditPage.gotoEdit(record.id);
          await companyEditPage.updateForm(step);
          // expected values come from what the fields actually hold (a maxlength may shorten long input)
          for (const k of Object.keys(step)) {
            state[k] = await companyEditPage[k].inputValue();
            if (state[k] !== step[k]) {
              testInfo.annotations.push({ type: 'Observed', description: `${NAME_LABELS[k]} field accepted ${state[k].length} of ${step[k].length} characters` });
            }
          }
          if (state.displayName === '') delete state.displayName; // reset -> system-generated again (MF-5)
          await companyEditPage.save();
        });
      }
      await recordUpdated(testInfo, 'Company', tc, tc.seed, state, { url: page.url(), id: companyEditPage.recordIdFromUrl() });

      await test.step(`Re-open: Display Name = "${shorten(CompanyEditPage.displayNameOf(state))}"`, async () => {
        await companyEditPage.gotoEdit(record.id);
        await companyEditPage.expectDetails(state);
        await testInfo.attach('display-name', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    });
  }

  test(tcTitle(d.whitespace), tcDetails(d.whitespace, MODULE), async ({ companyEditPage, page }, testInfo) => {
    const tc = d.whitespace;
    const expected = CompanyEditPage.generatedDisplayName(tc.update.tradeName);
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { tradeName: JSON.stringify(tc.update.tradeName) });

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await companyEditPage.gotoEdit(record.id);
    await companyEditPage.updateForm(tc.update);
    await companyEditPage.save();
    await recordUpdated(testInfo, 'Company', tc, tc.seed, { ...tc.seed, ...tc.update }, { url: page.url(), id: companyEditPage.recordIdFromUrl() });

    await test.step('Re-open: Display Name is trimmed and single-spaced', async () => {
      await companyEditPage.gotoEdit(record.id);
      await expect(companyEditPage.displayName).toHaveValue(expected);
      await expect(page.locator('main').getByText(expected, { exact: true }).first(), 'Header shows the Display Name').toBeVisible();
    });
  });

  test(tcTitle(d.tooLong), tcDetails(d.tooLong, MODULE), async ({ companyEditPage }, testInfo) => {
    const tc = d.tooLong;
    await applyAllureLabels(tc, MODULE);
    await recordTestValues(testInfo, { displayName: shorten(tc.update.displayName) });

    const record = await seedCompany(companyEditPage, testInfo, tc);
    await companyEditPage.gotoEdit(record.id);
    await companyEditPage.updateForm(tc.update);
    const entered = await companyEditPage.displayName.inputValue();

    if (entered.length <= 200) {
      // the field itself refuses the extra characters - the over-long value can never be submitted
      testInfo.annotations.push({ type: 'Observed', description: `Display Name field accepts at most ${entered.length} characters (input limit)` });
    } else {
      await test.step('Click Save', async () => {
        await companyEditPage.saveButton.click();
        await expect(companyEditPage.anyValidationError().or(companyEditPage.savedMessage)).toBeVisible({ timeout: 30_000 });
      });
      await expect(companyEditPage.savedMessage, 'DEFECT: a 220-character Display Name was saved').toBeHidden();
      const error = companyEditPage.anyValidationError();
      await expect(error, 'Expected a "must be <= 200 characters" validation error').toBeVisible();
      testInfo.annotations.push({ type: 'Observed', description: `Validation shown: "${(await error.innerText()).trim()}"` });
    }
    await test.step('Re-open: stored record is unchanged', async () => {
      await companyEditPage.gotoEdit(record.id);
      await companyEditPage.expectDetails(tc.seed);
    });
  });
});
