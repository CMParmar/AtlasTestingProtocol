# **Conversation Message Search Configuration**

This document defines all criteria available for **ConversationMessage search** in both Quick Search and Advanced Search.

Conversation search is intended for **cross-context discovery** when the user does *not* know the specific object where a conversation occurred.
If the user knows the object, they will simply navigate to it.

All criteria are optional unless explicitly noted.
All matching is case-insensitive unless noted.

Automated by: `tests/message-search.spec.js` (test cases TC_MSG_001 - TC_MSG_044, defined in `testData/messageSearchData.js`).

---

## **Change Log**

Jan 29, 2026: First version written by Murph & ChatGPT.

---

# **1\. Quick Search Behavior**

Quick Search accepts a single free-text value and evaluates it against the following fields.

## **1.1 Message Text (Contains, Like, Freetext)**

* ConversationMessage.MessageText

Matching behavior:

* Uses Contains / Like if full text search (FTS) is not available.  Otherwise, use FTS.
* Returns individual ConversationMessage rows (no grouping)

---

# **2\. Advanced Search Criteria**

All criteria below appear in Advanced Search.
All criteria are optional.

---

## **2.1 Message Text Criteria**

Textbox.
Same as 1.1 above.

---

## **2.2 Entity Type (Conversation Context)**

Dropdown.
Single-select.
Default: **All**

Filters by the entity that owns the conversation.

Supported values include:

* Account
* Project
* Service
* All other entity types that support conversations are exposed.

Matches against:

* Conversation.EntityIDF

---

## **2.3 Account Scope**

Lookup control (Account ASB or DDL).  The criteria must return a specific AccountID.
Optional.

When specified, limits results to messages belonging to conversations whose owning entity is the selected Account or any object hierarchically contained under that Account

* The selected Account object directly
* All objects under the account, including Project objects associated with the account, Service objects associated with the account, etc.

This scope is **transitive downward**.

---

## **2.4 Project Scope**

Lookup control (Project ASB or DDL).
Optional.

Just like 2.3 above, except we return messages associated with the project.

Notes:

* If both Account Scope and Project Scope are provided, Project Scope further narrows the Account Scope, meaning that the Account messages will not be included in the result set.

---

## **2.5 Messages Source**

Three state toggle.

* All (default): ignore `ConversationMessage.isSystemGenerated`
* Only System messages:  where `ConversationMessage.isSystemGenerated = 1`
* Only Human messages:  where `ConversationMessage.isSystemGenerated = 0`

---

## **2.6 Author**

Lookup control (Person ASB or DDL).  Returns PersonID
Optional.
Single-select.

When specified, limits results to messages authored by the selected person.

Matches against:

* `ConversationMessage.AuthorPersonID`

Notes:

* Intended to support common recall and accountability use cases such as:
  * "What did I write?"
  * "What did a specific team member say?"
* Author filtering is applied only when the user has high confidence in the speaker's identity.
* Author selection narrows the result set but does not affect message ordering or relevance.
* System messages are not included when an Author is selected, regardless of **Message Source** setting.  It would be cool if we could hide this criteria when the user limits results to system messages (not required in Newton cycle).

---

## **2.7 Date Range**

Optional date range filter.

When specified, limits results to messages whose creation timestamp falls within the provided range.

Matches against:

* `ConversationMessage.DateCreatedUtc`

Behavior:

* Start Date is inclusive
* End Date is inclusive
* Date boundaries are interpreted in the **user's timezone**, as defined in the user profile
* Date values are converted to UTC for query execution

Notes:

* Relative or preset date ranges (e.g., "Last 30 days") are not exposed in v1.

---

# **3\. Search Operators Supported**

* Contains
* Equals (used internally for EntityIDF and scope joins)
* In (for dropdown-based filters)

No relevance scoring or weighted ranking is applied in v1.

---

# **4\. Result Ordering**

ConversationMessage search results are ordered as follows:

1. ConversationMessage.DateCreatedUtc (DESC)
2. ConversationMessage.ConversationMessageID (DESC)

This ensures:

* Newest messages appear first
* Stable, deterministic pagination
* No duplicate or missing rows across pages

---

# **5\. deleted**

---

# **6\. Result Unit and Display Constraints**

* Each result row represents **one ConversationMessage**
* Results are displayed using **Card view only**
* Grid view is disabled for ConversationMessage search

Rationale:

* Message content is unstructured, variable-length text
* Card layout supports readability and contextual scanning
* Grid view implies affordances that do not apply to messages

---

# **7\. Result Fields**

Each result row must display:

* Entity Type (textual, e.g., "Account", "Project")
* Entity Name (object display name)
* Message snippet (with matched terms highlighted)  See 62151 Search Result Snippet Rendering Specification
* Author (Person.DisplayName or SystemActor.Name)
* Message timestamp (date & time)

Clicking a result navigates to the parent conversation and scrolls to the referenced message.

---

# **8\. Deletion Handling**

ConversationMessage soft delete is **not currently supported**.

Accordingly:

* No deletion filters are exposed
* All stored messages are eligible for search

This may be revisited if soft delete is added later.

---

# **9\. Permission Enforcement**

ConversationMessage search respects all existing conversation and participant permissions.

Search results must:

* Only include messages the user is authorized to view
* Never return results that cannot be opened

---

# **10\. Explicit Non-Goals (v1)**

ConversationMessage search intentionally does **not** support:

* Searching by a specific object.  This does not conflict with the Account and Project Scope (paragraphs 2.3 & 2.4) above as those criteria allow searching against a collection of objects.
* Grouping or collapsing results by conversation
* Relevance or semantic ranking
* Conversation-level result rows.  We return one row per message, not one row per conversation.

These may be considered in later versions without invalidating this configuration.
