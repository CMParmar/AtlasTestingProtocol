// Edit Conversation Message (module COMM, docs/62154 Edit Conversation Message UC.md) -- the author edits the text of a
// message inside the edit window. Functional project, saved session, no retries (a retried test would post a second message).
//
// Every test posts its own run-tagged message and edits it at once, so it is always inside the 300 s window.
// Edit locators were taken from the live sandbox panel (menu -> Edit Message, inline editor, .edited-badge).
//
// Not automated:
//   - Edit-window expiry while editing (AF-1 / UC scenario 7) -- needs a wait of EditWindowSeconds (300 s) or a setting change.
//   - Missing Update / View permission, parent View denied -- needs a second user with limited access.
//   - Audit log entry, notifications not sent, ConversationMention rows -- no UI shows them (mentions: data-mention-handles).

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, DATA, text, cases: c } = require('../testData/conversationEditData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefect, recordTestValues } = require('../utils/testCase');

async function begin(testCase, testInfo) {
  await applyAllureLabels(testCase, MODULE);
  knownDefect(testInfo, testCase);
}

/** Opens the Conversation and posts a run-tagged message; returns its id. */
async function postMessage(p, label, extra = '') {
  await p.openConversation();
  const id = await p.post(`${text(label)}${extra}`);
  expect(id, 'the message was posted').not.toBeNull();
  return id;
}

test.describe('Edit Conversation Message', () => {
  // ================= MF-1..MF-3 =================
  test(tcTitle(c.editWithinWindow), tcDetails(c.editWithinWindow, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.editWithinWindow, testInfo);
    const updated = text('Updated');
    const id = await postMessage(p, 'Original');
    await recordTestValues(testInfo, { 'Updated text': updated });
    await p.edit(id, updated);
    await expect(p.cardText(id), 'new text shown').toContainText(updated);
    await expect(p.editedIndicator(id), 'edited indicator').toBeVisible();
    await expect(p.editedIndicator(id)).toHaveText(DATA.edited);
  });

  test(tcTitle(c.editedIndicator), tcDetails(c.editedIndicator, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.editedIndicator, testInfo);
    const updated = text('Persist');
    const id = await postMessage(p, 'Persist original');
    await recordTestValues(testInfo, { 'Updated text': updated });
    await p.edit(id, updated);
    await expect(p.editedIndicator(id)).toBeVisible();
    await p.openConversation();
    await expect(p.cardText(id), 'new text saved').toContainText(updated);
    await expect(p.editedIndicator(id), 'still marked as edited').toBeVisible();
  });

  test(tcTitle(c.notEditedNoIndicator), tcDetails(c.notEditedNoIndicator, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.notEditedNoIndicator, testInfo);
    const id = await postMessage(p, 'Untouched');
    await expect(p.editedIndicator(id), 'not edited, not marked').toHaveCount(0);
  });

  // ================= AF-1 / AF-2: not allowed =================
  test(tcTitle(c.expiredWindow), tcDetails(c.expiredWindow, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.expiredWindow, testInfo);
    await p.openConversation();
    // the newest own message is the one posted by this run; skip any message created in the last window by checking older ones last
    const own = p.cardsBy(DATA.author);
    const total = await own.count();
    test.skip(total < 2, 'needs an own message older than the edit window');
    const oldId = await own.nth(total - 1).getAttribute('data-message-id');
    await recordTestValues(testInfo, { 'Message id (oldest own)': oldId });
    await p.clickEdit(oldId);
    await expect(p.toastMessage.filter({ hasText: DATA.expiredMessage }), 'refused with the expired message').toBeVisible();
    await expect(p.editor(oldId), 'no editor opened').toHaveCount(0);
  });

  test(tcTitle(c.editOtherAuthor), tcDetails(c.editOtherAuthor, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.editOtherAuthor, testInfo);
    await p.openConversation();
    const others = p.cards.filter({ hasNot: p.page.locator('.message-author', { hasText: DATA.author }) });
    test.skip((await others.count()) === 0, 'needs a message written by another user');
    const otherId = await others.first().getAttribute('data-message-id');
    await expect(p.editButton(otherId), 'no Edit on a message of someone else').toBeHidden();
  });

  // ================= BR-3 / BR-4: scope =================
  test(tcTitle(c.onlyTextEditable), tcDetails(c.onlyTextEditable, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.onlyTextEditable, testInfo);
    const id = await postMessage(p, 'Scope');
    await p.startEdit(id);
    await expect(p.editInput(id), 'text editor').toBeVisible();
    await expect(p.editor(id).locator('input[type="file"], .attach-btn, #attachmentBtn'), 'no attachment control in the editor').toHaveCount(0);
  });

  test(tcTitle(c.mentionsUntouched), tcDetails(c.mentionsUntouched, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.mentionsUntouched, testInfo);
    await p.openConversation();
    const id = await p.post(`${text('Mention')} ${DATA.mentioned} please review`);
    expect(id).not.toBeNull();
    const before = await p.getMentionHandles(id);
    await recordTestValues(testInfo, { 'Mentions before': before.join(', ') || '(none)', 'New text mentions': DATA.replacedMention });
    await p.edit(id, `${text('Mention changed')} ${DATA.replacedMention} updated`);
    await expect(p.editedIndicator(id)).toBeVisible();
    expect(await p.getMentionHandles(id), 'stored mentions unchanged').toEqual(before);
  });

  test(tcTitle(c.noNewMessage), tcDetails(c.noNewMessage, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.noNewMessage, testInfo);
    const id = await postMessage(p, 'Count');
    const before = await p.getMessageCount();
    await p.edit(id, text('Count updated'));
    await expect(p.editedIndicator(id)).toBeVisible();
    expect(await p.getMessageCount(), 'no message added').toBe(before);
  });

  // ================= MF-2: validation =================
  test(tcTitle(c.emptyText), tcDetails(c.emptyText, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.emptyText, testInfo);
    const original = text('Empty');
    await recordTestValues(testInfo, { 'Updated text': '(empty)' });
    const id = await p.openConversation().then(() => p.post(original));
    expect(id).not.toBeNull();
    await p.startEdit(id);
    await p.fillEdit(id, '');
    const saveDisabled = await p.editSaveButton(id).isDisabled().catch(() => false);
    if (!saveDisabled) await p.saveEdit(id);
    await p.openConversation();
    await expect(p.cardText(id), 'original text remains').toContainText(original);
    await expect(p.editedIndicator(id)).toHaveCount(0);
  });

  test(tcTitle(c.cancelEdit), tcDetails(c.cancelEdit, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.cancelEdit, testInfo);
    const original = text('Cancel');
    const id = await postMessage(p, 'Cancel');
    await recordTestValues(testInfo, { 'Typed then cancelled': text('Discard me') });
    await p.startEdit(id);
    await p.fillEdit(id, text('Discard me'));
    await p.click(p.editCancelButton(id));
    await expect(p.cardText(id), 'original text shown').toContainText(original);
    await expect(p.editedIndicator(id)).toHaveCount(0);
  });

  test(tcTitle(c.longText), tcDetails(c.longText, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.longText, testInfo);
    const long = `${text('Long')} ${'x'.repeat(DATA.maxLength - 60)}`;
    const id = await postMessage(p, 'Long original');
    await recordTestValues(testInfo, { 'Updated text length': long.length });
    await p.edit(id, long);
    await expect(p.cardText(id)).toContainText(text('Long'));
    await expect(p.editedIndicator(id)).toBeVisible();
  });

  // ================= MF-1: remaining time  =================
  test(tcTitle(c.remainingTime), tcDetails(c.remainingTime, MODULE), async ({ conversationMessagePage: p }, testInfo) => {
    await begin(c.remainingTime, testInfo);
    const id = await postMessage(p, 'Timer');
    await p.startEdit(id);
    await expect(p.editRemainingTime(id)).toContainText(/remaining/i);
    const seconds = await p.getRemainingSeconds(id);
    expect(seconds, 'remaining time within the window').toBeLessThanOrEqual(DATA.editWindowSeconds);
    expect(seconds).toBeGreaterThan(0);
  });
});
