# Write Conversation Message

**Module:** COMM — Communication / Conversations
**Version 1.0** — Jan 2026 (Murph): initial definition (mention directives, document attachments, document references).
**Version 2** — 20 Jan 26 (Murph): drop support for replying to a message excerpt.

## Goal
Allow a user to write and post a message to a Conversation, optionally including mentions, special mention directives, uploaded documents and references to existing documents. Allow the user to reply to a message.

## Tables
COMM.Conversation, COMM.ConversationMessage, COMM.ConversationFollow, COMM.ConversationMention, COMM.ConversationMessageDocumentRef, CORE.Document

## Permissions
- PERM.COMM.Conversation.View
- PERM.COMM.ConversationMessage.Create
- View permission on the parent entity record of the Conversation

## Language
- **MentionDirective** — system-recognized `@` directive (`@followers`, `@doc`) resolved at message creation time.
- **Implicit Person Mention** — a person selected after typing `@`, without a directive keyword.
- **Document Attachment** — a Document created as part of message submission and linked to the message.
- **Document Reference** — a link from a message to an existing Document (nothing created or modified).
- **Reply** — a message that references another message as its contextual origin.
- **Reply Excerpt** — NOT SUPPORTED (version 2).

## Business rules
1. A user may write a message only with View on the Conversation and Create on messages.
2. Writing a message makes the author follow the Conversation.
3. MentionDirectives are system-controlled and define authoritative resolution behavior.
4. Mention resolution happens at creation time and is fully materialized.
5. At most one ConversationMention per resolved person per message.
6. Duplicate directives in one message are deduplicated silently.
7. Self-mentions are ignored.
8. Message creation, mention materialization, document creation and document linking are fully atomic: if a document cannot be uploaded, nothing is saved.

## Main flow
- **MF-1** Initiate composition: verify the three permissions, show the composer.
- **MF-2** Submit: validate required fields, create the ConversationMessage, author = current user.
- **MF-3** Uploaded documents: Create Document (non-interactive) per file, then a ConversationMessageDocumentRef.
- **MF-4** Referenced documents: verify View permission per Document, create a ConversationMessageDocumentRef; no Document is created or modified.
- **MF-5** Ensure the author follows: create a ConversationFollow if none exists.
- **MF-6** Process mentions: parse `@` tokens; directive → resolve for the current Conversation; otherwise resolve to a person; create one ConversationMention per person who is not the author; ignore non-resolvable tokens and self-mentions.
- **MF-7** Persist everything in one transaction; RootConversationMessageIDF is always populated (own id for a root message, the thread root for a reply).
- **MF-8** Display the posted message (View Conversation, 62361).

## Alternate flow
- **AF-1** Reply: capture the referenced message id, pre-populate the composer with the reference and an `@` token for each person tagged on the original message; on save store the reference. RootConversationMessageIDF and ReplyToConversationMessageIDF are both set (identical when replying to a root message).

## Out of scope
Notification delivery, message editing or deletion, document permission changes, UI interaction behavior (defined elsewhere).

## References
62674 Process Conversation Message — Mention Notification Specification; 62154 Edit Conversation Message; Conversation Mentions UI Behavior Specification; 62361 View Conversation; Create Document use case.
