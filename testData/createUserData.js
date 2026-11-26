const { env } = require('../utils/testData');

/**
 * Use case 62284 - Grant Access (Create User).
 *
 * The sandbox screen (Person -> Actions -> Grant Access): "Grant Access - Invite someone new to your team and choose
 * what they can do.", a "Sign In Email" field pre-filled from the Person, a "Select Roles" group of checkboxes and a
 * "Create User" button. The tests also accept a Confirmation / re-authentication step if one follows Create User
 * (the use case describes them), but do not require it. Two-step (TOTP) authentication cases are not covered.
 *
 * Every test first creates its own Person (keyword "Playwright" as the middle name, so the records are easy to find
 * in the sandbox), then grants that Person access. Nothing is deleted afterwards: the Persons and the five users stay
 * in the sandbox and are listed in the dated Create User workbook.
 * Sign-in e-mails are short addresses on test123.com, so no real inbox receives an activation link.
 */
const MODULE = 'Create User';

const TEXT = {
  heading: 'Grant Access',
  invalidEmail: 'This is not a valid email.',                 // VAL-001 (A-1)
  noRoles: 'Please select at least one role.',                // VAL-002 (A-2)
  duplicateEmail: 'This sign-in email is already in use.',    // A-9
};

/** Roles the sandbox's Grant Access screen offers (Select Roles). */
const ROLES = ['Admin', 'Billing', 'Billing Admin', 'Client', 'Staff', 'Super Admin', 'User'];

const kw = env.keyword;                       // "Playwright" (TEST_KEYWORD in .env)
const digits = env.runTag.replace(/\D/g, '').slice(2); // unique per run and short: DDHHmmss, e.g. "24153012"
const lc = s => s.toLowerCase();
const handle = first => `${lc(kw)}_${lc(first)}_${digits}`;
// short addresses on test123.com, e.g. "playwright.ethan.24153012@test123.com"
const personEmail = first => lc(`${kw}.${first}.${digits}@test123.com`);
const signInEmail = first => lc(`${kw}.qa.${first}.${digits}@test123.com`);

/** A Person record for a test: "<First> Playwright <Last>". `withEmail: false` = no primary e-mail. */
const person = (firstName, lastName, withEmail = true) => ({
  firstName, middleName: kw, lastName, handle: handle(firstName),
  ...(withEmail ? { email: personEmail(firstName) } : {}),
});

