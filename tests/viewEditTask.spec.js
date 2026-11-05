// View & Edit Task -- Task drawer opened from a Project's "Tasks" tab.
// Uses the authenticated storageState from the setup project.
// Every test seeds its own Task (owner = me) on the Project TASK.PROJECT_ID, so tests never depend on each other.
// Tasks are not deleted (no delete in the UI); titles carry a timestamp.
//
// Not automated:
//   - Permission scenarios (PERM.TASK.ActionItem.Update; Owner/Creator/entity-update authority) -- need users
//     without the permission or without access to the related record.
//   - BR-1 / AF-1 (ineligible owner) -- the Assigned-to list only offers eligible people, so it cannot be submitted.
//   - BR-4 with an already-past reminder -- a past reminder cannot be created through the UI.
//   - Archive / restore, IsFlagged, reminder processing and notifications (out of scope of the use case).

const { test, expect } = require('../fixtures/pages.fixture');
const { TASK } = require('../utils/constants');
const { dateOffset, formatListDate, formatReminderDisplay } = require('../utils/dateHelpers');
const { uniqueTitle } = require('../utils/testDataGenerator');

const REMINDER_DAYS = 2;
const DUE_DAYS = 6;

/** Seeds a task with every shared attribute and a reminder; returns the values used. */
async function seedTask(taskEditPage, label, overrides = {}) {
  const task = {
    title: uniqueTitle(`AUTO ${label}`),
    description: 'Seeded by Playwright automation',
    dueDate: dateOffset(DUE_DAYS),
    reminder: { date: dateOffset(REMINDER_DAYS), time: TASK.REMINDER_TIME },
    ...overrides,
  };
  await taskEditPage.createProjectTask(task);
  return task;
}

/** Saves the open drawer and waits for the "changes saved" toast. */
async function saveAndExpectSaved(taskEditPage) {
  await taskEditPage.clickSave();
  await expect(taskEditPage.successToast.filter({ hasText: TASK.SAVE_MESSAGE }).first()).toBeVisible();
}

/** Hands a task over to another person and saves, so the logged-in user is no longer its Owner. */
async function reassignToOther(taskEditPage, title) {
  await taskEditPage.openTask(title);
  await taskEditPage.selectOwnerByLabel(TASK.OTHER_OWNER_LABEL);
  await saveAndExpectSaved(taskEditPage);
  await expect(taskEditPage.drawer).toHaveCount(0);
}

