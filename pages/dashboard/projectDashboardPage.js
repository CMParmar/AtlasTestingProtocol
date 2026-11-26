const { BasePage } = require('../basePage');

const PLACEHOLDER = /^\s*(\.{3}|…)?\s*$/;

/**
 * View Project Dashboard (use case 62438): a Bold BI embedded dashboard ("Project Dashboard - Atlas") opened with
 * /Dashboard/Index?id={dashboardId}&pid={projectId} (the "Project Dashboard" entry of a project's dashboard list).
 * The BI SDK renders into #dashboard_embeddedbi (no iframe); every widget is a div #dashboard_embeddedbi_{WidgetName}
 * and the widget names are stable, so widgets are located by that id, never by caption. Widgets of the sandbox dashboard:
 *   RichTextEditor11 project name - status      ComboBox2   project selector
 *   RichTextEditor1 / 6   "Account Name :" / AccountName      RichTextEditor13 / 9   "Start Date:" / ProjectStartDate
 *   RichTextEditor2 / 7   "Billing Type:" / BillingType       RichTextEditor3 / 10   "Due Date:" / ProjectDueDate
 *   NumberCard1 Percent Complete    NumberCard2 Percent Schedule Remaining    NumberCard3 Estimated Hours
 *   NumberCard4 Remaining Hours     KPICard1 Completed Services               KPICard2 Completed Hours Equivalent
 *   Chart1 "Project Progress, Burndown Combined Chart"     ComboChart1 "Burndown Chart"     Grid1 "Project Services"
 * Until a widget has its data the BI SDK shows "..." (text widgets) or a spinner (cards / charts).
 *
 * The "pid" query string of the dashboard URL does NOT select a project: the dashboard opens on "All" (every project) and the
 * project is chosen in the "Projects" selector (ComboBox2, an ej DropDownList: button #dashboard_embeddedbicomboBoxElementComboBox2_dropdown,
 * items li[data-value={projectId}] in #..._popup_wrapper). The unfiltered "All" state makes the BI chart widgets (Chart1 / ComboChart1)
 * measure the x-axis labels of every project's snapshots, which freezes (and eventually crashes) the browser tab. So the page
 * object holds back the chart data requests of that unfiltered state; once a project is selected every request goes through.
 */
class ProjectDashboardPage extends BasePage {
  constructor(page) {
    super(page);
    const widget = name => page.locator(`#dashboard_embeddedbi_${name}`);
    this.container = page.locator('#dashboard_embeddedbi');
    this.title = page.locator('#dashboard_embeddedbi_title');
    this.sandboxBanner = page.getByText('This is the sandbox.');
    this.noDataMessage = page.getByText(/no data to be displayed/i);

    // ---- header ----
    this.projectTitle = widget('RichTextEditor11');
    this.projectSelector = widget('ComboBox2');
    this.projectDropdownButton = page.locator('#dashboard_embeddedbicomboBoxElementComboBox2_dropdown');
    this.projectSelected = false;
    this.holdCharts = false; // true: chart data stays held even after a project is chosen (heavy projects freeze the tab)
    this.guardInstalled = false;
    this.accountLabel = widget('RichTextEditor1');
    this.accountName = widget('RichTextEditor6');
    this.startLabel = widget('RichTextEditor13');
    this.startDate = widget('RichTextEditor9');
    this.billingLabel = widget('RichTextEditor2');
    this.billingType = widget('RichTextEditor7');
    this.dueLabel = widget('RichTextEditor3');
    this.dueDate = widget('RichTextEditor10');

    // ---- summary metrics ----
    this.percentComplete = widget('NumberCard1');
    this.percentScheduleRemaining = widget('NumberCard2');
    this.estimatedHours = widget('NumberCard3');
    this.remainingHours = widget('NumberCard4');
    this.completedServices = widget('KPICard1');
    this.completedHours = widget('KPICard2');

    // ---- charts and table ----
    this.progressChart = widget('Chart1');
    this.burndownChart = widget('ComboChart1');
    this.servicesGrid = widget('Grid1');
    this.chartSeries = this.progressChart.locator('svg path, svg rect, canvas').first();

    // ---- project page (for cross checks) ----
    this.projectAccountLink = page.locator('main').getByText('Account Name:', { exact: true }).locator('xpath=..').getByRole('link').first();
    this.deliverableLinks = page.locator('#pane-services a[title="Open Deliverable"]');
  }

  /**
   * Opens the dashboard (on "All") and waits for it to be usable. Chart data requests of the unfiltered state are held back
   * (never answered) until selectProject() has chosen a project - see the class comment.
   */
  async gotoDashboard(dashboardId) {
    if (!this.guardInstalled) {
      this.projectSelected = false;
      await this.page.route('**/PostDesignerAction/', route => {
        const body = route.request().postData() || '';
        const isChart = /FetchWidgetData/.test(body) && /\\"Id\\":\\"(Chart1|ComboChart1)\\"/.test(body);
        if (isChart && (this.holdCharts || !this.projectSelected)) return; // held: answered by nothing, the page stays responsive
        return route.continue();
      });
      this.guardInstalled = true;
    }
    this.projectSelected = false;
    await this.openRecord(`/Dashboard/Index?id=${dashboardId}`, { timeout: 90_000 });
    await this.title.waitFor({ state: 'attached', timeout: 90_000 });
    await this.page.waitForFunction(() => {
      const el = document.querySelector('#dashboard_embeddedbi_RichTextEditor6');
      return !!el && el.innerText.trim() !== '' && !el.innerText.includes('{{') && el.innerText.trim() !== '...';
    }, null, { timeout: 120_000 });
    await this.page.waitForTimeout(2_000);
  }

