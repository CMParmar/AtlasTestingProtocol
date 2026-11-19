// Notify User (module COMM, supporting Xselera): notification ELIGIBILITY as the UI exposes it. Stratym notifies only by explicit
// address (a mention), never by ambient activity, so what can be checked in the browser is the source of the notification intent:
//   - Conversation panel (#slideOutPanel): the message cards carry data-mention-handles = the persons stored as ConversationMention
//     rows (= the targets of a notification intent). No mention -> the attribute is empty -> the message is silent.
//   - Follow toggle / follower count: following is pull-based; it must not raise alerts, messages or mentions.
//   - Signal Center (/SignalCenter): the "Mentioned" tab, its count and the mention badge of a row show where the CURRENT user is mentioned.
//   - Push permission awareness (client side): when the Signal Center opens the client may show a dismissible, non-blocking info
//     message about the browser push permission; it must never trigger the browser permission prompt by itself.
// Delivery (email / SMS / push), throttling and Xselera automations are server / Xselera side and are not reachable from the UI.
// Extends ConversationMessagePage (same panel, composer, mention helpers) and reads the Signal Center through SignalCenterPage.
// No assertions here -- methods act or return values; specs assert.

const { ConversationMessagePage } = require('../conversation/conversationMessagePage');
const { SignalCenterPage } = require('../signalCenter/signalCenterPage');
const { SIGNAL_CENTER } = require('../../utils/constants');

class NotifyUserPage extends ConversationMessagePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
    this.signalCenter = new SignalCenterPage(page);

    // ---- Signal feedback: anything an interruption would show (follow / plain activity must raise none) ----
    this.feedback = page.locator('.alert:visible, .toast.show, .toast-success:visible, .toast-error:visible, .alert-danger:visible');

    // ---- Push permission awareness message (Signal Center) ---------------
    // Markup not confirmed in the sandbox: matched by role / wording so it is found whatever its container is.
    this.pushNotice = page
      .locator('[role="alert"], .alert, .toast, .banner, [class*="push" i], [id*="push" i]')
      .filter({ hasText: /push notification|browser permission|enable (push )?notifications/i })
      .filter({ visible: true })
      .first();
    this.pushNoticeDismiss = this.pushNotice.locator('button.btn-close, button[aria-label*="close" i], button[aria-label*="dismiss" i], [data-bs-dismiss]').first();
    this.pushNoticeEnable = this.pushNotice.getByRole('button', { name: /enable|allow|turn on/i }).first();
  }

  // ---- Message cards -------------------------------------------------------

  /** Posts a message in the open Conversation and returns { id, handles } (handles = persons stored as mentioned, lower-case). */
  async postAndReadMentions(text) {
    const id = await this.post(text);
    if (!id) return { id: null, handles: [] };
    return { id, handles: (await this.getMentionHandles(id)).map(h => h.toLowerCase()) };
  }

  /** Types "@<start of the name>" key by key and chooses the person from the suggestions (a real, resolved mention). */
  async mentionPerson(person) {
    await this.openMentionSuggestions(person.handle.slice(0, 3));
    await this.chooseMention(person.name);
  }

  // ---- Signal Center (the current user's own mention signals) ---------------

  /** Opens the Signal Center on the All filter and returns the tab counts { all, unread, mentioned, starred }. */
  async readSignalCounts() {
    await this.signalCenter.prepare(SIGNAL_CENTER.FILTER.ALL);
    return this.signalCenter.getTabCounts();
  }

  /** Switches to the Mentioned tab; returns the badge indicators of its rows keyed by conversation id. */
  async readMentionedRows() {
    await this.signalCenter.selectFilter(SIGNAL_CENTER.FILTER.MENTIONED);
    return this.signalCenter.readRowIndicators();
  }

  // ---- Push permission awareness (client side) --------------------------------

  /**
   * Fakes the browser push permission ('default' | 'granted' | 'denied') and counts the calls of Notification.requestPermission,
   * so a spec can prove the client never triggers the browser prompt on its own. Call before navigating (init script).
   * Counter is read with pushPromptCalls().
   */
  async stubPushPermission(state) {
    await this.page.addInitScript(permission => {
      window.__pushPromptCalls = 0;
      const Fake = function Notification() {};
      Object.defineProperty(Fake, 'permission', { get: () => permission });
      Fake.requestPermission = () => { window.__pushPromptCalls += 1; return Promise.resolve(permission); };
      Object.defineProperty(window, 'Notification', { value: Fake, configurable: true, writable: true });
    }, state);
  }

  async pushPromptCalls() {
    return this.page.evaluate(() => window.__pushPromptCalls || 0);
  }

  /** True when the push permission info message is shown within `timeout` ms. */
  async isPushNoticeShown(timeout = 3_000) {
    return this.pushNotice.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }
}

module.exports = { NotifyUserPage };
