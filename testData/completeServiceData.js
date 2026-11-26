const { env } = require('../utils/testData');
const { ITEMS } = require('./serviceData');

/**
 * Use case 62477 - Complete Service (module SERV; the sandbox UI calls a Service a "Deliverable").
 * Test-case ids are the use case's "Additional Test Cases" (TC-1 .. TC-12, section 13*).
 * Every test creates its own Deliverable on SERVICE_ACCOUNT_NAME (default "Test case factory") so tests never depend on each other.
 * Names carry keyword + run tag so every run is unique.
 *
 * The sandbox has no "Complete Service" command: the terminal status "Completed" is chosen in the Status dropdown and Save
 * raises the confirmation dialog ("Mark deliverable as complete?") with a "Don't show the confirmation again" box.
 * Ticking that box changes the user's setting PERMANENTLY, so TC-2 / TC-7 only run with COMPLETE_ALLOW_SUPPRESS=true.
 */
const MODULE = 'Service Complete';

const kw = env.keyword;
const tag = env.runTag;
const name = label => `${kw} ${label} Complete Deliverable ${tag}`;

const STATUS = { active: 'Active', completed: 'Completed', canceled: 'Canceled' };
const STAGE = 'Planning';

const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });
const COMPLETER = 'User has PERM.SERV.Service.View, PERM.SERV.Service.Update and PERM.SERV.Service.Complete; confirmation setting is on.';
const NEG = { type: 'Negative' };
/** Manual Service (no workflow, no work items) and a workflow Service (AI Agent: 10 work items, all Not Started). */
const MANUAL = { item: ITEMS.noDefaultTemplate.name, stage: STAGE };
const WORKFLOW = { item: ITEMS.withDefaultTemplate.name };

const completeServiceCases = {
  confirmEnabled: tc('TC-1', 'critical', 'Complete a Service with confirmation enabled', 'Verify choosing Completed and Save raises the confirmation dialog and that confirming completes the Service (MF-1 .. MF-4).', COMPLETER, 'Confirmation required; Service completed.', { data: { ...MANUAL, serviceName: name('Confirm') } }),
  confirmDisabled: tc('TC-2', 'critical', 'Complete a Service with confirmation disabled', 'Verify that once the user switched the confirmation off, Save completes the Service without any dialog (MF-2). Runs only when COMPLETE_ALLOW_SUPPRESS=true because the setting change is permanent.', 'User-scoped override suppresses the confirmation (COMPLETE_ALLOW_SUPPRESS=true).', 'Service completed without confirmation.', { data: { ...MANUAL, serviceName: name('NoConfirm') } }),
  noPermission: tc('TC-3', 'critical', 'Complete a Service without permission', 'Verify a user without PERM.SERV.Service.Complete cannot complete a Service (MF-1). Needs a second user without the permission (not automated).', 'Second user without PERM.SERV.Service.Complete (not automated).', 'Completion blocked.', NEG),
  alreadyCompleted: tc('TC-4', 'critical', 'Complete an already completed Service', 'Verify saving a Service that is already Completed is a no-op: no dialog, no second Completed history row, Actual Completion Date unchanged.', 'Service is already Completed.', 'No-op / idempotent.', { ...NEG, data: { ...MANUAL, serviceName: name('Twice') } }),
  fromCanceled: tc('TC-5', 'critical', 'Complete a canceled Service', 'Verify a Canceled Service can be moved to Completed: the dialog is shown, the status becomes Completed and the canceled banner disappears.', 'Service is Canceled.', 'Service transitions to Completed.', { data: { ...MANUAL, serviceName: name('FromCanceled') } }),

  cancelDialog: tc('TC-6', 'critical', 'Cancel from the completion confirmation dialog', 'Verify Go Back in the dialog changes nothing: after reload the Service keeps its prior status and no Status history row is added.', COMPLETER, 'No state change; no history record.', { ...NEG, data: { ...MANUAL, serviceName: name('GoBack') } }),
  dontPromptAgain: tc('TC-7', 'critical', 'Do not prompt again in the confirmation dialog', 'Verify ticking "Don\'t show the confirmation again" and confirming completes the Service and a following completion needs no confirmation. Runs only when COMPLETE_ALLOW_SUPPRESS=true because the setting change is permanent.', 'COMPLETE_ALLOW_SUPPRESS=true.', 'Service completed; future completions need no confirmation.', { data: { ...MANUAL, serviceName: name('DontAsk') } }),
  openWorkItems: tc('TC-8', 'critical', 'Complete a Service with incomplete work items', 'Verify completion succeeds while work items are still Not Started and the work items are not changed (Business rule 3).', COMPLETER, 'Service completed; work items unchanged.', { data: { ...WORKFLOW, serviceName: name('OpenWorkItems') } }),
  openBilling: tc('TC-9', 'normal', 'Complete a Service with open billing', 'Verify completion succeeds although nothing was billed and billing fields (Billing Type, Estimated Hours) keep their values. Invoices have no UI on the Service, so only these fields can be checked (Business rule 4).', COMPLETER, 'Service completed; billing fields unchanged.', { data: { ...WORKFLOW, serviceName: name('OpenBilling') } }),
  historyRow: tc('TC-10', 'critical', 'Status history recorded on completion', 'Verify exactly one Status history row Completed is appended, earlier rows are unchanged, and the Audit tab shows ServiceStatus Active -> Completed (Business rule 5).', COMPLETER, 'One Status history row for Completed; Audit Active -> Completed.', { data: { ...MANUAL, serviceName: name('History') } }),
  completedDate: tc('TC-11', 'critical', 'Actual Completion Date set on completion', 'Verify the read-only Actual Completion Date is empty before and holds the current date (account time zone) afterwards; the Audit tab records it.', COMPLETER, 'Completion date populated with the current date.', { data: { ...MANUAL, serviceName: name('CompletedDate') } }),
  raisedOnce: tc('TC-12', 'normal', 'Service Completed scenario raised once', 'Verify a single completion produces a single transition (one POST, one Completed history row, one Completed audit change). The scenario itself has no UI, so exactly-once is checked through its visible effects.', COMPLETER, 'Exactly one completion recorded.', { data: { ...MANUAL, serviceName: name('Once') } }),
};

module.exports = { MODULE, STATUS, STAGE, completeServiceCases, name };
