const { test, expect } = require('../fixtures/fixtures');
const { MODULE, STATUS, STAGE, NO_REASON, REASON, SHORT_REASON, MESSAGES, cancelServiceCases: c } = require('../testData/cancelServiceData');
const { resolveServiceAccounts } = require('../utils/serviceAccount');
const { tcDetails, tcTitle, applyAllureLabels, knownDefect, recordTestValues, recordUrl } = require('../utils/testCase');

/**
 * Cancel Service (SERV, use case 62476). The sandbox UI calls a Service a "Deliverable": /Service/Edit/{id}.
 * There is no "Cancel Service" command: the user chooses the status "Canceled" in the Status dropdown, clicks Save and confirms the
 * cancel dialog (#confirmModal, optional reason). Every test creates its own Deliverable on SERVICE_ACCOUNT_NAME (default
 * "Test case factory") through Create Service, then cancels it on /Service/Edit/{id}. Deliverables are NOT deleted.
 * Runs in the "functional" project (saved session, no retries). Locators were taken from the live sandbox
 * (see pages/service/cancelServicePage.js).
 *
 * Where the cancellation reason is shown: the Justification of the Canceled row of the History tab (Status view).
 *
 * Not automated (skipped with the reason): T-5 (the application lets a user run only one clock, so several open clocks cannot be
 * created), T-10 (needs a second user without PERM.SERV.Service.Cancel).
 * Known defect (T-20): the blocked clock-in dialog offers "Continue anyway", which really clocks in on a canceled Service.
 * Clocks: only one clock can run per user, so the two tests that start / try a clock run in order on one worker.
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
  knownDefect(testInfo, tc);
  const form = { ...tc.data };
  const record = await test.step(`Create Deliverable "${form.serviceName}" on Account "${seed.main.name}"`, () =>
    sp.createDeliverable({ accountId: seed.main.id, ...form }));
  await sp.expectEditOpen();
  await recordUrl(testInfo, record.url, 'Deliverable');
  await recordTestValues(testInfo, { serviceName: form.serviceName, serviceItem: form.item, account: seed.main.name, url: `/Service/Edit/${record.id}` });
  return record.id;
}

/** The canceled state every successful cancellation leaves behind. */
async function expectCanceled(sp) {
  await expect(sp.canceledBanner, 'Canceled banner with "Restore this Deliverable"').toBeVisible();
  expect(await sp.valueText(sp.status), 'ServiceStatus').toBe(STATUS.canceled);
}

/** Skips the test while another clock of the user is running (only one clock can run per user). */
async function skipIfClockRunning(sp) {
  const running = await sp.activeClockWorkItemId();
  test.skip(running !== null, 'Another clock of the signed-in user is running (one clock per user): run the spec again when it is stopped');
}

