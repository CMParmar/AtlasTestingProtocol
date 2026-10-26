// Small, reusable wait helpers so page/component classes don't each repeat
// the same `locator.waitFor({ state: ... })` incantation.

/**
 * @param {import('@playwright/test').Locator} locator
 * @param {'attached'|'detached'|'visible'|'hidden'} state
 * @param {{ timeout?: number }} [options]
 */
async function waitForState(locator, state, options = {}) {
  await locator.waitFor({ state, ...options });
}

async function waitForVisible(locator, options = {}) {
  await waitForState(locator, 'visible', options);
}

async function waitForHidden(locator, options = {}) {
  await waitForState(locator, 'hidden', options);
}

/** Resolves true/false instead of throwing -- for optional UI. */
async function isVisibleWithin(locator, timeout = 2000) {
  return locator
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

module.exports = { waitForState, waitForVisible, waitForHidden, isVisibleWithin };
