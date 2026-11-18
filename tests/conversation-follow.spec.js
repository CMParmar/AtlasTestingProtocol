// Follow & Unfollow a Conversation (module COMM, use case v1.0 + "Additional Test Cases" T-1 .. T-14).
// Uses the authenticated storageState from the setup project (functional project, no retries).
//
// The Conversation under test is the one of the Project CONVERSATION_PROJECT_ID (default 818), opened with its "Signals" button.
// Follow state = the CHECKED radio of the "Follow toggle"; the persisted state is read after reloading the parent record and
// reopening the Conversation, and the number of ConversationFollow records is read from the follower count.
// Each test sets its own starting state first (the state is per user and survives between tests).
//
// Not automated (needs users / data the UI cannot give):
//   - T-11 / T-12 (no PERM.COMM.Conversation.View / no View on the parent) -- needs a second user with limited access.
//   - T-13 (no ConversationParticipant for the user) -- the sandbox cannot seed a Conversation the user is not part of.
//   - Table-level checks of T-6 / T-8 (ConversationParticipant rows unchanged, other participants' follow untouched) --
//     no UI or API exposes them; TC-06 proves it through the follower count (moves by exactly one) and the unchanged panel.
// Redundant follow / unfollow (T-3 / T-4): the already-checked label is clicked, and the same request the page sends
// (POST /SignalCenter/ToggleFollow) is replayed too, to prove the server accepts a redundant change silently.

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, cases: c } = require('../testData/conversationFollowData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefect, recordTestValues, recordUrl } = require('../utils/testCase');

/** Allure labels and the known-defect flag for the running case (first step of every test). */
async function begin(testCase, testInfo) {
  await applyAllureLabels(testCase, MODULE);
  knownDefect(testInfo, testCase);
}

/** Opens the Conversation and brings the user to the wanted follow state; returns the follower count in that state. */
async function startAs(p, follow) {
  await p.openConversation();
  if ((await p.isFollowing()) !== follow) {
    await p.setFollowing(follow);
    await p.openConversation();   // reopen: the count is read from what the server persisted, not from the optimistic toggle
  }
  await expect(follow ? p.followRadio : p.unfollowRadio, `starting state: ${follow ? 'followed' : 'unfollowed'}`).toBeChecked();
  return p.getFollowerCount();
}

const countIs = (p, n, msg) => expect.poll(() => p.getFollowerCount(), { message: msg }).toBe(n);

test.describe('Follow & Unfollow a Conversation', () => {
  // ================= MF-1: the toggle =================
  test(tcTitle(c.panelToggle), tcDetails(c.panelToggle, MODULE), async ({ conversationFollowPage: p, page }, testInfo) => {
    await begin(c.panelToggle, testInfo);
    await p.openConversation();
    await recordUrl(testInfo, page.url(), 'Parent record');
    await expect(p.followGroup, 'follow toggle').toBeVisible();
    await expect(p.followLabel).toHaveText('Follow');
    await expect(p.unfollowLabel).toHaveText('Unfollow');
    expect((await p.followRadio.isChecked()) !== (await p.unfollowRadio.isChecked()), 'exactly one state is checked').toBe(true);
    await expect(p.followersButton, 'follower count').toBeVisible();
  });

  // ================= T-1: follow =================
  test(tcTitle(c.follow), tcDetails(c.follow, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.follow, testInfo);
    await recordTestValues(testInfo, { 'Follow state before': 'Unfollowed by the test', Action: 'Follow' });
    const before = await startAs(p, false);
    const result = await p.clickFollow();
    expect(result, 'the change was sent').not.toBeNull();
    expect(result.status, 'request accepted').toBe(200);
    expect(result.request.isFollowing, 'asked to follow').toBe(true);
    expect(result.body, 'server confirms the new state').toMatchObject({ success: true, isFollowing: true });
    await expect(p.followRadio, 'toggle shows Follow').toBeChecked();
    await countIs(p, before + 1, 'one follow record added');
    const saved = await p.reopenAndGetState();
    expect(saved.following, 'still followed after reopening').toBe(true);
    expect(saved.followers, 'one follow record added').toBe(before + 1);
  });

  // ================= T-2: unfollow =================
  test(tcTitle(c.unfollow), tcDetails(c.unfollow, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.unfollow, testInfo);
    await recordTestValues(testInfo, { 'Follow state before': 'Followed by the test', Action: 'Unfollow' });
    const before = await startAs(p, true);
    const result = await p.clickUnfollow();
    expect(result, 'the change was sent').not.toBeNull();
    expect(result.status).toBe(200);
    expect(result.request.isFollowing, 'asked to unfollow').toBe(false);
    expect(result.body).toMatchObject({ success: true, isFollowing: false });
    await expect(p.unfollowRadio, 'toggle shows Unfollow').toBeChecked();
    await countIs(p, before - 1, 'follow record removed');
    const saved = await p.reopenAndGetState();
    expect(saved.following, 'still unfollowed after reopening').toBe(false);
    expect(saved.followers, 'follow record removed').toBe(before - 1);
  });

  // ================= T-3: redundant follow =================
  test(tcTitle(c.followRedundant), tcDetails(c.followRedundant, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.followRedundant, testInfo);
    const before = await startAs(p, true);
    const click = await p.clickFollow();   // the page may send the redundant request or nothing at all
    if (click) expect(click.body, 'redundant follow answered silently').toMatchObject({ success: true, isFollowing: true });
    const replay = await p.toggleViaRequest(true);
    expect(replay.status, 'redundant follow request is not an error').toBe(200);
    expect(replay.body).toMatchObject({ success: true, isFollowing: true });
    await expect(p.feedback, 'no message or error').toHaveCount(0);
    await expect(p.followRadio).toBeChecked();
    const saved = await p.reopenAndGetState();
    expect(saved.following, 'persisted state stays followed').toBe(true);
    expect(saved.followers, 'no duplicate follow record').toBe(before);
  });

  // ================= T-4: redundant unfollow =================
  test(tcTitle(c.unfollowRedundant), tcDetails(c.unfollowRedundant, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.unfollowRedundant, testInfo);
    const before = await startAs(p, false);
    const click = await p.clickUnfollow();   // the page may send the redundant request or nothing at all
    if (click) expect(click.body, 'redundant unfollow answered silently').toMatchObject({ success: true, isFollowing: false });
    const replay = await p.toggleViaRequest(false);
    expect(replay.status, 'redundant unfollow request is not an error').toBe(200);
    expect(replay.body).toMatchObject({ success: true, isFollowing: false });
    await expect(p.feedback, 'no message or error').toHaveCount(0);
    await expect(p.unfollowRadio).toBeChecked();
    const saved = await p.reopenAndGetState();
    expect(saved.following, 'persisted state stays unfollowed').toBe(false);
    expect(saved.followers, 'nothing deleted').toBe(before);
  });

  // ================= T-5: no messages / notifications =================
  test(tcTitle(c.noMessages), tcDetails(c.noMessages, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.noMessages, testInfo);
    await startAs(p, false);
    const messages = await p.messageIds();
    await p.clickFollow();
    await expect(p.followRadio).toBeChecked();
    await expect(p.feedback, 'nothing shown after Follow').toHaveCount(0);
    await p.clickUnfollow();
    await expect(p.unfollowRadio).toBeChecked();
    await expect(p.feedback, 'nothing shown after Unfollow').toHaveCount(0);
    expect(await p.messageIds(), 'no message added to the Conversation').toEqual(messages);
    await p.openConversation();
    expect(await p.messageIds(), 'still none after reopening').toEqual(messages);
  });

  // ================= T-6 / T-8: only the follow state changes =================
  test(tcTitle(c.onlyFollowChanges), tcDetails(c.onlyFollowChanges, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.onlyFollowChanges, testInfo);
    const base = await startAs(p, false);
    const panel = await p.snapshot();
    await p.clickFollow();
    await countIs(p, base + 1, 'follow moves the count by exactly one (current user only)');
    await p.clickUnfollow();
    await countIs(p, base, 'unfollow moves it back by exactly one');
    expect(await p.snapshot(), 'nothing else of the Conversation changed').toEqual(panel);
    const saved = await p.reopenAndGetState();
    expect(saved.followers, 'other participants\' follow state is untouched').toBe(base);
  });

  // ================= T-7: persisted exactly as shown =================
  test(tcTitle(c.stateByRecord), tcDetails(c.stateByRecord, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.stateByRecord, testInfo);
    const base = await startAs(p, false);
    await p.clickFollow();
    let saved = await p.reopenAndGetState();
    expect(saved.following, 'followed after reload').toBe(true);
    expect(saved.followers, 'exactly one follow record for the user').toBe(base + 1);
    await expect(p.unfollowRadio, 'only one state is checked').not.toBeChecked();
    await p.clickUnfollow();
    saved = await p.reopenAndGetState();
    expect(saved.following, 'unfollowed after reload').toBe(false);
    expect(saved.followers, 'no follow record left for the user').toBe(base);
    await expect(p.followRadio, 'only one state is checked').not.toBeChecked();
  });

  // ================= T-9: follow leaves the Conversation unchanged =================
  test(tcTitle(c.followKeepsConversation), tcDetails(c.followKeepsConversation, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.followKeepsConversation, testInfo);
    await startAs(p, false);
    const baseline = await p.snapshot();
    await p.clickFollow();
    await expect(p.followRadio).toBeChecked();
    expect(await p.snapshot(), 'Conversation unchanged by Follow').toEqual(baseline);
    await p.openConversation();
    expect(await p.snapshot(), 'and after reopening').toEqual(baseline);
  });

  // ================= T-10: unfollow leaves the Conversation unchanged =================
  test(tcTitle(c.unfollowKeepsConversation), tcDetails(c.unfollowKeepsConversation, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.unfollowKeepsConversation, testInfo);
    await startAs(p, true);
    const baseline = await p.snapshot();
    await p.clickUnfollow();
    await expect(p.unfollowRadio).toBeChecked();
    expect(await p.snapshot(), 'Conversation unchanged by Unfollow').toEqual(baseline);
    await p.openConversation();
    expect(await p.snapshot(), 'and after reopening').toEqual(baseline);
  });

  // ================= T-14: repeated toggles =================
  test(tcTitle(c.repeatedToggles), tcDetails(c.repeatedToggles, MODULE), async ({ conversationFollowPage: p }, testInfo) => {
    await begin(c.repeatedToggles, testInfo);
    await recordTestValues(testInfo, { Sequence: 'Follow -> Unfollow -> Follow' });
    const base = await startAs(p, false);
    await p.clickFollow();
    await expect(p.followRadio).toBeChecked();
    await p.clickUnfollow();
    await expect(p.unfollowRadio).toBeChecked();
    await p.clickFollow();
    await expect(p.followRadio).toBeChecked();
    await countIs(p, base + 1, 'one follow record, no duplicates');
    const saved = await p.reopenAndGetState();
    expect(saved.following, 'final state is followed').toBe(true);
    expect(saved.followers, 'exactly one follow record for the user').toBe(base + 1);
  });
});
