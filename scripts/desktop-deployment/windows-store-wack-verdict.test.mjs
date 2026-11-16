import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  evaluateWackReportFiles,
  evaluateWackVerdict,
  parseWackReport,
} from './windows-store-wack-verdict.mjs';

const script = fileURLToPath(
  new URL('./windows-store-wack-verdict.mjs', import.meta.url)
);
const manifest =
  '<dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>' +
  '<dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>';
const dpiReceipt = [
  'processDpiQuerySucceeded=True',
  'processDpiAwareness=2',
  'windowPerMonitorV2=True',
].join('\n');

function report(overall, tests) {
  return `<REPORT OVERALL_RESULT="${overall}"><REQUIREMENTS>${tests.join('')}</REQUIREMENTS></REPORT>`;
}

function wackTest({ name, optional, result }) {
  return `<TEST INDEX="1" NAME="${name}" OPTIONAL="${optional}"><RESULT><![CDATA[${result}]]></RESULT></TEST>`;
}

const reviewedWarning = report('WARNING', [
  wackTest({ name: 'App manifest', optional: 'FALSE', result: 'PASS' }),
  wackTest({ name: 'Archive files usage', optional: 'TRUE', result: 'FAIL' }),
  wackTest({ name: 'Blocked executables', optional: 'TRUE', result: 'FAIL' }),
  wackTest({
    name: 'DPIAwarenessValidation',
    optional: 'FALSE',
    result: 'WARNING',
  }),
]);

test('parses CDATA results and only the REPORT overall attribute', () => {
  const parsed = parseWackReport(
    '<REPORT OVERALL_RESULT="WARNING"><TEST NAME="App manifest" OPTIONAL="FALSE"><RESULT><![CDATA[PASS]]></RESULT></TEST></REPORT>'
  );
  assert.equal(parsed.overall, 'WARNING');
  assert.deepEqual(parsed.tests, [
    { name: 'App manifest', optional: 'FALSE', results: ['PASS'] },
  ]);
});

test('accepts WARNING when the only required exception is reviewed DPI evidence', () => {
  const decision = evaluateWackVerdict({
    ...parseWackReport(reviewedWarning),
    manifestText: manifest,
    dpiText: dpiReceipt,
  });
  assert.equal(decision.accepted, true);
});

test('accepts WARNING when every required test passes and optional tests fail', () => {
  const decision = evaluateWackVerdict({
    ...parseWackReport(
      report('WARNING', [
        wackTest({ name: 'App manifest', optional: 'FALSE', result: 'PASS' }),
        wackTest({
          name: 'Archive files usage',
          optional: 'TRUE',
          result: 'FAIL',
        }),
      ])
    ),
    manifestText: '',
    dpiText: '',
  });
  assert.equal(decision.accepted, true);
});

test('rejects a required FAIL even when DPI evidence is present', () => {
  const decision = evaluateWackVerdict({
    ...parseWackReport(
      report('WARNING', [
        wackTest({ name: 'App manifest', optional: 'FALSE', result: 'FAIL' }),
        wackTest({
          name: 'DPIAwarenessValidation',
          optional: 'FALSE',
          result: 'WARNING',
        }),
      ])
    ),
    manifestText: manifest,
    dpiText: dpiReceipt,
  });
  assert.equal(decision.accepted, false);
  assert.match(decision.reason, /Required WACK test failed: App manifest/);
});

test('rejects a required warning outside the DPI allowlist', () => {
  const decision = evaluateWackVerdict({
    ...parseWackReport(
      report('WARNING', [
        wackTest({
          name: 'App manifest',
          optional: 'FALSE',
          result: 'WARNING',
        }),
      ])
    ),
    manifestText: manifest,
    dpiText: dpiReceipt,
  });
  assert.equal(decision.accepted, false);
  assert.match(decision.reason, /outside the allowlist/);
});

test('rejects the DPI warning without both manifest declarations and the companion receipt', () => {
  for (const evidence of [
    { manifestText: manifest.replace('true/pm', 'true'), dpiText: dpiReceipt },
    {
      manifestText: manifest.replace('PerMonitorV2', 'unaware'),
      dpiText: dpiReceipt,
    },
    {
      manifestText: manifest,
      dpiText: dpiReceipt.replace(
        'processDpiAwareness=2',
        'processDpiAwareness=0'
      ),
    },
    {
      manifestText: manifest,
      dpiText: dpiReceipt.replace(
        'windowPerMonitorV2=True',
        'windowPerMonitorV2=False'
      ),
    },
    { manifestText: '', dpiText: '' },
  ]) {
    const decision = evaluateWackVerdict({
      ...parseWackReport(reviewedWarning),
      ...evidence,
    });
    assert.equal(decision.accepted, false, JSON.stringify(evidence));
  }
});

test('fails closed on missing, duplicated, or malformed verdicts', () => {
  const cases = [
    '<REPORT><TEST NAME="App manifest" OPTIONAL="FALSE"><RESULT>PASS</RESULT></TEST></REPORT>',
    '<REPORT OVERALL_RESULT="WARNING" OVERALL_RESULT="PASS"><TEST NAME="App manifest" OPTIONAL="FALSE"><RESULT>PASS</RESULT></TEST></REPORT>',
    report('UNKNOWN', [
      wackTest({ name: 'App manifest', optional: 'FALSE', result: 'PASS' }),
    ]),
    '<REPORT OVERALL_RESULT="WARNING"><TEST NAME="App manifest"><RESULT>PASS</RESULT></TEST></REPORT>',
    report('WARNING', ['<TEST NAME="App manifest" OPTIONAL="FALSE"></TEST>']),
    report('FAIL', [
      wackTest({ name: 'App manifest', optional: 'FALSE', result: 'PASS' }),
    ]),
    '<REPORT OVERALL_RESULT="WARNING"></REPORT>',
  ];
  for (const xml of cases) {
    const parsed = parseWackReport(xml);
    const decision = parsed.error
      ? { accepted: false, reason: parsed.error }
      : evaluateWackVerdict(parsed);
    assert.equal(decision.accepted, false, xml);
  }
});

test('command rejects a required failure and accepts the reviewed warning from files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tuturuuu-wack-verdict-'));
  try {
    const reportPath = join(directory, 'wack.xml');
    await writeFile(reportPath, reviewedWarning);
    await writeFile(join(directory, 'embedded-executable.manifest'), manifest);
    await writeFile(join(directory, 'dpi-awareness.txt'), dpiReceipt);
    const accepted = spawnSync(
      process.execPath,
      [script, '--report', reportPath, '--report-directory', directory],
      { encoding: 'utf8' }
    );
    assert.equal(accepted.status, 0, accepted.stderr);
    await writeFile(
      reportPath,
      report('WARNING', [
        wackTest({ name: 'App manifest', optional: 'FALSE', result: 'FAIL' }),
      ])
    );
    const rejected = spawnSync(
      process.execPath,
      [script, '--report', reportPath, '--report-directory', directory],
      { encoding: 'utf8' }
    );
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Required WACK test failed/);
    const fromFiles = evaluateWackReportFiles({
      reportPath,
      reportDirectory: directory,
    });
    assert.equal(fromFiles.accepted, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
