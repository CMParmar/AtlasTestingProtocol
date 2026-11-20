// Page object for the Assignments (/task) page and its "Create New Task" drawer.
// No assertions here -- methods act or return values; specs assert.

const { BasePage } = require('../basePage');
const { expect } = require('@playwright/test');
const { ROUTES } = require('../../utils/constants');

class TaskPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Assignments page ------------------------------------------
    this.addTaskButton = page.locator('#btnAssignmentsAddTask');
    this.tasksTab = page.locator('button.assignments-tab[data-tab="Tasks"]');
    this.successToast = page.locator('.toast-success');

    // ---- Create New Task drawer ------------------------------------
    this.drawerHeading = page.getByRole('heading', { name: 'Create New Task' });
    this.ownerSelect = page.locator('#OwnerPersonIDF');
    this.titleTextBox = page.locator('#ActionItemName');
    this.descriptionTextBox = page.locator('#Description');
    this.dueDateInput = page.locator('#DueDate');
    this.reminderTrigger = page.locator('#btnOpenWorkItemReminder');
    this.statusSelect = page.locator('#IsComplete');
    this.saveButton = page.locator('#btnSaveTask');
    this.titleError = page.locator('.field-validation-error');

    // ---- Reminder popup --------------------------------------------
    this.reminderPopup = page.locator('#workItemReminderOverlay');
    this.reminderDayInput = page.locator('#reminderDayInput');
    this.reminderTimeSelect = page.locator('#reminderTimeSelect');
    this.reminderError = page.locator('#reminderValidationError');
    this.reminderApplyButton = page.locator('#btnReminderApply');
    this.reminderCancelButton = page.locator('#btnReminderCancel');
    // -----------------------------------------------------------------
  }

  async navigateToTaskPage() {
    await this.goto(ROUTES.TASK);
  }

  /**
   * The Assignments filters are saved per user, so a keyword/filter left by another spec hides
   * newly created tasks. Clears them when any filter chip is showing.
   */
  async clearSavedFilters() {
    const chips = this.page.locator('#assignments-filter-chips [data-chip-key]');
    if (!(await chips.count())) return;
    await this.page.locator('#btnAssignmentsFilters').click();
    await this.page.locator('#btnAssignmentsReset').click();
    await expect(chips).toHaveCount(0);
  }

  async openCreateTaskDrawer() {
    // Under load the button can be clickable before its handler is bound, so the first click is lost:
    // retry the click until the drawer actually opens.
    await expect(async () => {
      if (await this.drawerHeading.isVisible()) return;
      await this.addTaskButton.click({ timeout: 5_000 });
      await expect(this.drawerHeading).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
  }

  async selectOwnerByLabel(label) {
    await this.ownerSelect.selectOption({ label });
  }

  async enterTitle(title) {
    await this.fill(this.titleTextBox, title);
  }

  /** Keystroke-by-keystroke so the native maxlength applies. */
  async typeTitle(title) {
    await this.type(this.titleTextBox, title);
  }

  async enterDescription(text) {
    await this.fill(this.descriptionTextBox, text);
  }

  async enterDueDate(isoDate) {
    await this.fill(this.dueDateInput, isoDate);
  }

  async selectStatusByLabel(label) {
    await this.statusSelect.selectOption({ label });
  }

  async openReminderPopup() {
    await this.click(this.reminderTrigger);
  }

  async enterReminder(isoDate, time24) {
    await this.fill(this.reminderDayInput, isoDate);
    await this.selectOption(this.reminderTimeSelect, time24);
  }

  async applyReminder() {
    await this.click(this.reminderApplyButton);
  }

  async cancelReminder() {
    await this.click(this.reminderCancelButton);
  }

  /** Open popup, enter date/time and press Apply. */
  async setReminder(isoDate, time24) {
    await this.openReminderPopup();
    await this.enterReminder(isoDate, time24);
    await this.applyReminder();
  }

  /**
   * Saving re-renders a very large list, so the toast can come and go between two polls.
   * Records any success toast text into window.__taskToasts from the moment it is installed.
   */
  async watchSuccessToast() {
    await this.page.evaluate(() => {
      window.__taskToasts = [];
      const grab = () => document.querySelectorAll('.toast-success').forEach(
        (el) => { const t = el.textContent.trim(); if (t && !window.__taskToasts.includes(t)) window.__taskToasts.push(t); });
      grab();
      new MutationObserver(grab).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
  }

  /** Returns the toast texts seen since watchSuccessToast(). */
  async getSeenToasts() {
    return this.page.evaluate(() => window.__taskToasts || []);
  }

  async clickSave() {
    await this.click(this.saveButton);
  }

  async getReminderTriggerText() {
    return (await this.getInnerText(this.reminderTrigger)).trim();
  }

  async getSelectedOwnerLabel() {
    return this.ownerSelect.evaluate((el) => el.options[el.selectedIndex].text.trim());
  }

  async getSelectedStatusLabel() {
    return this.statusSelect.evaluate((el) => el.options[el.selectedIndex].text.trim());
  }

  async getOwnerLabels() {
    return this.ownerSelect.locator('option').allTextContents();
  }

  async getTasksTabText() {
    return (await this.getInnerText(this.tasksTab)).replace(/\s+/g, ' ').trim();
  }
}

module.exports = { TaskPage };
