// Write Conversation Message (module COMM): the Conversation panel (#slideOutPanel) opened from the "Signals" button of a
// parent record (a Project in the sandbox, /Project/Edit/{id}) or from a Signal Center row.
//   - Composer (#messageComposer): textarea #messageInput, Send #sendMessage (disabled while the text is blank), the
//     @ (#mentionBtn) and paperclip (#attachmentBtn) actions shown on focus, the hidden plupload uploader
//     (#conversationMessageUploader) and the list of files attached to the message (#attachedDocumentsList).
//   - Typing "@" opens #mentionSuggestions: the directives "@followers" / "@doc" first, then the people the author may mention
//     (the author is not listed). Choosing a person writes "@Handle " into the text. Choosing "@doc" (or typing "@doc ")
//     switches to #documentSuggestions, the existing Documents of the parent; a choice writes "@<Document name> " into the text.
//   - Reply: every message card has reply / reply all (.reply-btn / .reply-all-btn). The composer shows #replyPreview
//     ("Reply to <author> message:") and pre-fills the @ tokens (author; reply all = author + everyone tagged).
//   - Message cards (.message-card[data-message-id]): author, "wrote a comment:" / "replied to ... messages:", text with
//     a.mention links, .reply-excerpt, and data-mention-handles = the persons mentioned (the stored ConversationMention rows).
//   - Follow toggle (radio group): the CHECKED radio is the current state - "Follow" checked = the user follows the
//     Conversation, "Unfollow" checked = the user does not. The count next to the toggle is the number of followers.
// New messages are listed newest first. Messages cannot be deleted from the UI, so tests tag their texts with the run tag.
// Rules from BasePage apply: locators in the constructor, no assertions here -- methods act or return values; specs assert.

const { BasePage } = require('../basePage');
const { CONVERSATION } = require('../../utils/constants');

const SEND_TIMEOUT = 60_000;

class ConversationMessagePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Parent record (Project) -------------------------------------
    this.signalsButton = page.locator('main').getByRole('button', { name: 'Signals' });

    // ---- Conversation panel ------------------------------------------
    this.panel = page.locator('#slideOutPanel.is-open');
    this.panelTitle = this.panel.locator('.conversation-title');
    this.emptyState = this.panel.getByText(/looks a little quiet here/i);
    this.followerCount = this.panel.locator('.follower-count span');
    this.followRadio = this.panel.locator('.follow-toggle-switch input[id^="follow_"]');
    this.unfollowRadio = this.panel.locator('.follow-toggle-switch input[id^="unfollow_"]');
    this.followLabel = this.panel.locator('.follow-toggle-switch label[for^="follow_"]');
    this.unfollowLabel = this.panel.locator('.follow-toggle-switch label[for^="unfollow_"]');

    // ---- Composer ----------------------------------------------------
    this.composer = page.locator('#messageComposer');
    this.input = page.locator('#messageInput');
    this.sendButton = page.locator('#sendMessage');
    this.sendingIndicator = page.locator('#sendingIndicator');
    this.inputActions = page.locator('#inputActions');
    this.mentionButton = page.locator('#mentionBtn');
    this.attachButton = page.locator('#attachmentBtn');
    this.fileInput = page.locator('#conversationMessageUploader input[type="file"]');
    this.attachedList = page.locator('#attachedDocumentsList');
    this.attachedItems = page.locator('#attachedDocumentsList > *');

    // ---- @ suggestions -------------------------------------------------
    this.mentionSuggestions = page.locator('#mentionSuggestions');
    this.mentionItems = page.locator('#mentionSuggestionsList .mention-suggestion-item');
    this.mentionNames = page.locator('#mentionSuggestionsList .mention-suggestion-name');
    this.documentSuggestions = page.locator('#documentSuggestions');
    this.documentItems = page.locator('#documentSuggestionsList .document-suggestion-item[data-document-id]');
    this.documentNames = page.locator('#documentSuggestionsList .document-suggestion-name');
    this.noDocumentsFound = page.locator('#documentSuggestionsList').getByText(/no documents found/i);

    // ---- Reply ---------------------------------------------------------
    this.replyPreview = page.locator('#replyPreview');
    this.replyAuthor = page.locator('#replyToAuthor');
    this.replyExcerpt = page.locator('#replyExcerptPreview');
    this.cancelReplyButton = page.locator('#cancelReply');

    // ---- Message list --------------------------------------------------
    this.cards = this.panel.locator('.message-card');
  }

  // ---- Opening -----------------------------------------------------------

  /** Opens the Conversation of a parent Project through its "Signals" button and waits for the composer and the message list. */
  async openConversation(projectId = CONVERSATION.PARENT_PROJECT_ID) {
    await this.openRecord(`/Project/Edit/${projectId}`);
    await this.signalsButton.click();
    await this.input.waitFor({ state: 'visible', timeout: SEND_TIMEOUT });
    await this.cards.first().or(this.emptyState).first().waitFor({ state: 'visible', timeout: SEND_TIMEOUT });
  }

  // ---- Writing -----------------------------------------------------------

  /** Puts the whole text into the composer at once (an @ token typed this way stays plain text: no suggestion list). */
  async write(text) {
    await this.input.click();
    await this.input.fill(text);
  }

  /** Types key by key, as a user does, so the @ suggestions open and filter. */
  async typeKeys(text, delay = 40) {
    await this.input.click();
    await this.input.pressSequentially(text, { delay });
  }

  async clearInput() {
    await this.input.fill('');
  }

  async getInputValue() {
    return this.input.inputValue();
  }

  /** Types "@<query>" (key by key) and waits for the person / directive suggestions. */
  async openMentionSuggestions(query = '') {
    await this.typeKeys(`@${query}`);
    await this.mentionSuggestions.waitFor({ state: 'visible' });
  }

  /** Chooses a suggestion by its visible name (person name, "@followers" or "@doc"). */
  async chooseMention(name) {
    await this.mentionItems.filter({ hasText: name }).first().click();
  }

  /** Types "@doc " and waits for the document suggestions of the parent. */
  async openDocumentSuggestions(query = '') {
    await this.typeKeys(query ? `@doc ${query}` : '@doc ');
    await this.documentSuggestions.waitFor({ state: 'visible' });
  }

  /** Chooses the document suggestion at `index`; returns its name. */
  async chooseDocument(index = 0) {
    const item = this.documentItems.nth(index);
    const name = (await item.locator('.document-suggestion-name').innerText()).trim();
    await item.click();
    return name;
  }

  async getSuggestionNames() {
    return (await this.mentionNames.allInnerTexts()).map(t => t.trim());
  }

  // ---- Attachments -------------------------------------------------------

  /** Hands a local file to the hidden uploader (what the paperclip opens); the upload starts at once. */
  async attachFile(filePath) {
    await this.fileInput.setInputFiles(filePath);
  }

  // ---- Sending -----------------------------------------------------------

  async messageIds() {
    return this.cards.evaluateAll(els => els.map(e => e.getAttribute('data-message-id')));
  }

  async getMessageCount() {
    return this.cards.count();
  }

  /** Clicks Send and waits until the new message is listed; returns its message id (null when nothing new appeared in time). */
  async send(timeout = SEND_TIMEOUT) {
    const before = await this.messageIds();
    await this.click(this.sendButton);
    const appeared = await this.page.waitForFunction(
      ids => [...document.querySelectorAll('#slideOutPanel .message-card')].some(e => !ids.includes(e.getAttribute('data-message-id'))),
      before, { timeout },
    ).then(() => true).catch(() => false);
    if (!appeared) return null;
    await this.sendingIndicator.waitFor({ state: 'hidden', timeout }).catch(() => {});
    return (await this.messageIds()).find(id => !before.includes(id)) || null;
  }

  /** write() + send(): returns the id of the posted message. */
  async post(text) {
    await this.write(text);
    return this.send();
  }

  // ---- Message cards -----------------------------------------------------

  card(id) {
    return this.panel.locator(`.message-card[data-message-id="${id}"]`);
  }

  cardAuthor(id) { return this.card(id).locator('.message-author'); }
  cardDescription(id) { return this.card(id).locator('.message-description'); }
  cardText(id) { return this.card(id).locator('.message-text'); }
  cardMentionLinks(id) { return this.card(id).locator('.message-text a.mention'); }
  cardReplyExcerpt(id) { return this.card(id).locator('.reply-excerpt'); }
  replyButton(id) { return this.card(id).locator('.reply-btn:not(.reply-all-btn)'); }
  replyAllButton(id) { return this.card(id).locator('.reply-all-btn'); }

  /** Handles (without "@") the app stored as mentions of a message. */
  async getMentionHandles(id) {
    const raw = (await this.card(id).getAttribute('data-mention-handles')) || '';
    return raw.split(',').map(h => h.trim()).filter(Boolean);
  }

  // ---- Reply ---------------------------------------------------------------

  async reply(id, { all = false } = {}) {
    await this.click(all ? this.replyAllButton(id) : this.replyButton(id));
    await this.replyPreview.waitFor({ state: 'visible' });
  }

  async cancelReply() {
    await this.click(this.cancelReplyButton);
    await this.replyPreview.waitFor({ state: 'hidden' });
  }

  // ---- Follow --------------------------------------------------------------

  async isFollowing() {
    return this.followRadio.isChecked();
  }

  async getFollowerCount() {
    return Number((await this.followerCount.innerText()).replace(/\D/g, '') || 0);
  }

  /** Switches the Follow toggle to the wanted state (no-op when it already is) and waits for it to show. */
  async setFollowing(follow) {
    if ((await this.isFollowing()) === follow) return;
    await this.click(follow ? this.followLabel : this.unfollowLabel);
    await this.page.waitForFunction(
      want => !!document.querySelector(`#slideOutPanel .follow-toggle-switch input[id^="${want ? 'follow' : 'unfollow'}_"]`)?.checked,
      follow, { timeout: 20_000 },
    );
  }
}

module.exports = { ConversationMessagePage };
