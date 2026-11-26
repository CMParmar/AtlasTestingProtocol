const { expect } = require('@playwright/test');
const { WorkflowTemplatePage, EDIT_URL } = require('./workflowTemplatePage');

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = s => new RegExp(`^\\s*${esc(s)}\\s*$`);

/**
 * View & Edit Workflow Template (use case 63063) - /WorkflowTemplate/Edit/{id}[?versionId={versionId}].
 * Extends the Create Workflow Template page object (list, wizard, header, Versions / Work Steps readers).
 *
 * Details form #form-workflow-template (posts to /WorkflowTemplate/Edit/{id}): #WorkflowTemplateName, #Description,
 *   #DefaultServiceStageIDF, Save (button[form="form-workflow-template"]), Cancel (link back to the version).
 * Header: Publish Version (.btn-publish-wft-version -> #modal-publish-wft-draft, Publish posts /WorkflowTemplate/Publish/{id}).
 * Actions #wftActionsDropdown: #ddlActionArchiveTemplate, #ddlActionDeleteDraftVersion (data-delete-url, AJAX POST) ->
 *   #confirmModal with #btnWftArchiveConfirm / #btnWftDeleteDraftConfirm ("Yes") and a dismiss button (Go Back / Cancel);
 *   success redirects to data.redirectUrl.
 * Versions: .report-version-card[data-version-id][data-version-number][data-status-name][data-is-draft]; Create Draft
 *   (.btn-create-wft-draft) -> #modal-create-wft-draft (#wft-create-draft-source, #wft-create-draft-step-count,
 *   #wft-create-draft-step-list li, Save = #form-create-wft-draft button[type=submit] -> /WorkflowTemplate/CreateDraft/{id}).
 * Work Steps: .wft-worksteps[data-can-edit], #wft-add-step-btn, rows tr.wft-worksteps__row[data-step-id] (click = edit),
 *   .wft-worksteps__btn-delete (-> #confirmModal "Delete step?", #wftStepDeleteConfirm), .wft-worksteps__gate[data-gate].
 *   Drawers open in #slideOutPanel.is-open:
 *     step  #formWorkflowStep: #StepName, #Description, #EstimatedHours, #PercentComplete, #StaffRoleIDF,
 *           WorkItemTypeIDF radios (Execution / Acceptance), #ServiceStageIDF; Save #btnSaveWorkflowStep is in the
 *           drawer footer, outside the form (POST SaveStep, JSON)
 *     gate  [data-gate-drawer]: [data-gate-phase] select, rows .wft-gate-step[data-step-name][data-is-dependent] with
 *           None / Required / Alternative (labels of [data-gate-selection]) and Started / Completed, [data-gate-error],
 *           Save [data-action="save-gate"] (POST SaveStartGate / SaveCompletionGate, JSON)
 * Deleted / archived templates are never re-opened by the tests (checked through the list instead).
 */
