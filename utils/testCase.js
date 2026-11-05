const allure = require('allure-js-commons');

/**
 * Test-case metadata travels to reporters as Playwright annotations:
 *  - static ones (TestCaseNo, TestCaseName, Description, Condition, Module) via test details
 *  - runtime ones (TestValues, CreatedRecord) via testInfo.annotations
 * The Excel reporter reads them; Allure gets the same data as labels/parameters.
 */

const DEFAULT_EXPECTED = 'Record is saved, "Your new record has been added." is shown and every entered value is displayed on the saved record.';

/** Details object for test(title, details, fn). tc.type: 'Positive' (default) | 'Negative'. */
function tcDetails(tc, module) {
  const type = tc.type || 'Positive';
  return {
    tag: [`@${module.toLowerCase().replace(/\s+/g, '-')}`, `@${tc.id}`, `@${type.toLowerCase()}`],
    annotation: [
      { type: 'TestCaseNo', description: tc.id },
      { type: 'TestCaseName', description: tc.name },
      { type: 'Description', description: tc.description },
      { type: 'Condition', description: tc.condition },
      { type: 'ExpectedResult', description: tc.expected || DEFAULT_EXPECTED },
      { type: 'TestType', description: type },
      { type: 'Module', description: module },
    ],
  };
}

const tcTitle = tc => `${tc.id} - ${tc.name}`;

async function applyAllureLabels(tc, module) {
  await allure.epic('Atlas CRM - Sandbox');
  await allure.feature(module);
  await allure.story(tc.name);
  await allure.severity(tc.severity || 'normal');
  await allure.owner('QA Automation');
  await allure.testCaseId(tc.id);
  await allure.tag(tc.type || 'Positive');
  await allure.description(`${tc.description}\n\nPre-condition: ${tc.condition}\n\nExpected: ${tc.expected || DEFAULT_EXPECTED}`);
}

const fmtPhone = p => `+1 ${p.number} (${p.type})`;
const fmtAddress = a =>
  `${a.type ? a.type + ': ' : ''}${a.recipientName}, ${a.address1}${a.address2 ? ', ' + a.address2 : ''}, ${a.city}, ${a.state} ${a.postalCode}`;

const LABELS = {
  firstName: 'First Name', middleName: 'Middle Name', lastName: 'Last Name', handle: 'Handle', email: 'Email',
  tradeName: 'Trade Name', legalName: 'Legal Name', entityType: 'Entity Type', ein: 'EIN', roles: 'Company Roles',
  website: 'Website', phone: 'Phone', address: 'Address', username: 'Username', password: 'Password', url: 'URL',
  displayName: 'Display Name',
  parent: 'Parent', accountNumber: 'Account Number', accountName: 'Account Name', accountStatus: 'Account Status', paymentTerm: 'Payment Term',
  timeZone: 'Time Zone', billingAddress: 'Billing Address', billingType: 'Billing Type',
  accountingCustomerKey: 'Accounting Customer Key', credentials: 'Credentials', targetName: 'Target User',
  targetEmail: 'Target Email', entry: 'Opened Via', search: 'Search Text', channel: 'Request Channel', channelId: 'Phone Number / Meeting ID',
  projectName: 'Project Name', account: 'Account', projectStatus: 'Project Status', projectType: 'Project Type',
  templateVersion: 'Template Version', currentPhase: 'Current Phase', projectCode: 'Project Code', description: 'Description',
  estimatedHours: 'Estimated Hours', scheduledStart: 'Scheduled Start Date', dueDate: 'Due Date',
  actualStart: 'Actual Start Date', actualCompletion: 'Actual Completion Date',
  serviceItem: 'Deliverable Type', serviceName: 'Deliverable Name', serviceStatus: 'Deliverable Status', serviceStage: 'Deliverable Stage',
  project: 'Project', orderedDate: 'Date Ordered', action: 'Action',
  question: 'Verification Question', reauth: 'Re-authentication', useParentBilling: 'Use Owner Billing Address', ownerAddress: 'Owner Billing Address',
};

function fmtValue(k, v) {
  if (k === 'phone') return fmtPhone(v);
  if (k === 'address' || k === 'billingAddress' || k === 'ownerAddress') return fmtAddress(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

/** Converts a person/company data object into ordered [label, value] pairs. */
function toFields(data) {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => [LABELS[k] || k, fmtValue(k, v)]);
}

/** Records the values a test used (Excel "Test Values" column + Allure parameters). */
async function recordTestValues(testInfo, data) {
  const fields = toFields(data);
  testInfo.annotations.push({ type: 'TestValues', description: fields.map(([k, v]) => `${k}: ${v}`).join('\n') });
  for (const [k, v] of fields) await allure.parameter(k, v, k === 'Password' ? { mode: 'masked' } : undefined);
}

/** Records a record created in the sandbox (Excel data sheets + Allure link). */
async function recordCreated(testInfo, module, tc, data, record) {
  testInfo.annotations.push({
    type: 'CreatedRecord',
    description: JSON.stringify({
      module, testCaseNo: tc.id, testType: tc.type || 'Positive',
      fields: Object.fromEntries(toFields(data)), recordId: record.id, url: record.url,
    }),
  });
  await allure.link(record.url, `${module} record #${record.id || '?'}`);
}

/**
 * Records a person/company updated in the sandbox: previous and new value of every changed field
 * (update-reporter's dated workbook + Allure link).
 */
async function recordUpdated(testInfo, module, tc, before, after, record) {
  const show = (k, v) => (v === undefined || v === '' ? '(empty)' : fmtValue(k, v));
  const changes = Object.keys(after)
    .filter(k => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
    .map(k => ({ field: LABELS[k] || k, from: show(k, before[k]), to: show(k, after[k]) }));
  testInfo.annotations.push({
    type: 'UpdatedRecord',
    description: JSON.stringify({
      module, testCaseNo: tc.id, testType: tc.type || 'Positive', updatedAt: new Date().toISOString(),
      name: after.targetName || after.projectName || after.accountName || after.tradeName || after.legalName || [after.firstName, after.middleName, after.lastName].filter(Boolean).join(' '),
      changes, recordId: record.id, url: record.url,
    }),
  });
  await allure.link(record.url, `Updated ${module} record #${record.id || '?'}`);
}

/** The record a test worked on without creating / updating it (Excel "URL" column + Allure link). */
async function recordUrl(testInfo, url, label = 'Record') {
  testInfo.annotations.push({ type: 'RecordURL', description: url });
  await allure.link(url, label);
}

module.exports = { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUpdated, recordUrl, toFields };
