const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_REGISTRY,
  gatePackageRelease,
  getDependentWorkspacePackages,
  getChangedFiles,
  getChangedPublishablePackages,
  getLatestCommitChangedFiles,
  getPublishableWorkspacePackages,
  getVersionCheckOutputs,
  getWorkspaceDependencies,
} = require('./package-release-readiness.js');
const {
  silentLogger,
  writeJson,
  createVersionExists,
  git,
  initializeGitRepo,
  createFixtureRoot,
} = require('./package-release-test-fixtures.js');

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

test('collects installed workspace prerequisites and ignores dev-only dependencies', () => {
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
    ]
  );
});

test('dependent workspace lookup retains both public defaults', () => {
  const rootDir = createFixtureRoot();
  assert.deepEqual(
    getDependentWorkspacePackages({
      packageDir: 'packages/internal-api',
      repoRoot: rootDir,
    }),
    []
  );
});

test('dependent workspace lookup retains the default version checker', () => {
  const rootDir = createFixtureRoot();
  assert.deepEqual(
    getDependentWorkspacePackages({
      packageDir: 'packages/internal-api',
      repoRoot: rootDir,
      registry: 'https://registry.example.test',
    }),
    []
  );
});

test('dependent workspace lookup supplies its default registry', () => {
  const rootDir = createFixtureRoot();
  const calls = [];
  getDependentWorkspacePackages({
    packageDir: 'packages/types',
    repoRoot: rootDir,
    versionExists(options) {
      calls.push(options);
      return false;
    },
  });
  assert.ok(calls.length > 0);
  assert.ok(calls.every(({ registry }) => registry === DEFAULT_REGISTRY));
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

test('latest commit resolver ignores earlier package changes in push batches', () => {
  const rootDir = createFixtureRoot();
  const eventPath = path.join(rootDir, 'event.json');

  initializeGitRepo(rootDir);

  writeJson(path.join(rootDir, 'packages/types/package.json'), {
    name: '@tuturuuu/types',
    version: '1.0.1',
  });
  git(rootDir, ['add', 'packages/types/package.json']);
  git(rootDir, ['commit', '-m', 'release types']);

  fs.writeFileSync(path.join(rootDir, 'README.md'), 'latest head commit\n');
  git(rootDir, ['add', 'README.md']);
  git(rootDir, ['commit', '-m', 'docs only']);

  writeJson(eventPath, {
    before: 'abc123',
    commits: [
      {
        added: [],
        modified: ['packages/types/package.json'],
        removed: [],
      },
      {
        added: ['README.md'],
        modified: [],
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
    ['README.md', 'packages/types/package.json']
  );
  assert.deepEqual(
    getLatestCommitChangedFiles({
      headRef: 'HEAD',
      repoRoot: rootDir,
    }),
    ['README.md']
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

test('release gate reports ready when publishable dependencies are visible', async () => {
  const rootDir = createFixtureRoot();
  const outputs = await gatePackageRelease({
    dispatchWorkflow: async () => {
      throw new Error('release gate should not dispatch ready dependencies');
    },
    getRelatedWorkflowStatus: async () => {
      throw new Error('release gate should not inspect ready dependencies');
    },
    logger: silentLogger,
    packageDir: 'packages/internal-api',
    repoRoot: rootDir,
    versionExists: createVersionExists(
      new Set(['@tuturuuu/types@1.0.0', '@tuturuuu/typescript-config@^3.0.0'])
    ),
  });

  assert.deepEqual(outputs, {
    dependencies_ready: 'true',
    dependent_workflows: '[]',
    package_name: '@tuturuuu/internal-api',
    package_version: '2.0.0',
    should_publish: 'true',
  });
});

test('release gate dispatches missing dependency workflows and defers without sleeping', async () => {
  const rootDir = createFixtureRoot();
  const dispatchedWorkflows = [];
  const workflowStatusChecks = [];
  const outputs = await gatePackageRelease({
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchedWorkflows.push(workflowName);
    },
    getRelatedWorkflowStatus: async ({ workflowName }) => {
      workflowStatusChecks.push(workflowName);
      return { state: 'missing' };
    },
    logger: silentLogger,
    packageDir: 'packages/internal-api',
    repoRoot: rootDir,
    versionExists: createVersionExists(
      new Set(['@tuturuuu/typescript-config@^3.0.0'])
    ),
  });

  assert.equal(outputs.should_publish, 'true');
  assert.equal(outputs.dependencies_ready, 'false');
  assert.deepEqual(workflowStatusChecks, ['release-types-package.yaml']);
  assert.deepEqual(dispatchedWorkflows, ['release-types-package.yaml']);
});

test('release gate defers pending dependency workflows without dispatching', async () => {
  const rootDir = createFixtureRoot();
  const dispatchedWorkflows = [];
  const outputs = await gatePackageRelease({
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchedWorkflows.push(workflowName);
    },
    getRelatedWorkflowStatus: async () => ({
      state: 'pending',
      status: 'queued',
    }),
    logger: silentLogger,
    packageDir: 'packages/internal-api',
    repoRoot: rootDir,
    versionExists: createVersionExists(
      new Set(['@tuturuuu/typescript-config@^3.0.0'])
    ),
  });

  assert.equal(outputs.should_publish, 'true');
  assert.equal(outputs.dependencies_ready, 'false');
  assert.deepEqual(dispatchedWorkflows, []);
});

test('release gate fails immediately when a dependency workflow failed', async () => {
  const rootDir = createFixtureRoot();

  await assert.rejects(
    gatePackageRelease({
      env: {
        GITHUB_SHA: 'abc123',
      },
      getRelatedWorkflowStatus: async () => ({
        conclusion: 'failure',
        state: 'failed',
        url: 'https://example.test/run',
      }),
      logger: silentLogger,
      packageDir: 'packages/internal-api',
      repoRoot: rootDir,
      versionExists: createVersionExists(
        new Set(['@tuturuuu/typescript-config@^3.0.0'])
      ),
    }),
    /@tuturuuu\/internal-api@2\.0\.0 is blocked because release-types-package\.yaml failed/
  );
});

test('release gate re-dispatches and defers when a dependency workflow succeeded but npm is still missing', async () => {
  const rootDir = createFixtureRoot();
  const dispatchedWorkflows = [];
  const outputs = await gatePackageRelease({
    env: {
      GITHUB_SHA: 'abc123',
    },
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchedWorkflows.push(workflowName);
    },
    getRelatedWorkflowStatus: async () => ({
      state: 'success',
      url: 'https://example.test/run',
    }),
    logger: silentLogger,
    packageDir: 'packages/internal-api',
    repoRoot: rootDir,
    versionExists: createVersionExists(
      new Set(['@tuturuuu/typescript-config@^3.0.0'])
    ),
  });

  assert.equal(outputs.should_publish, 'true');
  assert.equal(outputs.dependencies_ready, 'false');
  assert.deepEqual(dispatchedWorkflows, ['release-types-package.yaml']);
});

test('release gate fails when dependency workflow status is unreadable', async () => {
  const rootDir = createFixtureRoot();

  await assert.rejects(
    gatePackageRelease({
      getRelatedWorkflowStatus: async () => ({
        state: 'unknown',
      }),
      logger: silentLogger,
      packageDir: 'packages/internal-api',
      repoRoot: rootDir,
      versionExists: createVersionExists(
        new Set(['@tuturuuu/typescript-config@^3.0.0'])
      ),
    }),
    /cannot confirm @tuturuuu\/types@1\.0\.0 readiness because release-types-package\.yaml status is unreadable/
  );
});
