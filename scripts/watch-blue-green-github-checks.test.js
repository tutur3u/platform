const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildGitHubCheckRunContext,
  createGitHubChecksTokenProvider,
  createGitHubChecksPublisher,
  getGitHubWorkflowValidationForCommit,
  normalizeWorkflowRunValidation,
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
const GENERATED_TOKEN_ENV = {
  GITHUB_REPOSITORY: 'tutur3u/platform',
  TUTURUUU_CI_CHECKS_ENABLED: '1',
  TUTURUUU_CI_GITHUB_TOKEN_CLIENT_TOKEN: 'watcher-client-token',
  TUTURUUU_CI_GITHUB_TOKEN_URL: 'https://tuturuuu.example.com/api/token',
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

test('buildGitHubCheckRunContext prefers static tokens over generated token config', () => {
  const context = buildGitHubCheckRunContext(createDeploymentState(), {
    env: {
      ...GENERATED_TOKEN_ENV,
      TUTURUUU_CI_GITHUB_TOKEN: 'static-check-token',
    },
    now: 1000,
  });

  assert.equal(context.publishable, true);
  assert.equal(context.token, 'static-check-token');
  assert.deepEqual(context.tokenSource, {
    envName: 'TUTURUUU_CI_GITHUB_TOKEN',
    type: 'static',
  });
});

test('buildGitHubCheckRunContext auto-discovers queued watcher runtime credentials before GITHUB_TOKEN', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-checks-auto-'));
  const paths = getWatchPaths(tempDir);
  const now = Date.parse('2026-06-11T00:00:00.000Z');

  try {
    fs.mkdirSync(path.dirname(paths.githubBotRuntimeRequestFile), {
      recursive: true,
    });
    fs.writeFileSync(
      paths.githubBotRuntimeRequestFile,
      JSON.stringify(
        {
          clientId: 'client-1',
          clientToken: 'runtime-client-token',
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString(),
          kind: 'tuturuuu-github-bot-runtime-credential',
          repository: { name: 'platform', owner: 'tutur3u' },
          tokenUrl:
            'https://tuturuuu.example.com/api/v1/infrastructure/github-bot/installation-token',
        },
        null,
        2
      ),
      'utf8'
    );

    const context = buildGitHubCheckRunContext(createDeploymentState(), {
      env: {
        GITHUB_REPOSITORY: 'tutur3u/platform',
        GITHUB_TOKEN: 'fallback-token',
      },
      fsImpl: fs,
      now,
      paths,
    });
    const runtimeCredential = JSON.parse(
      fs.readFileSync(paths.githubBotRuntimeFile, 'utf8')
    );

    assert.equal(context.publishable, true);
    assert.equal(context.token, null);
    assert.deepEqual(context.tokenSource, {
      source: 'runtime',
      type: 'generated',
    });
    assert.equal(fs.existsSync(paths.githubBotRuntimeRequestFile), false);
    assert.equal(runtimeCredential.clientToken, 'runtime-client-token');
    assert.equal(runtimeCredential.kind, 'tuturuuu-github-bot-runtime-token');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('buildGitHubCheckRunContext lets explicit generated env config override runtime credentials', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'github-checks-auto-env-')
  );
  const paths = getWatchPaths(tempDir);
  const now = Date.parse('2026-06-11T00:00:00.000Z');

  try {
    fs.mkdirSync(path.dirname(paths.githubBotRuntimeFile), {
      recursive: true,
    });
    fs.writeFileSync(
      paths.githubBotRuntimeFile,
      JSON.stringify({
        clientToken: 'runtime-client-token',
        expiresAt: new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString(),
        kind: 'tuturuuu-github-bot-runtime-token',
        tokenUrl: 'https://runtime.example.com/token',
      }),
      'utf8'
    );

    const context = buildGitHubCheckRunContext(createDeploymentState(), {
      env: GENERATED_TOKEN_ENV,
      fsImpl: fs,
      now,
      paths,
    });

    assert.equal(context.publishable, true);
    assert.deepEqual(context.tokenSource, {
      source: 'env',
      type: 'generated',
    });
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('createGitHubChecksTokenProvider fetches and caches generated tokens', async () => {
  let now = Date.parse('2026-06-11T00:00:00.000Z');
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ options, url });
    return {
      json: async () => ({
        expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
        repository: { name: 'platform', owner: 'tutur3u' },
        token: `generated-${calls.length}`,
      }),
      ok: true,
      status: 200,
    };
  };
  const provider = createGitHubChecksTokenProvider({
    env: GENERATED_TOKEN_ENV,
    fetchImpl,
    now: () => now,
  });

  assert.equal(await provider.getToken(), 'generated-1');
  assert.equal(await provider.getToken(), 'generated-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, GENERATED_TOKEN_ENV.TUTURUUU_CI_GITHUB_TOKEN_URL);
  assert.equal(
    new Headers(calls[0].options.headers).get('Authorization'),
    'Bearer watcher-client-token'
  );

  now += 56 * 60 * 1000;
  assert.equal(await provider.getToken(), 'generated-2');
  assert.equal(calls.length, 2);
});

test('publishGitHubCheckRunForState uses auto-discovered watcher runtime credentials', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'github-checks-runtime-')
  );
  const paths = getWatchPaths(tempDir);
  const now = Date.parse('2026-06-11T00:00:00.000Z');
  const requestTokens = [];
  const tokenFetches = [];

  try {
    fs.mkdirSync(path.dirname(paths.githubBotRuntimeRequestFile), {
      recursive: true,
    });
    fs.writeFileSync(
      paths.githubBotRuntimeRequestFile,
      JSON.stringify({
        clientId: 'client-1',
        clientToken: 'runtime-client-token',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString(),
        kind: 'tuturuuu-github-bot-runtime-credential',
        repository: { name: 'platform', owner: 'tutur3u' },
        tokenUrl:
          'https://tuturuuu.example.com/api/v1/infrastructure/github-bot/installation-token',
      }),
      'utf8'
    );

    const env = {
      GITHUB_REPOSITORY: 'tutur3u/platform',
    };
    const tokenProvider = createGitHubChecksTokenProvider({
      env,
      fetchImpl: async (url, options) => {
        tokenFetches.push({ options, url });
        return {
          json: async () => ({
            expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
            repository: { name: 'platform', owner: 'tutur3u' },
            token: 'installation-token',
          }),
          ok: true,
          status: 200,
        };
      },
      fsImpl: fs,
      now: () => now,
      paths,
    });
    const result = await publishGitHubCheckRunForState(
      createDeploymentState(),
      {
        env,
        fsImpl: fs,
        now,
        paths,
        repository: { owner: 'tutur3u', repo: 'platform' },
        requestJson: async (_requestPath, options = {}) => {
          requestTokens.push(options.token);
          return { id: 303 };
        },
        tokenProvider,
      }
    );
    const serializedRequestBody = JSON.stringify(result.requestBody);

    assert.equal(result.status, 'created');
    assert.deepEqual(requestTokens, ['installation-token']);
    assert.equal(
      tokenFetches[0].url,
      'https://tuturuuu.example.com/api/v1/infrastructure/github-bot/installation-token'
    );
    assert.equal(
      new Headers(tokenFetches[0].options.headers).get('Authorization'),
      'Bearer runtime-client-token'
    );
    assert.doesNotMatch(serializedRequestBody, /runtime-client-token/);
    assert.doesNotMatch(serializedRequestBody, /installation-token/);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
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

test('publishGitHubCheckRunForState uses generated tokens and retries once after GitHub 401', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-checks-gen-'));
  const paths = getWatchPaths(tempDir);
  const requestTokens = [];
  let tokenCounter = 0;

  try {
    const tokenProvider = createGitHubChecksTokenProvider({
      env: GENERATED_TOKEN_ENV,
      fetchImpl: async () => ({
        json: async () => ({
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          repository: { name: 'platform', owner: 'tutur3u' },
          token: `generated-token-${++tokenCounter}`,
        }),
        ok: true,
        status: 200,
      }),
    });
    const requestJson = async (_requestPath, options = {}) => {
      requestTokens.push(options.token);
      if (requestTokens.length === 1) {
        const error = new Error('expired token');
        error.statusCode = 401;
        throw error;
      }

      return { id: 202 };
    };

    const result = await publishGitHubCheckRunForState(
      createDeploymentState(),
      {
        env: GENERATED_TOKEN_ENV,
        fsImpl: fs,
        paths,
        repository: { owner: 'tutur3u', repo: 'platform' },
        requestJson,
        tokenProvider,
      }
    );

    assert.equal(result.status, 'created');
    assert.deepEqual(requestTokens, ['generated-token-1', 'generated-token-2']);
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
        lastResult: { status: 'waiting' },
      }),
      { env: ENABLED_ENV, now: 1000 }
    ).checkState,
    { conclusion: null, status: 'queued' }
  );
});

