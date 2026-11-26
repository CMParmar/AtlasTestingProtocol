// Playwright custom reporter -> one Excel workbook PER DATE for the Create Service Item (62419, "Deliverable Type")
// tests, with bandwidth usage:
//   reports/excel/create-service-item/Atlas_CreateServiceItem_<yyyy-mm-dd>.xlsx
//
// Every run of the same day is appended (day-store_<date>.json next to the workbook). Sheets:
//   Summary                    - pass criteria and status of the latest run and the day, totals, Positive / Negative
//                                breakdown, BANDWIDTH USAGE (requests, data sent / received, average per test, average
//                                throughput, heaviest test), runs of the day, latest result per test case
//   Test Cases                 - TestCaseNo, TestCaseName, Description, Condition, Test Values, Pass/Fail Result, Status,
//                                Duration + Requests, Data Sent / Received / Total (KB), Type, Expected Result, Remarks,
//                                Record URL, Run ID, Executed At - every test of every run of the day
//   Bandwidth                  - every test of the latest run ranked by data transferred, plus the per-run totals
//   Deliverable Types Created  - the newly added test values: every Deliverable Type created in the sandbox that day
//
// Bandwidth comes from the 'NetworkUsage' annotation of fixtures/fixtures.js (bytes of every finished request of the
// test's browser context: request headers + body = sent, response headers + body = received).
// Pass/Fail Result: Pass | Fail | Skipped | Known Defect (a test marked with `defect` that failed as expected).
// A run (and the day) is PASSED when more than 60% of the executed cases pass: Passed / (Passed + Failed); skipped and
// known-defect cases are not counted.
// Options: { module: 'Create Service Item', outputDir: 'reports/excel/create-service-item', filePrefix: 'Atlas_CreateServiceItem', passThreshold: 0.6,
//            shortTitle: 'Create Service Item (62419)', useCase: '<text of the Use Case row>' }
// The same reporter serves View & Update Service Item (62420): tests that log 'UpdatedRecord' annotations get an extra
// "Updates" sheet (record, field, old value, new value).

const CreateUserReporter = require('./createuser-reporter');

const { NAVY, WHITE, GREY, RESULT_STYLE, fill, border, secs, mmss, pct, ann, annAll } = CreateUserReporter.helpers;
const PURPLE = 'FFE4DFEC', PURPLE_TXT = 'FF5B3B8C';
const STYLE = { ...RESULT_STYLE, 'Known Defect': [PURPLE, PURPLE_TXT] };

const kb = bytes => Math.round(((bytes || 0) / 1024) * 10) / 10;
const mb = bytes => Math.round(((bytes || 0) / 1048576) * 100) / 100;
/** Average throughput in Mbps: all bits sent and received / seconds. */
const mbps = (bytes, ms) => (ms > 0 ? Math.round(((bytes * 8) / 1e6 / (ms / 1000)) * 1000) / 1000 : 0);
const total = x => (x.sentBytes || 0) + (x.receivedBytes || 0);
const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);

class ServiceItemReporter extends CreateUserReporter {
  constructor(options = {}) {
    super({
      module: 'Create Service Item',
      outputDir: 'reports/excel/create-service-item',
      filePrefix: 'Atlas_CreateServiceItem',
      tag: 'serviceitem-reporter',
      shortTitle: 'Create Service Item (62419)',
      useCase: '62419 SERV.Create Service Item (sandbox: Add New (+) -> Deliverable Type, /ServiceItem/Create)',
      ...options,
    });
    this.shortTitle = options.shortTitle || 'Create Service Item (62419)';
    // the 'records created' sheet: { label: 'Deliverable Types', columns: [[header, field label of the CreatedRecord, width], ...] }
    this.records = options.records || {
      label: 'Deliverable Types',
      columns: [['Deliverable Type Name', 'Deliverable Type Name', 44], ['Description', 'Description', 40], ['Account Name', 'Account Name', 26],
        ['Accounting ID', 'Accounting ID', 26], ['Taxable', 'Taxable', 9], ['Allowed Billing Types', 'Allowed Billing Types', 36],
        ['Default Billing Type', 'Default Billing Type', 18], ['Unit Of Measure', 'Unit Of Measure', 13], ['Typical Estimated Hours', 'Typical Estimated Hours', 12]],
    };
    this.useCase = options.useCase || '62419 SERV.Create Service Item (sandbox: Add New (+) -> Deliverable Type, /ServiceItem/Create)';
  }

