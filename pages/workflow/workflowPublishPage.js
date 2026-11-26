const { expect } = require('@playwright/test');
const { WorkflowTemplateEditPage, EDIT_URL } = require('./workflowTemplateEditPage');

/**
 * Publish / Unpublish Workflow Template Version (use case 63090) on /WorkflowTemplate/Edit/{id}[?versionId=].
 * Extends the View & Edit Workflow Template page object (details, versions, work steps, gates).
 *
 * Sandbox (observed):
 *   Versions tab  one card per version: .report-version-card[data-version-id][data-version-number][data-status-name]
 *                 [data-is-draft], meta line (.report-version-card__meta) "Created by / Published by / Unpublished by
 *                 <user> · <date>", buttons Viewing now / View, Create Draft (.btn-create-wft-draft),
 *                 Publish (.btn-publish-wft-version[data-version-id][data-version-status-id]: 1 = Draft, 3 = Unpublished)
 *                 on Draft and Unpublished cards, Unpublish (.btn-unpublish-wft-version) on the Published card.
 *   Header        Publish Version (draft being viewed) / Unpublish Version (published version being viewed).
 *   Pop-ups       Draft       #modal-publish-wft-draft    "Publish version?"            form #form-publish-wft-draft
 *                 Unpublished #modal-publish-wft-previous "Publish previous version?"   form #form-publish-wft-previous
 *                 (both post workflowTemplateVersionId to /WorkflowTemplate/Publish/{id})
 *                 Unpublish   #modal-unpublish-wft        "Unpublish workflow template?" posts /WorkflowTemplate/Unpublish/{id}
 *                 each with Publish / Unpublish (submit) and Go Back. A normal form post: the page reloads and shows the
 *                 result as a page alert (window.__tempDataAlerts).
 *   Audit tab     .audit-group per save: "Date: <date> changed by <user>" + table Field / Old Value / New Value / Action
 *                 (e.g. WorkflowTemplateVersionStatusIDF Draft -> Published, PublishedWorkflowTemplateVersionIDF -> v1).
 */
class WorkflowPublishPage extends WorkflowTemplateEditPage {
  constructor(page) {
    super(page);
    this.heading = page.locator('main .page-heading-sec').first();
    this.headerPublish = this.heading.locator('.btn-publish-wft-version');
    this.headerUnpublish = this.heading.locator('.btn-unpublish-wft-version');
    this.publishDraftModal = page.locator('#modal-publish-wft-draft');
    this.publishPreviousModal = page.locator('#modal-publish-wft-previous');
    this.unpublishModal = page.locator('#modal-unpublish-wft');
    this.auditPane = page.locator('#pane-audit');
    this.auditGroups = this.auditPane.locator('.audit-group');
  }

  // ------------------------------------------------------------------ versions
  card(number) {
    return this.page.locator(`#pane-versions .report-version-card[data-version-number="${number}"]`);
  }

