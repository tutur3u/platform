const assert = require('node:assert/strict');
const test = require('node:test');
const {
  estimateSavings,
  fmt,
  parseArgs,
  percentile,
  renderEntry,
  renderSavings,
  summarizeJobs,
  summarizeRuns,
} = require('./ci-daily-sample.js');

const at = (minute) =>
  new Date(Date.UTC(2026, 10, 19, 0, minute)).toISOString();

test('percentiles use nearest rank and empty input is n/a', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 90), 5);
  assert.equal(percentile([], 50), null);
  assert.equal(fmt(null), 'n/a');
  assert.equal(fmt(90), '90 s');
  assert.equal(fmt(600), '10.0 min');
});

test('run summary counts every conclusion and times only finished runs', () => {
  const summary = summarizeRuns([
    {
      name: 'Test',
      conclusion: 'success',
      run_started_at: at(0),
      updated_at: at(10),
    },
    {
      name: 'Test',
      conclusion: 'cancelled',
      run_started_at: at(0),
      updated_at: at(1),
    },
    {
      name: 'Oxc',
      conclusion: 'failure',
      run_started_at: at(0),
      updated_at: at(2),
    },
    { name: 'Oxc', conclusion: null, status: 'queued' },
  ]);
  assert.deepEqual(summary.byConclusion, {
    success: 1,
    cancelled: 1,
    failure: 1,
    queued: 1,
  });
  assert.deepEqual(
    summary.slowest.map((row) => [row.name, row.p50]),
    [
      ['Test', 600],
      ['Oxc', 120],
    ]
  );
});

test('a failed attempt followed by a pass is a flake candidate', () => {
  const job = (attempt, conclusion) => ({
    run_id: 7,
    name: 'Unit shard (1)',
    workflow_name: 'Test',
    conclusion,
    run_attempt: attempt,
    created_at: at(0),
    started_at: at(1),
    completed_at: at(4),
    html_url: `https://example.test/${attempt}`,
  });
  const jobs = summarizeJobs([job(1, 'failure'), job(2, 'success')]);
  assert.deepEqual(jobs.recovered, [
    { name: 'Test / Unit shard (1)', url: 'https://example.test/1' },
  ]);
  assert.equal(jobs.slowRun[0].runP50, 180);
  const entry = renderEntry({
    date: '2026-11-19',
    window: { from: 'a', to: 'b' },
    runs: summarizeRuns([]),
    jobs,
    sampled: 1,
    note: 'Lesson.',
  });
  assert.match(entry, /^\n## 2026-11-19 \| Daily CI sample/u);
  assert.match(
    entry,
    /\[Test \/ Unit shard \(1\)\]\(https:\/\/example.test\/1\)/u
  );
  assert.match(entry, /Lesson\.\n$/u);
});

test('options are validated', () => {
  assert.equal(parseArgs(['--hours', '6']).hours, 6);
  assert.equal(parseArgs(['--savings', '--commits', '3']).commits, 3);
  assert.throws(() => parseArgs(['--hours', '0']));
  assert.throws(() => parseArgs(['--bogus']));
});

test('savings count certain skips and ignore uncertain plans', () => {
  const certain = {
    uncertain: false,
    test: { run: false },
    typecheck: { run: false },
    lint: { run: true },
    docs: { run: true },
    build: { apps: ['web'] },
    cloudflare: { skip: [{ id: 'meet' }, { id: 'calendar' }] },
  };
  const report = estimateSavings([certain, { uncertain: true }]);
  assert.equal(report.commits, 2);
  assert.equal(report.uncertain, 1);
  // 2 deploys, the test suite, type-check, and 5 unbuilt programming apps.
  assert.equal(report.jobs, 2 + 1 + 1 + 5);
  assert.equal(report.minutes, 2 * 4 + 6 + 8 + 5 * 4);
  assert.match(renderSavings(report), /not queue wall/);
});
