// Page object for viewing / editing an existing Task (use case: View & Edit Task).
// A Task is opened from the "Tasks" tab of its related record (here a Project): the row opens the same
// right-hand drawer as "Create New Task", now titled with the task name. IDs such as #Description also
// exist on the Project form, so every drawer field is scoped to the open drawer.
// No assertions here -- methods act or return values; specs assert.

const { TaskPage } = require('./taskPage');
const { TASK } = require('../../utils/constants');

class TaskEditPage extends TaskPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- Project page: Tasks tab -----------------------------------
    this.addTaskFromTabButton = page.locator('main button.action-btn').filter({ hasText: 'Task' }).first();
    this.taskRows = page.locator('tr.entity-tasks-row');
    this.pageSizeSelect = page.locator('#entity-tasks-table_wrapper .dt-length select');
    this.nextPageButton = page.locator('#entity-tasks-table_wrapper button.page-link.next');

    // ---- Task drawer (scoped: the Project form reuses the same IDs) --
    this.drawer = page.locator('#slideOutPanel.is-open');
    this.drawerHeading = this.drawer.getByRole('heading');
    this.drawerCloseButton = this.drawer.locator('.right-drawer__close');
    this.ownerSelect = this.drawer.locator('#OwnerPersonIDF');
    this.titleTextBox = this.drawer.locator('#ActionItemName');
    this.descriptionTextBox = this.drawer.locator('#Description');
    this.dueDateInput = this.drawer.locator('#DueDate');
    this.statusSelect = this.drawer.locator('#IsComplete');
    this.saveButton = this.drawer.locator('#btnSaveTask');
    this.titleError = this.drawer.locator('.field-validation-error');
    this.relatedRecordLink = this.drawer.locator('.task-related-record__link');
    this.relatedRecordInputs = this.drawer.locator('#EntityIDF, #EntityRecordID');

    // ---- Reminder (trigger is in the drawer; the popup is page-level) --
    this.openReminderPopupPanel = page.locator('#workItemReminderOverlay.is-open');
    this.reminderTrigger = this.drawer.locator('#btnOpenWorkItemReminder');
    this.reminderDisplay = this.drawer.locator('#workItemReminderDisplay');
    this.removeReminderButton = page.locator('#btnRemoveWorkItemReminder');
    // -----------------------------------------------------------------
  }

  // ---- Navigation -----------------------------------------------------

  async openProjectTasksTab(projectId = TASK.PROJECT_ID) {
    await this.openRecord(`/Project/Edit/${projectId}`);
    await this.openTab('Tasks');
    await this.addTaskFromTabButton.waitFor();
  }

  /** Row of a task in the Project's Tasks tab. */
  taskRow(title) {
    return this.taskRows.filter({ hasText: title }).first();
  }

  /**
   * Brings a task's row into view: the Tasks tab is a paged table (sorted by name, no search),
   * so show the most rows per page and step through the pages until the row is there.
   */
  async showTask(title) {
    await this.taskRows.first().waitFor();
    await this.pageSizeSelect.selectOption(this.pageSizeSelect.locator('option').last());
    const row = this.taskRow(title);
    while (!(await row.isVisible()) && (await this.nextPageButton.isEnabled())) {
      await this.click(this.nextPageButton);
    }
    await row.waitFor();
    return row;
  }

  async openTask(title) {
    await (await this.showTask(title)).click();
    await this.saveButton.waitFor();
  }

  /** Reloads the Project's Tasks tab and opens the task, so the values shown come from the database. */
  async reopenTask(title, projectId = TASK.PROJECT_ID) {
    await this.openProjectTasksTab(projectId);
    await this.openTask(title);
  }

  async closeDrawer() {
    await this.click(this.drawerCloseButton);
  }

  // ---- Seeding --------------------------------------------------------

  /**
   * Creates a Task (owner = me) on the Project's Tasks tab and leaves the tab showing it.
   * @param {{title:string, description?:string, dueDate?:string, reminder?:{date:string,time:string}}} task
   */
  async createProjectTask({ title, description, dueDate, reminder }) {
    await this.openProjectTasksTab();
    await this.click(this.addTaskFromTabButton);
    await this.saveButton.waitFor();
    await this.enterTitle(title);
    if (description) await this.enterDescription(description);
    if (dueDate) await this.enterDueDate(dueDate);
    if (reminder) await this.setReminder(reminder.date, reminder.time);
    await this.clickSave();
    await this.successToast.first().waitFor();
    // the list does not refresh right after a save: reload so the new row is there
    await this.openProjectTasksTab();
    await this.showTask(title);
  }

  // ---- Reminder -------------------------------------------------------

  /** Opens the reminder popup and presses "Remove Reminder" (clears it on the form; saved with Save). */
  async removeReminder() {
    await this.openReminderPopup();
    await this.click(this.removeReminderButton);
  }

  async getReminderText() {
    return (await this.getInnerText(this.reminderDisplay)).trim();
  }

  async isReminderReadOnly() {
    return (await this.reminderTrigger.getAttribute('aria-disabled')) === 'true';
  }

  // ---- Row values (Tasks tab: status pill, name, due date, owner) ------

  async getRowValues(title) {
    const cells = await (await this.showTask(title)).locator('td').allInnerTexts();
    return { status: cells[0].trim(), name: cells[1].trim(), dueDate: cells[2].trim(), owner: cells[3].trim() };
  }

  /** Row values as saved: reloads the Tasks tab first, because the list does not refresh right after a save. */
  async getSavedRowValues(title) {
    await this.openProjectTasksTab();
    return this.getRowValues(title);
  }

  async getRelatedRecordHref() {
    return this.relatedRecordLink.getAttribute('href');
  }
}

module.exports = { TaskEditPage };
