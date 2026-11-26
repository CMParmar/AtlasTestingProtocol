const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { MODULE, STATUS, completeServiceCases: c } = require('../testData/completeServiceData');
const { resolveServiceAccounts } = require('../utils/serviceAccount');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordUrl } = require('../utils/testCase');

/**
 * Complete Service (SERV, use case 62477). The sandbox UI calls a Service a "Deliverable": /Service/Edit/{id}.
 * There is no "Complete Service" command: the user chooses the status "Completed" in the Status dropdown, clicks Save and
 * confirms the dialog #confirmModal ("Mark deliverable as complete?"). Every test creates its own Deliverable on
 * SERVICE_ACCOUNT_NAME (default "Test case factory") through Create Service, then completes it on /Service/Edit/{id}.
 * Deliverables are NOT deleted. Runs in the "functional" project (saved session, no retries). Locators were taken from the
 * live sandbox (see pages/service/completeServicePage.js).
 *
 * Not automated (skipped with the reason): TC-3 (needs a second user without PERM.SERV.Service.Complete).
 * Opt-in: TC-2 and TC-7 tick "Don't show the confirmation again", which changes the setting of the signed-in user
 * permanently, so they run only with COMPLETE_ALLOW_SUPPRESS=true (and then in order, TC-7 before TC-2).
 * The "Service Completed" scenario has no UI: TC-12 checks it through its visible effects (exactly one transition).
 */

/** { main, other }: accounts with their projects, resolved once by name. */
let seed;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  seed = await resolveServiceAccounts(browser);
});

/** Creates the Deliverable of test case `tc` on the main account, leaves the page on its Edit page and logs the URL. */
async function seedService(sp, testInfo, tc) {
  await applyAllureLabels(tc, MODULE);
  const form = { ...tc.data };
  const record = await test.step(`Create Deliverable "${form.serviceName}" on Account "${seed.main.name}"`, () =>
    sp.createDeliverable({ accountId: seed.main.id, ...form }));
  await sp.expectEditOpen();
  await recordUrl(testInfo, record.url, 'Deliverable');
  await recordTestValues(testInfo, { serviceName: form.serviceName, serviceItem: form.item, account: seed.main.name, url: `/Service/Edit/${record.id}` });
  return record.id;
}

/** The completed state every successful completion leaves behind. */
async function expectCompleted(sp) {
  expect(await sp.valueText(sp.status), 'ServiceStatus').toBe(STATUS.completed);
  await expect(sp.canceledBanner, 'No canceled banner').toHaveCount(0);
}

/** yyyy-mm-dd of `date` in UTC. */
const isoDay = date => date.toISOString().slice(0, 10);

