const { env } = require('../utils/testData');

/**
 * Write Conversation Message (module COMM, docs/Write Conversation Message.md, version 2: replying to a message EXCERPT is dropped).
 * The Conversation under test is the one of a Project (CONVERSATION_PROJECT_ID, default = the Add Document parent, 818), opened with
 * its "Signals" button. Messages cannot be deleted from the UI, so every message text carries the run tag (MMDD-HHmmss).
 * Override in the root .env:
 *   CONVERSATION_AUTHOR_NAME      display name of the signed-in user (message author)    (default "Dharit Mehta")
 *   CONVERSATION_SELF_HANDLE      the signed-in user's @handle                            (default "Dharit")
 *   CONVERSATION_PERSON_NAME      another person who can be mentioned                     (default "Alina Loza")
 *   CONVERSATION_PERSON_HANDLE    that person's @handle                                   (default "Alina")
 *   CONVERSATION_PERSON2_NAME / _HANDLE   a second person                                 (default "Kalpesh Patel" / "Kalpesh")
 */
const MODULE = 'Write Conversation Message';

const tag = env.runTag;
/** Unique, recognisable message text. */
const text = label => `ATL ${label} ${tag}`;

const DATA = {
  author: process.env.CONVERSATION_AUTHOR_NAME || 'Dharit Mehta',
  selfHandle: process.env.CONVERSATION_SELF_HANDLE || 'Dharit',
  person: { name: process.env.CONVERSATION_PERSON_NAME || 'Alina Loza', handle: process.env.CONVERSATION_PERSON_HANDLE || 'Alina' },
  person2: { name: process.env.CONVERSATION_PERSON2_NAME || 'Kalpesh Patel', handle: process.env.CONVERSATION_PERSON2_HANDLE || 'Kalpesh' },
  // a token no person has
  unknownHandle: `NoSuchPerson${tag.replace(/\D/g, '')}`,
  // a document name no document has
  unknownDocument: `zzNoSuchDocument${tag.replace(/\D/g, '')}`,
  // markup that must be shown as text, never interpreted
  markup: '<b>bold</b> <img src=x onerror=alert(1)> & "quotes"',
  unicode: 'Ünïcödé ✓ 日本語 — ñ',
};

