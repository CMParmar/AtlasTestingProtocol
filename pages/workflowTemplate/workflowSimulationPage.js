const { BasePage } = require('../basePage');

const EVALUATE = '/WorkflowTemplate/WorkflowSimulationEvaluate';

/**
 * Simulate Workflow Template Version (use case 63102, module TASK): /WorkflowTemplate/Edit/{id} > "Work Steps" tab > Simulate.
 * The Simulate button (.btn-workflow-simulation) opens #modal-workflow-simulation:
 *   - header: #modal-workflow-simulation-title, #wft-simulation-subtitle ("Automation Delivery, v3 (Published)"), close button
 *   - sidebar selects: #wft-simulation-account-status, #wft-simulation-project-status, #wft-simulation-project-phase,
 *     #wft-simulation-service-status
 *   - #wft-simulation-steps > .wft-sim-step[data-step-id][data-display-state]; the state is the resolved display indicator:
 *     NotReadyToStart | ReadyToComplete | Completed | TemporarilyBlocked | Canceled
 *       row: .wft-sim-step__row (click = expand) with .wft-sim-step__name and select.wft-sim-step__status
 *       details (expanded, .is-expanded): .wft-sim-unmet > __status, __leadin, __heading ("Project Phase:", "Required prerequisites:"), li
 *   - footer: #wft-simulation-reset
 * Every change is evaluated by the server: POST /WorkflowTemplate/WorkflowSimulationEvaluate (JSON, nothing is saved).
 * The UI is located by id / class / data attributes; captions are only used where they are the data under test.
 * No assertions - methods act or return values; specs assert.
 */
class WorkflowSimulationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);

    // ---- template page ----
    this.worksStepsTab = page.locator('[data-bs-target="#pane-worksteps"]').first();
    this.simulateButton = page.locator('.btn-workflow-simulation');
    this.versionLabel = page.locator('main').getByText(/^Version \d+$/).first();

    // ---- simulation dialog ----
    this.dialog = page.locator('#modal-workflow-simulation');
    this.title = page.locator('#modal-workflow-simulation-title');
    this.subtitle = page.locator('#wft-simulation-subtitle');
    this.closeButton = this.dialog.locator('.wft-simulation-modal__close');
    this.resetButton = page.locator('#wft-simulation-reset');
    this.accountStatus = page.locator('#wft-simulation-account-status');
    this.projectStatus = page.locator('#wft-simulation-project-status');
    this.projectPhase = page.locator('#wft-simulation-project-phase');
    this.serviceStatus = page.locator('#wft-simulation-service-status');
    this.steps = this.dialog.locator('#wft-simulation-steps .wft-sim-step');
    this.stepStatusSelects = this.steps.locator('select.wft-sim-step__status');
    this.openModals = page.locator('.modal.show');
  }

  /** Opens the template version page by URL. */
  async goto(templateId) {
    await this.openRecord(`/WorkflowTemplate/Edit/${templateId}`);
    await this.worksStepsTab.waitFor({ state: 'visible', timeout: 60_000 });
  }

  /**
   * Work Steps tab -> Simulate; resolves when the steps are rendered by the first load.
   * On the shared sandbox that first load sometimes never answers while other workers run: when the steps do not show within
   * 20 s the dialog is closed and Simulate is clicked again (up to 3 tries).
   */
  async openSimulation() {
    await this.worksStepsTab.click();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.simulateButton.click();
      await this.dialog.waitFor({ state: 'visible', timeout: 30_000 });
      try {
        await this.steps.first().waitFor({ state: 'visible', timeout: attempt === 3 ? 60_000 : 20_000 });
        return;
      } catch (e) {
        if (attempt === 3) throw e;
        await this.closeButton.click();
        await this.dialog.waitFor({ state: 'hidden', timeout: 15_000 });
      }
    }
  }

  async closeSimulation() {
    await this.closeButton.click();
    await this.dialog.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  /** Resolves with the evaluate response; call BEFORE the action that triggers it. */
  waitForEvaluate() {
    return this.page.waitForResponse(r => r.url().includes(EVALUATE) && r.request().method() === 'POST', { timeout: 60_000 });
  }

  /** Runs `action` and waits for the evaluation it triggers; returns the response. */
  async evaluating(action) {
    const response = this.waitForEvaluate();
    await action();
    return response;
  }

  step(index) { return this.steps.nth(index); }
  stepStatus(index) { return this.step(index).locator('select.wft-sim-step__status'); }
  stepRow(index) { return this.step(index).locator('.wft-sim-step__row'); }
  stepDetails(index) { return this.step(index).locator('.wft-sim-step__details'); }
  unmetHeadings(index) { return this.step(index).locator('.wft-sim-unmet__heading'); }
  unmetItems(index) { return this.step(index).locator('.wft-sim-unmet li'); }

  /** Selects a work item status on a step and waits for the recalculation. */
  async setStepStatus(index, label) {
    return this.evaluating(() => this.stepStatus(index).selectOption({ label }));
  }

  async setAccountStatus(label) { return this.evaluating(() => this.accountStatus.selectOption({ label })); }
  async setProjectStatus(label) { return this.evaluating(() => this.projectStatus.selectOption({ label })); }
  async setServiceStatus(label) { return this.evaluating(() => this.serviceStatus.selectOption({ label })); }
  async setProjectPhase(label) { return this.evaluating(() => this.projectPhase.selectOption({ label })); }

  /** Reset re-opens the simulation state, which the app loads with its own call: wait for any simulation response, then for the steps. */
  async reset() {
    const loaded = this.page.waitForResponse(r => r.url().includes('/WorkflowTemplate/WorkflowSimulation'), { timeout: 30_000 });
    await this.resetButton.click();
    await loaded;
    await this.steps.first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Expands a step's explanation when it is collapsed. */
  async expand(index) {
    if (!(await this.isExpanded(index))) await this.stepRow(index).click();
  }

  async isExpanded(index) {
    return this.step(index).evaluate(el => el.classList.contains('is-expanded'));
  }

  /** Display indicator (data-display-state) of every step. */
  async states() {
    return this.steps.evaluateAll(els => els.map(e => e.dataset.displayState));
  }

  async state(index) {
    return this.step(index).getAttribute('data-display-state');
  }

  /** Selected status caption of every step. */
  async stepStatuses() {
    return this.stepStatusSelects.evaluateAll(els => els.map(e => e.selectedOptions[0].text));
  }

  async stepNames() {
    return this.steps.locator('.wft-sim-step__name').allTextContents();
  }

  /** Caption of the selected option of a sidebar select. */
  async selected(select) {
    return select.evaluate(el => el.selectedOptions[0].text);
  }

  async optionTexts(select) {
    return select.locator('option').allTextContents();
  }

  /** Explanation of a step: { status, leadin, items[] } (expands the step first). */
  async explanation(index) {
    await this.expand(index);
    const root = this.step(index).locator('.wft-sim-unmet');
    return {
      status: (await root.locator('.wft-sim-unmet__status').innerText()).trim(),
      leadin: (await root.locator('.wft-sim-unmet__leadin').allInnerTexts()).join(' ').trim(),
      headings: (await root.locator('.wft-sim-unmet__heading').allInnerTexts()).map(t => t.trim()),
      items: (await root.locator('li').allInnerTexts()).map(t => t.trim()),
      text: (await root.innerText()).trim(),
    };
  }

  /** Marks steps 0..count-1 Completed, one evaluation each. */
  async completeFirst(count) {
    for (let i = 0; i < count; i++) await this.setStepStatus(i, 'Completed');
  }
}

module.exports = { WorkflowSimulationPage };
