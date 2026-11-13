const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  dispatchDependentWorkflows,
  dispatchRelatedWorkflow,
  gateChangedPackageVersions,
} = require('./package-release-readiness.js');
const {
  silentLogger,
  writeJson,
  createVersionExists,
  git,
  initializeGitRepo,
  writeWorkflow,
  createFixtureRoot,
} = require('./package-release-test-fixtures.js');

test('dependent workflow dispatch targets direct unpublished dependents only', async () => {
  const rootDir = createFixtureRoot();
  const dispatchedWorkflows = [];

  writeJson(path.join(rootDir, 'packages/ui/package.json'), {
    dependencies: {
      '@tuturuuu/internal-api': 'workspace:*',
    },
    name: '@tuturuuu/ui',
    version: '5.0.0',
  });
  writeJson(path.join(rootDir, 'packages/sdk/package.json'), {
    dependencies: {
      '@tuturuuu/internal-api': 'workspace:*',
    },
    name: 'tuturuuu',
    version: '6.0.0',
  });
  writeWorkflow(rootDir, 'release-ui-package.yaml', 'packages/ui');
  writeWorkflow(rootDir, 'release-sdk-package.yaml', 'packages/sdk');

  const dispatched = await dispatchDependentWorkflows({
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchedWorkflows.push(workflowName);
    },
    logger: silentLogger,
    packageDir: 'packages/internal-api',
    repoRoot: rootDir,
    versionExists: createVersionExists(
      new Set(['@tuturuuu/internal-api@2.0.0', 'tuturuuu@6.0.0'])
    ),
  });

  assert.deepEqual(dispatchedWorkflows, ['release-ui-package.yaml']);
  assert.deepEqual(
    dispatched.map((dependent) => dependent.packageName),
    ['@tuturuuu/ui']
  );

  await assert.rejects(
    dispatchDependentWorkflows({
      dispatchWorkflow: async () => {
        throw new Error(
          'dispatch should not run before current package exists'
        );
      },
      logger: silentLogger,
      packageDir: 'packages/internal-api',
      repoRoot: rootDir,
      versionExists: () => false,
    }),
    /Refusing to dispatch dependent workflows before @tuturuuu\/internal-api@2\.0\.0 is visible on npm/
  );
});

test('dependent fanout continues past a deliberately disabled workflow', async () => {
  const rootDir = createFixtureRoot();
  for (const [name, packageName] of [
    ['sdk', 'tuturuuu'],
    ['ui', '@tuturuuu/ui'],
  ]) {
    writeJson(path.join(rootDir, `packages/${name}/package.json`), {
      name: packageName,
      version: '5.0.0',
      dependencies: { '@tuturuuu/internal-api': 'workspace:*' },
    });
    writeWorkflow(rootDir, `release-${name}-package.yaml`, `packages/${name}`);
  }
  const attempts = [];
  const dispatched = await dispatchDependentWorkflows({
    packageDir: 'packages/internal-api',
    repoRoot: rootDir,
    versionExists: createVersionExists(
      new Set(['@tuturuuu/internal-api@2.0.0'])
    ),
    logger: silentLogger,
    dispatchWorkflow: async ({ workflowName, skipDisabled }) => {
      assert.equal(skipDisabled, true);
      attempts.push(workflowName);
      return {
        state: workflowName.includes('sdk') ? 'disabled' : 'dispatched',
      };
    },
  });
  assert.deepEqual(attempts, [
    'release-sdk-package.yaml',
    'release-ui-package.yaml',
  ]);
  assert.deepEqual(
    dispatched.map((entry) => entry.packageName),
    ['@tuturuuu/ui']
  );
});

test('optional dependent dispatch skips disabled workflows before any POST', async () => {
  for (const state of ['disabled_manually']) {
    const methods = [];
    const result = await dispatchRelatedWorkflow({
      env: {
        GH_TOKEN: 'fixture-token',
        GITHUB_REPOSITORY: 'tutur3u/platform',
        GITHUB_REF_NAME: 'production',
      },
      skipDisabled: true,
      workflowName: 'release-sdk-package.yaml',
      logger: silentLogger,
      fetchImpl: async (url, options) => {
        methods.push(options.method);
        assert.ok(url.endsWith('/release-sdk-package.yaml'));
        return { ok: true, json: async () => ({ state }) };
      },
    });
    assert.deepEqual(result, { ref: 'production', state: 'disabled' });
    assert.deepEqual(methods, ['GET']);
  }
});

