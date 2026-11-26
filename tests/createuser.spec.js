const { test, expect } = require('../fixtures/fixtures');
const { env } = require('../utils/testData');
const { MODULE, TEXT, ROLES, createUserCases: c } = require('../testData/createUserData');
const { tcDetails, tcTitle, applyAllureLabels, recordTestValues, recordCreated, recordUrl } = require('../utils/testCase');

/**
 * Use case 62284 - Grant Access (Create User).
 *
 * Flow in the sandbox: Person detail page -> Actions -> Grant Access -> "Sign In Email" (pre-filled from the Person)
 * + "Select Roles" checkboxes -> Create User -> user created (activation email sent) -> the Person's Actions menu
 * offers Manage Access instead of Grant Access.
 * If a Confirmation (Confirm / Back, MF-2) or an admin re-authentication follows Create User, it is answered and noted
 * in the report ("Observed"); neither is required. Two-step (TOTP) authentication cases are not covered.
 *
 * Test data: every test creates its own Person named "<First> Playwright <Last>" (keyword from TEST_KEYWORD) with
 * example.com e-mails. NO CLEANUP: the Persons and the five users created by TC_CU_001-005 stay in the sandbox and are
 * listed in reports/excel/create-user/Atlas_CreateUser_<date>.xlsx.
 *
 * Not automated (need the new user's inbox / authenticator or database access): MF-5 to MF-8 (activation link,
 * password setup 62318, TOTP provider selection and enrollment), A-3 / A-4 expired / invalid activation token,
 * A-7 wrong enrollment code, handle generation 62590 and a second admin without User:Create.
 */

