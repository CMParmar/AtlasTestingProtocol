const { test, expect } = require('@playwright/test');
const { applyAllureLabels, recordUrl } = require('./testCase');
const { num } = require('../pages/ratecard/RateCardPage');

/**
 * Steps shared by the Add Rate (tests/rate-card-add.spec.js) and View & Edit Rate Card (tests/rate-card.spec.js)
 * suites, both on /RateCard/Edit/{RATE_CARD_ID}. In the sandbox the rate editor's Save stores the line at once.
 */

const observe = (testInfo, description) => testInfo.annotations.push({ type: 'Observed', description });
const shot = async (page, testInfo, name) => testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
const squash = text => String(text).replace(/\s+/g, ' ').trim();

/** Opens the rate card and logs its URL. Returns { id, url, name }. */
async function openCard(rc, testInfo, tc, module) {
  await applyAllureLabels(tc, module);
  const card = await test.step('Open the rate card (MF-1)', () => rc.openCard());
  await recordUrl(testInfo, card.url, `Rate card ${card.name || card.id}`);
  return card;
}

/** yyyy-mm-dd `n` days after `iso`. */
const shiftDate = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Resolves 'today' / 'today+N' / 'today-N' in the date fields of `data` against `today` (the card's default
 * "Rates as of" date, card.today). Other values are kept.
 */
function dated(data, today) {
  if (!data) return data;
  const out = { ...data };
  for (const key of ['effectiveStart', 'effectiveEnd']) {
    const m = /^today([+-]\d+)?$/.exec(out[key] || '');
    if (m) out[key] = shiftDate(today, Number(m[1] || 0));
  }
  return out;
}

/**
 * Targets that already have a rate in effect on any of `dates` (e.g. open-ended rates of the card) - a new rate for
 * them then would overlap (BR-4), so tests that pick "any" target skip them.
 */
/** Every second day from `start` to `end`, and `end` (at most 10; just `start` when open-ended): a rate overlaps if it is in effect on any of them. */
function rangeDays(start, end) {
  if (!start) return [];
  const days = [start];
  for (let d = shiftDate(start, 2); end && d <= end && days.length < 10; d = shiftDate(d, 2)) days.push(d);
  if (end && !days.includes(end)) days.push(end);
  return days;
}

async function busyTargets(rc, ...dates) {
  const busy = new Set();
  for (const date of new Set(dates.filter(Boolean))) for (const l of await rc.linesAsOf(date)) busy.add(l.target);
  return [...busy];
}

/** Target Types tried in turn when a test does not name one (most targets first). */
const ANY_TARGET_TYPE = ['Person', 'Bundle', 'Service Item', 'Labor Grade'];

/**
 * Opens Add Rate and fills it (no Save). Without a targetType, the first type with a free target is used. Skips the
 * test when no usable target is offered. Returns the values used.
 */
async function fillNewRate(rc, data, skipTargets = []) {
  const avoid = data.target ? [] : [...(data.busyKnown ? [] : await busyTargets(rc, ...rangeDays(data.effectiveStart, data.effectiveEnd))), ...skipTargets];
  await rc.openAddRate();
  let used = null;
  for (const targetType of data.targetType ? [data.targetType] : ANY_TARGET_TYPE) {
    used = await rc.fillRate({ ...data, targetType }, { avoid });
    if (used) break;
  }
  test.skip(!used, `No ${data.targetType || ''} target without a rate on ${data.effectiveStart} is offered on this rate card`);
  return used;
}

/**
 * Add Rate, fill, Save (MF-4); the editor must close (rate stored). Returns the values used.
 * A target that is "not available" on the start date (the app refuses to price it then) is skipped and the next
 * free target is tried - only when the test did not name the target itself.
 */
