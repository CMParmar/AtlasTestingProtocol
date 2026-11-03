const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { MODULE, SCENARIOS, dayBefore, rateCardCases: c } = require('../testData/rateCardData');
const { num } = require('../pages/ratecard/RateCardPage');
const { tcDetails, tcTitle, recordTestValues, recordUpdated } = require('../utils/testCase');
const { observe, shot, squash, openCard, addRate, linesOn, lineValues, expectScenario } = require('../utils/rateCardFlow');

/**
 * Use case 63150 - View & Edit Rate Card on /RateCard/Edit/{RATE_CARD_ID} (default 1): view (MF-1 to MF-3), update
 * (MF-6), delete (MF-12), references (MF-11), Full Lock + reinstate (BR-2, MF-8), closing the editor (MF-14),
 * archive (MF-9). Adding rates is covered by tests/rate-card-add.spec.js.
 * In the sandbox each rate is saved by the rate editor's Save and deleted after "Delete this Rate?" - there is no
 * card-level Save / Cancel. Tests that edit a rate first add their own line ("Add Rate") in a one-day window far in
 * the future (or far in the past for Full Lock), on a target with no other rate that day, so the card's current
 * pricing is not touched. They run in order in one worker.
 * Every edit is listed with its previous and updated values in
 * reports/excel/rate-card-update/Atlas_RateCardUpdate_<YYYY-MM-DD>.xlsx (Updated Rate Card Lines sheet).
 * TC_RCU_019 archives the card and runs only with RATE_CARD_ALLOW_ARCHIVE=true.
 *
 * Not automated: View-only permission (second user), Partial Lock flows MF-5 / MF-7 and BR-1 / BR-3 / Scen-4 / Scen-5
 * (need time entries or issued billing documents priced from the line), Out of Date Rates MF-15 / Scen-3 / Scen-9
 * (need a bundle version to be unpublished), the RecentReferencesCount / EnableLastRateNotice settings.
 */

test.describe.configure({ mode: 'default' });   // in order, one worker

/** Logs an edit: previous vs updated values of the line. */
const recordChange = (testInfo, tc, card, before, after) => recordUpdated(testInfo, MODULE, tc, before, after, { url: card.url, id: card.id });

/** Opens the Edit command of a saved line (MF-6) and enters `update` (no Save). */
async function openEdit(rc, used, update) {
  const row = await rc.row(used.target, used.effectiveStart);
  expect(await rc.rowAction(row, 'edit'), 'Edit command for an Unlocked line').toBe(true);
  await rc.expectEditor();
  await rc.fillRate(update);
}

/** Edit + Save; the editor must close. */
async function editAndSave(rc, used, update) {
  await openEdit(rc, used, update);
  const { saved } = await rc.saveLine();
  expect(saved, `Edit saved (${(await rc.anyError.isVisible()) ? squash(await rc.anyError.innerText()) : 'the editor stayed open'})`).toBe(true);
}

/** The single line of `target` starting on `start`. */
async function theLine(rc, card, target, start) {
  const found = await linesOn(rc, card, target, start);
  expect(found, `One rate for "${target}" starting ${start}`).toHaveLength(1);
  return found[0];
}

