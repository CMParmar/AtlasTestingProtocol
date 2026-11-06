const { expect } = require('@playwright/test');
const { BasePage } = require('../basePage');
const { env } = require('../../utils/testData');

const LIST_PATH = '/Setting/BundleList';
const MODAL = '.modal.show, .swal2-popup, .bootbox, [role="dialog"], [role="alertdialog"]';

/**
 * Create Bundle (use case 63196) - Settings -> Bundles = /Setting/BundleList.
 * List: "Create Bundle" (#bundleBtnOpenCreate), search box (#bundleSearch), table #bundlesTable - each row has the
 * name link (a.name-link -> /Bundle/Edit/{id}), a subtitle ("Bundle (0 items)") and a status badge ("Draft (v1)").
 * "Create Bundle" copies the hidden #bundleDrawerTemplate into the slide-out panel #slideOutPanel (class is-open).
 * The template keeps the same ids, so every form locator is scoped to the open panel:
 *   Name * (#bundleDrawerName, maxlength 200), Description (#bundleDrawerDescription, maxlength 250),
 *   Subscription bundle switch (#bundleDrawerSubscription, off when opened), Save (#bundleBtnSave), close (X).
 * Save posts to /Bundle/Create (AJAX); success redirects to View & Edit Bundle (63197). An empty / blank name shows
 * "Enter a name for this bundle." under the field; a duplicate name opens a modal "Bundle name already in use" with Ok.
 */
class BundlePage extends BasePage {
  constructor(page) {
    super(page);
    this.main = page.locator('main');
    // Settings page
    this.settingsBundlesLink = this.main.locator(`a[href="${LIST_PATH}"]`);
    // Bundles list
    this.createCommand = page.locator('#bundleBtnOpenCreate');
    this.search = page.locator('#bundleSearch');
    this.rows = page.locator('#bundlesTable tbody tr[data-bundle-id]');
    // Create Bundle panel
    this.drawer = page.locator('#slideOutPanel.is-open');
    this.drawerTitle = this.drawer.getByText('Create Bundle', { exact: true });
    this.name = this.drawer.locator('#bundleDrawerName');
    this.nameError = this.drawer.locator('#bundleDrawerNameError');
    this.description = this.drawer.locator('#bundleDrawerDescription');
    this.subscription = this.drawer.locator('#bundleDrawerSubscription');
    this.serverError = this.drawer.locator('#bundleDrawerServerError');
    this.saveButton = this.drawer.locator('#bundleBtnSave');
    this.closeButton = this.drawer.locator('.right-drawer__close');
    this.versionNumberInput = this.drawer.locator('input[name*="Version" i]:not([type="hidden"])');
    // duplicate-name scenario (modal)
    this.duplicateModal = page.locator(MODAL).filter({ visible: true, hasText: /bundle with this name already exists/i }).first();
    this.duplicateError = this.duplicateModal;
    this.duplicateOk = this.duplicateModal.getByRole('button', { name: /^\s*Ok\s*$/i });
    // visible field / server errors in the panel
    this.validationErrors = this.drawer.locator('.field-validation-error, #bundleDrawerServerError')
      .filter({ visible: true, hasText: /[A-Za-z]{3}/ });
    this.validationError = this.validationErrors.first();
    // saved bundle (View & Edit Bundle, 63197)
    this.editSubscription = this.main.locator('input[name*="Subscription" i]:not([type="hidden"]), input[id*="Subscription" i]')
      .or(this.main.getByLabel(/Subscription/i)).first();
    this.draftStatus = this.main.getByText(/\bDraft\b/).filter({ visible: true }).first();
    this.contentsSection = this.main.getByText(/\b(Bundle Lines?|Lines|Contents|Offerings|Items|Add Line|Add Item|Add Offering)\b/i)
      .filter({ visible: true }).first();
    this.archiveCommand = this.main.getByRole('button', { name: /^\s*Archive( Bundle)?\s*$/i })
      .or(this.main.getByRole('link', { name: /^\s*Archive( Bundle)?\s*$/i })).filter({ visible: true }).first();
  }

  static get listPath() {
    return env.bundleListPath || LIST_PATH;
  }