/** `roles` are checkbox labels of "Select Roles". CREATE_USER_ROLES in .env (comma-separated) overrides them for every test. */
const createUserCases = {
  // ---------------------------------------------------------------- 5 users created in the sandbox
  created: [
    {
      id: 'TC_CU_001', severity: 'critical',
      name: 'Grant access with the sign-in email pre-filled from the Person',
      description: 'Verify Grant Access pre-fills the Sign In Email with the Person\'s primary email and Create User creates the user with one role (MF-1, MF-4).',
      condition: 'Admin has User:Create; Person has a primary email; admin keeps the pre-filled sign-in email.',
      expected: 'Sign In Email is pre-filled with the Person email; Create User creates the user (activation email sent) and the Person then offers Manage Access.',
      person: person('Ethan', 'Brooks'),
      emailSource: 'prefilled',
      roles: ['Staff', 'User'],
    },
    {
      id: 'TC_CU_002', severity: 'critical',
      name: 'Grant access to a Person without an email (admin enters the sign-in email)',
      description: 'Verify that when the Person has no primary email the Sign In Email field is empty and the admin can enter one (QA matrix row 2).',
      condition: 'Admin has User:Create; Person has NO primary email.',
      expected: 'Sign In Email is empty; with the entered address Create User creates the user and the Person then offers Manage Access.',
      person: person('Mia', 'Robinson', false),
      emailSource: 'entered',
      signInEmail: signInEmail('Mia'),
      roles: ['Client', 'User'],
    },
    {
      id: 'TC_CU_003', severity: 'critical',
      name: 'Grant access with multiple roles',
      description: 'Verify more than one role can be selected and the user is created with all of them (MF-1 "one or more roles", MF-4).',
      condition: 'Admin has User:Create; three roles are ticked.',
      expected: 'All three roles stay ticked; Create User creates the user and the Person then offers Manage Access.',
      person: person('Lucas', 'Bennett'),
      emailSource: 'prefilled',
      roles: ['Staff', 'Billing', 'User'],
    },
    {
      id: 'TC_CU_004', severity: 'normal',
      name: 'Grant access after editing the pre-filled sign-in email',
      description: 'Verify the admin can replace the pre-filled Person email with a different sign-in email, and the edited address is used (MF-1 "enter or edit").',
      condition: 'Admin has User:Create; Person has a primary email that the admin overwrites.',
      expected: 'The edited sign-in email is kept; Create User creates the user and the Person then offers Manage Access.',
      person: person('Chloe', 'Ramirez'),
      emailSource: 'edited',
      signInEmail: signInEmail('Chloe'),
      roles: ['Client', 'Staff'],
    },
    {
      id: 'TC_CU_005', severity: 'normal',
      name: 'Change the role selection before creating the user',
      description: 'Verify roles can be ticked and unticked before Create User and only the final selection is kept (MF-1 role assignment).',
      condition: 'Admin has User:Create; admin ticks "User" + "Billing", then changes them to "Staff" + "Client" + "User" before Create User.',
      expected: 'Only Staff, Client and User are ticked at Create User; the user is created and the Person then offers Manage Access.',
      person: person('Owen', 'Mitchell'),
      emailSource: 'prefilled',
      roles: ['User', 'Billing'],
      changedRoles: ['Staff', 'Client', 'User'],
    },
  ],

  // ---------------------------------------------------------------- validations / form check (no user is created)
  invalidEmail: {
    id: 'TC_CU_006', type: 'Negative', severity: 'critical',
    name: 'Invalid sign-in email format is rejected',
    description: 'Verify an incorrectly formatted sign-in email is rejected at Create User with VAL-001 and no user is created (A-1).',
    condition: 'Grant Access open; sign-in email has no domain; two roles ticked.',
    expected: `"${TEXT.invalidEmail} Please try again." (VAL-001) or a validation message is shown; no user is created.`,
    person: person('Ivy', 'Foster'),
    signInEmail: lc(`${kw}.qa.${digits}@`),
    roles: ['Staff', 'User'],
  },
  noRoles: {
    id: 'TC_CU_007', type: 'Negative', severity: 'critical',
    name: 'Sign-in email without a role is rejected',
    description: 'Verify Create User with no role ticked shows VAL-002 and no user is created (A-2).',
    condition: 'Grant Access open; valid sign-in email; no role ticked.',
    expected: `"${TEXT.noRoles}" (VAL-002) or a validation message is shown; no user is created.`,
    person: person('Henry', 'Coleman'),
    signInEmail: signInEmail('Henry'),
  },
  duplicateEmail: {
    id: 'TC_CU_008', type: 'Negative', severity: 'critical',
    name: 'Sign-in email already in use is rejected',
    description: 'Verify a sign-in email that already belongs to a user (the signed-in admin\'s) is rejected with the duplicate message and no user is created (A-9).',
    condition: 'Grant Access open; sign-in email = an existing user\'s sign-in email; two roles ticked.',
    expected: `"${TEXT.duplicateEmail}" (or an "already in use" message) is shown; no user is created.`,
    person: person('Grace', 'Holland'),
    signInEmail: env.userEmail,
    roles: ['Staff', 'User'],
  },
  form: {
    id: 'TC_CU_009', severity: 'normal',
    name: 'Grant Access form shows the sign-in email, the roles and Create User',
    description: 'Verify Grant Access opens with the heading, the Sign In Email pre-filled from the Person, every role offered with none ticked, and Create User enabled. Nothing is submitted, so no user is created.',
    condition: 'Admin has User:Create; Person with a primary email and no user.',
    expected: `Heading "${TEXT.heading}"; Sign In Email = Person email; roles ${ROLES.join(', ')} offered and unticked; Create User enabled.`,
    person: person('Zoe', 'Hayes'),
  },
};

module.exports = { MODULE, TEXT, ROLES, createUserCases };
