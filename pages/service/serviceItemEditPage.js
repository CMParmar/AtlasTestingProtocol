const { expect } = require('@playwright/test');
const { ServiceItemPage, EDIT_URL } = require('./serviceItemPage');

/**
 * View & Update Service Item (use case 62420) - /ServiceItem/Edit/{id}, "Deliverable Type" in the UI.
 * Extends the Add page object: the Details tab is the same form (#form-serviceitem, posts to /ServiceItem/Edit/{id},
 * hidden BypassDuplicateNameCheck for the server-side duplicate-name warning).
 *
 * Extra on this page:
 *   header        status badge (.ServiceItemStatus), Signals (button.btn-signals[data-entity-record-id]), Actions
 *                 (#actionsDropdown) -> "Delete Deliverable Type" -> #modal-delete-serviceitem (Delete posts to
 *                 /ServiceItem/Delete/{id}; Go Back closes it)
 *   labor switch  #laborEachBillingPeriod (shown while Subscription is ticked) with #MaterializesServicePerSubscriptionPeriod
 *   Workflow Templates tab (#pane-workflowtemplates, host #serviceItem-compatible-wt-host):
 *                 filter radios #si-wt-filter-compatible / #si-wt-filter-incompatible, #si-wt-search, #si-wt-result-count,
 *                 #si-wt-search-empty, rows tr.si-wt-row[data-template-id][data-compatible][data-default][data-has-published]
 *                 with a.si-wt-name-link, .si-wt-compatible-cb and .si-wt-default-radio. Ticking posts at once to
 *                 /ServiceItem/SetWorkflowTemplateCompatible or /ServiceItem/SetDefaultWorkflowTemplate. Unticking the
 *                 default opens #confirmModal (#si-wt-remove-default-continue / #si-wt-remove-default-cancel).
 *   Documents (#pane-docs), Tasks (#pane-tasks), Audit (#pane-audit).
 *
 * Never open a /ServiceItem/... URL of a record that does not exist (or was deleted): the sandbox answers with its error
 * page, which signs the session out.
 */
class ServiceItemEditPage extends ServiceItemPage {
  constructor(page) {
    super(page);
    this.pageTitle = page.locator('main .page-title, main .page-heading-sec').first();
    this.signalsButton = page.locator('main button.btn-signals');
    this.actionsButton = page.locator('#actionsDropdown');
    this.deleteAction = page.locator('.dropdown-menu.show').getByText('Delete Deliverable Type', { exact: true });
    this.deleteModal = page.locator('#modal-delete-serviceitem');
    this.deleteModalTitle = this.deleteModal.locator('#modal-delete-serviceitem-title');
    this.deleteConfirmButton = this.deleteModal.locator('form button[type="submit"]');
    this.deleteGoBackButton = this.deleteModal.locator('button[data-bs-dismiss="modal"]');
    // Cancel of the record form (a link back to the record, no dirty check)
    this.editCancelLink = this.form.locator('a.btn-outline-secondary, a.jqBypassDirtyCheck').first();
    this.laborSection = page.locator('#laborEachBillingPeriod');
    this.laborSwitch = page.locator('#MaterializesServicePerSubscriptionPeriod');
    this.errorAlert = page.locator('#alert-js-error, .alert-danger, .toast-error, .swal2-popup, .modal.show')
      .filter({ visible: true, hasText: /\S{3}/ }).first();

    // Workflow Templates (63454)
    this.wtHost = page.locator('#serviceItem-compatible-wt-host');
    this.wtCompatibleFilter = page.locator('#si-wt-filter-compatible');
    this.wtIncompatibleFilter = page.locator('#si-wt-filter-incompatible');
    this.wtSearch = page.locator('#si-wt-search');
    this.wtResultCount = page.locator('#si-wt-result-count');
    this.wtEmpty = page.locator('#si-wt-search-empty');
    this.wtRows = this.wtHost.locator('tr.si-wt-row');
    this.wtVisibleRows = this.wtRows.filter({ visible: true });
    this.wtConfirmModal = page.locator('#confirmModal');
    this.wtRemoveDefaultContinue = page.locator('#si-wt-remove-default-continue');
    this.wtRemoveDefaultCancel = page.locator('#si-wt-remove-default-cancel');

    this.documentsPane = page.locator('#pane-docs');
    this.tasksPane = page.locator('#pane-tasks');

    // every POST of the record form, to tell a real save from a client-side block
    this.formPosts = 0;
    page.on('request', r => { if (r.method() === 'POST' && /\/ServiceItem\/Edit\/\d+/i.test(r.url())) this.formPosts++; });
    // page loads, to tell a message of the page answered by this Save from one left over from the previous Save
    this.loads = 0;
    page.on('load', () => { this.loads++; });
    // server messages (TempData) are rendered by script into these containers a moment after the page loads
    this.pageAlerts = page.locator('#alert-js-error, #alert-js-warning, #alert-js-success, #alert-js-info').locator('.alert, [role="alert"], div')
      .filter({ visible: true, hasText: /\S{3}/ });
  }