async function addRate(rc, data) {
  return test.step(`Add Rate: ${data.targetType || ''} ${data.rate || ''} ${data.effectiveStart || ''}`, async () => {
    const unavailable = data.target ? [] : await busyTargets(rc, ...rangeDays(data.effectiveStart, data.effectiveEnd));   // scanned once, not on every attempt
    const reasons = [];
    const skipBilling = [];   // "target|billing type" combinations the app refused ("can't be sold as ...")
    for (let attempt = 0; attempt < 12; attempt++) {
      const used = await fillNewRate(rc, { ...data, skipBilling, busyKnown: true }, unavailable);
      let saved = false;
      let shown = '';
      if (used.billingType || data.target) {
        ({ saved } = await rc.saveLine());
        shown = (await rc.anyError.isVisible()) ? squash(await rc.anyError.innerText()) : '';
      } else {
        shown = "isn't available on (every billing type of this target was refused)";
      }
      if (!saved && !data.target && used.billingType && /can't be sold as/i.test(shown)) {
        skipBilling.push(`${used.target}|${used.billingType}`);   // same target, next billing type
      } else if (!saved && !data.target && /isn't available on|has overlapping rates|Subscription (Term|Interval) is required/i.test(shown)) {
        unavailable.push(used.target); reasons.push(`${used.target}: ${shown}`);
      } else {
        expect(saved, `Rate saved (${shown || 'the editor stayed open'})`).toBe(true);
        if (await rc.scenarioModal.isVisible()) await rc.scenarioSecondary.or(rc.scenarioPrimary).first().click();
        return used;
      }
      if (await rc.scenarioModal.isVisible()) await rc.scenarioPrimary.click();
      if (await rc.drawer.isVisible()) await rc.closeDrawer(true);
    }
    test.skip(true, `No ${data.targetType || ''} target on this rate card can take a new rate on ${data.effectiveStart} (every target is taken or is refused by the app): ${reasons.join(' | ') || unavailable.join(', ')}`);
  });
}

/** Lines of `target` that start on `date` (the full rates grid as of that date). */
async function linesOn(rc, card, target, date) {
  return rc.findLines(target, date);
}

/**
 * The rate is shown on the Rates tab as a user opens it: the card re-opened ("Rates as of" left at today), the
 * target searched, and its row - starting on the rate's start date - visible with the rate. Returns the row.
 */
async function expectOnRatesTab(rc, card, used) {
  await rc.reopen(card.url);
  await expect(rc.asOfInput, '"Rates as of" defaults to today').toHaveValue(card.today);
  const row = await rc.row(used.target, used.effectiveStart, { asOf: null });
  if (used.rate) expect(num(await row.getAttribute('data-rate')), 'Rate shown on the Rates tab').toBe(num(used.rate));
  return row;
}

/** Line values for the workbooks. */
const lineValues = (card, used, lineStatus) => ({ rateCard: card.name, ...used, ...(lineStatus ? { lineStatus } : {}) });

/**
 * The rule violation is reported - as the scenario message (title / text) or, for rules the editor checks itself,
 * as the field error (`scen.field`). Returns the text shown.
 */
async function expectScenario(rc, scen, testInfo) {
  const field = scen.field ? rc.fieldErrors.filter({ hasText: scen.field }) : null;
  const message = field ? rc.scenario(scen.title).or(field).first() : rc.scenario(scen.title);
  await expect(message, `"${scen.message}"`).toBeVisible();
  const text = squash(await message.innerText());
  observe(testInfo, `Shown: "${text}"`);
  if (await rc.scenarioModal.isVisible()) await rc.scenarioPrimary.click();
  return text;
}

/** Months in an interval / term caption ("Monthly", "Quarterly", "Annual", "6 Months", "2 Years"). */
function months(text) {
  const t = text.toLowerCase();
  const n = Number((t.match(/\d+/) || [1])[0]);
  if (/year|annual/.test(t)) return /\d/.test(t) ? n * 12 : 12;
  if (/semi|half/.test(t)) return 6;
  if (/quarter/.test(t)) return /\d/.test(t) ? n * 3 : 3;
  if (/month/.test(t)) return n;
  return 0;
}

/** Save button of the rate editor. */
async function doneButton(rc) {
  return rc.lineSaveButton;
}

module.exports = {
  observe, shot, squash, openCard, dated, shiftDate, rangeDays, busyTargets, fillNewRate, addRate, linesOn, expectOnRatesTab, lineValues,
  expectScenario, months, doneButton,
};
