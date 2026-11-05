// Page object for the Documents feature of a parent record (use case 62431 Add Document, module CORE).
// Documents are a tab of the parent record (here /Project/Edit/{id}, tab "Documents" = #pane-docs):
//   - empty state ("Looks like nothing's been uploaded.") or a "Result: N" list of cards (.document-card), each with
//     title, "<EXT> file" / "Link document" subtitle, Category, Description, Uploaded, Uploaded by, View / Delete and an edit icon.
//   - #btnaddDocument ("Add New Document" / "Documents") opens the right-hand drawer (/Documents/CreateDocument),
//     form #form-document-add: Document Name *, Storage type radios (Upload file = 2, Paste link = 1), Document URL
//     (#FileLocationURL, Paste link) or Select File / Replace File (#btn-select-file + #FileUpload, Upload file),
//     Description (#Summary), Category radios, Customer Viewable switch (#IsCustomerViewable) and Save (#btn-save-document).
//   - File metadata (Extension, MimeType, FileSizeBytes, DocumentKindIDF) lives in hidden inputs filled after the file is chosen;
//     the upload runs in the background (POST /Documents/GetFileName -> S3 -> POST /Documents/VerifyUploadedFile) and
//     #file-upload-status goes pending -> complete.
//   - Save posts /Documents/AddDocuments and refreshes the list through GET /Documents/GetDocumentList.
// The parent's Audit tab (#pane-audit, ".audit-group" blocks) records the new document.
// No assertions here -- methods act or return values; specs assert.

const { BasePage } = require('../basePage');
const { DOCUMENT } = require('../../utils/constants');

const isAddPost = r => r.request().method() === 'POST' && /\/Documents\/AddDocuments/i.test(r.url());

class DocumentPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Documents tab on the parent record ---------------------------
    this.pane = page.locator('#pane-docs');
    this.listContainer = page.locator('#document-list-container');
    this.emptyState = page.locator('#pane-docs .docs-empty-state-block');
    this.emptyStateText = page.locator('#pane-docs .docs-empty-state__copy');
    this.addButton = page.locator('#pane-docs #btnaddDocument');
    this.resultCount = page.locator('#pane-docs .tab-heading .text-netural-400');
    this.cards = page.locator('#pane-docs .document-card');
    this.cardTitles = page.locator('#pane-docs .document-card .doc-title > span');

    // ---- Add / Edit Document drawer -----------------------------------
    this.drawer = page.locator('#slideOutPanel.is-open');
    this.drawerTitle = this.drawer.locator('.right-drawer__title');
    this.drawerCloseButton = this.drawer.locator('.right-drawer__close').first();
    this.form = page.locator('#form-document-add');
    this.nameInput = page.locator('#DocumentName');
    this.storageFile = page.locator('#StorageTypeIDF_2');
    this.storageCloud = page.locator('#StorageTypeIDF_1');
    this.storageFileLabel = page.locator('label[for="StorageTypeIDF_2"]');
    this.storageCloudLabel = page.locator('label[for="StorageTypeIDF_1"]');
    this.urlSection = page.locator('#url-input-section');
    this.urlInput = page.locator('#FileLocationURL');
    this.fileSection = page.locator('#file-upload-section');
    this.selectFileButton = page.locator('#btn-select-file');
    this.fileInput = page.locator('#FileUpload');
    this.uploadedFiles = page.locator('#uploaded-files-container .uploaded-file-item');
    this.removeFileButtons = page.locator('#uploaded-files-container .btn-remove-file-item');
    this.fileError = page.locator('#file-error-message');
    this.descriptionInput = page.locator('#Summary');
    this.customerViewable = page.locator('#IsCustomerViewable');
    this.customerViewableToggle = page.locator('label.status-switch:has(#IsCustomerViewable)');
    this.saveButton = page.locator('#btn-save-document');
    this.validationSummary = page.locator('#validationSummary');
    this.validationSummaryText = page.locator('#validationSummary-text');
    this.fieldErrors = this.form.locator('.field-validation-error');
    // hidden, system-calculated file metadata
    this.uploadStatus = page.locator('#file-upload-status');
    this.documentKind = page.locator('#DocumentKindIDF');
    this.extension = page.locator('#Extension');
    this.mimeType = page.locator('#MimeType');
    this.fileSize = page.locator('#FileSizeBytes');

    // ---- Delete confirmation (View & Edit Document, 62432) ---------------
    this.confirmModal = page.locator('#confirmModal');
    this.confirmModalMessage = page.locator('#confirmModal h5');
    this.confirmModalNote = page.locator('#confirmModal p');
    this.confirmDeleteButton = page.locator('#confirmModal #modalOkBtn');
    this.goBackButton = page.locator('#confirmModal [data-bs-dismiss="modal"]');

    // ---- Parent record Audit tab ---------------------------------------
    this.auditPane = page.locator('#pane-audit');
    this.auditGroups = page.locator('#pane-audit .audit-group');
    // -----------------------------------------------------------------
  }

  // ---- Locator factories --------------------------------------------------

  categoryRadio(name) {
    return this.form.getByRole('radio', { name, exact: true });
  }

  categoryLabel(name) {
    return this.form.locator('.custom-radio label').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });
  }

  validationMessageFor(field) {
    return this.page.locator(`[data-valmsg-for="${field}"]`);
  }

  /** Card of the document with this title. */
  card(title) {
    return this.cards.filter({ has: this.page.locator('.doc-title > span', { hasText: new RegExp(`^${escapeRegExp(title)}$`) }) });
  }

  /** Audit group (one save of the parent / document) that mentions the text. */
  auditGroup(text) {
    return this.auditGroups.filter({ hasText: text });
  }

  // ---- Navigation ----------------------------------------------------------

  /** Opens /Project/Edit/{id} and waits for the record's tabs. */
  async openParent(id = DOCUMENT.PARENT_PROJECT_ID) {
    // the shared parent accumulates documents and audit history, so its page can take ~20s+ to render: allow for it
    await this.openRecord(`/Project/Edit/${id}`, { timeout: 120_000 });
    await this.page.locator('main .nav-tabs .nav-link').first().waitFor({ timeout: 60_000 });
  }

  /** Opens the Documents tab and waits until the empty state or the list is shown. */
  async openDocumentsTab() {
    await this.openTab('Documents');
    await this.pane.waitFor({ state: 'visible' });
    await this.listContainer.locator('.docs-empty-state-block, .card-wrapper, .tab-heading').first().waitFor();
  }

  async openParentDocuments(id) {
    await this.openParent(id);
    await this.openDocumentsTab();
  }

  async openAuditTab() {
    await this.openTab('Audit');
    await this.auditPane.waitFor({ state: 'visible' });
    await this.auditGroups.first().waitFor();
  }

  /** Command "Add New Document": opens the drawer, waits for the form and for the default StorageType lookup to finish. */
  async openAddDrawer() {
    // the default StorageType is looked up after the drawer renders: wait for it so the radios are settled
    const defaultLookup = this.page.waitForResponse(r => /\/Documents\/GetDefaultStorageType/i.test(r.url()), { timeout: 8_000 }).catch(() => null);
    await Promise.all([
      this.page.waitForResponse(r => /\/Documents\/CreateDocument/i.test(r.url())),
      this.addButton.first().click(),
    ]);
    await this.form.waitFor({ state: 'visible' });
    await defaultLookup;
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(300);
  }

  async closeDrawer() {
    if (await this.drawer.count()) await this.drawerCloseButton.click();
    await this.drawer.waitFor({ state: 'detached' }).catch(() => {});
  }

  // ---- Form actions ----------------------------------------------------------

  /** Selects a StorageType (DOCUMENT.STORAGE.FILE | CLOUD) by clicking its label. */
  async selectStorage(type) {
    await (type === DOCUMENT.STORAGE.FILE ? this.storageFileLabel : this.storageCloudLabel).click();
  }

  /** Radio currently checked: 'file' | 'cloud' | null. */
  async getStorage() {
    if (await this.storageFile.isChecked()) return DOCUMENT.STORAGE.FILE;
    if (await this.storageCloud.isChecked()) return DOCUMENT.STORAGE.CLOUD;
    return null;
  }

  async fillName(name) {
    await this.nameInput.fill(name);
  }

  /** Types the URL and moves focus away (the format check runs on blur). */
  async fillUrl(url) {
    await this.urlInput.fill(url);
    await this.urlInput.blur();
    await this.descriptionInput.click();
  }

  async fillDescription(text) {
    await this.descriptionInput.fill(text);
  }

  async selectCategory(name) {
    await this.categoryLabel(name).click();
  }

  async getSelectedCategory() {
    const checked = this.form.locator('input[name="DocumentCategoryIDF"]:checked');
    if (!(await checked.count())) return null;
    return (await checked.locator('xpath=ancestor::label').innerText()).trim();
  }

  /** Sets the Customer Viewable switch to the wanted state (clicks the visible switch only when it must change). */
  async setCustomerViewable(on) {
    if ((await this.customerViewable.isChecked()) !== on) await this.customerViewableToggle.click();
  }

  /** Chooses a local file; the upload starts at once in the background. Does not wait for it. */
  async chooseFile(filePath) {
    await this.fileInput.setInputFiles(filePath);
  }

  /** Waits until the background upload is verified (hidden #file-upload-status = complete). */
  async waitForUploadComplete(timeout = 60_000) {
    await this.page.waitForFunction(() => document.getElementById('file-upload-status')?.value === 'complete', null, { timeout });
  }

  /** Waits until the file metadata (extension, MIME type, size) has been calculated. */
  async waitForFileMetadata(timeout = 30_000) {
    await this.page.waitForFunction(() => !!document.getElementById('Extension')?.value && !!document.getElementById('MimeType')?.value, null, { timeout });
  }

  /** Clicks Save without waiting (use for the blocked-save scenarios). */
  async clickSave() {
    await this.saveButton.click();
  }

  /** Clicks Save and waits for the document to be posted and the list to refresh. Returns the POST response. */
  async saveAndWait() {
    const listRefreshed = this.page.waitForResponse(r => /\/Documents\/GetDocumentList/i.test(r.url()), { timeout: 60_000 }).catch(() => null);
    const [response] = await Promise.all([
      this.page.waitForResponse(isAddPost, { timeout: 60_000 }),
      this.saveButton.click(),
    ]);
    await listRefreshed;
    await this.drawer.waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
    return response;
  }

  /** Reads what the drawer currently holds. */
  async readForm() {
    return {
      name: await this.nameInput.inputValue(),
      storage: await this.getStorage(),
      url: await this.urlInput.inputValue(),
      description: await this.descriptionInput.inputValue(),
      category: await this.getSelectedCategory(),
      customerViewable: await this.customerViewable.isChecked(),
      extension: await this.extension.inputValue(),
      mimeType: await this.mimeType.inputValue(),
      fileSize: await this.fileSize.inputValue(),
      uploadStatus: await this.uploadStatus.inputValue(),
    };
  }

  // ---- Existing documents ---------------------------------------------------------

  /** Number printed in "Result: N" (0 when the empty state is shown). */
  async getResultCount() {
    if (await this.emptyState.isVisible()) return 0;
    const text = await this.resultCount.first().innerText();
    return Number((text.match(/\d+/) || [0])[0]);
  }

  async getCardTitles() {
    return (await this.cardTitles.allInnerTexts()).map(t => t.trim());
  }

  cardSubtitleLocator(title) {
    return this.card(title).locator('.doc-subtitle');
  }

  /** Subtitle of a card: "TXT file" for an uploaded file, "Link document" for a cloud link. */
  async getCardSubtitle(title) {
    return (await this.card(title).locator('.doc-subtitle').innerText()).trim();
  }

  /** Meta lines of a card as { Category, Description, Uploaded, 'Uploaded by' }. */
  async getCardMeta(title) {
    const lines = await this.card(title).locator('.doc-meta strong').evaluateAll(els => els.map(e => [e.textContent.replace(':', '').trim(), e.parentElement.textContent.replace(e.textContent, '').trim()]));
    return Object.fromEntries(lines);
  }

  /** Opens the edit drawer (GET /Documents/GetDocument/{id}) of the card with this title. */
  async openEdit(title) {
    await Promise.all([
      this.page.waitForResponse(r => /\/Documents\/GetDocument\//i.test(r.url())),
      this.card(title).locator('.doc-edit').click(),
    ]);
    await this.form.waitFor({ state: 'visible' });
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  /** Edit drawer, StorageType File: picks a replacement file (button reads "Replace File"). */
  async replaceFile(filePath) {
    await this.fileInput.setInputFiles(filePath);
  }

  // ---- View / Export / Delete (62432) ---------------------------------------------

  viewButton(title) { return this.card(title).locator('.doc-view'); }

  downloadButton(title) { return this.card(title).locator('.doc-download'); }

  deleteLink(title) { return this.card(title).locator('.doc-delete'); }

  editIcon(title) { return this.card(title).locator('.doc-edit'); }

  /** Command "View": the document opens in a new browser tab. Returns that tab and the ViewDocument request URL. */
  async viewDocument(title) {
    const popupPromise = this.page.context().waitForEvent('page', { timeout: 15_000 });
    const requestPromise = this.page.waitForRequest(r => /\/Documents\/ViewDocument/i.test(r.url()), { timeout: 15_000 }).catch(() => null);
    await this.viewButton(title).click();
    const popup = await popupPromise;
    const request = await requestPromise;
    return { popup, requestUrl: request ? request.url() : null };
  }

  /** Command "Download" (file documents only). Returns the Playwright Download. */
  async downloadDocument(title) {
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 30_000 }),
      this.downloadButton(title).click(),
    ]);
    return download;
  }

  /** Command "Delete": opens the confirmation dialog. */
  async openDeleteConfirmation(title) {
    await this.deleteLink(title).click();
    await this.confirmModal.waitFor({ state: 'visible' });
  }

  /** Confirms the soft delete and waits for the list to refresh. */
  async confirmDelete() {
    const listRefreshed = this.page.waitForResponse(r => /\/Documents\/GetDocumentList/i.test(r.url()), { timeout: 30_000 }).catch(() => null);
    await this.confirmDeleteButton.click();
    await listRefreshed;
    await this.confirmModal.waitFor({ state: 'hidden' }).catch(() => {});
  }

  async cancelDelete() {
    await this.goBackButton.click();
    await this.confirmModal.waitFor({ state: 'hidden' });
  }

  async deleteDocument(title) {
    await this.openDeleteConfirmation(title);
    await this.confirmDelete();
  }

  // ---- Fast creation of fixtures for the View & Edit tests -------------------------

  /** Adds a cloud document through the drawer (opens the Documents tab first when `openTab` is true). */
  async addCloudDocument({ title, url = DOCUMENT.GOOGLE_DOC_URL, description, category, customerViewable } = {}) {
    await this.openAddDrawer();
    if ((await this.getStorage()) !== DOCUMENT.STORAGE.CLOUD) await this.selectStorage(DOCUMENT.STORAGE.CLOUD);
    await this.fillName(title);
    await this.fillUrl(url);
    if (description) await this.fillDescription(description);
    if (category) await this.selectCategory(category);
    if (customerViewable !== undefined) await this.setCustomerViewable(customerViewable);
    return this.saveAndWait();
  }

  /** Adds a file document through the drawer. */
  async addFileDocument({ title, filePath, description, category } = {}) {
    await this.openAddDrawer();
    await this.selectStorage(DOCUMENT.STORAGE.FILE);
    await this.chooseFile(filePath);
    await this.waitForUploadComplete();
    await this.fillName(title);
    if (description) await this.fillDescription(description);
    if (category) await this.selectCategory(category);
    return this.saveAndWait();
  }

  /** Text of every audit group of the parent record (newest first). */
  async getAuditTexts() {
    return (await this.auditGroups.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  }
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { DocumentPage };