  /** Chooses a project in the dashboard's Projects selector (the way a user switches project, MF-8). */
  async selectProject(projectId, { withCharts = true } = {}) {
    const before = (await this.accountName.innerText()).trim();
    this.projectSelected = true;
    this.holdCharts = !withCharts;
    await this.openProjectList();
    const item = this.projectOption(projectId);
    await item.waitFor({ state: 'attached', timeout: 15_000 });
    await item.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await item.click({ force: true });
    await this.page.waitForTimeout(1_000);
    return before;
  }

  /** Opens the Projects selector list (a toggle button: only clicks when the list is closed). */
  async openProjectList() {
    const option = this.page.locator('#dashboard_embeddedbicomboBoxElementComboBox2_popup_wrapper li[data-value]').first();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await option.isVisible().catch(() => false)) return;
      await this.projectDropdownButton.click({ force: true });
      await this.page.waitForTimeout(1_000);
    }
  }

  /** Ids of the projects offered by the Projects selector, in list order. */
  async projectIds() {
    await this.openProjectList();
    await this.page.locator('#dashboard_embeddedbicomboBoxElementComboBox2_popup_wrapper li[data-value]').first().waitFor({ state: 'attached', timeout: 15_000 });
    const ids = await this.page.locator('#dashboard_embeddedbicomboBoxElementComboBox2_popup_wrapper li[data-value]').evaluateAll(els => els
      .map(e => ({ id: e.getAttribute('data-value'), seeded: /^Playwright/.test(e.textContent.trim()) }))
      .sort((a, b) => Number(a.seeded) - Number(b.seeded)) // projects the tests created ("Playwright ...") have no snapshots: last
      .map(x => x.id));
    // the list is left open: selectProject() reuses it
    return ids;
  }

  /**
   * Switches the open dashboard to another project: `preferredId` when the selector offers it,
   * otherwise the first other project of the list whose data arrives. Returns the id chosen, or '' when none worked.
   */
  async switchToAnotherProject(currentId, preferredId, { candidates = 4, timeout = 40_000 } = {}) {
    const ids = (await this.projectIds()).filter(id => id !== String(currentId));
    const order = [...(preferredId && ids.includes(String(preferredId)) ? [String(preferredId)] : []), ...ids.filter(id => id !== String(preferredId))];
    for (const id of order.slice(0, candidates)) {
      const before = (await this.projectNameAndStatus()).name;
      await this.selectProject(id, { withCharts: false });
      const changed = await this.page.waitForFunction(prev => {
        const e = document.querySelector('#dashboard_embeddedbi_RichTextEditor11');
        const t = e ? e.innerText.replace(/\s+/g, ' ').trim() : '';
        return t && t !== prev && !t.includes('{{') && !/^[.][.][.]/.test(t);
      }, before, { timeout }).then(() => true, () => false);
      if (changed) return id; // the header shows the new project (its cards / charts may have no data: only the header is checked)
    }
    return '';
  }

  /** Waits until the header shows a real project (not "All" / "..."): true when it did within `timeout` ms. */
  async waitForData(timeout = 120_000) {
    try {
      await this.page.waitForFunction(() => {
        const read = id => { const e = document.querySelector('#dashboard_embeddedbi_' + id); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; };
        const name = read('RichTextEditor11');
        const hasProject = name && !/^(All|[.][.][.])([ ]|$)/.test(name) && !name.includes('{{');
        return hasProject && /\d/.test(read('NumberCard3')) && /\d/.test(read('NumberCard4'));
      }, null, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  /** Opens the dashboard and selects `projectId`; true when the project's data arrived. */
  async openProject(dashboardId, projectId) {
    await this.gotoDashboard(dashboardId);
    await this.selectProject(projectId);
    return this.waitForData();
  }

  /** Visible text of a widget with whitespace collapsed ("This widget has not been configured." boilerplate removed). */
  async text(locator) {
    const raw = await locator.innerText({ timeout: 15_000 });
    return raw.replace(/This widget has not been configured\./g, '').replace(/\s+/g, ' ').trim();
  }

  /** Text of a card / KPI widget without its caption. */
  async cardValue(locator, caption) {
    const t = await this.text(locator);
    return t.replace(caption, '').trim();
  }

  /** First number in a text ("1,234.5h" -> 1234.5, "45%" -> 45); NaN when there is none. */
  number(text) {
    const m = String(text).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  projectOption(projectId) {
    return this.page.locator(`#dashboard_embeddedbicomboBoxElementComboBox2_popup_wrapper li[data-value="${projectId}"]`);
  }

  /** "Project name - Status" split into its two parts. */
  async projectNameAndStatus() {
    const t = await this.text(this.projectTitle);
    const i = t.lastIndexOf(' - ');
    return i < 0 ? { name: t, status: '' } : { name: t.slice(0, i).trim(), status: t.slice(i + 3).trim() };
  }

  isPlaceholder(text) {
    return PLACEHOLDER.test(text);
  }

  // ---- project page cross checks ----
  async gotoProject(projectId) {
    await this.openRecord(`/Project/Edit/${projectId}`, { timeout: 90_000 });
    await this.page.locator('main .nav-tabs .nav-link').first().waitFor({ state: 'visible', timeout: 60_000 });
  }

  async projectAccountName() {
    return (await this.projectAccountLink.innerText()).trim();
  }

  async deliverableNames() {
    await this.page.locator('main .nav-tabs .nav-link[data-bs-target="#pane-services"]').click();
    await this.page.waitForTimeout(1_500);
    return (await this.deliverableLinks.allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
}

module.exports = { ProjectDashboardPage };
