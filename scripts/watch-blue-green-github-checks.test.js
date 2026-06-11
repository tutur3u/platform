const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildGitHubCheckRunContext,
  createGitHubChecksPublisher,
  publishGitHubCheckRunForState,
  readGitHubChecksState,
} = require('./watch-blue-green/github-checks.js');
const { getWatchPaths } = require('./watch-blue-green/paths.js');

const COMMIT_HASH = 'bbb2222222222222222222222222222222222222';
const ENABLED_ENV = {
  GITHUB_REPOSITORY: 'tutur3u/platform',
  TUTURUUU_CI_CHECKS_ENABLED: '1',
  TUTURUUU_CI_GITHUB_TOKEN: 'test-token',
};

function createDeploymentState(overrides = {}) {
  return {
    deployments: [
      {
        buildDurationMs: 69_000,
        commitHash: COMMIT_HASH,
        commitShortHash: 'bbb222',
        commitSubject: 'Do not publish this subject',
        deploymentKind: 'promotion',
        finishedAt: 70_000,
        stages: [
          {
            id: 'web-build',
            skippedReason: 'secret=hidden',
            status: 'succeeded',
          },
          { id: 'proxy-reload', status: 'succeeded' },
        ],
        startedAt: 1_000,
        status: 'successful',
      },
    ],
    lastDeployAt: 70_000,
    lastDeployStatus: 'successful',
    lastResult: {
      error: new Error(
        'Bearer secret-token for ops@example.com at /Users/vhpx/private https://secret.internal.local?token=abc'
      ),
      status: 'deployed',
    },
    latestCommit: {
      hash: COMMIT_HASH,
      shortHash: 'bbb222',
      subject: 'Do not publish this subject either',
    },
    logs: [
      {
        message:
          'client_secret=abc123 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
      },
    ],
    startedAt: 500,
    target: {
      branch: 'production',
      upstreamRef: 'origin/production',
    },
    ...overrides,
  };
}

test('buildGitHubCheckRunContext skips disabled and missing-token configs', () => {
  assert.deepEqual(
    buildGitHubCheckRunContext(createDeploymentState(), {
      env: {},
      now: 1000,
    }),
    {
      publishable: false,
      reason: 'disabled',
    }
  );

  assert.deepEqual(
    buildGitHubCheckRunContext(createDeploymentState(), {
      env: { TUTURUUU_CI_CHECKS_ENABLED: '1' },
      now: 1000,
    }),
    {
      publishable: false,
      reason: 'missing-token',
    }
  );
});

test('buildGitHubCheckRunContext emits only allowlisted sanitized metadata', () => {
  const context = buildGitHubCheckRunContext(createDeploymentState(), {
    env: ENABLED_ENV,
    now: 1000,
  });
  const serialized = JSON.stringify(context.createBody);

  assert.equal(context.publishable, true);
  assert.equal(context.createBody.name, 'Tuturuuu CI');
  assert.equal(context.createBody.head_sha, COMMIT_HASH);
  assert.equal(context.createBody.status, 'completed');
  assert.equal(context.createBody.conclusion, 'success');
  assert.match(context.createBody.output.summary, /Watcher status: deployed/);
  assert.match(
    context.createBody.output.summary,
    /Current stage: Proxy reload/
  );
  assert.match(context.createBody.output.text, /Web build/);
  assert.doesNotMatch(serialized, /Do not publish/);
  assert.doesNotMatch(serialized, /secret-token/);
  assert.doesNotMatch(serialized, /ops@example\.com/);
  assert.doesNotMatch(serialized, /Users\/vhpx/);
  assert.doesNotMatch(serialized, /secret\.internal\.local/);
  assert.doesNotMatch(serialized, /token=abc/);
  assert.doesNotMatch(serialized, /client_secret=abc123/);
  assert.doesNotMatch(serialized, /eyJhbGci/);
});

