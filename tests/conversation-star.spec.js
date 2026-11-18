// Star & Unstar a Conversation (module COMM, use case v2.0 + "Additional Test Cases" T-1 .. T-24).
// Uses the authenticated storageState from the setup project (functional project, no retries).
//
// The Conversation under test is the one of the Project CONVERSATION_PROJECT_ID (default 818), opened with its "Signals" button.
// Star state = data-starred of the star button; the persisted state is read after reloading the parent record and reopening the
// Conversation. Starring creates the user's follow on the server but does not refresh the Follow toggle of the open panel, so the
// implicit follow (toggle + follower count) is always read after reopening. Each test sets its own starting state first
// (star and follow state are per user and survive between tests).
//
// Not automated (needs users / data the UI cannot give):
//   - T-10 .. T-13 (no PERM.COMM.Conversation.View / no View on the parent) -- needs a second user with limited access.
//   - T-24 (no ConversationParticipant for the user) -- the sandbox cannot seed a Conversation the user is not part of.
//   - Table-level checks of T-9 / T-19 / T-20 (ConversationParticipant rows unchanged, other participants' stars untouched) --
//     no UI or API exposes them; TC-08 proves what is visible (title, messages, follower count unchanged).
// Redundant star / unstar (T-6 / T-7 / T-22): the star button always flips the state, so the same request the page sends
// (POST /SignalCenter/ToggleStar) is replayed to prove the server accepts a redundant change silently.

const { test, expect } = require('../fixtures/fixtures');
const { MODULE, cases: c } = require('../testData/conversationStarData');
const { tcDetails, tcTitle, applyAllureLabels, knownDefect, recordTestValues, recordUrl } = require('../utils/testCase');

/** Allure labels and the known-defect flag for the running case (first step of every test). */
async function begin(testCase, testInfo) {
  await applyAllureLabels(testCase, MODULE);
  knownDefect(testInfo, testCase);
}

/**
 * Opens the Conversation and brings the user to the wanted star and follow state; returns the follower count in that state.
 * Order matters: starring follows implicitly, so the star is set first and the follow state last.
 */
async function startAs(p, { star, follow }) {
  await p.openConversation();
  if ((await p.isStarred()) !== star) {
    await p.setStarred(star);
    await p.openConversation();   // reopen: the implicit follow of a star is only visible from the persisted state
  }
  if ((await p.isFollowing()) !== follow) {
    await p.setFollowing(follow);
    await p.openConversation();   // reopen: the count is read from what the server persisted, not from the optimistic toggle
  }
  await expect(p.starButton, `starting state: ${star ? 'starred' : 'unstarred'}`).toHaveAttribute('data-starred', String(star));
  await expect(follow ? p.followRadio : p.unfollowRadio, `starting state: ${follow ? 'followed' : 'unfollowed'}`).toBeChecked();
  return p.getFollowerCount();
}

