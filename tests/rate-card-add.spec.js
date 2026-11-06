const { test, expect } = require('../fixtures/fixtures');
const { MODULE, rateCardAddCases: c } = require('../testData/rateCardAddData');
const { TARGET_TYPES, ALLOWED_BILLING_TYPES, EXCLUDED_BILLING_TYPES, SCENARIOS } = require('../testData/rateCardData');
const { num } = require('../pages/ratecard/RateCardPage');
const { recordTestValues, recordCreated, tcDetails, tcTitle } = require('../utils/testCase');
const {
  observe, shot, squash, openCard, dated, busyTargets, fillNewRate, addRate, linesOn, expectOnRatesTab, lineValues,
  expectScenario, months,
} = require('../utils/rateCardFlow');

/**
 * Use case 63150 - View & Edit Rate Card, MF-4 Establish a New Rate: "Add Rate" on /RateCard/Edit/{RATE_CARD_ID}
 * (default 1), for every Target Type (Person, Labor Grade, Service Item, Bundle) and billing type.
 * The rate editor's Save stores each rate at once (/RateCard/SaveLine). Tests run in order in one worker. Rates are
 * added for today (the card's default "Rates as of" date), each on a target with no other rate that day, so every
 * added rate is shown on the Rates tab as a user opens it and none overlaps an existing open-ended rate.
 * Every rate added is listed with its values and the rate card URL in
 * reports/excel/rate-card-add/Atlas_RateCardAdd_<YYYY-MM-DD>.xlsx (Created Rate Card Lines sheet).
 * Not automated: archived / disabled targets (BR-15, BR-19 - the Target list only offers available ones).
 */

test.describe.configure({ mode: 'default' });   // in order, one worker

/** Adds a rate (Add Rate, fill, Save) for the test's data with dates resolved against today; logs the new line. */
async function addAndSave(rc, testInfo, tc, card, data = dated(tc.data, card.today)) {
  const used = await addRate(rc, data);
  await recordTestValues(testInfo, lineValues(card, used));
  await recordCreated(testInfo, MODULE, tc, lineValues(card, used), card);
  return used;
}

/**
 * The saved rate is stored with the expected Rate, billing type and end date (full rates list as of its start date)
 * and - when in effect today - shown on the Rates tab as the user opens it. Returns the line.
 */
async function expectListed(rc, testInfo, card, used, rate = used.rate) {
  const found = await test.step(`Rates as of ${used.effectiveStart}`, () => linesOn(rc, card, used.target, used.effectiveStart));
  expect(found, `"${used.target}" listed as of ${used.effectiveStart}`).toHaveLength(1);
  expect(num(found[0].rate), `Rate (shown "${found[0].rateDisplay}")`).toBe(num(rate));
  if (used.billingType) expect(found[0].billingType, 'Billing Type').toContain(used.billingType);
  if (used.effectiveEnd) expect(found[0].end, 'Effective end date').toBe(used.effectiveEnd);
  if (used.effectiveStart <= card.today && (!used.effectiveEnd || used.effectiveEnd >= card.today)) {
    await test.step(`Shown on the Rates tab (Rates as of ${card.today})`, () => expectOnRatesTab(rc, card, { ...used, rate }));
  }
  observe(testInfo, `Listed: line ${found[0].lineNumber} - ${found[0].text}`);
  return found[0];
}

/**
 * Add Rate with a given billing type: looks through the Target Types (or the one given) and their first five free
 * targets for one that offers it. For Subscription also picks an Interval and a Term divisible by it.
 * Returns the values used (editor still open), or null when no target offers the billing type.
 */
