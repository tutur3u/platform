const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CACHE_TAG_PREFIX,
  DEFAULT_PUBLISH_CONCURRENCY,
  SENTINEL_TAG,
  STABLE_BUILD_METADATA,
  SOURCE_REPOSITORY_LABEL,
  cleanupBundle,
  createBundleBuildEnv,
  createBundleManifest,
  createRunScopedImage,
  deletePackageVersion,
  getBundleServices,
  getCacheImage,
  getConsumerTargets,
  getReadyImage,
  parseArgs,
  parsePackageRepository,
  publishBundle,
  pullBundle,
  runWithConcurrency,
  selectPackageVersions,
  validateProjectName,
  validateRepository,
  validateTagPrefix,
  verifyPackageVisibility,
  waitForReadyImage,
} = require('./e2e-image-bundle.js');

const REPOSITORY = 'ghcr.io/tutur3u/platform-e2e';
const TAG_PREFIX = '12345-2-abcdef0123456789abcdef0123456789abcdef01';

test('validates the fixed GHCR repository and immutable tag shape', () => {
  assert.equal(validateRepository(REPOSITORY), REPOSITORY);
  assert.equal(validateTagPrefix(TAG_PREFIX), TAG_PREFIX);
  assert.equal(
    validateProjectName('ttr-e2e-123-1', 'project'),
    'ttr-e2e-123-1'
  );
  assert.deepEqual(parsePackageRepository(REPOSITORY), {
    owner: 'tutur3u',
    packageName: 'platform-e2e',
  });

  assert.throws(() => validateRepository('docker.io/tutur3u/platform-e2e'));
  assert.throws(() => validateRepository('ghcr.io/tutur3u/platform/e2e'));
  assert.throws(() => validateTagPrefix('latest'));
  assert.throws(() => validateTagPrefix('1-1-$(whoami)'));
  assert.throws(() => validateProjectName('../unsafe', 'project'));
});

test('parseArgs resolves CI interfaces and rejects missing command inputs', () => {
  const options = parseArgs(['pull'], {
    COMPOSE_PROJECT_NAME: 'ttr-migration-e2e-1-tanstack',
    E2E_IMAGE_BUNDLE_REPOSITORY: REPOSITORY,
    E2E_IMAGE_BUNDLE_TAG_PREFIX: TAG_PREFIX,
    E2E_IMAGE_BUNDLE_WAIT_SECONDS: '45',
  });

  assert.equal(options.command, 'pull');
  assert.equal(options.consumerProject, 'ttr-migration-e2e-1-tanstack');
  assert.equal(options.waitSeconds, 45);
  assert.throws(() => parseArgs(['publish'], {}));
  assert.throws(() => parseArgs(['unknown'], {}));
});

test('bundle manifest follows the blue-green planner and maps all consumer tags', () => {
  assert.deepEqual(getBundleServices({}), [
    'backend',
    'hive-blue',
    'hive-realtime',
    'markitdown',
    'meet-realtime',
    'storage-unzip-proxy',
    'tanstack-web-blue',
    'web-blue',
    'web-docker-control',
  ]);
  assert.deepEqual(getConsumerTargets('web-blue', 'consumer'), [
    'consumer-web-blue',
    'consumer-web-green',
  ]);
  assert.deepEqual(getConsumerTargets('tanstack-web-blue', 'consumer'), [
    'consumer-tanstack-web',
    'consumer-tanstack-web-blue',
    'consumer-tanstack-web-green',
  ]);

  const manifest = createBundleManifest({
    consumerProject: 'consumer',
    producerProject: 'producer',
    repository: REPOSITORY,
    tagPrefix: TAG_PREFIX,
  });
  assert.equal(manifest.length, 9);
  assert.equal(manifest[0].source, 'producer-backend');
  assert.equal(
    manifest.at(-1).remote,
    `${REPOSITORY}:${TAG_PREFIX}-web-docker-control`
  );
  assert.equal(
    getReadyImage(REPOSITORY, TAG_PREFIX),
    `${REPOSITORY}:${TAG_PREFIX}-ready`
  );
});

