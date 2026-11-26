const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');

const LIST_PATH = '/Setting/WorkflowTemplateList';
const EDIT_URL = /\/WorkflowTemplate\/Edit\/(\d+)/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Create Workflow Template (use case 63069).
 *
 * List: Settings -> Workflow Templates = /Setting/WorkflowTemplateList - search #wftSearch, "Result: n"
 * (#wftResultsCount), DataTable #workflowTemplatesTable (rows tr[data-template-id]: expand, Name a.name-link ->
 * /WorkflowTemplate/Edit/{id}, Active, Status badge, Deliverable Items, Version, Last Edited; page size #dt-length-0),
 * "Create Template" (#wtBtnOpenCreateWizard).
 *
 * Wizard #modal-create-workflow-template (moved under <body> by its script):
 *   step [data-wt-step="1"]           cards .wt-option-card[data-wt-method="scratch"|"copy"] (selected: --selected),
 *                                     Continue #wtBtnStep1Continue (disabled until a card is chosen)
 *   step [data-wt-step="2-standard"]  #WorkflowTemplateName (maxlength 100), #Description (maxlength 500), field
 *                                     messages [data-valmsg-for], #wtStandardServerError, Create #wtBtnCreateStandard
 *                                     (POST /WorkflowTemplate/Create -> JSON; success redirects, a duplicate name opens
 *                                     #confirmModal with an Ok button)
 *   step [data-wt-step="2-copy"]      loaded from /WorkflowTemplate/CopySourceList: #wtCopySearch, #wtCopyResultsCount,
 *                                     rows .wt-copy-row[data-template-id][data-version-id][data-status][data-eligible]
 *                                     (clicking a row selects / deselects it), expand .wt-copy-expand-btn, hidden step
 *                                     lists #wt-copy-steps-{templateId} .wft-step-item, #wtCopyNoResults,
 *                                     Create #wtBtnCreateCopy (POST /WorkflowTemplate/CreateFromCopy)
 *   every step: Go Back [data-wt-goback], Cancel [data-bs-dismiss="modal"]
 *
 * Template page /WorkflowTemplate/Edit/{id}: header status badge + "Version n", name (.page-title), Created by /
 * Last edited by / Active (BasicInfo), tabs Details (#WorkflowTemplateName, #Description), Versions
 * (.report-version-card[data-version-number][data-status-name][data-is-draft]), Work Steps (tr.wft-worksteps__row
 * .wft-worksteps__name), Deliverable items, Tasks, Audit.
 */
class WorkflowTemplatePage extends BasePage {
  constructor(page) {
    super(page);
    // list
    this.search = page.locator('#wftSearch');
    this.resultsCount = page.locator('#wftResultsCount');
    this.table = page.locator('#workflowTemplatesTable');
    this.rows = this.table.locator('tbody tr[data-template-id]');
    this.pageSize = page.locator('select[id^="dt-length"]').first();
    this.createButton = page.locator('#wtBtnOpenCreateWizard');

    // wizard
    this.wizard = page.locator('#modal-create-workflow-template');
    this.wizardTitle = this.wizard.locator('#wtWizardTitle');
    this.step1 = this.wizard.locator('[data-wt-step="1"]');
    this.stepStandard = this.wizard.locator('[data-wt-step="2-standard"]');
    this.stepCopy = this.wizard.locator('[data-wt-step="2-copy"]');
    this.scratchCard = this.wizard.locator('.wt-option-card[data-wt-method="scratch"]');
    this.copyCard = this.wizard.locator('.wt-option-card[data-wt-method="copy"]');
    this.continueButton = this.wizard.locator('#wtBtnStep1Continue');
    this.nameInput = this.stepStandard.locator('#WorkflowTemplateName');
    this.descriptionInput = this.stepStandard.locator('#Description');
    this.nameMessage = this.stepStandard.locator('[data-valmsg-for="WorkflowTemplateName"]');
    this.serverError = this.wizard.locator('#wtStandardServerError');
    this.createStandardButton = this.wizard.locator('#wtBtnCreateStandard');
    this.createCopyButton = this.wizard.locator('#wtBtnCreateCopy');
    this.copySearch = this.wizard.locator('#wtCopySearch');
    this.copyCount = this.wizard.locator('#wtCopyResultsCount');
    this.copyRows = this.wizard.locator('.wt-copy-row');
    this.copyVisibleRows = this.copyRows.filter({ visible: true });
    this.copyNoResults = this.wizard.locator('#wtCopyNoResults');
    this.copyChildSteps = this.wizard.locator('.wt-copy-child-row .wft-step-item');
    this.duplicateModal = page.locator('#confirmModal').filter({ visible: true });
    this.duplicateOk = this.duplicateModal.locator('button[data-bs-dismiss="modal"]').first();

    // template page
    this.headerBadges = page.locator('main .page-heading-sec .badges');
    this.statusBadge = this.headerBadges.locator('.badge').first();
    this.versionBadge = this.headerBadges.getByText(/^\s*Version \d+\s*$/).first();
    this.title = page.locator('main .page-heading-sec .page-title').first();
    this.basicInfo = page.locator('main [data-containerkey$="BasicInfo"]');
    this.detailName = page.locator('main #WorkflowTemplateName');
    this.detailDescription = page.locator('main #Description');
    this.versionCards = page.locator('#pane-versions .report-version-card');
    this.stepRows = page.locator('#pane-worksteps tr.wft-worksteps__row');
    this.stepNames = this.stepRows.locator('.wft-worksteps__name');
  }

  static get listPath() {
    return LIST_PATH;
  }

  // ------------------------------------------------------------------ list
  async gotoList() {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.openRecord(LIST_PATH, { timeout: 60_000 });
        await this.createButton.waitFor({ state: 'visible', timeout: 45_000 });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
      }
    }
    await this.page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});
    await expect(this.resultsCount, 'List loaded (Result count)').toHaveText(/\d/, { timeout: 30_000 });
  }

  /** Every template name of the list (page size "All"). */
  async allNames() {
    await this.search.fill('');
    await this.pageSize.selectOption('-1').catch(() => {});
    await expect.poll(async () => this.rows.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    return (await this.rows.locator('a.name-link').allInnerTexts()).map(t => t.trim());
  }

  /** Narrows the list with the search box; returns the visible rows as { id, name, active, status, version }. */
  async searchList(text) {
    await this.search.fill(text);
    await this.page.waitForTimeout(500);   // DataTable redraw
    return this.rows.evaluateAll(rows => rows.map(r => {
      const cells = [...r.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g, ' ').trim());
      const link = r.querySelector('a.name-link');
      return { id: r.getAttribute('data-template-id'), name: link ? link.textContent.trim() : '', active: cells[2], status: cells[3], version: cells[5] };
    }));
  }

  // ------------------------------------------------------------------ wizard
  async openWizard() {
    await expect(async () => {
      if (!(await this.wizard.isVisible())) await this.createButton.click({ timeout: 5_000 });
      await expect(this.step1).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000] });
  }

  async chooseMethod(method) {
    await (method === 'copy' ? this.copyCard : this.scratchCard).click();
    await expect(this.continueButton).toBeEnabled();
    await this.continueButton.click();
    if (method === 'copy') {
      await expect(this.stepCopy).toBeVisible();
      await expect(this.copyCount, 'Copy source list loaded').toBeVisible({ timeout: 30_000 });
    } else {
      await expect(this.stepStandard).toBeVisible();
    }
  }

  /** Go Back / Cancel of the visible step. */
  visibleStepButton(kind) {
    const selector = kind === 'back' ? '[data-wt-goback]' : '.modal-footer [data-bs-dismiss="modal"]';
    return this.wizard.locator('.wt-wizard-step').filter({ visible: true }).locator(selector).first();
  }

  async cancelWizard() {
    await this.visibleStepButton('cancel').click();
    await expect(this.wizard, 'Wizard closed').toBeHidden({ timeout: 15_000 });
  }

  async fillStandard({ templateName, description }) {
    if (templateName !== undefined) await this.nameInput.fill(templateName);
    if (description !== undefined) await this.descriptionInput.fill(description);
  }

  /**
   * Create Template (standard). Returns 'created' (redirected to the template), 'duplicate' (AF-4 pop-up), 'invalid'
   * (field message, no request) or 'error' (server message).
   */
  async submitStandard(timeout = 60_000) {
    await this.createStandardButton.click();
    let outcome = '';
    await expect.poll(async () => {
      if (EDIT_URL.test(this.page.url())) outcome = 'created';
      else if (await this.duplicateModal.isVisible().catch(() => false)) outcome = 'duplicate';
      else if ((await this.nameMessage.innerText().catch(() => '')).trim()) outcome = 'invalid';
      else if (await this.serverError.isVisible().catch(() => false)) outcome = 'error';
      else outcome = '';
      return outcome;
    }, { message: 'Create Template led to the new template, a duplicate-name pop-up or a validation message', timeout }).not.toBe('');
    if (outcome === 'created') await this.waitForTemplatePage();
    return outcome;
  }

  async duplicateText() {
    return (await this.duplicateModal.innerText()).replace(/\s+/g, ' ').trim();
  }

  async closeDuplicate() {
    await this.duplicateOk.click();
    await expect(this.page.locator('#confirmModal')).toBeHidden({ timeout: 15_000 });
  }

  // ------------------------------------------------------------------ copy source list
  copyRow(templateName) {
    return this.copyRows.filter({ has: this.page.locator('a.name-link', { hasText: new RegExp(`^\\s*${esc(templateName)}\\s*$`) }) }).first();
  }

  /** Visible copy rows: [{ templateId, versionId, name, status, eligible, href }]. */
  async copySources() {
    return this.copyVisibleRows.evaluateAll(rows => rows.map(r => ({
      templateId: r.getAttribute('data-template-id'),
      versionId: r.getAttribute('data-version-id'),
      name: (r.querySelector('a.name-link') || {}).textContent ? r.querySelector('a.name-link').textContent.trim() : '',
      status: r.getAttribute('data-status'),
      eligible: r.getAttribute('data-eligible') === '1',
      version: r.getAttribute('data-version'),
      href: r.querySelector('a.name-link') ? r.querySelector('a.name-link').getAttribute('href') : '',
      disabled: r.classList.contains('wt-copy-row--disabled'),
      tooltip: r.getAttribute('data-bs-original-title') || r.getAttribute('title') || '',
    })));
  }

  /** Every row of the copy list (shown or not), same shape as copySources. */
  async allCopySources() {
    await this.searchCopy('');
    return this.copySources();
  }

  async copyCountValue() {
    return Number(((await this.copyCount.innerText()).match(/\d+/) || ['-1'])[0]);
  }

  async searchCopy(text) {
    await this.copySearch.fill(text);
  }

  /** Selects (or deselects) a source row by clicking its Version cell (the name link opens a new tab instead). */
  async toggleCopyRow(templateName) {
    await this.copyRow(templateName).locator('td').nth(5).click();
  }

  /** Step names of the source template, from the copy list's hidden step panel ("1. Name" -> "Name"). */
  async sourceStepNames(templateId) {
    return this.wizard.locator(`#wt-copy-steps-${templateId} .wft-step-item`).evaluateAll(items =>
      items.map(i => i.textContent.replace(/\s+/g, ' ').trim().replace(/^\d+\.\s*/, '')));
  }

  /** Searches the source, selects it and creates the copy. Returns the source row details. */
  async createCopyOf(sourceName) {
    await this.searchCopy(sourceName);
    const row = this.copyRow(sourceName);
    await expect(row, `Copy source "${sourceName}" offered`).toBeVisible({ timeout: 15_000 });
    const source = (await this.copySources()).find(s => s.name === sourceName);
    // a template without a Published / Unpublished version is listed but disabled ("You can't copy Draft")
    if (!source.eligible || source.disabled) {
      throw new Error(`Copy source "${sourceName}" cannot be copied (status "${source.status}"${source.tooltip ? `, "${source.tooltip}"` : ''}) - choose another source in .env`);
    }
    source.steps = await this.sourceStepNames(source.templateId);
    await this.toggleCopyRow(sourceName);
    await expect(row).toHaveClass(/wt-copy-row--selected/);
    await expect(this.createCopyButton).toBeEnabled();
    const dialogs = [];
    const onDialog = d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); };
    this.page.on('dialog', onDialog);
    try {
      await Promise.all([
        this.page.waitForResponse(r => /\/WorkflowTemplate\/CreateFromCopy/i.test(r.url()), { timeout: 60_000 }),
        this.createCopyButton.click(),
      ]);
      await expect.poll(() => (dialogs.length ? 'alert' : EDIT_URL.test(this.page.url()) ? 'created' : ''),
        { message: 'Copy created (redirect to the new template)', timeout: 60_000 }).not.toBe('');
    } finally {
      this.page.off('dialog', onDialog);
    }
    if (dialogs.length) throw new Error(`Copy creation refused: ${dialogs.join(' | ')}`);
    await this.waitForTemplatePage();
    return source;
  }

  // ------------------------------------------------------------------ template page
  async waitForTemplatePage() {
    await this.page.waitForURL(EDIT_URL, { timeout: 60_000 });
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.title.waitFor({ state: 'visible', timeout: 45_000 });
  }

  async openTemplate(id) {
    await this.openCreatedRecord(`/WorkflowTemplate/Edit/${id}`);
    await this.title.waitFor({ state: 'visible', timeout: 45_000 });
  }

  record() {
    const m = this.page.url().match(EDIT_URL);
    return { id: m ? m[1] : '', url: this.page.url() };
  }

  /** "Created by:", "Last edited by:", "Active:" values of the header. */
  async basicInfoValue(label) {
    return this.basicInfo.evaluate((el, l) => {
      const row = [...el.querySelectorAll('div')].find(d => d.firstElementChild && d.firstElementChild.textContent.trim() === l);
      return row && row.children[1] ? row.children[1].textContent.replace(/\s+/g, ' ').trim() : '';
    }, label);
  }

  /** What the template page shows: name, status, version, active, createdBy, lastEditedBy, description. */
  async templateSummary() {
    return {
      name: (await this.title.innerText()).trim(),
      status: (await this.statusBadge.innerText()).trim(),
      version: (await this.versionBadge.innerText().catch(() => '')).trim(),
      active: await this.basicInfoValue('Active:'),
      createdBy: await this.basicInfoValue('Created by:'),
      lastEditedBy: await this.basicInfoValue('Last edited by:'),
      description: await this.detailDescription.inputValue().catch(() => ''),
      detailName: await this.detailName.inputValue().catch(() => ''),
    };
  }

  /** Record tab by its exact caption. */
  tab(name) {
    return this.page.locator('main .nav-tabs').locator('[role="tab"], .nav-link')
      .filter({ hasText: new RegExp(`^\\s*${esc(name)}\\s*$`) }).first();
  }

  /** Versions tab: [{ number, status, isDraft }]. */
  async versions() {
    await this.openTab('Versions');
    await expect(this.page.locator('#pane-versions')).toBeVisible({ timeout: 30_000 });
    return this.versionCards.evaluateAll(cards => cards.map(c => ({
      number: c.getAttribute('data-version-number'),
      status: c.getAttribute('data-status-name'),
      isDraft: c.getAttribute('data-is-draft') === 'true',
    })));
  }

  /** Work Steps tab: step names in order. */
  async workSteps() {
    await this.openTab('Work Steps');
    await expect(this.page.locator('#pane-worksteps')).toBeVisible({ timeout: 30_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    return (await this.stepNames.allInnerTexts()).map(t => t.trim());
  }

  /** Display name of the signed-in user (header #userMenu .user-name). */
  async currentUserName() {
    return (await this.page.locator('#userMenu .user-name').first().textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim();
  }
}

module.exports = { WorkflowTemplatePage, EDIT_URL };
