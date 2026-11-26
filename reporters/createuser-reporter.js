// Playwright custom reporter -> one Excel workbook PER DATE for the Create User (Grant Access, 62284) tests:
//   reports/excel/create-user/Atlas_CreateUser_<yyyy-mm-dd>.xlsx
//
// Every run of the same day is appended (kept in day-store_<date>.json next to the workbook), so the workbook of a
// date holds all runs of that date. Sheets:
//   Summary          - totals of the latest run and of the whole day, Positive / Negative breakdown, runs of the day,
//                      latest result per test case
//   Test Cases       - TestCaseNo, TestCaseName, Description, Condition, Test Values, Pass/Fail Result, Status,
//                      Duration (+ Run ID, Executed At, Type, Expected Result, Remarks) for every test of every run
//   Users Created    - the newly added test values: Person, sign-in email and roles of every user created that day
//
// Only tests whose Module annotation (utils/testCase.js tcDetails) equals options.module are reported.
// Options: { module: 'Create User', outputDir: 'reports/excel/create-user', filePrefix: 'Atlas_CreateUser' }

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const NAVY = 'FF1F4E78', WHITE = 'FFFFFFFF';
const GREEN = 'FFC6EFCE', GREEN_TXT = 'FF006100';
const RED = 'FFFFC7CE', RED_TXT = 'FF9C0006';
const YELLOW = 'FFFFEB9C', YELLOW_TXT = 'FF9C5700';
const GREY = 'FFF2F2F2';

