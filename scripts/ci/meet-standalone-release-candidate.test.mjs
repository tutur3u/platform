import assert from 'node:assert/strict';
import test from 'node:test';
import { admitWorkflowRuns } from './meet-standalone-release.mjs';

// A pinned commit whose superseding main runs were cancelled keeps its
// Test and Type Check evidence through a release-candidate dispatch.
const source = 'a'.repeat(40);
const other = 'b'.repeat(40);
const candidate = {
  id: 11,
  head_sha: source,
  run_number: 11,
  run_attempt: 1,
  repository: { full_name: 'tutur3u/platform' },
  head_repository: { full_name: 'tutur3u/platform' },
  head_branch: `release-candidate/${source}`,
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: 'success',
};

test('a release-candidate dispatch on the exact source is evidence', () => {
  assert.deepEqual(
    admitWorkflowRuns({ workflow_runs: [candidate] }, source, '10'),
    { id: 11, attempt: 1 }
  );
});

test('only a dispatch on the source commit candidate ref counts', () => {
  for (const mutation of [
    { event: 'push' },
    { head_branch: `release-candidate/${other}` },
    { head_branch: 'release-candidate/other' },
    { head_sha: other },
    { head_repository: { full_name: 'fork/platform' } },
  ])
    assert.throws(() =>
      admitWorkflowRuns(
        { workflow_runs: [{ ...candidate, ...mutation }] },
        source,
        '10'
      )
    );
});
