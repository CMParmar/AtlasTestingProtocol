/**
 * Notify User (module COMM, supporting Xselera; user story 2026-02-10, aligned with 62657 Apply Notification Governance and
 * 62674 Process Conversation Message - Mention Notification). The user story is NON-authoritative: these cases cover only what
 * the browser can observe of the principle "Stratym notifies only by explicit address, never by ambient activity":
 * the mention rows that form the notification intent, and the silence of everything that is not a mention.
 * The Conversation under test is the one of a Project (CONVERSATION_PROJECT_ID, default 818), opened with its "Signals" button.
 * People / handles come from testData/conversationMessageData.js (same .env overrides). Case ids are TC-nn.
 * Not automated: see the spec header (delivery, Xselera, throttling, system messages, tenant settings, second user).
 */
const { DATA, text } = require('./conversationMessageData');

const MODULE = 'Notify User';

const cases = {
  mentionIntent: { id: 'TC-01', name: 'An explicit mention creates the notification target', description: '6.1, 7.1: mention a person in a message, post.', condition: 'Conversation panel open; the person exists and can be mentioned.', expected: 'The message shows the person as a mention link and the person is stored as mentioned (the target of the notification intent).', severity: 'critical' },
  noMentionSilent: { id: 'TC-02', name: 'A message without a mention is silent', description: '6.1: post a message that mentions nobody.', condition: 'Conversation panel open.', expected: 'The message is posted and nobody is stored as mentioned, so no notification eligibility exists.', severity: 'critical' },
  activityNotEligible: { id: 'TC-03', name: 'Message activity alone does not raise mention signals', description: '3.1, 6.1: post a message without a mention and compare the Signal Center Mentioned count.', condition: 'Signal Center and Conversation available.', expected: 'The Mentioned count of the Signal Center is the same before and after the message.' },
  authorNotTarget: { id: 'TC-04', name: "Mentioning another person does not raise the author's own Mentioned count", description: "6.1, 7.1: mention another person, post, compare the author's Signal Center counts.", condition: 'Signal Center and Conversation available.', expected: "The message stores the other person only; the author's Mentioned count is unchanged." },
  followSilent: { id: 'TC-05', name: 'Following a Conversation does not notify', description: '6.3: unfollow, follow, unfollow; watch alerts, messages and the Mentioned count.', condition: 'Conversation panel open.', expected: 'No alert or toast is shown, no message is added and the Mentioned count does not change.', severity: 'critical' },
  followersDirective: { id: 'TC-06', name: 'The @followers directive never makes the author a notification target', description: '6.2: follow the Conversation, post a message with @followers.', condition: 'The author follows the Conversation.', expected: 'The message is posted and the author is not stored as mentioned.' },
  selfMention: { id: 'TC-07', name: 'Mentioning yourself creates no notification target', description: '6.1: type your own handle with @ together with another person, post.', condition: 'Conversation panel open.', expected: 'Only the other person is stored as mentioned.' },
  unknownToken: { id: 'TC-08', name: 'An @ token that is not a person gives no notification target', description: '6.1: type @ followed by a name nobody has, post.', condition: 'Conversation panel open.', expected: 'The message is posted as typed, nobody is stored as mentioned and no error is shown.', type: 'Negative' },
  duplicateMention: { id: 'TC-09', name: 'The same person mentioned twice is one notification target', description: '6.1: mention one person twice in one message, post.', condition: 'Conversation panel open.', expected: 'The person is stored as mentioned once.' },
  twoTargets: { id: 'TC-10', name: 'Two mentioned people are both notification targets', description: '6.1, 7.1: mention two different people in one message, post.', condition: 'Conversation panel open.', expected: 'Both people are stored as mentioned.' },
  mentionPersisted: { id: 'TC-11', name: 'The mention is still stored after the Conversation is reopened', description: '7.1, 9.2: post a mention, reload the parent record and reopen the Conversation.', condition: 'Conversation panel open.', expected: 'The message and its mention are listed again with the same person.' },
  mentionedTabConsistent: { id: 'TC-12', name: 'The Signal Center Mentioned tab lists only conversations with mentions', description: '9.2: open the Mentioned tab, compare the count with the rows and their mention badges.', condition: 'Signal Center available.', expected: 'The tab count equals the number of rows and every row shows a mention badge.' },
  replyMention: { id: 'TC-13', name: 'A mention in a reply is stored like a mention in a first message', description: '10: reply to a message and mention a person in the reply (message origin is immaterial).', condition: 'A message exists in the Conversation (the test posts one).', expected: 'The reply is posted and the mentioned person is stored as mentioned.' },
  noPermissionPrompt: { id: 'TC-14', name: 'Opening the Signal Center never triggers the browser permission prompt', description: '8: open the Signal Center while the push permission is undecided.', condition: 'Browser push permission "default" (simulated).', expected: 'Notification.requestPermission is not called and the Signal Center list is shown.', severity: 'critical' },
  nonBlocking: { id: 'TC-15', name: 'A denied push permission does not block the Signal Center', description: '8: open the Signal Center while the push permission is denied.', condition: 'Browser push permission "denied" (simulated).', expected: 'The Signal Center and its list are usable and the prompt is not triggered.' },
  pushNotice: { id: 'TC-16', name: 'The push permission message is dismissible and does not start the prompt', description: '8: when the information message is shown, dismiss it.', condition: 'Tenant allows push, the user opted in, the browser permission is undecided -- skipped when the message is not shown.', expected: 'The message can be dismissed; the browser prompt is not started by opening or dismissing it.' },
};

module.exports = { MODULE, DATA, text, cases };
