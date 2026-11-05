# **Person Search – Criteria Specification**

This document defines all criteria available for Person search in both Quick Search and Advanced Search.
All criteria are optional.
All matching is case-insensitive unless noted.

---

## Change Log

Nov 21, 2025:  First version written by Murph.

---

# **1\. Quick Search Behavior**

Quick Search accepts a single free-text value and evaluates it against all of the below:

### **1.1 Names (Contains)**

* Person.FirstName
* Person.MiddleName
* Person.LastName
* Person.DisplayName

### **1.2 Emails**

* Match using **Exact Match** against:
  * Person.PrimaryEmail
  * AspNetUsers.Email
  * PersonEmail.EmailAddress

### **1.3 Phone Number (E.164 Only)**

* Normalize input by removing all non-numeric characters
* Compare against PhoneNumber.NumberE164 using Contains logic.

### **1.4 Deletion Filter**

Exclude persons where `Person.isDeleted = 1`.

(Advanced search exposes an “Include Deleted” toggle.)

---

# **2\. Advanced Search Criteria**

All criteria below appear in Advanced Search.

## **2.1 Name Criteria (Contains)**

* First Name
* Middle Name
* Last Name
* Display Name

## **2.2 Email Criteria**

Search against:

* Person.PrimaryEmail
* AspNetUsers.Email
* PersonEmail.EmailAddress

Supported operators:

* Equals (default)
* Contains

## **2.3 Phone Number Criteria**

Search textbox normalizes input by stripping non-numeric characters.
Comparisons are performed **exclusively** against:

* **PhoneNumber.NumberE164**

Supported operators:

* Contains (default)
* Equals

## **2.4 Address Criteria**

The Person search exposes the following address-related criteria. All criteria evaluate against Person-level addresses (Address records with EntityIDF \= Person and EntityRecordID \= PersonID).

#### **Address**

Textbox.
Matches using **Contains** against the following fields:

* Address1
* Address2
* Address3

#### **City**

Textbox.
Matches using **Contains** against:

* City

#### **Region**

Textbox or dropdown (depending on tenant configuration).
Matches using **Contains** against:

* RegionNameText (manual text entry)
* Region.RegionName (when RegionIDF is present)

#### **Postal Code**

Textbox.
Matches using **BeginsWith** against:

* PostalCode

Country is not separately exposed unless later required.

## **2.5 Organization Criteria (Unified Company \+ Account Search)**

Textbox matching using Contains.

### **Company (via Affiliation)**

* Company.DisplayName
* Company.LegalName
* Company.TradeName

### **Account (via AccountPosition)**

* Account.AccountName (Contains)
* Account.AccountNumber (Exact Match)

## **2.6 Staff Role Criterion**

Dropdown from **StaffRole** table (as shown in your BCM diagram).
A Person may match against multiple selected Staff Roles.

## **2.7 Security Role Criterion**

Dropdown listing **AspNetRoles.Name**.
Caption: **Security Role**
Supports multi-select.
Matches where Person → AspNetUsers → AspNetUserRoles → AspNetRoles.

## **2.8 Has User Account**

DDL with 3 options:

* All
* Is User
* Is Not User

Matches: `Person.UserIDF IS NOT NULL`.

## **2.9 Tags**

Multi-select from TagAssignment.
Matches any tag selected.

## **2.10 Include Deleted**

Boolean toggle.
If ON → include persons where `Person.isDeleted = 1`.

## **2.11 Labor Grade**

Dropdown from LaborGrade.
Operator: Equals.

## **2.12 Language**

Dropdown from Language table.
Operator: Equals.

---

# **3\. Search Operators Supported**

* Contains
* Equals
* BeginsWith
* In (for multi-select dropdowns)

---

# **4\. Result Ordering**

Order Person search results as follows:

1. Exact email matches
2. Exact Phone number matches
3. Exact name matches
4. Persons with user accounts
5. Alphabetical by LastName, then FirstName

---

# **5\. Join Requirements**

### **Companies**

Person → Affiliation → Company

### **Accounts**

Person → AccountPosition → Account

### **Staff Role**

Person → AccountPosition → StaffRole

### **Security Role**

Person → AspNetUsers → AspNetUserRoles → AspNetRoles

### **Tags**

Person → TagAssignment → Tag

### **Address**

Person → Address (EntityIDF \= Person, EntityRecordID \= PersonID)
