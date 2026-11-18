# **Company Search – Criteria Specification**

This document defines all criteria available for Company search in both Quick Search and Advanced Search.

All criteria are optional.

All matching is case-insensitive unless noted.

---

## **Change Log**

May 11, 2026: First version written by Murph and ChatGPT.

---

# **1\. Quick Search Behavior**

Quick Search accepts a single free-text value and evaluates it against all of the below.

## **1.1 Company Names (Contains)**

Search against:

* Company.DisplayName  
* Company.LegalName  
* Company.TradeName

## **1.2 Website (Contains)**

Search against:

* Company.Website

## **1.3 Account Fields**

Search against Account records owned by the Company.

### **Account Name**

Matches using **Contains** against:

* Account.AccountName

### **Account Number**

Matches using **Exact Match** against:

* Account.AccountNumber

## **1.4 Phone Number (E.164 Only)**

Normalize input by removing all non-numeric characters.

Compare against PhoneNumber.NumberE164 using **Contains** logic.

All phone comparisons are performed exclusively against:

* PhoneNumber.NumberE164

## **1.5 Deletion Filter**

Exclude companies where:

* Company.IsDeleted \= 1

Advanced Search exposes an **Include Deleted** toggle.

---

# **2\. Advanced Search Criteria**

All criteria below appear in Advanced Search.

## **2.1 Company Name Criteria (Contains)**

The Company search exposes the following company name criteria:

* Display Name  
* Legal Name  
* Trade Name

Each criterion matches using **Contains**.

## **2.2 Website Criterion**

Textbox.

Matches using **Contains** against:

* Company.Website

## **2.3 EIN Criterion**

Textbox.

Matches using **Equals** against:

* Company.EIN

Supported operators:

* Equals

EIN is not evaluated by Quick Search.

## **2.4 Company Entity Type Criterion**

Dropdown from CompanyEntityType.

Matches using **Equals** against:

* Company.CompanyEntityTypeIDF

Only active Company Entity Type records are selectable.

## **2.5 Company Role Criterion**

Matches using **In** against roles assigned through CompanyRoleAssignment.

Only active Company Role records are selectable.

A Company may match against multiple selected Company Roles.

## **2.6 Account Criteria**

The Company search exposes the following Account-related criteria. All criteria evaluate against Account records where the Account is owned by the Company.

### **Account Name**

Textbox.

Matches using **Contains** against:

* Account.AccountName

### **Account Number**

Textbox.

Matches using **Equals** against:

* Account.AccountNumber

### **Account Status**

Dropdown from AccountStatus.

Matches using **Equals** against:

* Account.AccountStatusIDF

## **2.7 Affiliated Person Criterion**

Person picker or textbox, depending on the standard control available for Person lookup.

Matches Companies through Affiliation records.

A Company matches when the selected or entered Person is affiliated with the Company through:

* Affiliation.CompanyIDF  
* Affiliation.PersonIDF

## **2.8 Phone Number Criteria**

Search textbox normalizes input by stripping non-numeric characters.

Comparisons are performed exclusively against:

* PhoneNumber.NumberE164

Supported operators:

* Contains (default)  
* Equals

## **2.9 Address Criteria**

The Company search exposes the following address-related criteria.

All criteria evaluate against Company-level addresses:

* Address.EntityIDF \= Company  
* Address.EntityRecordID \= Company.CompanyID

### **Address**

Textbox.

Matches using **Contains** against the following fields:

* Address.Address1  
* Address.Address2  
* Address.Address3

### **City**

Textbox.

Matches using **Contains** against:

* Address.City

### **Region**

Textbox or dropdown, depending on tenant configuration.

Matches using **Contains** against:

* Address.RegionNameText  
* Region.RegionName, when Address.RegionIDF is present

### **Postal Code**

Textbox.

Matches using **BeginsWith** against:

* Address.PostalCode

Country is not separately exposed unless later required.

## **2.10 Include Deleted**

Boolean toggle.

If ON, include Companies where:

* Company.IsDeleted \= 1

If OFF, exclude Companies where:

* Company.IsDeleted \= 1

Default: OFF.

---

# **3\. Search Operators Supported**

Company search supports the following operators:

* Contains  
* Equals  
* BeginsWith  
* In

---

# **4\. Result Ordering**

Order Company search results as follows:

1. Exact Account Number matches  
2. Exact Company Display Name matches  
3. Exact Company Legal Name matches  
4. Exact Company Trade Name matches  
5. Exact Phone Number matches  
6. Companies with Customer role  
7. Alphabetical by Company.DisplayName

---

# **5\. Preset Searches**

The following Presets are provided by default.

## **5.1 Customer Companies**

Only returns companies that have an Account where AccountStatus \= Active

Excludes deleted Companies.
