// Notify User (module COMM, supporting Xselera; user story 2026-02-10, non-authoritative -- 62657 and 62674 prevail).
// Principle: Stratym notifies only by explicit address (a mention), never by ambient activity. The browser cannot see emails,
// SMS, push or Xselera automations, so these cases check the part of the model the UI exposes:
//   - the mention rows of a message (card attribute data-mention-handles) = the targets of a notification intent,
//   - everything that is NOT a mention (plain messages, following, @followers, own handle, unknown tokens) stays silent,
//   - the Signal Center Mentioned signals of the current user, and the client-side push permission awareness (section 8).
// Uses the authenticated storageState from the setup project (functional project, no retries: a retried test would post twice).
// The Conversation under test is the one of the Project CONVERSATION_PROJECT_ID (default 818), opened with its "Signals" button.
// Messages cannot be deleted from the UI, so every text carries the run tag.
//
// Not automated (needs systems / users / data the UI cannot give):
//   - Delivery by Email / SMS / Push, Xselera automation, methods, templates, channel independence (section 8, 12.2, 12.4).
//   - Suppression by throttling / rate limits and the audit record (section 9), tenant settings 62655 (12.3).
//   - The notification trigger payload and governance outcome of 62657 (no UI or API exposes them).
//   - System-generated messages (section 10) -- the UI cannot create one; TC-13 proves the origin-independent mention rule with a reply.
//   - The mentioned person's own Signal Center / unread count -- needs a second signed-in user.
//   - The push permission message wording / markup is not confirmed in the sandbox (needs tenant push enabled + user opt-in):
//     TC-16 is skipped when the message is not shown; the browser permission is simulated, never changed.

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, DATA, text, cases: c } = require('../testData/notifyUserData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefect, recordTestValues, recordUrl } = require('../utils/testCase');

/** Allure labels and the known-defect flag for the running case (first step of every test). */
async function begin(testCase, testInfo) {
  await applyAllureLabels(testCase, MODULE);
  knownDefect(testInfo, testCase);
}

const handleOf = person => person.handle.toLowerCase();

test.describe('Notify User', () => {
  // ================= 6.1: explicit mention is the only trigger =================
  test(tcTitle(c.mentionIntent), tcDetails(c.mentionIntent, MODULE), async ({ notifyUserPage: p, page }, testInfo) => {
    await begin(c.mentionIntent, testInfo);
    const msg = text('Notify mention');
    await recordTestValues(testInfo, { 'Mentioned person': DATA.person.name, 'Message text': msg });
    await p.openConversation();
    await recordUrl(testInfo, page.url(), 'Parent record');
    await p.mentionPerson(DATA.person);
    await p.typeKeys(msg);
    const id = await p.send();
    expect(id, 'the message is posted').not.toBeNull();
    await expect(p.cardMentionLinks(id), 'mention shown as a link').toHaveCount(1);
    await expect(p.cardMentionLinks(id).first()).toHaveText(new RegExp(`@${DATA.person.handle}`, 'i'));
    expect((await p.getMentionHandles(id)).map(h => h.toLowerCase()), 'the person is the notification target').toEqual([handleOf(DATA.person)]);
  });

  test(tcTitle(c.noMentionSilent), tcDetails(c.noMentionSilent, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.noMentionSilent, testInfo);
    const msg = text('Notify plain');
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const { id, handles } = await p.postAndReadMentions(msg);
    expect(id, 'the message is posted').not.toBeNull();
    await expect(p.cardText(id)).toContainText(msg);
    await expect(p.cardMentionLinks(id), 'no mention link').toHaveCount(0);
    expect(handles, 'nobody is notification-eligible').toEqual([]);
  });

  test(tcTitle(c.activityNotEligible), tcDetails(c.activityNotEligible, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.activityNotEligible, testInfo);
    const msg = text('Notify activity');
    await recordTestValues(testInfo, { 'Message text': msg });
    const before = await p.readSignalCounts();
    await p.openConversation();
    const { id } = await p.postAndReadMentions(msg);
    expect(id, 'the message is posted').not.toBeNull();
    const after = await p.readSignalCounts();
    expect(after.mentioned, 'plain activity adds no mention signal').toBe(before.mentioned);
  });

  test(tcTitle(c.authorNotTarget), tcDetails(c.authorNotTarget, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.authorNotTarget, testInfo);
    const msg = text('Notify author');
    await recordTestValues(testInfo, { 'Mentioned person': DATA.person.name, 'Message text': msg });
    const before = await p.readSignalCounts();
    await p.openConversation();
    await p.mentionPerson(DATA.person);
    await p.typeKeys(msg);
    const id = await p.send();
    expect(id, 'the message is posted').not.toBeNull();
    expect((await p.getMentionHandles(id)).map(h => h.toLowerCase()), 'only the other person is mentioned').toEqual([handleOf(DATA.person)]);
    const after = await p.readSignalCounts();
    expect(after.mentioned, 'the author is not interrupted by their own mention').toBe(before.mentioned);
  });

  // ================= 6.2 / 6.3: participation and following are not mentions =================
  test(tcTitle(c.followSilent), tcDetails(c.followSilent, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.followSilent, testInfo);
    const before = await p.readSignalCounts();
    await p.openConversation();
    const messages = await p.getMessageCount();
    await p.setFollowing(false);
    await p.setFollowing(true);
    await expect(p.feedback, 'following raises no alert').toHaveCount(0);
    await p.setFollowing(false);
    await expect(p.feedback, 'unfollowing raises no alert').toHaveCount(0);
    expect(await p.getMessageCount(), 'no message is added by following').toBe(messages);
    const after = await p.readSignalCounts();
    expect(after.mentioned, 'following adds no mention signal').toBe(before.mentioned);
  });

  test(tcTitle(c.followersDirective), tcDetails(c.followersDirective, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.followersDirective, testInfo);
    const msg = `${text('Notify followers')} @followers`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    await p.setFollowing(true);
    const { id, handles } = await p.postAndReadMentions(msg);
    expect(id, 'the directive does not block the message').not.toBeNull();
    expect(handles, 'the author is never a notification target').not.toContain(DATA.selfHandle.toLowerCase());
  });

  test(tcTitle(c.selfMention), tcDetails(c.selfMention, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.selfMention, testInfo);
    const msg = `${text('Notify self')} @${DATA.selfHandle} and @${DATA.person.handle}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const { id, handles } = await p.postAndReadMentions(msg);
    expect(id, 'the message is posted').not.toBeNull();
    expect(handles, 'the other person is a target').toContain(handleOf(DATA.person));
    expect(handles, 'the author is not').not.toContain(DATA.selfHandle.toLowerCase());
  });

  test(tcTitle(c.unknownToken), tcDetails(c.unknownToken, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.unknownToken, testInfo);
    const msg = `${text('Notify unknown')} @${DATA.unknownHandle}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const { id, handles } = await p.postAndReadMentions(msg);
    expect(id, 'an unresolvable token does not block the message').not.toBeNull();
    await expect(p.cardText(id)).toContainText(`@${DATA.unknownHandle}`);
    expect(handles, 'no notification target').toEqual([]);
    await expect(p.feedback, 'no error is shown').toHaveCount(0);
  });

  // ================= 6.1 / 7.1: one target per mentioned person =================
  test(tcTitle(c.duplicateMention), tcDetails(c.duplicateMention, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.duplicateMention, testInfo);
    const msg = `${text('Notify dup')} @${DATA.person.handle} again @${DATA.person.handle}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const { id, handles } = await p.postAndReadMentions(msg);
    expect(id, 'the message is posted').not.toBeNull();
    expect(handles, 'one target for the person').toEqual([handleOf(DATA.person)]);
  });

  test(tcTitle(c.twoTargets), tcDetails(c.twoTargets, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.twoTargets, testInfo);
    const msg = text('Notify two');
    await recordTestValues(testInfo, { 'Mentioned people': `${DATA.person.name}, ${DATA.person2.name}`, 'Message text': msg });
    await p.openConversation();
    await p.mentionPerson(DATA.person);
    await p.typeKeys(' and ');
    await p.mentionPerson(DATA.person2);
    await p.typeKeys(msg);
    const id = await p.send();
    expect(id, 'the message is posted').not.toBeNull();
    const handles = (await p.getMentionHandles(id)).map(h => h.toLowerCase()).sort();
    expect(handles, 'both people are targets').toEqual([handleOf(DATA.person), handleOf(DATA.person2)].sort());
  });

  test(tcTitle(c.mentionPersisted), tcDetails(c.mentionPersisted, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.mentionPersisted, testInfo);
    const msg = `${text('Notify persisted')} @${DATA.person.handle}`;
    await recordTestValues(testInfo, { 'Message text': msg });
    await p.openConversation();
    const { id, handles } = await p.postAndReadMentions(msg);
    expect(id, 'the message is posted').not.toBeNull();
    expect(handles).toEqual([handleOf(DATA.person)]);
    await p.openConversation();   // reloads the parent record and reopens the panel
    await expect(p.card(id), 'message listed again').toBeVisible();
    expect((await p.getMentionHandles(id)).map(h => h.toLowerCase()), 'mention persisted').toEqual([handleOf(DATA.person)]);
  });

  // ================= 10: origin is immaterial =================
  test(tcTitle(c.replyMention), tcDetails(c.replyMention, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.replyMention, testInfo);
    const original = text('Notify reply root');
    const answer = `${text('Notify reply')} @${DATA.person.handle}`;
    await recordTestValues(testInfo, { 'Original message': original, 'Reply text': answer });
    await p.openConversation();
    const rootId = await p.post(original);
    expect(rootId, 'the original is posted').not.toBeNull();
    await p.reply(rootId);
    await p.write(`${await p.getInputValue()}${answer}`);
    const replyId = await p.send();
    expect(replyId, 'the reply is posted').not.toBeNull();
    expect(replyId).not.toBe(rootId);
    expect((await p.getMentionHandles(replyId)).map(h => h.toLowerCase()), 'the reply mentions the person').toContain(handleOf(DATA.person));
  });

  // ================= Signal Center: the current user's mention signals =================
  test(tcTitle(c.mentionedTabConsistent), tcDetails(c.mentionedTabConsistent, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.mentionedTabConsistent, testInfo);
    const counts = await p.readSignalCounts();
    await recordTestValues(testInfo, { 'Mentioned count': String(counts.mentioned) });
    const rows = await p.readMentionedRows();
    const ids = Object.keys(rows);
    const sc = p.signalCenter;
    if (counts.mentioned === 0) {
      expect(ids, 'no mentions, no rows').toEqual([]);
      return;
    }
    expect(ids.length, 'rows match the tab count (one load)').toBeLessThanOrEqual(counts.mentioned);
    expect(ids.length, 'the Mentioned tab lists conversations').toBeGreaterThan(0);
    for (const id of ids) {
      await expect(sc.mentionBadge(id), `conversation ${id} shows a mention badge`).toBeVisible();
      expect(rows[id].mentions, `conversation ${id} mention count`).toBeGreaterThan(0);
    }
  });

  // ================= 8: push permission awareness (client side, simulated browser permission) =================
  test(tcTitle(c.noPermissionPrompt), tcDetails(c.noPermissionPrompt, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.noPermissionPrompt, testInfo);
    await p.stubPushPermission('default');
    await p.signalCenter.openSignalCenter();
    await expect(p.signalCenter.heading, 'Signal Center shown').toBeVisible();
    await expect(p.signalCenter.list, 'list shown').toBeVisible();
    expect(await p.pushPromptCalls(), 'the browser permission prompt is never triggered automatically').toBe(0);
  });

  test(tcTitle(c.nonBlocking), tcDetails(c.nonBlocking, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.nonBlocking, testInfo);
    await p.stubPushPermission('denied');
    await p.signalCenter.openSignalCenter();
    await expect(p.signalCenter.heading, 'Signal Center shown').toBeVisible();
    await expect(p.signalCenter.filterTabs.first(), 'filters usable').toBeEnabled();
    expect(await p.signalCenter.getRowCount(), 'conversations are listed').toBeGreaterThan(0);
    expect(await p.pushPromptCalls(), 'no prompt').toBe(0);
  });

  test(tcTitle(c.pushNotice), tcDetails(c.pushNotice, MODULE), async ({ notifyUserPage: p }, testInfo) => {
    await begin(c.pushNotice, testInfo);
    await p.stubPushPermission('default');
    await p.signalCenter.openSignalCenter();
    const shown = await p.isPushNoticeShown();
    test.skip(!shown, 'The push permission message is not shown (tenant push disabled or user not opted in).');
    await expect(p.signalCenter.list, 'the message does not block the list').toBeVisible();
    expect(await p.pushPromptCalls(), 'opening the Signal Center does not start the prompt').toBe(0);
    if (await p.pushNoticeDismiss.count()) {
      await p.pushNoticeDismiss.click();
      await expect(p.pushNotice, 'dismissed').toBeHidden();
      expect(await p.pushPromptCalls(), 'dismissing does not start the prompt').toBe(0);
    }
  });
});
