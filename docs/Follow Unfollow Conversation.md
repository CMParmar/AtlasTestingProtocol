# Follow & Unfollow a Conversation

**Module:** COMM - Communication / Conversations
**Version 1.0** - Oct 2025 (Alina): initial version. **2.0** - 7 Jan 2026 (Murph): standalone use case. **Additional Test Cases** - 23 Mar 2026 (Dharit).

## Goal
Allow a user to explicitly follow or unfollow a Conversation by toggling their persisted follow state.

## Tables
COMM.Conversation (referenced), COMM.ConversationParticipant (referenced), COMM.ConversationFollow (created / removed).

## Permissions
PERM.COMM.Conversation.View and View on the parent entity record. No additional permission is needed to persist the follow state.

## Business rule
Follow state is the presence (followed) or absence (unfollowed) of a ConversationFollow record for the current ConversationParticipant.

## Main flow
**MF-1 Toggle Follow State** - identify the user's ConversationParticipant; Follow creates a ConversationFollow if none exists; Unfollow removes the existing one if present; persist the result. Redundant actions change nothing and show no message.

## Automation (tests/conversation-follow.spec.js)
| Use-case case | Test | Notes |
|---|---|---|
| T-1 | TC-01 | follow; count +1; persisted |
| T-2 | TC-02 | unfollow; count -1; persisted |
| T-3 | TC-03 | already followed: label click + replayed request, no error, no duplicate |
| T-4 | TC-04 | not followed: label click + replayed request, nothing deleted |
| T-5 | TC-05 | no alert/toast, no message added |
| T-6, T-8 | TC-06 | count moves by exactly one; panel unchanged (table rows are not visible in the UI) |
| T-7 | TC-07 | state persisted exactly as shown |
| T-9 | TC-08 | Conversation unchanged by Follow |
| T-10 | TC-09 | Conversation unchanged by Unfollow |
| T-14 | TC-10 | Follow, Unfollow, Follow: final state followed, one record |
| MF-1 | TC-11 | toggle shown with the current state |
| T-11, T-12, T-13 | not automated | need a user without View / without parent View / without a participant record |

UI: radio group "Follow toggle" (`#follow_<id>` / `#unfollow_<id>`), follower count `.follower-count span`; the change posts to `POST /SignalCenter/ToggleFollow { conversationID, isFollowing }`.