test.describe('View & Edit Task', () => {
  // ---------------- MF-1: View Task ----------------
  test.describe('MF-1 View Task', () => {
    test('TC-01 opening a task shows its current details', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'view');
      await taskEditPage.reopenTask(task.title);

      await expect(taskEditPage.drawerHeading.first()).toHaveText(task.title);
      await expect(taskEditPage.titleTextBox).toHaveValue(task.title);
      await expect(taskEditPage.descriptionTextBox).toHaveValue(task.description);
      await expect(taskEditPage.dueDateInput).toHaveValue(task.dueDate);
      expect(await taskEditPage.getSelectedOwnerLabel()).toBe(TASK.DEFAULT_OWNER_LABEL);
      expect(await taskEditPage.getSelectedStatusLabel()).toBe(TASK.NOT_DONE_STATUS_LABEL);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(task.reminder.date, task.reminder.time));
      await expect(taskEditPage.saveButton).toBeEnabled();
    });

    test('TC-02 task with no due date and no reminder shows empty fields', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'view-empty', { description: '', dueDate: '', reminder: null });
      await taskEditPage.reopenTask(task.title);

      await expect(taskEditPage.descriptionTextBox).toHaveValue('');
      await expect(taskEditPage.dueDateInput).toHaveValue('');
      expect(await taskEditPage.getReminderText()).toBe(TASK.REMINDER_PLACEHOLDER);
    });

    test('TC-03 task list row shows status, title, due date and owner', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'view-row');
      const row = await taskEditPage.getRowValues(task.title);
      expect(row).toEqual({
        status: TASK.NOT_DONE_STATUS_LABEL,
        name: task.title,
        dueDate: formatListDate(task.dueDate),
        owner: TASK.DEFAULT_OWNER_LABEL,
      });
    });

    test('TC-04 owner dropdown offers eligible people; status offers Not Done and Done', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'view-lists');
      await taskEditPage.openTask(task.title);

      const owners = await taskEditPage.getOwnerLabels();
      expect(owners).toContain(TASK.DEFAULT_OWNER_LABEL);
      expect(owners).toContain(TASK.OTHER_OWNER_LABEL);

      const statuses = (await taskEditPage.statusSelect.locator('option').allTextContents()).map(s => s.trim());
      expect(statuses).toEqual(expect.arrayContaining(TASK.STATUS_LABELS));
    });
  });

  // ---------------- MF-2 / MF-3: Edit and Save shared attributes ----------------
  test.describe('MF-2 / MF-3 Edit and Save Task', () => {
    test('TC-05 edit title and save', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'edit-title');
      const newTitle = uniqueTitle('AUTO edit-title renamed');
      await taskEditPage.openTask(task.title);
      await taskEditPage.enterTitle(newTitle);
      await saveAndExpectSaved(taskEditPage);
      await expect(taskEditPage.drawer).toHaveCount(0);
      await expect(await taskEditPage.showTask(newTitle)).toBeVisible();

      await taskEditPage.reopenTask(newTitle);
      await expect(taskEditPage.titleTextBox).toHaveValue(newTitle);
    });

    test('TC-06 edit description and save', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'edit-desc');
      const newDescription = `Updated description ${Date.now()}`;
      await taskEditPage.openTask(task.title);
      await taskEditPage.enterDescription(newDescription);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      await expect(taskEditPage.descriptionTextBox).toHaveValue(newDescription);
    });

    test('TC-07 edit due date and save', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'edit-due');
      const newDueDate = dateOffset(DUE_DAYS + 4);
      await taskEditPage.openTask(task.title);
      await taskEditPage.enterDueDate(newDueDate);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      expect((await taskEditPage.getSavedRowValues(task.title)).dueDate).toBe(formatListDate(newDueDate));
      await taskEditPage.openTask(task.title);
      await expect(taskEditPage.dueDateInput).toHaveValue(newDueDate);
    });

    test('TC-08 edit title, description and due date together', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'edit-all');
      const next = {
        title: uniqueTitle('AUTO edit-all renamed'),
        description: `All-fields update ${Date.now()}`,
        dueDate: dateOffset(DUE_DAYS + 7),
      };
      await taskEditPage.openTask(task.title);
      await taskEditPage.enterTitle(next.title);
      await taskEditPage.enterDescription(next.description);
      await taskEditPage.enterDueDate(next.dueDate);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(next.title);
      await expect(taskEditPage.titleTextBox).toHaveValue(next.title);
      await expect(taskEditPage.descriptionTextBox).toHaveValue(next.description);
      await expect(taskEditPage.dueDateInput).toHaveValue(next.dueDate);
    });

    test('TC-09 saving without changes keeps the task as it was', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'edit-nochange');
      await taskEditPage.openTask(task.title);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      await expect(taskEditPage.titleTextBox).toHaveValue(task.title);
      await expect(taskEditPage.descriptionTextBox).toHaveValue(task.description);
      await expect(taskEditPage.dueDateInput).toHaveValue(task.dueDate);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(task.reminder.date, task.reminder.time));
    });

    test('TC-10 title is required when editing', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'edit-title-required');
      await taskEditPage.openTask(task.title);
      await taskEditPage.enterTitle('');
      await taskEditPage.clickSave();

      await expect(taskEditPage.titleError).toContainText(TASK.TITLE_REQUIRED_MESSAGE);
      await expect(taskEditPage.drawer).toHaveCount(1);
    });

    test('TC-11 title is limited to 200 characters when editing', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'edit-title-max');
      await taskEditPage.openTask(task.title);
      await taskEditPage.enterTitle('');
      await taskEditPage.typeTitle('A'.repeat(TASK.TITLE_MAX_LENGTH + 20));
      await expect(taskEditPage.titleTextBox).toHaveValue('A'.repeat(TASK.TITLE_MAX_LENGTH));
    });

    test('TC-12 closing the drawer without saving discards the changes', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'edit-discard');
      await taskEditPage.openTask(task.title);
      await taskEditPage.enterTitle(uniqueTitle('AUTO not saved'));
      await taskEditPage.enterDescription('should not be saved');
      await taskEditPage.closeDrawer();

      await taskEditPage.reopenTask(task.title);
      await expect(taskEditPage.titleTextBox).toHaveValue(task.title);
      await expect(taskEditPage.descriptionTextBox).toHaveValue(task.description);
    });
  });

  // ---------------- BR-2: Related record immutability ----------------
  test.describe('BR-2 Related record', () => {
    test('TC-13 related record is a link to the Project and cannot be changed', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'related');
      await taskEditPage.openTask(task.title);

      await expect(taskEditPage.relatedRecordLink).toBeVisible();
      expect(await taskEditPage.getRelatedRecordHref()).toBe(`/Project/Edit/${TASK.PROJECT_ID}`);
      // no editable control for the related record -- only hidden carriers of EntityIDF / EntityRecordID
      await expect(taskEditPage.relatedRecordInputs).toHaveCount(2);
      for (const input of await taskEditPage.relatedRecordInputs.all()) {
        await expect(input).toHaveAttribute('type', 'hidden');
      }
    });

    test('TC-14 related record is unchanged after editing and saving', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'related-kept');
      await taskEditPage.openTask(task.title);
      const before = await taskEditPage.getRelatedRecordHref();
      await taskEditPage.enterDescription('edited, related record must stay');
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getRelatedRecordHref()).toBe(before);
    });
  });

  // ---------------- MF-4 / MF-5: Complete and Reopen ----------------
  test.describe('MF-4 / MF-5 Complete and Reopen', () => {
    test('TC-15 mark an active task complete', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'complete');
      await taskEditPage.openTask(task.title);
      expect(await taskEditPage.getSelectedStatusLabel()).toBe(TASK.NOT_DONE_STATUS_LABEL);
      await taskEditPage.selectStatusByLabel(TASK.DONE_STATUS_LABEL);
      await saveAndExpectSaved(taskEditPage);

      expect((await taskEditPage.getSavedRowValues(task.title)).status).toBe(TASK.DONE_STATUS_LABEL);
      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getSelectedStatusLabel()).toBe(TASK.DONE_STATUS_LABEL);
    });

    test('TC-16 reopen a completed task', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reopen');
      await taskEditPage.openTask(task.title);
      await taskEditPage.selectStatusByLabel(TASK.DONE_STATUS_LABEL);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getSelectedStatusLabel()).toBe(TASK.DONE_STATUS_LABEL);
      await taskEditPage.selectStatusByLabel(TASK.NOT_DONE_STATUS_LABEL);
      await saveAndExpectSaved(taskEditPage);

      expect((await taskEditPage.getSavedRowValues(task.title)).status).toBe(TASK.NOT_DONE_STATUS_LABEL);
      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getSelectedStatusLabel()).toBe(TASK.NOT_DONE_STATUS_LABEL);
    });

    test('TC-17 completing a task keeps its other details', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'complete-keeps');
      await taskEditPage.openTask(task.title);
      await taskEditPage.selectStatusByLabel(TASK.DONE_STATUS_LABEL);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      await expect(taskEditPage.titleTextBox).toHaveValue(task.title);
      await expect(taskEditPage.descriptionTextBox).toHaveValue(task.description);
      await expect(taskEditPage.dueDateInput).toHaveValue(task.dueDate);
    });
  });

  // ---------------- BR-3 / BR-4 / BR-5: Reminder (Owner) ----------------
  test.describe('Reminder -- edited by the Owner', () => {
    test('TC-18 owner can set a reminder on a task that has none', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reminder-set', { reminder: null });
      await taskEditPage.openTask(task.title);
      await expect(taskEditPage.reminderTrigger).not.toHaveAttribute('aria-disabled', 'true');
      const reminder = { date: dateOffset(3), time: '09:30' };
      await taskEditPage.setReminder(reminder.date, reminder.time);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(reminder.date, reminder.time));
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(reminder.date, reminder.time));
    });

    test('TC-19 owner can change an existing reminder', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reminder-change');
      const reminder = { date: dateOffset(4), time: '14:00' };
      await taskEditPage.openTask(task.title);
      await taskEditPage.setReminder(reminder.date, reminder.time);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(reminder.date, reminder.time));
    });

    test('TC-20 owner can clear a reminder (BR-4)', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reminder-clear');
      await taskEditPage.openTask(task.title);
      await taskEditPage.removeReminder();
      expect(await taskEditPage.getReminderText()).toBe(TASK.REMINDER_PLACEHOLDER);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getReminderText()).toBe(TASK.REMINDER_PLACEHOLDER);
    });

    test('TC-21 past reminder is rejected with the future-date message (BR-3 / AF-2)', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reminder-past');
      await taskEditPage.openTask(task.title);
      await taskEditPage.setReminder(TASK.PAST_DATE, TASK.REMINDER_TIME);

      await expect(taskEditPage.reminderError).toContainText(TASK.REMINDER_FUTURE_MESSAGE);
      await expect(taskEditPage.reminderPopup).toHaveClass(/is-open/);
      await taskEditPage.cancelReminder();
      // the reminder on the task is untouched
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(task.reminder.date, task.reminder.time));
    });

    test('TC-22 cancelling the reminder popup keeps the existing reminder', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reminder-cancel');
      await taskEditPage.openTask(task.title);
      await taskEditPage.openReminderPopup();
      await taskEditPage.enterReminder(dateOffset(5), '16:00');
      await taskEditPage.cancelReminder();
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(task.reminder.date, task.reminder.time));
    });

    test('TC-23 reminder can be set after the due date', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reminder-vs-due');
      const reminder = { date: dateOffset(DUE_DAYS + 3), time: TASK.REMINDER_TIME };
      await taskEditPage.openTask(task.title);
      await taskEditPage.setReminder(reminder.date, reminder.time);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(reminder.date, reminder.time));
      await expect(taskEditPage.dueDateInput).toHaveValue(task.dueDate);
    });
  });

  // ---------------- BR-1 / BR-5 / BR-6: Owner reassignment ----------------
  test.describe('Owner reassignment', () => {
    test('TC-24 reassign the task to another person', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reassign');
      await reassignToOther(taskEditPage, task.title);

      expect((await taskEditPage.getSavedRowValues(task.title)).owner).toBe(TASK.OTHER_OWNER_LABEL);
      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getSelectedOwnerLabel()).toBe(TASK.OTHER_OWNER_LABEL);
    });

    test('TC-25 reassigning keeps the existing reminder (BR-6)', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reassign-keeps-reminder');
      await reassignToOther(taskEditPage, task.title);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(task.reminder.date, task.reminder.time));
    });

    test('TC-26 reassigning and changing the reminder in one edit: ownership is the recorded Owner (BR-5)', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reassign-same-edit');
      const reminder = { date: dateOffset(5), time: '11:00' };
      await taskEditPage.openTask(task.title);
      await taskEditPage.selectOwnerByLabel(TASK.OTHER_OWNER_LABEL);
      // still the Owner of record until saved, so the reminder stays editable
      await expect(taskEditPage.reminderTrigger).not.toHaveAttribute('aria-disabled', 'true');
      await taskEditPage.setReminder(reminder.date, reminder.time);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.getSelectedOwnerLabel()).toBe(TASK.OTHER_OWNER_LABEL);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(reminder.date, reminder.time));
    });

    test('TC-27 owner can be changed back to me', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'reassign-back');
      await reassignToOther(taskEditPage, task.title);

      await taskEditPage.openTask(task.title);
      await taskEditPage.selectOwnerByLabel(TASK.DEFAULT_OWNER_LABEL);
      await saveAndExpectSaved(taskEditPage);

      expect((await taskEditPage.getSavedRowValues(task.title)).owner).toBe(TASK.DEFAULT_OWNER_LABEL);
    });
  });

  // ---------------- BR-5: Reminder is read-only for a user who is not the Owner ----------------
  test.describe('Reminder -- user who is not the Owner', () => {
    test('TC-28 reminder is read-only and still displays its value', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'not-owner-readonly');
      await reassignToOther(taskEditPage, task.title);

      await taskEditPage.reopenTask(task.title);
      expect(await taskEditPage.isReminderReadOnly()).toBe(true);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(task.reminder.date, task.reminder.time));
    });

    test('TC-29 non-owner cannot open the reminder popup', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'not-owner-popup');
      await reassignToOther(taskEditPage, task.title);

      await taskEditPage.reopenTask(task.title);
      await taskEditPage.reminderTrigger.click({ force: true });
      await expect(taskEditPage.openReminderPopupPanel).toHaveCount(0);
    });

    test('TC-30 non-owner can edit the shared attributes and the reminder is unchanged', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'not-owner-edit');
      await reassignToOther(taskEditPage, task.title);

      const next = { title: uniqueTitle('AUTO not-owner renamed'), description: `Edited by non-owner ${Date.now()}`, dueDate: dateOffset(DUE_DAYS + 5) };
      await taskEditPage.reopenTask(task.title);
      await taskEditPage.enterTitle(next.title);
      await taskEditPage.enterDescription(next.description);
      await taskEditPage.enterDueDate(next.dueDate);
      await saveAndExpectSaved(taskEditPage);

      await taskEditPage.reopenTask(next.title);
      await expect(taskEditPage.titleTextBox).toHaveValue(next.title);
      await expect(taskEditPage.descriptionTextBox).toHaveValue(next.description);
      await expect(taskEditPage.dueDateInput).toHaveValue(next.dueDate);
      expect(await taskEditPage.getReminderText()).toBe(formatReminderDisplay(task.reminder.date, task.reminder.time));
    });

    test('TC-31 non-owner can complete and reopen the task', async ({ taskEditPage }) => {
      const task = await seedTask(taskEditPage, 'not-owner-complete');
      await reassignToOther(taskEditPage, task.title);

      await taskEditPage.reopenTask(task.title);
      await taskEditPage.selectStatusByLabel(TASK.DONE_STATUS_LABEL);
      await saveAndExpectSaved(taskEditPage);
      expect((await taskEditPage.getSavedRowValues(task.title)).status).toBe(TASK.DONE_STATUS_LABEL);

      await taskEditPage.reopenTask(task.title);
      await taskEditPage.selectStatusByLabel(TASK.NOT_DONE_STATUS_LABEL);
      await saveAndExpectSaved(taskEditPage);
      expect((await taskEditPage.getSavedRowValues(task.title)).status).toBe(TASK.NOT_DONE_STATUS_LABEL);
    });
  });
});