test.describe('Star & Unstar a Conversation', () => {
  test.describe.configure({ timeout: 360_000 });   // the Conversation panel is slow on the sandbox and every test reopens it several times

  // ================= MF-1: the star button =================
  test(tcTitle(c.panelStar), tcDetails(c.panelStar, MODULE), async ({ conversationStarPage: p, page }, testInfo) => {
    await begin(c.panelStar, testInfo);
    await p.openConversation();
    await recordUrl(testInfo, page.url(), 'Parent record');
    await expect(p.starButton, 'star button').toBeVisible();
    const starred = await p.isStarred();
    await expect(p.starButton).toHaveAttribute('aria-label', starred ? 'Unstar conversation' : 'Star conversation');
    await expect(p.starButton).toHaveAttribute('title', starred ? 'Unstar' : 'Star');
    await expect(starred ? p.starredButton : p.unstarredButton, 'class follows the persisted state').toHaveCount(1);
  });

  // ================= T-1 / T-2 / T-14 / T-17: star =================
  test(tcTitle(c.star), tcDetails(c.star, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.star, testInfo);
    await recordTestValues(testInfo, { 'Star state before': 'Unstarred by the test', Action: 'Star' });
    await startAs(p, { star: false, follow: true });
    const result = await p.clickStar();
    expect(result, 'the change was sent').not.toBeNull();
    expect(result.status, 'request accepted').toBe(200);
    expect(result.request.isStarred, 'asked to star').toBe(true);
    expect(result.body, 'server confirms the new state').toMatchObject({ success: true, isStarred: true });
    await expect(p.starButton, 'button shows starred').toHaveAttribute('data-starred', 'true');
    await expect(p.starButton).toHaveAttribute('aria-label', 'Unstar conversation');
    const saved = await p.reopenAndGetState();
    expect(saved.starred, 'still starred after reopening').toBe(true);
  });

  // ================= T-4 / T-18: unstar =================
  test(tcTitle(c.unstar), tcDetails(c.unstar, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.unstar, testInfo);
    await recordTestValues(testInfo, { 'Star state before': 'Starred by the test', Action: 'Unstar' });
    await startAs(p, { star: true, follow: true });
    const result = await p.clickUnstar();
    expect(result, 'the change was sent').not.toBeNull();
    expect(result.status, 'request accepted').toBe(200);
    expect(result.request.isStarred, 'asked to unstar').toBe(false);
    expect(result.body, 'server confirms the new state').toMatchObject({ success: true, isStarred: false });
    await expect(p.starButton, 'button shows unstarred').toHaveAttribute('data-starred', 'false');
    await expect(p.starButton).toHaveAttribute('aria-label', 'Star conversation');
    const saved = await p.reopenAndGetState();
    expect(saved.starred, 'still unstarred after reopening').toBe(false);
  });

  // ================= T-3 / T-23: star creates the follow =================
  test(tcTitle(c.starCreatesFollow), tcDetails(c.starCreatesFollow, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.starCreatesFollow, testInfo);
    await recordTestValues(testInfo, { 'Star state before': 'Unstarred', 'Follow state before': 'Unfollowed', Action: 'Star' });
    const before = await startAs(p, { star: false, follow: false });
    const result = await p.clickStar();
    expect(result?.body, 'star accepted').toMatchObject({ success: true, isStarred: true });
    const saved = await p.reopenAndGetState();
    expect(saved.starred, 'starred').toBe(true);
    expect(saved.following, 'follow created implicitly').toBe(true);
    expect(saved.followers, 'exactly one follow record added').toBe(before + 1);
  });

  // ================= T-5: unstar keeps the follow =================
  test(tcTitle(c.unstarKeepsFollow), tcDetails(c.unstarKeepsFollow, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.unstarKeepsFollow, testInfo);
    await recordTestValues(testInfo, { 'Star state before': 'Starred', 'Follow state before': 'Followed', Action: 'Unstar' });
    const before = await startAs(p, { star: true, follow: true });
    const result = await p.clickUnstar();
    expect(result?.body, 'unstar accepted').toMatchObject({ success: true, isStarred: false });
    const saved = await p.reopenAndGetState();
    expect(saved.starred, 'unstarred').toBe(false);
    expect(saved.following, 'follow is kept').toBe(true);
    expect(saved.followers, 'follow record not removed').toBe(before);
  });

  // ================= T-6 / T-22: redundant star =================
  test(tcTitle(c.starRedundant), tcDetails(c.starRedundant, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.starRedundant, testInfo);
    const before = await startAs(p, { star: true, follow: true });
    const replay = await p.toggleStarViaRequest(true);
    expect(replay.status, 'redundant star request is not an error').toBe(200);
    expect(replay.body, 'answered silently').toMatchObject({ success: true, isStarred: true });
    await expect(p.feedback, 'no message or error').toHaveCount(0);
    const saved = await p.reopenAndGetState();
    expect(saved.starred, 'persisted state stays starred').toBe(true);
    expect(saved.following, 'follow unchanged').toBe(true);
    expect(saved.followers, 'no duplicate follow record').toBe(before);
  });

  // ================= T-7 / T-22: redundant unstar =================
  test(tcTitle(c.unstarRedundant), tcDetails(c.unstarRedundant, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.unstarRedundant, testInfo);
    const before = await startAs(p, { star: false, follow: false });
    const replay = await p.toggleStarViaRequest(false);
    expect(replay.status, 'redundant unstar request is not an error').toBe(200);
    expect(replay.body, 'answered silently').toMatchObject({ success: true, isStarred: false });
    await expect(p.feedback, 'no message or error').toHaveCount(0);
    const saved = await p.reopenAndGetState();
    expect(saved.starred, 'persisted state stays unstarred').toBe(false);
    expect(saved.following, 'follow unchanged').toBe(false);
    expect(saved.followers, 'nothing created or deleted').toBe(before);
  });

  // ================= T-8 / T-23: no messages / notifications =================
  test(tcTitle(c.noMessages), tcDetails(c.noMessages, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.noMessages, testInfo);
    await startAs(p, { star: false, follow: false });
    const messages = await p.messageIds();
    await p.clickStar();
    await expect(p.starButton).toHaveAttribute('data-starred', 'true');
    await expect(p.feedback, 'nothing shown after Star').toHaveCount(0);
    await p.clickUnstar();
    await expect(p.starButton).toHaveAttribute('data-starred', 'false');
    await expect(p.feedback, 'nothing shown after Unstar').toHaveCount(0);
    expect(await p.messageIds(), 'no message added to the Conversation').toEqual(messages);
    await p.openConversation();
    expect(await p.messageIds(), 'still none after reopening').toEqual(messages);
  });

  // ================= T-9 / T-21: Conversation and participants unchanged =================
  test(tcTitle(c.conversationUnchanged), tcDetails(c.conversationUnchanged, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.conversationUnchanged, testInfo);
    const followers = await startAs(p, { star: false, follow: true });
    const baseline = await p.conversationSnapshot();
    await p.clickStar();
    await expect(p.starButton).toHaveAttribute('data-starred', 'true');
    expect(await p.conversationSnapshot(), 'Conversation unchanged by Star').toEqual(baseline);
    await p.clickUnstar();
    await expect(p.starButton).toHaveAttribute('data-starred', 'false');
    expect(await p.conversationSnapshot(), 'Conversation unchanged by Unstar').toEqual(baseline);
    const saved = await p.reopenAndGetState();
    expect(await p.conversationSnapshot(), 'and after reopening').toEqual(baseline);
    expect(saved.followers, 'follower count (participants) unchanged').toBe(followers);
  });

  // ================= T-15: no duplicate follow =================
  test(tcTitle(c.starNoDuplicateFollow), tcDetails(c.starNoDuplicateFollow, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.starNoDuplicateFollow, testInfo);
    await recordTestValues(testInfo, { 'Star state before': 'Unstarred', 'Follow state before': 'Followed', Action: 'Star' });
    const before = await startAs(p, { star: false, follow: true });
    const result = await p.clickStar();
    expect(result?.body, 'star accepted').toMatchObject({ success: true, isStarred: true });
    const saved = await p.reopenAndGetState();
    expect(saved.starred, 'starred').toBe(true);
    expect(saved.following, 'still followed').toBe(true);
    expect(saved.followers, 'no duplicate follow record').toBe(before);
  });

  // ================= T-16 / T-17 / T-18: persisted exactly as shown =================
  test(tcTitle(c.stateByRecord), tcDetails(c.stateByRecord, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.stateByRecord, testInfo);
    await startAs(p, { star: false, follow: true });
    const starResult = await p.clickStar();
    expect(starResult?.body, 'request answers the resulting state').toMatchObject({ success: true, isStarred: true });
    let saved = await p.reopenAndGetState();
    expect(saved.starred, 'starred after reload').toBe(true);
    await expect(p.starredButton, 'starred class after reload').toHaveCount(1);
    const unstarResult = await p.clickUnstar();
    expect(unstarResult?.body, 'request answers the resulting state').toMatchObject({ success: true, isStarred: false });
    saved = await p.reopenAndGetState();
    expect(saved.starred, 'unstarred after reload').toBe(false);
    await expect(p.starredButton, 'no starred class after reload').toHaveCount(0);
  });

  // ================= T-1 / T-4 / T-6: repeated toggles =================
  test(tcTitle(c.repeatedToggles), tcDetails(c.repeatedToggles, MODULE), async ({ conversationStarPage: p }, testInfo) => {
    await begin(c.repeatedToggles, testInfo);
    await recordTestValues(testInfo, { Sequence: 'Star -> Unstar -> Star' });
    const before = await startAs(p, { star: false, follow: false });
    await p.clickStar();
    await expect(p.starButton).toHaveAttribute('data-starred', 'true');
    await p.clickUnstar();
    await expect(p.starButton).toHaveAttribute('data-starred', 'false');
    await p.clickStar();
    await expect(p.starButton).toHaveAttribute('data-starred', 'true');
    const saved = await p.reopenAndGetState();
    expect(saved.starred, 'final state is starred').toBe(true);
    expect(saved.following, 'implicit follow exists').toBe(true);
    expect(saved.followers, 'exactly one follow record for the user').toBe(before + 1);
  });
});
