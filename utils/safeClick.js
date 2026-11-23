// On the CI runner the app's fixed left sidebar ends up over the click target, so Playwright's actionability check
// keeps failing with "<div class=side-foot> / <a class=side-link> ... intercepts pointer events" until the test times out.
// This patches Locator.click once per worker: try a normal click first and, only for that failure, fire the click natively.
// Every other failure (not visible, not enabled, detached, ...) is still retried for the full timeout and reported as before.

const INTERCEPT = /intercepts pointer events|outside of the viewport/;
const FIRST_ATTEMPT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 15_000;   // matches use.actionTimeout in playwright.config.js

/** @param {import('@playwright/test').Page} page - any page; used only to reach the Locator class. */
function installSafeClick(page) {
  const proto = Object.getPrototypeOf(page.locator('html'));
  if (proto.__safeClickInstalled) return;
  const original = proto.click;
  proto.click = async function safeClick(options = {}) {
    if (options.force || options.trial) return original.call(this, options);
    const total = options.timeout === undefined ? DEFAULT_TIMEOUT_MS : options.timeout;
    const first = total > 0 ? Math.min(total, FIRST_ATTEMPT_MS) : total;
    const started = Date.now();
    try {
      return await original.call(this, { ...options, timeout: first });
    } catch (e) {
      if (INTERCEPT.test(String(e && e.message))) {
        return this.dispatchEvent('click', undefined, { timeout: Math.max(1_000, total - (Date.now() - started)) });
      }
      const left = total - (Date.now() - started);
      if (total > 0 && left > 0 && /Timeout/.test(String(e && e.message))) return original.call(this, { ...options, timeout: left });
      throw e;
    }
  };
  proto.__safeClickInstalled = true;
}

module.exports = { installSafeClick };
