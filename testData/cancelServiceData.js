const { env } = require('../utils/testData');
const { ITEMS } = require('./serviceData');

/**
 * Use case 62476 - Cancel Service (module SERV; the sandbox UI calls a Service a "Deliverable").
 * Test-case ids are the use case's "Additional Test Cases" (T-1 .. T-18, section 13*); T-19 and up are extra cases found on
 * the live sandbox (Go back from the dialog, the "Continue anyway" override of the blocked clock-in dialog).
 * Every test creates its own Deliverable on SERVICE_ACCOUNT_NAME (default "Test case factory") so tests never depend on each other.
 * Names carry keyword + run tag so every run is unique.
 *
 * The sandbox has no "Cancel Service" command: the terminal status "Canceled" is chosen in the Status dropdown and Save raises the
 * cancel dialog (optional reason). The reason is shown as the Justification of the Status history row.
 */
const MODULE = 'Service Cancel';

const kw = env.keyword;
const tag = env.runTag;
const name = label => `${kw} ${label} Cancel Deliverable ${tag}`;

const STATUS = { active: 'Active', canceled: 'Canceled', completed: 'Completed' };
const STAGE = 'Planning';

/** Justification cell of a status row that has no reason. */
const NO_REASON = '—';
/** Reason with punctuation and markup characters: it must be stored and shown exactly as typed. */
const REASON = 'Client stopped the work - scope "A&B" <moved> 100% to next year';
const SHORT_REASON = 'Duplicate of another Deliverable';

const MESSAGES = {
  addBlocked: /Work Items cannot be added to a Service in a terminal state/i,
  statusBlocked: /Work Item status cannot be changed when the Service or Project is in a terminal state/i,
  clockBlocked: /current status is Canceled, which does not allow clocking in/i,
};

const tc = (id, severity, title, description, condition, expected, extra = {}) => ({ id, severity, name: title, description, condition, expected, ...extra });
const CANCELER = 'User has PERM.SERV.Service.View, PERM.SERV.Service.Update and PERM.SERV.Service.Cancel.';
const NEG = { type: 'Negative' };
/** Manual Service (no workflow, no work items) and a workflow Service (AI Agent: 10 work items, Stage locked to the template). */
const MANUAL = { item: ITEMS.noDefaultTemplate.name, stage: STAGE };
const WORKFLOW = { item: ITEMS.withDefaultTemplate.name };