async function fillWithBillingType(rc, data) {
  const avoid = await busyTargets(rc, data.effectiveStart, data.effectiveEnd);
  await rc.openAddRate();
  const types = data.targetType ? [data.targetType] : await rc.options('targetType');
  for (const type of types) {
    await rc.choose('targetType', type);
    const free = (await rc.options('target')).filter(t => !avoid.includes(t)).slice(0, 5);
    for (const target of free) {
      await rc.choose('target', target);
      const billing = (await rc.options('billingType')).find(b => b.toLowerCase().includes(data.billingType.toLowerCase()));
      if (!billing) continue;
      const used = { targetType: type, target, billingType: await rc.choose('billingType', billing) };
      if (/Subscription/i.test(billing)) {
        const intervals = await rc.options('subscriptionInterval');
        const terms = await rc.options('subscriptionTerm');
        let pair;
        for (const iv of intervals) for (const t of terms) if (!pair && months(iv) && months(t) && months(t) % months(iv) === 0) pair = [iv, t];
        if (!pair) continue;
        used.subscriptionInterval = await rc.choose('subscriptionInterval', pair[0]);
        used.subscriptionTerm = await rc.choose('subscriptionTerm', pair[1]);
      }
      used.unitOfMeasure = await rc.choose('unitOfMeasure');
      for (const key of ['rate', 'effectiveStart', 'effectiveEnd']) {
        await rc.setValue(key, data[key]);
        used[key] = data[key];
      }
      return used;
    }
  }
  return null;
}

/** Save is refused by the editor: nothing posted (or posted and rejected), a field error shown, the editor still open. */
async function expectNotSaved(rc, testInfo) {
  const { saved } = await test.step('Click Save', () => rc.saveLine());
  expect(saved, 'DEFECT: the incomplete rate was saved').toBe(false);
  await expect(rc.anyError, 'Validation message').toBeVisible();
  observe(testInfo, `Shown: "${squash(await rc.anyError.innerText())}"`);
  await expect(rc.editorForm, 'Editor stays open for correction').toBeVisible();
}