const pad = n => String(n).padStart(2, '0');
const dateOnly = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateTime = d => `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const secs = ms => `${(ms / 1000).toFixed(2)} s`;
const mmss = ms => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
const stripAnsi = s => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

const ann = (list, type) => (list.find(a => a.type === type) || {}).description || '';
const annAll = (list, type) => list.filter(a => a.type === type).map(a => a.description || '');

const STATUS = {
  passed: 'Completed',
  failed: 'Failed',
  timedOut: 'Timed Out',
  skipped: 'Not Executed',
  interrupted: 'Interrupted',
};

const RESULT_STYLE = {
  Pass: [GREEN, GREEN_TXT],
  Fail: [RED, RED_TXT],
  Skipped: [YELLOW, YELLOW_TXT],
};

class CreateUserReporter {
  constructor(options = {}) {
    this.module = options.module || 'Create User';
    this.outputDir = path.resolve(options.outputDir || 'reports/excel/create-user');
    this.filePrefix = options.filePrefix || 'Atlas_CreateUser';
    // a run (and the day) is "Passed" when MORE than this share of the executed test cases pass
    this.passThreshold = options.passThreshold === undefined ? 0.6 : options.passThreshold;
    this.tag = options.tag || 'createuser-reporter';   // console prefix (reporters extending this one pass their own)
    this.cases = new Map();
  }

  onBegin(config) {
    this.start = new Date();
    this.runId = process.env.RUN_ID || dateTime(this.start).replace(/\D/g, '');
    const p = config.projects.find(x => x.use && x.use.baseURL);
    this.baseURL = (p && p.use.baseURL) || '';
  }

  onTestEnd(test, result) {
    // Playwright lists runtime annotations on both the test and the result: keep each one once
    const seen = new Set();
    const annotations = [...test.annotations, ...(result.annotations || [])].filter(a => {
      const key = `${a.type}\u0000${a.description || ''}`;
      return seen.has(key) ? false : seen.add(key);
    });
    if (ann(annotations, 'Module') !== this.module) return;
    const outcome = test.outcome();   // expected | unexpected | flaky | skipped
    const resultText = outcome === 'skipped' ? 'Skipped' : outcome === 'unexpected' ? 'Fail' : 'Pass';
    const status = outcome === 'flaky' ? 'Completed after retry' : STATUS[result.status] || result.status;
    const error = stripAnsi(result.error && result.error.message).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3).join(' ').slice(0, 500);
    const skip = annotations.find(a => a.type === 'skip');
    const remarks = [
      resultText === 'Fail' ? error : '',
      resultText === 'Skipped' ? (skip && skip.description) || 'Skipped' : '',
      ...annAll(annotations, 'Observed'),
    ].filter(Boolean).join(' | ');
    const created = annAll(annotations, 'CreatedRecord').map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

    this.cases.set(test.id, {
      runId: this.runId,
      executedAt: dateTime(result.startTime ? new Date(result.startTime) : new Date()),
      id: ann(annotations, 'TestCaseNo') || test.title.split(' - ')[0],
      name: ann(annotations, 'TestCaseName') || test.title,
      type: ann(annotations, 'TestType') || 'Positive',
      description: ann(annotations, 'Description'),
      condition: ann(annotations, 'Condition'),
      expected: ann(annotations, 'ExpectedResult'),
      values: ann(annotations, 'TestValues'),
      url: ann(annotations, 'RecordURL'),
      result: resultText,
      status,
      durationMs: test.results.reduce((s, r) => s + r.duration, 0),
      remarks,
      created: resultText === 'Pass' ? created : [],
    });
  }

  async onEnd(fullResult) {
    const run = [...this.cases.values()];
    if (!run.length) return;
    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
      const date = dateOnly(this.start);
      const storeFile = path.join(this.outputDir, `day-store_${date}.json`);
      let store = { date, runs: [] };
      try { store = JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { /* first run of the day */ }

      const count = r => run.filter(x => x.result === r).length;
      const runInfo = {
        runId: this.runId,
        start: dateTime(this.start),
        durationMs: fullResult.duration,
        total: run.length, passed: count('Pass'), failed: count('Fail'), skipped: count('Skipped'),
        usersCreated: run.reduce((s, x) => s + x.created.length, 0),
        cases: run.sort((a, b) => a.id.localeCompare(b.id)),
      };
      store.runs = store.runs.filter(r => r.runId !== this.runId).concat(runInfo);
      fs.writeFileSync(storeFile, JSON.stringify(store, null, 2));

      const file = path.join(this.outputDir, `${this.filePrefix}_${date}.xlsx`);
      try {
        await this.buildWorkbook(store, runInfo).xlsx.writeFile(file);
        console.log(`[${this.tag}] ${file}`);
      } catch (e) {
        console.warn(`[${this.tag}] could not write ${file}: ${e.message} (close it in Excel; the data is kept in ${path.basename(storeFile)} and written on the next run)`);
      }
    } catch (e) {
      console.warn(`[${this.tag}] failed: ${e.stack || e.message}`);
    }
  }

  buildWorkbook(store, latest) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Atlas Playwright Framework';
    wb.created = new Date();
    this.summarySheet(wb, store, latest);
    this.testCasesSheet(wb, store);
    this.usersSheet(wb, store);
    return wb;
  }

  // ------------------------------------------------------------------ helpers
  /** 'Pass' when the pass rate (Passed / (Passed + Failed)) is greater than passThreshold; 'Skipped' when nothing ran. */
  verdict(passed, failed) {
    if (!(passed + failed)) return 'Skipped';
    return passed / (passed + failed) > this.passThreshold ? 'Pass' : 'Fail';
  }

  title(ws, text, cols) {
    ws.mergeCells(1, 1, 1, cols);
    const c = ws.getCell(1, 1);
    c.value = text;
    c.font = { bold: true, size: 15, color: { argb: WHITE } };
    c.fill = fill(NAVY);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;
  }

  headerRow(ws, rowNo, labels) {
    const row = ws.getRow(rowNo);
    labels.forEach((l, i) => {
      const c = row.getCell(i + 1);
      c.value = l;
      c.font = { bold: true, color: { argb: WHITE } };
      c.fill = fill(NAVY);
      c.border = border;
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    row.height = 22;
  }

  dataRow(ws, rowNo, values, { resultCol, wrap = true, zebra = false } = {}) {
    const row = ws.getRow(rowNo);
    values.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.border = border;
      c.alignment = { vertical: 'top', wrapText: wrap };
      if (zebra) c.fill = fill(GREY);
    });
    if (resultCol && RESULT_STYLE[values[resultCol - 1]]) {
      const [bg, fg] = RESULT_STYLE[values[resultCol - 1]];
      const c = row.getCell(resultCol);
      c.fill = fill(bg);
      c.font = { bold: true, color: { argb: fg } };
      c.alignment = { vertical: 'top', horizontal: 'center' };
    }
    return row;
  }

  section(ws, rowNo, text) {
    const c = ws.getCell(rowNo, 1);
    c.value = text;
    c.font = { bold: true, size: 13, color: { argb: NAVY } };
    return rowNo + 1;
  }

  // ------------------------------------------------------------------ Summary
  summarySheet(wb, store, latest) {
    const ws = wb.addWorksheet('Summary');
    ws.columns = [{ width: 30 }, { width: 46 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 14 }, { width: 14 }];
    this.title(ws, `Atlas Sandbox - Create User (Grant Access 62284) - Test Summary - ${store.date}`, 9);

    const all = store.runs.flatMap(r => r.cases);
    const dayTotal = all.length;
    const dayPass = all.filter(x => x.result === 'Pass').length;
    const dayFail = all.filter(x => x.result === 'Fail').length;
    const daySkip = all.filter(x => x.result === 'Skipped').length;
    const latestVerdict = this.verdict(latest.passed, latest.failed);
    const dayVerdict = this.verdict(dayPass, dayFail);
    const label = v => ({ Pass: 'PASSED', Fail: 'FAILED', Skipped: 'NOT EXECUTED' }[v]);
    const latestStatus = `${label(latestVerdict)}  (pass rate ${pct(latest.passed, latest.passed + latest.failed)})`;
    const criteria = `PASSED when more than ${Math.round(this.passThreshold * 100)}% of the executed test cases pass (Passed / (Passed + Failed); skipped cases are not counted)`;

    const info = [
      ['Use Case', '62284 Create User (Grant Access)'],
      ['Application URL', this.baseURL],
      ['Report Date', store.date],
      ['Latest Run ID', latest.runId],
      ['Latest Run Started', latest.start],
      ['Latest Run Duration', `${mmss(latest.durationMs)} (mm:ss)`],
      ['Pass Criteria', criteria],
      ['Latest Run Status', latestStatus],
      ['Latest Run - Test Cases', `${latest.total}  (Passed ${latest.passed}, Failed ${latest.failed}, Skipped ${latest.skipped})`],
      ['Latest Run - Pass Rate', pct(latest.passed, latest.passed + latest.failed)],
      ['Latest Run - Users Created', latest.usersCreated],
      ['Runs on this Date', store.runs.length],
      ['Test Cases Executed (day)', `${dayTotal}  (Passed ${dayPass}, Failed ${dayFail}, Skipped ${daySkip})`],
      ['Pass Rate (day)', pct(dayPass, dayPass + dayFail)],
      ['Overall Status (day)', `${label(dayVerdict)}  (pass rate ${pct(dayPass, dayPass + dayFail)})`],
      ['Users Created (day)', store.runs.reduce((s, r) => s + r.usersCreated, 0)],
    ];
    let row = 3;
    for (const [title, value] of info) {
      ws.mergeCells(row, 2, row, 9);
      const l = ws.getCell(row, 1);
      l.value = title;
      l.font = { bold: true };
      l.fill = fill(GREY);
      const v = ws.getCell(row, 2);
      v.value = value;
      v.alignment = { horizontal: 'left' };
      for (let col = 1; col <= 9; col++) ws.getCell(row, col).border = border;
      if (title === 'Latest Run Status' || title === 'Overall Status (day)') {
        const [bg, fg] = RESULT_STYLE[title === 'Latest Run Status' ? latestVerdict : dayVerdict];
        v.fill = fill(bg);
        v.font = { bold: true, color: { argb: fg } };
      }
      row++;
    }

    // Positive / Negative breakdown of the latest run
    row = this.section(ws, row + 1, 'Latest Run - Results by Test Type');
    this.headerRow(ws, row++, ['Test Type', 'Description', 'Total', 'Passed', 'Failed', 'Skipped', 'Pass Rate', 'Duration']);
    for (const type of ['Positive', 'Negative']) {
      const xs = latest.cases.filter(x => x.type === type);
      const p = xs.filter(x => x.result === 'Pass').length, f = xs.filter(x => x.result === 'Fail').length;
      this.dataRow(ws, row++, [type, type === 'Positive' ? 'Grant access / confirmation flow' : 'Validations and security checks (no user created)',
        xs.length, p, f, xs.filter(x => x.result === 'Skipped').length, pct(p, p + f), secs(xs.reduce((s, x) => s + x.durationMs, 0))]);
    }
    this.dataRow(ws, row, ['Total', '', latest.total, latest.passed, latest.failed, latest.skipped, pct(latest.passed, latest.passed + latest.failed),
      secs(latest.cases.reduce((s, x) => s + x.durationMs, 0))]).font = { bold: true };
    row++;

    // runs of the day
    row = this.section(ws, row + 1, `All Runs on ${store.date}`);
    this.headerRow(ws, row++, ['Run ID', 'Started', 'Total', 'Passed', 'Failed', 'Skipped', 'Pass Rate', 'Users Created', 'Duration', 'Run Status']);
    ws.getColumn(10).width = 14;
    for (const r of store.runs) {
      const v = this.verdict(r.passed, r.failed);
      this.dataRow(ws, row++, [r.runId, r.start, r.total, r.passed, r.failed, r.skipped, pct(r.passed, r.passed + r.failed), r.usersCreated,
        mmss(r.durationMs), { Pass: 'Passed', Fail: 'Failed', Skipped: 'Not Executed' }[v]], { resultCol: 10 });
      const [bg, fg] = RESULT_STYLE[v];
      const c = ws.getRow(row - 1).getCell(10);
      c.fill = fill(bg);
      c.font = { bold: true, color: { argb: fg } };
      ws.getRow(row - 1).getCell(1).fill = fill(bg);
    }

    // latest result per test case
    row = this.section(ws, row + 1, 'Latest Run - Result per Test Case');
    this.headerRow(ws, row++, ['TestCaseNo', 'TestCaseName', 'Type', 'Pass/Fail Result', 'Status', 'Duration']);
    latest.cases.forEach((x, i) => this.dataRow(ws, row++, [x.id, x.name, x.type, x.result, x.status, secs(x.durationMs)], { resultCol: 4, zebra: i % 2 === 1 }));
  }

  // ------------------------------------------------------------------ Test Cases (every run of the day)
  testCasesSheet(wb, store) {
    const ws = wb.addWorksheet('Test Cases', { views: [{ state: 'frozen', ySplit: 3 }] });
    const cols = [
      ['TestCaseNo', 13], ['TestCaseName', 38], ['Description', 55], ['Condition', 42], ['Test Values', 48],
      ['Pass/Fail Result', 13], ['Status', 16], ['Duration', 11], ['Type', 10], ['Expected Result', 48],
      ['Remarks / Observed', 55], ['Record URL', 40], ['Run ID', 17], ['Executed At', 20],
    ];
    ws.columns = cols.map(([, width]) => ({ width }));
    this.title(ws, `Create User (62284) - Test Cases - ${store.date}`, cols.length);
    this.headerRow(ws, 3, cols.map(([h]) => h));
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
    let row = 4;
    store.runs.slice().reverse().forEach((r, ri) => {   // latest run first
      for (const x of r.cases) {
        this.dataRow(ws, row++, [x.id, x.name, x.description, x.condition, x.values, x.result, x.status, secs(x.durationMs), x.type,
          x.expected, x.remarks, x.url, x.runId, x.executedAt], { resultCol: 6, zebra: ri % 2 === 1 });
      }
    });
  }

  // ------------------------------------------------------------------ Users Created (newly added test values)
  usersSheet(wb, store) {
    const ws = wb.addWorksheet('Users Created', { views: [{ state: 'frozen', ySplit: 3 }] });
    const cols = [
      ['#', 5], ['TestCaseNo', 13], ['Person', 30], ['Person ID', 10], ['Person Email', 44], ['Sign-in Email', 46],
      ['Sign-in Email Source', 18], ['Roles', 34], ['User Status', 26], ['Person URL', 48], ['Run ID', 17], ['Created At', 20],
    ];
    ws.columns = cols.map(([, width]) => ({ width }));
    this.title(ws, `Create User (62284) - Users Created in the Sandbox - ${store.date} (not cleaned up)`, cols.length);
    this.headerRow(ws, 3, cols.map(([h]) => h));
    let row = 4, n = 1;
    for (const r of store.runs) {
      for (const x of r.cases) {
        for (const rec of x.created) {
          const f = rec.fields || {};
          this.dataRow(ws, row++, [n++, x.id, f.Person || '', rec.recordId || '', f['Person Email'] || '', f['Sign-in Email'] || '',
            f['Sign-in Email Source'] || '', f.Roles || '', 'Disabled - activation email sent', rec.url || '', r.runId, x.executedAt]);
        }
      }
    }
    if (n === 1) ws.getCell(4, 1).value = 'No users created on this date yet.';
  }
}

// shared with the reporters that extend this one (reporters/serviceitem-reporter.js)
CreateUserReporter.helpers = { NAVY, WHITE, GREY, RESULT_STYLE, fill, border, secs, mmss, pct, ann, annAll };

module.exports = CreateUserReporter;