const cancelServiceCases = {
  // --- MF-1 .. MF-4 Cancel ---
  cancelActive: tc('T-1', 'critical', 'Cancel an active Service', 'Verify canceling an Active Service sets ServiceStatus to Canceled, shows the canceled banner and records the status change in the history (MF-1 .. MF-4).', CANCELER, 'ServiceStatus = Canceled; Status history row Canceled recorded.', { data: { ...MANUAL, serviceName: name('Active') } }),
  cancelNoReason: tc('T-2', 'critical', 'Cancel a Service without a reason', 'Verify the cancellation reason is optional: confirming the dialog with an empty reason cancels the Service (MF-1, MF-2).', CANCELER, 'Cancellation succeeds.', { data: { ...MANUAL, serviceName: name('NoReason') } }),
  cancelWithReason: tc('T-3', 'critical', 'Cancel a Service with a reason', 'Verify a typed cancellation reason is stored: it is shown as the justification of the Canceled status (MF-3).', CANCELER, 'Reason stored on the Service and shown in the history.', { data: { ...MANUAL, serviceName: name('WithReason') } }),

  // --- MF-3 clocks (62510 Clock Out) ---
  oneClock: tc('T-4', 'critical', 'Cancel a Service with one active time clock', 'Verify canceling a Service whose work item has a running clock invokes Clock Out: the clock is closed and ServiceStatus is Canceled (MF-3, 62510).', `${CANCELER} No other clock of the user is running.`, 'Running clock closed; ServiceStatus = Canceled.', { data: { ...WORKFLOW, serviceName: name('OneClock') } }),
  manyClocks: tc('T-5', 'critical', 'Cancel a Service with multiple active time clocks', 'Verify every open TimeClock row of the Service is closed by the cancellation (MF-3, 62510). The application lets a user run one clock at a time, so several open clocks cannot be created from the UI (not automated).', 'Several users with a running clock on the Service (not automated).', 'All open clocks closed.'),
  noClock: tc('T-6', 'normal', 'Cancel a Service with no active time clocks', 'Verify a Service whose work items have no running clock is canceled and no clock is created or changed (MF-3).', CANCELER, 'Cancellation succeeds; no clock running.', { data: { ...WORKFLOW, serviceName: name('NoClock') } }),

  // --- MF-3 history / stage ---
  historyRecorded: tc('T-7', 'critical', 'Service status history recorded on cancel', 'Verify exactly one Status history row Canceled is inserted and the Audit tab shows ServiceStatus Active -> Canceled (MF-3).', CANCELER, 'One new Status history row for Canceled; Audit row Active -> Canceled.', { data: { ...MANUAL, serviceName: name('History') } }),
  stageUnchanged: tc('T-8', 'critical', 'Service stage unchanged on cancel', 'Verify ServiceStatus changes to Canceled while ServiceStage keeps its value and no Stage history row is added (Business rule 1).', CANCELER, 'Stage and Stage history unchanged.', { data: { ...MANUAL, serviceName: name('Stage') } }),

  // --- AF-1 / blocked repeat ---
  alreadyCanceled: tc('T-9', 'critical', 'Cancel an already canceled Service', 'Verify a Service that is already Canceled cannot be canceled again: Save does not raise the cancel dialog and no second Canceled status row is recorded (MF-1).', 'Service is already Canceled.', 'Blocked; no second cancellation.', { ...NEG, data: { ...MANUAL, serviceName: name('Twice') } }),
  noPermission: tc('T-10', 'critical', 'Cancel a Service without permission', 'Verify a user without PERM.SERV.Service.Cancel cannot cancel and the permission-denied scenario is shown (AF-1). Needs a second user without the permission (not automated).', 'Second user without PERM.SERV.Service.Cancel (not automated).', 'Cancellation prevented; permission-denied scenario invoked.', NEG),

  // --- Blocked after cancel ---
  clockInBlocked: tc('T-11', 'critical', 'Clock in after cancel is blocked', 'Verify clocking in on a work item of a canceled Service raises the "Work item is blocked" dialog naming the canceled status and that choosing Cancel starts no clock.', 'Canceled Service with work items; no clock of the user is running.', 'Blocked dialog shown; no clock started.', { ...NEG, data: { ...WORKFLOW, serviceName: name('ClockIn') } }),
  workItemCreateBlocked: tc('T-12', 'critical', 'Create a work item after cancel is blocked', 'Verify adding a work item to a canceled Service is refused with "Work Items cannot be added to a Service in a terminal state." and the work item list is unchanged.', 'Canceled Service with work items.', 'Refused; work item count unchanged.', { ...NEG, data: { ...WORKFLOW, serviceName: name('AddWorkItem') } }),
  workItemCompleteBlocked: tc('T-13', 'critical', 'Complete a work item after cancel is blocked', 'Verify changing a work item to Completed on a canceled Service is refused with "Work Item status cannot be changed when the Service or Project is in a terminal state." and the status stays.', 'Canceled Service with work items.', 'Refused; work item status unchanged.', { ...NEG, data: { ...WORKFLOW, serviceName: name('CompleteWorkItem') } }),
  automationSuppressed: tc('T-14', 'critical', 'Automation stage advance after cancel is suppressed', 'Verify the work item change that would drive the workflow (and the stage advance) is refused on a canceled Service, so Stage and Stage history stay unchanged. The "logged" part cannot be seen in the UI (no automation log is shown).', 'Canceled workflow Service.', 'Stage unchanged; no Stage history row added.', { ...NEG, data: { ...WORKFLOW, serviceName: name('Automation') } }),

  // --- Side effects ---
  historyUntouched: tc('T-15', 'critical', 'Cancel does not modify delivery history', 'Verify the existing work items (count, titles, statuses) and the earlier Status / Stage history rows are the same after cancellation (Goal).', CANCELER, 'Work items and earlier history rows unchanged.', { data: { ...WORKFLOW, serviceName: name('DeliveryHistory') } }),
  financialUntouched: tc('T-16', 'normal', 'Cancel does not modify financial data', 'Verify the financial fields the Service shows (Billing Type, Estimated Hours) keep their values. Billing, invoicing and accounting records have no UI on the Service, so only these fields can be checked (Business rule 3).', CANCELER, 'Billing Type and Estimated Hours unchanged.', { data: { ...WORKFLOW, serviceName: name('Financial') } }),
  reasonOmitted: tc('T-17', 'critical', 'Cancel when the reason is omitted', 'Verify the Service is canceled and the cancellation reason stays blank (the Canceled status row shows no justification).', CANCELER, 'Canceled; CancellationReason blank.', { data: { ...MANUAL, serviceName: name('ReasonOmitted') } }),
  reasonProvided: tc('T-18', 'critical', 'Cancel when the reason is provided', 'Verify the exact entered reason (punctuation, quotes, angle brackets, ampersand, percent) is persisted and displayed unchanged.', CANCELER, 'Canceled; exact CancellationReason persisted.', { data: { ...MANUAL, serviceName: name('ReasonProvided') } }),

  // --- Extra cases found on the sandbox ---
  goBack: tc('T-19', 'normal', 'Go back from the cancel dialog keeps the Service active', 'Verify choosing Go back in the cancel dialog cancels nothing: after reload the Service is still Active, with no Canceled history row (MF-1).', CANCELER, 'Service stays Active; no history row.', { ...NEG, data: { ...MANUAL, serviceName: name('GoBack') } }),
  continueAnyway: tc('T-20', 'critical', 'Clock in is not possible on a canceled Service, even with "Continue anyway"', 'Verify the blocked clock-in dialog does not let the user clock in on a canceled Service: "Blocked" means no clock starts (use case T-11).', 'Canceled Service with work items; no clock of the user is running.', 'No clock started.', { ...NEG, data: { ...WORKFLOW, serviceName: name('ContinueAnyway') }, defect: 'The blocked clock-in dialog offers "Continue anyway" and it clocks in on a work item of a canceled Service' }),
};

module.exports = { MODULE, STATUS, STAGE, NO_REASON, REASON, SHORT_REASON, MESSAGES, cancelServiceCases, name };
