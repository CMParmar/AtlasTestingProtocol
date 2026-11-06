// View & Edit Document (use case 62432, module CORE) -- the Documents tab of a parent record (a Project in the sandbox):
// View (new browser tab), Export/Download (file documents only), edit metadata, replace file, cloud URL validation,
// switching StorageType, soft delete (with confirmation) and the audit of the parent.
// Uses the authenticated storageState from the setup project (functional project, no retries: a retried test would add a second document).
//
// Every test creates its own documents on the shared parent (Project DOCUMENT_PROJECT_ID, default 819), named with the run tag.
// Delete in the application is a SOFT delete ("hidden but not permanently removed"), so tests may delete the documents they created.
//
// Not automated (needs users / settings the UI cannot set up, or functionality that does not exist yet):
//   - TC-08 / TC-20(req) Restore: MF-11 is "Future Functionality" -- no Restore command exists (kept as test.fixme).
//   - TC-09, TC-11 .. TC-14, TC-19(req), TC-20(req), TC-24: need a second user without CORE.Document.View / Export / Update /
//     MarkCustomerViewable / DeleteSoft / Restore, or without the parent's permissions.
//   - Document list visibility of deleted files "visually differentiated" -- the application hides them (asserted as hidden).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../fixtures/fixtures');
const { DOCUMENT } = require('../utils/constants');
const { name, VIEW_EDIT_MODULE: MODULE, viewEditCases: c } = require('../testData/documentData');
const { tcDetails, tcTitle, recordTestValues, recordUrl } = require('../utils/testCase');

const { STORAGE } = DOCUMENT;

/** Small local file to upload (the upload goes to the sandbox's S3 bucket). */
function makeFile(fileName, content = 'Atlas document test') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-doc-'));
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