test('bundle build env pins metadata without changing production helpers', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bundle-env-'));
  const envFilePath = path.join(tempDir, 'web.env');

  try {
    const env = createBundleBuildEnv({
      baseEnv: { E2E_DOCKER_NATIVE_BUILD: '0' },
      envFilePath,
      producerProject: 'producer',
    });

    assert.deepEqual(
      Object.fromEntries(
        Object.keys(STABLE_BUILD_METADATA).map((key) => [key, env[key]])
      ),
      STABLE_BUILD_METADATA
    );
    assert.equal(env.DOCKER_WEB_NATIVE_BUILD, '0');
    assert.equal(env.DOCKER_WEB_CRON_RUNNER_ENABLED, '0');
    assert.equal(env.SUPERMEMORY_ENABLED, 'false');
    assert.ok(fs.existsSync(envFilePath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('publish builds the planned services once and pushes the ready marker last', async () => {
  const calls = [];
  const buildResult = {
    code: 0,
    signal: null,
    stderr: '',
    stdout: '',
    timedOut: false,
  };
  let buildOptions;
  let visibilityRepository;

  await publishBundle(
    {
      producerProject: 'producer',
      repository: REPOSITORY,
      tagPrefix: TAG_PREFIX,
    },
    {
      buildRun: async () => buildResult,
      buildServices: async (options) => {
        buildOptions = options;
      },
      env: {},
      remoteImageExists: async () => false,
      run: async (command, args) => calls.push([command, args]),
      verifyVisibility: async (repository) => {
        visibilityRepository = repository;
      },
    }
  );

  assert.deepEqual(buildOptions.services, getBundleServices({}));
  assert.equal(
    await buildOptions.runCommand('docker', ['version']),
    buildResult
  );
  assert.equal(visibilityRepository, REPOSITORY);
  assert.deepEqual(calls.at(-1), [
    'docker',
    ['push', `${REPOSITORY}:${TAG_PREFIX}-ready`],
  ]);
  assert.equal(
    calls.filter(([, args]) => args[0] === 'push').length,
    getBundleServices({}).length * 2 + 2
  );
  assert.equal(
    calls.filter(([, args]) => args[0] === 'commit').length,
    getBundleServices({}).length + 1
  );
  assert.equal(
    calls.filter(([, args]) => args[0] === 'rm').length,
    getBundleServices({}).length + 1
  );
  const sentinelPushIndex = calls.findIndex(
    ([, args]) =>
      args[0] === 'push' && args[1] === `${REPOSITORY}:${SENTINEL_TAG}`
  );
  const firstBundlePushIndex = calls.findIndex(
    ([, args]) =>
      args[0] === 'push' && args[1].startsWith(`${REPOSITORY}:${TAG_PREFIX}-`)
  );
  assert.ok(sentinelPushIndex >= 0);
  assert.ok(firstBundlePushIndex > sentinelPushIndex);
  for (const service of getBundleServices({})) {
    const cachePushIndex = calls.findIndex(
      ([, args]) =>
        args[0] === 'push' &&
        args[1] === `${REPOSITORY}:${CACHE_TAG_PREFIX}${service}`
    );
    const runPushIndex = calls.findIndex(
      ([, args]) =>
        args[0] === 'push' &&
        args[1] === `${REPOSITORY}:${TAG_PREFIX}-${service}`
    );
    assert.ok(cachePushIndex >= 0);
    assert.ok(runPushIndex > cachePushIndex);
  }
  assert.deepEqual(calls.at(-2), [
    'docker',
    [
      'tag',
      `${REPOSITORY}:${TAG_PREFIX}-backend`,
      `${REPOSITORY}:${TAG_PREFIX}-ready`,
    ],
  ]);
});

test('cache image tags are stable and reject unsafe service names', () => {
  assert.equal(
    getCacheImage(REPOSITORY, 'tanstack-web-blue'),
    `${REPOSITORY}:cache-tanstack-web-blue`
  );
  assert.equal(DEFAULT_PUBLISH_CONCURRENCY, 3);
  assert.throws(() => getCacheImage(REPOSITORY, '../unsafe'));
});

test('bundle operations enforce bounded concurrency', async () => {
  let active = 0;
  let maximum = 0;

  await runWithConcurrency(
    Array.from({ length: 9 }, (_, index) => index),
    DEFAULT_PUBLISH_CONCURRENCY,
    async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
    }
  );

  assert.equal(maximum, DEFAULT_PUBLISH_CONCURRENCY);
});

test('run-scoped image derivation reuses layers but isolates the manifest', async () => {
  const calls = [];
  const entry = {
    remote: `${REPOSITORY}:${TAG_PREFIX}-backend`,
    service: 'backend',
    source: 'producer-backend',
  };

  await createRunScopedImage(entry, {
    producerProject: 'producer',
    run: async (command, args) => calls.push([command, args]),
    tagPrefix: TAG_PREFIX,
  });

  assert.deepEqual(calls, [
    ['docker', ['image', 'inspect', 'producer-backend']],
    [
      'docker',
      ['create', '--name', 'producer-backend-bundle', 'producer-backend'],
    ],
    [
      'docker',
      [
        'commit',
        '--change',
        `LABEL io.tuturuuu.e2e-image-bundle=${TAG_PREFIX}-backend`,
        '--change',
        SOURCE_REPOSITORY_LABEL,
        'producer-backend-bundle',
        `${REPOSITORY}:${TAG_PREFIX}-backend`,
      ],
    ],
    ['docker', ['rm', '--force', 'producer-backend-bundle']],
  ]);
});

test('publish stops before run-scoped pushes when package visibility is unsafe', async () => {
  const calls = [];
  await assert.rejects(
    () =>
      publishBundle(
        {
          producerProject: 'producer',
          repository: REPOSITORY,
          tagPrefix: TAG_PREFIX,
        },
        {
          buildServices: async () => {},
          env: {},
          remoteImageExists: async () => false,
          run: async (_command, args) => calls.push(args),
          verifyVisibility: async () => {
            throw new Error('public package');
          },
        }
      ),
    /public package/u
  );
  assert.ok(
    calls.some(
      (args) =>
        args[0] === 'push' && args[1] === `${REPOSITORY}:${SENTINEL_TAG}`
    )
  );
  assert.equal(
    calls.some(
      (args) =>
        args[0] === 'push' && args[1].startsWith(`${REPOSITORY}:${TAG_PREFIX}-`)
    ),
    false
  );
});

test('publish reuses the permanent sentinel without creating stale versions', async () => {
  const calls = [];

  await publishBundle(
    {
      producerProject: 'producer',
      repository: REPOSITORY,
      tagPrefix: TAG_PREFIX,
    },
    {
      buildServices: async () => {},
      env: {},
      remoteImageExists: async (image) => image.endsWith(`:${SENTINEL_TAG}`),
      run: async (_command, args) => calls.push(args),
      verifyVisibility: async () => {},
    }
  );

  assert.equal(
    calls.some((args) => args.includes(`${REPOSITORY}:${SENTINEL_TAG}`)),
    false
  );
  assert.equal(
    calls.filter((args) => args[0] === 'push').length,
    getBundleServices({}).length * 2 + 1
  );
});

test('waitForReadyImage polls until the immutable ready tag exists', async () => {
  let attempts = 0;
  let clock = 0;
  const ready = await waitForReadyImage('image:ready', {
    now: () => clock,
    pollMs: 10,
    runForOutput: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('missing');
    },
    sleep: async (ms) => {
      clock += ms;
    },
    waitSeconds: 1,
  });

  assert.equal(ready, true);
  assert.equal(attempts, 3);
});

test('pull retags only after the complete bundle is available and enables no-build', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bundle-pull-'));
  const githubEnv = path.join(tempDir, 'github-env');
  const calls = [];

  try {
    const reused = await pullBundle(
      {
        consumerProject: 'consumer',
        repository: REPOSITORY,
        tagPrefix: TAG_PREFIX,
        waitSeconds: 1,
      },
      {
        env: { GITHUB_ENV: githubEnv },
        run: async (command, args) => calls.push([command, args]),
        runForOutput: async () => ({ stdout: '{}' }),
      }
    );

    assert.equal(reused, true);
    const firstTagIndex = calls.findIndex(([, args]) => args[0] === 'tag');
    const lastPullIndex = calls.findLastIndex(([, args]) => args[0] === 'pull');
    assert.ok(firstTagIndex > lastPullIndex);
    const output = fs.readFileSync(githubEnv, 'utf8');
    assert.match(output, /E2E_IMAGE_BUNDLE_READY=1/u);
    assert.match(output, /DOCKER_WEB_SKIP_BLUE_GREEN_WEB_BUILD=1/u);
    assert.match(output, /DOCKER_WEB_SKIP_BLUE_GREEN_SUPPORT_BUILD=1/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('pull preserves local-build fallback for missing or partial bundles', async () => {
  const missing = await pullBundle(
    {
      consumerProject: 'consumer',
      repository: REPOSITORY,
      tagPrefix: TAG_PREFIX,
      waitSeconds: 0.001,
    },
    {
      runForOutput: async () => {
        throw new Error('missing');
      },
      sleep: async () => {},
    }
  );
  assert.equal(missing, false);

  const partial = await pullBundle(
    {
      consumerProject: 'consumer',
      repository: REPOSITORY,
      tagPrefix: TAG_PREFIX,
      waitSeconds: 1,
    },
    {
      run: async (_command, args) => {
        if (args[0] === 'pull') throw new Error('partial');
      },
      runForOutput: async () => ({ stdout: '{}' }),
    }
  );
  assert.equal(partial, false);
});

test('package visibility must be private', async () => {
  await verifyPackageVisibility(REPOSITORY, {}, async () => ({
    visibility: 'private',
  }));
  await assert.rejects(() =>
    verifyPackageVisibility(REPOSITORY, {}, async () => ({
      visibility: 'public',
    }))
  );
});

test('package visibility waits for GitHub metadata propagation', async () => {
  let attempts = 0;

  await verifyPackageVisibility(
    REPOSITORY,
    {},
    async () => {
      attempts += 1;
      return attempts < 3 ? null : { visibility: 'private' };
    },
    { sleep: async () => {} }
  );

  assert.equal(attempts, 3);
});

test('cleanup selection is exact-prefix or bounded stale E2E versions only', () => {
  const versions = [
    {
      created_at: '2026-07-10T00:00:00Z',
      id: 1,
      metadata: { container: { tags: [`${TAG_PREFIX}-backend`] } },
    },
    {
      created_at: '2026-07-10T00:00:00Z',
      id: 2,
      metadata: { container: { tags: ['production'] } },
    },
    {
      created_at: '2026-07-10T00:00:00Z',
      id: 4,
      metadata: { container: { tags: ['cache-backend'] } },
    },
    {
      created_at: '2026-07-12T00:00:00Z',
      id: 3,
      metadata: { container: { tags: [] } },
    },
    {
      created_at: '2026-07-10T00:00:00Z',
      id: 5,
      metadata: { container: { tags: [] } },
    },
  ];

  assert.deepEqual(
    selectPackageVersions(versions, { tagPrefix: TAG_PREFIX }).map(
      (version) => version.id
    ),
    [1]
  );
  assert.deepEqual(
    selectPackageVersions(versions, {
      now: Date.parse('2026-07-12T12:00:00Z'),
      staleHours: 24,
    }).map((version) => version.id),
    [1, 5]
  );
});

test('cleanup deletes only selected versions and deletion retries transient errors', async () => {
  const removed = [];
  const selected = await cleanupBundle(
    {
      repository: REPOSITORY,
      tagPrefix: TAG_PREFIX,
    },
    {
      listVersions: async () => [
        {
          id: 10,
          metadata: { container: { tags: [`${TAG_PREFIX}-ready`] } },
        },
        {
          id: 11,
          metadata: { container: { tags: ['other'] } },
        },
      ],
      removeVersion: async (_repository, id) => removed.push(id),
    }
  );
  assert.deepEqual(removed, [10]);
  assert.deepEqual(
    selected.map((version) => version.id),
    [10]
  );

  let attempts = 0;
  await deletePackageVersion(REPOSITORY, 10, {
    request: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('retry');
    },
    sleep: async () => {},
  });
  assert.equal(attempts, 3);
});

test('cleanup preserves one version when no sentinel exists yet', async () => {
  const removed = [];
  const selected = await cleanupBundle(
    {
      repository: REPOSITORY,
      tagPrefix: TAG_PREFIX,
    },
    {
      listVersions: async () => [
        {
          id: 10,
          metadata: { container: { tags: [`${TAG_PREFIX}-ready`] } },
        },
        {
          id: 11,
          metadata: { container: { tags: [`${TAG_PREFIX}-backend`] } },
        },
      ],
      removeVersion: async (_repository, id) => removed.push(id),
    }
  );

  assert.deepEqual(removed, [10]);
  assert.deepEqual(
    selected.map((version) => version.id),
    [10, 11]
  );
});
