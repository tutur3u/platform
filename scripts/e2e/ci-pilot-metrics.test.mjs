import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ciRunIdentity, sliceReport } from './ci-pilot-metrics.mjs';
import { parseE2eJson } from './pilot-metrics.mjs';

const entrypoint = fileURLToPath(
  new URL('./ci-pilot-metrics.mjs', import.meta.url)
);
const startedAt = '2026-11-27T06:00:00Z';
const suites = {
  'tasks-kanban': 'tasks-board-load',
  'meet-guest-join': 'meet-guest-join',
  'login-en-vi': 'fleet-sign-in',
  'edufest-hall-guest-join': 'edufest-hall-guest-join',
};
const fileFor = (name) => `apps/web/e2e-agent/${name}.e2e.ts`;
const step = (modelCalls) => ({ metrics: { modelCalls } });

function fixture(modelCalls = 0) {
  return {
    schemaVersion: 'report-1',
    run: {
      startedAt,
      finishedAt: '2026-11-27T06:00:05Z',
      results: Object.values(suites).map((name, index) => ({
        file: fileFor(name),
        testId: name,
        titlePath: [name],
        targetId: 'web-chromium',
        agent: 'default',
        status: 'passed',
        attempts: [{ steps: [step(index === 0 ? modelCalls : 0)] }],
      })),
      serialGroups: [],
      errors: [],
      usage: { maxModelCallsInStep: modelCalls },
    },
  };
}

function cliFixture(context) {
  const root = mkdtempSync(join(tmpdir(), 'pilot-ci-test-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const e2e = join(root, '.e2e');
  const temp = join(root, 'temp');
  const clock = join(root, 'clock.cjs');
  mkdirSync(e2e);
  mkdirSync(temp);
  writeFileSync(
    clock,
    `
    const OriginalDate = Date;
    const asOf = '2026-11-28T06:00:00Z';
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [asOf])); }
      static now() { return OriginalDate.parse(asOf); }
    };
  `
  );
  writeFileSync(
    join(e2e, 'pilot-maintenance-log.json'),
    JSON.stringify({
      $schema: '../scripts/e2e/pilot-maintenance-log.schema.json',
      entries: [],
    })
  );
  return {
    run(report) {
      writeFileSync(join(e2e, 'report.json'), JSON.stringify(report));
      const result = spawnSync(process.execPath, [entrypoint], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_RUN_ID: '123',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_SHA: 'a'.repeat(40),
          PILOT_COMMIT_SHA: 'b'.repeat(40),
          TMPDIR: temp,
          NODE_OPTIONS: `--require="${clock}"`,
        },
      });
      assert.deepEqual(readdirSync(temp), [], 'temporary reports were removed');
      if (result.error) throw result.error;
      return result;
    },
    summary() {
      return JSON.parse(
        readFileSync(join(e2e, 'pilot-metrics-summary.json'), 'utf8')
      );
    },
  };
}

test('CI snapshot emits four documented suites and holds only EduFest', (context) => {
  const cli = cliFixture(context);
  const result = cli.run(fixture());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^# E2E pilot metrics$/m);
  const summary = cli.summary();
  assert.equal(summary.aggregate.e2e.passed, 4);
  assert.equal(summary.aggregate.e2e.ciRuns, 4);
  assert.equal(summary.aggregate.e2e.modelCalls.sum, 0);
  assert.deepEqual(
    summary.suites.map(({ suite }) => suite).sort(),
    Object.keys(suites).sort()
  );
  for (const { suite, e2e, retirement } of summary.suites) {
    const critical = suite === 'edufest-hall-guest-join';
    assert.equal(e2e.passed, 1);
    assert.equal(retirement.criteria.calendarHold.workshopCritical, critical);
    assert.equal(
      retirement.criteria.calendarHold.status,
      critical ? 'fail' : 'pass'
    );
    assert.equal(retirement.status === 'HELD_UNTIL_DEC_5', critical);
  }
});

