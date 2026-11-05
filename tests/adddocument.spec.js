// Add Document (use case 62431, module CORE) -- the Documents tab of a parent record (a Project in the sandbox):
// existing documents, "Add New Document" drawer, StorageType default and switching, file upload (background upload,
// calculated metadata), cloud link (URL format, default names), validation, replace file and the audit of the parent.
// Uses the authenticated storageState from the setup project (functional project, no retries: a retried test would add a second document).
//
// Every test creates its own documents on the shared parent (Project DOCUMENT_PROJECT_ID, default 819), named with the run tag.
// Delete is a permanent action, so the tests never delete: the documents stay on the parent.
//
// Not automated (needs users / settings the UI cannot set up):
//   - TC-03 / TC-22 / AF-4: Customer Viewable disabled / permission message for a user without CORE.Document.MarkCustomerViewable.
//   - TC-06 / AF-3: Add command hidden for a user without parent edit permission or CORE.Document.Create (needs a second user).
//   - TC-13: Documents feature hidden when SET.<Module>.<Entity>.DocumentsEnabled is false (setting not editable here).
//   - MF-8.5 defect 62560 (original file lost on replace) -- only the metadata update and the audit are asserted.
//   - Server-side file-size limit (500 MB) -- the uploader cannot be fed a file that large.
// Known application defect found while automating: Customer Viewable is ON by default (the use case says false) -> TC-15 is marked test.fail().

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../fixtures/fixtures');
const { DOCUMENT } = require('../utils/constants');
const { MODULE, name, documentCases: c } = require('../testData/documentData');
const { tcDetails, tcTitle, recordTestValues, recordUrl } = require('../utils/testCase');

const { STORAGE } = DOCUMENT;

/** Small local file to upload (the upload goes to the sandbox's S3 bucket). */
function makeFile(testInfo, fileName, content = 'Atlas document test') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-doc-'));
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/** Opens the parent's Documents tab and the Add New Document drawer. */
async function openDrawer(documentPage) {
  await documentPage.openParentDocuments();
  await documentPage.openAddDrawer();
}

/** Fills the open drawer as a cloud document and saves it. `title` undefined = leave the title empty. */
async function addCloud(documentPage, title, url = DOCUMENT.GOOGLE_DOC_URL, extra = {}) {
  if ((await documentPage.getStorage()) !== STORAGE.CLOUD) await documentPage.selectStorage(STORAGE.CLOUD);
  if (title !== undefined) await documentPage.fillName(title);
  await documentPage.fillUrl(url);
  if (extra.description) await documentPage.fillDescription(extra.description);
  if (extra.category) await documentPage.selectCategory(extra.category);
  return documentPage.saveAndWait();
}