class WorkflowTemplateEditPage extends WorkflowTemplatePage {
  constructor(page) {
    super(page);
    // details
    this.detailsForm = page.locator('#form-workflow-template');
    this.editName = this.detailsForm.locator('#WorkflowTemplateName');
    this.editDescription = this.detailsForm.locator('#Description');
    this.defaultStage = this.detailsForm.locator('#DefaultServiceStageIDF');
    this.saveDetailsButton = page.locator('button[type="submit"][form="form-workflow-template"]');
    this.pageAlerts = page.locator('#alert-js-error, #alert-js-warning, #alert-js-success, #alert-js-info').locator('.alert, [role="alert"], div')
      .filter({ visible: true, hasText: /\S{3}/ });

    // header / actions
    this.publishButton = page.locator('main .btn-publish-wft-version').filter({ visible: true }).first();
    this.publishModal = page.locator('#modal-publish-wft-draft');
    this.actionsButton = page.locator('#wftActionsDropdown');
    this.archiveAction = page.locator('#ddlActionArchiveTemplate');
    this.deleteDraftAction = page.locator('#ddlActionDeleteDraftVersion');
    this.confirmModal = page.locator('#confirmModal');
    this.archiveYes = page.locator('#btnWftArchiveConfirm');
    this.deleteDraftYes = page.locator('#btnWftDeleteDraftConfirm');
    this.confirmDismiss = this.confirmModal.locator('.modal-footer [data-bs-dismiss="modal"], [data-bs-dismiss="modal"].btn').first();

    // versions
    this.createDraftButtons = page.locator('#pane-versions .btn-create-wft-draft');
    this.createDraftModal = page.locator('#modal-create-wft-draft');
    this.createDraftSource = page.locator('#wft-create-draft-source');
    this.createDraftStepCount = page.locator('#wft-create-draft-step-count');
    this.createDraftStepList = page.locator('#wft-create-draft-step-list li');
    this.createDraftSave = page.locator('#form-create-wft-draft button[type="submit"]');

    // work steps
    this.stepsRoot = page.locator('.wft-worksteps');
    this.addStepButton = page.locator('#wft-add-step-btn');
    this.gridRows = page.locator('#wft-worksteps-grid-host tr.wft-worksteps__row');
    this.drawer = page.locator('#slideOutPanel.is-open');
    this.stepForm = this.drawer.locator('#formWorkflowStep');
    // the step drawer's Save sits in the drawer footer (.right-drawer__footer), outside #formWorkflowStep
    this.stepSaveButton = this.drawer.locator('#btnSaveWorkflowStep');
    this.gateDrawer = this.drawer.locator('[data-gate-drawer]');
    this.gateError = this.drawer.locator('[data-gate-error]');
    this.gateSave = this.drawer.locator('[data-action="save-gate"]');
    this.gatePhase = this.drawer.locator('[data-gate-phase]');
  }

  // ------------------------------------------------------------------ navigation
  async openVersion(templateId, versionId) {
    await this.openCreatedRecord(`/WorkflowTemplate/Edit/${templateId}${versionId ? `?versionId=${versionId}` : ''}`);
    await this.title.waitFor({ state: 'visible', timeout: 45_000 });
  }

  // ------------------------------------------------------------------ details (MF-2, MF-3)
  async fillDetails({ templateName, description, defaultStage }) {
    if (templateName !== undefined) await this.editName.fill(templateName);
    if (description !== undefined) await this.editDescription.fill(description);
    if (defaultStage !== undefined) {
      if (defaultStage) await this.defaultStage.selectOption({ label: defaultStage }, { force: true });
      else await this.defaultStage.selectOption('', { force: true });
    }
  }

  async detailsValues() {
    const stage = (await this.defaultStage.inputValue()) ? (await this.defaultStage.locator('option:checked').innerText()).trim() : '';
    return { templateName: await this.editName.inputValue(), description: await this.editDescription.inputValue(), defaultStage: stage };
  }

  async stageOptions(select = this.defaultStage) {
    return (await select.locator('option:not([value=""])').allInnerTexts()).map(t => t.trim());
  }

  detailsMessage(field) {
    return this.detailsForm.locator(`[data-valmsg-for="${field}"]`);
  }