  recordId() {
    const m = this.page.url().match(EDIT_URL);
    return m ? m[1] : '';
  }

  // ------------------------------------------------------------------ save
  /**
   * Clicks Save and returns what followed: 'saved' (form posted and "Record saved successfully" shown), 'duplicate'
   * (SERV-1 warning), 'invalid' (validation message) - or '' when nothing showed within the timeout.
   * The page must have been opened fresh (openEdit) so no earlier alert is still on screen.
   */
  async saveChanges(timeout = 60_000) {
    const postsBefore = this.formPosts;
    const loadsBefore = this.loads;
    // a warning / message still on screen from the previous Save (e.g. the duplicate warning before the name is revised)
    // only counts again once the page has reloaded with the answer to this Save
    const stale = (await this.duplicateWarning.isVisible().catch(() => false)) || (await this.validationErrors.first().isVisible().catch(() => false));
    const fresh = () => !stale || this.loads > loadsBefore;
    await this.clickSave();
    let outcome = '';
    await expect.poll(async () => {
      if (!fresh()) outcome = '';
      else if (await this.duplicateWarning.isVisible().catch(() => false)) outcome = 'duplicate';
      else if (await this.validationErrors.first().isVisible().catch(() => false)) outcome = 'invalid';
      else if (this.formPosts > postsBefore && EDIT_URL.test(this.page.url()) && await this.savedMessage.isVisible().catch(() => false)) outcome = 'saved';
      else outcome = '';
      return outcome;
    }, { message: 'Save led to "Record saved successfully", a duplicate-name warning or a validation message', timeout, intervals: [500, 1_000, 2_000] })
      .not.toBe('').catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    return outcome;
  }

  /** After the duplicate warning: the warning's proceed button, or Save again (the server then bypasses the check). */
  async proceedOnEdit() {
    const postsBefore = this.formPosts;
    if (await this.duplicateProceedButton.isVisible().catch(() => false)) await this.duplicateProceedButton.click({ noWaitAfter: true });
    else await this.clickSave();
    await expect.poll(async () => this.formPosts > postsBefore && (await this.savedMessage.isVisible().catch(() => false)),
      { message: 'Saved after proceeding with the duplicate name', timeout: 60_000 }).toBe(true);
  }

  // ------------------------------------------------------------------ labor switch
  async laborShown() {
    return this.laborSection.evaluate(el => !el.classList.contains('d-none') && !!el.offsetParent).catch(() => false);
  }

