const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const {
  createReceipt,
  recordReceipt,
  runnerMatches,
} = require('./e2e-result-receipt');

const provenance = {
  key: 'e2e-passed-v1-2026-10-02-scope-sha',
  suite: 'workspace-invite-tasks',
  sha: 'a'.repeat(40),
  runId: '100',
  attempt: '1',
  now: new Date('2026-10-02T12:00:00Z'),
};
const passing = {
  stats: { expected: 10, unexpected: 0, flaky: 0, skipped: 2 },
  errors: [],
};

test('proofs contain only counts and provenance, never raw test reports', () => {
  const proof = createReceipt(
    { ...passing, suites: [{ secret: 'synthetic-private-value' }] },
    provenance
  );
  assert.equal(proof.stats.expected, 10);
  assert.equal(proof.sha, provenance.sha);
  assert.equal(
    JSON.stringify(proof).includes('synthetic-private-value'),
    false
  );
});

test('failed, flaky, empty and malformed reports cannot become successes', () => {
  for (const stats of [
    { ...passing.stats, unexpected: 1 },
    { ...passing.stats, flaky: 1 },
    { ...passing.stats, expected: 0 },
    { ...passing.stats, expected: '10' },
    { ...passing.stats, skipped: -1 },
  ]) {
    assert.equal(createReceipt({ stats }, provenance), null);
  }
  assert.equal(createReceipt({ ...passing, errors: [{}] }, provenance), null);
  assert.equal(createReceipt({}, provenance), null);
  assert.equal(
    createReceipt({ ...passing, errors: 'unknown' }, provenance),
    null
  );
  assert.equal(createReceipt({ stats: passing.stats }, provenance), null);
});

test('invalid identities cannot create cache entries or workflow output injection', () => {
  for (const value of [
    { key: '' },
    { key: 'key\nreusable=true' },
    { sha: 'not-a-source-commit' },
    { suite: 'suite\n' },
    { runId: 'foo' },
    { attempt: '' },
  ]) {
    assert.equal(createReceipt(passing, { ...provenance, ...value }), null);
  }
});

test('untrusted refs and manual dispatch never publish a receipt', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-receipt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = path.join(dir, 'report.json');
  fs.writeFileSync(report, JSON.stringify(passing));
  for (const [event, ref] of [
    ['push', 'refs/heads/feature/test'],
    ['pull_request', 'refs/heads/main'],
    ['workflow_dispatch', 'refs/heads/main'],
  ]) {
    const output = path.join(dir, `${event}-${ref.replaceAll('/', '-')}`);
    const proof = recordReceipt({
      GITHUB_EVENT_NAME: event,
      GITHUB_REF: ref,
      E2E_RESULTS_PATH: report,
      GITHUB_OUTPUT: output,
      E2E_PROOF_KEY: provenance.key,
      E2E_SUITE_ID: provenance.suite,
      GITHUB_SHA: provenance.sha,
      GITHUB_RUN_ID: provenance.runId,
      GITHUB_RUN_ATTEMPT: provenance.attempt,
    });
    assert.equal(proof, null);
    assert.equal(fs.readFileSync(output, 'utf8'), 'reusable=false\n');
  }
});

test('proof publication requires the actual runner to match the planned platform', () => {
  const env = {
    E2E_EXPECTED_RUNNER: JSON.stringify({
      image: '20261002.1',
      os: 'Linux',
      arch: 'X64',
    }),
    ImageVersion: '20261002.1',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
  };
  assert.equal(runnerMatches(env), true);
  for (const mismatch of [
    { ImageVersion: '20261003.1' },
    { RUNNER_OS: 'Windows' },
    { RUNNER_ARCH: 'ARM64' },
    { E2E_EXPECTED_RUNNER: 'null' },
    { E2E_EXPECTED_RUNNER: '{}' },
    { E2E_EXPECTED_RUNNER: 'invalid' },
  ])
    assert.equal(runnerMatches({ ...env, ...mismatch }), false);
});

test('a main success publishes only when its actual runner matches the plan', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-runner-mismatch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = path.join(dir, 'report.json');
  const output = path.join(dir, 'output');
  fs.writeFileSync(report, JSON.stringify(passing));
  const env = {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    E2E_RESULTS_PATH: report,
    GITHUB_OUTPUT: output,
    E2E_PROOF_KEY: provenance.key,
    E2E_SUITE_ID: provenance.suite,
    GITHUB_SHA: provenance.sha,
    GITHUB_RUN_ID: provenance.runId,
    GITHUB_RUN_ATTEMPT: provenance.attempt,
    E2E_EXPECTED_RUNNER: JSON.stringify({
      image: 'planned',
      os: 'Linux',
      arch: 'X64',
    }),
    ImageVersion: 'different',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
  };
  execFileSync(
    process.execPath,
    [
      '-e',
      'require(process.argv[1]).recordReceipt(JSON.parse(process.argv[2]))',
      require.resolve('./e2e-result-receipt'),
      JSON.stringify(env),
    ],
    { cwd: dir }
  );
  assert.equal(fs.readFileSync(output, 'utf8'), 'reusable=false\n');
  assert.equal(
    fs.existsSync(path.join(dir, 'tmp/e2e-proof-receipt.json')),
    false
  );
  execFileSync(
    process.execPath,
    [
      '-e',
      'const receipt=require(process.argv[1]).recordReceipt(JSON.parse(process.argv[2])); if (!receipt) process.exit(1)',
      require.resolve('./e2e-result-receipt'),
      JSON.stringify({ ...env, ImageVersion: 'planned' }),
    ],
    { cwd: dir }
  );
  assert.equal(
    fs.readFileSync(output, 'utf8'),
    'reusable=false\nreusable=true\n'
  );
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, 'tmp/e2e-proof-receipt.json'), 'utf8')
  );
  assert.equal(saved.sha, provenance.sha);
  assert.equal(saved.key, provenance.key);
  assert.deepEqual(saved.stats, passing.stats);
});
