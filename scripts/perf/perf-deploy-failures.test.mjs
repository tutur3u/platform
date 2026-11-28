import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentFailureRecords } from './perf-deploy-failures.mjs';

const RANGE = {
  since: '2026-11-20T00:45:00Z',
  until: '2026-11-20T02:45:00Z',
};

test('reports only production runs started within the evaluation window', () => {
  const failed = {
    attempt: 1,
    conclusion: 'failure',
    databaseId: 42,
    headSha: 'abc1234',
    workflowName: 'Production Deployment Planner',
    createdAt: '2026-11-20T02:20:00Z',
    startedAt: '2026-11-20T02:20:05Z',
    updatedAt: '2026-11-20T02:30:00Z',
    url: 'https://github.com/tutur3u/platform/actions/runs/42',
  };
  assert.deepEqual(
    deploymentFailureRecords(
      [
        failed,
        { ...failed, databaseId: 43, conclusion: 'cancelled' },
        {
          ...failed,
          databaseId: 44,
          createdAt: '2026-11-20T00:44:59Z',
          startedAt: '2026-11-20T00:44:59Z',
          updatedAt: '2026-11-20T01:00:00Z',
        },
        {
          ...failed,
          databaseId: 45,
          createdAt: '2026-11-20T02:45:01Z',
          startedAt: '2026-11-20T02:45:01Z',
          updatedAt: '2026-11-20T02:50:00Z',
        },
      ],
      RANGE
    ),
    [
      {
        id: 'perf-deploy-failure-42',
        type: 'production_deploy_failure',
        workflow: failed.workflowName,
        sha: failed.headSha,
        createdAt: failed.createdAt,
        startedAt: failed.startedAt,
        attempt: 1,
        failedAt: failed.updatedAt,
        runUrl: failed.url,
      },
    ]
  );
});

test('a March run updated in November is ignored; rerun started in window is kept', () => {
  const staleMarch1 = {
    attempt: 1,
    conclusion: 'failure',
    databaseId: 23586386392,
    headSha: 'def5678',
    workflowName: 'Vercel Platform Production Deployment',
    createdAt: '2026-03-26T09:12:40Z',
    startedAt: '2026-03-26T09:12:40Z',
    updatedAt: '2026-11-20T01:10:00Z',
    url: 'https://github.com/tutur3u/platform/actions/runs/23586386392',
  };
  const staleMarch2 = {
    ...staleMarch1,
    databaseId: 23585501438,
    createdAt: '2026-03-26T08:49:47Z',
    startedAt: '2026-03-26T08:49:47Z',
    updatedAt: '2026-11-20T02:05:00Z',
  };
  const rerunInWindow = {
    ...staleMarch1,
    attempt: 2,
    databaseId: 46,
    createdAt: '2026-11-18T12:00:00Z',
    startedAt: '2026-11-20T01:30:00Z',
    updatedAt: '2026-11-20T03:10:00Z',
  };
  const createdOnlyInWindow = {
    conclusion: 'failure',
    databaseId: 48,
    headSha: '1112223',
    workflowName: 'Vercel Production',
    createdAt: '2026-11-20T01:45:00Z',
    updatedAt: '2026-11-20T01:55:00Z',
    url: 'https://github.com/tutur3u/platform/actions/runs/48',
  };
  const records = deploymentFailureRecords(
    [staleMarch1, staleMarch2, rerunInWindow, createdOnlyInWindow],
    RANGE
  );
  assert.deepEqual(
    records.map((record) => record.id),
    ['perf-deploy-failure-46', 'perf-deploy-failure-48']
  );
  assert.equal(records[0].attempt, 2);
  assert.equal(records[0].startedAt, '2026-11-20T01:30:00Z');
});

test('a rerun of an older run whose startedAt is in-window is kept; metadata-only update is ignored', () => {
  const olderRerunInWindow = {
    attempt: 2,
    conclusion: 'failure',
    databaseId: 49,
    headSha: 'abcdef0',
    workflowName: 'Vercel Production',
    createdAt: '2026-10-20T08:00:00Z',
    startedAt: '2026-11-20T01:20:00Z',
    updatedAt: '2026-11-20T01:35:00Z',
    url: 'https://github.com/tutur3u/platform/actions/runs/49',
  };
  const olderRerunOutsideWindow = {
    ...olderRerunInWindow,
    databaseId: 50,
    startedAt: '2026-10-21T08:00:00Z',
    updatedAt: '2026-11-20T01:35:00Z',
  };
  const records = deploymentFailureRecords(
    [olderRerunInWindow, olderRerunOutsideWindow],
    RANGE
  );
  assert.deepEqual(
    records.map((record) => [record.id, record.attempt, record.startedAt]),
    [['perf-deploy-failure-49', 2, '2026-11-20T01:20:00Z']]
  );
});

test('a run without parseable startedAt or createdAt is ignored', () => {
  const unknown = {
    conclusion: 'failure',
    databaseId: 47,
    headSha: 'fedcba9',
    workflowName: 'Vercel Production',
    updatedAt: '2026-11-20T01:10:00Z',
    url: 'https://github.com/tutur3u/platform/actions/runs/47',
  };
  assert.deepEqual(deploymentFailureRecords([unknown], RANGE), []);
});
