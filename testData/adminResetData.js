/**
 * Use case 62294 - Admin Resets a User Account.
 * Texts are quoted from the use case; the page object locates the reset screens by them.
 * The target is the dedicated test user RESET_TARGET_PERSON_ID (see .env.example). Every test cancels
 * before attestation, except TC_ARU_015 / 016 which execute the reset and only run with RESET_ALLOW_EXECUTE=true.
 */
const MODULE = 'Admin Reset';

const TEXT = {
  confirmPrompt: 'Confirm that this is the correct email address for the user who requested the reset.',
  channelQuestion: 'How did you receive this reset request?',
  socialEngineeringWarning: 'Social-engineering attacks are the most common and successful form of hacking.',
  warningCheckbox: 'I understand that social-engineering attacks are a serious risk.',
  liveVerificationPrompt: 'Please verify the requester\'s identity through a real-time conversation',
  liveVerificationCheckbox: 'I have now verified the requester\'s identity in real time.',
  liveGuidance: 'You indicated that the request came through a live channel.',
  liveCheckbox: 'I have completed a live conversation and verified the requester\'s identity.',
  faceToFacePrompt: 'Face-to-face verification detected.',
  faceToFaceCheckbox: 'I met with the requester in person and verified their identity.',
  attestationCheckbox: 'I have verified the request using live verification and accept responsibility for executing this sensitive operation.',
  evidenceRequired: 'Verification details and the identity-confirmation question are required before proceeding.',
  canceled: 'Account reset canceled. No verification or system changes were performed.',
  completed: 'Account reset complete. The user will receive a welcome message so they can reestablish their credentials.',
};

const CHANNELS = ['Face-to-face', 'Phone call', 'Zoom / Video', 'Text / SMS', 'Email', 'Other'];

const evidence = {
  phone: { channelId: '+1 (202) 555-0164', question: 'Which city did you open your first Atlas account in?' },
  zoom: { channelId: '845 3021 7790', question: 'What was the name of your first project in Atlas?' },
};

