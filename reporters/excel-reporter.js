// Playwright custom reporter -> Excel execution report (Atlas_TestReport.xlsx + a dated copy).
//
// Sheets: Summary | Records Created <date> | Test Cases | Failed Test Cases | Person Test Data |
//         Company Test Data | Run History
//
// Test-case metadata comes from the annotations written by utils/testCase.js (tcDetails / recordCreated):
//   TestCaseNo, TestCaseName, Description, Condition, ExpectedResult, TestType, Module, TestValues, CreatedRecord.
// "Results by ..." tables show the LATEST result of every test case ever run (kept in history-store.json), so a
// partial run (e.g. only Person specs) does not erase the results of the other modules.
//
// Options: { outputDir: 'reports/excel', fileName: 'Atlas_TestReport.xlsx' }

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const NAVY = 'FF1F4E78';
const GREEN = 'FFC6EFCE', GREEN_TXT = 'FF006100';
const RED = 'FFFFC7CE', RED_TXT = 'FF9C0006';
const YELLOW = 'FFFFEB9C';
const SKIP_PROJECTS = new Set(['setup', 'mobile']);

const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const dateOnly = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateTime = d => `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const mmss = ms => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
const stripAnsi = s => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function annotation(test, type) {
  const a = test.annotations.find(x => x.type === type);
  return a ? a.description || '' : '';
}

class ExcelReporter {
  constructor(options = {}) {
    this.outputDir = path.resolve(options.outputDir || 'reports/excel');
    this.fileName = options.fileName || 'Atlas_TestReport.xlsx';
    this.cases = new Map();      // test.id -> collected data of the last attempt
  }

  onBegin(config) {
    this.start = new Date();
    this.runId = process.env.RUN_ID || stamp(this.start);
    this.baseURL = (config.projects[0] && config.projects[0].use && config.projects[0].use.baseURL) || '';
  }

  onTestEnd(test, result) {
    const project = test.parent.project() && test.parent.project().name;
    if (SKIP_PROJECTS.has(project)) return;
    const file = path.basename(test.location.file);
    const id = annotation(test, 'TestCaseNo') || (test.title.match(/\bTC[_-][A-Za-z0-9_-]+/) || [])[0] || test.title;
    const outcome = test.outcome();
    const status = outcome === 'skipped' ? 'Skip' : outcome === 'unexpected' ? 'Fail' : 'Pass';
    const skip = test.annotations.find(a => a.type === 'skip');
    const error = stripAnsi(result.error && result.error.message).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 400);
    const created = test.annotations.filter(a => a.type === 'CreatedRecord').map(a => { try { return JSON.parse(a.description); } catch { return null; } }).filter(Boolean);
    const module = annotation(test, 'Module') || (/signIn/i.test(file) ? 'Login' : /createTask/i.test(file) ? 'Task' : test.parent.title || 'Other');
    this.cases.set(test.id, {
      id,
      name: annotation(test, 'TestCaseName') || test.title.replace(/^TC[_A-Za-z0-9-]+\s*-\s*/, ''),
      module,
      type: annotation(test, 'TestType') || (/negative/i.test(test.title) ? 'Negative' : 'Positive'),
      severity: (test.annotations.find(a => a.type === 'severity') || {}).description || '',
      description: annotation(test, 'Description'),
      condition: annotation(test, 'Condition'),
      expected: annotation(test, 'ExpectedResult'),
      values: annotation(test, 'TestValues'),
      url: annotation(test, 'RecordURL') || (created[0] && created[0].url) || '',
      status,
      actual: status === 'Fail' ? error : status === 'Skip' ? (skip && skip.description) || 'Skipped' : '',
      durationMs: test.results.reduce((s, r) => s + r.duration, 0),
      runId: this.runId,
      created,
    });
  }

  async onEnd(result) {
    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
      const end = new Date();
      const storeFile = path.join(this.outputDir, 'history-store.json');
      let store = { runs: [], latest: {}, persons: [], companies: [] };
      try { store = { ...store, ...JSON.parse(fs.readFileSync(storeFile, 'utf8')) }; } catch { /* first run */ }

      const run = [...this.cases.values()];
      if (!run.length) return;
      const count = s => run.filter(c => c.status === s).length;
      const records = run.flatMap(c => c.created.map(r => ({ ...r, runId: this.runId })));
      const persons = records.filter(r => r.module === 'Person');
      const companies = records.filter(r => r.module === 'Company');

      // merge this run into the store
      for (const c of run) store.latest[c.id] = { ...c, created: undefined };
      store.persons.push(...persons);
      store.companies.push(...companies);
      const passed = count('Pass'), failed = count('Fail'), skipped = count('Skip');
      const runInfo = {
        runId: this.runId, start: this.start.toISOString(), durationMs: result.duration,
        status: failed ? 'failed' : 'passed', total: run.length, passed, failed, skipped,
        passRate: passed + failed ? passed / (passed + failed) : 0,
        testTimeMs: run.reduce((s, c) => s + c.durationMs, 0),
        personsCreated: persons.length, companiesCreated: companies.length,
      };
      store.runs = store.runs.filter(r => r.runId !== this.runId).concat(runInfo);
      fs.writeFileSync(storeFile, JSON.stringify(store, null, 2));

      const wb = this.buildWorkbook({ runInfo, store, records, end });
      const dated = this.fileName.replace(/\.xlsx$/i, `_${dateOnly(this.start)}.xlsx`);
      for (const name of [this.fileName, dated]) {
        try { await wb.xlsx.writeFile(path.join(this.outputDir, name)); }
        catch (e) { console.warn(`[excel-reporter] could not write ${name}: ${e.message} (close it in Excel and re-run)`); }
      }
      console.log(`[excel-reporter] ${path.join(this.outputDir, this.fileName)}`);
    } catch (e) {
      console.warn(`[excel-reporter] failed: ${e.stack || e.message}`);
    }
  }

  buildWorkbook({ runInfo, store, records, end }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Atlas Playwright Framework';
    const latest = Object.values(store.latest).sort((a, b) => a.id.localeCompare(b.id));

    this.summarySheet(wb, runInfo, store, latest);
    this.recordsSheet(wb, records);
    this.testCasesSheet(wb, 'Test Cases', latest, null);
    this.testCasesSheet(wb, 'Failed Test Cases', latest.filter(c => c.status === 'Fail'), 'FFC00000');
    this.dataSheet(wb, 'Person Test Data', store.persons);
    this.dataSheet(wb, 'Company Test Data', store.companies);
    this.historySheet(wb, store.runs);
    return wb;
  }

  // ---------------------------------------------------------------- Summary
  summarySheet(wb, runInfo, store, latest) {
    const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: true }] });
    ws.columns = [{ width: 30 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 14 }];
    const date = dateOnly(this.start);

    ws.mergeCells('A1:G1');
    const t = ws.getCell('A1');
    t.value = `Atlas Sandbox - Playwright Test Execution Summary - ${date}`;
    t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    t.fill = fill(NAVY);
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    const totalPersons = store.runs.reduce((s, r) => s + (r.personsCreated || 0), 0);
    const totalCompanies = store.runs.reduce((s, r) => s + (r.companiesCreated || 0), 0);
    const info = [
      ['Run ID', runInfo.runId],
      ['Application URL', this.baseURL],
      ['Executed On', dateTime(this.start)],
      ['Total Run Duration', `${mmss(runInfo.durationMs)} (mm:ss)`],
      ['Overall Run Status', runInfo.status.toUpperCase()],
      ['Tests Executed (this run)', `${runInfo.total}  (Passed ${runInfo.passed}, Failed ${runInfo.failed}, Skipped ${runInfo.skipped})`],
      ['Persons Created (this run)', runInfo.personsCreated],
      ['Companies Created (this run)', runInfo.companiesCreated],
      ['Persons Created (all runs)', totalPersons],
      ['Companies Created (all runs)', totalCompanies],
    ];
    info.forEach(([label, value], i) => {
      const r = 3 + i;
      ws.mergeCells(`B${r}:G${r}`);
      ws.getCell(`A${r}`).value = label;
      ws.getCell(`A${r}`).font = { bold: true };
      const v = ws.getCell(`B${r}`);
      v.value = value;
      v.alignment = { horizontal: 'left' };
      for (const col of 'ABCDEFG') ws.getCell(`${col}${r}`).border = border;
      if (label === 'Overall Run Status') {
        const ok = runInfo.status === 'passed';
        for (const col of 'BCDEFG') ws.getCell(`${col}${r}`).fill = fill(ok ? GREEN : RED);
        v.font = { bold: true, color: { argb: ok ? GREEN_TXT : RED_TXT } };
      }
    });

    let row = 3 + info.length + 1;
    const sectionTitle = text => {
      const c = ws.getCell(`A${row}`);
      c.value = text;
      c.font = { bold: true, size: 13, color: { argb: NAVY } };
      row++;
    };
    const header = (cells) => {
      cells.forEach(([col, text, to]) => {
        if (to) ws.mergeCells(`${col}${row}:${to}${row}`);
        const c = ws.getCell(`${col}${row}`);
        c.value = text;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        const last = to || col;
        for (const k of 'ABCDEFG') if (k >= col && k <= last) ws.getCell(`${k}${row}`).fill = fill(NAVY);
      });
      ws.getRow(row).height = 22;
      row++;
    };

    const statsRows = (groups) => groups.forEach(g => this.statsRow(ws, row++, g.label, g.items));
    const group = (keyFn, sortFn) => {
      const map = new Map();
      for (const c of latest) {
        const k = keyFn(c);
        if (!map.has(k)) map.set(k, { label: k, first: c.id, items: [] });
        const g = map.get(k);
        g.items.push(c);
        if (c.id < g.first) g.first = c.id;
      }
      return [...map.values()].sort(sortFn);
    };
    const byFirstId = (a, b) => a.first.localeCompare(b.first);
    const statHeader = first => header([['A', first], ['B', 'Total'], ['C', 'Passed'], ['D', 'Failed'], ['E', 'Skipped'], ['F', 'Pass %'], ['G', 'Duration']]);

    sectionTitle('Results by Module (latest result of every test case)');
    statHeader('Module');
    statsRows(group(c => c.module, byFirstId));
    this.statsRow(ws, row++, 'TOTAL', latest, true);
    row++;

    sectionTitle('Results by Test Type');
    statHeader('Test Type');
    statsRows(group(c => c.type, (a, b) => (a.label === 'Positive' ? -1 : b.label === 'Positive' ? 1 : a.label.localeCompare(b.label))));
    this.statsRow(ws, row++, 'TOTAL', latest, true);
    row++;

    sectionTitle('Results by Module and Test Type');
    statHeader('Module / Type');
    statsRows(group(c => `${c.module} - ${c.type}`, (a, b) => {
      const ma = a.label.split(' - ')[0], mb = b.label.split(' - ')[0];
      if (ma !== mb) return byFirstId(
        { first: group(c => c.module, byFirstId).find(g => g.label === ma).first },
        { first: group(c => c.module, byFirstId).find(g => g.label === mb).first });
      return a.label.endsWith('Positive') ? -1 : 1;
    }));
    this.statsRow(ws, row++, 'TOTAL', latest, true);
    row++;

    const failed = latest.filter(c => c.status === 'Fail');
    sectionTitle(`Failed Test Cases (${failed.length}) - details in the "Failed Test Cases" sheet`);
    header([['A', 'TestCaseNo'], ['B', 'Actual Result', 'F'], ['G', 'Module']]);
    for (const c of failed) {
      ws.mergeCells(`B${row}:F${row}`);
      ws.getCell(`A${row}`).value = c.id;
      ws.getCell(`A${row}`).fill = fill(RED);
      ws.getCell(`B${row}`).value = c.actual;
      ws.getCell(`G${row}`).value = c.module;
      for (const k of 'ABCDEFG') {
        const cell = ws.getCell(`${k}${row}`);
        cell.border = border;
        cell.alignment = { wrapText: true, vertical: 'top' };
      }
      ws.getRow(row).height = Math.max(30, Math.ceil((c.actual || '').length / 85) * 15);
      row++;
    }
    row++;

    sectionTitle('Test Case Results (latest; see Test Cases sheet for details)');
    header([['A', 'TestCaseNo'], ['B', 'TestCaseName', 'E'], ['F', 'Result'], ['G', 'Test Type']]);
    for (const c of latest) {
      ws.mergeCells(`B${row}:E${row}`);
      ws.getCell(`A${row}`).value = c.id;
      ws.getCell(`B${row}`).value = c.name;
      const res = ws.getCell(`F${row}`);
      res.value = c.status;
      res.alignment = { horizontal: 'center' };
      res.font = { bold: true, color: { argb: c.status === 'Pass' ? GREEN_TXT : c.status === 'Fail' ? RED_TXT : 'FF9C5700' } };
      res.fill = fill(c.status === 'Pass' ? GREEN : c.status === 'Fail' ? RED : YELLOW);
      const ty = ws.getCell(`G${row}`);
      ty.value = c.type;
      ty.alignment = { horizontal: 'center' };
      for (const k of 'ABCDEFG') ws.getCell(`${k}${row}`).border = border;
      row++;
    }
  }

  statsRow(ws, r, label, items, bold = false) {
    const p = items.filter(c => c.status === 'Pass').length;
    const f = items.filter(c => c.status === 'Fail').length;
    const s = items.filter(c => c.status === 'Skip').length;
    const secs = items.reduce((x, c) => x + c.durationMs, 0) / 1000;
    const values = [label, items.length, p, f, s, p + f ? p / (p + f) : 0, secs];
    values.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      cell.border = border;
      if (i > 0) cell.alignment = { horizontal: 'center' };
      if (bold) cell.font = { bold: true };
    });
    ws.getCell(r, 6).numFmt = '0.0%';
    ws.getCell(r, 7).numFmt = '0.00" s"';
    if (p) ws.getCell(r, 3).fill = fill(GREEN);
    if (f) ws.getCell(r, 4).fill = fill(RED);
    if (s) ws.getCell(r, 5).fill = fill(YELLOW);
  }

  // ------------------------------------------------------------ detail sheets
  styleHeader(ws, row = 1) {
    ws.getRow(row).eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = fill(NAVY);
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = border;
    });
    ws.getRow(row).height = 24;
  }

  recordsSheet(wb, records) {
    const ws = wb.addWorksheet(`Records Created ${dateOnly(this.start)}`, { properties: { tabColor: { argb: 'FF00B050' } } });
    ws.columns = [
      { header: 'Module', key: 'module', width: 16 }, { header: 'TestCaseNo', key: 'tc', width: 14 },
      { header: 'Test Type', key: 'type', width: 11 }, { header: 'Record ID', key: 'id', width: 11 },
      { header: 'URL', key: 'url', width: 55 }, { header: 'Values', key: 'fields', width: 70 },
    ];
    this.styleHeader(ws);
    for (const r of records) {
      const row = ws.addRow({
        module: r.module, tc: r.testCaseNo, type: r.testType, id: r.recordId,
        url: r.url ? { text: r.url, hyperlink: r.url } : '',
        fields: Object.entries(r.fields || {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
      });
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell(c => { c.border = border; });
      if (r.url) row.getCell('url').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (records.length) ws.autoFilter = { from: 'A1', to: 'F1' };
  }

  testCasesSheet(wb, name, cases, tabColor) {
    const ws = wb.addWorksheet(name, tabColor ? { properties: { tabColor: { argb: tabColor } } } : {});
    ws.columns = [
      { header: 'TestCaseNo', key: 'id', width: 14 }, { header: 'TestCaseName', key: 'name', width: 48 },
      { header: 'Module', key: 'module', width: 16 }, { header: 'Test Type', key: 'type', width: 11 },
      { header: 'Severity', key: 'severity', width: 10 }, { header: 'Description', key: 'description', width: 55 },
      { header: 'Condition', key: 'condition', width: 40 }, { header: 'Test Values', key: 'values', width: 45 },
      { header: 'Expected Result', key: 'expected', width: 50 }, { header: 'Actual Result', key: 'actual', width: 55 },
      { header: 'Result', key: 'status', width: 9 }, { header: 'Duration (s)', key: 'secs', width: 12 },
      { header: 'Run ID', key: 'runId', width: 17 }, { header: 'URL', key: 'url', width: 50 },
    ];
    this.styleHeader(ws);
    for (const c of cases) {
      const row = ws.addRow({ ...c, secs: Math.round(c.durationMs / 10) / 100, url: c.url ? { text: c.url, hyperlink: c.url } : '' });
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell(cell => { cell.border = border; });
      const res = row.getCell('status');
      res.alignment = { horizontal: 'center', vertical: 'top' };
      res.font = { bold: true, color: { argb: c.status === 'Pass' ? GREEN_TXT : c.status === 'Fail' ? RED_TXT : 'FF9C5700' } };
      res.fill = fill(c.status === 'Pass' ? GREEN : c.status === 'Fail' ? RED : YELLOW);
      if (c.url) row.getCell('url').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
    if (cases.length) ws.autoFilter = { from: 'A1', to: 'N1' };
  }

  dataSheet(wb, name, records) {
    const ws = wb.addWorksheet(name);
    const keys = [];
    for (const r of records) for (const k of Object.keys(r.fields || {})) if (!keys.includes(k)) keys.push(k);
    ws.columns = [
      { header: 'Run ID', key: 'runId', width: 17 }, { header: 'TestCaseNo', key: 'tc', width: 14 },
      { header: 'Test Type', key: 'type', width: 11 }, { header: 'Record ID', key: 'id', width: 11 },
      { header: 'URL', key: 'url', width: 50 },
      ...keys.map(k => ({ header: k, key: `f_${k}`, width: 24 })),
    ];
    this.styleHeader(ws);
    for (const r of records) {
      const row = ws.addRow({
        runId: r.runId, tc: r.testCaseNo, type: r.testType, id: r.recordId,
        url: r.url ? { text: r.url, hyperlink: r.url } : '',
        ...Object.fromEntries(keys.map(k => [`f_${k}`, (r.fields || {})[k] || ''])),
      });
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell(c => { c.border = border; });
      if (r.url) row.getCell('url').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  historySheet(wb, runs) {
    const ws = wb.addWorksheet('Run History');
    ws.columns = [
      { header: 'Run ID', key: 'runId', width: 18 }, { header: 'Start', key: 'start', width: 20 },
      { header: 'Duration (mm:ss)', key: 'dur', width: 16 }, { header: 'Status', key: 'status', width: 10 },
      { header: 'Total', key: 'total', width: 8 }, { header: 'Passed', key: 'passed', width: 9 },
      { header: 'Failed', key: 'failed', width: 9 }, { header: 'Skipped', key: 'skipped', width: 9 },
      { header: 'Pass %', key: 'rate', width: 9 }, { header: 'Test Time (s)', key: 'tt', width: 13 },
      { header: 'Persons Created', key: 'p', width: 15 }, { header: 'Companies Created', key: 'c', width: 17 },
    ];
    this.styleHeader(ws);
    for (const r of [...runs].reverse()) {
      const row = ws.addRow({
        runId: r.runId, start: dateTime(new Date(r.start)), dur: mmss(r.durationMs), status: r.status.toUpperCase(),
        total: r.total, passed: r.passed, failed: r.failed, skipped: r.skipped, rate: r.passRate,
        tt: Math.round(r.testTimeMs / 10) / 100, p: r.personsCreated, c: r.companiesCreated,
      });
      row.eachCell(c => { c.border = border; c.alignment = { horizontal: 'center' }; });
      row.getCell('rate').numFmt = '0.0%';
      const st = row.getCell('status');
      st.fill = fill(r.status === 'passed' ? GREEN : RED);
      st.font = { bold: true, color: { argb: r.status === 'passed' ? GREEN_TXT : RED_TXT } };
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
}

module.exports = ExcelReporter;