test.describe('Rate Card - Add Rate (63150 MF-4)', () => {
  // ---------- the rate editor ----------
  test(tcTitle(c.addRateButton), tcDetails(c.addRateButton, MODULE), async ({ rateCardPage, page }, testInfo) => {
    const card = await openCard(rateCardPage, testInfo, c.addRateButton, MODULE);
    await recordTestValues(testInfo, { rateCard: card.name, url: card.url, action: '"Add Rate" button, then Actions -> Add Rate' });
    await test.step('Click "Add Rate"', () => rateCardPage.openAddRate());
    await expect(await rateCardPage.field('targetType'), 'Target Type field').toBeVisible();
    await shot(page, testInfo, 'rate-editor');
    await rateCardPage.closeDrawer();
    await test.step('Actions -> Add Rate', () => rateCardPage.openAddRate({ viaActions: true }));
  });

  test(tcTitle(c.fields), tcDetails(c.fields, MODULE), async ({ rateCardPage }, testInfo) => {
    await openCard(rateCardPage, testInfo, c.fields, MODULE);
    await rateCardPage.openAddRate();
    const names = ['targetType', 'target', 'billingType', 'unitOfMeasure', 'rate', 'effectiveStart', 'effectiveEnd'];
    await recordTestValues(testInfo, { 'Fields checked': names.join(', ') });
    for (const name of names) await expect(await rateCardPage.field(name), `${name} field`).toBeVisible();
    expect(await rateCardPage.value('effectiveEnd'), 'Effective End Date defaults to empty').toBe('');
  });

  test(tcTitle(c.targetTypes), tcDetails(c.targetTypes, MODULE), async ({ rateCardPage }, testInfo) => {
    await openCard(rateCardPage, testInfo, c.targetTypes, MODULE);
    await rateCardPage.openAddRate();
    const options = await rateCardPage.options('targetType');
    await recordTestValues(testInfo, { 'Target Types offered': options });
    expect([...options].sort(), 'Target Types').toEqual([...TARGET_TYPES].sort());
  });

  test(tcTitle(c.targetsByType), tcDetails(c.targetsByType, MODULE), async ({ rateCardPage }, testInfo) => {
    await openCard(rateCardPage, testInfo, c.targetsByType, MODULE);
    await rateCardPage.openAddRate();
    const byType = {};
    for (const type of await rateCardPage.options('targetType')) {
      await rateCardPage.choose('targetType', type);
      byType[type] = await rateCardPage.options('target');
    }
    await recordTestValues(testInfo, Object.fromEntries(Object.entries(byType).map(([k, v]) => [`${k} targets`, `${v.length}: ${v.slice(0, 5).join(', ')}`])));
    const filled = Object.entries(byType).filter(([, v]) => v.length);
    expect(filled.length, 'At least two Target Types offer targets').toBeGreaterThan(1);
    for (const [a, listA] of filled) {
      for (const [b, listB] of filled) {
        if (a < b) expect(JSON.stringify(listA) === JSON.stringify(listB), `${a} and ${b} offer the same Target list`).toBe(false);
      }
    }
  });

  test(tcTitle(c.billingTypes), tcDetails(c.billingTypes, MODULE), async ({ rateCardPage }, testInfo) => {
    await openCard(rateCardPage, testInfo, c.billingTypes, MODULE);
    await rateCardPage.openAddRate();
    const offered = {};
    for (const type of await rateCardPage.options('targetType')) {
      await rateCardPage.choose('targetType', type);
      if (!(await rateCardPage.choose('target'))) continue;
      offered[type] = await rateCardPage.options('billingType');
    }
    await recordTestValues(testInfo, Object.fromEntries(Object.entries(offered).map(([k, v]) => [`${k} billing types`, v.join(', ') || '(none)'])));
    expect(Object.keys(offered).length, 'At least one Target Type with an available target').toBeGreaterThan(0);
    for (const [type, list] of Object.entries(offered)) {
      for (const bt of list) {
        expect(EXCLUDED_BILLING_TYPES.some(x => bt.toLowerCase().includes(x.toLowerCase())), `DEFECT: ${type} offers "${bt}" (BR-12)`).toBe(false);
        expect(ALLOWED_BILLING_TYPES.some(x => bt.toLowerCase().includes(x.toLowerCase().split(' ')[0])), `${type}: "${bt}" is an allowed billing type`).toBe(true);
      }
    }
  });

  test(tcTitle(c.subscriptionFields), tcDetails(c.subscriptionFields, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.subscriptionFields;
    await openCard(rateCardPage, testInfo, tc, MODULE);
    await rateCardPage.openAddRate();
    await rateCardPage.choose('targetType', tc.data.targetType);
    let other;
    for (const target of (await rateCardPage.options('target')).slice(0, 5)) {
      await rateCardPage.choose('target', target);
      const billing = await rateCardPage.options('billingType');
      other = billing.some(b => /Subscription/i.test(b)) && billing.find(b => !/Subscription/i.test(b));
      if (other) break;
    }
    test.skip(!other, 'No service item offers Subscription and another billing type');
    await recordTestValues(testInfo, { targetType: tc.data.targetType, target: await rateCardPage.value('target'), billingType: `Subscription, then ${other}` });
    await rateCardPage.choose('billingType', 'Subscription');
    await expect(await rateCardPage.field('subscriptionTerm'), 'Subscription Term shown for Subscription').toBeVisible();
    await expect(await rateCardPage.field('subscriptionInterval'), 'Subscription Interval shown for Subscription').toBeVisible();
    await rateCardPage.choose('billingType', other);
    await expect(await rateCardPage.field('subscriptionTerm'), `Subscription Term hidden for ${other}`).toBeHidden();
    await expect(await rateCardPage.field('subscriptionInterval'), `Subscription Interval hidden for ${other}`).toBeHidden();
  });

  test(tcTitle(c.clearTarget), tcDetails(c.clearTarget, MODULE), async ({ rateCardPage }, testInfo) => {
    await openCard(rateCardPage, testInfo, c.clearTarget, MODULE);
    await rateCardPage.openAddRate();
    await rateCardPage.choose('targetType', 'Labor Grade');
    const target = await rateCardPage.choose('target');
    test.skip(!target, 'No available Labor Grade');
    await rateCardPage.choose('targetType', 'Service Item');
    const after = await rateCardPage.value('target');
    await recordTestValues(testInfo, { 'Target before': target, 'Target Type changed to': 'Service Item', 'Target after': after || '(empty)' });
    expect(after, 'DEFECT: the Labor Grade target was kept after changing the Target Type').not.toBe(target);
  });

  test(tcTitle(c.clearUnit), tcDetails(c.clearUnit, MODULE), async ({ rateCardPage }, testInfo) => {
    await openCard(rateCardPage, testInfo, c.clearUnit, MODULE);
    await rateCardPage.openAddRate();
    let found;
    for (const type of await rateCardPage.options('targetType')) {
      await rateCardPage.choose('targetType', type);
      if (!(await rateCardPage.choose('target'))) continue;
      const units = {};
      for (const bt of await rateCardPage.options('billingType')) {
        await rateCardPage.choose('billingType', bt);
        units[bt] = await rateCardPage.options('unitOfMeasure');
      }
      for (const [b1, u1] of Object.entries(units)) {
        for (const [b2, u2] of Object.entries(units)) {
          const unit = u1.find(u => !u2.includes(u));
          if (!found && b1 !== b2 && unit) found = { type, b1, b2, unit };
        }
      }
      if (found) break;
    }
    test.skip(!found, 'Every billing type allows the same units - nothing to clear');
    await rateCardPage.choose('targetType', found.type);
    await rateCardPage.choose('target');
    await rateCardPage.choose('billingType', found.b1);
    await rateCardPage.choose('unitOfMeasure', found.unit);
    await rateCardPage.choose('billingType', found.b2);
    const after = await rateCardPage.value('unitOfMeasure');
    await recordTestValues(testInfo, { targetType: found.type, 'Billing Type': `${found.b1} -> ${found.b2}`, 'Unit before': found.unit, 'Unit after': after || '(empty)' });
    expect(after, `DEFECT: "${found.unit}" kept although ${found.b2} does not allow it (BR-18)`).not.toBe(found.unit);
  });

  // ---------- one rate per Target Type ----------
  for (const tc of [c.laborGrade, c.person, c.serviceItem, c.bundle, c.secondLaborGrade]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ rateCardPage, page }, testInfo) => {
      const card = await openCard(rateCardPage, testInfo, tc, MODULE);
      const used = await addAndSave(rateCardPage, testInfo, tc, card);
      await expectListed(rateCardPage, testInfo, card, used);
      await shot(page, testInfo, 'saved-rate');
    });
  }

  // ---------- one rate per billing type ----------
  for (const tc of [c.fixedPrice, c.fee, c.timeMaterial, c.subscription]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ rateCardPage }, testInfo) => {
      const card = await openCard(rateCardPage, testInfo, tc, MODULE);
      const used = await test.step(`Add Rate with Billing Type ${tc.data.billingType}`, () => fillWithBillingType(rateCardPage, dated(tc.data, card.today)));
      test.skip(!used, `No free ${tc.data.targetType || ''} target offers ${tc.data.billingType}`);
      await recordTestValues(testInfo, lineValues(card, used));
      const { saved } = await rateCardPage.saveLine();
      expect(saved, `Rate saved (${(await rateCardPage.anyError.isVisible()) ? squash(await rateCardPage.anyError.innerText()) : 'editor stayed open'})`).toBe(true);
      await recordCreated(testInfo, MODULE, tc, lineValues(card, used), card);
      await expectListed(rateCardPage, testInfo, card, used);
    });
  }

  // ---------- rate values and dates ----------
  for (const tc of [c.zeroRate, c.decimalRate, c.largeRate, c.backdated]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ rateCardPage }, testInfo) => {
      const card = await openCard(rateCardPage, testInfo, tc, MODULE);
      const used = await addAndSave(rateCardPage, testInfo, tc, card);
      await expectListed(rateCardPage, testInfo, card, used);
    });
  }

  test(tcTitle(c.multiDay), tcDetails(c.multiDay, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.multiDay;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addAndSave(rateCardPage, testInfo, tc, card);
    await expectListed(rateCardPage, testInfo, card, used);
    const onLastDay = (await rateCardPage.linesAsOf(used.effectiveEnd)).filter(l => l.target === used.target && l.start === used.effectiveStart);
    expect(onLastDay, `In effect on its last day ${used.effectiveEnd}`).toHaveLength(1);
  });

  // ---------- saving ----------
  test(tcTitle(c.twoInOneSave), tcDetails(c.twoInOneSave, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.twoInOneSave;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const first = await addRate(rateCardPage, dated(tc.data, card.today));
    const second = await addRate(rateCardPage, dated(tc.second, card.today));
    await recordTestValues(testInfo, { 'First rate': `${first.target} ${first.rate}`, 'Second rate': `${second.target} ${second.rate}`, effectiveStart: first.effectiveStart });
    await recordCreated(testInfo, MODULE, tc, lineValues(card, first), card);
    await recordCreated(testInfo, MODULE, tc, lineValues(card, second), card);
    await expectListed(rateCardPage, testInfo, card, first);
    await expectListed(rateCardPage, testInfo, card, second);
  });

  test(tcTitle(c.notSavedUntilSave), tcDetails(c.notSavedUntilSave, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.notSavedUntilSave;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await fillNewRate(rateCardPage, dated(tc.data, card.today));
    await recordTestValues(testInfo, { ...lineValues(card, used), action: 'Fill, then re-open the card without Save' });
    await rateCardPage.reopen(card.url);
    expect(await linesOn(rateCardPage, card, used.target, used.effectiveStart), 'DEFECT: the rate was saved without Save').toHaveLength(0);
  });

  test(tcTitle(c.cancelDiscards), tcDetails(c.cancelDiscards, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.cancelDiscards;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await fillNewRate(rateCardPage, dated(tc.data, card.today));
    await recordTestValues(testInfo, { ...lineValues(card, used), action: 'Close the editor (X)' });
    const warning = await test.step('Close the editor without saving', () => rateCardPage.closeDrawer(true));
    observe(testInfo, `Warning: "${warning || '(none)'}"`);
    await expect(rateCardPage.drawer, 'Editor closed').toBeHidden();
    expect(await linesOn(rateCardPage, card, used.target, used.effectiveStart), 'New rate discarded').toHaveLength(0);
  });

  test(tcTitle(c.lineNumber), tcDetails(c.lineNumber, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.lineNumber;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const used = await addAndSave(rateCardPage, testInfo, tc, card);
    const shown = await expectListed(rateCardPage, testInfo, card, used);
    expect(shown.lineNumber, `Line Number "${shown.lineNumber}"`).toMatch(/^\d+$/);
  });

  // ---------- AF-1 negative ----------
  for (const tc of [c.negativeRate, c.endBeforeStart]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ rateCardPage }, testInfo) => {
      const card = await openCard(rateCardPage, testInfo, tc, MODULE);
      const used = await fillNewRate(rateCardPage, dated(tc.data, card.today));
      await recordTestValues(testInfo, lineValues(card, used));
      const { saved } = await test.step('Click Save', () => rateCardPage.saveLine());
      expect(saved, 'DEFECT: the invalid rate was saved').toBe(false);
      await expectScenario(rateCardPage, SCENARIOS[tc.scenario], testInfo);
      await expect(await rateCardPage.field('rate'), 'Entries kept for correction').toHaveValue(tc.data.rate);
      expect(await linesOn(rateCardPage, card, used.target, used.effectiveStart), 'Nothing saved').toHaveLength(0);
    });
  }

  test(tcTitle(c.overlap), tcDetails(c.overlap, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.overlap;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const first = await addRate(rateCardPage, dated(tc.data, card.today));
    await recordCreated(testInfo, MODULE, tc, lineValues(card, first), card);
    await expectListed(rateCardPage, testInfo, card, first);
    const second = { targetType: first.targetType, target: first.target, billingType: first.billingType, unitOfMeasure: first.unitOfMeasure, ...dated(tc.second, card.today) };
    await recordTestValues(testInfo, { target: first.target, billingType: first.billingType, unitOfMeasure: first.unitOfMeasure,
      'Existing rate': `${first.effectiveStart} to ${first.effectiveEnd}`, 'New rate': `${second.effectiveStart} to ${second.effectiveEnd}` });
    await rateCardPage.openAddRate();
    await rateCardPage.fillRate(second);
    const { saved } = await test.step('Save the overlapping rate', () => rateCardPage.saveLine());
    expect(saved, 'DEFECT: the overlapping rate was saved (BR-4)').toBe(false);
    await expectScenario(rateCardPage, SCENARIOS.duplicate, testInfo);
    const kept = await linesOn(rateCardPage, card, first.target, second.effectiveStart);
    expect(kept.map(l => num(l.rate)), 'Only the first rate is kept (overlapping rate not saved)').toEqual([num(first.rate)]);
  });

  test(tcTitle(c.termInterval), tcDetails(c.termInterval, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.termInterval;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const data = dated(tc.data, card.today);
    const avoid = await busyTargets(rateCardPage, data.effectiveStart, data.effectiveEnd);
    await rateCardPage.openAddRate();
    await rateCardPage.choose('targetType', data.targetType);
    let pair;
    let target;
    for (const t of (await rateCardPage.options('target')).filter(x => !avoid.includes(x)).slice(0, 5)) {
      await rateCardPage.choose('target', t);
      if (!(await rateCardPage.options('billingType')).some(b => /Subscription/i.test(b))) continue;
      await rateCardPage.choose('billingType', 'Subscription');
      const intervals = await rateCardPage.options('subscriptionInterval');
      const terms = await rateCardPage.options('subscriptionTerm');
      for (const iv of intervals) for (const tm of terms) if (!pair && months(iv) && months(tm) && months(tm) % months(iv)) pair = [iv, tm];
      if (pair) { target = t; break; }
    }
    test.skip(!pair, 'No service item offers Subscription with a term that is not a multiple of an interval');
    await rateCardPage.choose('subscriptionInterval', pair[0]);
    await rateCardPage.choose('subscriptionTerm', pair[1]);
    await rateCardPage.choose('unitOfMeasure');
    for (const key of ['rate', 'effectiveStart', 'effectiveEnd']) await rateCardPage.setValue(key, data[key]);
    await recordTestValues(testInfo, { target, billingType: 'Subscription', subscriptionInterval: pair[0], subscriptionTerm: pair[1], rate: data.rate });
    const { saved } = await rateCardPage.saveLine();
    expect(saved, 'DEFECT: the rate was saved although the term does not divide by the interval (BR-13)').toBe(false);
    await expectScenario(rateCardPage, SCENARIOS.termInterval, testInfo);
    expect(await linesOn(rateCardPage, card, target, data.effectiveStart), 'Nothing saved').toHaveLength(0);
  });

  test(tcTitle(c.missingTarget), tcDetails(c.missingTarget, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.missingTarget;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const data = dated(tc.data, card.today);
    await rateCardPage.openAddRate();
    await rateCardPage.choose('targetType', data.targetType);
    for (const key of ['rate', 'effectiveStart', 'effectiveEnd']) await rateCardPage.setValue(key, data[key]);
    await recordTestValues(testInfo, { targetType: data.targetType, target: '(empty)', rate: data.rate, effectiveStart: data.effectiveStart });
    await expectNotSaved(rateCardPage, testInfo);
  });

  for (const tc of [c.missingRate, c.missingStart]) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ rateCardPage }, testInfo) => {
      const card = await openCard(rateCardPage, testInfo, tc, MODULE);
      const used = await fillNewRate(rateCardPage, dated(tc.data, card.today));
      await recordTestValues(testInfo, Object.fromEntries(Object.entries(used).map(([k, v]) => [k, v === '' ? '(empty)' : v])));
      await expectNotSaved(rateCardPage, testInfo);
    });
  }

  test(tcTitle(c.textRate), tcDetails(c.textRate, MODULE), async ({ rateCardPage }, testInfo) => {
    const tc = c.textRate;
    const card = await openCard(rateCardPage, testInfo, tc, MODULE);
    const data = dated(tc.data, card.today);
    const used = await fillNewRate(rateCardPage, { ...data, rate: undefined });
    const rateField = await rateCardPage.field('rate');
    await rateField.click();
    await rateField.pressSequentially(data.rate);
    const kept = await rateField.inputValue();
    await recordTestValues(testInfo, { ...used, 'Typed into Rate': data.rate, 'Rate field holds': kept || '(empty)' });
    if (!kept) {
      observe(testInfo, 'The Rate field ignores letters');
      return;
    }
    await expectNotSaved(rateCardPage, testInfo);
  });
});