  /** Visible messages after a post-back: field errors, page alerts (also from window.__tempDataAlerts) and pop-ups. */
  async messages(timeout = 8_000) {
    let text = '';
    await expect.poll(async () => {
      const shown = await this.page.locator('main .field-validation-error, #confirmModal.show .modal-content, .validation-summary-errors')
        .filter({ visible: true }).allInnerTexts().catch(() => []);
      const alerts = await this.pageAlerts.allInnerTexts().catch(() => []);
      const data = await this.page.evaluate(() => {
        const a = window.__tempDataAlerts || {};
        return [a.error, a.warning, a.success, a.info].filter(Boolean).map(String);
      }).catch(() => []);
      text = [...new Set([...shown, ...alerts, ...data].map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' | ');
      return text;
    }, { timeout, intervals: [500, 1_000] }).not.toBe('').catch(() => {});
    return text;
  }

  /**
   * Save on the Details tab. Returns { posted, outcome: 'saved' | 'error' | 'invalid', text }:
   * 'invalid' = the browser validation stopped it (no request), 'error' = the server refused it, 'saved' otherwise.
   */
  async saveDetails() {
    const posted = this.page.waitForResponse(r => r.request().method() === 'POST' && /\/WorkflowTemplate\/Edit\/\d+/i.test(r.url()), { timeout: 8_000 })
      .catch(() => null);
    await this.saveDetailsButton.click();
    const response = await posted;
    if (!response) {
      const text = (await this.detailsForm.locator('.field-validation-error').filter({ visible: true }).allInnerTexts()).join(' | ');
      return { posted: false, outcome: 'invalid', text };
    }
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.title.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {});
    const text = await this.messages();
    const failed = /already|duplicate|unique|required|cannot|invalid|error|failed|not allowed/i.test(text) && !/saved|updated|success/i.test(text);
    return { posted: true, outcome: failed ? 'error' : 'saved', text };
  }

