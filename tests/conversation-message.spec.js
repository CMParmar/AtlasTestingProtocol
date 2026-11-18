// Write Conversation Message (module COMM, docs/Write Conversation Message.md v2) -- the message box of a Conversation:
// composer, posting, author follows the Conversation, @ mentions (people and the @followers / @doc directives),
// uploaded / referenced documents and replies. Uses the authenticated storageState from the setup project
// (functional project, no retries: a retried test would post a second message).
//
// The Conversation under test is the one of the Project CONVERSATION_PROJECT_ID (default 818, the Add Document parent),
// opened with its "Signals" button. Messages cannot be deleted from the UI, so every test posts texts tagged with the run
// tag and finds its own message by id. What the app stored is read from the message card: author, text, the mention links
// and data-mention-handles (the persons stored as mentioned).
//
// Not automated (needs users / data / views the UI cannot give):
//   - BR-1 / MF-1 permission checks (no View / Create permission, no View on the parent) -- needs a second user with limited access.
//   - Server-side tables (ConversationFollow, ConversationMention, ConversationMessageDocumentRef, CORE.Document rows and
//     RootConversationMessageIDF / ReplyToConversationMessageIDF) -- no UI or API exposes them; the card shows the mentions
//     and the reply reference, the parent's Documents tab shows the document count.
//   - @followers resolving to OTHER followers -- the sandbox cannot seed another follower; TC-16 checks the author is left out.
//   - Reply to a reply (thread root) -- the Newton view is flat, the root id is not shown.
//   - Reply to an excerpt (highlighted part of a message) -- dropped in version 2 of the use case.
//   - Notification delivery, message editing / deletion, document permission changes -- out of scope of this use case.
// The attachment locators (#attachedDocumentsList, hidden plupload input) are taken from the page markup; the upload
// goes to the sandbox file store, so TC-20 / TC-21 need it reachable.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../fixtures/fixtures');
const { CONVERSATION } = require('../utils/constants');
const { MODULE, DATA, text, cases: c } = require('../testData/conversationMessageData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefect, recordTestValues, recordUrl } = require('../utils/testCase');

const { DIRECTIVES } = CONVERSATION;

/** Allure labels and the known-defect flag for the running case (first step of every test). */
async function begin(testCase, testInfo) {
  await applyAllureLabels(testCase, MODULE);
  knownDefect(testInfo, testCase);
}

/** Small local file to attach (the upload goes to the sandbox's file store). */
function makeFile(fileName, content = 'Atlas conversation message test') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-conv-'));
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

const lower = list => list.map(h => h.toLowerCase());

/** Types "@<start of the name>" key by key and chooses the person from the suggestions. */
async function mentionPerson(p, person) {
  await p.openMentionSuggestions(person.handle.slice(0, 3));
  await expect(p.mentionItems.filter({ hasText: person.name }).first(), `${person.name} is suggested`).toBeVisible();
  await p.chooseMention(person.name);
  await expect(p.input, 'handle written into the text').toHaveValue(new RegExp(`@${person.handle}\\s`, 'i'));
}

test.describe('Write Conversation Message', () => {
  // ================= MF-1: compose =================
  test(tcTitle(c.composerShown), tcDetails(c.composerShown, MODULE), async ({ conversationMessagePage: p, page }, testInfo) => {
    await begin(c.composerShown, testInfo);
    await p.openConversation();
    await recordUrl(testInfo, page.url(), 'Parent record');
    await expect(p.panelTitle, 'Conversation of the parent').toHaveText(/.+/);
    await expect(p.input, 'message box').toBeVisible();
    await expect(p.input).toHaveAttribute('placeholder', CONVERSATION.COMPOSER_PLACEHOLDER);
    await expect(p.sendButton, 'nothing to send yet').toBeDisabled();
    await p.input.click();
    await expect(p.mentionButton, '@ action on focus').toBeVisible();
    await expect(p.attachButton, 'attach action on focus').toBeVisible();
  });

  // ================= MF-2: submit / required fields =================
  test(tcTitle(c.blankBlocked), tcDetails(c.blankBlocked, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.blankBlocked, testInfo);
    await recordTestValues(testInfo, { 'Message text': '(empty), spaces only, then "x"' });
    await p.openConversation();
    const before = await p.getMessageCount();
    await p.write('');
    await expect(p.sendButton, 'empty text').toBeDisabled();
    await p.write('     ');
    await expect(p.sendButton, 'spaces only').toBeDisabled();
    await p.write('x');
    await expect(p.sendButton, 'real text').toBeEnabled();
    await p.write('');
    await expect(p.sendButton, 'text removed again').toBeDisabled();
    expect(await p.getMessageCount(), 'nothing was posted').toBe(before);
  });

  test(tcTitle(c.postText), tcDetails(c.postText, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.postText, testInfo);
    const msg = text('Plain');
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const before = await p.getMessageCount();
    const id = await p.post(msg);
    expect(id, 'the message was posted').not.toBeNull();
    await expect(p.cardText(id)).toContainText(msg);
    await expect(p.cardAuthor(id), 'author is the signed-in user').toContainText(DATA.author);
    await expect(p.input, 'message box cleared').toHaveValue('');
    await expect(p.sendButton).toBeDisabled();
    expect(await p.getMessageCount(), 'one more message').toBe(before + 1);
  });

  test(tcTitle(c.persists), tcDetails(c.persists, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.persists, testInfo);
    const msg = text('Persist');
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const id = await p.post(msg);
    expect(id).not.toBeNull();
    await p.openConversation();   // reload the parent and reopen the Conversation
    const saved = p.cards.filter({ hasText: msg });
    await expect(saved, 'message listed again').toHaveCount(1);
    await expect(saved.locator('.message-author')).toContainText(DATA.author);
  });

  test(tcTitle(c.markupAsText), tcDetails(c.markupAsText, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.markupAsText, testInfo);
    const msg = `${text('Markup')} ${DATA.markup} ${DATA.unicode}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const id = await p.post(msg);
    expect(id).not.toBeNull();
    await expect(p.cardText(id), 'shown exactly as typed').toContainText(msg);
    await expect(p.cardText(id).locator('b, img, script'), 'no element created from the typed markup').toHaveCount(0);
  });

  // ================= MF-5: author follows =================
  test(tcTitle(c.followOnPost), tcDetails(c.followOnPost, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.followOnPost, testInfo);
    const msg = text('Follow');
    await recordTestValues(testInfo, { 'Message text': msg, 'Follow state before': 'Unfollowed by the test' });
    await p.openConversation();
    await p.setFollowing(false);
    expect(await p.isFollowing(), 'not following before the message').toBe(false);
    const id = await p.post(msg);
    expect(id).not.toBeNull();
    await p.openConversation();
    await expect(p.followRadio, 'the author now follows').toBeChecked();
    expect(await p.getFollowerCount(), 'followers include the author').toBeGreaterThanOrEqual(1);
  });

  test(tcTitle(c.followNoDuplicate), tcDetails(c.followNoDuplicate, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.followNoDuplicate, testInfo);
    await recordTestValues(testInfo, { 'Messages posted': 2 });
    await p.openConversation();
    await p.setFollowing(true);
    const followers = await p.getFollowerCount();
    expect(await p.post(text('Follow A'))).not.toBeNull();
    expect(await p.post(text('Follow B'))).not.toBeNull();
    await p.openConversation();
    await expect(p.followRadio).toBeChecked();
    expect(await p.getFollowerCount(), 'no second follow record').toBe(followers);
  });

  // ================= MF-6: @ suggestions =================
  test(tcTitle(c.suggestionsList), tcDetails(c.suggestionsList, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.suggestionsList, testInfo);
    await p.openConversation();
    await p.setFollowing(true);   // @followers is only offered when the Conversation has followers
    await p.openConversation();
    await p.openMentionSuggestions();
    await expect(p.mentionNames.first()).toHaveText(DIRECTIVES.FOLLOWERS);
    await expect(p.mentionNames.nth(1)).toHaveText(DIRECTIVES.DOC);
    const names = await p.getSuggestionNames();
    expect(names.length, 'people are listed after the directives').toBeGreaterThan(2);
    expect(names, 'a person that can be mentioned').toContain(DATA.person.name);
    expect(names, 'the author is not offered').not.toContain(DATA.author);
  });

  test(tcTitle(c.mentionButton), tcDetails(c.mentionButton, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.mentionButton, testInfo);
    await p.openConversation();
    await p.input.click();
    await p.click(p.mentionButton);
    await expect(p.input).toHaveValue('@');
    await expect(p.mentionSuggestions).toBeVisible();
  });

  test(tcTitle(c.chooseMention), tcDetails(c.chooseMention, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.chooseMention, testInfo);
    await recordTestValues(testInfo, { 'Mentioned person': DATA.person.name });
    await p.openConversation();
    await mentionPerson(p, DATA.person);
    await expect(p.mentionSuggestions, 'list closed after the choice').toBeHidden();
  });

  // ================= MF-6: mention resolution on save =================
  test(tcTitle(c.mentionPerson), tcDetails(c.mentionPerson, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.mentionPerson, testInfo);
    const msg = text('Mention');
    await recordTestValues(testInfo, { 'Mentioned person': DATA.person.name, 'Message text': msg });
    await p.openConversation();
    await mentionPerson(p, DATA.person);
    await p.typeKeys(msg);
    const id = await p.send();
    expect(id).not.toBeNull();
    await expect(p.cardMentionLinks(id), 'mention shown as a link').toHaveCount(1);
    await expect(p.cardMentionLinks(id).first()).toHaveText(new RegExp(`@${DATA.person.handle}`, 'i'));
    expect(lower(await p.getMentionHandles(id)), 'person stored as mentioned').toEqual([DATA.person.handle.toLowerCase()]);
  });

  test(tcTitle(c.mentionTwo), tcDetails(c.mentionTwo, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.mentionTwo, testInfo);
    const msg = text('Two');
    await recordTestValues(testInfo, { 'Mentioned people': `${DATA.person.name}, ${DATA.person2.name}`, 'Message text': msg });
    await p.openConversation();
    await mentionPerson(p, DATA.person);
    await p.typeKeys(' and ');
    await mentionPerson(p, DATA.person2);
    await p.typeKeys(msg);
    const id = await p.send();
    expect(id).not.toBeNull();
    expect(lower(await p.getMentionHandles(id)).sort()).toEqual([DATA.person.handle, DATA.person2.handle].map(h => h.toLowerCase()).sort());
  });

  test(tcTitle(c.mentionDuplicate), tcDetails(c.mentionDuplicate, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.mentionDuplicate, testInfo);
    const msg = `${text('Dup')} @${DATA.person.handle} again @${DATA.person.handle}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const id = await p.post(msg);
    expect(id, 'duplicates are dropped silently, the message is posted').not.toBeNull();
    expect(lower(await p.getMentionHandles(id)), 'one mention for the person').toEqual([DATA.person.handle.toLowerCase()]);
  });

  test(tcTitle(c.mentionSelf), tcDetails(c.mentionSelf, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.mentionSelf, testInfo);
    const msg = `${text('Self')} @${DATA.selfHandle} and @${DATA.person.handle}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const id = await p.post(msg);
    expect(id, 'the message is posted').not.toBeNull();
    const handles = lower(await p.getMentionHandles(id));
    expect(handles, 'the other person is mentioned').toContain(DATA.person.handle.toLowerCase());
    expect(handles, 'the author is not').not.toContain(DATA.selfHandle.toLowerCase());
  });

  test(tcTitle(c.mentionUnknown), tcDetails(c.mentionUnknown, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.mentionUnknown, testInfo);
    const msg = `${text('Unknown')} @${DATA.unknownHandle}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const id = await p.post(msg);
    expect(id, 'an unresolvable token does not block the message').not.toBeNull();
    await expect(p.cardText(id)).toContainText(`@${DATA.unknownHandle}`);
    expect(await p.getMentionHandles(id), 'no mention stored').toEqual([]);
  });

  test(tcTitle(c.directiveFollowers), tcDetails(c.directiveFollowers, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.directiveFollowers, testInfo);
    const msg = `${text('Followers')} ${DIRECTIVES.FOLLOWERS}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    await p.setFollowing(true);
    const id = await p.post(msg);
    expect(id, 'the directive does not block the message').not.toBeNull();
    expect(lower(await p.getMentionHandles(id)), 'the author is never mentioned').not.toContain(DATA.selfHandle.toLowerCase());
  });

  // ================= MF-4: referenced documents =================
  test(tcTitle(c.docList), tcDetails(c.docList, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.docList, testInfo);
    await p.openConversation();
    await p.openDocumentSuggestions();
    await expect.poll(() => p.documentItems.count(), { message: 'documents of the parent are listed' }).toBeGreaterThan(0);
    const name = await p.chooseDocument(0);
    expect(name).not.toBe('');
    await expect(p.input, 'document name written into the text').toHaveValue(new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    await expect(p.documentSuggestions, 'list closed after the choice').toBeHidden();
  });

  test(tcTitle(c.docNoMatch), tcDetails(c.docNoMatch, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.docNoMatch, testInfo);
    await recordTestValues(testInfo, { 'Document search text': DATA.unknownDocument });
    await p.openConversation();
    await p.openDocumentSuggestions(DATA.unknownDocument);
    await expect(p.noDocumentsFound).toBeVisible();
    await expect(p.documentItems, 'nothing to choose').toHaveCount(0);
  });

  test(tcTitle(c.docReference), tcDetails(c.docReference, MODULE), async ({ conversationMessagePage: p, documentPage }, testInfo) => {
    await begin(c.docReference, testInfo);
    const msg = text('DocRef');
    await documentPage.openParentDocuments();
    const documentsBefore = await documentPage.getResultCount();
    await p.openConversation();
    await p.openDocumentSuggestions();
    await expect.poll(() => p.documentItems.count()).toBeGreaterThan(0);
    const name = await p.chooseDocument(0);
    await recordTestValues(testInfo, { 'Referenced document': name, 'Message text': msg, 'Documents before': documentsBefore });
    await p.write(`${await p.getInputValue()}${msg}`);
    const id = await p.send();
    expect(id).not.toBeNull();
    await expect(p.cardText(id), 'the referenced document is shown').toContainText(name);
    await documentPage.openParentDocuments();
    await expect.poll(() => documentPage.getResultCount(), { message: 'no document was created or removed' }).toBe(documentsBefore);
  });

  // ================= MF-3: uploaded documents =================
  test(tcTitle(c.uploadDocument), tcDetails(c.uploadDocument, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.uploadDocument, testInfo);
    const msg = text('Upload');
    const fileName = `atlas-conv-${Date.now()}.txt`;
    await recordTestValues(testInfo, { 'Message text': msg, 'Attached file': fileName });
    await p.openConversation();
    await p.attachFile(makeFile(fileName));
    await expect(p.attachedList, 'file listed before sending').toContainText(fileName, { timeout: 60_000 });
    await p.write(msg);
    const id = await p.send();
    expect(id, 'message posted with the file').not.toBeNull();
    await expect(p.card(id)).toContainText(fileName);
    await expect(p.attachedItems, 'attachments cleared after sending').toHaveCount(0);
  });

  test(tcTitle(c.uploadFailure), tcDetails(c.uploadFailure, MODULE), async ({ conversationMessagePage: p, page }, testInfo) => {
    await begin(c.uploadFailure, testInfo);
    const msg = text('UploadFail');
    await recordTestValues(testInfo, { 'Message text': msg, 'File store': 'Blocked by the test' });
    await p.openConversation();
    const before = await p.getMessageCount();
    await page.route(/amazonaws\.com/, route => route.abort('failed'));
    await p.attachFile(makeFile(`atlas-conv-fail-${Date.now()}.txt`));
    await p.write(msg);
    await p.sendButton.click({ timeout: 5_000 }).catch(() => {});   // the app may already block the send
    await page.waitForTimeout(8_000);
    await expect(p.cards.filter({ hasText: msg }), 'message not listed').toHaveCount(0);
    await page.unroute(/amazonaws\.com/);
    await p.openConversation();
    await expect(p.cards.filter({ hasText: msg }), 'nothing was saved').toHaveCount(0);
    expect(await p.getMessageCount(), 'message count unchanged').toBe(before);
  });

  // ================= AF-1: reply =================
  test(tcTitle(c.replyPreview), tcDetails(c.replyPreview, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.replyPreview, testInfo);
    const msg = text('Reply source');
    await recordTestValues(testInfo, { 'Original message': msg });
    await p.openConversation();
    const id = await p.post(msg);
    expect(id).not.toBeNull();
    await p.reply(id);
    await expect(p.replyAuthor, 'author of the original').toHaveText(/\S/);
    await expect(p.replyExcerpt, 'original text shown').toContainText(msg);
    await expect(p.cancelReplyButton).toBeVisible();
  });

  test(tcTitle(c.replyAll), tcDetails(c.replyAll, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.replyAll, testInfo);
    const msg = text('Reply all source');
    await recordTestValues(testInfo, { 'Original message': msg, 'Tagged person': DATA.person.name });
    await p.openConversation();
    await mentionPerson(p, DATA.person);
    await p.typeKeys(msg);
    const id = await p.send();
    expect(id).not.toBeNull();
    await p.reply(id, { all: true });
    await expect(p.input, 'tagged person pre-filled as an @ token').toHaveValue(new RegExp(`@${DATA.person.handle}`, 'i'));
  });

  test(tcTitle(c.replyPost), tcDetails(c.replyPost, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.replyPost, testInfo);
    const original = text('Reply original');
    const answer = text('Reply answer');
    await recordTestValues(testInfo, { 'Original message': original, 'Reply text': answer });
    await p.openConversation();
    const rootId = await p.post(original);
    expect(rootId).not.toBeNull();
    await p.reply(rootId);
    await p.write(`${await p.getInputValue()}${answer}`);
    const replyId = await p.send();
    expect(replyId, 'the reply was posted').not.toBeNull();
    expect(replyId).not.toBe(rootId);
    await expect(p.cardText(replyId)).toContainText(answer);
    await expect(p.cardDescription(replyId), 'listed as a reply').toContainText(/repl/i);
    await expect(p.cardReplyExcerpt(replyId), 'shows the original message').toContainText(original);
    await expect(p.replyPreview, 'preview closed after sending').toBeHidden();
  });

  test(tcTitle(c.replyCancel), tcDetails(c.replyCancel, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.replyCancel, testInfo);
    const original = text('Cancel original');
    const next = text('Cancel next');
    await recordTestValues(testInfo, { 'Original message': original, 'Next message': next });
    await p.openConversation();
    const rootId = await p.post(original);
    expect(rootId).not.toBeNull();
    await p.reply(rootId);
    await p.cancelReply();
    await p.write(next);
    const id = await p.send();
    expect(id).not.toBeNull();
    await expect(p.cardDescription(id), 'not a reply').not.toContainText(/repl/i);
    await expect(p.cardReplyExcerpt(id)).toHaveCount(0);
  });
});
