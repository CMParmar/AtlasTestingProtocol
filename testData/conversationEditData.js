const { env } = require('../utils/testData');

/**
 * Edit Conversation Message (module COMM, docs/62154 Edit Conversation Message UC.md).
 * Same Conversation as Write Conversation Message (Project CONVERSATION_PROJECT_ID, opened with "Signals").
 * Every test posts its own message (run-tagged) and edits it straight away, inside the edit window
 * (SET.COMM.ConversationMessage.EditWindowSeconds, default 300 s). Messages cannot be deleted from the UI.
 * Override in the root .env:
 *   CONVERSATION_AUTHOR_NAME   display name of the signed-in user (default "Dharit Mehta")
 *   CONVERSATION_MAX_LENGTH    longest message text the app accepts (default 4000)
 */
const MODULE = 'Edit Conversation Message';

const tag = env.runTag;
const text = label => `ATL Edit ${label} ${tag}`;

const DATA = {
  author: process.env.CONVERSATION_AUTHOR_NAME || 'Dharit Mehta',
  editWindowSeconds: 300,
  maxLength: Number(process.env.CONVERSATION_MAX_LENGTH) || 4000,
  editedText: 'updated',
  mentioned: '@Alina',
  replacedMention: '@Kalpesh',
  expiredMessage: /can no longer be edited|edit window .* expired/i,
  edited: /^edited$/i,
};

const cases = {
  editWithinWindow: { id: 'TC-01', name: 'Author edits a message within the edit window', description: 'MF-1, MF-2, MF-3: post a message, click Edit, change the text, submit.', condition: 'Author has PERM.COMM.ConversationMessage.Update, Conversation.View and View on the parent; message is inside the edit window.', expected: 'The message shows the new text and the "(edited)" indicator.', severity: 'critical' },
  editedIndicator: { id: 'TC-02', name: 'An edited message keeps the "(edited)" indicator after the page is reopened', description: 'MF-3, BR-5: edit a message, reload the parent record, reopen the Conversation.', condition: 'A message edited by its author.', expected: 'The new text and the "(edited)" indicator are shown again.' },
  notEditedNoIndicator: { id: 'TC-03', name: 'A message that was never edited has no "(edited)" indicator', description: 'BR-5: post a message and look at it.', condition: 'A freshly posted message.', expected: 'No "(edited)" indicator.' },
  expiredWindow: { id: 'TC-04', name: 'A message older than the edit window cannot be edited', description: 'AF-1: look for Edit on a message the user wrote earlier than the edit window.', condition: 'The Conversation holds a message by the user older than EditWindowSeconds.', expected: 'Edit is not offered, or editing is refused with "This message can no longer be edited."', type: 'Negative' },
  editOtherAuthor: { id: 'TC-05', name: 'Messages of other authors cannot be edited', description: 'AF-2, BR-1: look for Edit on a message written by someone else.', condition: 'The Conversation holds a message by another user.', expected: 'Edit is not offered on that message.', type: 'Negative' },
  onlyTextEditable: { id: 'TC-06', name: 'Only the message text is editable', description: 'MF-1, BR-3: open the editor of a message with an attachment.', condition: 'Message with a text (and no way to change attachments in the editor).', expected: 'The editor holds only the text; no attach / upload control is shown inside the card.' },
  mentionsUntouched: { id: 'TC-07', name: 'Editing does not re-process mentions', description: 'BR-4: mention a person, post, edit the text to name another person.', condition: 'A message that mentions a person.', expected: 'The stored mentions (data-mention-handles) are the same as before the edit.' },
  emptyText: { id: 'TC-08', name: 'An edit to empty text is not saved', description: 'MF-2: clear the text in the editor and submit.', condition: 'Message inside the edit window.', expected: 'Save is blocked or refused; the original text remains.', type: 'Negative' },
  cancelEdit: { id: 'TC-09', name: 'Cancelling the edit keeps the original text', description: 'MF-1: open the editor, change the text, cancel.', condition: 'Message inside the edit window.', expected: 'The original text is shown and no "(edited)" indicator appears.' },
  longText: { id: 'TC-10', name: 'A long text within the limit can be saved', description: 'MF-2: replace the text with a long text.', condition: 'Message inside the edit window.', expected: 'The message is updated and shows "(edited)".' },
  remainingTime: { id: 'TC-11', name: 'The remaining edit time is shown while editing', description: 'MF-1: open the editor.', condition: 'Message inside the edit window.', expected: 'The remaining time (at most the edit window) may be displayed (the UI is allowed to omit it).' },
  noNewMessage: { id: 'TC-12', name: 'Editing does not add a message or reply', description: 'BR-4: edit a message and count the messages.', condition: 'Message inside the edit window.', expected: 'The message count is the same after the edit.' },
};

module.exports = { MODULE, DATA, text, cases };