test.describe('Service - Complete Service', () => {
  // ---------- MF-1 .. MF-4 ----------
  test(tcTitle(c.confirmEnabled), tcDetails(c.confirmEnabled, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.confirmEnabled);
    expect(await sp.valueText(sp.status), 'Service starts Active').toBe(STATUS.active);
    await test.step('MF-1 / MF-2 / MF-3: Completed + Save raises the confirmation dialog', async () => {
      await sp.startComplete();
      await expect(sp.completeConfirm, 'Mark Complete button').toBeEnabled();
      await expect(sp.completeDontShowAgain, 'Do-not-prompt-again control').toBeVisible();
      await expect(sp.completeDontShowAgain, 'Control starts unticked').not.toBeChecked();
    });
    await test.step('MF-4: confirm', async () => {
      expect(await sp.confirmComplete(), 'POST answered with a redirect back to the Service').toBeLessThan(400);
      await expectCompleted(sp);
    });
    await recordTestValues(testInfo, { serviceStatus: STATUS.completed });
  });

  test(tcTitle(c.confirmDisabled), tcDetails(c.confirmDisabled, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    test.skip(!env.completeAllowSuppress, 'Needs the confirmation switched off for the signed-in user (a permanent setting change): run with COMPLETE_ALLOW_SUPPRESS=true after TC-7');
    await seedService(sp, testInfo, c.confirmDisabled);
    const { dialogShown, status } = await sp.completeWhateverTheSetting();
    expect(status, 'POST answered with a redirect').toBeLessThan(400);
    expect(dialogShown, 'No confirmation dialog').toBe(false);
    await expectCompleted(sp);
  });

  test.skip(tcTitle(c.noPermission), tcDetails(c.noPermission, MODULE), async () => {
    // needs a second user without PERM.SERV.Service.Complete
  });

  test(tcTitle(c.alreadyCompleted), tcDetails(c.alreadyCompleted, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    const id = await seedService(sp, testInfo, c.alreadyCompleted);
    await sp.completeService();
    await expectCompleted(sp);
    const rows = await sp.statusHistory();
    const date = await sp.completionDate();
    expect(date, 'Actual Completion Date set').not.toBe('');
    await test.step('Save on the completed Service raises no dialog', async () => {
      expect(await sp.saveAndReportDialog(), 'No confirmation dialog').toBe(false);
    });
    await sp.gotoEdit(id);
    await expectCompleted(sp);
    expect(await sp.statusHistory(), 'No second Completed row').toEqual(rows);
    expect((await sp.statusHistory()).filter(r => r.title === STATUS.completed), 'One completion only').toHaveLength(1);
    expect(await sp.completionDate(), 'Actual Completion Date unchanged').toBe(date);
  });

  test(tcTitle(c.fromCanceled), tcDetails(c.fromCanceled, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.fromCanceled);
    await sp.cancelService('Canceled by mistake');
    await expect(sp.canceledBanner, 'Service is canceled first').toBeVisible();
    await sp.completeService();
    await expectCompleted(sp);
    const titles = (await sp.statusHistory()).map(r => r.title);
    expect(titles.slice(0, 2), 'Newest rows: Completed after Canceled').toEqual([STATUS.completed, STATUS.canceled]);
    await recordTestValues(testInfo, { serviceStatus: STATUS.completed });
  });

  // ---------- confirmation dialog ----------
  test(tcTitle(c.cancelDialog), tcDetails(c.cancelDialog, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    const id = await seedService(sp, testInfo, c.cancelDialog);
    const before = await sp.statusHistory();
    await sp.startComplete();
    await sp.completeGoBack.click();
    await expect(sp.completeDialog, 'Dialog closed').toBeHidden();
    await sp.gotoEdit(id);
    expect(await sp.valueText(sp.status), 'Service still Active').toBe(STATUS.active);
    expect(await sp.statusHistory(), 'No history row added').toEqual(before);
    expect(await sp.completionDate(), 'No completion date').toBe('');
  });

  test.describe('do not prompt again (permanent setting change, opt-in)', () => {
    // the setting belongs to the signed-in user: TC-7 switches the confirmation off, TC-2 relies on it
    test.describe.configure({ mode: 'default' });

    test(tcTitle(c.dontPromptAgain), tcDetails(c.dontPromptAgain, MODULE), async ({ completeServicePage: sp }, testInfo) => {
      test.skip(!env.completeAllowSuppress, 'Ticking "Don\'t show the confirmation again" changes the signed-in user\'s setting permanently: run with COMPLETE_ALLOW_SUPPRESS=true');
      test.setTimeout(180_000);
      await seedService(sp, testInfo, c.dontPromptAgain);
      await sp.startComplete();
      expect(await sp.confirmComplete({ dontShowAgain: true }), 'POST answered with a redirect').toBeLessThan(400);
      await expectCompleted(sp);
      await test.step('A following completion needs no confirmation', async () => {
        await sp.createDeliverable({ accountId: seed.main.id, ...c.dontPromptAgain.data, serviceName: `${c.dontPromptAgain.data.serviceName} 2` });
        const { dialogShown } = await sp.completeWhateverTheSetting();
        expect(dialogShown, 'No confirmation dialog any more').toBe(false);
        await expectCompleted(sp);
      });
    });
  });

  // ---------- Business rules 3 / 4 ----------
  test(tcTitle(c.openWorkItems), tcDetails(c.openWorkItems, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.openWorkItems);
    const items = await sp.workItemStatuses();
    expect(items.length, 'The workflow created work items').toBeGreaterThan(0);
    expect(items.filter(i => /complete/i.test(i.status)), 'No work item is complete yet').toHaveLength(0);
    await sp.completeService();
    await expectCompleted(sp);
    expect(await sp.workItemStatuses(), 'Work items (count, titles, statuses) unchanged').toEqual(items);
  });

  test(tcTitle(c.openBilling), tcDetails(c.openBilling, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.openBilling);
    const before = await sp.financialValues();
    expect(before.billingType, 'Billing Type set').not.toBe('');
    await sp.completeService();
    await expectCompleted(sp);
    expect(await sp.financialValues(), 'Billing Type and Estimated Hours unchanged').toEqual(before);
    await recordTestValues(testInfo, before);
  });

  // ---------- MF-4 side effects ----------
  test(tcTitle(c.historyRow), tcDetails(c.historyRow, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.historyRow);
    const before = await sp.statusHistory();
    await sp.completeService();
    await expectCompleted(sp);
    const after = await sp.statusHistory();
    expect(after.length, 'Exactly one Status history row added').toBe(before.length + 1);
    expect(after[0].title, 'Newest row is Completed').toBe(STATUS.completed);
    expect(after.slice(1), 'Earlier rows unchanged').toEqual(before);
    expect(await sp.auditStatusChanges(), 'Audit: ServiceStatus Active -> Completed')
      .toContainEqual(expect.objectContaining({ old: STATUS.active, new: STATUS.completed }));
  });

  test(tcTitle(c.completedDate), tcDetails(c.completedDate, MODULE), async ({ completeServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.completedDate);
    expect(await sp.completionDate(), 'Actual Completion Date empty before').toBe('');
    await sp.completeService();
    await expectCompleted(sp);
    const date = await sp.completionDate();
    // the date is the current day in the account's time zone: within one day of the UTC day wherever the account is
    const now = Date.now();
    const allowed = [-1, 0, 1].map(d => isoDay(new Date(now + d * 86_400_000)));
    expect(allowed, 'Actual Completion Date is today (account time zone)').toContain(date);
    const rows = await sp.auditCompletionRows();
    expect(rows.length, 'Audit records the Actual Completion Date').toBeGreaterThan(0);
    await recordTestValues(testInfo, { actualCompletion: date });
  });

  test(tcTitle(c.raisedOnce), tcDetails(c.raisedOnce, MODULE), async ({ completeServicePage: sp, page }, testInfo) => {
    await seedService(sp, testInfo, c.raisedOnce);
    await sp.startComplete();
    const posts = [];
    page.on('request', r => { if (r.method() === 'POST' && /\/Service\/Edit\/\d+/i.test(r.url())) posts.push(r.url()); });
    await sp.confirmComplete();
    await expectCompleted(sp);
    expect(posts, 'One POST for one completion').toHaveLength(1);
    expect((await sp.statusHistory()).filter(r => r.title === STATUS.completed), 'One Completed history row').toHaveLength(1);
    const changes = await sp.auditStatusChanges();
    expect(changes.filter(ch => ch.new === STATUS.completed), 'One Completed audit change').toHaveLength(1);
  });
});