const admin = { password: env.userPassword, totpSecret: env.adminTotpSecret };
const fixedRoles = (process.env.CREATE_USER_ROLES || '').split(',').map(s => s.trim()).filter(Boolean);
const rolesFor = roles => (fixedRoles.length ? fixedRoles : roles);
const fullName = p => [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
const exact = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

test.describe('User - Grant Access / Create User (62284)', () => {
  // one worker, in file order (the users and Persons are created one after the other)
  test.describe.configure({ mode: 'default', timeout: 240_000 });

  async function snap(page, testInfo, name) {
    await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }

  /** Creates the test's Person and opens Grant Access from its Actions menu (MF-1). */
  async function createPersonAndStart({ personPage, createUserPage }, testInfo, tc) {
    const person = await test.step(`Create the Person "${fullName(tc.person)}"`, async () => {
      const record = await personPage.createPerson(tc.person);
      return { ...record, name: fullName(tc.person) };
    });
    await recordUrl(testInfo, person.url, `Person #${person.id} - ${person.name}`);
    await test.step('Person -> Actions -> Grant Access', () => createUserPage.startGrantAccess(person.id));
    return person;
  }

  /**
   * Create User, then answers the optional steps that follow (re-authentication, Confirmation) until the outcome.
   * Returns the final state ('success' | 'left-form' | 'error') and notes the screens seen in the report.
   */
  async function submitCreateUser(createUserPage, testInfo, email, roles) {
    await createUserPage.submit();
    const seen = [];
    let state = '';
    for (let step = 0; step < 4; step++) {
      state = await createUserPage.nextState();
      seen.push(state);
      if (state === 'reauth') {
        test.skip(!admin.totpSecret && await createUserPage.reauthCode.isVisible(),
          'Re-authentication asks for a TOTP code (two-step authentication is not covered): set ADMIN_TOTP_SECRET in .env to run it');
        await createUserPage.reauthenticate(admin);
      } else if (state === 'confirmation') {
        const text = await createUserPage.panelText();
        if (email) expect(text.toLowerCase(), 'Confirmation shows the sign-in email').toContain(email.toLowerCase());
        for (const role of roles) expect(text, `Confirmation shows the role "${role}"`).toContain(role);
        if (email) expect(await createUserPage.editableInputsWithValue(email), 'Sign-in email is read-only on Confirmation').toBe(0);
        await testInfo.attach('confirm-details', { body: await createUserPage.page.screenshot(), contentType: 'image/png' });
        await createUserPage.confirmDetails();
        state = await createUserPage.outcomeAfterConfirm();
        seen.push(state);
        break;
      } else {
        break;
      }
    }
    testInfo.annotations.push({ type: 'Observed', description: `After Create User: ${seen.join(' -> ')}` });
    return state;
  }

  /** Nothing was created: the Person's Actions menu still offers Grant Access. */
  async function expectNoUserCreated(createUserPage, person) {
    await test.step('No user created: the Person still offers Grant Access', async () => {
      const actions = await createUserPage.accessActions(person.id);
      expect(actions.grant, 'Grant Access still offered').toBe(true);
      expect(actions.manage, 'Manage Access not offered').toBe(false);
    });
  }

  /**
   * A validation stops Create User. Passes on the use case's message, another matching on-page message or the
   * browser's own e-mail validation; the text that was shown goes to the report ("Observed").
   */
  async function expectRejected(createUserPage, testInfo, specText, fallback) {
    const spec = createUserPage.validationMessage(specText);
    const matching = createUserPage.errorMessage.filter({ hasText: fallback });
    await expect.poll(async () => (await spec.isVisible()) || (await matching.isVisible())
      || fallback.test(createUserPage.lastDialog) || !!(await createUserPage.nativeEmailValidity()),
    { message: `Validation shown ("${specText}")`, timeout: 60_000 }).toBe(true);
    const shown = (await spec.isVisible()) ? specText
      : (await matching.isVisible()) ? (await matching.innerText()).trim()
        : fallback.test(createUserPage.lastDialog) ? `Alert: ${createUserPage.lastDialog}`
          : `Browser validation: ${await createUserPage.nativeEmailValidity()}`;
    testInfo.annotations.push({ type: 'Observed', description: `Shown: "${shown}"${shown === specText ? '' : ` (use case text: "${specText}")`}` });
    await expect(createUserPage.successMessage, 'No success message').toHaveCount(0);
  }

  // ------------------------------------------------------------------ TC_CU_001 - 005: five users created
  for (const tc of c.created) {
    test(tcTitle(tc), tcDetails(tc, MODULE), async ({ personPage, createUserPage, page }, testInfo) => {
      await applyAllureLabels(tc, MODULE);
      const person = await createPersonAndStart({ personPage, createUserPage }, testInfo, tc);

      const email = tc.signInEmail || tc.person.email;
      await test.step(`Sign In Email: ${tc.emailSource} (MF-1)`, async () => {
        if (tc.emailSource === 'entered') await expect(createUserPage.signInEmail, 'Empty: the Person has no email').toHaveValue('');
        else await expect(createUserPage.signInEmail, 'Pre-filled with the Person primary email').toHaveValue(exact(tc.person.email));
        if (tc.signInEmail) await createUserPage.fillSignInEmail(tc.signInEmail);
        await expect(createUserPage.signInEmail).toHaveValue(exact(email));
      });

      const first = rolesFor(tc.roles);
      const roles = tc.changedRoles && !fixedRoles.length ? tc.changedRoles : first;
      await test.step(`Select Roles: ${roles.join(', ')}`, async () => {
        await createUserPage.setRoles(first);
        if (roles !== first) {
          expect((await createUserPage.checkedRoles()).sort(), 'First selection ticked').toEqual([...first].sort());
          await createUserPage.setRoles(roles);
        }
        expect((await createUserPage.checkedRoles()).sort(), 'Only the chosen roles are ticked').toEqual([...roles].sort());
      });

      const data = {
        personName: person.name, personEmail: tc.person.email || '(none)', emailSource: tc.emailSource,
        signInEmail: email, userRoles: roles, ...(roles !== first ? { changedRoles: `${first.join(', ')} -> ${roles.join(', ')}` } : {}),
      };
      await recordTestValues(testInfo, data);
      await snap(page, testInfo, 'grant-access-form');

      await test.step('Create User -> user created, activation email sent (MF-4)', async () => {
        const state = await submitCreateUser(createUserPage, testInfo, email, roles);
        expect(state, `User created without an error${state === 'error' ? `: "${await createUserPage.errorText()}"` : ''}`).not.toBe('error');
      });
      await recordCreated(testInfo, MODULE, tc, data, { id: person.id, url: person.url });
      await snap(page, testInfo, 'user-created');

      await test.step('The Person now offers Manage Access instead of Grant Access', async () => {
        const actions = await createUserPage.waitForManageAccess(person.id);
        expect(actions.grant, 'Grant Access no longer offered').toBe(false);
      });
    });
  }

  // ------------------------------------------------------------------ TC_CU_006: invalid email format (A-1)
  test(tcTitle(c.invalidEmail), tcDetails(c.invalidEmail, MODULE), async ({ personPage, createUserPage, page }, testInfo) => {
    const tc = c.invalidEmail;
    await applyAllureLabels(tc, MODULE);
    const person = await createPersonAndStart({ personPage, createUserPage }, testInfo, tc);
    const roles = rolesFor(tc.roles);
    await createUserPage.fillSignInEmail(tc.signInEmail);
    await createUserPage.setRoles(roles);
    await recordTestValues(testInfo, { personName: person.name, signInEmail: tc.signInEmail, userRoles: roles });

    await test.step('Create User with an invalid sign-in email', () => createUserPage.submit());
    await expectRejected(createUserPage, testInfo, TEXT.invalidEmail, /valid|e-?mail|format/i);
    await snap(page, testInfo, 'invalid-email');
    await expectNoUserCreated(createUserPage, person);
  });

  // ------------------------------------------------------------------ TC_CU_007: no role (A-2)
  test(tcTitle(c.noRoles), tcDetails(c.noRoles, MODULE), async ({ personPage, createUserPage, page }, testInfo) => {
    const tc = c.noRoles;
    await applyAllureLabels(tc, MODULE);
    const person = await createPersonAndStart({ personPage, createUserPage }, testInfo, tc);
    await createUserPage.fillSignInEmail(tc.signInEmail);
    await createUserPage.clearRoles();
    await recordTestValues(testInfo, { personName: person.name, signInEmail: tc.signInEmail, userRoles: '(none ticked)' });

    await test.step('Create User without a role', () => createUserPage.submit());
    await expectRejected(createUserPage, testInfo, TEXT.noRoles, /role/i);
    await snap(page, testInfo, 'no-roles');
    await expectNoUserCreated(createUserPage, person);
  });

  // ------------------------------------------------------------------ TC_CU_008: duplicate sign-in email (A-9)
  test(tcTitle(c.duplicateEmail), tcDetails(c.duplicateEmail, MODULE), async ({ personPage, createUserPage, page }, testInfo) => {
    const tc = c.duplicateEmail;
    await applyAllureLabels(tc, MODULE);
    const person = await createPersonAndStart({ personPage, createUserPage }, testInfo, tc);
    const roles = rolesFor(tc.roles);
    await createUserPage.fillSignInEmail(tc.signInEmail);
    await createUserPage.setRoles(roles);
    await recordTestValues(testInfo, { personName: person.name, signInEmail: `${tc.signInEmail} (existing user)`, userRoles: roles });

    await test.step('Create User with an e-mail already in use', () => submitCreateUser(createUserPage, testInfo, tc.signInEmail, roles));
    await expectRejected(createUserPage, testInfo, TEXT.duplicateEmail, /already (in use|exists|taken|registered)|duplicate/i);
    await snap(page, testInfo, 'duplicate-email');
    await expectNoUserCreated(createUserPage, person);
  });

  // ------------------------------------------------------------------ TC_CU_009: the form (nothing submitted)
  test(tcTitle(c.form), tcDetails(c.form, MODULE), async ({ personPage, createUserPage, page }, testInfo) => {
    const tc = c.form;
    await applyAllureLabels(tc, MODULE);
    const person = await createPersonAndStart({ personPage, createUserPage }, testInfo, tc);
    await recordTestValues(testInfo, { personName: person.name, personEmail: tc.person.email, action: 'Form opened, not submitted' });

    await test.step('Grant Access form content (MF-1)', async () => {
      await expect(createUserPage.heading, `Heading "${TEXT.heading}"`).toBeVisible();
      await expect(createUserPage.signInEmail, 'Pre-filled with the Person primary email').toHaveValue(exact(tc.person.email));
      await expect(createUserPage.signInEmail).toBeEditable();
      expect(await createUserPage.availableRoles(), 'Roles offered').toEqual(expect.arrayContaining(ROLES));
      expect(await createUserPage.checkedRoles(), 'No role ticked by default').toEqual([]);
      await expect(createUserPage.createUserButton).toBeEnabled();
    });
    await snap(page, testInfo, 'grant-access-form');
    await expectNoUserCreated(createUserPage, person);
  });
});