test('publishGitHubCheckRunForState creates once and updates the stored check run', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-checks-'));
  const paths = getWatchPaths(tempDir);
  const calls = [];

  try {
    const requestJson = async (requestPath, options = {}) => {
      calls.push({
        body: options.body,
        method: options.method,
        requestPath,
        token: options.token,
      });

      return { id: 101 };
    };

    const created = await publishGitHubCheckRunForState(
      createDeploymentState(),
      {
        env: ENABLED_ENV,
        fsImpl: fs,
        paths,
        requestJson,
      }
    );
    const failedState = createDeploymentState({
      deployments: [
        {
          commitHash: COMMIT_HASH,
          commitShortHash: 'bbb222',
          deploymentKind: 'promotion',
          finishedAt: 80_000,
          stages: [
            { id: 'web-build', status: 'succeeded' },
            { id: 'proxy-reload', status: 'failed' },
          ],
          startedAt: 1_000,
          status: 'failed',
        },
      ],
      lastDeployStatus: 'failed',
      lastResult: {
        status: 'deploy-failed',
      },
    });
    const updated = await publishGitHubCheckRunForState(failedState, {
      env: ENABLED_ENV,
      fsImpl: fs,
      paths,
      requestJson,
    });
    const stored = readGitHubChecksState(paths.githubChecksFile, fs);

    assert.equal(created.status, 'created');
    assert.equal(updated.status, 'updated');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].requestPath, '/repos/tutur3u/platform/check-runs');
    assert.equal(calls[0].token, 'test-token');
    assert.equal(calls[1].method, 'PATCH');
    assert.equal(
      calls[1].requestPath,
      '/repos/tutur3u/platform/check-runs/101'
    );
    assert.equal(calls[1].body.conclusion, 'failure');
    assert.equal(
      stored.checkRuns[`Tuturuuu CI:${COMMIT_HASH}`].checkRunId,
      101
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('publishGitHubCheckRunForState skips when token is missing without calling GitHub', async () => {
  const calls = [];
  const result = await publishGitHubCheckRunForState(createDeploymentState(), {
    env: {
      GITHUB_REPOSITORY: 'tutur3u/platform',
      TUTURUUU_CI_CHECKS_ENABLED: '1',
    },
    requestJson: async () => {
      calls.push('called');
    },
  });

  assert.deepEqual(result, {
    reason: 'missing-token',
    status: 'skipped',
  });
  assert.deepEqual(calls, []);
});

test('buildGitHubCheckRunContext maps watcher statuses to GitHub check states', () => {
  assert.deepEqual(
    buildGitHubCheckRunContext(
      createDeploymentState({
        deployments: [
          {
            commitHash: COMMIT_HASH,
            deploymentKind: 'promotion',
            startedAt: 1000,
            status: 'deploying',
          },
        ],
        lastResult: { status: 'up-to-date' },
      }),
      { env: ENABLED_ENV, now: 1000 }
    ).checkState,
    { conclusion: null, status: 'in_progress' }
  );
  assert.deepEqual(
    buildGitHubCheckRunContext(
      createDeploymentState({
        deployments: [],
        lastResult: { status: 'dirty' },
      }),
      { env: ENABLED_ENV, now: 1000 }
    ).checkState,
    { conclusion: 'action_required', status: 'completed' }
  );
  assert.deepEqual(
    buildGitHubCheckRunContext(
      createDeploymentState({
        deployments: [],
        lastResult: { status: 'up-to-date' },
      }),
      { env: ENABLED_ENV, now: 1000 }
    ).checkState,
    { conclusion: 'neutral', status: 'completed' }
  );
  assert.deepEqual(
    buildGitHubCheckRunContext(
      createDeploymentState({
        deployments: [],
        lastResult: { status: 'production-prebuild-check' },
      }),
      { env: ENABLED_ENV, now: 1000 }
    ).checkState,
    { conclusion: null, status: 'queued' }
  );
});

test('createGitHubChecksPublisher catches GitHub API failures and dedupes unchanged payloads', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-checks-fail-'));
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const warnings = [];

  try {
    const publisher = createGitHubChecksPublisher({
      env: ENABLED_ENV,
      fsImpl: fs,
      log: {
        warn(message) {
          warnings.push(message);
        },
      },
      paths,
      repository: { owner: 'tutur3u', repo: 'platform' },
      requestJson: async () => {
        calls.push('called');
        throw new Error('api down');
      },
    });

    await publisher.publish(createDeploymentState());
    const failed = await publisher.flush();
    const unchanged = await publisher.publish(createDeploymentState());

    assert.equal(failed.status, 'failed');
    assert.equal(unchanged.status, 'unchanged');
    assert.equal(calls.length, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Unable to publish Tuturuuu CI GitHub Check Run/);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