test('optional dependent dispatch fails closed for unreadable workflow state', async () => {
  for (const response of [
    { ok: false, status: 403, statusText: 'Forbidden' },
    { ok: true, json: async () => ({ state: 'disabled_inactivity' }) },
    { ok: true, json: async () => ({ state: 'unknown' }) },
  ]) {
    const methods = [];
    await assert.rejects(
      dispatchRelatedWorkflow({
        env: {
          GH_TOKEN: 'fixture-token',
          GITHUB_REPOSITORY: 'tutur3u/platform',
          GITHUB_REF_NAME: 'production',
        },
        skipDisabled: true,
        workflowName: 'release-ui-package.yaml',
        logger: silentLogger,
        fetchImpl: async (_url, options) => {
          methods.push(options.method);
          return response;
        },
      }),
      /workflow state/
    );
    assert.deepEqual(methods, ['GET']);
  }
});

test('optional dependent dispatch preserves failures after active preflight', async () => {
  const methods = [];
  await assert.rejects(
    dispatchRelatedWorkflow({
      env: {
        GH_TOKEN: 'fixture-token',
        GITHUB_REPOSITORY: 'tutur3u/platform',
        GITHUB_REF_NAME: 'production',
      },
      skipDisabled: true,
      workflowName: 'release-ui-package.yaml',
      logger: silentLogger,
      fetchImpl: async (_url, options) => {
        methods.push(options.method);
        return options.method === 'GET'
          ? { ok: true, json: async () => ({ state: 'active' }) }
          : {
              ok: false,
              status: 500,
              statusText: 'Server Error',
              text: async () => '',
            };
      },
    }),
    /500 Server Error/
  );
  assert.deepEqual(methods, ['GET', 'POST']);
});

test('platform changed package gate reports ready when changed versions are visible', async () => {
  const rootDir = createFixtureRoot();

  initializeGitRepo(rootDir);
  writeJson(path.join(rootDir, 'packages/internal-api/package.json'), {
    dependencies: {
      '@tuturuuu/types': 'workspace:*',
    },
    name: '@tuturuuu/internal-api',
    version: '2.0.1',
  });
  git(rootDir, ['add', 'packages/internal-api/package.json']);
  git(rootDir, ['commit', '-m', 'release internal api']);

  const outputs = await gateChangedPackageVersions({
    dispatchWorkflow: async () => {
      throw new Error('ready package gate should not dispatch workflows');
    },
    // Pin GITHUB_SHA: the gate diffs against it, and an ambient value from the
    // real checkout is not a valid object inside this temporary fixture repo.
    env: { GITHUB_SHA: 'HEAD' },
    getRelatedWorkflowStatus: async () => {
      throw new Error('ready package gate should not inspect workflows');
    },
    logger: silentLogger,
    repoRoot: rootDir,
    versionExists: createVersionExists(
      new Set(['@tuturuuu/internal-api@2.0.1'])
    ),
  });

  assert.equal(outputs.packages_ready, 'true');
  assert.deepEqual(JSON.parse(outputs.pending_packages), []);
});

test('platform changed package gate defers pending workflows without sleeping', async () => {
  const rootDir = createFixtureRoot();
  const dispatchedWorkflows = [];
  const inspectedWorkflows = [];

  initializeGitRepo(rootDir);
  writeJson(path.join(rootDir, 'packages/internal-api/package.json'), {
    dependencies: {
      '@tuturuuu/types': 'workspace:*',
    },
    name: '@tuturuuu/internal-api',
    version: '2.0.1',
  });
  git(rootDir, ['add', 'packages/internal-api/package.json']);
  git(rootDir, ['commit', '-m', 'release internal api']);

  const outputs = await gateChangedPackageVersions({
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchedWorkflows.push(workflowName);
    },
    env: { GITHUB_SHA: 'HEAD' },
    getRelatedWorkflowStatus: async ({ workflowName }) => {
      inspectedWorkflows.push(workflowName);
      return { state: 'pending', status: 'queued' };
    },
    logger: silentLogger,
    repoRoot: rootDir,
    versionExists: createVersionExists(new Set()),
  });

  assert.equal(outputs.packages_ready, 'false');
  assert.deepEqual(inspectedWorkflows, ['release-internal-api-package.yaml']);
  assert.deepEqual(dispatchedWorkflows, []);
  assert.deepEqual(JSON.parse(outputs.pending_packages), [
    {
      packageName: '@tuturuuu/internal-api',
      packageVersion: '2.0.1',
      state: 'queued',
      workflowName: 'release-internal-api-package.yaml',
    },
  ]);
});

