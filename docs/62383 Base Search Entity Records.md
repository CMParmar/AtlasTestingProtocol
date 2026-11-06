# **Use Case: CORE.Base Search Entity Records**

---

## **1\. Purpose**

Defines the common behavior Stratym uses to search for entity records.
This use case standardizes how search criteria, layout preferences, sorting, and results are managed across modules while remaining independent of specific entity schemas.

---

## **2\. Scope**

Applies to all entity-level search pages where users can view, filter, and sort records belonging to a single entity (for example, Persons, Accounts, or Projects).
Each module-specific search feature references this use case as its baseline behavior.

---

## **3\. Actors**

**User** – Any authenticated Stratym user authorized to view records for the specified entity.
**System** – Stratym application server and client interface working together to manage criteria, settings, and result rendering.

---

## **4\. Preconditions**

– User is authenticated.
– User has **List** permission for the target entity.
– Valid settings exist defining search criteria, result-view preferences, and at least one primary sort field.

---

## **5\. Postconditions**

– Search results display in the selected layout (Grid or Card).
– User's search criteria, sort order, and layout preferences are persisted through **Update Setting Key Values (62336)**.

---

## **6\. Triggers**

User indicates they want to search for records of a particular entity.

---

## **7\. Related Use Cases**

– **62375 – Read Setting Key Records**
– **62336 – Update Setting Key Values**

---

## **8\. Settings**

| Setting Key | Description | Scope |
| ----- | ----- | ----- |
| `CORE.Search.CriteriaConfig` | Defines which fields and control types are used to filter a given entity. | Global / Entity / User |
| `CORE.Search.ResultPreferences` | Defines default layout, columns, sort, and pagination. | Global / Entity / User |

---

## **9\. Main Flow**

### **MF-1 — Indicate Entity and Load Search Context**

**Stimulus:** User indicates they want to search for records of a particular entity (for example, Person, Account, or Project).
**System Response:**
– System verifies that the user has **List** permission for the target entity.
– System **invokes use case 62375 (Read Setting Key Records)** to retrieve configuration values that define:
  • **search-criteria fields** and their control types; and
  • **result-view preferences** (layout, columns, sort, and pagination).
– System verifies that a **primary sort** is specified in the settings. If none is defined, the system raises a **runtime error**.
– System **applies 62281 Configure Search Results** to determine which fields are available for inclusion in the result set.
– System displays the search interface showing the criteria controls, persisted criteria tags, and both sort selectors (primary and secondary).
– Using these settings, the system **immediately renders the result set** according to the last-used criteria, layout, and sort preferences.

---

### **MF-2 — Modify Search Criteria**

**Stimulus:** User adds, edits, or removes one or more criteria fields.
**System Response:**
– System validates each criterion for correct data type and format.
– Each entered criterion appears as a removable tag summarizing its value.
– Removing a tag clears that criterion from the pending filter set.
– None of these actions (adding, editing, or removing criteria) will cause the system to update the result set.

---

### **MF-3 — Change Result Layout**

**Stimulus:** User changes the result layout to Grid view or Card view.
**System Response:**
– The system **executes MF-4**

---

### **MF-4 — Apply Search and Persist Settings**

**Stimulus:** User executes the Apply or Search command.
**System Response:**
– System compiles all active criteria from the tags.
– System validates the criteria and executes the entity-specific search.
– The system combines all criteria using **AND** logic.
– The result set updates using the chosen layout and sort order.
– If no records match, the system invokes **AF-2 (No Results)**.
– System **invokes use case 62336 (Update Setting Key Values)** to persist the current layout, column configuration, sort selections, and criteria for the user and entity.
– These settings are re-loaded automatically the next time the user performs MF-1.

---

### **MF-5 — Change Sorting Preference**

**Stimulus:** User selects a new primary or secondary sort field.
**System Response:**
– The system **executes MF-4**

---

### **MF-6 — Interact with Results**

**Stimulus:** User reviews or interacts with the displayed results.
**System Response:**
– System allows standard result-set interactions such as page navigation and opening individual records for viewing or editing.

---

## **10\. Alternate Flows**

### **AF-1 — Missing Permission**

**Stimulus:** In MF-1, the user indicates an entity to search but lacks the **List** permission for that entity.
**System Response:**
– System blocks the search operation.
– System invokes scenario **"Insufficient Permission to List Records."**
– No criteria controls or results are displayed until access is granted.

---

### **AF-2 — No Results**

**Stimulus:** In MF-4, the search executes successfully but returns zero matching records.
**System Response:**
– System displays scenario **"No Records Match the Specified Criteria."**
– Criteria tags remain visible so the user can adjust filters and re-apply the search.

---

### **AF-3 — Invalid Criterion**

**Stimulus:** In MF-2 or MF-4, one or more criteria contain invalid or incompatible values (for example, wrong data type or format).
**System Response:**
– System highlights the invalid criterion and disables the search or apply command until the validation error is resolved.

---

### **AF-4 — Missing or Invalid Primary Sort in Settings**

**Stimulus:** In MF-1, the system retrieves settings but finds no valid **primary sort** configuration.
**System Response:**
– System raises a **runtime error** indicating that the required primary sort is missing or invalid.
– System invokes scenario **"Search Configuration Error — Primary Sort Not Defined."**

---

### **AF-5 — Preference Save Failure**

**Stimulus:** In MF-4 or MF-5, system fails to persist updated settings using use case 62336 (Update Setting Key Values).
**System Response:**
– System continues displaying current results without interruption.
– The failure is logged internally for review.
– No message is displayed to the user.

---

## **11\. Scenarios**

| Scenario Name | Linked Step | Context |
| ----- | ----- | ----- |
| **Insufficient Permission to List Records** | AF-1 | Raised when a user attempts to search an entity but lacks the required List permission. |
| **No Records Match the Specified Criteria** | AF-2 | Raised when a search executes successfully but returns zero results. |
| **Search Configuration Error — Primary Sort Not Defined** | AF-4 | Raised when the retrieved settings do not include a valid primary sort definition. |
| **Unable to Save Search Preferences** | AF-5 | Raised when the system fails to persist layout, sort, or criteria preferences; the failure remains internal. |

---

## **12\. Schema Coverage**

| Module | Table / Entity | Purpose |
| ----- | ----- | ----- |
| **SETT** | `SettingKey`, `Setting` | Stores configuration for search criteria, layout, and sorting. |
| **SETT** | `EntityHierarchy` | Defines parent-child relationships between entities used to determine available display fields. |
| **CORE** | `SearchOperator` *(referenced)* | Defines available operators for criteria fields. |
| **AUTH** | `Permission` | Enforces entity-level List permission before search. |

---

## **13\. Business Rules Referenced**

| Rule Name | Module | Purpose |
| ----- | ----- | ----- |
| **Entity Field Resolution for Display** | CORE | Determines which ancestor fields are available for inclusion in the search result set. |

---

## **14\. Revision History**

| Version | Date | Description |
| ----- | ----- | ----- |
| 20251110 | Initial draft | Introduced standardized search flow, persistence logic, and reference to the Entity Field Resolution for Display rule. |
