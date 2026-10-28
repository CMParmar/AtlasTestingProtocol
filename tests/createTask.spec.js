// Create Task (use case 62547) -- Assignments page, "Create New Task" drawer.
// Uses the authenticated storageState from the setup project.
// Not automated (no suitable data/UI): BR-1 (customer users cannot create tasks)
// and AF-2 (ineligible owner -- the owner list only offers eligible people).

const { test, expect } = require('../fixtures/pages.fixture');
const { TASK } = require('../utils/constants');
const { dateOffset } = require('../utils/dateHelpers');
const { uniqueTitle } = require('../utils/testDataGenerator');

test.describe('Create Task', () => {
  test.beforeEach(async ({ taskPage }) => {
    await taskPage.navigateToTaskPage();
    await expect(taskPage.addTaskButton).toBeVisible();
    await taskPage.openCreateTaskDrawer();
    await expect(taskPage.drawerHeading).toBeVisible();
  });

  // ---------------- MF-1: Start Task Creation ----------------
  test('TC-01 form opens with defaults (owner = me, status = Not Done, no due date/reminder)', async ({ taskPage }) => {
    expect(await taskPage.getSelectedOwnerLabel()).toBe(TASK.DEFAULT_OWNER_LABEL);
    expect(await taskPage.getSelectedStatusLabel()).toBe(TASK.DEFAULT_STATUS_LABEL);
    await expect(taskPage.titleTextBox).toHaveValue('');
    await expect(taskPage.descriptionTextBox).toHaveValue('');
    await expect(taskPage.dueDateInput).toHaveValue('');
    expect(await taskPage.getReminderTriggerText()).toBe(TASK.REMINDER_PLACEHOLDER);
    await expect(taskPage.saveButton).toBeEnabled();
  });

  test('TC-02 owner list offers other people besides me', async ({ taskPage }) => {
    const labels = await taskPage.getOwnerLabels();
    expect(labels).toContain(TASK.DEFAULT_OWNER_LABEL);
    expect(labels).toContain(TASK.OTHER_OWNER_LABEL);
    expect(labels.length).toBeGreaterThan(2);
  });

  // ---------------- MF-3: Create Task (happy paths) ----------------
  test('TC-03 create task with title only', async ({ taskPage }) => {
    await taskPage.enterTitle(uniqueTitle('AUTO title-only'));
    await taskPage.clickSave();
    await expect(taskPage.successToast).toContainText(TASK.SUCCESS_MESSAGE);
    await expect(taskPage.drawerHeading).toBeHidden();
  });

  test('TC-04 create task with all fields (description, due date, future reminder)', async ({ taskPage }) => {
    await taskPage.enterTitle(uniqueTitle('AUTO all-fields'));
    await taskPage.enterDescription('Created by Playwright automation');
    await taskPage.enterDueDate(dateOffset(5));
    await taskPage.setReminder(dateOffset(2), TASK.REMINDER_TIME);
    expect(await taskPage.getReminderTriggerText()).not.toBe(TASK.REMINDER_PLACEHOLDER);
    await taskPage.clickSave();
    await expect(taskPage.successToast).toContainText(TASK.SUCCESS_MESSAGE);
    await expect(taskPage.drawerHeading).toBeHidden();
  });

  test('TC-05 created task increments the Tasks tab count', async ({ taskPage }) => {
    const before = await taskPage.getTasksTabText();
    const beforeCount = Number((before.match(/\d+/) || ['0'])[0]);
    await taskPage.enterTitle(uniqueTitle('AUTO count'));
    await taskPage.clickSave();
    await expect(taskPage.successToast).toBeVisible();
    await expect.poll(async () => {
      const text = await taskPage.getTasksTabText();
      return Number((text.match(/\d+/) || ['0'])[0]);
    }).toBeGreaterThan(beforeCount);
  });

  test('TC-06 create task with status Done', async ({ taskPage }) => {
    await taskPage.enterTitle(uniqueTitle('AUTO done'));
    await taskPage.selectStatusByLabel(TASK.DONE_STATUS_LABEL);
    await taskPage.clickSave();
    await expect(taskPage.successToast).toContainText(TASK.SUCCESS_MESSAGE);
  });

  test('TC-07 create task assigned to another person (BR-4, BR-5)', async ({ taskPage }) => {
    await taskPage.selectOwnerByLabel(TASK.OTHER_OWNER_LABEL);
    await taskPage.enterTitle(uniqueTitle('AUTO other-owner'));
    await taskPage.clickSave();
    await expect(taskPage.successToast).toContainText(TASK.SUCCESS_MESSAGE);
    await expect(taskPage.drawerHeading).toBeHidden();
  });

  // ---------------- Validation ----------------
  test('TC-08 title is required', async ({ taskPage }) => {
    await taskPage.clickSave();
    await expect(taskPage.titleError).toContainText(TASK.TITLE_REQUIRED_MESSAGE);
    await expect(taskPage.drawerHeading).toBeVisible();
    await expect(taskPage.successToast).toBeHidden();
  });

  test('TC-10 title is limited to 200 characters', async ({ taskPage }) => {
    await taskPage.typeTitle('A'.repeat(TASK.TITLE_MAX_LENGTH + 20));
    await expect(taskPage.titleTextBox).toHaveValue('A'.repeat(TASK.TITLE_MAX_LENGTH));
  });

  // ---------------- BR-6: Reminder timing (AF-3) ----------------
  test('TC-11 past reminder is rejected with future-date message', async ({ taskPage }) => {
    await taskPage.setReminder(TASK.PAST_DATE, TASK.REMINDER_TIME);
    await expect(taskPage.reminderError).toContainText(TASK.REMINDER_FUTURE_MESSAGE);
    await expect(taskPage.reminderPopup).toHaveClass(/is-open/);
    await taskPage.cancelReminder();
    expect(await taskPage.getReminderTriggerText()).toBe(TASK.REMINDER_PLACEHOLDER);
  });

  test('TC-12 cancelling the reminder popup leaves no reminder', async ({ taskPage }) => {
    await taskPage.openReminderPopup();
    await taskPage.enterReminder(dateOffset(3), TASK.REMINDER_TIME);
    await taskPage.cancelReminder();
    expect(await taskPage.getReminderTriggerText()).toBe(TASK.REMINDER_PLACEHOLDER);
  });

  // ---------------- BR-7: Reminder / due date independence ----------------
  test('TC-13 reminder without a due date is allowed', async ({ taskPage }) => {
    await taskPage.enterTitle(uniqueTitle('AUTO reminder-no-due'));
    await taskPage.setReminder(dateOffset(2), TASK.REMINDER_TIME);
    await taskPage.clickSave();
    await expect(taskPage.successToast).toContainText(TASK.SUCCESS_MESSAGE);
  });

  const reminderVsDue = [
    { name: 'before', reminderDays: 2, dueDays: 6 },
    { name: 'on', reminderDays: 4, dueDays: 4 },
    { name: 'after', reminderDays: 8, dueDays: 4 },
  ];
  for (const { name, reminderDays, dueDays } of reminderVsDue) {
    test(`TC-14 reminder ${name} the due date is allowed`, async ({ taskPage }) => {
      await taskPage.enterTitle(uniqueTitle(`AUTO reminder-${name}-due`));
      await taskPage.enterDueDate(dateOffset(dueDays));
      await taskPage.setReminder(dateOffset(reminderDays), TASK.REMINDER_TIME);
      await taskPage.clickSave();
      await expect(taskPage.successToast).toContainText(TASK.SUCCESS_MESSAGE);
    });
  }

  // ---------------- BR-9: Reminder reserved to owner ----------------
  test('TC-15 reminder is disabled when owner is changed to another person', async ({ taskPage }) => {
    await taskPage.selectOwnerByLabel(TASK.OTHER_OWNER_LABEL);
    await expect(taskPage.reminderTrigger).toHaveAttribute('aria-disabled', 'true');
  });

  test('TC-16 reassigning owner clears the reminder; reassigning back re-enables it without restoring', async ({ taskPage }) => {
    await taskPage.setReminder(dateOffset(2), TASK.REMINDER_TIME);
    expect(await taskPage.getReminderTriggerText()).not.toBe(TASK.REMINDER_PLACEHOLDER);

    await taskPage.selectOwnerByLabel(TASK.OTHER_OWNER_LABEL);
    await expect(taskPage.reminderTrigger).toHaveAttribute('aria-disabled', 'true');
    expect(await taskPage.getReminderTriggerText()).toBe(TASK.REMINDER_PLACEHOLDER);

    await taskPage.selectOwnerByLabel(TASK.DEFAULT_OWNER_LABEL);
    await expect(taskPage.reminderTrigger).not.toHaveAttribute('aria-disabled', 'true');
    expect(await taskPage.getReminderTriggerText()).toBe(TASK.REMINDER_PLACEHOLDER);
  });
});