test.describe('Add Document (62431)', () => {
  // ---------- MF-1 .. MF-10: happy paths ----------
  test(tcTitle(c.fileAdd), tcDetails(c.fileAdd, MODULE), async ({ documentPage, page }, testInfo) => {
    const title = name('File');
    const file = makeFile(testInfo, 'atlas-file-doc.txt');
    await recordTestValues(testInfo, { 'Document Title': title, 'Storage Type': 'Upload file', Category: 'Specification', description: 'Added by automation' });
    await documentPage.openParentDocuments();
    await recordUrl(testInfo, page.url(), 'Parent record');
    const before = await documentPage.getResultCount();
    await expect(documentPage.addButton.first(), 'Add command shown to an authorized user').toBeVisible();
    await documentPage.openAddDrawer();
    await expect(documentPage.drawerTitle).toHaveText('Add Document');
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.chooseFile(file);
    await documentPage.waitForUploadComplete();
    await documentPage.fillName(title);
    await documentPage.selectCategory('Specification');
    await documentPage.fillDescription('Added by automation');
    await documentPage.saveAndWait();
    await expect(documentPage.recordAddedMessage.first(), 'Confirmation').toBeVisible();
    await expect(documentPage.drawer, 'Drawer closes after save (MF-10)').toHaveCount(0);
    await expect(documentPage.card(title), 'New document listed').toBeVisible();
    expect(await documentPage.getCardSubtitle(title)).toBe('TXT file');
    expect(await documentPage.getCardMeta(title)).toMatchObject({ Category: 'Specification', Description: 'Added by automation' });
    await expect.poll(() => documentPage.getResultCount(), { message: 'List refreshed' }).toBe(before + 1);
  });

  test(tcTitle(c.cloudAdd), tcDetails(c.cloudAdd, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Link');
    await recordTestValues(testInfo, { 'Document Title': title, 'Storage Type': 'Paste link', url: DOCUMENT.GOOGLE_DOC_URL, Category: 'Prototype', description: 'Cloud document by automation' });
    await openDrawer(documentPage);
    await addCloud(documentPage, title, DOCUMENT.GOOGLE_DOC_URL, { category: 'Prototype', description: 'Cloud document by automation' });
    await expect(documentPage.recordAddedMessage.first()).toBeVisible();
    await expect(documentPage.card(title)).toBeVisible();
    expect(await documentPage.getCardSubtitle(title)).toBe('Link document');
    expect(await documentPage.getCardMeta(title)).toMatchObject({ Category: 'Prototype', Description: 'Cloud document by automation' });
  });

  // ---------- MF-3 / MF-4: StorageType default ----------
  test(tcTitle(c.defaultStorage), tcDetails(c.defaultStorage, MODULE), async ({ documentPage }, testInfo) => {
    await recordTestValues(testInfo, { 'Documents added first': 'Two cloud documents' });
    await openDrawer(documentPage);
    await addCloud(documentPage, name('Default A'));
    await documentPage.openAddDrawer();
    await addCloud(documentPage, name('Default B'));
    await documentPage.openAddDrawer();
    expect(await documentPage.getStorage(), 'Cloud is in at least 2 of the last 3 documents').toBe(STORAGE.CLOUD);
    await expect(documentPage.urlSection).toBeVisible();
    await expect(documentPage.fileSection).toBeHidden();
  });

  test(tcTitle(c.noDefault), tcDetails(c.noDefault, MODULE), async ({ documentPage }) => {
    await openDrawer(documentPage);
    test.skip((await documentPage.getStorage()) !== null, 'The user already has two documents of one type among the last 3, so a default is expected (TC-08)');
    await expect(documentPage.storageFile).not.toBeChecked();
    await expect(documentPage.storageCloud).not.toBeChecked();
    await expect(documentPage.urlSection).toBeHidden();
    await expect(documentPage.fileSection).toBeHidden();
    await expect(documentPage.nameInput, 'Common fields are shown').toBeVisible();
    await expect(documentPage.saveButton).toBeVisible();
  });

  test(tcTitle(c.fileNoDefault), tcDetails(c.fileNoDefault, MODULE), async ({ documentPage }, testInfo) => {
    const file = makeFile(testInfo, 'atlas-meta.txt', 'metadata check');
    await openDrawer(documentPage);
    await documentPage.selectStorage(STORAGE.FILE);
    await expect(documentPage.fileSection).toBeVisible();
    await expect(documentPage.urlSection).toBeHidden();
    await expect(documentPage.selectFileButton).toHaveText('Select File');
    await documentPage.chooseFile(file);
    await expect(documentPage.uploadedFiles, 'Selected file listed').toHaveCount(1);
    await documentPage.waitForUploadComplete();
    const form = await documentPage.readForm();
    expect(form.extension).toBe('txt');
    expect(form.mimeType).toBe('text/plain');
    expect(Number(form.fileSize)).toBe(Buffer.byteLength('metadata check'));
    await expect(documentPage.selectFileButton, 'Button switches to Replace File').toHaveText('Replace File');
  });

  test(tcTitle(c.cloudNoDefault), tcDetails(c.cloudNoDefault, MODULE), async ({ documentPage }) => {
    await openDrawer(documentPage);
    await documentPage.selectStorage(STORAGE.CLOUD);
    await expect(documentPage.urlSection).toBeVisible();
    await expect(documentPage.fileSection).toBeHidden();
    await documentPage.fillUrl(DOCUMENT.BAD_URL);
    await expect(documentPage.validationMessageFor('FileLocationURL')).toHaveText(DOCUMENT.INVALID_URL_MESSAGE);
    await documentPage.fillUrl(DOCUMENT.GOOGLE_DOC_URL);
    await expect(documentPage.validationMessageFor('FileLocationURL')).toHaveText('');
  });

  // ---------- MF-5: switching StorageType ----------
  test(tcTitle(c.switchStorage), tcDetails(c.switchStorage, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Switch');
    const file = makeFile(testInfo, 'atlas-switch.txt');
    await recordTestValues(testInfo, { 'Document Title': title, url: DOCUMENT.GOOGLE_DOC_URL, 'Final Storage Type': 'Upload file' });
    await openDrawer(documentPage);
    await documentPage.selectStorage(STORAGE.CLOUD);
    await documentPage.fillUrl(DOCUMENT.GOOGLE_DOC_URL);
    await documentPage.selectStorage(STORAGE.FILE);
    await expect(documentPage.fileSection).toBeVisible();
    await expect(documentPage.urlSection).toBeHidden();
    await documentPage.selectStorage(STORAGE.CLOUD);
    await expect(documentPage.urlInput, 'URL kept in memory').toHaveValue(DOCUMENT.GOOGLE_DOC_URL);
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.chooseFile(file);
    await documentPage.waitForUploadComplete();
    await documentPage.fillName(title);
    await documentPage.saveAndWait();
    await expect(documentPage.card(title)).toBeVisible();
    expect(await documentPage.getCardSubtitle(title), 'Only the file data is saved').toBe('TXT file');
  });

  // ---------- MF-7 / AF-1: URL validation ----------
  test(tcTitle(c.invalidUrl), tcDetails(c.invalidUrl, MODULE), async ({ documentPage }, testInfo) => {
    await recordTestValues(testInfo, { url: DOCUMENT.BAD_URL, 'Document Title': name('Bad URL') });
    await openDrawer(documentPage);
    const before = await documentPage.cards.count();
    await documentPage.selectStorage(STORAGE.CLOUD);
    await documentPage.fillName(name('Bad URL'));
    await documentPage.fillUrl(DOCUMENT.BAD_URL);
    await expect(documentPage.validationMessageFor('FileLocationURL')).toHaveText(DOCUMENT.INVALID_URL_MESSAGE);
    await documentPage.clickSave();
    await expect(documentPage.validationMessageFor('FileLocationURL'), 'Save blocked until corrected').toHaveText(DOCUMENT.INVALID_URL_MESSAGE);
    await expect(documentPage.drawer).toHaveCount(1);
    await documentPage.closeDrawer();
    expect(await documentPage.cards.count(), 'No document added').toBe(before);
  });

  // ---------- MF-6 / AF-2: upload ----------
  test(tcTitle(c.uploadFailure), tcDetails(c.uploadFailure, MODULE), async ({ documentPage, page }, testInfo) => {
    const file = makeFile(testInfo, 'atlas-fail.txt');
    await page.route(/amazonaws\.com/i, route => route.abort('failed'));
    await openDrawer(documentPage);
    const before = await documentPage.cards.count();
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.fillName(name('Upload fail'));
    await documentPage.chooseFile(file);
    await expect(documentPage.fileError, 'Upload error shown').toBeVisible({ timeout: 30_000 });
    await expect(documentPage.fileError).toContainText(/could not be uploaded|try again/i);
    await expect(documentPage.saveButton, 'Save blocked after the failed upload').toBeDisabled();
    await expect(documentPage.drawer).toHaveCount(1);
    await documentPage.closeDrawer();
    expect(await documentPage.cards.count(), 'No document added').toBe(before);
  });

  test(tcTitle(c.fileTitle), tcDetails(c.fileTitle, MODULE), async ({ documentPage }, testInfo) => {
    const file = makeFile(testInfo, 'atlas-title-from-file.txt');
    await openDrawer(documentPage);
    await documentPage.selectStorage(STORAGE.FILE);
    await expect(documentPage.nameInput).toHaveValue('');
    await documentPage.chooseFile(file);
    await documentPage.waitForUploadComplete();
    await expect(documentPage.nameInput, 'Title taken from the file name').toHaveValue(/^atlas-title-from-file(\.txt)?$/);
  });

  test(tcTitle(c.readOnlyMeta), tcDetails(c.readOnlyMeta, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Read-only meta');
    const file = makeFile(testInfo, 'atlas-readonly.txt');
    await openDrawer(documentPage);
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.chooseFile(file);
    await documentPage.waitForFileMetadata();
    for (const [label, locator] of [['Extension', documentPage.extension], ['MIME type', documentPage.mimeType], ['File size', documentPage.fileSize], ['Document kind', documentPage.documentKind]]) {
      await expect(locator, `${label} is a hidden system value`).toHaveAttribute('type', 'hidden');
      await expect(locator, `${label} is not an editable control`).toBeHidden();
    }
    expect((await documentPage.readForm()).extension).toBe('txt');
    await documentPage.waitForUploadComplete();
    await documentPage.fillName(title);
    await documentPage.saveAndWait();
    expect(await documentPage.getCardSubtitle(title), 'Kind derived from the extension').toBe('TXT file');
  });

  // ---------- MF-9: save validation ----------
  test(tcTitle(c.noFile), tcDetails(c.noFile, MODULE), async ({ documentPage }) => {
    await openDrawer(documentPage);
    const before = await documentPage.cards.count();
    await documentPage.clickSave();
    await expect(documentPage.validationMessageFor('DocumentName'), 'Required title').toHaveText(DOCUMENT.NAME_REQUIRED_MESSAGE);
    // the StorageType message only applies while no default was pre-selected (TC-08 / TC-09)
    if ((await documentPage.getStorage()) === null) {
      await expect(documentPage.validationMessageFor('StorageTypeIDF'), 'Required storage type').toHaveText(DOCUMENT.STORAGE_REQUIRED_MESSAGE);
    }
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.fillName(name('No file'));
    await documentPage.clickSave();
    await expect(documentPage.drawer, 'Save blocked without a file').toHaveCount(1);
    expect(await documentPage.uploadedFiles.count()).toBe(0);
    await documentPage.closeDrawer();
    expect(await documentPage.cards.count(), 'No document added').toBe(before);
  });

  test(tcTitle(c.uploadPending), tcDetails(c.uploadPending, MODULE), async ({ documentPage, page }, testInfo) => {
    const title = name('Pending upload');
    const file = makeFile(testInfo, 'atlas-pending.txt');
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route(/\/Documents\/VerifyUploadedFile/i, async route => { await held; await route.continue(); });
    await openDrawer(documentPage);
    const before = await documentPage.cards.count();
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.fillName(title);
    await documentPage.chooseFile(file);
    await expect(documentPage.uploadedFiles).toHaveCount(1);
    await expect(documentPage.uploadStatus, 'Upload not complete yet').not.toHaveValue('complete');
    await expect(documentPage.saveButton, 'Save is unavailable while the upload runs').toBeDisabled();
    await expect(documentPage.drawer, 'Drawer stays open').toHaveCount(1);
    expect(await documentPage.cards.count(), 'No document added yet').toBe(before);
    release();
    await documentPage.waitForUploadComplete();
    await expect(documentPage.saveButton, 'Save available once the upload completed').toBeEnabled();
    await documentPage.saveAndWait();
    await expect(documentPage.card(title), 'Saved once the upload completed').toBeVisible();
  });

  test(tcTitle(c.cloudDefaultName), tcDetails(c.cloudDefaultName, MODULE), async ({ documentPage }, testInfo) => {
    const samples = [
      [DOCUMENT.GOOGLE_DOC_URL, DOCUMENT.GOOGLE_DOC_DEFAULT_NAME],
      [DOCUMENT.ONEDRIVE_URL, DOCUMENT.ONEDRIVE_DEFAULT_NAME],
      [DOCUMENT.DROPBOX_URL, DOCUMENT.DROPBOX_DEFAULT_NAME],
      [DOCUMENT.EXTERNAL_URL, DOCUMENT.EXTERNAL_DEFAULT_NAME],
    ];
    await recordTestValues(testInfo, { 'Document Title': '(empty)', url: samples.map(([u]) => u) });
    await documentPage.openParentDocuments();
    for (const [url, expected] of samples) {
      const named = documentPage.cards.filter({ has: documentPage.page.locator('.doc-title > span', { hasText: new RegExp(`^${expected}$`) }) });
      const before = await named.count();
      await documentPage.openAddDrawer();
      await addCloud(documentPage, undefined, url);
      await expect(named, `Default name "${expected}" for ${url}`).toHaveCount(before + 1);
    }
  });

  // ---------- MF-2 / MF-3 ----------
  test(tcTitle(c.listExisting), tcDetails(c.listExisting, MODULE), async ({ documentPage }) => {
    await documentPage.openParentDocuments();
    test.skip((await documentPage.getResultCount()) === 0, 'The parent has no documents yet (run after the add tests)');
    expect(await documentPage.cards.count(), '"Result: N" equals the cards shown').toBe(await documentPage.getResultCount());
    await expect(documentPage.addButton.first()).toBeVisible();
    const first = documentPage.cards.first();
    await expect(first.locator('.doc-subtitle')).toHaveText(/ file$|^Link document$/);
    await expect(first.locator('.doc-meta')).toContainText('Category:');
    await expect(first.locator('.doc-meta')).toContainText('Uploaded by:');
  });

  test(tcTitle(c.viewableDefault), tcDetails(c.viewableDefault, MODULE), async ({ documentPage }) => {
    // Known application defect: the drawer opens with Customer Viewable ON, the use case (MF-3) says false.
    // test.fail() keeps the run green while the defect exists and flags the test as unexpectedly passing once it is fixed.
    test.fail(true, 'Application defect: Customer Viewable defaults to ON instead of false (62431 MF-3)');
    await openDrawer(documentPage);
    await expect(documentPage.customerViewable, 'Enabled for a user with MarkCustomerViewable').toBeEnabled();
    await expect(documentPage.customerViewable, 'Customer Viewable defaults to false (MF-3)').not.toBeChecked();
    await documentPage.setCustomerViewable(true);
    await expect(documentPage.customerViewable).toBeChecked();
  });

  // ---------- MF-9: audit ----------
  test(tcTitle(c.audit), tcDetails(c.audit, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Audit');
    await recordTestValues(testInfo, { 'Document Title': title, url: DOCUMENT.GOOGLE_DOC_URL });
    await openDrawer(documentPage);
    await addCloud(documentPage, title);
    await documentPage.openParent();   // the Audit tab is rendered with the page: reload to include the new entry
    await documentPage.openAuditTab();
    const group = documentPage.auditGroup(title).first();
    await expect(group, 'Audit group for the new document').toBeVisible();
    const text = (await group.innerText()).replace(/\s+/g, ' ');
    expect(text).toContain('DocumentName');
    expect(text).toContain(DOCUMENT.GOOGLE_DOC_URL);
    expect(text).toMatch(/Added/);
  });

  // ---------- MF-8.5: replace file ----------
  test(tcTitle(c.replaceFile), tcDetails(c.replaceFile, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Replace');
    const first = makeFile(testInfo, 'atlas-original.txt', 'original');
    const replacement = makeFile(testInfo, 'atlas-replacement.csv', 'a,b\n1,2\n');
    await recordTestValues(testInfo, { 'Document Title': title, 'Original file': 'atlas-original.txt', 'Replacement file': 'atlas-replacement.csv' });
    await openDrawer(documentPage);
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.chooseFile(first);
    await documentPage.waitForUploadComplete();
    await documentPage.fillName(title);
    await documentPage.saveAndWait();
    expect(await documentPage.getCardSubtitle(title)).toBe('TXT file');

    await documentPage.openEdit(title);
    await expect(documentPage.selectFileButton, 'Replace command for a file document').toHaveText('Replace File');
    await documentPage.replaceFile(replacement);
    await documentPage.waitForFileMetadata();
    await documentPage.waitForUploadComplete();
    expect((await documentPage.readForm()).extension, 'Metadata follows the replacement file').toBe('csv');
    await documentPage.saveAndWait();
    await expect(documentPage.drawer).toHaveCount(0);
    await expect(documentPage.card(title)).toHaveCount(1);
    await expect(documentPage.cardSubtitleLocator(title), 'File kind updated').toHaveText('CSV file');

    await documentPage.openParent();
    await documentPage.openAuditTab();
    await expect(documentPage.auditGroup(title).first(), 'Parent audited for the replacement').toBeVisible();
  });
});
