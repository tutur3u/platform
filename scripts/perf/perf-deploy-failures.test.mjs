import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentFailureRecords } from './perf-deploy-failures.mjs';

test('reports only production runs that failed within the evaluation window', () => {
  const failed = {
    conclusion: 'failure',
    databaseId: 42,
    headSha: 'abc1234',
    workflowName: 'Production Deployment Planner',
    updatedAt: '2026-11-20T02:30:00Z',
    url: 'https://github.com/tutur3u/platform/actions/runs/42',
  };
  assert.deepEqual(
    deploymentFailureRecords(
      [
        failed,
        { ...failed, databaseId: 43, conclusion: 'cancelled' },
        { ...failed, databaseId: 44, updatedAt: '2026-11-20T00:44:59Z' },
        { ...failed, databaseId: 45, updatedAt: '2026-11-20T02:45:01Z' },
      ],
      { since: '2026-11-20T00:45:00Z', until: '2026-11-20T02:45:00Z' }
    ),
    [
      {
        id: 'perf-deploy-failure-42',
        type: 'production_deploy_failure',
        workflow: failed.workflowName,
        sha: failed.headSha,
        failedAt: failed.updatedAt,
        runUrl: failed.url,
      },
    ]
  );
});