test.describe('Rate Card - View & Edit Rate Card (63150)', () => {
  // ---------- MF-1 view ----------
  test(tcTitle(c.view), tcDetails(c.view, MODULE), async ({ rateCardPage, page }, testInfo) => {
    const card = await openCard(rateCardPage, testInfo, c.view, MODULE);
    const lines = await rateCardPage.linesAsOf();
    await recordTestValues(testInfo, { rateCard: card.name, url: card.url, 'Lines in effect today': lines.length });
    await expect(rateCardPage.title, 'Rate card name').not.toBeEmpty();
    await expect(rateCardPage.gridHost.locator('.rc-lines-grid'), 'Rates grid').toBeVisible();
    await expect(rateCardPage.addRateButton, '"Add Rate" (edit mode)').toBeVisible();
    await test.step('Actions menu', async () => {
      await rateCardPage.actionsButton.click();
      for (const [what, item] of [['Add Rate', rateCardPage.actionAddRate], ['View Unpriced Targets', rateCardPage.actionUnpriced], ['Archive the Rate Card', rateCardPage.actionArchive]]) {
        await expect(item, `Actions -> ${what}`).toBeVisible();
      }
      await page.keyboard.press('Escape');
    });
    await shot(page, testInfo, 'rate-card');
  });

  test(tcTitle(c.lineNumbers), tcDetails(c.lineNumbers, MODULE), async ({ rateCardPage }, testInfo) => {
    await openCard(rateCardPage, testInfo, c.lineNumbers, MODULE);
    const numbers = (await rateCardPage.linesAsOf()).map(l => l.lineNumber);
    test.skip(!numbers.length, 'No Rate Card Line is in effect today');
    await recordTestValues(testInfo, { 'Line Numbers': numbers });
    for (const n of numbers) expect(n, `Line Number "${n}" is a whole number`).toMatch(/^\d+$/);
    const sorted = numbers.map(Number).sort((a, b) => a - b);
    // only the lines in effect today are listed, so the numbers need not run 1..n: they start at 1 or more and never repeat
    expect(sorted[0], 'Line Numbers start at 1 or more').toBeGreaterThanOrEqual(1);
    expect(new Set(sorted).size, 'Line Numbers are unique').toBe(sorted.length);
  });

  test(tcTitle(c.ordering), tcDetails(c.ordering, MODULE), async ({ rateCardPage }, testInfo) => {
    await openCard(rateCardPage, testInfo, c.ordering, MODULE);
    const lines = await rateCardPage.linesAsOf();
    test.skip(lines.length < 2, 'Fewer than two lines in effect today');
    const pairs = lines.map(l => [Number(l.targetTypeId), l.target]);
    await recordTestValues(testInfo, { 'Displayed order': lines.map(l => `${l.targetType} / ${l.target}`) });
    const cmp = (a, b) => (a[0] - b[0]) || a[1].localeCompare(b[1], undefined, { sensitivity: 'base' });
    expect(pairs, 'Ordered by Target Type (Person, Labor Grade, Service Item, Bundle), then Target Name').toEqual([...pairs].sort(cmp));
  });

  // ---------- MF-2 / MF-3 ----------
  test(tcTitle(c.asOfDate), tcDetails(c.asOfDate, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.asOfDate;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addRate(rateCardPage, tc.data);
    await recordTestValues(testInfo, { ...lineValues(card, used), asOf: `${used.effectiveStart}, ${dayBefore(used.effectiveStart)}, today` });
    const shownOn = async date => {
      await test.step(`Rates as of ${date || 'today'}`, () => (date ? rateCardPage.viewAsOf(date) : rateCardPage.reopen(card.url)));
      return (await rateCardPage.lines()).filter(l => l.target === used.target && l.start === used.effectiveStart);
    };
    await Promise.all([
      rateCardPage.page.waitForResponse(r => r.url().includes('/RateCard/LinesGrid'), { timeout: 30_000 }),
      rateCardPage.searchInput.fill(used.target),
    ]);
    expect(await shownOn(used.effectiveStart), `Listed as of ${used.effectiveStart}`).toHaveLength(1);
    expect(await shownOn(dayBefore(used.effectiveStart)), 'Not listed the day before').toHaveLength(0);
    expect(await shownOn(''), 'Not listed as of today').toHaveLength(0);
  });

  test(tcTitle(c.unavailableTargets), tcDetails(c.unavailableTargets, MODULE), async ({ rateCardPage, page }, testInfo) => {
    const tc = c.unavailableTargets;
    await openCard(rateCardPage, testInfo, tc, MODULE);
    await test.step('Actions -> View Unpriced Targets (MF-3)', () => rateCardPage.openUnpriced(tc.data.targetType, tc.data.asOf));
    const names = (await rateCardPage.unavailItems.allInnerTexts()).map(squash);
    await recordTestValues(testInfo, { ...tc.data, 'Unpriced targets': `${names.length}: ${names.slice(0, 5).join(', ')}` });
    expect(names.length, `Unpriced ${tc.data.targetType} targets on ${tc.data.asOf}`).toBeGreaterThan(0);
    await expect(rateCardPage.unavailItems.first().locator('.rc-unavail-add'), 'Each target offers an add-rate command').toBeVisible();
    await shot(page, testInfo, 'unpriced-targets');
  });

  test(tcTitle(c.establishFromUnavailable), tcDetails(c.establishFromUnavailable, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.establishFromUnavailable;
    await openCard(rateCardPage, testInfo, tc, MODULE);
    await rateCardPage.openUnpriced(tc.data.targetType, tc.data.asOf);
    const item = rateCardPage.unavailItems.first();
    const listed = squash(await item.innerText());
    await item.locator('.rc-unavail-add').click();
    await rateCardPage.expectEditor();
    const shownValues = {
      targetType: await rateCardPage.value('targetType'), target: await rateCardPage.value('target'),
      effectiveStart: await rateCardPage.value('effectiveStart'), effectiveEnd: await rateCardPage.value('effectiveEnd'),
    };
    await recordTestValues(testInfo, { 'Unpriced target': listed, ...shownValues });
    expect(shownValues.targetType, 'Target Type passed').toBe(tc.data.targetType);
    expect(shownValues.target, 'Target passed').not.toBe('');
    expect(listed, 'The target chosen is the one listed').toContain(shownValues.target);
    expect(shownValues.effectiveStart, 'Start date passed').toBe(tc.data.asOf);
    expect(shownValues.effectiveEnd, 'End date empty').toBe('');
    await rateCardPage.closeDrawer();
  });

  // ---------- MF-6 update unlocked ----------
  for (const tc of [c.updateRate, c.updateEndDate, c.updatePeriod, c.updateServiceItem]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ rateCardPage }, testInfo) => {
      const card = await openCard(rateCardPage, testInfo, tc, MODULE);
      const used = await addRate(rateCardPage, tc.data);
      await recordTestValues(testInfo, { target: used.target, ...tc.update });
      await test.step('Edit the Unlocked line (MF-6) and Save', () => editAndSave(rateCardPage, used, tc.update));
      const after = { ...used, ...tc.update };
      await recordChange(testInfo, tc, card, lineValues(card, used), lineValues(card, after));
      const line = await theLine(rateCardPage, card, used.target, after.effectiveStart);
      expect(num(line.rate), `Rate (shown "${line.rateDisplay}")`).toBe(num(after.rate));
      expect(line.end, 'Effective end date').toBe(after.effectiveEnd);
      if (after.effectiveStart !== used.effectiveStart) {
        expect(await linesOn(rateCardPage, card, used.target, used.effectiveStart), 'No line left on the old start date').toHaveLength(0);
      }
    });
  }

  // ---------- MF-12 delete ----------
  test(tcTitle(c.deleteRate), tcDetails(c.deleteRate, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.deleteRate;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addRate(rateCardPage, tc.data);
    await recordTestValues(testInfo, { ...lineValues(card, used), action: 'Delete Rate, Yes' });
    const text = await test.step('Delete Rate, Yes', async () => rateCardPage.deleteLine(await rateCardPage.row(used.target, used.effectiveStart), true));
    observe(testInfo, `Confirmation: "${text}"`);
    expect(text, '"Delete this Rate?" names the target').toContain(used.target);
    if (await rateCardPage.scenario(SCENARIOS.noRateRemains.title).isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rateCardPage.answer(SCENARIOS.noRateRemains.title, 'Got it');
    }
    await recordChange(testInfo, tc, card, lineValues(card, used, 'In effect'), lineValues(card, used, 'Deleted'));
    expect(await linesOn(rateCardPage, card, used.target, used.effectiveStart), 'Deleted line no longer listed').toHaveLength(0);
  });

  test(tcTitle(c.lastRateNotice), tcDetails(c.lastRateNotice, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.lastRateNotice;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addRate(rateCardPage, tc.data);
    await recordTestValues(testInfo, { ...lineValues(card, used), action: 'Delete the only current line' });
    await rateCardPage.deleteLine(await rateCardPage.row(used.target, used.effectiveStart), true);
    await recordChange(testInfo, tc, card, lineValues(card, used, 'In effect'), lineValues(card, used, 'Deleted'));
    const notice = rateCardPage.scenario(SCENARIOS.noRateRemains.title);
    const shown = await notice.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!shown, `"${used.target}" still has other current rates on this card, so no notice is due`);
    observe(testInfo, `Shown: "${squash(await notice.innerText())}"`);
    await expect(notice, 'Names the target').toContainText(used.target);
    await expect(notice).toContainText(SCENARIOS.noRateRemains.message);
    for (const caption of SCENARIOS.noRateRemains.buttons) await expect(notice.getByRole('button', { name: caption })).toBeVisible();
    await rateCardPage.answer(SCENARIOS.noRateRemains.title, 'Got it');
  });

  // ---------- MF-11 references ----------
  test(tcTitle(c.references), tcDetails(c.references, MODULE), async ({ rateCardPage, page }, testInfo) => {
    const tc = c.references;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addRate(rateCardPage, tc.data);
    await recordTestValues(testInfo, { ...lineValues(card, used), action: 'References' });
    const row = await rateCardPage.row(used.target, used.effectiveStart);
    const commands = await rateCardPage.rowCommands(row);
    test.skip(!(await row.locator('.rc-mnu-refs').count()) && !commands.some(x => /Reference/i.test(x)),
      `The line offers no References command (${commands.join(', ')}) - the sandbox shows it only for referenced lines`);
    expect(await rateCardPage.rowAction(row, 'references'), 'References command').toBe(true);
    await expect(rateCardPage.drawer, 'References panel').toBeVisible();
    await expect(rateCardPage.drawer, 'Total of 0 Dependent References').toContainText(/(total|references?)\D{0,20}\b0\b|no (dependent )?references/i);
    observe(testInfo, `Shown: "${squash(await rateCardPage.drawer.innerText()).slice(0, 200)}"`);
    await shot(page, testInfo, 'references');
  });

  // ---------- BR-2 / MF-8 ----------
  test(tcTitle(c.fullLock), tcDetails(c.fullLock, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.fullLock;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addRate(rateCardPage, tc.data);
    const line = await theLine(rateCardPage, card, used.target, used.effectiveStart);
    const commands = await rateCardPage.rowCommands(await rateCardPage.row(used.target, used.effectiveStart));
    await recordTestValues(testInfo, { ...lineValues(card, used), 'Lock State': line.lock, Commands: commands.join(', ') || '(none)' });
    observe(testInfo, `Lock State "${line.lock}"; commands: ${commands.join(', ') || '(none)'}`);
    expect(line.lock, 'Lock State').toMatch(/full/i);
    expect(commands.filter(x => /^(Edit|Delete Rate)$/i.test(x)), 'DEFECT: a Full Lock line can be edited or deleted (BR-2)').toEqual([]);
    expect.soft(commands.some(x => /Reinstate/i.test(x)), 'Reinstate offered (MF-8)').toBe(true);
  });

  test(tcTitle(c.reinstate), tcDetails(c.reinstate, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.reinstate;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addRate(rateCardPage, tc.data);
    await recordTestValues(testInfo, { target: used.target, 'Full Lock line': `${used.effectiveStart} @ ${used.rate}`, ...tc.update });
    await test.step('Reinstate the Full Lock line (MF-8) and Save', async () => {
      const row = await rateCardPage.row(used.target, used.effectiveStart);
      expect(await rateCardPage.rowAction(row, 'reinstate'), 'Reinstate command').toBe(true);
      await rateCardPage.expectEditor();
      await rateCardPage.fillRate(tc.update);
      const { saved } = await rateCardPage.saveLine();
      expect(saved, 'Reinstated rate saved').toBe(true);
    });
    const reinstated = { ...used, ...tc.update };
    await recordChange(testInfo, tc, card, lineValues(card, used, 'Full Lock'), lineValues(card, reinstated, 'Reinstated'));
    const line = await theLine(rateCardPage, card, used.target, tc.update.effectiveStart);
    expect(num(line.rate), 'New Rate').toBe(num(tc.update.rate));
    const old = await theLine(rateCardPage, card, used.target, used.effectiveStart);
    expect(num(old.rate), 'Full Lock line unchanged').toBe(num(used.rate));
  });

  // ---------- MF-14 leaving the editor ----------
  test(tcTitle(c.cancelConfirm), tcDetails(c.cancelConfirm, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.cancelConfirm;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addRate(rateCardPage, tc.data);
    await recordTestValues(testInfo, { target: used.target, ...tc.update, action: 'Close the editor without Save' });
    await openEdit(rateCardPage, used, tc.update);
    const warning = await test.step('Close the editor (X), continue without saving', () => rateCardPage.closeDrawer(true));
    observe(testInfo, `Warning: "${warning || '(none)'}"`);
    await expect(rateCardPage.drawer, 'Editor closed').toBeHidden();
    const line = await theLine(rateCardPage, card, used.target, used.effectiveStart);
    expect(num(line.rate), 'Rate as last saved').toBe(num(used.rate));
  });

  test(tcTitle(c.cancelDismiss), tcDetails(c.cancelDismiss, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.cancelDismiss;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addRate(rateCardPage, tc.data);
    await recordTestValues(testInfo, { target: used.target, ...tc.update, action: 'X, Cancel on the warning, Save' });
    await openEdit(rateCardPage, used, tc.update);
    const warning = await test.step('Close the editor (X), answer the warning with Cancel', () => rateCardPage.closeDrawer(false));
    test.skip(!warning, 'The rate editor closes without an unsaved-changes warning');
    observe(testInfo, `Warning: "${warning}"`);
    await expect(await rateCardPage.field('rate'), 'Entered Rate kept').toHaveValue(tc.update.rate);
    const { saved } = await rateCardPage.saveLine();
    expect(saved, 'Edit saved').toBe(true);
    await recordChange(testInfo, tc, card, lineValues(card, used), lineValues(card, { ...used, ...tc.update }));
    const line = await theLine(rateCardPage, card, used.target, used.effectiveStart);
    expect(num(line.rate), 'Kept edit saved').toBe(num(tc.update.rate));
  });

  // ---------- MF-9 archive ----------
  test(tcTitle(c.archiveNotice), tcDetails(c.archiveNotice, MODULE), async ({ rateCardPage, page }, testInfo) => {
    const card = await openCard(rateCardPage, testInfo, c.archiveNotice, MODULE);
    await recordTestValues(testInfo, { rateCard: card.name, action: 'Archive the Rate Card, Go Back' });
    const text = await test.step('Actions -> Archive the Rate Card, Go Back', async () => {
      await rateCardPage.actionsButton.click();
      await rateCardPage.actionArchive.click();
      await expect(rateCardPage.scenarioModal, 'Archive confirmation').toBeVisible();
      await shot(page, testInfo, 'archive-confirmation');
      const shown = squash(await rateCardPage.scenarioModal.innerText());
      await expect(rateCardPage.scenarioPrimary, 'Yes').toHaveText(/Yes/);
      await expect(rateCardPage.scenarioSecondary, 'Go Back').toHaveText(/Go Back/);
      await rateCardPage.scenarioSecondary.click();
      await expect(rateCardPage.scenarioModal).toBeHidden();
      return shown;
    });
    observe(testInfo, `Shown: "${text}"`);
    expect(text, 'Names the rate card').toContain(card.name);
    expect(text).toContain(SCENARIOS.archived.message);
    await rateCardPage.reopen(card.url);
    await rateCardPage.actionsButton.click();
    await expect(rateCardPage.actionArchive, 'Still active: Archive is still offered').toBeVisible();
  });

  test(tcTitle(c.archiveSave), tcDetails(c.archiveSave, MODULE), async ({ rateCardPage }, testInfo) => {
    test.skip(!env.rateCardAllowArchive, 'Archives the rate card permanently - set RATE_CARD_ALLOW_ARCHIVE=true (and RATE_CARD_ID of a throw-away card) to run it');
    const tc = c.archiveSave;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const linesBefore = (await rateCardPage.linesAsOf()).length;
    await recordTestValues(testInfo, { rateCard: card.name, action: 'Archive the Rate Card, Yes' });
    await rateCardPage.archive(true);
    await recordChange(testInfo, tc, card, { rateCard: card.name, lineStatus: 'Active card' }, { rateCard: card.name, lineStatus: 'Archived card' });
    await rateCardPage.reopen(card.url);
    await expect.poll(async () => (await rateCardPage.archivedBadge.count()) > 0 || (await rateCardPage.actionArchive.count()) === 0,
      { message: 'Card shows as archived (or no longer offers Archive)' }).toBe(true);
    expect((await rateCardPage.linesAsOf()).length, 'Rate Card Lines unchanged').toBe(linesBefore);
  });

  // ---------- AF-1 on edit ----------
  for (const tc of [c.editNegativeRate, c.editEndBeforeStart, c.editOverlap]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ rateCardPage }, testInfo) => {
      const card = await openCard(rateCardPage, testInfo, tc, MODULE);
      const used = await addRate(rateCardPage, tc.data);
      // the overlap case moves a second line of the same target onto the first one
      const edited = tc.second
        ? await addRate(rateCardPage, { targetType: used.targetType, target: used.target, billingType: used.billingType, unitOfMeasure: used.unitOfMeasure, ...tc.second })
        : used;
      await recordTestValues(testInfo, { target: edited.target, 'Saved line': `${edited.effectiveStart} @ ${edited.rate}`, ...tc.update });
      await openEdit(rateCardPage, edited, tc.update);
      const { saved } = await test.step('Save the invalid edit', () => rateCardPage.saveLine());
      expect(saved, 'DEFECT: the invalid edit was saved').toBe(false);
      await expectScenario(rateCardPage, SCENARIOS[tc.scenario], testInfo);
      await rateCardPage.closeDrawer(true);
      const line = await theLine(rateCardPage, card, edited.target, edited.effectiveStart);
      expect(num(line.rate), 'Rate unchanged').toBe(num(edited.rate));
      expect(line.end, 'End date unchanged').toBe(edited.effectiveEnd);
    });
  }
});