  // ------------------------------------------------------------------ delete
  async openDeleteConfirmation() {
    await expect(async () => {
      if (!(await this.deleteAction.isVisible())) await this.actionsButton.click({ timeout: 5_000 });
      await expect(this.deleteAction).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000] });
    await this.deleteAction.click();
    await expect(this.deleteModal, 'Delete confirmation').toBeVisible({ timeout: 15_000 });
  }

  async goBackFromDelete() {
    await expect(async () => {
      if (await this.deleteModal.isVisible()) await this.deleteGoBackButton.click({ timeout: 3_000 });
      await expect(this.deleteModal).toBeHidden({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  }

  /** Delete in the confirmation; resolves when the POST /ServiceItem/Delete/{id} answered. Returns its status. */
  async confirmDelete() {
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && /\/ServiceItem\/Delete\/\d+/i.test(r.url()), { timeout: 60_000 }),
      this.deleteConfirmButton.click({ noWaitAfter: true }),
    ]);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    return response.status();
  }

  /**
   * The server message the page shows after a post-back (e.g. after Delete): the TempData alert rendered into the
   * #alert-js-* containers, or the same text from window.__tempDataAlerts. Waits up to `timeout`; '' if none.
   */
  async serverMessage(timeout = 20_000) {
    let text = '';
    await expect.poll(async () => {
      const shown = (await this.pageAlerts.allInnerTexts().catch(() => [])).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const data = await this.page.evaluate(() => {
        const a = window.__tempDataAlerts || {};
        return [a.error, a.warning, a.info, a.success].filter(Boolean).map(String);
      }).catch(() => []);
      text = [...new Set([...shown, ...data])].join(' | ');
      return text;
    }, { timeout, intervals: [500, 1_000] }).not.toBe('').catch(() => {});
    return text;
  }

  // ------------------------------------------------------------------ Workflow Templates
  async openWorkflowTemplatesTab() {
    await this.openTab('Workflow Templates');
    await expect(this.wtHost, 'Workflow Templates panel').toBeVisible({ timeout: 30_000 });
  }

  /** DOM click on a filter radio (styled span over the input). */
  async filterTemplates(which) {
    const radio = which === 'Incompatible' ? this.wtIncompatibleFilter : this.wtCompatibleFilter;
    await this.toggleTo(radio, true);
  }

  async searchTemplates(text) {
    await this.wtSearch.fill(text);
  }

  async resultCount() {
    return Number((await this.wtResultCount.innerText()).trim());
  }

  /** Visible rows: [{ id, name, description, compatible, isDefault, published }]. */
  async visibleTemplates() {
    return this.wtVisibleRows.evaluateAll(rows => rows.map(r => ({
      id: r.getAttribute('data-template-id'),
      name: r.getAttribute('data-search-name') || '',
      description: r.getAttribute('data-search-desc') || '',
      compatible: r.getAttribute('data-compatible') === 'true',
      isDefault: r.getAttribute('data-default') === 'true',
      published: r.getAttribute('data-has-published') === 'true',
      href: (r.querySelector('a.si-wt-name-link') || {}).getAttribute ? r.querySelector('a.si-wt-name-link').getAttribute('href') : '',
      defaultDisabled: !!(r.querySelector('.si-wt-default-radio') || {}).disabled,
    })));
  }

  /** All rows (shown or not), same shape as visibleTemplates. */
  async allTemplates() {
    return this.wtRows.evaluateAll(rows => rows.map(r => ({
      id: r.getAttribute('data-template-id'),
      name: r.getAttribute('data-search-name') || '',
      compatible: r.getAttribute('data-compatible') === 'true',
      isDefault: r.getAttribute('data-default') === 'true',
      published: r.getAttribute('data-has-published') === 'true',
    })));
  }

  templateRow(id) {
    return this.wtHost.locator(`tr.si-wt-row[data-template-id="${id}"]`);
  }

  /** Ticks / unticks Compatible of template `id` and waits for the server answer. Returns the response JSON. */
  async setCompatible(id, compatible) {
    const cb = this.templateRow(id).locator('.si-wt-compatible-cb');
    if ((await cb.isChecked()) === compatible) return null;
    const [response] = await Promise.all([
      this.page.waitForResponse(r => /SetWorkflowTemplateCompatible/i.test(r.url()), { timeout: 30_000 }),
      cb.evaluate(el => el.click()),
    ]);
    const json = await response.json().catch(() => ({}));
    await expect(this.templateRow(id), `Template ${id} compatible = ${compatible}`).toHaveAttribute('data-compatible', String(compatible));
    return json;
  }

  /** Selects template `id` as the default and waits for the server answer. */
  async setDefaultTemplate(id) {
    const radio = this.templateRow(id).locator('.si-wt-default-radio');
    const [response] = await Promise.all([
      this.page.waitForResponse(r => /SetDefaultWorkflowTemplate/i.test(r.url()), { timeout: 30_000 }),
      radio.evaluate(el => el.click()),
    ]);
    const json = await response.json().catch(() => ({}));
    await expect(this.templateRow(id), `Template ${id} is the default`).toHaveAttribute('data-default', 'true');
    return json;
  }

  /** Unticks Compatible on the default template: the confirmation opens (answered by the caller). */
  async untickDefaultTemplate(id) {
    await this.templateRow(id).locator('.si-wt-compatible-cb').evaluate(el => el.click());
    await expect(this.wtConfirmModal, 'Remove-default confirmation').toBeVisible({ timeout: 15_000 });
  }

  async defaultTemplateIds() {
    return this.wtRows.evaluateAll(rows => rows.filter(r => r.getAttribute('data-default') === 'true').map(r => r.getAttribute('data-template-id')));
  }

  /** Spec fields missing from the sandbox (TC_SIU_038). */
  specOnlyEditFields() {
    const main = this.page.locator('main');
    return {
      'Default Rate': main.locator('#DefaultRate, [name="DefaultRate"]').or(main.getByLabel(/default rate/i)),
      'Is Active': main.locator('#IsActive, [name="IsActive"]').or(main.getByLabel(/^\s*(is )?active\s*$/i)),
    };
  }

  /** A related Services (Deliverables) panel or tab (TC_SIU_039). */
  servicesPanel() {
    return this.page.locator('main .nav-tabs').getByText(/^\s*(Services|Deliverables|Related (Services|Deliverables))\s*$/i)
      .or(this.page.locator('main #pane-services, main #pane-deliverables, main [data-containerkey*="Services" i]'));
  }
}

module.exports = { ServiceItemEditPage };