test('normalizeWorkflowRunValidation blocks only latest failed workflow runs for a commit', () => {
  const validation = normalizeWorkflowRunValidation(
    [
      {
        conclusion: 'failure',
        created_at: '2026-06-24T01:00:00.000Z',
        head_sha: COMMIT_HASH,
        name: 'Migration E2E',
        status: 'completed',
        workflow_id: 10,
      },
      {
        conclusion: 'success',
        created_at: '2026-06-24T02:00:00.000Z',
        head_sha: COMMIT_HASH,
        name: 'Migration E2E',
        status: 'completed',
        workflow_id: 10,
      },
      {
        conclusion: 'failure',
        created_at: '2026-06-24T02:05:00.000Z',
        head_sha: COMMIT_HASH,
        html_url: 'https://github.com/tutur3u/platform/actions/runs/1',
        name: 'Production Build',
        status: 'completed',
        workflow_id: 11,
      },
      {
        conclusion: 'failure',
        created_at: '2026-06-24T03:00:00.000Z',
        head_sha: 'aaa1111111111111111111111111111111111111',
        name: 'Other commit',
        status: 'completed',
        workflow_id: 12,
      },
    ],
    COMMIT_HASH
  );

  assert.equal(validation.blocked, true);
  assert.equal(validation.status, 'failed');
  assert.equal(validation.failedRuns.length, 1);
  assert.equal(validation.failedRuns[0].name, 'Production Build');
  assert.equal(validation.successfulRuns.length, 1);
});

