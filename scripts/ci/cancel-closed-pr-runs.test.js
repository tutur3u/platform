const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('./cancel-closed-pr-runs-core.ts');

const repository = 'tutur3u/platform';
const headRef = 'feature/cancel-pr-runs';
const headSha = 'abc123';

function closedPullRequestEvent({
  headRepository = repository,
  number = 42,
} = {}) {
  return {
    action: 'closed',
    pull_request: {
      head: {
        ref: headRef,
        repo: {
          full_name: headRepository,
        },
        sha: headSha,
      },
      number,
    },
    repository: {
      full_name: repository,
    },
  };
}

function workflowRun(overrides) {
  return {
    event: 'pull_request',
    head_branch: headRef,
    head_repository: {
      full_name: repository,
    },
    head_sha: headSha,
    id: 1,
    name: 'Test Workflow',
    pull_requests: [
      {
        head: {
          ref: headRef,
          repo: {
            full_name: repository,
          },
          sha: headSha,
        },
        number: 42,
      },
    ],
    status: 'queued',
    ...overrides,
  };
}

function createClient({ cancelStatuses = {}, runsByStatus = {} }) {
  const cancelled = [];
  const listCalls = [];

  return {
    cancelled,
    client: {
      async cancelWorkflowRun(runId) {
        cancelled.push(runId);

        return {
          status: cancelStatuses[runId] ?? 202,
        };
      },
      async listWorkflowRuns(input) {
        listCalls.push(input);

        if (input.page !== 1) {
          return [];
        }

        return runsByStatus[input.status] ?? [];
      },
    },
    listCalls,
  };
}

test('cancels active PR and same-repository branch push runs', async () => {
  const { cancelClosedPullRequestRuns } = await modulePromise;
  const { cancelled, client } = createClient({
    runsByStatus: {
      in_progress: [
        workflowRun({
          event: 'push',
          id: 202,
          pull_requests: [],
          status: 'in_progress',
        }),
      ],
      queued: [
        workflowRun({
          id: 101,
        }),
      ],
    },
  });

  const summary = await cancelClosedPullRequestRuns({
    client,
    currentRunId: 999,
    event: closedPullRequestEvent(),
    log: () => {},
    repository,
  });

  assert.deepEqual(cancelled, [101, 202]);
  assert.deepEqual(summary, {
    cancelled: 2,
    considered: 2,
    raceSkipped: 0,
    skipped: 0,
  });
});

test('skips unrelated, non-active, current, and protected-branch runs', async () => {
  const { cancelClosedPullRequestRuns } = await modulePromise;
  const { cancelled, client } = createClient({
    runsByStatus: {
      queued: [
        workflowRun({
          id: 999,
        }),
        workflowRun({
          id: 301,
          pull_requests: [
            {
              number: 7,
            },
          ],
        }),
        workflowRun({
          event: 'push',
          head_branch: 'main',
          id: 302,
          pull_requests: [],
        }),
        workflowRun({
          event: 'push',
          head_branch: 'production',
          id: 303,
          pull_requests: [],
        }),
        workflowRun({
          event: 'workflow_dispatch',
          id: 304,
          pull_requests: [],
        }),
        workflowRun({
          id: 305,
          status: 'completed',
        }),
      ],
    },
  });

  const summary = await cancelClosedPullRequestRuns({
    client,
    currentRunId: 999,
    event: closedPullRequestEvent(),
    log: () => {},
    repository,
  });

  assert.deepEqual(cancelled, []);
  assert.equal(summary.considered, 6);
  assert.equal(summary.skipped, 6);
});

test('skips same-branch push runs for fork pull requests', async () => {
  const { cancelClosedPullRequestRuns } = await modulePromise;
  const { cancelled, client } = createClient({
    runsByStatus: {
      in_progress: [
        workflowRun({
          event: 'push',
          id: 401,
          pull_requests: [],
          status: 'in_progress',
        }),
      ],
    },
  });

  const summary = await cancelClosedPullRequestRuns({
    client,
    event: closedPullRequestEvent({
      headRepository: 'contributor/platform',
    }),
    log: () => {},
    repository,
  });

  assert.deepEqual(cancelled, []);
  assert.equal(summary.considered, 1);
  assert.equal(summary.skipped, 1);
});

test('treats already-finished cancellation races as skipped', async () => {
  const { cancelClosedPullRequestRuns } = await modulePromise;
  const { cancelled, client } = createClient({
    cancelStatuses: {
      501: 404,
      502: 409,
    },
    runsByStatus: {
      queued: [
        workflowRun({
          id: 501,
        }),
        workflowRun({
          id: 502,
        }),
      ],
    },
  });

  const summary = await cancelClosedPullRequestRuns({
    client,
    event: closedPullRequestEvent(),
    log: () => {},
    repository,
  });

  assert.deepEqual(cancelled, [501, 502]);
  assert.deepEqual(summary, {
    cancelled: 0,
    considered: 2,
    raceSkipped: 2,
    skipped: 0,
  });
});

test('fails on unexpected cancellation errors', async () => {
  const { cancelClosedPullRequestRuns } = await modulePromise;
  const { client } = createClient({
    cancelStatuses: {
      601: 403,
    },
    runsByStatus: {
      queued: [
        workflowRun({
          id: 601,
        }),
      ],
    },
  });

  await assert.rejects(
    cancelClosedPullRequestRuns({
      client,
      event: closedPullRequestEvent(),
      log: () => {},
      repository,
    }),
    /GitHub API returned 403/
  );
});