  // ------------------------------------------------------------------ publish (test setup)
  async publishDraft() {
    await this.publishButton.click();
    await expect(this.publishModal, 'Publish version? pop-up').toBeVisible({ timeout: 15_000 });
    await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && /\/WorkflowTemplate\/Publish\//i.test(r.url()), { timeout: 60_000 }),
      this.publishModal.locator('button[type="submit"]').click(),
    ]);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.title.waitFor({ state: 'visible', timeout: 45_000 });
    await expect(this.statusBadge, 'Published').toHaveText(/Published/i, { timeout: 30_000 });
  }

  // ------------------------------------------------------------------ versions (MF-4)
  async versionIdOf(number) {
    await this.openTab('Versions');
    return this.versionCards.filter({ has: this.page.locator('*') }).evaluateAll((cards, n) => {
      const c = cards.find(x => x.getAttribute('data-version-number') === String(n));
      return c ? c.getAttribute('data-version-id') : '';
    }, number);
  }

  /** Opens Create Draft for version `number`; returns what the pop-up shows: { source, stepCount, steps }. */
  async openCreateDraft(number) {
    await this.openTab('Versions');
    const button = this.page.locator(`#pane-versions .btn-create-wft-draft[data-version-number="${number}"]`);
    await button.click();
    await expect(this.createDraftModal, 'Create Draft Version pop-up').toBeVisible({ timeout: 15_000 });
    return {
      source: await this.createDraftSource.inputValue(),
      stepCount: Number((await this.createDraftStepCount.innerText()).trim()),
      steps: (await this.createDraftStepList.allInnerTexts()).map(t => t.trim()),
    };
  }

  async saveCreateDraft() {
    await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && /\/WorkflowTemplate\/CreateDraft\//i.test(r.url()), { timeout: 60_000 }),
      this.createDraftSave.click(),
    ]);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.title.waitFor({ state: 'visible', timeout: 45_000 });
  }

  // ------------------------------------------------------------------ work steps grid (MF-5)
  async openWorkSteps() {
    await this.openTab('Work Steps');
    await expect(this.stepsRoot, 'Work Steps').toBeVisible({ timeout: 30_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  async canEditSteps() {
    return (await this.stepsRoot.getAttribute('data-can-edit')) === 'true';
  }

  /** Grid rows: [{ id, index, name, type, role, stage, hours, pct }]. */
  async gridSteps() {
    return this.gridRows.evaluateAll(rows => rows.map(r => {
      const td = [...r.querySelectorAll('td')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
      const name = r.querySelector('.wft-worksteps__name');
      return { id: r.getAttribute('data-step-id'), index: td[0], name: name ? name.textContent.trim() : '', type: td[2], role: td[3], stage: td[4], hours: td[5], pct: td[6] };
    }));
  }

  row(stepName) {
    return this.gridRows.filter({ has: this.page.locator('.wft-worksteps__name', { hasText: exact(stepName) }) }).first();
  }

  async openNewStep() {
    await this.addStepButton.click();
    await expect(this.stepForm, 'Step drawer').toBeVisible({ timeout: 30_000 });
  }

  async openStep(stepName) {
    await this.row(stepName).locator('.wft-worksteps__name').click();
    await expect(this.stepForm, 'Step drawer').toBeVisible({ timeout: 30_000 });
    await expect(this.stepForm.locator('#StepName')).toHaveValue(stepName, { timeout: 15_000 });
  }

  async fillStep({ stepName, description, estimatedHours, percentComplete, staffRole, workItemType, serviceStage }) {
    const f = this.stepForm;
    if (stepName !== undefined) await f.locator('#StepName').fill(stepName);
    if (description !== undefined) await f.locator('#Description').fill(description);
    if (estimatedHours !== undefined) await f.locator('#EstimatedHours').fill(String(estimatedHours));
    if (percentComplete !== undefined) await f.locator('#PercentComplete').fill(String(percentComplete));
    if (staffRole !== undefined) await f.locator('#StaffRoleIDF').selectOption(staffRole ? { label: staffRole } : '', { force: true });
    if (workItemType) await f.locator('label[for^="WorkItemTypeIDF_"]').filter({ hasText: exact(workItemType) }).click();
    if (serviceStage !== undefined) await f.locator('#ServiceStageIDF').selectOption(serviceStage ? { label: serviceStage } : '', { force: true });
  }

  /**
   * Save in the step drawer. Returns { posted, success, message, fieldErrors }; on success waits for the drawer to close
   * and the grid to reload. posted = false: the browser validation stopped it (fieldErrors = the visible messages).
   */
  async saveStep() {
    // The post is detected by its request (sent at once), then its response is awaited without the short limit: on a busy
    // sandbox the save can take well over 8 s and the Save button stays disabled meanwhile (seen right after Create Draft).
    const sent = this.page.waitForRequest(r => r.method() === 'POST' && /\/WorkflowTemplate\/SaveStep/i.test(r.url()), { timeout: 8_000 }).catch(() => null);
    const grid = this.page.waitForResponse(r => /\/WorkflowTemplate\/StepsGrid/i.test(r.url()), { timeout: 120_000 }).catch(() => null);
    await this.stepSaveButton.click();
    const request = await sent;
    const response = request
      ? await Promise.race([request.response(), this.page.waitForTimeout(120_000).then(() => null)]).catch(() => null)
      : null;
    if (request && !response) return { posted: true, success: false, message: 'no response to SaveStep within 120 s', fieldErrors: '' };
    const visibleErrors = async () => (await this.drawer.locator('.field-validation-error, [data-field].text-danger, .text-danger')
      .filter({ visible: true, hasText: /\S/ }).allInnerTexts().catch(() => [])).map(t => t.trim()).join(' | ');
    if (!response) {
      // the browser validation stopped it; some fields (e.g. % Complete, max 100) are only marked invalid, without text
      const invalid = await this.stepForm.locator('input, select, textarea').evaluateAll(els => els
        .filter(e => e.getAttribute('aria-invalid') === 'true' || e.classList.contains('input-validation-error') || (e.validity && !e.validity.valid))
        .map(e => ({ field: e.id || e.name, message: e.validationMessage || '' })));
      return { posted: false, success: false, message: '', fieldErrors: await visibleErrors(), invalid };
    }
    const raw = await response.text().catch(() => '');
    let json = {};
    try { json = JSON.parse(raw); } catch { /* not JSON (server error page) */ }
    if (json.success) {
      await grid;
      await expect(this.drawer, 'Step drawer closed').toHaveCount(0, { timeout: 30_000 });
    }
    const message = json.message || (json.success ? '' : `HTTP ${response.status()}${raw && !raw.trim().startsWith('{') ? ' (not a JSON reply)' : ''}`);
    return { posted: true, success: !!json.success, message, fieldErrors: json.fieldErrors ? JSON.stringify(json.fieldErrors) : await visibleErrors(), status: response.status() };
  }

  /** + Add Step, fill, save; expects success. A save lost to a server error (no validation message) is retried once. */
  async addStep(step) {
    await this.openNewStep();
    await this.fillStep(step);
    let result = await this.saveStep();
    if (!result.success && !result.fieldErrors && (!result.posted || /^HTTP |no response/.test(result.message))) {
      // the step may still have been stored: reload the grid before trying again, so it is never added twice
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.title.waitFor({ state: 'visible', timeout: 45_000 });
      await this.openWorkSteps();
      if (await this.row(step.stepName).isVisible()) result = { success: true };
      else {
        await this.openNewStep();
        await this.fillStep(step);
        result = await this.saveStep();
      }
    }
    expect(result.success, `Step "${step.stepName}" saved (${result.message || result.fieldErrors})`).toBe(true);
    await expect(this.row(step.stepName), `"${step.stepName}" listed`).toBeVisible({ timeout: 30_000 });
  }

  /** X on a step -> "Delete step?" -> Delete step (confirm) or Cancel. Returns the pop-up text. */
  async deleteStep(stepName, confirm = true) {
    await this.row(stepName).locator('.wft-worksteps__btn-delete').click();
    await expect(this.confirmModal, 'Delete step? pop-up').toBeVisible({ timeout: 15_000 });
    const text = (await this.confirmModal.innerText()).replace(/\s+/g, ' ').trim();
    if (confirm) {
      const grid = this.page.waitForResponse(r => /\/WorkflowTemplate\/StepsGrid/i.test(r.url()), { timeout: 30_000 }).catch(() => null);
      await Promise.all([
        this.page.waitForResponse(r => /\/WorkflowTemplate\/DeleteStep/i.test(r.url()), { timeout: 30_000 }),
        this.page.locator('#wftStepDeleteConfirm').click(),
      ]);
      await grid;
      await expect(this.row(stepName), `"${stepName}" removed`).toHaveCount(0, { timeout: 30_000 });
    } else {
      await this.dismissConfirmation();
    }
    return text;
  }

  // ------------------------------------------------------------------ gates (MF-7)
  async openGate(stepName, gate = 'start') {
    await this.row(stepName).locator(`.wft-worksteps__gate[data-gate="${gate}"]`).click();
    await expect(this.gateDrawer, `${gate} gate drawer`).toBeVisible({ timeout: 30_000 });
  }

  gateRow(stepName) {
    return this.gateDrawer.locator('.wft-gate-step').filter({ has: this.page.locator('.wft-gate-step__name', { hasText: new RegExp(`^\\s*\\d+\\.\\s*${esc(stepName)}\\s*$`) }) }).first();
  }

  async setDependency(stepName, selection, condition) {
    const row = this.gateRow(stepName);
    await row.locator('.wft-gate-seg label.btn').filter({ hasText: exact(selection) }).click();
    if (condition && selection !== 'None') await row.locator('[data-gate-condition-wrap] label').filter({ hasText: exact(condition) }).click();
  }

  async setPhase(phase) {
    await this.gatePhase.selectOption(phase ? { label: phase } : '', { force: true });
  }

  /** Save in the gate drawer. Returns { success, message, error }; on success waits for the drawer to close. */
  async saveGate() {
    await expect(this.gateSave, 'Gate Save enabled after a change').toBeEnabled({ timeout: 10_000 });
    const grid = this.page.waitForResponse(r => /\/WorkflowTemplate\/StepsGrid/i.test(r.url()), { timeout: 30_000 }).catch(() => null);
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && /\/WorkflowTemplate\/Save(Start|Completion)Gate/i.test(r.url()), { timeout: 30_000 }),
      this.gateSave.click(),
    ]);
    const json = await response.json().catch(() => ({}));
    if (json.success) {
      await grid;
      await expect(this.drawer, 'Gate drawer closed').toHaveCount(0, { timeout: 30_000 });
      return { success: true, message: json.message || '', error: '' };
    }
    const error = (await this.gateError.innerText().catch(() => '')).trim();
    return { success: false, message: json.message || '', error };
  }

  /** What the open gate drawer shows: { phase, rows: [{ name, dependent, selection: 'None'|'Required'|'Alternative', condition }] }. */
  async readGate() {
    const phase = (await this.gatePhase.inputValue().catch(() => '')) ? (await this.gatePhase.locator('option:checked').innerText()).trim() : '';
    const rows = await this.gateDrawer.locator('.wft-gate-step').evaluateAll(els => els.map(r => {
      const sel = r.querySelector('[data-gate-selection]:checked');
      const cond = r.querySelector('[data-gate-condition-wrap] input[type="radio"]:checked');
      const condLabel = cond ? (r.querySelector(`label[for="${cond.id}"]`) || {}).textContent : '';
      return {
        name: r.getAttribute('data-step-name'),
        dependent: r.getAttribute('data-is-dependent') === 'true',
        badge: (r.querySelector('.wft-gate-dependent-badge') || {}).textContent ? r.querySelector('.wft-gate-dependent-badge').textContent.trim() : '',
        hasChoice: !!r.querySelector('[data-gate-selection]'),
        selection: sel ? ({ 0: 'None', 1: 'Required', 2: 'Alternative' })[sel.value] : 'None',
        condition: sel && sel.value !== '0' && condLabel ? condLabel.trim() : '',
      };
    }));
    return { phase, rows };
  }

  async closeDrawer() {
    await this.drawer.locator('[data-drawer-close]').first().click();
    await expect(this.drawer).toHaveCount(0, { timeout: 15_000 });
  }

  // ------------------------------------------------------------------ archive / delete draft (MF-8, MF-9)
  async openAction(action) {
    await expect(async () => {
      if (!(await action.isVisible())) await this.actionsButton.click({ timeout: 5_000 });
      await expect(action).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000] });
    await action.click();
    await expect(this.confirmModal, 'Confirmation pop-up').toBeVisible({ timeout: 15_000 });
    return (await this.confirmModal.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Cancel / Go Back in #confirmModal. A click while the pop-up is still fading in is ignored, so it is retried until it closes. */
  async dismissConfirmation() {
    await expect(async () => {
      if (await this.confirmModal.isVisible()) await this.confirmDismiss.click({ timeout: 3_000 });
      await expect(this.confirmModal).toBeHidden({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000] });
  }

  /**
   * "Yes" in the Archive / Delete Draft confirmation. On success the page script goes straight to data.redirectUrl, so
   * the JSON answer usually cannot be read any more (the browser drops the body when the page navigates): success is
   * the JSON's success flag when readable, else "the request succeeded and the page navigated". On failure the page stays
   * and shows the message. Returns { success, status, message, url }.
   */
  async confirmDestructive(yesButton, urlPattern) {
    const navigated = this.page.waitForEvent('framenavigated', { predicate: f => f === this.page.mainFrame(), timeout: 60_000 }).then(() => true, () => false);
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && urlPattern.test(r.url()), { timeout: 60_000 }),
      yesButton.click(),
    ]);
    const status = response.status();
    const json = await response.json().catch(() => null);
    if (json && json.success === false) {
      return { success: false, status, message: json.message || (await this.messages(5_000)), url: this.page.url() };
    }
    const moved = await navigated;
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    const success = (json && json.success === true) || (status < 400 && moved);
    return { success, status, message: (json && json.message) || (success ? '' : await this.messages(5_000)), url: this.page.url() };
  }

  /** Banner of an archived template: "This Workflow Template was Archived on <date> at <time>". */
  archivedBanner() {
    return this.page.getByText(/This Workflow Template was Archived on/i).first();
  }

  /** Actions menu entries (text). */
  async actionNames() {
    return (await this.page.locator('[aria-labelledby="wftActionsDropdown"] .dropdown-item').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  }
}

module.exports = { WorkflowTemplateEditPage, EDIT_URL };
