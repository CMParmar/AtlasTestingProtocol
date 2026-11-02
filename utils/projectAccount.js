const { env } = require('./testData');
const { seedCompany } = require('../testData/projectData');
const { CompanyEditPage } = require('../pages/company/companyEditPage');
const { AccountPage } = require('../pages/account/accountPage');
const { ProjectPage } = require('../pages/project/projectPage');

/**
 * The EXISTING Account the project tests work on: PROJECT_ACCOUNT_ID, else the first "Playwright Project Owner" /
 * "Playwright" account offered by the Create Project Account selector. A Company + Account is created only when no
 * such account exists (later runs reuse it). Returns { id, name, url }.
 * @param {import('@playwright/test').Browser} browser
 */
async function resolveProjectAccount(browser) {
  const context = await browser.newContext({ storageState: env.storageState, baseURL: env.baseURL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    const projectPage = new ProjectPage(page);
    await projectPage.gotoCreate(env.projectAccountId);
    const accounts = await projectPage.accountOptions();
    const existing = env.projectAccountId
      ? accounts.find(a => a.id === String(env.projectAccountId))
      : accounts.find(a => /^Playwright Project Owner\b/.test(a.name)) || accounts.find(a => /^Playwright\b/.test(a.name));
    if (env.projectAccountId && !existing) throw new Error(`PROJECT_ACCOUNT_ID=${env.projectAccountId} is not offered by the Account selector`);
    if (existing) return { ...existing, url: `${env.baseURL}/Account/Edit/${existing.id}` };
    const company = await new CompanyEditPage(page).createCompany(seedCompany);
    const account = await new AccountPage(page).createAccountFor('Company', company.id);
    return { id: account.id, url: account.url, name: account.values.accountName };
  } finally {
    await context.close();
  }
}

module.exports = { resolveProjectAccount };
