// Follow & Unfollow a Conversation (module COMM): the Follow / Unfollow radio toggle in the header of the Conversation panel
// (#slideOutPanel), opened with the "Signals" button of a parent record (a Project in the sandbox, /Project/Edit/{id}).
//   - Toggle: <div class="follow-toggle-switch" role="radiogroup" aria-label="Follow toggle"> with the radios #follow_<id> /
//     #unfollow_<id> (<id> = the Conversation id) and their labels. The CHECKED radio is the persisted state.
//   - Each change posts { conversationID, isFollowing } to /SignalCenter/ToggleFollow and gets { success, isFollowing } back;
//     the endpoint is idempotent (a redundant call changes nothing and raises no error), which is how the redundant
//     follow / unfollow cases are replayed (clicking the already-checked label sends nothing).
//   - Follower count (.follower-count span, "View followers") = the number of ConversationFollow records of the Conversation.
//   - Star button (.star-btn[data-starred]) and the message cards are read only to prove follow / unfollow touches nothing else.
// Reuses the opening / composer / follow helpers of ConversationMessagePage (same panel). No assertions here -- methods act or
// return values; specs assert.

const { ConversationMessagePage } = require('./conversationMessagePage');

const TOGGLE_ENDPOINT = '/SignalCenter/ToggleFollow';

class ConversationFollowPage extends ConversationMessagePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Follow toggle -------------------------------------------------
    this.followToggle = this.panel.locator('.follow-toggle-switch');
    this.followGroup = this.panel.getByRole('radiogroup', { name: 'Follow toggle' });
    this.followersButton = this.panel.locator('.follower-count');

    // ---- Other header actions (read only: they must not change) ---------
    this.starButton = this.panel.locator('.star-btn');

    // ---- Feedback (follow / unfollow raises none) -----------------------
    this.feedback = page.locator('.alert:visible, .toast.show, .toast-success:visible, .toast-error:visible, .alert-danger:visible');
  }

  // ---- Reading -----------------------------------------------------------

  /** Id of the open Conversation, read from the toggle radio id ("follow_14625"). */
  async getConversationId() {
    const id = await this.followRadio.getAttribute('id');
    return Number(id.replace(/\D/g, ''));
  }

  async isStarred() {
    return (await this.starButton.getAttribute('data-starred')) === 'true';
  }

  /** What follow / unfollow must leave untouched: the Conversation title, star state and the listed messages. */
  async snapshot() {
    return {
      title: (await this.panelTitle.innerText()).trim(),
      starred: await this.isStarred(),
      messageIds: await this.messageIds(),
    };
  }

  // ---- Acting --------------------------------------------------------------

  /** Brings the persisted state to the wanted one (no-op when it already is) and waits until the toggle shows it. */
  async ensureFollowing(follow) {
    await this.setFollowing(follow);
  }

  /** Clicks the Follow label like a user; returns the ToggleFollow response (null when nothing was sent). */
  async clickFollow() {
    return this.clickToggle(this.followLabel, true);
  }

  /** Clicks the Unfollow label like a user; returns the ToggleFollow response (null when nothing was sent). */
  async clickUnfollow() {
    return this.clickToggle(this.unfollowLabel, false);
  }

  /** Matches the response by the requested state, so a late answer to an earlier toggle is never taken for this click. */
  async clickToggle(label, isFollowing) {
    const sent = this.page.waitForResponse(
      r => r.url().includes(TOGGLE_ENDPOINT) && r.request().method() === 'POST' && r.request().postDataJSON()?.isFollowing === isFollowing,
      { timeout: 5_000 })
      .catch(() => null);
    await label.click();
    const response = await sent;
    if (!response) return null;
    return { status: response.status(), request: response.request().postDataJSON(), body: await response.json().catch(() => null) };
  }

  /** Replays the toggle request of the page (same endpoint, antiforgery token of the page) for the open Conversation. */
  async toggleViaRequest(follow) {
    const conversationId = await this.getConversationId();
    return this.page.evaluate(async ([id, isFollowing]) => {
      const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
      const r = await fetch('/SignalCenter/ToggleFollow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
        body: JSON.stringify({ conversationID: id, isFollowing }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, [conversationId, follow]);
  }

  /** Persisted state as the UI shows it after reloading the parent record and reopening the Conversation. */
  async reopenAndGetState() {
    await this.openConversation();
    return { following: await this.isFollowing(), followers: await this.getFollowerCount() };
  }
}

module.exports = { ConversationFollowPage, TOGGLE_ENDPOINT };
