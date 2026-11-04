const { env } = require('../utils/testData');

/**
 * Use case 63196 - Create Bundle (/Setting/BundleList -> "Create Bundle" panel). Names carry keyword + run tag so
 * every run is unique. Data keys: bundleName, description, subscription (true = Subscription bundle).
 */
const kw = env.keyword;
const tag = env.runTag;

const MODULE = 'Bundle';

const MESSAGES = {
  nameRequired: 'Enter a name for this bundle.',
  duplicateTitle: 'Bundle name already in use',
  duplicate: 'A bundle with this name already exists.',
};

const name = label => `${kw} ${label} Bundle ${tag}`;

const tc = (n, severity, title, description, condition, expected, extra = {}) => ({
  id: `TC_BND_${String(n).padStart(3, '0')}`, severity, name: title, description, condition, expected, ...extra,
});
const CREATE = 'User has PERM.BILL.Bundle.Create.';
const SAVED = 'Bundle is saved and View & Edit Bundle opens showing the entered values.';
const NEG = { type: 'Negative' };

const bundleCases = {
  // --- MF-1 initiate ---
  fromSettings: tc(1, 'normal', 'Bundles opens from Settings', 'Verify Settings -> Bundles opens the Bundles list with a Create Bundle button (MF-1).', CREATE, '/Setting/BundleList opens and shows "Create Bundle".'),
  openCreate: tc(2, 'critical', 'Create Bundle opens the Create Bundle panel', 'Verify "Create Bundle" on the Bundles list opens the Create Bundle panel (MF-1).', CREATE, 'The panel opens with the Name field and a Save button.'),
  fields: tc(3, 'normal', 'Panel shows Name, Description and Subscription bundle', 'Verify the Create Bundle panel shows Bundle.Name, Bundle.Description and the Subscription bundle switch (MF-1).', CREATE, 'All three fields are displayed.'),
  subscriptionDefault: tc(4, 'normal', 'Subscription bundle is off by default', 'Verify the Subscription bundle switch is presented as false when the panel opens (MF-1).', CREATE, 'The switch is off.'),
  nameRequiredMarker: tc(5, 'normal', 'Name is required, Description is optional', 'Verify Name is marked required and Description is not (MF-1).', CREATE, 'Name required; Description optional.'),
  noVersionInput: tc(6, 'normal', 'Version Number cannot be entered', 'Verify the panel has no Version Number input; the first version is numbered by the system (BR-2).', CREATE, 'No version input in the panel.'),

  // --- MF-2 save ---
  oneTime: tc(7, 'critical', 'Create a one-time bundle', 'Verify a bundle with name and description and Subscription bundle off saves (MF-2).', CREATE, SAVED,
    { data: { bundleName: name('OneTime'), description: 'One-time bundle created by Playwright automation.', subscription: false } }),
  subscriptionBundle: tc(8, 'critical', 'Create a subscription bundle', 'Verify a bundle with Subscription bundle on saves (MF-2).', CREATE, SAVED,
    { data: { bundleName: name('Subscription'), description: 'Subscription bundle created by Playwright automation.', subscription: true } }),
  nameOnly: tc(9, 'normal', 'Create a bundle with only a name', 'Verify a bundle saves with just the required Name (MF-2).', CREATE, SAVED,
    { data: { bundleName: name('NameOnly') } }),
  specialChars: tc(10, 'normal', 'Create a bundle with special characters in the name', 'Verify a name with special characters saves unchanged (MF-2).', CREATE, SAVED,
    { data: { bundleName: `${kw} Bundle & Co. (#${tag}) - "Plus" 50%`, description: 'Special characters: & < > \' " % #' } }),
  longDescription: tc(11, 'normal', 'Create a bundle with a 250-character description', 'Verify a description at the 250-character limit saves (MF-2).', CREATE, SAVED,
    { data: { bundleName: name('LongDesc'), description: 'D'.repeat(250) } }),
  subscriptionUntouched: tc(12, 'normal', 'Subscription bundle left untouched saves as off', 'Verify that not touching the switch saves the first version as non-subscription (MF-2).', CREATE, SAVED,
    { data: { bundleName: name('NoSwitch'), description: 'Switch left untouched.' } }),
  versionOne: tc(13, 'critical', 'First version is number 1', 'Verify the first version of a new bundle is v1 (BR-2).', CREATE, 'The Bundles list shows "(v1)".',
    { data: { bundleName: name('VersionOne'), description: 'Checks version number.' } }),
  draftState: tc(14, 'critical', 'First version is in the Draft state', 'Verify the first version of a new bundle is Draft (BR-1).', CREATE, 'The Bundles list shows "Draft".',
    { data: { bundleName: name('DraftState'), description: 'Checks Draft state.' } }),
  createdBy: tc(15, 'normal', 'Creating user is recorded', 'Verify the signed-in user is shown as the creator of the version (MF-2).', CREATE, 'The user name appears on View & Edit Bundle.',
    { data: { bundleName: name('CreatedBy'), description: 'Checks the creator.' } }),
  listed: tc(16, 'critical', 'New bundle appears on the Bundles list', 'Verify the saved bundle is listed and links to /Bundle/Edit/{id} (MF-2).', CREATE, 'A row with the bundle name links to its edit page.',
    { data: { bundleName: name('Listed'), description: 'Checks the list.' } }),
  similarNames: tc(17, 'normal', 'Similar names are allowed', 'Verify two bundles whose names differ slightly can both be created.', CREATE, 'Both bundles are saved.',
    { data: { bundleName: name('Similar'), description: 'First of two similar names.' }, second: { bundleName: `${name('Similar')} 2`, description: 'Second of two similar names.' } }),
  editsContents: tc(18, 'normal', 'View & Edit Bundle opens after save', 'Verify after Save the user lands on View & Edit Bundle (63197) where contents can be added (MF-2).', CREATE, 'The edit page opens with a contents section.',
    { data: { bundleName: name('Contents'), description: 'Checks the redirect.' } }),

  // --- negative ---
  emptyName: tc(19, 'critical', 'Save with an empty name is rejected', 'Verify Save with an empty Name shows "Enter a name for this bundle." and does not save.', CREATE, `"${MESSAGES.nameRequired}" under Name; the panel stays open.`,
    { ...NEG, data: { bundleName: '', description: 'Empty name.' } }),
  blankName: tc(20, 'normal', 'Save with a spaces-only name is rejected', 'Verify a Name of only spaces is rejected like an empty name.', CREATE, `"${MESSAGES.nameRequired}" under Name; the panel stays open.`,
    { ...NEG, data: { bundleName: '   ', description: 'Blank name.' } }),
  duplicate: tc(21, 'critical', 'Duplicate bundle name is rejected', 'Verify a second bundle with an existing name shows "Bundle name already in use" and is not saved.', CREATE, 'A modal explains the name is in use; Ok closes it.',
    { ...NEG, data: { bundleName: name('Duplicate'), description: 'Original bundle.' }, second: { description: 'Duplicate attempt.', subscription: false } }),
  duplicateRecover: tc(22, 'normal', 'Duplicate name can be corrected and saved', 'Verify after the duplicate message the entered values are kept and a different name saves.', CREATE, 'Description kept; bundle saves with the new name.',
    { ...NEG, data: { bundleName: name('DupRecover'), description: 'Original bundle.' }, second: { bundleName: name('DupRecoverFixed'), description: 'Corrected after duplicate.' } }),
  cancel: tc(23, 'normal', 'Closing the panel discards the bundle', 'Verify closing the panel with X without saving creates no bundle.', CREATE, 'The list is shown and the bundle is not listed.',
    { ...NEG, data: { bundleName: name('Cancelled'), description: 'Should not be saved.' } }),
  nameMax: tc(24, 'normal', 'Name is limited to its maximum length', 'Verify the Name field stops accepting characters at its maxlength (200).', CREATE, 'Extra characters are not accepted.',
    { ...NEG, data: { bundleName: name('MaxLen') } }),
  archivedReuse: tc(25, 'minor', 'Name of an archived bundle can be reused', 'Verify a bundle name can be reused after the bundle is archived.', CREATE, 'The second bundle saves (skipped when the app offers no Archive).',
    { data: { bundleName: name('Archived'), description: 'To be archived.' }, second: { description: 'Reuses the archived name.', subscription: false } }),
};

module.exports = { MODULE, MESSAGES, bundleCases };