test('getGitHubWorkflowValidationForCommit reads workflow runs by head SHA', async () => {
  const requests = [];
  const validation = await getGitHubWorkflowValidationForCommit({
    commitHash: COMMIT_HASH,
    env: {
      GITHUB_REPOSITORY: 'tutur3u/platform',
    },
    requestJson: async (requestPath, options) => {
      requests.push({ options, requestPath });
      return {
        workflow_runs: [
          {
            conclusion: 'failure',
            head_sha: COMMIT_HASH,
            name: 'Migration E2E',
            status: 'completed',
            workflow_id: 10,
          },
        ],
      };
    },
  });

  assert.equal(validation.blocked, true);
  assert.equal(validation.failedRuns[0].name, 'Migration E2E');
  assert.match(
    requests[0].requestPath,
    /\/repos\/tutur3u\/platform\/actions\/runs\?head_sha=bbb222/u
  );
  assert.equal(requests[0].options.token, null);
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

test('createGitHubChecksPublisher reports generated token endpoint failures without leaking token config', async () => {
  const warnings = [];
  const publisher = createGitHubChecksPublisher({
    env: GENERATED_TOKEN_ENV,
    log: {
      warn(message) {
        warnings.push(message);
      },
    },
    repository: { owner: 'tutur3u', repo: 'platform' },
    tokenProvider: createGitHubChecksTokenProvider({
      env: GENERATED_TOKEN_ENV,
      fetchImpl: async () => ({
        json: async () => ({ message: 'nope' }),
        ok: false,
        status: 502,
      }),
    }),
  });

  await publisher.publish(createDeploymentState());
  const result = await publisher.flush();
  const serialized = JSON.stringify({ result, warnings });

  assert.equal(result.status, 'failed');
  assert.match(warnings[0], /GitHub token endpoint failed with status 502/);
  assert.doesNotMatch(serialized, /watcher-client-token/);
  assert.doesNotMatch(serialized, /tuturuuu\.example\.com/);
});
