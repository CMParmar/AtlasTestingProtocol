const { env } = require('./testData');
const { ACCOUNTS } = require('../testData/serviceData');
const { ServicePage } = require('../pages/service/servicePage');

/**
 * The accounts the Create Service tests work on, found in the Account selector by name:
 * { main: { id, name, projects: [{ id, name }] }, other: { ... } }. Both must exist and offer at least one project.
 * @param {import('@playwright/test').Browser} browser
 */
async function resolveServiceAccounts(browser) {
  const context = await browser.newContext({ storageState: env.storageState, baseURL: env.baseURL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    const servicePage = new ServicePage(page);
    await servicePage.gotoCreate();
    const options = await servicePage.account.locator('option:not([value=""])')
      .evaluateAll(os => os.map(o => ({ id: o.value, name: o.textContent.trim() })));
    const out = {};
    for (const [key, accountName] of Object.entries(ACCOUNTS)) {
      const found = options.find(a => a.name === accountName);
      if (!found) throw new Error(`Account "${accountName}" is not offered by the Add Service Account selector (set SERVICE_ACCOUNT_NAME / SERVICE_OTHER_ACCOUNT)`);
      await servicePage.selectAccount(found.id);
      const projects = await servicePage.project.locator('option:not([value=""])')
        .evaluateAll(os => os.map(o => ({ id: o.value, name: o.textContent.trim() })));
      if (!projects.length) throw new Error(`Account "${accountName}" has no project to create a Deliverable on`);
      out[key] = { ...found, projects };
    }
    return out;
  } finally {
    await context.close();
  }
}

module.exports = { resolveServiceAccounts };
