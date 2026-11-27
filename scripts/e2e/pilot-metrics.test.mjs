import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const moduleUrl = new URL('./pilot-metrics.mjs', import.meta.url);
const sha = 'a'.repeat(40);
const date = '2026-11-27T01:00:00+07:00';
const asOf = '2026-12-11';
const schema = '../scripts/e2e/pilot-maintenance-log.schema.json';

test('Playwright JSON preserves retries, projects, nested titles and wall time', async () => {
  const { parsePlaywrightJson } = await import(moduleUrl);
  const report = parsePlaywrightJson({
    stats: { duration: 2000 },
    suites: [
      {
        title: 'test.spec.ts',
        suites: [
          {
            title: 'group',
            specs: [
              {
                title: 'case',
                file: 'test.spec.ts',
                tests: [
                  { projectName: 'chromium', status: 'flaky' },
                  { projectName: 'webkit', status: 'expected' },
                  { projectName: 'mobile', status: 'unexpected' },
                  { projectName: 'firefox', status: 'skipped' },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(report.durationMs, 2000);
  assert.equal(report.modelCalls, 0);
  assert.deepEqual(
    report.tests.map(({ id, status }) => [id, status]),
    [
      ['test.spec.ts / chromium / group / case', 'flaky'],
      ['test.spec.ts / webkit / group / case', 'passed'],
      ['test.spec.ts / mobile / group / case', 'failed'],
      ['test.spec.ts / firefox / group / case', 'skipped'],
    ]
  );
});

test('JUnit handles escaping, projects, retry tags, error, skip and embedded XML-like output', async () => {
  const { parseJUnit } = await import(moduleUrl);
  const report = parseJUnit(
    `<?xml version="1.0"?>
    <testsuites time="1.25"><testsuite name="test.spec.ts" hostname="webkit">
    <testcase classname="test.spec.ts" name="retry &amp; &gt; &#x41;">
      <flakyFailure/><system-out><![CDATA[<failure/>]]></system-out>
    </testcase><testcase name='error'><error message="a > b"/></testcase>
    <testcase name="skip"><skipped/></testcase>
    <testcase name="pass"/>
    </testsuite></testsuites>`,
    'playwright'
  );
  assert.equal(report.durationMs, 1250);
  assert.equal(report.tests[0].id, 'test.spec.ts / webkit / retry & > A');
  assert.deepEqual(
    report.tests.map(({ status }) => status),
    ['flaky', 'failed', 'skipped', 'passed']
  );
  assert.throws(
    () =>
      parseJUnit('<testsuite><testcase name="lost"></testsuite>', 'playwright'),
    /JUnit/
  );
  const e2e = parseJUnit(
    '<testsuites time="10"><testsuite name="file"><testcase name="test"><system-out>flaky: 2 failed attempts before passing</system-out></testcase></testsuite></testsuites>',
    'e2e'
  );
  assert.equal(e2e.durationMs, null);
  assert.equal(e2e.modelCalls, null);
  assert.equal(e2e.tests[0].status, 'flaky');
});

function e2eReport(calls = 0) {
  return {
    schemaVersion: 'report-1',
    run: {
      startedAt: date,
      finishedAt: '2026-11-27T01:00:02+07:00',
      environment: { ci: true },
      usage: { maxModelCallsInStep: calls },
      errors: [],
      results: [
        {
          testId: 'a',
          file: 'spec.e2e.ts',
          titlePath: ['group', 'case'],
          targetId: 'chromium',
          agent: 'default',
          status: 'flaky',
          selected: true,
          serialGroupId: 'serial',
          attempts: [],
        },
        {
          testId: 'b',
          file: 'spec.e2e.ts',
          titlePath: ['left out'],
          targetId: 'chromium',
          agent: 'default',
          status: 'skipped',
          selected: false,
          attempts: [],
        },
      ],
      serialGroups: [
        {
          id: 'serial',
          attempts: [0, 1].map(() => ({
            members: [
              { testId: 'a', steps: [{ metrics: { modelCalls: calls } }] },
            ],
          })),
        },
      ],
    },
  };
}

test('e2e report-1 counts every serial retry without duplicating attempts', async () => {
  const { parseE2eJson } = await import(moduleUrl);
  assert.deepEqual(parseE2eJson(e2eReport(2)), {
    durationMs: 2000,
    modelCalls: 4,
    runErrors: 0,
    tests: [
      {
        id: 'spec.e2e.ts / chromium / group / case',
        status: 'flaky',
        modelCalls: 4,
      },
    ],
  });
  const inconsistent = e2eReport();
  inconsistent.run.usage.maxModelCallsInStep = 1;
  assert.throws(() => parseE2eJson(inconsistent), /model.call/i);
});

function snapshot(framework, index = 0, extra = {}) {
  return {
    suite: 'hall',
    runId: String(index),
    timestamp: date,
    framework,
    commitSha: sha,
    ci: true,
    durationMs: 100,
    modelCalls: 0,
    runErrors: 0,
    tests: [{ id: 'test', status: 'passed', modelCalls: 0 }],
    ...extra,
  };
}

function maintenance(framework, minutesToFix, extra = {}) {
  return {
    suite: 'hall',
    framework,
    failureCategory: 'ui-change-false-failure',
    minutesToFix,
    commitSha: sha,
    recordedAt: date,
    notes: 'Record the updated screen.',
    ...extra,
  };
}

const paired = Array.from({ length: 10 }, (_, index) => [
  snapshot('playwright', index),
  snapshot('e2e', index),
]).flat();

test('rolling history deduplicates exact snapshots and detects conflicts', async () => {
  const { mergeHistory, parseHistory, summarizePilot } = await import(
    moduleUrl
  );
  assert.deepEqual(
    mergeHistory(
      parseHistory(JSON.stringify(paired)),
      parseHistory(paired.map((run) => JSON.stringify(run)).join('\n'))
    ),
    paired.map((run) => ({ ...run, timestamp: new Date(date).toISOString() }))
  );
  assert.throws(
    () => mergeHistory([paired[0]], [{ ...paired[0], modelCalls: 1 }]),
    /conflict/i
  );
  const old = snapshot('e2e', 20, { timestamp: '2026-11-26T23:59:59+07:00' });
  const future = snapshot('e2e', 21, {
    timestamp: '2026-12-11T00:00:01+07:00',
  });
  const summary = summarizePilot([...paired, old, future], [], { asOf });
  assert.equal(summary.aggregate.e2e.runs, 10);
  assert.equal(summary.aggregate.combined.runs, 20);
});

test('flakes count retry-passes and failing observations on a mixed unchanged SHA', async () => {
  const { summarizePilot } = await import(moduleUrl);
  const statuses = ['passed', 'failed', 'flaky', 'failed', 'skipped'];
  const runs = statuses.map((status, index) =>
    snapshot('e2e', index, {
      commitSha: index < 3 ? sha : 'b'.repeat(40),
      tests: [{ id: 'test', status, modelCalls: index }],
      modelCalls: index,
      durationMs: index * 100,
    })
  );
  const summary = summarizePilot(runs, [], { asOf });
  const metrics = summary.suites[0].e2e;
  assert.deepEqual(metrics.tests[0], {
    id: 'test',
    passed: 2,
    failed: 2,
    skipped: 1,
    flaky: 2,
    flakeRate: 0.5,
    modelCalls: { sum: 10, max: 4, unknown: 0 },
  });
  assert.equal(metrics.flakeRate, 0.5);
  assert.deepEqual(metrics.ciRuntime, { count: 5, meanMs: 200, p95Ms: 400 });
  assert.equal(metrics.modelCalls.sum, 10);
});

test('retirement uses strict maintenance ratio, median, and false-failure rate', async () => {
  const { evaluateSuiteRetirement } = await import(moduleUrl);
  const ledger = [
    maintenance('playwright', 10),
    maintenance('playwright', 30),
    maintenance('e2e', 9),
  ];
  const evaluate = (entries) =>
    evaluateSuiteRetirement('hall', paired, entries, { asOf });
  assert.equal(evaluate(ledger).status, 'ELIGIBLE_FOR_RETIREMENT_ACK');
  assert.equal(evaluate(ledger).criteria.maintenance.ratio, 0.45);
  assert.equal(
    evaluate(ledger).criteria.maintenance.playwright.medianMinutes,
    20
  );
  assert.equal(
    evaluate([ledger[0], ledger[1], maintenance('e2e', 10)]).status,
    'KEEP_PLAYWRIGHT'
  );
  assert.equal(evaluate([]).status, 'INSUFFICIENT_DATA');
  assert.equal(evaluate([ledger[2]]).status, 'KEEP_PLAYWRIGHT');
  assert.equal(
    evaluate([ledger[2]]).criteria.maintenance.status,
    'insufficient-break-data'
  );
  const mixed = [
    maintenance('playwright', 30),
    maintenance('playwright', 30, { failureCategory: 'infra-flake' }),
    maintenance('e2e', 1),
  ];
  assert.deepEqual(evaluate(mixed).criteria.falseFailures, {
    status: 'fail',
    playwright: { count: 1, rate: 0.5 },
    e2e: { count: 1, rate: 1 },
  });
});

test('sample size, CI timing, and workshop hold are independent criteria', async () => {
  const { evaluateSuiteRetirement } = await import(moduleUrl);
  const entries = [maintenance('playwright', 20)];
  const evaluate = (runs, options) =>
    evaluateSuiteRetirement('hall', runs, entries, options);
  assert.equal(
    evaluate(paired, {
      asOf: '2026-12-05',
      minWindowDays: 1,
      workshopCritical: true,
    }).status,
    'HELD_UNTIL_DEC_5'
  );
  assert.equal(
    evaluate(paired, {
      asOf: '2026-12-05T23:59:59.999+07:00',
      minWindowDays: 1,
      workshopCritical: true,
    }).status,
    'HELD_UNTIL_DEC_5'
  );
  assert.equal(
    evaluate(paired, {
      asOf: '2026-12-06',
      minWindowDays: 1,
      workshopCritical: true,
    }).status,
    'ELIGIBLE_FOR_RETIREMENT_ACK'
  );
  assert.equal(
    evaluate(paired, { asOf: '2026-12-06', workshopCritical: true }).criteria
      .window.status,
    'insufficient-data'
  );
  assert.equal(evaluate(paired.slice(1), { asOf }).status, 'INSUFFICIENT_DATA');
  const slow = paired.map((run) =>
    run.framework === 'e2e' ? { ...run, durationMs: 126 } : run
  );
  assert.equal(evaluate(slow, { asOf }).status, 'KEEP_PLAYWRIGHT');
  assert.equal(
    evaluate(slow, { asOf, runtimeCapMs: 126 }).status,
    'ELIGIBLE_FOR_RETIREMENT_ACK'
  );
});

test('regression comparison requires reviewed baseline failures and matching candidate detections', async () => {
  const { evaluateSuiteRetirement } = await import(moduleUrl);
  const failed = [{ id: 'test', status: 'failed', modelCalls: 0 }];
  const runs = [{ ...paired[0], tests: failed }, ...paired.slice(1)];
  const baseline = maintenance('playwright', 20, {
    failureCategory: 'real-regression',
    runId: '0',
    regressionId: 'R1',
  });
  const candidate = { ...baseline, framework: 'e2e', minutesToFix: 1 };
  const evaluate = (history, entries) =>
    evaluateSuiteRetirement('hall', history, entries, { asOf });
  assert.equal(
    evaluate(runs, []).criteria.realRegressions.status,
    'insufficient-data'
  );
  assert.equal(evaluate(runs, [baseline, candidate]).status, 'KEEP_PLAYWRIGHT');
  assert.deepEqual(evaluate(runs, [baseline]).criteria.realRegressions.missed, [
    'R1',
  ]);
  const bothFailed = [runs[0], { ...runs[1], tests: failed }, ...runs.slice(2)];
  assert.equal(
    evaluate(bothFailed, [baseline, candidate]).status,
    'ELIGIBLE_FOR_RETIREMENT_ACK'
  );
  assert.deepEqual(
    evaluate(bothFailed, [baseline, { ...candidate, regressionId: 'R2' }])
      .criteria.realRegressions.missed,
    ['R1']
  );
});

test('combined CI totals sum measured suite wall times within each CI batch', async () => {
  const { summarizePilot } = await import(moduleUrl);
  const runs = [
    ...paired,
    snapshot('e2e', 0, { suite: 'tasks', durationMs: 700 }),
    snapshot('e2e', 1, { suite: 'tasks', durationMs: null }),
  ];
  const summary = summarizePilot(
    runs,
    [maintenance('playwright', 30), maintenance('e2e', 3)],
    { asOf }
  );
  assert.deepEqual(summary.aggregate.e2e.ciRuntime, {
    count: 9,
    meanMs: 1600 / 9,
    p95Ms: 800,
  });
  assert.deepEqual(summary.aggregate.combined.ciRuntime, {
    count: 9,
    meanMs: 2500 / 9,
    p95Ms: 900,
  });
  assert.equal(summary.aggregate.maintenanceRatio, 0.1);
  assert.equal(
    summary.suites[1].retirement.criteria.runtime.status,
    'insufficient-data'
  );
});

test('maintenance schema validates the checked-in ledger and rejects malformed entries', async () => {
  const { parseMaintenanceLog } = await import(moduleUrl);
  const ledger = (entries) => JSON.stringify({ $schema: schema, entries });
  const initial = readFileSync(
    new URL('../../.e2e/pilot-maintenance-log.json', moduleUrl),
    'utf8'
  );
  assert.deepEqual(parseMaintenanceLog(initial), []);
  const entry = maintenance('playwright', 20);
  assert.deepEqual(parseMaintenanceLog(ledger([entry])), [entry]);
  const invalid = [
    { framework: 'other' },
    { failureCategory: 'unknown' },
    { minutesToFix: -1 },
    { commitSha: 'short' },
    { recordedAt: '2026-11-27' },
    { notes: '' },
    { extra: true },
  ];
  for (const overrides of invalid) {
    assert.throws(
      () => parseMaintenanceLog(ledger([{ ...entry, ...overrides }])),
      /maintenance/
    );
  }
  assert.throws(
    () =>
      parseMaintenanceLog(
        JSON.stringify({ $schema: 'elsewhere', entries: [] })
      ),
    /maintenance/
  );
});

test('CLI merges real-format report artifacts, checks CI calls and writes JSON and Markdown', async (context) => {
  const folder = mkdtempSync(join(tmpdir(), 'e2e-pilot-'));
  context.after(() => rmSync(folder, { recursive: true, force: true }));
  const write = (path, value) =>
    writeFileSync(join(folder, path), JSON.stringify(value));
  const invoke = (...args) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(moduleUrl), '--as-of', asOf, ...args],
      {
        cwd: folder,
        encoding: 'utf8',
      }
    );
  const suite = 'hall | <local>';
  const manifest = {
    suites: { [suite]: { workshopCritical: true } },
    runs: [
      { ...snapshot('playwright'), suite, report: 'pw.xml' },
      { ...snapshot('e2e'), suite, report: 'e2e.json', junit: 'e2e.xml' },
    ].map(({ tests, runErrors, modelCalls, durationMs, ...run }) => run),
  };
  const junit =
    '<testsuites time="2"><testsuite name="spec"><testcase name="case"/></testsuite></testsuites>';
  writeFileSync(join(folder, 'pw.xml'), junit);
  writeFileSync(join(folder, 'e2e.xml'), junit);
  write('manifest.json', manifest);
  write('e2e.json', e2eReport());
  const args = [
    '--manifest',
    'manifest.json',
    '--assert-zero-model-calls',
    '--history-out',
    'history.ndjson',
    '--json-out',
    'summary.json',
    '--markdown-out',
    'summary.md',
  ];
  const success = invoke(...args);
  assert.equal(success.status, 0, success.stderr);
  const read = (file) => readFileSync(join(folder, file), 'utf8');
  const summary = JSON.parse(read('summary.json'));
  assert.equal(summary.suites[0].e2e.passed, 1);
  assert.equal(summary.suites[0].e2e.tests[0].flaky, 1);
  assert.equal(summary.suites[0].retirement.criteria.modelCalls.status, 'pass');
  assert.match(read('summary.md'), /hall \\\| &lt;local&gt;/);
  assert.match(read('summary.md'), /\*\*KEEP_PLAYWRIGHT\*\*/);
  assert.equal(read('history.ndjson').trim().split('\n').length, 2);
  const rerun = invoke('--history', 'history.ndjson', ...args);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.deepEqual(JSON.parse(read('summary.json')), summary);
  assert.equal(
    invoke('--history', 'history.ndjson').stdout,
    read('summary.md')
  );

  write('e2e.json', e2eReport(2));
  manifest.runs[1].ci = false;
  write('manifest.json', manifest);
  const calls = invoke(...args);
  assert.equal(calls.status, 1);
  assert.match(calls.stderr, /CI modelCalls must equal zero/);
  assert.equal(
    JSON.parse(read('summary.json')).suites[0].retirement.criteria.modelCalls
      .sum,
    4
  );

  manifest.runs[1].report = 'e2e.xml';
  manifest.runs[1].ci = true;
  write('manifest.json', manifest);
  assert.equal(invoke(...args).status, 1);
  assert.equal(
    JSON.parse(read('summary.json')).suites[0].retirement.criteria.modelCalls
      .status,
    'insufficient-data'
  );
});

test('CI assertion detects positive calls outside the current summary window', (context) => {
  const folder = mkdtempSync(join(tmpdir(), 'e2e-pilot-'));
  context.after(() => rmSync(folder, { recursive: true, force: true }));
  const oldCi = snapshot('e2e', 10, {
    timestamp: '2026-11-20T17:00:00Z',
    modelCalls: 1,
  });
  const local = snapshot('e2e', 11, { modelCalls: 1, ci: false });
  const history = join(folder, 'snapshot.json');
  const check = () =>
    spawnSync(
      process.execPath,
      [
        fileURLToPath(moduleUrl),
        '--history',
        history,
        '--as-of',
        asOf,
        '--assert-zero-model-calls',
      ],
      { encoding: 'utf8' }
    );
  writeFileSync(history, JSON.stringify(local));
  assert.equal(check().status, 0);
  writeFileSync(history, JSON.stringify([local, oldCi]));
  assert.equal(check().status, 1);
});
