const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWorkflowDispatchUrl,
  buildWorkflowRunsUrl,
  dispatchRelatedWorkflow,
  getRelatedWorkflowRunStatus,
  waitForPackageVersion,
} = require('./package-release-readiness.js');

test('builds GitHub workflow run lookup URLs for the current push', () => {
  assert.equal(
    buildWorkflowRunsUrl({
      env: {
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REF_NAME: 'production',
        GITHUB_REPOSITORY: 'tutur3u/platform',
      },
      workflowName: 'release-types-package.yaml',
    }),
    'https://api.github.test/repos/tutur3u/platform/actions/workflows/release-types-package.yaml/runs?per_page=20&branch=production'
  );
});

test('builds GitHub workflow dispatch URLs', () => {
  assert.equal(
    buildWorkflowDispatchUrl({
      env: {
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REPOSITORY: 'tutur3u/platform',
      },
      workflowName: 'release-ai-package.yaml',
    }),
    'https://api.github.test/repos/tutur3u/platform/actions/workflows/release-ai-package.yaml/dispatches'
  );
});

test('detects related package release workflows for the same SHA across trigger events', async () => {
  const calls = [];
  const status = await getRelatedWorkflowRunStatus({
    env: {
      GH_TOKEN: 'token',
      GITHUB_API_URL: 'https://api.github.test',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_NAME: 'production',
      GITHUB_REPOSITORY: 'tutur3u/platform',
      GITHUB_SHA: 'abc123',
    },
    fetchImpl: async (url, options) => {
      calls.push({ options, url });

      return {
        ok: true,
        async json() {
          return {
            workflow_runs: [
              {
                conclusion: 'success',
                head_sha: 'unrelated',
                html_url: 'https://example.test/old',
                run_started_at: '2026-06-03T13:00:00Z',
                status: 'completed',
              },
              {
                conclusion: 'failure',
                event: 'workflow_dispatch',
                head_sha: 'abc123',
                html_url: 'https://example.test/failing',
                run_started_at: '2026-06-03T14:00:00Z',
                status: 'completed',
              },
            ],
          };
        },
      };
    },
    logger: { log() {} },
    workflowName: 'release-types-package.yaml',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  assert.deepEqual(status, {
    conclusion: 'failure',
    state: 'failed',
    url: 'https://example.test/failing',
  });
});

test('reports missing related package release workflows for the same SHA', async () => {
  const status = await getRelatedWorkflowRunStatus({
    env: {
      GH_TOKEN: 'token',
      GITHUB_API_URL: 'https://api.github.test',
      GITHUB_REF_NAME: 'production',
      GITHUB_REPOSITORY: 'tutur3u/platform',
      GITHUB_SHA: 'abc123',
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          workflow_runs: [
            {
              conclusion: 'success',
              head_sha: 'unrelated',
              html_url: 'https://example.test/old',
              run_started_at: '2026-06-03T13:00:00Z',
              status: 'completed',
            },
          ],
        };
      },
    }),
    logger: { log() {} },
    workflowName: 'release-types-package.yaml',
  });

  assert.deepEqual(status, {
    state: 'missing',
  });
});

test('dispatches related package release workflows', async () => {
  const calls = [];
  const status = await dispatchRelatedWorkflow({
    env: {
      GH_TOKEN: 'token',
      GITHUB_API_URL: 'https://api.github.test',
      GITHUB_REF_NAME: 'production',
      GITHUB_REPOSITORY: 'tutur3u/platform',
    },
    fetchImpl: async (url, options) => {
      calls.push({ options, url });

      return {
        ok: true,
        status: 204,
        statusText: 'No Content',
      };
    },
    logger: { log() {} },
    workflowName: 'release-ai-package.yaml',
  });

  assert.deepEqual(status, {
    ref: 'production',
    state: 'dispatched',
  });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://api.github.test/repos/tutur3u/platform/actions/workflows/release-ai-package.yaml/dispatches'
  );
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    ref: 'production',
  });
});

