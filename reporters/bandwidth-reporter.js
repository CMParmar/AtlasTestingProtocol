// Prints a bandwidth summary after the run and writes reports/bandwidth/bandwidth.csv.
// Data comes from the 'bandwidth' annotation added by the auto fixture in fixtures/pages.fixture.js.
const fs = require('fs');
const path = require('path');

class BandwidthReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || 'reports/bandwidth';
    this.rows = [];
    this.startTime = Date.now();
  }

  onBegin() {
    this.startTime = Date.now();
  }

  onTestEnd(test, result) {
    const a = test.annotations.find(x => x.type === 'bandwidth');
    if (!a) return;
    try {
      const d = JSON.parse(a.description);
      this.rows.push({ file: path.basename(test.location.file), title: test.title, status: result.status, retry: result.retry, durationSec: result.duration / 1000, ...d });
    } catch { /* ignore */ }
  }

  onEnd() {
    if (!this.rows.length) return;
    const total = k => this.rows.reduce((s, r) => s + r[k], 0);
    const mbps = (kb, sec) => (sec > 0 ? (kb * 1024 * 8) / 1e6 / sec : 0);
    const runSec = (Date.now() - this.startTime) / 1000;
    const totalKB = total('receivedKB') + total('sentKB');
    const totalMbps = mbps(totalKB, runSec);
    const top = [...this.rows].sort((a, b) => b.receivedKB - a.receivedKB).slice(0, 10);

    console.log('\n=== Bandwidth summary (browser traffic) ===');
    console.log(`Tests measured : ${this.rows.length}`);
    console.log(`Received       : ${(total('receivedKB') / 1024).toFixed(2)} MB`);
    console.log(`Sent           : ${(total('sentKB') / 1024).toFixed(2)} MB`);
    console.log(`Requests       : ${total('requests')}`);
    console.log(`Run time       : ${runSec.toFixed(1)} s`);
    console.log(`Total Mbps used: ${totalMbps.toFixed(3)} Mbps (average over the whole run)`);
    console.log('Top 10 tests by data received:');
    top.forEach(r => console.log(`  ${String(r.receivedKB).padStart(9)} KB  ${r.file} > ${r.title}`));

    fs.mkdirSync(this.outputDir, { recursive: true });
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ['file,test,status,retry,receivedKB,sentKB,requests,durationSec,Mbps',
      ...this.rows.map(r => [esc(r.file), esc(r.title), r.status, r.retry, r.receivedKB, r.sentKB, r.requests,
        r.durationSec.toFixed(1), mbps(r.receivedKB + r.sentKB, r.durationSec).toFixed(3)].join(',')),
      // Total Mbps = all bits sent + received / wall-clock run time (so parallel workers add up)
      [esc('TOTAL'), esc(`${this.rows.length} tests`), '', '', total('receivedKB').toFixed(1), total('sentKB').toFixed(1),
        total('requests'), runSec.toFixed(1), totalMbps.toFixed(3)].join(',')].join('\n');
    let file = path.join(this.outputDir, 'bandwidth.csv');
    try {
      fs.writeFileSync(file, csv);
    } catch (e) {
      // Usually the CSV is open in Excel (locked): keep the data in a timestamped copy instead of crashing.
      file = path.join(this.outputDir, `bandwidth-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
      fs.writeFileSync(file, csv);
      console.log(`bandwidth.csv is locked (${e.code}); wrote a copy instead.`);
    }
    console.log(`Full list      : ${file}\n`);

    // GitHub Actions: show the same summary on the job's summary page
    if (process.env.GITHUB_STEP_SUMMARY) {
      const label = process.env.BW_LABEL ? ` (${process.env.BW_LABEL})` : '';
      const md = [
        `### Bandwidth${label}`,
        '| Metric | Value |', '|---|---|',
        `| Tests measured | ${this.rows.length} |`,
        `| Received | ${(total('receivedKB') / 1024).toFixed(2)} MB |`,
        `| Sent | ${(total('sentKB') / 1024).toFixed(2)} MB |`,
        `| Requests | ${total('requests')} |`,
        `| Run time | ${runSec.toFixed(1)} s |`,
        `| **Total Mbps used** | **${totalMbps.toFixed(3)} Mbps** |`,
        '', '**Top 10 tests by data received**', '',
        '| KB received | Test |', '|---:|---|',
        ...top.map(r => `| ${r.receivedKB} | ${r.file} > ${r.title.replace(/\|/g, '\\|')} |`), '', '',
      ].join('\n');
      try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md); } catch { /* ignore */ }
    }
  }
}

module.exports = BandwidthReporter;