test('platform changed package gate dispatches missing workflows and defers', async () => {
  const rootDir = createFixtureRoot();
  const dispatchedWorkflows = [];

  initializeGitRepo(rootDir);
  writeJson(path.join(rootDir, 'packages/types/package.json'), {
    name: '@tuturuuu/types',
    version: '1.0.1',
  });
  git(rootDir, ['add', 'packages/types/package.json']);
  git(rootDir, ['commit', '-m', 'release types']);

  const outputs = await gateChangedPackageVersions({
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchedWorkflows.push(workflowName);
    },
    env: { GITHUB_SHA: 'HEAD' },
    getRelatedWorkflowStatus: async () => ({ state: 'missing' }),
    logger: silentLogger,
    repoRoot: rootDir,
    versionExists: createVersionExists(new Set()),
  });

  assert.equal(outputs.packages_ready, 'false');
  assert.deepEqual(dispatchedWorkflows, ['release-types-package.yaml']);
  assert.deepEqual(JSON.parse(outputs.pending_packages), [
    {
      packageName: '@tuturuuu/types',
      packageVersion: '1.0.1',
      state: 'dispatched',
      workflowName: 'release-types-package.yaml',
    },
  ]);
});

test('platform changed package gate re-dispatches and defers when a release workflow succeeded but npm is still missing', async () => {
  const rootDir = createFixtureRoot();
  const dispatchedWorkflows = [];

  initializeGitRepo(rootDir);
  writeJson(path.join(rootDir, 'packages/types/package.json'), {
    name: '@tuturuuu/types',
    version: '1.0.1',
  });
  git(rootDir, ['add', 'packages/types/package.json']);
  git(rootDir, ['commit', '-m', 'release types']);

  const outputs = await gateChangedPackageVersions({
    dispatchWorkflow: async ({ workflowName }) => {
      dispatchedWorkflows.push(workflowName);
    },
    env: { GITHUB_SHA: 'HEAD' },
    getRelatedWorkflowStatus: async () => ({
      state: 'success',
      url: 'https://example.test/run',
    }),
    logger: silentLogger,
    repoRoot: rootDir,
    versionExists: createVersionExists(new Set()),
  });

  assert.equal(outputs.packages_ready, 'false');
  assert.deepEqual(dispatchedWorkflows, ['release-types-package.yaml']);
  assert.deepEqual(JSON.parse(outputs.pending_packages), [
    {
      packageName: '@tuturuuu/types',
      packageVersion: '1.0.1',
      state: 'dispatched',
      workflowName: 'release-types-package.yaml',
    },
  ]);
});

test('platform changed package gate fails fast when a release workflow failed', async () => {
  const rootDir = createFixtureRoot();

  initializeGitRepo(rootDir);
  writeJson(path.join(rootDir, 'packages/types/package.json'), {
    name: '@tuturuuu/types',
    version: '1.0.1',
  });
  git(rootDir, ['add', 'packages/types/package.json']);
  git(rootDir, ['commit', '-m', 'release types']);

  await assert.rejects(
    gateChangedPackageVersions({
      env: {
        GITHUB_SHA: 'HEAD',
      },
      getRelatedWorkflowStatus: async () => ({
        conclusion: 'failure',
        state: 'failed',
        url: 'https://example.test/run',
      }),
      logger: silentLogger,
      repoRoot: rootDir,
      versionExists: createVersionExists(new Set()),
    }),
    /@tuturuuu\/types@1\.0\.1 is blocked because release-types-package\.yaml failed/
  );
});