test('waits for npm visibility and fails after bounded retries', async () => {
  const attempts = [];
  const logger = { log() {} };

  await waitForPackageVersion({
    attempts: 3,
    delayMs: 0,
    logger,
    packageName: '@tuturuuu/types',
    packageVersion: '1.0.0',
    versionExists: () => {
      attempts.push('try');
      return attempts.length === 2;
    },
  });

  assert.equal(attempts.length, 2);

  await assert.rejects(
    waitForPackageVersion({
      attempts: 2,
      delayMs: 0,
      logger,
      packageName: '@tuturuuu/devbox',
      packageVersion: '0.1.0',
      versionExists: () => false,
    }),
    /@tuturuuu\/devbox@0\.1\.0 did not become visible on npm/
  );
});

test('auto-dispatches missing related release workflows once while waiting for npm visibility', async () => {
  const statusCalls = [];
  const dispatchCalls = [];
  const versionChecks = [];

  await waitForPackageVersion({
    attempts: 3,
    delayMs: 0,
    env: {
      GITHUB_SHA: 'abc123',
    },
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchCalls.push(workflowName);
    },
    getRelatedWorkflowStatus: async () => {
      statusCalls.push('status');

      return statusCalls.length === 1
        ? { state: 'missing' }
        : { state: 'pending', status: 'queued' };
    },
    logger: { log() {} },
    packageName: '@tuturuuu/ai',
    packageVersion: '0.1.0',
    relatedWorkflow: {
      workflowName: 'release-ai-package.yaml',
    },
    versionExists: () => {
      versionChecks.push('version');
      return versionChecks.length === 3;
    },
  });

  assert.deepEqual(dispatchCalls, ['release-ai-package.yaml']);
  assert.equal(statusCalls.length, 2);
  assert.equal(versionChecks.length, 3);
});

test('auto-dispatches a deferred (succeeded but unpublished) related workflow once while waiting', async () => {
  const statusCalls = [];
  const dispatchCalls = [];
  const versionChecks = [];

  await waitForPackageVersion({
    attempts: 3,
    delayMs: 0,
    env: {
      GITHUB_SHA: 'abc123',
    },
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchCalls.push(workflowName);
    },
    getRelatedWorkflowStatus: async () => {
      statusCalls.push('status');

      return { state: 'success', url: 'https://example.test/run' };
    },
    logger: { log() {} },
    packageName: '@tuturuuu/ai',
    packageVersion: '0.1.0',
    relatedWorkflow: {
      workflowName: 'release-ai-package.yaml',
    },
    versionExists: () => {
      versionChecks.push('version');
      return versionChecks.length === 3;
    },
  });

  assert.deepEqual(dispatchCalls, ['release-ai-package.yaml']);
  assert.equal(versionChecks.length, 3);
});

test('fails package waits when recovery dispatch is denied', async () => {
  await assert.rejects(
    waitForPackageVersion({
      attempts: 3,
      delayMs: 0,
      dispatchWorkflow: async () => {
        throw new Error('Unable to dispatch release-ai-package.yaml');
      },
      getRelatedWorkflowStatus: async () => ({
        state: 'missing',
      }),
      logger: { log() {} },
      packageName: '@tuturuuu/ai',
      packageVersion: '0.1.0',
      relatedWorkflow: {
        workflowName: 'release-ai-package.yaml',
      },
      versionExists: () => false,
    }),
    /Unable to dispatch release-ai-package\.yaml/
  );
});

test('fails package waits immediately when a related release workflow failed', async () => {
  await assert.rejects(
    waitForPackageVersion({
      attempts: 3,
      delayMs: 0,
      env: {
        GITHUB_SHA: 'abc123',
      },
      getRelatedWorkflowStatus: async () => ({
        conclusion: 'failure',
        state: 'failed',
        url: 'https://example.test/run',
      }),
      logger: { log() {} },
      packageName: '@tuturuuu/internal-api',
      packageVersion: '0.3.0',
      relatedWorkflow: {
        workflowName: 'release-types-package.yaml',
      },
      versionExists: () => false,
    }),
    /@tuturuuu\/internal-api@0\.3\.0 is blocked because release-types-package\.yaml failed/
  );
});
