// Runs once after every functional test is done (teardown of the 'functional' project in playwright.config.js).
// documentViewEdit / adddocument tests leave run-tagged documents on the shared parent, which slows its page down.
// This used to be an afterAll of documentViewEdit.spec.js, but with tests spread over several workers each worker ran it
// when it finished - deleting documents other workers were still using - so it now runs once, after all of them.

const { test } = require('../fixtures/fixtures');
const { DocumentPage } = require('../pages/document/documentPage');
const { env } = require('../utils/testData');

test('soft-delete the run-tagged test documents on the shared parent', async ({ page }) => {
  test.setTimeout(600_000);
  await new DocumentPage(page).cleanUpTestDocuments({ runTag: env.runTag });
});