const cases = {
  composerShown: { id: 'TC-01', name: 'Composer is available to a user who can view the Conversation and create messages', description: 'MF-1: open a parent record, click Signals, focus the message box.', condition: 'User has PERM.COMM.Conversation.View, PERM.COMM.ConversationMessage.Create and View on the parent record.', expected: 'The Conversation panel shows the message box with "Write a comment...", a disabled Send button and, on focus, the @ and attach actions.', severity: 'critical' },
  blankBlocked: { id: 'TC-02', name: 'A blank message cannot be sent', description: 'MF-2: leave the message box empty, then type only spaces, then real text.', condition: 'Conversation panel open.', expected: 'Send stays disabled for empty / whitespace-only text and is enabled as soon as there is text.', type: 'Negative' },
  postText: { id: 'TC-03', name: 'Post a plain text message', description: 'MF-2, MF-7, MF-8: type a message, click Send.', condition: 'Conversation panel open.', expected: 'The message is listed with the signed-in user as author, its text, and the message box is cleared; the message count grows by one.', severity: 'critical' },
  persists: { id: 'TC-04', name: 'A posted message is saved (still there after the page is reopened)', description: 'MF-7: post a message, reload the parent record and reopen the Conversation.', condition: 'Conversation panel open.', expected: 'The message is listed again with the same author and text.', severity: 'critical' },
  markupAsText: { id: 'TC-05', name: 'Markup and special characters are shown as text', description: 'MF-2: post text with HTML tags, quotes, ampersand and unicode characters.', condition: 'Conversation panel open.', expected: 'The text is shown exactly as typed; no element is created from the typed markup.' },
  followOnPost: { id: 'TC-06', name: 'Writing a message makes the author follow the Conversation', description: 'MF-5, BR-2: stop following, post a message, reopen the Conversation.', condition: 'The user does not follow the Conversation (the test unfollows first).', expected: 'The Follow toggle shows the user as following and the follower count includes the user.', severity: 'critical' },
  followNoDuplicate: { id: 'TC-07', name: 'A second message does not add the author as a follower again', description: 'MF-5: post two messages while following.', condition: 'The user follows the Conversation.', expected: 'The follower count is the same after the second message.' },
  suggestionsList: { id: 'TC-08', name: '@ lists the directives first, then people, and never the author', description: 'MF-6: follow the Conversation, reopen it and type @ in the message box.', condition: 'The Conversation has a follower (the test follows it); @followers is only offered then.', expected: '"@followers" and "@doc" come first, then people; the signed-in user is not offered.' },
  mentionButton: { id: 'TC-09', name: 'The @ action inserts @ and opens the suggestions', description: 'MF-6: focus the message box, click the @ button.', condition: 'Conversation panel open.', expected: 'The text is "@" and the suggestion list is open.' },
  chooseMention: { id: 'TC-10', name: 'Choosing a person writes the handle into the message', description: 'MF-6: type @ and the start of a name, choose the person.', condition: 'The person exists and can be mentioned.', expected: 'The person is suggested; choosing writes "@<handle> " into the text and the list closes.' },
  mentionPerson: { id: 'TC-11', name: 'An implicit person mention is saved as a mention', description: 'MF-6, BR-4: select a person after @, post.', condition: 'Conversation panel open.', expected: 'The message shows the person as a mention link and the person is stored as mentioned.', severity: 'critical' },
  mentionTwo: { id: 'TC-12', name: 'Two different people are both mentioned', description: 'MF-6: mention two people in one message, post.', condition: 'Conversation panel open.', expected: 'Both people are stored as mentioned.' },
  mentionDuplicate: { id: 'TC-13', name: 'The same person mentioned twice is stored once', description: 'MF-6, BR-5, BR-6: mention one person twice in one message, post.', condition: 'Conversation panel open.', expected: 'The message is posted and the person is stored as mentioned once, silently.' },
  mentionSelf: { id: 'TC-14', name: 'Mentioning yourself is ignored', description: 'MF-6, BR-7: type your own handle with @ together with another person, post.', condition: 'Conversation panel open.', expected: 'The message is posted; only the other person is stored as mentioned.' },
  mentionUnknown: { id: 'TC-15', name: 'An @ token that is not a person or a directive is ignored', description: 'MF-6: type @ followed by a name nobody has, post.', condition: 'Conversation panel open.', expected: 'The message is posted with the text as typed and no mention is stored; no error is shown.', type: 'Negative' },
  directiveFollowers: { id: 'TC-16', name: '@followers is resolved when the message is created and never mentions the author', description: 'MF-6, BR-3, BR-4: follow the Conversation, post a message with @followers.', condition: 'The author follows the Conversation.', expected: 'The message is posted; the author is not stored as mentioned.' },
  docList: { id: 'TC-17', name: '@doc lists the existing documents of the parent and writes the name into the message', description: 'MF-4: type "@doc " and choose a document.', condition: 'The parent record has at least one document (Add Document suite).', expected: 'The existing documents are listed; the chosen name is written into the text.' },
  docNoMatch: { id: 'TC-18', name: '@doc with a name no document has shows "No documents found"', description: 'MF-4: type "@doc " followed by an unknown name.', condition: 'Conversation panel open.', expected: '"No documents found" is shown and nothing can be chosen.', type: 'Negative' },
  docReference: { id: 'TC-19', name: 'Referencing an existing document links it without creating a document', description: 'MF-4: choose a document with @doc, post, compare the parent\'s document count.', condition: 'The parent record has at least one document.', expected: 'The message shows the document; the parent\'s Documents tab has the same number of documents.', severity: 'critical' },
  uploadDocument: { id: 'TC-20', name: 'An uploaded document is attached to the message', description: 'MF-3: attach a file with the paperclip, post with a text.', condition: 'Conversation panel open; the file store is reachable.', expected: 'The file is listed on the message box before sending and shown on the posted message.', severity: 'critical' },
  uploadFailure: { id: 'TC-21', name: 'A failed upload saves nothing (atomic)', description: 'MF-3, BR-8: attach a file while the file store is unreachable, try to post.', condition: 'Requests to the file store are blocked by the test.', expected: 'No message is saved; after reopening the Conversation the text is not listed.', type: 'Negative', severity: 'critical' },
  replyPreview: { id: 'TC-22', name: 'Reply shows the original message above the message box', description: 'AF-1: click reply on a message.', condition: 'A message exists (posted by the test).', expected: 'The reply preview names the author and shows the original text; the Cancel action is shown.' },
  replyAll: { id: 'TC-23', name: 'Reply all pre-fills an @ token for every tagged person', description: 'AF-1: post a message tagging a person, click reply all on it.', condition: 'A message tagging a person exists (posted by the test).', expected: 'The message box already holds the @ token of the tagged person.' },
  replyPost: { id: 'TC-24', name: 'A reply is saved with a reference to the original message', description: 'AF-1: click reply, add text, post.', condition: 'A message exists (posted by the test).', expected: 'The new message is listed as a reply to the original and shows the original message.', severity: 'critical' },
  replyCancel: { id: 'TC-25', name: 'Cancelling the reply posts the next message as a normal message', description: 'AF-1: click reply, cancel, post a message.', condition: 'A message exists (posted by the test).', expected: 'The preview closes; the new message is not a reply.' },
};

module.exports = { MODULE, DATA, text, cases };