test.describe('View & Edit Document (62432)', () => {
  // ---------- MF-2: View ----------
  test(tcTitle(c.viewFile), tcDetails(c.viewFile, MODULE), async ({ documentPage, page }, testInfo) => {
    const title = name('View File');
    await recordTestValues(testInfo, { 'Document Title': title, 'Storage Type': 'Upload file' });
    await documentPage.openParentDocuments();
    await recordUrl(testInfo, page.url(), 'Parent record');
    await documentPage.addFileDocument({ title, filePath: makeFile('atlas-view.txt') });
    await expect(documentPage.viewButton(title), 'View command shown to an authorized user').toBeVisible();
    const { popup, requestUrl } = await documentPage.viewDocument(title);
    expect(requestUrl, 'ViewDocument requested for this document').toMatch(/\/Documents\/ViewDocument\?id=\d+/i);
    expect(popup, 'Document opened in a new browser tab').toBeTruthy();
    await popup.close();
    await expect(documentPage.card(title), 'List unchanged after View').toBeVisible();
  });

  test(tcTitle(c.cloudView), tcDetails(c.cloudView, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('View Link');
    await recordTestValues(testInfo, { 'Document Title': title, 'Storage Type': 'Paste link', url: DOCUMENT.GOOGLE_DOC_URL });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    const { popup, requestUrl } = await documentPage.viewDocument(title);
    expect(requestUrl).toMatch(/\/Documents\/ViewDocument\?id=\d+/i);
    expect(popup, 'Cloud document opened in a new browser tab').toBeTruthy();
    await popup.close();
  });

  test(tcTitle(c.viewMetadata), tcDetails(c.viewMetadata, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Card meta');
    await recordTestValues(testInfo, { 'Document Title': title, Category: 'Test', description: 'Card check' });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title, category: 'Test', description: 'Card check' });
    expect(await documentPage.getCardSubtitle(title)).toBe('Link document');
    expect(await documentPage.getCardMeta(title)).toMatchObject({ Category: 'Test', Description: 'Card check', Uploaded: 'Today' });
    expect((await documentPage.getCardMeta(title))['Uploaded by'], 'Uploader shown').toBeTruthy();
    await expect(documentPage.editIcon(title), 'Edit command shown to an authorized user').toBeVisible();
    await expect(documentPage.deleteLink(title), 'Delete command shown to an authorized user').toBeVisible();
  });

  // ---------- MF-3: Export ----------
  test(tcTitle(c.exportFile), tcDetails(c.exportFile, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Export');
    await recordTestValues(testInfo, { 'Document Title': title, 'File name': 'atlas-export.txt' });
    await documentPage.openParentDocuments();
    await documentPage.addFileDocument({ title, filePath: makeFile('atlas-export.txt', 'exported content') });
    await expect(documentPage.downloadButton(title), 'Download command shown for a file document').toBeVisible();
    const download = await documentPage.downloadDocument(title);
    expect(download.suggestedFilename(), 'Downloaded under the document title').toBe(`${title}.txt`);
    const saved = await download.path();
    expect(fs.readFileSync(saved, 'utf8'), 'Downloaded content is the uploaded file').toBe('exported content');
  });

  test(tcTitle(c.cloudExportHidden), tcDetails(c.cloudExportHidden, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('No export');
    await recordTestValues(testInfo, { 'Document Title': title, 'Storage Type': 'Paste link' });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await expect(documentPage.downloadButton(title), 'Cloud documents cannot be exported').toHaveCount(0);
    await expect(documentPage.viewButton(title)).toBeVisible();
    await expect(documentPage.deleteLink(title)).toBeVisible();
  });

  test(tcTitle(c.browserFallback), tcDetails(c.browserFallback, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Zip view');
    await recordTestValues(testInfo, { 'Document Title': title, 'File name': 'atlas-archive.zip' });
    await documentPage.openParentDocuments();
    await documentPage.addFileDocument({ title, filePath: makeFile('atlas-archive.zip', 'PK\u0003\u0004 not a real archive') });
    expect(await documentPage.getCardSubtitle(title)).toBe('ZIP file');
    const { popup, requestUrl } = await documentPage.viewDocument(title);
    expect(requestUrl, 'The application still serves the document; the browser decides how to show it').toMatch(/\/Documents\/ViewDocument/i);
    await popup.close();
    await expect(documentPage.card(title), 'Application unaffected').toBeVisible();
  });

  // ---------- MF-4 .. MF-9: edit ----------
  test(tcTitle(c.editPrefilled), tcDetails(c.editPrefilled, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Prefilled');
    await recordTestValues(testInfo, { 'Document Title': title, url: DOCUMENT.GOOGLE_DOC_URL, Category: 'Prototype', description: 'Prefilled description' });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title, category: 'Prototype', description: 'Prefilled description' });
    await documentPage.openEdit(title);
    await expect(documentPage.drawer).toHaveCount(1);
    const form = await documentPage.readForm();
    expect(form).toMatchObject({ name: title, storage: STORAGE.CLOUD, url: DOCUMENT.GOOGLE_DOC_URL, description: 'Prefilled description', category: 'Prototype' });
    await expect(documentPage.saveButton).toBeVisible();
    await documentPage.closeDrawer();
  });

  test(tcTitle(c.editMetadata), tcDetails(c.editMetadata, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Edit');
    const newTitle = name('Edited');
    await recordTestValues(testInfo, { 'Document Title': title, 'New Title': newTitle, 'New Category': 'Issue Document', 'New Description': 'Edited by automation', 'Customer Viewable': 'Off' });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title, category: 'Specification', description: 'Original description' });
    const before = await documentPage.getResultCount();

    await documentPage.openEdit(title);
    await documentPage.fillName(newTitle);
    await documentPage.selectCategory('Issue Document');
    await documentPage.fillDescription('Edited by automation');
    await documentPage.setCustomerViewable(false);
    await documentPage.saveAndWait();

    await expect(documentPage.drawer, 'Drawer closes after save (MF-12)').toHaveCount(0);
    await expect(documentPage.card(newTitle), 'Document listed under its new title').toBeVisible();
    await expect(documentPage.card(title), 'Old title no longer listed').toHaveCount(0);
    expect(await documentPage.getCardMeta(newTitle)).toMatchObject({ Category: 'Issue Document', Description: 'Edited by automation' });
    expect(await documentPage.getResultCount(), 'Edit does not add a document').toBe(before);

    await documentPage.openEdit(newTitle);
    expect(await documentPage.readForm(), 'Saved values reload into the drawer').toMatchObject({ name: newTitle, category: 'Issue Document', description: 'Edited by automation', customerViewable: false });
    await documentPage.closeDrawer();
  });

  test(tcTitle(c.auditEdit), tcDetails(c.auditEdit, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Audit edit');
    const newTitle = name('Audit edited');
    await recordTestValues(testInfo, { 'Document Title': title, 'New Title': newTitle });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await documentPage.openEdit(title);
    await documentPage.fillName(newTitle);
    await documentPage.saveAndWait();
    await documentPage.openParent();   // the Audit tab is rendered with the page: reload to include the new entry
    await documentPage.openAuditTab();
    const group = documentPage.auditGroup(newTitle).first();
    await expect(group, 'Audit group for the edit').toBeVisible();
    const text = (await group.innerText()).replace(/\s+/g, ' ');
    expect(text).toContain('DocumentName');
    expect(text).toContain(title);
    expect(text).toContain(newTitle);
  });

  test(tcTitle(c.replaceFile), tcDetails(c.replaceFile, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Replace file');
    await recordTestValues(testInfo, { 'Document Title': title, 'Original file': 'atlas-original.txt', 'Replacement file': 'atlas-replacement.csv' });
    await documentPage.openParentDocuments();
    await documentPage.addFileDocument({ title, filePath: makeFile('atlas-original.txt', 'original') });
    expect(await documentPage.getCardSubtitle(title)).toBe('TXT file');
    await documentPage.openEdit(title);
    await expect(documentPage.selectFileButton, 'Replace command for a file document').toHaveText('Replace File');
    await documentPage.replaceFile(makeFile('atlas-replacement.csv', 'a,b\n1,2\n'));
    await documentPage.waitForFileMetadata();
    await documentPage.waitForUploadComplete();
    expect((await documentPage.readForm()).extension, 'Metadata follows the replacement file').toBe('csv');
    await documentPage.saveAndWait();
    await expect(documentPage.card(title)).toHaveCount(1);
    await expect(documentPage.cardSubtitleLocator(title), 'File kind updated').toHaveText('CSV file');
  });

  // ---------- MF-7: cloud URL ----------
  test(tcTitle(c.invalidUrl), tcDetails(c.invalidUrl, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Edit bad URL');
    await recordTestValues(testInfo, { 'Document Title': title, url: DOCUMENT.BAD_URL });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await documentPage.openEdit(title);
    await documentPage.fillUrl(DOCUMENT.BAD_URL);
    await expect(documentPage.validationMessageFor('FileLocationURL')).toHaveText(DOCUMENT.INVALID_URL_MESSAGE);
    await documentPage.clickSave();
    await expect(documentPage.validationMessageFor('FileLocationURL'), 'Save blocked until corrected').toHaveText(DOCUMENT.INVALID_URL_MESSAGE);
    await expect(documentPage.drawer).toHaveCount(1);
    await documentPage.fillUrl(DOCUMENT.ONEDRIVE_URL);
    await expect(documentPage.validationMessageFor('FileLocationURL'), 'Message clears for a valid URL').toHaveText('');
    await documentPage.saveAndWait();
    await expect(documentPage.card(title)).toBeVisible();
  });

  test(tcTitle(c.cloudEmptyUrl), tcDetails(c.cloudEmptyUrl, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Edit empty URL');
    await recordTestValues(testInfo, { 'Document Title': title, url: '(empty)' });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await documentPage.openEdit(title);
    await documentPage.fillUrl('');
    await documentPage.clickSave();
    await expect(documentPage.validationMessageFor('FileLocationURL')).toHaveText(/^Document URL is required/);
    await expect(documentPage.drawer, 'Save blocked').toHaveCount(1);
    await documentPage.closeDrawer();
    await documentPage.openParentDocuments();   // reload so the saved record is read again
    await documentPage.openEdit(title);
    expect((await documentPage.readForm()).url, 'URL unchanged').toBe(DOCUMENT.GOOGLE_DOC_URL);
    await documentPage.closeDrawer();
  });

  // ---------- MF-8: switching StorageType ----------
  test(tcTitle(c.cloudToFile), tcDetails(c.cloudToFile, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Cloud to file');
    await recordTestValues(testInfo, { 'Document Title': title, 'Final Storage Type': 'Upload file' });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await documentPage.openEdit(title);
    await documentPage.selectStorage(STORAGE.FILE);
    await expect(documentPage.fileSection, 'File controls shown').toBeVisible();
    await expect(documentPage.urlSection).toBeHidden();
    await documentPage.selectStorage(STORAGE.CLOUD);
    await expect(documentPage.urlInput, 'URL retained in memory').toHaveValue(DOCUMENT.GOOGLE_DOC_URL);
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.chooseFile(makeFile('atlas-cloud-to-file.txt'));
    await documentPage.waitForUploadComplete();
    await documentPage.saveAndWait();
    await expect(documentPage.card(title)).toBeVisible();
    expect(await documentPage.getCardSubtitle(title), 'Only the file data is saved').toBe('TXT file');
  });

  test(tcTitle(c.fileToCloud), tcDetails(c.fileToCloud, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('File to cloud');
    await recordTestValues(testInfo, { 'Document Title': title, url: DOCUMENT.DROPBOX_URL, 'Final Storage Type': 'Paste link' });
    await documentPage.openParentDocuments();
    await documentPage.addFileDocument({ title, filePath: makeFile('atlas-file-to-cloud.txt') });
    await documentPage.openEdit(title);
    await documentPage.selectStorage(STORAGE.CLOUD);
    await expect(documentPage.urlSection, 'Cloud fields shown').toBeVisible();
    await expect(documentPage.fileSection).toBeHidden();
    await documentPage.fillUrl(DOCUMENT.DROPBOX_URL);
    await documentPage.saveAndWait();
    await expect(documentPage.card(title)).toBeVisible();
    expect(await documentPage.getCardSubtitle(title), 'Only the cloud link is saved').toBe('Link document');
    await expect(documentPage.downloadButton(title), 'No Download once it is a cloud link').toHaveCount(0);
  });

  // ---------- MF-9: save validation ----------
  test(tcTitle(c.fileNoFile), tcDetails(c.fileNoFile, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Edit no file');
    await recordTestValues(testInfo, { 'Document Title': title, 'Storage Type': 'Upload file (no file chosen)' });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await documentPage.openEdit(title);
    await documentPage.selectStorage(STORAGE.FILE);
    await documentPage.clickSave();
    await expect(documentPage.drawer, 'Save blocked without a file').toHaveCount(1);
    expect(await documentPage.uploadedFiles.count()).toBe(0);
    await documentPage.closeDrawer();
    expect(await documentPage.getCardSubtitle(title), 'Document unchanged').toBe('Link document');
  });

  // ---------- MF-10: soft delete ----------
  test(tcTitle(c.deleteConfirmText), tcDetails(c.deleteConfirmText, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Delete text');
    await recordTestValues(testInfo, { 'Document Title': title });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await documentPage.openDeleteConfirmation(title);
    await expect(documentPage.confirmModalMessage).toHaveText('Are you sure you want to delete this document?');
    await expect(documentPage.confirmModalNote).toHaveText('The document will be hidden but not permanently removed.');
    await expect(documentPage.confirmDeleteButton).toHaveText('Delete document');
    await documentPage.cancelDelete();
  });

  test(tcTitle(c.cancelDelete), tcDetails(c.cancelDelete, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Cancel delete');
    await recordTestValues(testInfo, { 'Document Title': title });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    const before = await documentPage.getResultCount();
    await documentPage.openDeleteConfirmation(title);
    await documentPage.cancelDelete();
    await expect(documentPage.card(title), 'Document kept').toBeVisible();
    expect(await documentPage.getResultCount()).toBe(before);
  });

  test(tcTitle(c.softDelete), tcDetails(c.softDelete, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Delete');
    await recordTestValues(testInfo, { 'Document Title': title });
    await documentPage.openParentDocuments();
    await documentPage.addFileDocument({ title, filePath: makeFile('atlas-delete.txt') });
    const before = await documentPage.getResultCount();
    await expect(documentPage.deleteLink(title), 'Delete command shown to an authorized user').toBeVisible();
    await documentPage.deleteDocument(title);
    await expect(documentPage.card(title), 'Deleted document hidden (MF-12 list refreshed)').toHaveCount(0);
    await expect.poll(() => documentPage.getResultCount(), { message: 'Count drops by one' }).toBe(before - 1);
  });

  test(tcTitle(c.deletedHidden), tcDetails(c.deletedHidden, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Deleted hidden');
    await recordTestValues(testInfo, { 'Document Title': title });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await documentPage.deleteDocument(title);
    await documentPage.openParentDocuments();   // reload: the deletion is persisted
    expect(await documentPage.getCardTitles()).not.toContain(title);
  });

  test(tcTitle(c.auditDelete), tcDetails(c.auditDelete, MODULE), async ({ documentPage }, testInfo) => {
    const title = name('Audit delete');
    await recordTestValues(testInfo, { 'Document Title': title });
    await documentPage.openParentDocuments();
    await documentPage.addCloudDocument({ title });
    await documentPage.deleteDocument(title);
    await documentPage.openParent();
    await documentPage.openAuditTab();
    await expect(documentPage.auditGroup(title).first(), 'The add of the document stays in the audit').toBeVisible();
    // the delete entry does not carry the title: it records ArchivedAtUtc with action SoftDelete (newest group, tests run serially)
    const newest = (await documentPage.getAuditTexts())[0];
    expect(newest, 'Newest audit entry is the soft delete').toContain('ArchivedAtUtc');
    expect(newest).toContain('SoftDelete');
  });

  // ---------- MF-11: restore (future functionality) ----------
  test.fixme(tcTitle(c.restore), tcDetails(c.restore, MODULE), async () => {
    // MF-11 is future functionality: the Documents tab has no Restore command and deleted documents are not listed.
  });
});
