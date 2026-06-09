const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildWorkflowDispatchUrl,
  buildWorkflowRunsUrl,
  dispatchRelatedWorkflow,
  getChangedFiles,
  getChangedPublishablePackages,
  getPublishableWorkspacePackages,
  getRelatedWorkflowRunStatus,
  getVersionCheckOutputs,
  getWorkspaceDependencies,
  waitForPackageVersion,
} = require('./package-release-readiness.js');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeWorkflow(rootDir, workflowName, packageDir) {
  const workflowPath = path.join(rootDir, '.github', 'workflows', workflowName);

  fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
  fs.writeFileSync(
    workflowPath,
    [
      `name: Release ${packageDir} package`,
      'on:',
      '  push:',
      '    branches: [production]',
      '    paths:',
      `      - "${packageDir}/package.json"`,
      `      - ".github/workflows/${workflowName}"`,
      '',
    ].join('\n')
  );
}

function createFixtureRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-readiness-'));

  writeJson(path.join(rootDir, 'package.json'), {
    private: true,
    workspaces: ['packages/*'],
  });
  writeJson(path.join(rootDir, 'packages/types/package.json'), {
    name: '@tuturuuu/types',
    version: '1.0.0',
  });
  writeJson(path.join(rootDir, 'packages/internal-api/package.json'), {
    dependencies: {
      '@tuturuuu/types': 'workspace:*',
      lodash: '^4.17.21',
    },
    devDependencies: {
      '@tuturuuu/typescript-config': 'workspace:^',
    },
    name: '@tuturuuu/internal-api',
    peerDependencies: {
      '@tuturuuu/non-publishable': 'workspace:*',
    },
    version: '2.0.0',
  });
  writeJson(path.join(rootDir, 'packages/typescript-config/package.json'), {
    name: '@tuturuuu/typescript-config',
    version: '3.0.0',
  });
  writeJson(path.join(rootDir, 'packages/non-publishable/package.json'), {
    name: '@tuturuuu/non-publishable',
    version: '4.0.0',
  });

  writeWorkflow(rootDir, 'release-types-package.yaml', 'packages/types');
  writeWorkflow(
    rootDir,
    'release-internal-api-package.yaml',
    'packages/internal-api'
  );
  writeWorkflow(
    rootDir,
    'release-typescript-config-package.yaml',
    'packages/typescript-config'
  );

  return rootDir;
}

test('discovers publishable packages from release workflow package paths', () => {
  const rootDir = createFixtureRoot();
  const publishablePackages = getPublishableWorkspacePackages(rootDir);

  assert.deepEqual([...publishablePackages.keys()].sort(), [
    '@tuturuuu/internal-api',
    '@tuturuuu/types',
    '@tuturuuu/typescript-config',
  ]);
  assert.equal(
    publishablePackages.get('@tuturuuu/internal-api').workflowName,
    'release-internal-api-package.yaml'
  );
});

test('collects publishable workspace dependencies across manifest fields', () => {
  const rootDir = createFixtureRoot();

  assert.deepEqual(
    getWorkspaceDependencies({
      packageDir: 'packages/internal-api',
      repoRoot: rootDir,
    }).map((dependency) => ({
      field: dependency.field,
      packageName: dependency.packageName,
      packageVersion: dependency.packageVersion,
    })),
    [
      {
        field: 'dependencies',
        packageName: '@tuturuuu/types',
        packageVersion: '1.0.0',
      },
      {
        field: 'devDependencies',
        packageName: '@tuturuuu/typescript-config',
        packageVersion: '^3.0.0',
      },
    ]
  );
});

test('detects changed publishable package manifests', () => {
  const rootDir = createFixtureRoot();

  assert.deepEqual(
    getChangedPublishablePackages({
      changedFiles: [
        'packages/internal-api/package.json',
        'packages/non-publishable/package.json',
        'README.md',
      ],
      repoRoot: rootDir,
    }).map((packageInfo) => packageInfo.packageDir),
    ['packages/internal-api']
  );
});

test('prefers push event changed files when available', () => {
  const rootDir = createFixtureRoot();
  const eventPath = path.join(rootDir, 'event.json');

  writeJson(eventPath, {
    before: '0000000000000000000000000000000000000000',
    commits: [
      {
        added: ['README.md'],
        modified: ['packages/types/package.json'],
        removed: ['packages/unused/package.json'],
      },
      {
        added: [],
        modified: ['packages/internal-api/package.json'],
        removed: [],
      },
    ],
  });

  assert.deepEqual(
    getChangedFiles({
      env: {
        GITHUB_EVENT_PATH: eventPath,
      },
      repoRoot: rootDir,
    }),
    [
      'README.md',
      'packages/internal-api/package.json',
      'packages/types/package.json',
      'packages/unused/package.json',
    ]
  );
});

test('reports whether a package version should publish', () => {
  const rootDir = createFixtureRoot();
  const existingVersion = getVersionCheckOutputs({
    packageDir: 'packages/types',
    repoRoot: rootDir,
    versionExists: () => true,
  });
  const missingVersion = getVersionCheckOutputs({
    packageDir: 'packages/types',
    repoRoot: rootDir,
    versionExists: () => false,
  });

  assert.deepEqual(existingVersion, {
    package_name: '@tuturuuu/types',
    package_version: '1.0.0',
    should_publish: 'false',
  });
  assert.deepEqual(missingVersion, {
    package_name: '@tuturuuu/types',
    package_version: '1.0.0',
    should_publish: 'true',
  });
});

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