const adminResetCases = {
  confirmEmail: {
    id: 'TC_ARU_001', severity: 'critical',
    name: 'Reset Account shows the target user\'s email for confirmation',
    description: 'Verify Reset Account first shows the target user\'s name and current primary email read-only with the confirmation prompt, and Continue stays disabled until Confirm (MF-1).',
    condition: 'Admin has AUTH.User.Reset; target is the dedicated test user.',
    expected: `"${TEXT.confirmPrompt}" is shown with the user's email (read-only), Confirm and Change Email are offered and Continue is disabled until Confirm.`,
  },
  reauth: {
    id: 'TC_ARU_002', severity: 'critical',
    name: 'Admin must re-authenticate after confirming the email',
    description: 'Verify confirming the email triggers strong re-authentication of the admin before the reset can continue (MF-1.5, 62302).',
    condition: 'Admin confirmed the target email.',
    expected: 'A re-authentication challenge (TOTP or password) is shown; after a valid answer the channel question is shown.',
  },
  wrongReauth: {
    id: 'TC_ARU_003', type: 'Negative', severity: 'critical',
    name: 'Wrong re-authentication blocks the reset',
    description: 'Verify a wrong password / code at re-authentication does not let the admin continue (MF-1.5).',
    condition: 'Admin confirmed the target email and answers re-authentication incorrectly.',
    expected: 'Re-authentication is rejected and the channel question is not shown.',
    value: { password: 'Wrong-Password-1!', code: '000000' },
  },
  channels: {
    id: 'TC_ARU_004', severity: 'normal',
    name: 'Channel question offers all six request channels',
    description: 'Verify the neutral panel asks how the request was received and offers Face-to-face, Phone call, Zoom / Video, Text / SMS, Email and Other (MF-2).',
    condition: 'Admin re-authenticated.',
    expected: `"${TEXT.channelQuestion}" is shown with all six options.`,
  },
  nonLive: [
    { id: 'TC_ARU_005', channel: 'Email' },
    { id: 'TC_ARU_006', channel: 'Text / SMS' },
    { id: 'TC_ARU_007', channel: 'Other' },
  ].map(c => ({
    ...c, severity: 'critical',
    name: `${c.channel} channel shows the social-engineering warning`,
    description: `Verify choosing "${c.channel}" shows the blocking social-engineering warning, then the live-verification prompt, each with Continue disabled until its checkbox is ticked (MF-3 A, MF-4).`,
    condition: `Admin re-authenticated and selected "${c.channel}".`,
    expected: 'Warning and checkbox shown; Continue disabled until ticked; then the real-time verification prompt with its own checkbox; then the evidence form.',
  })),
  phone: {
    id: 'TC_ARU_008', severity: 'critical', channel: 'Phone call', evidence: evidence.phone,
    name: 'Phone call channel - live guidance and evidence template',
    description: 'Verify "Phone call" shows the live-verification guidance, then the evidence template with Date/Time pre-filled, Channel set and empty phone number and question fields (MF-3 B, MF-5).',
    condition: 'Admin re-authenticated and selected "Phone call".',
    expected: 'Guidance + checkbox (Continue disabled until ticked); evidence form: Date/Time filled, Channel = Phone, phone number and question empty and required.',
  },
  zoom: {
    id: 'TC_ARU_009', severity: 'normal', channel: 'Zoom / Video', evidence: evidence.zoom,
    name: 'Zoom / Video channel - live guidance and evidence template',
    description: 'Verify "Zoom / Video" shows the live-verification guidance, then the evidence template asking for the Meeting ID and the verification question (MF-3 B, MF-5).',
    condition: 'Admin re-authenticated and selected "Zoom / Video".',
    expected: 'Guidance + checkbox; evidence form: Date/Time filled, Channel = Zoom / Video, Meeting ID and question empty and required.',
  },
  faceToFace: {
    id: 'TC_ARU_010', severity: 'critical', channel: 'Face-to-face',
    name: 'Face-to-face channel goes straight to attestation',
    description: 'Verify "Face-to-face" shows the in-person confirmation and, once ticked, skips the evidence form and goes to attestation (MF-3 C, MF-5, MF-6).',
    condition: 'Admin re-authenticated and selected "Face-to-face".',
    expected: `"${TEXT.faceToFacePrompt}" + checkbox; Continue leads directly to the attestation; no evidence form.`,
  },
  missingChannelId: {
    id: 'TC_ARU_011', type: 'Negative', severity: 'critical', channel: 'Phone call',
    name: 'Evidence without the phone number is rejected',
    description: 'Verify the reset cannot progress when the phone number is left empty in the evidence template (AF-2).',
    condition: 'Phone call channel; verification question entered, phone number empty.',
    expected: `"${TEXT.evidenceRequired}" is shown (or Continue stays disabled) and the attestation / reset controls are not reachable.`,
    evidence: { channelId: '', question: evidence.phone.question },
  },
  missingQuestion: {
    id: 'TC_ARU_012', type: 'Negative', severity: 'critical', channel: 'Zoom / Video',
    name: 'Evidence without the verification question is rejected',
    description: 'Verify the reset cannot progress when the verification question is left empty (AF-2).',
    condition: 'Zoom / Video channel; Meeting ID entered, question empty.',
    expected: `"${TEXT.evidenceRequired}" is shown (or Continue stays disabled) and the attestation / reset controls are not reachable.`,
    evidence: { channelId: evidence.zoom.channelId, question: '' },
  },
  attestationGate: {
    id: 'TC_ARU_013', type: 'Negative', severity: 'critical', channel: 'Face-to-face',
    name: 'Reset controls stay disabled until the attestation is ticked',
    description: 'Verify the reset command is disabled until the attestation checkbox is ticked, and enabled after (MF-6 steps 1-2). The reset is NOT executed.',
    condition: 'Face-to-face channel confirmed; attestation shown.',
    expected: 'Reset disabled while unticked, enabled when ticked; the test then cancels.',
  },
  cancel: {
    id: 'TC_ARU_014', type: 'Negative', severity: 'critical', channel: 'Phone call', evidence: evidence.phone,
    name: 'Cancel before attestation aborts the reset',
    description: 'Verify cancelling during verification aborts the reset without any change (AF-1).',
    condition: 'Admin is on the evidence form (Phone call) and clicks Cancel.',
    expected: `"${TEXT.canceled}" is shown and the user's account is unchanged.`,
  },
  executeFaceToFace: {
    id: 'TC_ARU_015', severity: 'blocker', channel: 'Face-to-face', executes: true,
    name: 'Execute the reset after face-to-face verification',
    description: 'Verify the full reset with face-to-face verification: credentials invalidated, completion message shown, old password no longer works (MF-6).',
    condition: 'RESET_ALLOW_EXECUTE=true; dedicated test user; Face-to-face channel; attestation ticked.',
    expected: `"${TEXT.completed}" is shown; when RESET_TARGET_PASSWORD is set, signing in with it is rejected.`,
  },
  executePhone: {
    id: 'TC_ARU_016', severity: 'critical', channel: 'Phone call', evidence: evidence.phone, executes: true,
    name: 'Execute the reset after phone verification with evidence',
    description: 'Verify the full reset with phone verification and complete evidence (Date/Time, Channel, phone number, question) (MF-5, MF-6).',
    condition: 'RESET_ALLOW_EXECUTE=true; dedicated test user; Phone call channel; evidence complete; attestation ticked.',
    expected: `"${TEXT.completed}" is shown.`,
  },
  viaActions: {
    id: 'TC_ARU_017', severity: 'normal',
    name: 'Manage Access opens from the Person Actions menu',
    description: 'Verify the target\'s Person page (/Person/Edit/{id}) offers Actions -> Manage Access, which opens /Person/ManageAccess/{id} with Reset Access available (MF-1 entry point).',
    condition: 'Admin has AUTH.User.Reset; target person has user access.',
    expected: '"Manage Access: <name>" opens for the same person and Reset Access is offered. No reset is started.',
  },
  viaSearch: {
    id: 'TC_ARU_018', severity: 'normal',
    name: 'Find the user by email search and open Manage Access',
    description: 'Verify a quick search (Person) by the target\'s email finds the person, and Actions -> Manage Access opens /Person/ManageAccess/{id} with Reset Access available.',
    condition: 'RESET_TARGET_EMAIL set (mcivertest1@gmail.com).',
    expected: 'The search opens the target person (RESET_TARGET_PERSON_ID); Manage Access opens and Reset Access is offered. No reset is started.',
  },
  // the two agreed end-to-end scenarios (Person -> Actions -> Manage Access -> Reset Access -> popups)
  scenarioCancel: {
    id: 'TC_ARU_019', type: 'Negative', severity: 'critical',
    name: 'Scenario 1 - Reset Access, Cancel, Ok',
    description: 'Search the person "jack sparrow" (or open /Person/Edit/594), Actions -> Manage Access, click Reset Access on /Person/ManageAccess/594, click Cancel, then Ok.',
    condition: 'Admin signed in; target person 594 has user access.',
    expected: 'Reset Access opens the confirmation popup; Cancel closes it and the Ok popup acknowledges it. The user\'s access is unchanged and Reset Access is still offered.',
    answers: [
      { label: 'Cancel', name: /^Cancel$/i, accept: false },
      { label: 'Ok', name: /^Ok$/i, accept: true },
    ],
  },
  scenarioConfirm: {
    id: 'TC_ARU_020', severity: 'critical',
    name: 'Scenario 2 - Reset Access, Confirm, Ok / Save',
    description: 'Search the person "jack sparrow" (or open /Person/Edit/594), Actions -> Manage Access, click Reset Access on /Person/ManageAccess/594, click Confirm, then the button the next popup shows (Ok / Save).',
    condition: 'Admin signed in; target person 594 has user access. Confirms the reset of the dedicated test user.',
    expected: 'Reset Access opens the confirmation popup; Confirm leads to a popup whose Ok / Save button completes it without an error.',
    answers: [
      { label: 'Confirm', name: /^Confirm$/i, accept: true },
      { label: 'Ok / Save', name: /^(Ok|Save|Yes|Continue|Done|Close|Submit)$/i, accept: true },
    ],
  },
};

module.exports = { MODULE, TEXT, CHANNELS, adminResetCases };
