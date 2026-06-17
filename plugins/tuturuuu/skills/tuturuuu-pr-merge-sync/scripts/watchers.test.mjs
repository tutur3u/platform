import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateRunState,
  failedRuns,
  parseArgs as parseBranchArgs,
  summarizeRuns,
} from './watch_branch_runs.mjs';
import {
  evaluatePrState,
  failedChecks,
  latestCommentTime,
  parseArgs as parsePrArgs,
  summarizeChecks,
} from './watch_pr_ready.mjs';

test('PR watcher finds latest review or comment activity', () => {
  const latest = latestCommentTime({
    comments: [
      { createdAt: '2026-06-16T22:00:00Z' },
      {
        createdAt: '2026-06-16T22:10:00Z',
        updatedAt: '2026-06-16T22:30:00Z',
      },
    ],
    reviews: [{ submittedAt: '2026-06-16T22:45:00Z' }],
  });

  assert.equal(latest.toISOString(), '2026-06-16T22:45:00.000Z');
});

test('PR watcher requires clean checks, no threads, and quiet window', () => {
  const state = evaluatePrState(
    {
      headRefOid: '8571a470fe61fb8af54c53595358cbff2f35addc',
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      reviews: [{ submittedAt: '2026-06-16T22:00:00Z' }],
      statusCheckRollup: [
        { conclusion: 'SUCCESS', name: 'Test', status: 'COMPLETED' },
        { conclusion: 'SKIPPED', name: 'Docs', status: 'COMPLETED' },
      ],
    },
    { active_unresolved: 0 },
    Date.parse('2026-06-16T22:31:00Z'),
    30 * 60 * 1000
  );

  assert.equal(state.ready, true);
  assert.match(state.summary, /quietMinutes=31/);
});

test('PR watcher rejects active threads and failed checks', () => {
  const checks = [
    { conclusion: 'FAILURE', name: 'E2E', status: 'COMPLETED' },
    { conclusion: '', name: 'Type Check', status: 'IN_PROGRESS' },
  ];

  assert.equal(failedChecks(checks).length, 1);
  assert.equal(summarizeChecks(checks), 'COMPLETED:FAILURE=1, IN_PROGRESS:=1');

  const state = evaluatePrState(
    { statusCheckRollup: checks },
    { active_unresolved: 2 },
    Date.now(),
    1
  );
  assert.equal(state.ready, false);
  assert.equal(state.activeThreads, 2);
});

test('branch watcher accepts success, skipped, and neutral conclusions', () => {
  const runs = [
    { conclusion: 'success', status: 'completed', workflowName: 'Test' },
    { conclusion: 'skipped', status: 'completed', workflowName: 'Docs' },
    { conclusion: 'neutral', status: 'completed', workflowName: 'CodeQL' },
  ];

  const state = evaluateRunState(runs, {
    branch: 'main',
    commit: '8571a470fe61fb8af54c53595358cbff2f35addc',
  });

  assert.equal(state.ready, true);
  assert.equal(state.failures.length, 0);
  assert.equal(
    summarizeRuns(runs),
    'completed:neutral=1, completed:skipped=1, completed:success=1'
  );
});

test('branch watcher blocks sync when main has pending or failed runs', () => {
  const runs = [
    { conclusion: 'success', status: 'completed', workflowName: 'Type Check' },
    {
      conclusion: 'failure',
      status: 'completed',
      url: 'https://github.com/tutur3u/platform/actions/runs/1',
      workflowName: 'E2E',
    },
    { conclusion: '', status: 'in_progress', workflowName: 'CodeQL' },
  ];

  const state = evaluateRunState(runs, {
    branch: 'main',
    commit: '8571a470fe61fb8af54c53595358cbff2f35addc',
  });

  assert.equal(state.ready, false);
  assert.equal(failedRuns(runs).length, 1);
  assert.equal(state.pending.length, 1);
});

test('watcher argument parsers reject incomplete invocations', () => {
  assert.throws(
    () => parsePrArgs(['--repo', 'tutur3u/platform']),
    /Missing --pr/
  );
  assert.throws(
    () => parseBranchArgs(['--repo', 'tutur3u/platform', '--branch', 'main']),
    /Missing --commit/
  );
});