test('a model call fails CI after both summaries are emitted', (context) => {
  const cli = cliFixture(context);
  const result = cli.run(fixture(1));
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /CI modelCalls must equal zero/);
  assert.match(result.stdout, /^\| modelCalls \| fail \|$/m);
  const summary = cli.summary();
  assert.equal(summary.aggregate.e2e.modelCalls.sum, 1);
  assert.equal(
    summary.suites.find(({ suite }) => suite === 'tasks-kanban').e2e.modelCalls
      .sum,
    1
  );
});

test('serial retries stay with their suite and every slice carries run errors', () => {
  const report = fixture(2);
  const result = report.run.results[1];
  result.attempts = [];
  result.serialGroupId = 'serial-1';
  const group = {
    id: result.serialGroupId,
    file: result.file,
    attempts: [3, 1].map((calls) => ({
      members: [{ testId: result.testId, steps: [step(calls)] }],
    })),
  };
  report.run.serialGroups.push(group);
  report.run.errors.push({ message: 'runner error' });
  report.run.usage.maxModelCallsInStep = 3;
  const slices = Object.fromEntries(
    sliceReport(report).map(({ suite, report: sliced }) => [suite, sliced])
  );
  assert.deepEqual(slices['meet-guest-join'].run.serialGroups, [group]);
  assert.deepEqual(slices['tasks-kanban'].run.serialGroups, []);
  assert.equal(slices['meet-guest-join'].run.usage.maxModelCallsInStep, 3);
  assert.equal(slices['tasks-kanban'].run.usage.maxModelCallsInStep, 2);
  assert.equal(parseE2eJson(slices['meet-guest-join']).modelCalls, 4);
  assert.equal(parseE2eJson(slices['tasks-kanban']).modelCalls, 2);
  assert(Object.values(slices).every(({ run }) => run.errors.length === 1));
  result.file = fileFor('fleet-sign-in');
  assert.throws(
    () => sliceReport(report),
    /Serial group spans pilot suite files/
  );
});

test('the helper rejects inconsistent full usage and unmapped test files', (context) => {
  const cli = cliFixture(context);
  const inconsistent = fixture(1);
  inconsistent.run.usage.maxModelCallsInStep = 0;
  const usage = cli.run(inconsistent);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Inconsistent e2e model-call accounting/);
  const unmapped = fixture();
  unmapped.run.results[0].file = fileFor('new-test');
  const unknown = cli.run(unmapped);
  assert.equal(unknown.status, 2);
  assert.match(
    unknown.stderr,
    /Unmapped e2e file: apps\/web\/e2e-agent\/new-test\.e2e\.ts/
  );
});

test('the PR head SHA takes precedence over the checkout SHA', () => {
  const env = {
    PILOT_COMMIT_SHA: 'a'.repeat(40),
    GITHUB_SHA: 'b'.repeat(40),
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
  };
  assert.deepEqual(ciRunIdentity(fixture(), env), {
    runId: 'ci-123-attempt-2',
    timestamp: startedAt,
    commitSha: env.PILOT_COMMIT_SHA,
    framework: 'e2e',
    ci: true,
  });
  assert.equal(
    ciRunIdentity(fixture(), { ...env, PILOT_COMMIT_SHA: '' }).commitSha,
    env.GITHUB_SHA
  );
});

test('CI run identity rejects missing or blank metadata', () => {
  const env = {
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_SHA: 'a'.repeat(40),
  };
  for (const [key, expected] of [
    ['GITHUB_RUN_ID', 'GITHUB_RUN_ID'],
    ['GITHUB_RUN_ATTEMPT', 'GITHUB_RUN_ATTEMPT'],
    ['GITHUB_SHA', 'PILOT_COMMIT_SHA or GITHUB_SHA'],
  ]) {
    for (const value of [undefined, '', ' ']) {
      assert.throws(() => ciRunIdentity(fixture(), { ...env, [key]: value }), {
        message: `Missing CI pilot metadata: ${expected}`,
      });
    }
  }
});