  onTestEnd(test, result) {
    super.onTestEnd(test, result);
    const x = this.cases.get(test.id);
    if (!x) return;
    const annotations = [...test.annotations, ...(result.annotations || [])];

    // bandwidth of the last attempt
    const usage = annAll(annotations, 'NetworkUsage').map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean).pop();
    x.requests = usage ? usage.requests : 0;
    x.sentBytes = usage ? usage.sentBytes : 0;
    x.receivedBytes = usage ? usage.receivedBytes : 0;
    x.measured = !!usage;

    // a known defect that failed as expected is not a Pass
    const defect = ann(annotations, 'KnownDefect');
    if (defect && test.outcome() === 'expected' && result.status !== 'passed') {
      x.result = 'Known Defect';
      x.status = 'Failed as expected';
      x.remarks = [`Known defect: ${defect}`, x.remarks].filter(Boolean).join(' | ');
    }

    // every record a test created stays in the sandbox, so list it whatever the result
    const seen = new Set();
    const seenUpd = new Set();
    x.updated = annAll(annotations, 'UpdatedRecord').filter(s => (seenUpd.has(s) ? false : seenUpd.add(s)))
      .map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    x.created = annAll(annotations, 'CreatedRecord').filter(s => (seen.has(s) ? false : seen.add(s)))
      .map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  }

  buildWorkbook(store, latest) {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Atlas Playwright Framework';
    wb.created = new Date();
    this.summarySheet(wb, store, latest);
    this.testCasesSheet(wb, store);
    this.bandwidthSheet(wb, store, latest);
    this.recordsSheet(wb, store);
    if (store.runs.some(r => r.cases.some(x => (x.updated || []).length))) this.updatesSheet(wb, store);
    return wb;
  }

  /** Same as the base row, plus the Known Defect colour. */
  dataRow(ws, rowNo, values, opts = {}) {
    const row = super.dataRow(ws, rowNo, values, opts);
    const style = opts.resultCol && STYLE[values[opts.resultCol - 1]];
    if (style) {
      const c = row.getCell(opts.resultCol);
      c.fill = fill(style[0]);
      c.font = { bold: true, color: { argb: style[1] } };
      c.alignment = { vertical: 'top', horizontal: 'center' };
    }
    return row;
  }

  infoRows(ws, row, rows, cols, colored = {}) {
    for (const [title, value] of rows) {
      ws.mergeCells(row, 2, row, cols);
      const l = ws.getCell(row, 1);
      l.value = title;
      l.font = { bold: true };
      l.fill = fill(GREY);
      const v = ws.getCell(row, 2);
      v.value = value;
      v.alignment = { horizontal: 'left', wrapText: true };
      for (let col = 1; col <= cols; col++) ws.getCell(row, col).border = border;
      if (colored[title]) {
        const [bg, fg] = STYLE[colored[title]];
        v.fill = fill(bg);
        v.font = { bold: true, color: { argb: fg } };
      }
      row++;
    }
    return row;
  }

  // ------------------------------------------------------------------ Summary
  summarySheet(wb, store, latest) {
    const ws = wb.addWorksheet('Summary');
    const COLS = 10;
    ws.columns = [{ width: 34 }, { width: 44 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 14 }];
    this.title(ws, `Atlas Sandbox - ${this.shortTitle} ("Deliverable Type") - Test Summary - ${store.date}`, COLS);

    const L = latest.cases;
    const count = (xs, r) => xs.filter(x => x.result === r).length;
    const all = store.runs.flatMap(r => r.cases);
    const [dayPass, dayFail] = [count(all, 'Pass'), count(all, 'Fail')];
    const latestVerdict = this.verdict(latest.passed, latest.failed);
    const dayVerdict = this.verdict(dayPass, dayFail);
    const label = v => ({ Pass: 'PASSED', Fail: 'FAILED', Skipped: 'NOT EXECUTED' }[v]);
    const created = runs => sum(runs.flatMap(r => r.cases), x => x.created.length);
    const updated = runs => sum(runs.flatMap(r => r.cases), x => (x.updated || []).length);

    let row = this.infoRows(ws, 3, [
      ['Use Case', this.useCase],
      ['Application URL', this.baseURL],
      ['Report Date', store.date],
      ['Latest Run ID', latest.runId],
      ['Latest Run Started', latest.start],
      ['Latest Run Duration', `${mmss(latest.durationMs)} (mm:ss)`],
      ['Pass Criteria', `PASSED when more than ${Math.round(this.passThreshold * 100)}% of the executed test cases pass (Passed / (Passed + Failed); skipped and known-defect cases are not counted)`],
      ['Latest Run Status', `${label(latestVerdict)}  (pass rate ${pct(latest.passed, latest.passed + latest.failed)})`],
      ['Latest Run - Test Cases', `${latest.total}  (Passed ${latest.passed}, Failed ${latest.failed}, Skipped ${latest.skipped}, Known Defect ${count(L, 'Known Defect')})`],
      ['Latest Run - Pass Rate', pct(latest.passed, latest.passed + latest.failed)],
      [`Latest Run - ${this.records.label} Created`, created([latest])],
      ['Runs on this Date', store.runs.length],
      ['Test Cases Executed (day)', `${all.length}  (Passed ${dayPass}, Failed ${dayFail}, Skipped ${count(all, 'Skipped')}, Known Defect ${count(all, 'Known Defect')})`],
      ['Overall Status (day)', `${label(dayVerdict)}  (pass rate ${pct(dayPass, dayPass + dayFail)})`],
      [`${this.records.label} Created (day)`, created(store.runs)],
      ['Records Updated (latest run / day)', `${updated([latest])} / ${updated(store.runs)}`],
    ], COLS, { 'Latest Run Status': latestVerdict, 'Overall Status (day)': dayVerdict });

    // ---- bandwidth usage
    const measured = L.filter(x => x.measured);
    const bytes = sum(L, total);
    const heaviest = [...measured].sort((a, b) => total(b) - total(a))[0];
    const dayBytes = sum(all, total);
    row = this.section(ws, row + 1, 'Bandwidth Usage - Latest Run (browser traffic of every test)');
    row = this.infoRows(ws, row, [
      ['Test Cases Measured', `${measured.length} of ${L.length}`],
      ['HTTP Requests', sum(L, x => x.requests)],
      ['Data Sent', `${mb(sum(L, x => x.sentBytes))} MB  (${kb(sum(L, x => x.sentBytes))} KB)`],
      ['Data Received', `${mb(sum(L, x => x.receivedBytes))} MB  (${kb(sum(L, x => x.receivedBytes))} KB)`],
      ['Total Data Transferred', `${mb(bytes)} MB`],
      ['Average per Test Case', measured.length ? `${kb(bytes / measured.length)} KB, ${Math.round(sum(L, x => x.requests) / measured.length)} requests` : '-'],
      ['Average Throughput (whole run)', `${mbps(bytes, latest.durationMs)} Mbps  (total bits / run duration ${mmss(latest.durationMs)})`],
      ['Average Throughput (per test time)', `${mbps(bytes, sum(L, x => x.durationMs))} Mbps  (total bits / sum of test durations)`],
      ['Heaviest Test Case', heaviest ? `${heaviest.id} ${heaviest.name} - ${kb(total(heaviest))} KB, ${heaviest.requests} requests` : '-'],
      ['Total Data Transferred (day)', `${mb(dayBytes)} MB in ${store.runs.length} run(s), ${sum(all, x => x.requests)} requests`],
    ], COLS);

    // ---- results and bandwidth by test type
    row = this.section(ws, row + 1, 'Latest Run - Results and Bandwidth by Test Type');
    this.headerRow(ws, row++, ['Test Type', 'Description', 'Total', 'Passed', 'Failed', 'Skipped / Known Defect', 'Pass Rate', 'Duration', 'Requests', 'Data (KB)']);
    for (const type of ['Positive', 'Negative']) {
      const xs = L.filter(x => x.type === type);
      const p = count(xs, 'Pass'), f = count(xs, 'Fail');
      this.dataRow(ws, row++, [type, type === 'Positive' ? 'Page load, creation, billing rules, duplicate warning, postconditions' : 'Validation, limits and permission (nothing saved)',
        xs.length, p, f, xs.length - p - f, pct(p, p + f), secs(sum(xs, x => x.durationMs)), sum(xs, x => x.requests), kb(sum(xs, total))]);
    }
    this.dataRow(ws, row++, ['Total', '', latest.total, latest.passed, latest.failed, latest.total - latest.passed - latest.failed,
      pct(latest.passed, latest.passed + latest.failed), secs(sum(L, x => x.durationMs)), sum(L, x => x.requests), kb(bytes)]).font = { bold: true };

    // ---- runs of the day
    row = this.section(ws, row + 1, `All Runs on ${store.date}`);
    this.headerRow(ws, row++, ['Run ID', 'Started', 'Total', 'Passed', 'Failed', 'Skipped', 'Pass Rate', 'Duration', 'Data (MB)', 'Run Status']);
    for (const r of store.runs) {
      const v = this.verdict(r.passed, r.failed);
      this.dataRow(ws, row++, [r.runId, r.start, r.total, r.passed, r.failed, r.total - r.passed - r.failed, pct(r.passed, r.passed + r.failed),
        mmss(r.durationMs), mb(sum(r.cases, total)), { Pass: 'Pass', Fail: 'Fail', Skipped: 'Skipped' }[v]], { resultCol: 10 });
      ws.getRow(row - 1).getCell(10).value = { Pass: 'Passed', Fail: 'Failed', Skipped: 'Not Executed' }[v];
    }

    // ---- latest result per test case
    row = this.section(ws, row + 1, 'Latest Run - Result per Test Case');
    this.headerRow(ws, row++, ['TestCaseNo', 'TestCaseName', 'Type', 'Pass/Fail Result', 'Status', 'Duration', 'Requests', 'Sent (KB)', 'Received (KB)', 'Total (KB)']);
    L.forEach((x, i) => this.dataRow(ws, row++, [x.id, x.name, x.type, x.result, x.status, secs(x.durationMs), x.requests, kb(x.sentBytes), kb(x.receivedBytes), kb(total(x))],
      { resultCol: 4, zebra: i % 2 === 1 }));
  }

  // ------------------------------------------------------------------ Test Cases (every run of the day)
  testCasesSheet(wb, store) {
    const ws = wb.addWorksheet('Test Cases', { views: [{ state: 'frozen', ySplit: 3 }] });
    const cols = [
      ['TestCaseNo', 12], ['TestCaseName', 38], ['Description', 55], ['Condition', 40], ['Test Values', 50],
      ['Pass/Fail Result', 13], ['Status', 16], ['Duration', 11], ['Requests', 10], ['Data Sent (KB)', 12], ['Data Received (KB)', 13],
      ['Total Data (KB)', 12], ['Type', 10], ['Expected Result', 46], ['Remarks / Observed', 55], ['Record URL', 42], ['Run ID', 17], ['Executed At', 20],
    ];
    ws.columns = cols.map(([, width]) => ({ width }));
    this.title(ws, `${this.shortTitle} - Test Cases - ${store.date}`, cols.length);
    this.headerRow(ws, 3, cols.map(([h]) => h));
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
    let row = 4;
    store.runs.slice().reverse().forEach((r, ri) => {   // latest run first
      for (const x of r.cases) {
        this.dataRow(ws, row++, [x.id, x.name, x.description, x.condition, x.values, x.result, x.status, secs(x.durationMs),
          x.requests, kb(x.sentBytes), kb(x.receivedBytes), kb(total(x)), x.type, x.expected, x.remarks, x.url, x.runId, x.executedAt],
        { resultCol: 6, zebra: ri % 2 === 1 });
      }
    });
  }

  // ------------------------------------------------------------------ Bandwidth
  bandwidthSheet(wb, store, latest) {
    const ws = wb.addWorksheet('Bandwidth', { views: [{ state: 'frozen', ySplit: 3 }] });
    const cols = [['Rank', 7], ['TestCaseNo', 12], ['TestCaseName', 46], ['Pass/Fail Result', 13], ['Requests', 10], ['Data Sent (KB)', 13],
      ['Data Received (KB)', 14], ['Total Data (KB)', 13], ['Share of Run', 11], ['Duration', 11], ['Avg Throughput (Mbps)', 15]];
    ws.columns = cols.map(([, width]) => ({ width }));
    this.title(ws, `${this.shortTitle} - Bandwidth Usage - latest run ${latest.runId}`, cols.length);
    this.headerRow(ws, 3, cols.map(([h]) => h));
    const runBytes = sum(latest.cases, total);
    let row = 4;
    [...latest.cases].sort((a, b) => total(b) - total(a)).forEach((x, i) => {
      this.dataRow(ws, row++, [i + 1, x.id, x.name, x.result, x.requests, kb(x.sentBytes), kb(x.receivedBytes), kb(total(x)),
        pct(total(x), runBytes), secs(x.durationMs), mbps(total(x), x.durationMs)], { resultCol: 4, zebra: i % 2 === 1 });
    });
    this.dataRow(ws, row++, ['', 'TOTAL', `${latest.cases.length} test cases`, '', sum(latest.cases, x => x.requests), kb(sum(latest.cases, x => x.sentBytes)),
      kb(sum(latest.cases, x => x.receivedBytes)), kb(runBytes), runBytes ? '100.0%' : '-', mmss(latest.durationMs), mbps(runBytes, latest.durationMs)]).font = { bold: true };

    row = this.section(ws, row + 1, `Bandwidth per Run on ${store.date}`);
    this.headerRow(ws, row++, ['Run ID', 'Started', 'Test Cases', 'Requests', 'Data Sent (MB)', 'Data Received (MB)', 'Total Data (MB)', 'Duration', 'Avg Throughput (Mbps)']);
    for (const r of store.runs) {
      const b = sum(r.cases, total);
      this.dataRow(ws, row++, [r.runId, r.start, r.total, sum(r.cases, x => x.requests), mb(sum(r.cases, x => x.sentBytes)), mb(sum(r.cases, x => x.receivedBytes)),
        mb(b), mmss(r.durationMs), mbps(b, r.durationMs)]);
    }
  }

  // ------------------------------------------------------------------ Deliverable Types Created (newly added test values)
  recordsSheet(wb, store) {
    const label = this.records.label;
    const ws = wb.addWorksheet(`${label} Created`.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 }] });
    const cols = [['#', 5, ''], ['TestCaseNo', 12, ''], ...this.records.columns.slice(0, 1).map(([h, f, w]) => [h, w, f]), ['Record ID', 10, ''],
      ...this.records.columns.slice(1).map(([h, f, w]) => [h, w, f]), ['Test Result', 12, ''], ['Record URL', 48, ''], ['Run ID', 17, ''], ['Created At', 20, '']];
    ws.columns = cols.map(([, width]) => ({ width }));
    this.title(ws, `${this.shortTitle} - ${label} Created in the Sandbox - ${store.date} (not cleaned up)`, cols.length);
    this.headerRow(ws, 3, cols.map(([h]) => h));
    const resultCol = cols.findIndex(([h]) => h === 'Test Result') + 1;
    let row = 4, n = 1;
    for (const r of store.runs) {
      for (const x of r.cases) {
        for (const rec of x.created) {
          const f = rec.fields || {};
          const value = ([h, , field]) => ({ '#': n, TestCaseNo: x.id, 'Record ID': rec.recordId || '', 'Test Result': x.result, 'Record URL': rec.url || '',
            'Run ID': r.runId, 'Created At': x.executedAt })[h] ?? (f[field] || '');
          this.dataRow(ws, row++, cols.map(value), { resultCol });
          n++;
        }
      }
    }
    if (n === 1) ws.getCell(4, 1).value = `No ${label} created on this date yet.`;
  }

  // ------------------------------------------------------------------ Updates (View & Update: old -> new values)
  updatesSheet(wb, store) {
    const ws = wb.addWorksheet('Updates', { views: [{ state: 'frozen', ySplit: 3 }] });
    const cols = [['#', 5], ['TestCaseNo', 12], ['Deliverable Type', 44], ['Record ID', 10], ['Field', 28], ['Old Value', 40], ['New Value', 40],
      ['Test Result', 12], ['Record URL', 48], ['Run ID', 17], ['Updated At', 20]];
    ws.columns = cols.map(([, width]) => ({ width }));
    this.title(ws, `${this.shortTitle} - Records Updated in the Sandbox - ${store.date} (not cleaned up)`, cols.length);
    this.headerRow(ws, 3, cols.map(([h]) => h));
    let row = 4, n = 1;
    for (const r of store.runs) {
      for (const x of r.cases) {
        for (const u of x.updated || []) {
          const changes = u.changes && u.changes.length ? u.changes : [{ field: '(no field changed)', from: '', to: '' }];
          for (const ch of changes) {
            this.dataRow(ws, row++, [n++, x.id, u.name || '', u.recordId || '', ch.field, ch.from, ch.to, x.result, u.url || '', r.runId,
              (u.updatedAt || '').replace('T', ' ').slice(0, 19)], { resultCol: 8 });
          }
        }
      }
    }
  }
}

module.exports = ServiceItemReporter;
