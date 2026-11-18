// Star & Unstar a Conversation (module COMM): the star button in the header of the Conversation panel (#slideOutPanel),
// opened with the "Signals" button of a parent record (a Project in the sandbox, /Project/Edit/{id}).
//   - Button: <button class="svg star-btn [starred]" data-conversation-id="<id>" data-starred="true|false"
//     aria-label="Star conversation | Unstar conversation" title="Star | Unstar">. data-starred is the persisted state.
//   - Each click posts { conversationID, isStarred } to /SignalCenter/ToggleStar and gets { success, isStarred } back;
//     the endpoint is idempotent, so a redundant star / unstar is replayed through the same request (the button itself
//     always flips the state, it cannot send a redundant change).
//   - Starring also creates the ConversationFollow of the user on the server. The Follow toggle of the open panel is NOT
//     refreshed by the star click, so the implicit follow is read after reopening the Conversation (follow toggle + follower count).
//   - Unstarring never touches the follow state.
// Reuses the opening / follow helpers of ConversationFollowPage (same panel). No assertions here -- methods act or return
// values; specs assert.

const { ConversationFollowPage } = require('./conversationFollowPage');

const { CONVERSATION } = require('../../utils/constants');

const STAR_ENDPOINT = '/SignalCenter/ToggleStar';
const OPEN_TIMEOUT = 60_000;
const PANEL_TIMEOUT = 120_000;   // the Conversation panel itself can take a minute or more to load on the sandbox

class ConversationStarPage extends ConversationFollowPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Star button (this.starButton = this.panel.locator('.star-btn') comes from ConversationFollowPage) ----
    this.starredButton = this.panel.locator('.star-btn.starred');
    this.unstarredButton = this.panel.locator('.star-btn:not(.starred)');
  }

  // ---- Opening -----------------------------------------------------------

  /**
   * Same as ConversationMessagePage.openConversation, but tolerant of the slow sandbox: the parent record sometimes
   * does not reach "domcontentloaded" within 90 s although it is already usable (page.goto timeout). The navigation
   * therefore waits for the response only ("commit"), the panel is awaited through its own elements, and the whole
   * opening is retried a couple of times when the page was not ready (Signals not clickable / panel not shown).
   */
  async openConversation(projectId = CONVERSATION.PARENT_PROJECT_ID) {
    const attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.openRecord(`/Project/Edit/${projectId}`, { waitUntil: 'commit', timeout: OPEN_TIMEOUT });
        await this.signalsButton.click({ timeout: OPEN_TIMEOUT });
        await this.input.waitFor({ state: 'visible', timeout: PANEL_TIMEOUT });
        await this.cards.first().or(this.emptyState).first().waitFor({ state: 'visible', timeout: PANEL_TIMEOUT });
        return;
      } catch (e) {
        if (attempt === attempts) throw e;
      }
    }
  }

  // ---- Reading -----------------------------------------------------------

  async getStarLabel() {
    return this.starButton.getAttribute('aria-label');
  }

  /** What star / unstar must leave untouched: the Conversation title and the listed messages. */
  async conversationSnapshot() {
    return {
      title: (await this.panelTitle.innerText()).trim(),
      messageIds: await this.messageIds(),
    };
  }

  // ---- Acting --------------------------------------------------------------

  /** Waits until the button shows the wanted persisted state. */
  async waitForStarState(starred) {
    await this.page.waitForFunction(
      want => document.querySelector('#slideOutPanel .star-btn')?.getAttribute('data-starred') === String(want),
      starred, { timeout: 20_000 },
    );
  }

  /** Clicks the star button like a user and returns the ToggleStar response (null when nothing was sent). */
  async clickStar() {
    return this.clickStarButton(true);
  }

  /** Clicks the (starred) button like a user to unstar; returns the ToggleStar response (null when nothing was sent). */
  async clickUnstar() {
    return this.clickStarButton(false);
  }

  /** Matches the response by the requested state, so a late answer to an earlier toggle is never taken for this click. */
  async clickStarButton(isStarred) {
    const sent = this.page.waitForResponse(
      r => r.url().includes(STAR_ENDPOINT) && r.request().method() === 'POST' && r.request().postDataJSON()?.isStarred === isStarred,
      { timeout: 10_000 })
      .catch(() => null);
    await this.starButton.click();
    const response = await sent;
    if (!response) return null;
    return { status: response.status(), request: response.request().postDataJSON(), body: await response.json().catch(() => null) };
  }

  /** Brings the persisted star state to the wanted one (no-op when it already is) and waits until the button shows it. */
  async setStarred(starred) {
    if ((await this.isStarred()) === starred) return;
    await this.starButton.click();
    await this.waitForStarState(starred);
  }

  /** Replays the toggle request of the page (same endpoint, antiforgery token of the page) for the open Conversation. */
  async toggleStarViaRequest(starred) {
    const conversationId = await this.getConversationId();
    return this.page.evaluate(async ([id, isStarred]) => {
      const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
      const r = await fetch('/SignalCenter/ToggleStar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
        body: JSON.stringify({ conversationID: id, isStarred }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, [conversationId, starred]);
  }

  /** Persisted state as the UI shows it after reloading the parent record and reopening the Conversation. */
  async reopenAndGetState() {
    await this.openConversation();
    return { starred: await this.isStarred(), following: await this.isFollowing(), followers: await this.getFollowerCount() };
  }
}

module.exports = { ConversationStarPage, STAR_ENDPOINT };
