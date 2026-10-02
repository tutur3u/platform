const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createReceipt, recordReceipt } = require('./e2e-result-receipt');

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