  /** Bundles list (/Setting/BundleList). */
  async openBundles() {
    // The sandbox sometimes stalls before domcontentloaded on this page (page.goto 45s timeout): resolve the navigation
    // as soon as the response starts, retry up to 3 times, and let the "Create Bundle" button prove the page is usable.
    const path = BundlePage.listPath;
    const acceptLeave = d => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()); // leftover "leave page?" prompt
    this.page.on('dialog', acceptLeave);
    try {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.page.goto(path, { waitUntil: 'commit', timeout: 60_000 });
        // scripts must be attached before the button works: wait for the document (and then the page load) to finish
        await this.page.waitForLoadState('domcontentloaded', { timeout: 60_000 });
        await this.page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});
        await this.createCommand.waitFor({ state: 'visible', timeout: 45_000 });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
      }
    }
    } finally {
      this.page.off('dialog', acceptLeave);
    }
    await expect(this.createCommand, '"Create Bundle" button on the Bundles page').toBeVisible({ timeout: 30_000 });
  }

  /** MF-1: Bundles list -> "Create Bundle" -> Create Bundle panel. */
  async openCreate() {
    await this.openBundles();
    // retry the click: it is lost if the list's scripts were not ready yet
    await expect(async () => {
      if (!(await this.drawer.isVisible())) await this.createCommand.click();
      await expect(this.drawer).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
    await this.expectFormOpen();
  }

  async expectFormOpen() {
    await expect(this.drawer, 'Create Bundle panel opened').toBeVisible({ timeout: 15_000 });
    await expect(this.drawerTitle).toBeVisible();
    await expect(this.name, 'Name field').toBeVisible();
    await expect(this.saveButton, 'Save button').toBeVisible();
  }

  async subscriptionValue() {
    return this.subscription.isChecked();
  }

  /** MF-2: fills the panel ({ bundleName, description, subscription }); undefined fields are left as they are. */
  async fill({ bundleName, description, subscription }) {
    if (bundleName !== undefined) await this.name.fill(bundleName);
    if (description !== undefined) await this.description.fill(description);
    if (subscription !== undefined) await this.setSubscription(subscription);
  }

  /** The switch input sits outside the viewport (styled switch), so toggle it with a DOM click that fires change. */
  async setSubscription(on) {
    await this.subscription.evaluate((el, want) => { if (el.checked !== want) el.click(); }, on);
    await expect(this.subscription, 'Subscription bundle switch').toBeChecked({ checked: on });
  }

  /** Saved bundle: the "Subscription bundle" definition (Yes / No) -> true / false, or null when not shown. */
  async savedSubscription() {
    const dd = this.main.locator('dt', { hasText: /^\s*Subscription bundle\s*$/i }).locator('xpath=following-sibling::dd[1]');
    if (!(await dd.count())) return null;
    return /^\s*yes\s*$/i.test(await dd.innerText());
  }

  /** Outcome of a Save click: 'saved' (left the list page), 'rejected' (field / server error or duplicate modal) or ''. */
  async saveOutcome(listUrl) {
    if (this.page.url() !== listUrl) return 'saved';
    if ((await this.validationError.isVisible()) || (await this.duplicateModal.isVisible())) return 'rejected';
    return '';
  }

  /** MF-2: saves and waits for View & Edit Bundle. Returns { url, id }. */
  async submitNew() {
    const listUrl = this.page.url();
    await this.saveButton.click();
    await expect.poll(() => this.saveOutcome(listUrl), { message: 'Bundle saved and View & Edit Bundle opened', timeout: 30_000 }).toBe('saved');
    await this.page.waitForLoadState('domcontentloaded');
    return { url: this.page.url(), id: this.recordIdFromUrl() };
  }

  /** Save for a negative test: waits for an error or a (wrong) save. Returns { saved, url, id }. */
  async trySave() {
    const listUrl = this.page.url();
    await this.saveButton.click();
    await expect.poll(() => this.saveOutcome(listUrl), { timeout: 30_000 }).not.toBe('');
    const saved = (await this.saveOutcome(listUrl)) === 'saved';
    if (saved) await this.page.waitForLoadState('domcontentloaded');
    return { saved, url: this.page.url(), id: saved ? this.recordIdFromUrl() : '' };
  }

  /** Closes the duplicate-name modal with Ok (the panel stays open with the entered values). */
  async acknowledgeDuplicate() {
    await this.duplicateOk.click();
    await expect(this.duplicateModal).toBeHidden();
  }

  /** Closes the panel with X, continuing without saving if the unsaved-changes warning appears. */
  async closeWithoutSaving() {
    this.page.once('dialog', d => d.accept());
    await this.closeButton.click();
    await this.page.locator('.modal.show [data-action="continue"]').click({ timeout: 3_000 }).catch(() => {});
    await expect(this.drawer, 'Create Bundle panel closed').toBeHidden();
  }

  /** The value is shown on the saved bundle (text, input or textarea value; whitespace ignored). */
  async expectShown(value, what) {
    await expect.poll(() => this.main.evaluate((m, v) => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const texts = [m.innerText, ...[...m.querySelectorAll('input, textarea')].map(e => e.value)];
      return texts.some(t => norm(t).includes(norm(v)));
    }, value), { message: `${what} "${value}" shown on the bundle`, timeout: 15_000 }).toBe(true);
  }

  /** Bundles list row of a bundle (after searching for it). */
  async findRow(name) {
    await this.openBundles();
    await this.search.fill(name);
    return this.rows.filter({ has: this.page.locator('a.name-link').getByText(name, { exact: true }) }).first();
  }

  /** True when the Bundles list shows the bundle. */
  async listed(name) {
    const row = await this.findRow(name);
    return row.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
  }

  /** Bundles list: { status, subtitle, href } of the bundle's row, e.g. { status: 'Draft (v1)', subtitle: 'Bundle (0 items)' }. */
  async listRow(name) {
    const row = await this.findRow(name);
    await expect(row, `Bundle "${name}" listed on the Bundles page`).toBeVisible({ timeout: 10_000 });
    return {
      status: (await row.locator('.bundle-badge').first().innerText()).trim(),
      subtitle: (await row.locator('.bundle-row-subtitle').first().innerText().catch(() => '')).trim(),
      href: await row.locator('a.name-link').first().getAttribute('href'),
    };
  }

  /** Archives the open bundle, confirming the prompt; false when the app offers no Archive command. */
  async archive() {
    if (!(await this.archiveCommand.count())) return false;
    this.page.once('dialog', d => d.accept());
    await this.archiveCommand.click();
    const confirm = this.page.locator(MODAL).filter({ visible: true }).getByRole('button', { name: /^\s*(Yes|Archive|Confirm|Ok|Continue)\s*$/i }).first();
    await confirm.click({ timeout: 5_000 }).catch(() => {});
    await this.page.waitForLoadState('domcontentloaded');
    return true;
  }

  /** Signed-in user's display name from the header user menu (e.g. "Dharit Mehta"). */
  async currentUserName() {
    const lines = (await this.userMenu.innerText()).split('\n').map(s => s.trim()).filter(Boolean);
    return lines.filter(l => /\s/.test(l)).sort((a, b) => b.length - a.length)[0] || lines[0] || '';
  }
}

module.exports = { BundlePage, LIST_PATH };