test.describe('Service - Cancel Service', () => {
  // ---------- MF-1 .. MF-4 Cancel ----------
  test(tcTitle(c.cancelActive), tcDetails(c.cancelActive, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.cancelActive);
    expect(await sp.valueText(sp.status), 'Service starts Active').toBe(STATUS.active);
    await test.step('MF-1: Canceled + Save raises the cancel dialog with an optional reason', async () => {
      await sp.startCancel();
      await expect(sp.cancelReason, 'Reason textarea').toBeVisible();
      await expect(sp.cancelReason, 'Reason is optional and starts empty').toHaveValue('');
      await expect(sp.cancelConfirm, 'Confirm Cancellation').toBeEnabled();
    });
    await test.step('MF-2 / MF-3: confirm', async () => {
      expect(await sp.confirmCancel(), 'POST answered with a redirect back to the Service').toBeLessThan(400);
    });
    await test.step('MF-4: the Service is canceled and the change is in the history', async () => {
      await expectCanceled(sp);
      expect((await sp.statusHistory())[0].title, 'Newest Status history row').toBe(STATUS.canceled);
    });
    await recordTestValues(testInfo, { serviceStatus: STATUS.canceled });
  });

  test(tcTitle(c.cancelNoReason), tcDetails(c.cancelNoReason, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.cancelNoReason);
    await sp.startCancel();
    await sp.confirmCancel();
    await expectCanceled(sp);
    await recordTestValues(testInfo, { cancellationReason: '(none)' });
  });

  test(tcTitle(c.cancelWithReason), tcDetails(c.cancelWithReason, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.cancelWithReason);
    await sp.startCancel();
    await sp.confirmCancel(SHORT_REASON);
    await expectCanceled(sp);
    const [latest] = await sp.statusHistory();
    expect(latest, 'Canceled row carries the reason').toEqual({ title: STATUS.canceled, justification: SHORT_REASON });
    await recordTestValues(testInfo, { cancellationReason: SHORT_REASON });
  });

  // ---------- MF-3 running clocks (62510 Clock Out) ----------
  test.describe('clocks', () => {
    // one clock per user: the tests that start / try a clock run in order on one worker
    test.describe.configure({ mode: 'default' });

    test(tcTitle(c.oneClock), tcDetails(c.oneClock, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
      await seedService(sp, testInfo, c.oneClock);
      await skipIfClockRunning(sp);
      await sp.openWorkItems();
      const workItemId = await test.step('Clock in on the first work item', () => sp.clockInFirstWorkItem());
      expect(await sp.clockRunsOnService(), 'The clock is running before the cancellation').toBe(true);
      await sp.detailsTab.click();
      await sp.cancelService();
      await expectCanceled(sp);
      await test.step('62510 Clock Out closed the running clock', async () => {
        expect(await sp.clockRunsOnService(), 'No clock running on the Service after the cancellation').toBe(false);
        await sp.openWorkItems();
        await expect(sp.clockOutLinks, 'No stop control left on the work items').toHaveCount(0);
        await expect(sp.page.locator(`#pane-workitems a.clock-in[data-clockin-workitemid="${workItemId}"]`), 'The work item can be clocked in again').toHaveCount(1);
      });
      await recordTestValues(testInfo, { workItemId, serviceStatus: STATUS.canceled });
    });

    test(tcTitle(c.continueAnyway), tcDetails(c.continueAnyway, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
      test.setTimeout(240_000);
      await seedService(sp, testInfo, c.continueAnyway);
      await skipIfClockRunning(sp);
      await sp.cancelService();
      await expectCanceled(sp);
      await sp.openWorkItems();
      let clockedInAt = 0;
      try {
        await sp.tryClockInFirstWorkItem();
        clockedInAt = Date.now();
        await sp.clockInBlockedContinue.click();
        await sp.page.waitForResponse(r => r.request().method() === 'POST' && /ClockIn/i.test(r.url()) && /confirmBlockedClockIn/i.test(r.url()), { timeout: 30_000 });
        await sp.page.waitForTimeout(1_500);
        expect(await sp.clockRunsOnService(), 'No clock may start on a canceled Service').toBe(false);
      } finally {
        // never leave a clock running for the signed-in user
        if (await sp.clockRunsOnService().catch(() => false)) await sp.clockOutRunning(clockedInAt);
      }
    });
  });

  test.skip(tcTitle(c.manyClocks), tcDetails(c.manyClocks, MODULE), async () => {
    // the application lets one user run one clock only: several open clocks cannot be created from the UI
  });

  test(tcTitle(c.noClock), tcDetails(c.noClock, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.noClock);
    await sp.openWorkItems();
    await expect(sp.clockOutLinks, 'No clock runs on the work items').toHaveCount(0);
    await sp.detailsTab.click();
    await sp.cancelService();
    await expectCanceled(sp);
    await sp.openWorkItems();
    await expect(sp.clockOutLinks, 'Still no clock after the cancellation').toHaveCount(0);
    expect(await sp.clockRunsOnService(), 'No clock created').toBe(false);
  });

  // ---------- MF-3 history / stage ----------
  test(tcTitle(c.historyRecorded), tcDetails(c.historyRecorded, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.historyRecorded);
    const before = await sp.statusHistory();
    await sp.detailsTab.click();
    await sp.cancelService(SHORT_REASON);
    const after = await sp.statusHistory();
    expect(after.length, 'Exactly one Status history row added').toBe(before.length + 1);
    expect(after[0].title, 'Newest row is Canceled').toBe(STATUS.canceled);
    expect(after.slice(1), 'Earlier rows unchanged').toEqual(before);
    const changes = await sp.auditStatusChanges();
    expect(changes, 'Audit: ServiceStatus Active -> Canceled').toContainEqual(expect.objectContaining({ old: STATUS.active, new: STATUS.canceled }));
  });

  test(tcTitle(c.stageUnchanged), tcDetails(c.stageUnchanged, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.stageUnchanged);
    const stage = await sp.valueText(sp.stage);
    expect(stage, 'Stage set on create').toBe(STAGE);
    const stageRows = await sp.stageHistory();
    await sp.detailsTab.click();
    await sp.cancelService();
    await expectCanceled(sp);
    expect(await sp.valueText(sp.stage), 'ServiceStage unchanged').toBe(stage);
    expect(await sp.stageHistory(), 'No Stage history row added').toEqual(stageRows);
    await recordTestValues(testInfo, { serviceStage: stage, serviceStatus: STATUS.canceled });
  });

  // ---------- already canceled / permission ----------
  test(tcTitle(c.alreadyCanceled), tcDetails(c.alreadyCanceled, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    const id = await seedService(sp, testInfo, c.alreadyCanceled);
    await sp.cancelService(SHORT_REASON);
    await expectCanceled(sp);
    const rows = await sp.statusHistory();
    await sp.detailsTab.click();
    await test.step('Save on the canceled Service does not raise the cancel dialog', async () => {
      await sp.saveButton.click();
      await sp.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await expect(sp.cancelDialog, 'No cancel dialog').toBeHidden();
    });
    await sp.gotoEdit(id);
    await expectCanceled(sp);
    expect(await sp.statusHistory(), 'No second Canceled row').toEqual(rows);
    expect((await sp.statusHistory()).filter(r => r.title === STATUS.canceled), 'One cancellation only').toHaveLength(1);
  });

  test.skip(tcTitle(c.noPermission), tcDetails(c.noPermission, MODULE), async () => {
    // needs a second user without PERM.SERV.Service.Cancel
  });

  // ---------- blocked after cancel ----------
  test(tcTitle(c.clockInBlocked), tcDetails(c.clockInBlocked, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.clockInBlocked);
    await sp.cancelService();
    await expectCanceled(sp);
    await sp.openWorkItems();
    const reasons = await sp.tryClockInFirstWorkItem();
    expect(reasons.join(' | '), 'Dialog names the canceled status').toMatch(MESSAGES.clockBlocked);
    await sp.clockInBlockedCancel.click();
    await expect(sp.clockInBlocked, 'Dialog closed').toBeHidden();
    expect(await sp.clockRunsOnService(), 'No clock started').toBe(false);
    await expect(sp.clockOutLinks, 'No stop control').toHaveCount(0);
  });

  test(tcTitle(c.workItemCreateBlocked), tcDetails(c.workItemCreateBlocked, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.workItemCreateBlocked);
    await sp.cancelService();
    await expectCanceled(sp);
    const before = await sp.workItemStatuses();
    expect(await sp.tryAddWorkItem(), 'Refusal message').toMatch(MESSAGES.addBlocked);
    await sp.gotoEdit(sp.recordIdFromUrl());
    expect(await sp.workItemStatuses(), 'Work items unchanged').toEqual(before);
  });

  test(tcTitle(c.workItemCompleteBlocked), tcDetails(c.workItemCompleteBlocked, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.workItemCompleteBlocked);
    await sp.cancelService();
    await expectCanceled(sp);
    const before = await sp.workItemStatuses();
    expect(await sp.tryChangeWorkItemStatus(before[0].id, 'Completed'), 'Refusal message').toMatch(MESSAGES.statusBlocked);
    await sp.gotoEdit(sp.recordIdFromUrl());
    expect(await sp.workItemStatuses(), 'No work item completed').toEqual(before);
  });

  test(tcTitle(c.automationSuppressed), tcDetails(c.automationSuppressed, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.automationSuppressed);
    const stage = await sp.valueText(sp.stage);
    await sp.cancelService();
    await expectCanceled(sp);
    const stageRows = await sp.stageHistory();
    const items = await sp.workItemStatuses();
    expect(await sp.tryChangeWorkItemStatus(items[0].id, 'Completed'), 'The change that would advance the workflow is refused').toMatch(MESSAGES.statusBlocked);
    await sp.gotoEdit(sp.recordIdFromUrl());
    await expectCanceled(sp);
    expect(await sp.valueText(sp.stage), 'Stage did not advance').toBe(stage);
    expect(await sp.stageHistory(), 'No Stage history row added').toEqual(stageRows);
  });

  // ---------- side effects ----------
  test(tcTitle(c.historyUntouched), tcDetails(c.historyUntouched, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.historyUntouched);
    const items = await sp.workItemStatuses();
    expect(items.length, 'The workflow created work items').toBeGreaterThan(0);
    const statusRows = await sp.statusHistory();
    const stageRows = await sp.stageHistory();
    await sp.detailsTab.click();
    await sp.cancelService(SHORT_REASON);
    await expectCanceled(sp);
    expect(await sp.workItemStatuses(), 'Work items (count, titles, statuses) unchanged').toEqual(items);
    expect((await sp.statusHistory()).slice(1), 'Earlier Status history rows unchanged').toEqual(statusRows);
    expect(await sp.stageHistory(), 'Stage history unchanged').toEqual(stageRows);
  });

  test(tcTitle(c.financialUntouched), tcDetails(c.financialUntouched, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.financialUntouched);
    const money = async () => ({ billingType: await sp.valueText(sp.billingType), estimatedHours: await sp.valueText(sp.estimatedHours) });
    const before = await money();
    expect(before.billingType, 'Billing Type set').not.toBe('');
    await sp.cancelService();
    await expectCanceled(sp);
    expect(await money(), 'Billing Type and Estimated Hours unchanged').toEqual(before);
    await recordTestValues(testInfo, before);
  });

  test(tcTitle(c.reasonOmitted), tcDetails(c.reasonOmitted, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    await seedService(sp, testInfo, c.reasonOmitted);
    await sp.startCancel();
    await expect(sp.cancelReason, 'Reason left empty').toHaveValue('');
    await sp.confirmCancel();
    await expectCanceled(sp);
    expect((await sp.statusHistory())[0], 'Canceled row without a justification').toEqual({ title: STATUS.canceled, justification: NO_REASON });
  });

  test(tcTitle(c.reasonProvided), tcDetails(c.reasonProvided, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    const id = await seedService(sp, testInfo, c.reasonProvided);
    await sp.startCancel();
    await sp.confirmCancel(REASON);
    await expectCanceled(sp);
    expect((await sp.statusHistory())[0], 'Exact reason shown').toEqual({ title: STATUS.canceled, justification: REASON });
    await sp.gotoEdit(id);
    expect((await sp.statusHistory())[0].justification, 'Reason persisted after reload').toBe(REASON);
    await recordTestValues(testInfo, { cancellationReason: REASON });
  });

  // ---------- extra ----------
  test(tcTitle(c.goBack), tcDetails(c.goBack, MODULE), async ({ cancelServicePage: sp }, testInfo) => {
    const id = await seedService(sp, testInfo, c.goBack);
    const before = await sp.statusHistory();
    await sp.detailsTab.click();
    await sp.startCancel();
    await sp.cancelReason.fill(SHORT_REASON);
    await sp.cancelGoBack.click();
    await expect(sp.cancelDialog, 'Dialog closed').toBeHidden();
    await sp.gotoEdit(id);
    expect(await sp.valueText(sp.status), 'Service still Active').toBe(STATUS.active);
    await expect(sp.canceledBanner, 'No canceled banner').toHaveCount(0);
    expect(await sp.statusHistory(), 'No history row added').toEqual(before);
  });
});