  /** Versions tab: [{ id, number, status, isDraft, meta, viewing, canPublish, canUnpublish, canCreateDraft }] (by number). */
  async cards() {
    await this.openTab('Versions');
    await expect(this.page.locator('#pane-versions'), 'Versions tab').toBeVisible({ timeout: 30_000 });
    const cards = await this.versionCards.evaluateAll(list => list.map(c => ({
      id: c.getAttribute('data-version-id'),
      number: Number(c.getAttribute('data-version-number')),
      status: c.getAttribute('data-status-name'),
      isDraft: c.getAttribute('data-is-draft') === 'true',
      meta: ((c.querySelector('.report-version-card__meta') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      viewing: /Viewing now/i.test(c.textContent),
      canPublish: !!c.querySelector('.btn-publish-wft-version'),
      canUnpublish: !!c.querySelector('.btn-unpublish-wft-version'),
      canCreateDraft: !!c.querySelector('.btn-create-wft-draft'),
    })));
    return cards.sort((a, b) => a.number - b.number);
  }

  /** "v1 Unpublished, v2 Published, v3 Draft" - the state of every version. */
  static summary(cards) {
    return cards.map(c => `v${c.number} ${c.status}`).join(', ');
  }

  /** Re-opens the template (fresh page) and returns its version cards. */
  async reloadCards(templateId) {
    await this.openTemplate(templateId);
    return this.cards();
  }

  // ------------------------------------------------------------------ pop-ups
  /** The publish / unpublish pop-up that is open, with its title and body text. */
  async openedModal() {
    const all = { draft: this.publishDraftModal, previous: this.publishPreviousModal, unpublish: this.unpublishModal };
    let kind = '';
    await expect.poll(async () => {
      for (const [k, m] of Object.entries(all)) if (await m.isVisible()) { kind = k; return k; }
      return '';
    }, { message: 'A publish / unpublish pop-up opens', timeout: 15_000 }).not.toBe('');
    const modal = all[kind];
    // Bootstrap fades the pop-up in; clicks during the fade are lost
    await expect(modal).toHaveClass(/\bshow\b/, { timeout: 10_000 });
    await this.page.waitForTimeout(400);
    const title = (await modal.locator('h5').first().innerText()).replace(/\s+/g, ' ').trim();
    const full = (await modal.innerText()).replace(/\s+/g, ' ').trim();
    // the message: the pop-up text without its title, form and buttons
    const body = await modal.evaluate(m => {
      const copy = m.cloneNode(true);
      copy.querySelectorAll('h5, form, button, input').forEach(e => e.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    });
    return { kind, modal, title, body, text: full };
  }

  /** Publish on the card of version `number` (Draft or Unpublished). Returns the opened pop-up. */
  async openPublish(number) {
    await this.openTab('Versions');
    await this.card(number).locator('.btn-publish-wft-version').click();
    return this.openedModal();
  }

  /** Unpublish on the Published version's card. Returns the opened pop-up. */
  async openUnpublish() {
    await this.openTab('Versions');
    await this.page.locator('#pane-versions .btn-unpublish-wft-version').first().click();
    return this.openedModal();
  }

  /** Version id the publish pop-up will post (hidden workflowTemplateVersionId). */
  async modalVersionId(kind) {
    const id = kind === 'previous' ? '#publish-wft-previous-version-id' : '#publish-wft-draft-version-id';
    return this.page.locator(id).inputValue();
  }

  /** Publish / Unpublish in the open pop-up: waits for the post and the reloaded page. Returns { status, text }. */
  async confirm(opened) {
    const url = opened.kind === 'unpublish' ? /\/WorkflowTemplate\/Unpublish\/\d+/i : /\/WorkflowTemplate\/Publish\/\d+/i;
    const [response] = await Promise.all([
      this.page.waitForResponse(r => r.request().method() === 'POST' && url.test(r.url()), { timeout: 60_000 }),
      opened.modal.locator('button[type="submit"]').click(),
    ]);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.title.waitFor({ state: 'visible', timeout: 45_000 });
    const text = await this.messages(10_000);
    return { status: response.status(), text, url: this.page.url() };
  }

  /**
   * Go Back in the open pop-up (retried: a click while the pop-up fades in is ignored). Returns the number of
   * publish / unpublish posts made meanwhile (expected 0).
   */
  async goBack(opened) {
    let posts = 0;
    const onRequest = r => { if (r.method() === 'POST' && /\/WorkflowTemplate\/(Publish|Unpublish)\//i.test(r.url())) posts++; };
    this.page.on('request', onRequest);
    try {
      await expect(async () => {
        if (await opened.modal.isVisible()) await opened.modal.locator('[data-bs-dismiss="modal"]').filter({ visible: true }).first().click({ timeout: 3_000 });
        await expect(opened.modal).toBeHidden({ timeout: 3_000 });
      }).toPass({ timeout: 30_000, intervals: [1_000] });
      await this.page.waitForTimeout(1_000);
    } finally {
      this.page.off('request', onRequest);
    }
    return posts;
  }

  /** Publish version `number` and confirm. Returns { opened, result }. */
  async publishVersion(number) {
    const opened = await this.openPublish(number);
    const result = await this.confirm(opened);
    return { opened, result };
  }

  /** Unpublish the Published version and confirm. Returns { opened, result }. */
  async unpublish() {
    const opened = await this.openUnpublish();
    const result = await this.confirm(opened);
    return { opened, result };
  }

  // ------------------------------------------------------------------ audit (BR-23)
  /** Audit tab, newest first: [{ date, by, rows: [{ field, old, new, action }] }] (first page of the audit groups). */
  async audit() {
    await this.openTab('Audit');
    await expect(this.auditPane, 'Audit tab').toBeVisible({ timeout: 30_000 });
    await expect(this.auditGroups.first(), 'Audit entries').toBeVisible({ timeout: 30_000 });
    return this.auditGroups.evaluateAll(groups => groups.map(g => {
      const spans = [...g.querySelectorAll('.mb-2 span.medium')].map(s => s.textContent.replace(/\s+/g, ' ').trim());
      const cell = td => (td.querySelector('.text-wrap') || td).textContent.replace(/\s+/g, ' ').trim();
      const rows = [...g.querySelectorAll('table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(cell))
        .filter(c => c.length >= 4).map(c => ({ field: c[0], old: c[1], new: c[2], action: c[3] }));
      return { date: spans[0] || '', by: spans[1] || '', rows };
    }));
  }

  /** The newest audit group that changed `field` (the publish / unpublish just made). */
  async latestAuditWith(field) {
    const groups = await this.audit();
    const group = groups.find(g => g.rows.some(r => r.field === field));
    if (!group) throw new Error(`No audit entry changes ${field}; newest: ${JSON.stringify(groups[0] || {})}`);
    return group;
  }

  // ------------------------------------------------------------------ list
  /** The template's row in Settings -> Workflow Templates: { id, name, active, status, version }. */
  async listRow(templateName) {
    await this.gotoList();
    let row;
    await expect.poll(async () => {
      row = (await this.searchList(templateName)).find(r => r.name === templateName);
      return !!row;
    }, { message: `"${templateName}" listed`, timeout: 30_000 }).toBe(true);
    return row;
  }
}

module.exports = { WorkflowPublishPage, EDIT_URL };
