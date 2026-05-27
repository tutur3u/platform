const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BLUE_GREEN_DEFERRED_SUPPORT_SERVICES,
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_SUPPORT_SERVICES,
  BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE,
  CLOUDFLARED_SERVICE,
  COMPOSE_FILE,
  DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS,
  DEFAULT_BUILDER_NAME,
  DOCKER_HOST_ALIAS,
  DOCKER_MARKITDOWN_ENDPOINT_URL,
  DOCKER_MARKITDOWN_SERVICE_URL,
  DOCKER_PRONUNCIATION_ASSESSOR_URL,
  DOCKER_STORAGE_UNZIP_PROXY_URL,
  PROD_COMPOSE_FILE,
  WEB_ENV_FILE,
  clearBlueGreenRuntime,
  describeActiveDeploymentConflict,
  ensureRequiredComposeEnvironment,
  getActiveDeploymentConflict,
  getBlueGreenBuildTimeoutMs,
  getBlueGreenDeploymentChangedFiles,
  getBlueGreenHiveServiceName,
  getBlueGreenPaths,
  getComposeEnvironment,
  getComposeFile,
  getInPlaceProdServices,
  parseArgs,
  parseEnvFile,
  readBlueGreenActiveColor,
  readBlueGreenProxyActiveColor,
  renderBlueGreenProxyConfig,
  resolveBlueGreenActiveColor,
  resolveManualBlueGreenBuildConflict,
  rewriteLocalhostUrl,
  runComposeUpWithNameConflictRecovery,
  runDockerWebWorkflow,
  usesBlueGreenStrategy,
  writeBlueGreenActiveColor,
} = require('./docker-web.js');
const {
  buildBlueGreenServices,
  getBlueGreenBuildxBakeArgs,
  getBlueGreenComposeMigration,
  getBlueGreenDeploymentBuildServices,
  hasComposeServiceExpectedImage,
  hasBlueGreenProxyHostPortBindings,
  runBlueGreenProdWorkflow,
  runBlueGreenCachedRecoveryWorkflow,
  testBlueGreenHiveProxyRouting,
} = require('./docker-web/blue-green.js');
const { getWatchPaths } = require('./watch-blue-green/paths.js');
const { writeDeploymentHistory } = require('./watch-blue-green/history.js');
const {
  writeDeploymentBuildLock,
} = require('./watch-blue-green/build-lock.js');
const {
  CONTAINER_REFRESH_EXIT_CODE,
  getStatusSnapshotHealth,
  shouldRestartWatcherExit,
} = require('../apps/web/docker/blue-green-watcher-entrypoint.js');
const { WATCHER_CONTAINER_ENV } = require('./watch-blue-green-deploy.js');

const BLUE_GREEN_PROXY_PORTS_JSON = JSON.stringify({
  '7803/tcp': [{ HostIp: '0.0.0.0', HostPort: '7803' }],
  '7814/tcp': [{ HostIp: '0.0.0.0', HostPort: '7814' }],
});

function isHiveDbMigrateRun(command, args) {
  return (
    command === 'docker' &&
    args[0] === 'compose' &&
    args.includes('run') &&
    args.includes('--rm') &&
    !args.includes('--no-build') &&
    args.at(-1) === 'hive-db-migrate'
  );
}

test('getBlueGreenDeploymentBuildServices builds only the web lane for web-only changes', () => {
  assert.deepEqual(
    getBlueGreenDeploymentBuildServices({
      changedFiles: ['apps/web/src/app/page.tsx'],
      targetColor: 'green',
    }),
    ['web-green']
  );
});

test('renderBlueGreenProxyConfig can route web and Hive to different active colors', () => {
  const config = renderBlueGreenProxyConfig('green', {
    hiveColor: 'blue',
    hiveStandbyColor: 'green',
    standbyColor: 'blue',
  });

  assert.match(
    config,
    /upstream web_upstream \{\n {2}zone web_upstream 64k;\n {2}server web-green:7803 resolve/u
  );
  assert.match(
    config,
    /upstream hive_app_upstream \{\n {2}zone hive_app_upstream 64k;\n {2}server hive-blue:7814 resolve/u
  );
  assert.match(
    config,
    /server hive-green:7814 backup resolve max_fails=1 fail_timeout=5s;/u
  );
});

test('testBlueGreenHiveProxyRouting retries transient proxy failures', async () => {
  const calls = [];

  await testBlueGreenHiveProxyRouting({
    composeFile: '/tmp/docker-compose.yml',
    routeCheckDelayMs: 0,
    runCommand: async (command, args) => {
      calls.push({ args, command });

      if (calls.length < 3) {
        return {
          code: 1,
          stderr: 'wget: server returned error: HTTP/1.1 502 Bad Gateway',
          stdout: '',
        };
      }

      return { code: 0, stderr: '', stdout: '' };
    },
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.command, 'docker');
  assert.deepEqual(calls[0]?.args.slice(-8), [
    'exec',
    '-T',
    BLUE_GREEN_PROXY_SERVICE,
    'wget',
    '-q',
    '-O',
    '/dev/null',
    'http://127.0.0.1:7814/login',
  ]);
});

test('testBlueGreenHiveProxyRouting keeps the final proxy failure detail', async () => {
  await assert.rejects(
    () =>
      testBlueGreenHiveProxyRouting({
        composeFile: '/tmp/docker-compose.yml',
        routeCheckAttempts: 2,
        routeCheckDelayMs: 0,
        runCommand: async () => ({
          code: 1,
          stderr: 'wget: server returned error: HTTP/1.1 502 Bad Gateway',
          stdout: '',
        }),
      }),
    /502 Bad Gateway/u
  );
});

test('getBlueGreenDeploymentBuildServices scopes support image builds to changed sources', () => {
  assert.deepEqual(
    getBlueGreenDeploymentBuildServices({
      changedFiles: [
        'apps/hive/src/app/page.tsx',
        'apps/storage-unzip-proxy/src/server.js',
      ],
      targetColor: 'blue',
    }),
    ['web-blue', 'hive-blue', 'storage-unzip-proxy']
  );
  assert.deepEqual(
    getBlueGreenDeploymentBuildServices({
      changedFiles: ['apps/hive/db/migrations/20260518120000_add_field.sql'],
      targetColor: 'green',
    }),
    ['web-green', 'hive-green']
  );
  assert.deepEqual(
    getBlueGreenDeploymentBuildServices({
      changedFiles: ['bun.lock'],
      targetColor: 'green',
    }),
    [
      'web-green',
      'hive-green',
      'hive-realtime',
      'meet-realtime',
      'markitdown',
      'storage-unzip-proxy',
      'web-cron-runner',
    ]
  );
});

test('getBlueGreenDeploymentChangedFiles diffs from the latest successful deploy', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-changed-files-')
  );
  const paths = getWatchPaths(tempDir);
  const calls = [];

  try {
    writeDeploymentHistory(
      [
        {
          commitHash: 'aaa111',
          status: 'successful',
        },
      ],
      paths,
      fs
    );

    const changedFiles = await getBlueGreenDeploymentChangedFiles({
      env: { PATH: 'test-path' },
      fsImpl: fs,
      latestCommit: { hash: 'bbb222' },
      rootDir: tempDir,
      runCommand: async (command, args, options = {}) => {
        calls.push([command, args, options.cwd]);
        return {
          code: 0,
          signal: null,
          stderr: '',
          stdout: 'apps/web/src/app/page.tsx\n',
        };
      },
    });

    assert.deepEqual(changedFiles, ['apps/web/src/app/page.tsx']);
    assert.deepEqual(calls, [
      ['git', ['diff', '--name-only', 'aaa111', 'bbb222'], tempDir],
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

function createFsStub({ envFileContent = '', hasEnvFile = true } = {}) {
  return {
    existsSync(targetPath) {
      if (targetPath === WEB_ENV_FILE) {
        return hasEnvFile;
      }

      return false;
    },
    mkdirSync() {},
    readFileSync(targetPath) {
      if (targetPath !== WEB_ENV_FILE) {
        throw new Error(`Unexpected read for ${targetPath}`);
      }

      return envFileContent;
    },
    rmSync() {},
    writeFileSync() {},
  };
}

function createSnapshotFsStub(snapshot = null) {
  return {
    existsSync() {
      return snapshot != null;
    },
    readFileSync() {
      return JSON.stringify(snapshot);
    },
  };
}

test('parseArgs keeps redis profile before the compose action', () => {
  assert.deepEqual(parseArgs(['up', '--profile', 'redis', '-d']), {
    action: 'up',
    buildBuilderName: null,
    buildCpus: null,
    buildMaxParallelism: null,
    buildMemory: null,
    cancelActiveBuild: false,
    composeArgs: ['-d'],
    composeGlobalArgs: ['--profile', 'redis'],
    mode: 'dev',
    resetSupabase: false,
    strategy: 'in-place',
    withSupabase: false,
    withRedis: true,
  });
});

test('parseArgs accepts prod mode and blue-green strategy', () => {
  assert.deepEqual(
    parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green']),
    {
      action: 'up',
      buildBuilderName: null,
      buildCpus: null,
      buildMaxParallelism: null,
      buildMemory: null,
      cancelActiveBuild: false,
      composeArgs: [],
      composeGlobalArgs: ['--profile', 'redis'],
      mode: 'prod',
      resetSupabase: false,
      strategy: 'blue-green',
      withSupabase: false,
      withRedis: true,
    }
  );
});

test('parseArgs allows dockerized commands to disable the bundled redis stack', () => {
  assert.deepEqual(parseArgs(['up', '--without-redis']), {
    action: 'up',
    buildBuilderName: null,
    buildCpus: null,
    buildMaxParallelism: null,
    buildMemory: null,
    cancelActiveBuild: false,
    composeArgs: [],
    composeGlobalArgs: [],
    mode: 'dev',
    resetSupabase: false,
    strategy: 'in-place',
    withSupabase: false,
    withRedis: false,
  });
});

test('parseArgs enables cloudflared as an explicit Docker profile', () => {
  const parsed = parseArgs(['up', '--mode', 'prod', '--with-cloudflared']);

  assert.deepEqual(parsed.composeGlobalArgs, [
    '--profile',
    'cloudflared',
    '--profile',
    'redis',
  ]);
  assert.deepEqual(getInPlaceProdServices(parsed), [
    'web',
    'redis',
    'serverless-redis-http',
    CLOUDFLARED_SERVICE,
  ]);
});

test('parseArgs accepts build resource throttling flags', () => {
  assert.deepEqual(
    parseArgs([
      'up',
      '--build-memory',
      '4g',
      '--build-cpus',
      '2',
      '--build-max-parallelism',
      '2',
      '--build-builder-name',
      'platform-web-throttled',
    ]),
    {
      action: 'up',
      buildBuilderName: 'platform-web-throttled',
      buildCpus: '2',
      buildMaxParallelism: '2',
      buildMemory: '4g',
      cancelActiveBuild: false,
      composeArgs: [],
      composeGlobalArgs: ['--profile', 'redis'],
      mode: 'dev',
      resetSupabase: false,
      strategy: 'in-place',
      withSupabase: false,
      withRedis: true,
    }
  );
});

test('parseArgs accepts manual active build cancellation override', () => {
  assert.equal(
    parseArgs([
      'up',
      '--mode',
      'prod',
      '--strategy',
      'blue-green',
      '--cancel-active-build',
    ]).cancelActiveBuild,
    true
  );
});

test('parseArgs accepts an explicit Docker web env file', () => {
  assert.equal(
    parseArgs(['up', '--env-file', 'tmp/e2e/web.env']).envFilePath,
    'tmp/e2e/web.env'
  );
  assert.throws(
    () => parseArgs(['up', '--env-file']),
    /Expected an env file path/
  );
});

test('getBlueGreenBuildTimeoutMs reads the build watchdog timeout from env', () => {
  assert.equal(
    getBlueGreenBuildTimeoutMs({}),
    DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS
  );
  assert.equal(
    getBlueGreenBuildTimeoutMs({ DOCKER_WEB_BUILD_TIMEOUT_MS: '1234' }),
    1234
  );
  assert.throws(
    () => getBlueGreenBuildTimeoutMs({ DOCKER_WEB_BUILD_TIMEOUT_MS: 'nope' }),
    /DOCKER_WEB_BUILD_TIMEOUT_MS/
  );
});

test('usesBlueGreenStrategy only enables blue-green for production', () => {
  assert.equal(
    usesBlueGreenStrategy(
      parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green'])
    ),
    true
  );
  assert.equal(
    usesBlueGreenStrategy(parseArgs(['up', '--strategy', 'blue-green'])),
    false
  );
});

test('watcher entrypoint treats missing startup snapshots as restartable after grace', () => {
  assert.deepEqual(
    getStatusSnapshotHealth({
      fsImpl: createSnapshotFsStub(null),
      now: 11_000,
      startGraceMs: 15_000,
      startedAt: 0,
      statusFile: '/tmp/missing-status.json',
    }),
    {
      reason: null,
      status: 'starting',
    }
  );

  const health = getStatusSnapshotHealth({
    fsImpl: createSnapshotFsStub(null),
    now: 16_000,
    startGraceMs: 15_000,
    startedAt: 0,
    statusFile: '/tmp/missing-status.json',
  });

  assert.equal(health.status, 'missing');
  assert.match(health.reason, /status snapshot missing/);
});

test('watcher entrypoint detects stale status snapshots from watcher interval', () => {
  assert.deepEqual(
    getStatusSnapshotHealth({
      fsImpl: createSnapshotFsStub({ intervalMs: 5_000, updatedAt: 20_000 }),
      now: 30_000,
      startedAt: 0,
      staleGraceMs: 1_000,
      statusFile: '/tmp/status.json',
    }),
    {
      reason: null,
      status: 'live',
    }
  );

  const health = getStatusSnapshotHealth({
    fsImpl: createSnapshotFsStub({ intervalMs: 5_000, updatedAt: 20_000 }),
    now: 45_001,
    startedAt: 0,
    staleGraceMs: 1_000,
    statusFile: '/tmp/status.json',
  });

  assert.equal(health.status, 'stale');
  assert.match(health.reason, /status snapshot stale/);
});

test('watcher entrypoint allows stale snapshots during active deployments until the build timeout', () => {
  const activeSnapshot = {
    deployments: [
      {
        startedAt: 20_000,
        status: 'building',
      },
    ],
    intervalMs: 5_000,
    updatedAt: 20_000,
  };

  assert.deepEqual(
    getStatusSnapshotHealth({
      activeDeploymentGraceMs: 1_000,
      env: { DOCKER_WEB_WATCHER_BUILD_TIMEOUT_MS: '30000' },
      fsImpl: createSnapshotFsStub(activeSnapshot),
      now: 45_001,
      startedAt: 0,
      staleGraceMs: 1_000,
      statusFile: '/tmp/status.json',
    }),
    {
      reason: null,
      status: 'active-deployment',
    }
  );

  const health = getStatusSnapshotHealth({
    activeDeploymentGraceMs: 1_000,
    env: { DOCKER_WEB_WATCHER_BUILD_TIMEOUT_MS: '30000' },
    fsImpl: createSnapshotFsStub(activeSnapshot),
    now: 51_001,
    startedAt: 0,
    staleGraceMs: 1_000,
    statusFile: '/tmp/status.json',
  });

  assert.equal(health.status, 'stale');
  assert.match(health.reason, /status snapshot stale/);
});

test('watcher entrypoint restarts crashed or stale child processes', () => {
  assert.equal(
    shouldRestartWatcherExit(
      { code: 1, restartReason: null, signal: null },
      [],
      { stopRequested: false }
    ),
    true
  );
  assert.equal(
    shouldRestartWatcherExit(
      { code: 0, restartReason: null, signal: null },
      [],
      { stopRequested: false }
    ),
    false
  );
  assert.equal(
    shouldRestartWatcherExit(
      { code: 0, restartReason: 'status snapshot stale', signal: null },
      [],
      { stopRequested: false }
    ),
    true
  );
  assert.equal(
    shouldRestartWatcherExit(
      { code: 1, restartReason: null, signal: null },
      ['--once'],
      { stopRequested: false }
    ),
    false
  );
  assert.equal(
    shouldRestartWatcherExit(
      {
        code: CONTAINER_REFRESH_EXIT_CODE,
        restartReason: null,
        signal: null,
      },
      [],
      { stopRequested: false }
    ),
    false
  );
});

test('resolveBlueGreenActiveColor promotes a healthy standby over an unhealthy persisted active color', async () => {
  const activeColor = await resolveBlueGreenActiveColor('blue', {
    composeFile: PROD_COMPOSE_FILE,
    env: { PATH: 'test-path' },
    runCommand: async (command, args) => {
      const key = `${command} ${args.join(' ')}`;

      if (key === `docker compose -f ${PROD_COMPOSE_FILE} ps -q web-blue`) {
        return { code: 0, signal: null, stderr: '', stdout: 'blue-123\n' };
      }

      if (key === `docker compose -f ${PROD_COMPOSE_FILE} ps -q web-green`) {
        return { code: 0, signal: null, stderr: '', stdout: 'green-123\n' };
      }

      if (
        key ===
        'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} blue-123'
      ) {
        return { code: 0, signal: null, stderr: '', stdout: 'unhealthy\n' };
      }

      if (
        key ===
        'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} green-123'
      ) {
        return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
      }

      throw new Error(`Unexpected command: ${key}`);
    },
  });

  assert.equal(activeColor, 'green');
});

test('readBlueGreenProxyActiveColor recovers the primary lane from nginx config', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-proxy-active-')
  );
  const paths = getBlueGreenPaths(tempDir);

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.proxyConfigFile,
      renderBlueGreenProxyConfig('green', { standbyColor: 'blue' }),
      'utf8'
    );

    assert.equal(readBlueGreenProxyActiveColor(paths), 'green');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('parseEnvFile ignores comments and unquotes values', () => {
  const fsStub = createFsStub({
    envFileContent: [
      '# Comment',
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001 # local',
      'SUPABASE_ANON_KEY="value-with-#-inside"',
      'SUPABASE_SECRET_KEY=test-secret',
    ].join('\n'),
  });

  assert.deepEqual(parseEnvFile(WEB_ENV_FILE, fsStub), {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:8001',
    SUPABASE_ANON_KEY: 'value-with-#-inside',
    SUPABASE_SECRET_KEY: 'test-secret',
  });
});

test('getComposeEnvironment prefers root .env.local and falls back to apps/web/.env.local', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-root-env-')
  );
  const rootEnvFile = path.join(tempDir, '.env.local');
  const legacyEnvFile = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(legacyEnvFile), { recursive: true });
    fs.writeFileSync(
      legacyEnvFile,
      'NEXT_PUBLIC_SUPABASE_URL=https://legacy.supabase.co\n'
    );
    fs.writeFileSync(
      rootEnvFile,
      'NEXT_PUBLIC_SUPABASE_URL=https://root.supabase.co\n'
    );

    const rootEnv = getComposeEnvironment({
      baseEnv: { PATH: 'test-path' },
      envFilePath: rootEnvFile,
      rootDir: tempDir,
    });

    assert.equal(rootEnv.SUPABASE_SERVER_URL, 'https://root.supabase.co');
    assert.equal(rootEnv.DOCKER_WEB_ENV_FILE, '.env.local');

    fs.rmSync(rootEnvFile, { force: true });

    const legacyEnv = getComposeEnvironment({
      baseEnv: { PATH: 'test-path' },
      envFilePath: rootEnvFile,
      rootDir: tempDir,
    });

    assert.equal(legacyEnv.SUPABASE_SERVER_URL, 'https://legacy.supabase.co');
    assert.equal(legacyEnv.DOCKER_WEB_ENV_FILE, 'apps/web/.env.local');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('rewriteLocalhostUrl maps local URLs to the Docker host alias', () => {
  assert.equal(
    rewriteLocalhostUrl('http://localhost:8001'),
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(
    rewriteLocalhostUrl('http://[::1]:8001'),
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(
    rewriteLocalhostUrl('https://127.0.0.1:9999/path'),
    `https://${DOCKER_HOST_ALIAS}:9999/path`
  );
  assert.equal(
    rewriteLocalhostUrl('https://example.supabase.co'),
    'https://example.supabase.co'
  );
});

test('getComposeEnvironment derives a server-side Supabase URL for Docker', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-web-env-'));
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8001\n'
    );

    const env = getComposeEnvironment({
      baseEnv: { PATH: 'test-path' },
      envFilePath,
      rootDir: tempDir,
    });

    assert.equal(env.PATH, 'test-path');
    assert.equal(env.BUILDX_NO_DEFAULT_ATTESTATIONS, '1');
    assert.equal(env.COMPOSE_DOCKER_CLI_BUILD, '1');
    assert.equal(env.COMPOSE_PROJECT_NAME, path.basename(tempDir));
    assert.equal(env.SUPABASE_URL, `http://${DOCKER_HOST_ALIAS}:8001/`);
    assert.equal(env.SUPABASE_SERVER_URL, `http://${DOCKER_HOST_ALIAS}:8001/`);
    assert.equal(env.DOCKER_BUILDKIT, '1');
    assert.equal(env.DOCKER_WEB_ENV_FILE, 'apps/web/.env.local');
    assert.equal(env.DOCKER_WEB_COMPOSE_ENV_FILE, '../apps/web/.env.local');
    assert.equal(
      env.DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE,
      '../apps/web/.env.local'
    );
    assert.equal(env.MARKITDOWN_ENDPOINT_URL, undefined);
    assert.equal(env.DRIVE_AUTO_EXTRACT_PROXY_URL, undefined);
    assert.equal(env.INTERNAL_WEB_API_ORIGIN, undefined);
    assert.equal(env.UPSTASH_REDIS_REST_URL, 'http://serverless-redis-http:80');
    assert.match(env.UPSTASH_REDIS_REST_TOKEN, /^[a-f0-9]{64}$/u);
    assert.equal(env.SRH_TOKEN, env.UPSTASH_REDIS_REST_TOKEN);
    assert.equal(
      fs
        .readFileSync(
          path.join(tempDir, 'tmp', 'docker-web', 'redis-token'),
          'utf8'
        )
        .trim(),
      env.UPSTASH_REDIS_REST_TOKEN
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment pins compose project names from the workspace path', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-project-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co\n'
    );

    const env = getComposeEnvironment({
      baseEnv: {
        PATH: 'test-path',
        COMPOSE_PROJECT_NAME: 'bad-inherited-project',
      },
      envFilePath,
      rootDir: tempDir,
    });

    assert.equal(env.COMPOSE_PROJECT_NAME, path.basename(tempDir));

    const canonicalRepoEnv = getComposeEnvironment({
      baseEnv: {
        PATH: 'test-path',
        COMPOSE_PROJECT_NAME: 'bad-inherited-project',
      },
      envFilePath,
      rootDir: path.join(tempDir, 'platform'),
    });

    assert.equal(canonicalRepoEnv.COMPOSE_PROJECT_NAME, 'tuturuuu');

    const legacyLiveStackEnv = getComposeEnvironment({
      baseEnv: {
        PATH: 'test-path',
        COMPOSE_PROJECT_NAME: 'platform',
      },
      envFilePath,
      rootDir: path.join(tempDir, 'platform'),
    });

    assert.equal(legacyLiveStackEnv.COMPOSE_PROJECT_NAME, 'platform');

    const overriddenEnv = getComposeEnvironment({
      baseEnv: {
        PATH: 'test-path',
        COMPOSE_PROJECT_NAME: 'bad-inherited-project',
        DOCKER_WEB_COMPOSE_PROJECT_NAME: 'platform',
      },
      envFilePath,
      rootDir: tempDir,
    });

    assert.equal(overriddenEnv.COMPOSE_PROJECT_NAME, 'platform');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment preserves an explicit Buildx attestation override', () => {
  const env = getComposeEnvironment({
    baseEnv: {
      BUILDX_NO_DEFAULT_ATTESTATIONS: '0',
      PATH: 'test-path',
    },
  });

  assert.equal(env.BUILDX_NO_DEFAULT_ATTESTATIONS, '0');
});

test('getComposeEnvironment injects blue-green support service URLs when requested', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-support-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8001\n'
    );

    const env = getComposeEnvironment({
      baseEnv: { PATH: 'test-path' },
      envFilePath,
      rootDir: tempDir,
      withSupportServices: true,
    });

    assert.equal(env.DISCORD_APP_DEPLOYMENT_URL, DOCKER_MARKITDOWN_SERVICE_URL);
    assert.match(env.CRON_SECRET, /^[a-f0-9]{64}$/u);
    assert.equal(env.MARKITDOWN_ENDPOINT_URL, DOCKER_MARKITDOWN_ENDPOINT_URL);
    assert.match(env.MARKITDOWN_ENDPOINT_SECRET, /^[a-f0-9]{64}$/u);
    assert.equal(
      env.VALSEA_PRONUNCIATION_ASSESSOR_URL,
      DOCKER_PRONUNCIATION_ASSESSOR_URL
    );
    assert.equal(
      env.DRIVE_AUTO_EXTRACT_PROXY_URL,
      DOCKER_STORAGE_UNZIP_PROXY_URL
    );
    assert.match(env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN, /^[a-f0-9]{64}$/u);
    assert.equal(
      env.DRIVE_UNZIP_PROXY_SHARED_TOKEN,
      env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN
    );
    assert.equal(env.INTERNAL_WEB_API_ORIGIN, 'http://web-proxy:7803');
    assert.equal(env.SUPABASE_URL, `http://${DOCKER_HOST_ALIAS}:8001/`);
    assert.equal(
      fs
        .readFileSync(
          path.join(tempDir, 'tmp', 'docker-web', 'cron-token'),
          'utf8'
        )
        .trim(),
      env.CRON_SECRET
    );
    assert.equal(
      fs
        .readFileSync(
          path.join(tempDir, 'tmp', 'docker-web', 'markitdown-token'),
          'utf8'
        )
        .trim(),
      env.MARKITDOWN_ENDPOINT_SECRET
    );
    assert.equal(
      fs
        .readFileSync(
          path.join(tempDir, 'tmp', 'docker-web', 'storage-unzip-token'),
          'utf8'
        )
        .trim(),
      env.DRIVE_AUTO_EXTRACT_PROXY_TOKEN
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment preserves the configured cloud Supabase URL', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-cloud-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co\n'
    );

    const env = getComposeEnvironment({
      baseEnv: { PATH: 'test-path' },
      envFilePath,
      rootDir: tempDir,
    });

    assert.equal(env.SUPABASE_SERVER_URL, 'https://project-ref.supabase.co');
    assert.equal(env.SUPABASE_URL, 'https://project-ref.supabase.co');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment rewrites an explicit localhost SUPABASE_SERVER_URL', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-server-url-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'SUPABASE_SERVER_URL=http://localhost:8001\n'
    );

    const env = getComposeEnvironment({
      baseEnv: { PATH: 'test-path' },
      envFilePath,
      rootDir: tempDir,
    });

    assert.equal(env.SUPABASE_SERVER_URL, `http://${DOCKER_HOST_ALIAS}:8001/`);
    assert.equal(env.SUPABASE_URL, `http://${DOCKER_HOST_ALIAS}:8001/`);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment omits redis env when docker redis is disabled', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-no-redis-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co\n'
    );

    const env = getComposeEnvironment({
      baseEnv: { PATH: 'test-path' },
      envFilePath,
      rootDir: tempDir,
      withRedis: false,
    });

    assert.equal(env.PATH, 'test-path');
    assert.equal(env.UPSTASH_REDIS_REST_URL, undefined);
    assert.equal(env.UPSTASH_REDIS_REST_TOKEN, undefined);
    assert.equal(env.SRH_TOKEN, undefined);
    assert.equal(
      fs.existsSync(path.join(tempDir, 'tmp', 'docker-web', 'redis-token')),
      false
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment treats blank redis env overrides as missing', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-blank-redis-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co\n'
    );

    const env = getComposeEnvironment({
      baseEnv: {
        PATH: 'test-path',
        UPSTASH_REDIS_REST_TOKEN: '   ',
        UPSTASH_REDIS_REST_URL: '',
      },
      envFilePath,
      rootDir: tempDir,
    });

    assert.match(env.UPSTASH_REDIS_REST_TOKEN, /^[a-f0-9]{64}$/u);
    assert.equal(env.UPSTASH_REDIS_REST_URL, 'http://serverless-redis-http:80');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment ignores stale generic Upstash env for Docker Redis', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-stale-upstash-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co\n'
    );

    const env = getComposeEnvironment({
      baseEnv: {
        PATH: 'test-path',
        UPSTASH_REDIS_REST_TOKEN: 'stale-upstash-token',
        UPSTASH_REDIS_REST_URL: 'https://resolved-kingfish-21146.upstash.io',
      },
      envFilePath,
      rootDir: tempDir,
    });

    assert.notEqual(env.UPSTASH_REDIS_REST_TOKEN, 'stale-upstash-token');
    assert.match(env.UPSTASH_REDIS_REST_TOKEN, /^[a-f0-9]{64}$/u);
    assert.equal(env.UPSTASH_REDIS_REST_URL, 'http://serverless-redis-http:80');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment allows Docker-specific Redis overrides', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-docker-redis-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co\n'
    );

    const env = getComposeEnvironment({
      baseEnv: {
        DOCKER_UPSTASH_REDIS_REST_TOKEN: 'docker-token',
        DOCKER_UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
        PATH: 'test-path',
      },
      envFilePath,
      rootDir: tempDir,
    });

    assert.equal(env.UPSTASH_REDIS_REST_TOKEN, 'docker-token');
    assert.equal(env.UPSTASH_REDIS_REST_URL, 'https://redis.example.test');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getComposeEnvironment resolves cloudflared tokens from Docker env files', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-cloudflared-env-')
  );
  const envFilePath = path.join(tempDir, '.env.local');

  try {
    fs.writeFileSync(
      envFilePath,
      [
        'CLOUDFLARED_TOKEN=cloudflared-token',
        'NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co',
      ].join('\n')
    );

    const env = getComposeEnvironment({
      baseEnv: { PATH: 'test-path' },
      envFilePath,
      rootDir: tempDir,
      withCloudflared: true,
    });

    assert.equal(env.CLOUDFLARED_TOKEN, 'cloudflared-token');
    assert.equal(env.DOCKER_WEB_WITH_CLOUDFLARED, '1');
    assert.doesNotThrow(() =>
      ensureRequiredComposeEnvironment(env, {
        withCloudflared: true,
        withRedis: true,
      })
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('ensureRequiredComposeEnvironment requires a cloudflared token when enabled', () => {
  assert.throws(
    () =>
      ensureRequiredComposeEnvironment(
        {
          SUPABASE_SERVER_URL: 'https://project-ref.supabase.co',
          UPSTASH_REDIS_REST_TOKEN: 'token',
          UPSTASH_REDIS_REST_URL: 'http://serverless-redis-http:80',
        },
        { withCloudflared: true, withRedis: true }
      ),
    /Missing required Docker runtime env: CLOUDFLARED_TOKEN/
  );
});

test('getComposeFile resolves the expected compose file for each mode', () => {
  assert.equal(getComposeFile('dev'), COMPOSE_FILE);
  assert.equal(getComposeFile('prod'), PROD_COMPOSE_FILE);
});

test('renderBlueGreenProxyConfig points traffic at the selected color', () => {
  const config = renderBlueGreenProxyConfig('green', {
    deploymentStamp: 'deploy-2026-04-18T12-30-00Z',
    standbyColor: 'blue',
  });

  assert.match(
    config,
    /map \$http_upgrade \$connection_upgrade \{[\s\S]*resolver 127\.0\.0\.11 ipv6=off valid=5s;\n\n(?:log_format[\s\S]*?\n\n)?upstream web_upstream \{/u
  );
  assert.match(config, /access_log \/dev\/stdout platform_blue_green_json;/);
  assert.match(config, /upstream web_upstream {/);
  assert.match(
    config,
    /server web-green:7803 resolve max_fails=1 fail_timeout=5s;/
  );
  assert.match(
    config,
    /server web-blue:7803 backup resolve max_fails=1 fail_timeout=5s;/
  );
  assert.match(config, /upstream hive_app_upstream {/);
  assert.match(
    config,
    /server hive-green:7814 resolve max_fails=1 fail_timeout=5s;/
  );
  assert.match(
    config,
    /server hive-blue:7814 backup resolve max_fails=1 fail_timeout=5s;/
  );
  assert.match(config, /listen 7814;/);
  assert.match(config, /location = \/~recover-browser-state \{/);
  assert.match(config, /add_header Clear-Site-Data/);
  assert.match(config, /return 302 \/login\?browserStateReset=1;/);
  assert.match(config, /client_header_buffer_size 16k;/);
  assert.match(config, /keepalive_timeout 15s;/);
  assert.match(config, /large_client_header_buffers 8 16k;/);
  assert.match(
    config,
    /add_header X-Platform-Deployment-Stamp "deploy-2026-04-18T12-30-00Z" always;/
  );
  assert.match(
    config,
    /add_header X-Platform-Blue-Green-Primary "green" always;/
  );
  assert.match(
    config,
    /add_header X-Platform-Blue-Green-Standby "blue" always;/
  );
  assert.match(config, /proxy_connect_timeout 3s;/);
  assert.match(config, /proxy_buffer_size 128k;/);
  assert.match(config, /proxy_buffers 8 128k;/);
  assert.match(config, /proxy_busy_buffers_size 256k;/);
  assert.match(config, /location = \/__platform\/drain-status \{/);
  assert.match(config, /allow 127\.0\.0\.1;/);
  assert.match(config, /deny all;/);
  assert.match(
    config,
    /proxy_set_header X-Platform-Internal-Drain-Status "1";/
  );
  assert.match(
    config,
    /proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;/
  );
  assert.match(config, /proxy_next_upstream_tries 2;/);
  assert.match(config, /proxy_pass http:\/\/web_upstream;/);
  assert.equal(
    (config.match(/proxy_set_header Host \$http_host;/gu) ?? []).length,
    7
  );
  assert.equal(
    (config.match(/proxy_set_header X-Forwarded-Host \$http_host;/gu) ?? [])
      .length,
    7
  );
  assert.doesNotMatch(config, /proxy_set_header Host \$host;/u);
});

test('writeBlueGreenActiveColor persists the selected color', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-blue-green-')
  );
  const paths = getBlueGreenPaths(tempDir);

  try {
    writeBlueGreenActiveColor('blue', paths);
    assert.equal(readBlueGreenActiveColor(paths), 'blue');
  } finally {
    clearBlueGreenRuntime(paths);
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('manual blue-green conflict refusal reports the active deployment', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-active-build-')
  );
  const paths = getWatchPaths(tempDir);

  try {
    writeDeploymentBuildLock(
      {
        command: 'bun serve:web:docker:bg',
        commitShortHash: 'abc123',
        lockToken: 'active-token',
        ownerPid: 1234,
        startedAt: 1000,
      },
      {
        fsImpl: fs,
        paths,
      }
    );

    const processImpl = {
      kill(pid) {
        if (pid !== 1234) {
          const error = new Error('missing');
          error.code = 'ESRCH';
          throw error;
        }
      },
      pid: 9999,
    };

    const conflict = getActiveDeploymentConflict({
      fsImpl: fs,
      now: () => 5000,
      paths,
      platform: 'darwin',
      processImpl,
    });
    assert.match(describeActiveDeploymentConflict(conflict), /commit=abc123/);

    await assert.rejects(
      () =>
        resolveManualBlueGreenBuildConflict({
          composeEnv: { PATH: 'test-path' },
          env: {},
          fsImpl: fs,
          now: () => 5000,
          parsed: { cancelActiveBuild: false },
          paths,
          platform: 'darwin',
          processImpl,
          runCommand: async () => ({
            code: 0,
            signal: null,
            stderr: '',
            stdout: '',
          }),
        }),
      /--cancel-active-build/
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('manual blue-green override cancels active build and records history', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-cancel-build-')
  );
  const paths = getWatchPaths(tempDir);
  const calls = [];

  try {
    writeDeploymentBuildLock(
      {
        command: 'bun serve:web:docker:bg',
        commitHash: 'oldhash',
        commitShortHash: 'old123',
        commitSubject: 'Old deployment',
        deploymentKind: 'promotion',
        lockToken: 'active-token',
        ownerPid: 1234,
        startedAt: 1000,
      },
      {
        fsImpl: fs,
        paths,
      }
    );
    fs.writeFileSync(paths.statusFile, JSON.stringify({ ownerPid: 1234 }));

    const processImpl = {
      kill(pid) {
        if (pid !== 1234) {
          const error = new Error('missing');
          error.code = 'ESRCH';
          throw error;
        }
      },
      pid: 9999,
    };

    await resolveManualBlueGreenBuildConflict({
      composeEnv: { PATH: 'test-path' },
      env: {},
      fsImpl: fs,
      latestCommit: {
        hash: 'newhash',
        shortHash: 'new123',
        subject: 'New deployment',
      },
      now: () => 5000,
      parsed: { cancelActiveBuild: true },
      paths,
      platform: 'darwin',
      processImpl,
      runCommand: async (command, args) => {
        calls.push([command, args]);
        return { code: 0, signal: null, stderr: '', stdout: '' };
      },
    });

    assert.deepEqual(calls, [
      [
        'docker',
        [
          'compose',
          '-f',
          PROD_COMPOSE_FILE,
          '--profile',
          'redis',
          'stop',
          '--timeout',
          '1',
          'web-blue-green-watcher',
          'buildkit',
        ],
      ],
      ['docker', ['buildx', 'rm', DEFAULT_BUILDER_NAME]],
    ]);
    assert.equal(fs.existsSync(paths.deploymentBuildLockFile), false);
    assert.equal(fs.existsSync(paths.statusFile), false);

    const history = JSON.parse(fs.readFileSync(paths.historyFile, 'utf8'));
    assert.equal(history[0].status, 'canceled');
    assert.equal(history[0].commitShortHash, 'old123');
    assert.match(history[0].cancellationReason, /old123/);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('buildBlueGreenServices recovers Bun tarball extraction once', async () => {
  const calls = [];
  let buildAttempts = 0;

  await buildBlueGreenServices({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME },
    runCommand: async (command, args) => {
      calls.push([command, args]);

      if (args.includes('build')) {
        buildAttempts += 1;
        return buildAttempts === 1
          ? {
              code: 1,
              signal: null,
              stderr:
                'error: Fail extracting tarball for "@biomejs/cli-linux-x64"',
              stdout: '',
            }
          : { code: 0, signal: null, stderr: '', stdout: '' };
      }

      if (args.includes('ps') && args.includes('buildkit')) {
        return { code: 0, signal: null, stderr: '', stdout: 'buildkit-id\n' };
      }

      if (args[0] === 'inspect') {
        return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
    services: ['web-green'],
  });

  assert.equal(buildAttempts, 2);
  assert.deepEqual(
    calls
      .filter(([, args]) => args.includes('build'))
      .map(([, args]) => args.includes('--no-cache')),
    [false, true]
  );
  assert.deepEqual(
    calls.map(([command, args]) => [command, args.slice(0, 4)]),
    [
      ['docker', ['compose', '-f', PROD_COMPOSE_FILE, '--profile']],
      ['docker', ['buildx', 'prune', '--builder', DEFAULT_BUILDER_NAME]],
      ['docker', ['compose', '-f', PROD_COMPOSE_FILE, '--profile']],
      ['docker', ['compose', '-f', PROD_COMPOSE_FILE, '--profile']],
      ['docker', ['compose', '-f', PROD_COMPOSE_FILE, '--profile']],
      [
        'docker',
        [
          'inspect',
          '-f',
          '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
          'buildkit-id',
        ],
      ],
      ['docker', ['compose', '-f', PROD_COMPOSE_FILE, '--profile']],
    ]
  );
});

test('buildBlueGreenServices recovers a stalled compose build once', async () => {
  const calls = [];
  let buildAttempts = 0;

  await buildBlueGreenServices({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: {
      BUILDX_BUILDER: DEFAULT_BUILDER_NAME,
      DOCKER_WEB_BUILD_TIMEOUT_MS: '5000',
    },
    runCommand: async (command, args, options = {}) => {
      calls.push([command, args, options.timeoutMs]);

      if (args.includes('build')) {
        buildAttempts += 1;
        return buildAttempts === 1
          ? {
              code: 1,
              signal: 'SIGTERM',
              stderr: '',
              stdout: '',
              timedOut: true,
            }
          : { code: 0, signal: null, stderr: '', stdout: '' };
      }

      if (args.includes('ps') && args.includes('buildkit')) {
        return { code: 0, signal: null, stderr: '', stdout: 'buildkit-id\n' };
      }

      if (args[0] === 'inspect') {
        return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
    services: ['web-green'],
  });

  assert.equal(buildAttempts, 2);
  assert.deepEqual(
    calls
      .filter(([, args]) => args.includes('build'))
      .map(([, args]) => args.includes('--no-cache')),
    [false, true]
  );
  assert.deepEqual(
    calls
      .filter(([, args]) => args.includes('build'))
      .map(([, , timeoutMs]) => timeoutMs),
    [5000, 5000]
  );
  assert.ok(
    calls.some(([, args]) => args[0] === 'buildx' && args[1] === 'prune')
  );
});

test('buildBlueGreenServices recovers a cached BuildKit error with a fresh retry', async () => {
  const calls = [];
  let buildAttempts = 0;

  await buildBlueGreenServices({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME },
    runCommand: async (command, args) => {
      calls.push([command, args]);

      if (args.includes('build')) {
        buildAttempts += 1;
        return buildAttempts === 1
          ? {
              code: 1,
              signal: null,
              stderr:
                'CACHED ERROR [web-green builder 3/5] COPY --from=deps /workspace ./',
              stdout: '',
            }
          : { code: 0, signal: null, stderr: '', stdout: '' };
      }

      if (args.includes('ps') && args.includes('buildkit')) {
        return { code: 0, signal: null, stderr: '', stdout: 'buildkit-id\n' };
      }

      if (args[0] === 'inspect') {
        return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
    services: ['web-green'],
  });

  assert.equal(buildAttempts, 2);
  assert.deepEqual(
    calls
      .filter(([, args]) => args.includes('build'))
      .map(([, args]) => args.includes('--no-cache')),
    [false, true]
  );
  assert.ok(
    calls.some(([, args]) => args[0] === 'buildx' && args[1] === 'prune')
  );
});

test('buildBlueGreenServices builds services sequentially when compose parallelism is one', async () => {
  const calls = [];

  await buildBlueGreenServices({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: {
      BUILDX_BUILDER: DEFAULT_BUILDER_NAME,
      COMPOSE_PARALLEL_LIMIT: '1',
    },
    runCommand: async (command, args, options = {}) => {
      calls.push([command, args, options.timeoutMs]);

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
    services: ['web-blue', 'hive-blue', 'hive-realtime'],
  });

  assert.deepEqual(
    calls
      .filter(([, args]) => args.includes('build'))
      .map(([, args]) => args.slice(-1)),
    [['web-blue'], ['hive-blue'], ['hive-realtime']]
  );
});

test('buildBlueGreenServices leaves BuildKit cache pruning to deployment cleanup', async () => {
  const calls = [];

  await buildBlueGreenServices({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME },
    runCommand: async (command, args) => {
      calls.push([command, args]);

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
    services: ['web-green'],
  });

  assert.deepEqual(
    calls.map(([command, args]) => [command, args.slice(0, 6)]),
    [
      [
        'docker',
        ['compose', '-f', PROD_COMPOSE_FILE, '--profile', 'redis', 'build'],
      ],
    ]
  );
});

test('buildBlueGreenServices can build Compose targets with Buildx Bake', async () => {
  const calls = [];

  await buildBlueGreenServices({
    buildStrategy: 'bake',
    composeFile: PROD_COMPOSE_FILE,
    env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME },
    runCommand: async (command, args, options = {}) => {
      calls.push([command, args, options.timeoutMs]);

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
    services: ['web-green', 'hive-green'],
  });

  assert.deepEqual(calls, [
    [
      'docker',
      getBlueGreenBuildxBakeArgs({
        bakeFile: path.resolve(__dirname, '..', 'docker-bake.web.prod.hcl'),
        composeFile: PROD_COMPOSE_FILE,
        env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME },
        noCache: false,
        serviceBatch: ['web-green', 'hive-green'],
      }),
      DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS,
    ],
  ]);
});

test('buildBlueGreenServices restarts BuildKit when low-memory restart is requested', async () => {
  const calls = [];

  await buildBlueGreenServices({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: {
      BUILDX_BUILDER: DEFAULT_BUILDER_NAME,
      DOCKER_WEB_BUILDKIT_RESTART_BEFORE_BUILD: '1',
    },
    runCommand: async (command, args) => {
      calls.push([command, args]);

      if (args.includes('ps') && args.includes('buildkit')) {
        return { code: 0, signal: null, stderr: '', stdout: 'buildkit-id\n' };
      }

      if (args[0] === 'inspect') {
        return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
    services: ['web-green'],
  });

  const restartIndex = calls.findIndex(
    ([, args]) => args.includes('restart') && args.includes('buildkit')
  );
  const buildIndex = calls.findIndex(([, args]) => args.includes('build'));

  assert.notEqual(restartIndex, -1);
  assert.notEqual(buildIndex, -1);
  assert.ok(restartIndex < buildIndex);
});

test('runDockerWebWorkflow only runs docker compose for dev:web:docker', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push({
      args,
      command,
      env: options.env,
      stdio: options.stdio ?? 'inherit',
    });

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runDockerWebWorkflow(parseArgs(['up']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ['docker', ['compose', 'version']],
      ['docker', ['info', '--format', '{{json .MemTotal}}']],
      [
        'docker',
        [
          'compose',
          '-f',
          COMPOSE_FILE,
          '--profile',
          'redis',
          'up',
          '--build',
          '--remove-orphans',
        ],
      ],
    ]
  );
  assert.equal(calls[0].stdio, 'ignore');
  assert.equal(
    calls[2].env.SUPABASE_SERVER_URL,
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
});

test('runDockerWebWorkflow omits redis env when dockerized redis is disabled', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });

  await runDockerWebWorkflow(parseArgs(['up', '--without-redis']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand: async (command, args, options = {}) => {
      calls.push({
        args,
        command,
        env: options.env,
      });

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
  });

  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ['docker', ['compose', 'version']],
      ['docker', ['info', '--format', '{{json .MemTotal}}']],
      [
        'docker',
        ['compose', '-f', COMPOSE_FILE, 'up', '--build', '--remove-orphans'],
      ],
    ]
  );
  assert.equal(calls[2].env.UPSTASH_REDIS_REST_URL, undefined);
  assert.equal(calls[2].env.UPSTASH_REDIS_REST_TOKEN, undefined);
  assert.equal(calls[2].env.SRH_TOKEN, undefined);
});

test('runDockerWebWorkflow routes builds through a capped buildx builder when requested', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });

  await runDockerWebWorkflow(
    parseArgs([
      'up',
      '--build-memory',
      '4g',
      '--build-cpus',
      '2',
      '--build-max-parallelism',
      '2',
    ]),
    {
      env: { PATH: 'test-path' },
      fsImpl: fsStub,
      runCommand: async (command, args, options = {}) => {
        calls.push({
          args,
          command,
          env: options.env,
          stdio: options.stdio ?? 'inherit',
        });

        if (args[0] === 'buildx' && args[1] === 'inspect') {
          return { code: 1, signal: null, stderr: '', stdout: '' };
        }

        if (args.includes('ps') && args.includes('buildkit')) {
          return {
            code: 0,
            signal: null,
            stderr: '',
            stdout: 'buildkit-123\n',
          };
        }

        if (args[0] === 'inspect' && args.includes('buildkit-123')) {
          return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
        }

        return { code: 0, signal: null, stderr: '', stdout: '' };
      },
    }
  );

  assert.ok(
    calls.some(
      (call) =>
        call.command === 'docker' &&
        call.args[0] === 'buildx' &&
        call.args[1] === 'create' &&
        call.args.includes(DEFAULT_BUILDER_NAME) &&
        call.args.includes('--driver') &&
        call.args.includes('remote') &&
        call.args.includes('tcp://127.0.0.1:7914')
    )
  );
  assert.ok(
    calls.some(
      (call) =>
        call.command === 'docker' &&
        call.args[0] === 'compose' &&
        call.args.includes('up') &&
        call.args.includes('--no-build') &&
        call.args.includes('buildkit') &&
        call.env.DOCKER_WEB_BUILD_MEMORY === '4g' &&
        call.env.DOCKER_WEB_BUILD_CPUS === '2' &&
        call.env.DOCKER_WEB_BUILD_MAX_PARALLELISM === '2'
    )
  );
  assert.equal(calls.at(-1).env.BUILDX_BUILDER, DEFAULT_BUILDER_NAME);
});

test('runDockerWebWorkflow forwards Docker memory limit into build env', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });

  await runDockerWebWorkflow(parseArgs(['up', '--mode', 'prod']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand: async (command, args, options = {}) => {
      calls.push({
        args,
        command,
        env: options.env,
        stdio: options.stdio ?? 'inherit',
      });

      if (
        command === 'docker' &&
        args[0] === 'info' &&
        args.includes('{{json .MemTotal}}')
      ) {
        return {
          code: 0,
          signal: null,
          stderr: '',
          stdout: String(16 * 1024 * 1024 * 1024),
        };
      }

      if (args.includes('ps')) {
        return { code: 0, signal: null, stderr: '', stdout: '' };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
  });

  assert.equal(
    calls.at(-1).env.DOCKER_WEB_DOCKER_MEMORY_LIMIT,
    String(16 * 1024 * 1024 * 1024)
  );
});

test('runDockerWebWorkflow uses the production compose file for in-place deploys', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push({
      args,
      command,
      stdio: options.stdio ?? 'inherit',
    });

    if (args.includes('ps')) {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runDockerWebWorkflow(parseArgs(['up', '--mode', 'prod']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(calls.at(-1), {
    args: [
      'compose',
      '-f',
      PROD_COMPOSE_FILE,
      '--profile',
      'redis',
      'up',
      '--build',
      '--remove-orphans',
      'web',
      'redis',
      'serverless-redis-http',
    ],
    command: 'docker',
    stdio: 'inherit',
  });
});

test('runDockerWebWorkflow starts and resets Supabase before Docker when requested', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
  });
  const runCommand = async (command, args) => {
    calls.push([command, args]);
    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runDockerWebWorkflow(parseArgs(['up', '--reset-supabase']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(calls, [
    ['docker', ['compose', 'version']],
    ['docker', ['info', '--format', '{{json .MemTotal}}']],
    ['bun', ['sb:start']],
    ['bun', ['sb:reset']],
    [
      'docker',
      [
        'compose',
        '-f',
        COMPOSE_FILE,
        '--profile',
        'redis',
        'up',
        '--build',
        '--remove-orphans',
      ],
    ],
  ]);
});

test('runDockerWebWorkflow throws a clear error when Docker env files are missing', async () => {
  await assert.rejects(
    () =>
      runDockerWebWorkflow(parseArgs(['up']), {
        env: { PATH: 'test-path' },
        fsImpl: createFsStub({ hasEnvFile: false }),
        runCommand: async () => ({
          code: 0,
          signal: null,
          stderr: '',
          stdout: '',
        }),
      }),
    /Missing required env file: \.env\.local or apps\/web\/\.env\.local/
  );
});

test('runDockerWebWorkflow fails fast when required Docker runtime env is missing', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-missing-runtime-env-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, 'SUPABASE_SECRET_KEY=test-secret\n');

  try {
    await assert.rejects(
      () =>
        runDockerWebWorkflow(parseArgs(['up']), {
          env: { PATH: 'test-path' },
          envFilePath,
          rootDir: tempDir,
          runCommand: async () => ({
            code: 0,
            signal: null,
            stderr: '',
            stdout: '',
          }),
        }),
      /Missing required Docker runtime env: SUPABASE_SERVER_URL/
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDockerWebWorkflow auto-generates redis credentials for production docker runs', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-web-prod-'));
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );

  try {
    await runDockerWebWorkflow(parseArgs(['up', '--mode', 'prod']), {
      env: { PATH: 'test-path' },
      envFilePath,
      rootDir: tempDir,
      runCommand: async (command, args, options = {}) => {
        calls.push({ args, command, env: options.env });

        if (args.includes('ps')) {
          return { code: 0, signal: null, stderr: '', stdout: '' };
        }

        return { code: 0, signal: null, stderr: '', stdout: '' };
      },
    });

    const token = fs
      .readFileSync(
        path.join(tempDir, 'tmp', 'docker-web', 'redis-token'),
        'utf8'
      )
      .trim();

    assert.match(token, /^[a-f0-9]{64}$/u);
    const deploymentComposeCalls = calls.filter(
      ({ args, command }) =>
        command === 'docker' && args.includes('-f') && args.includes('compose')
    );

    assert.ok(deploymentComposeCalls.length > 0);

    for (const call of deploymentComposeCalls) {
      assert.equal(call.env.UPSTASH_REDIS_REST_TOKEN, token);
      assert.equal(
        call.env.UPSTASH_REDIS_REST_URL,
        'http://serverless-redis-http:80'
      );
      assert.equal(call.env.SRH_TOKEN, token);
    }
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDockerWebWorkflow performs an initial blue-green deployment', async () => {
  const calls = [];
  const watcherStarts = [];
  let webProxyPsCalls = 0;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-initial-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );

  const runCommand = async (command, args, options = {}) => {
    calls.push([command, args, options.env]);

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === BLUE_GREEN_PROXY_SERVICE) {
      webProxyPsCalls += 1;
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: webProxyPsCalls === 1 ? '' : 'proxy-123\n',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'buildkit') {
      return { code: 0, signal: null, stderr: '', stdout: 'buildkit-id\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      return { code: 0, signal: null, stderr: '', stdout: 'container-blue\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'hive-db-migrate') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: 'hive-db-migrate-123\n',
      };
    }

    if (
      args.includes('ps') &&
      BLUE_GREEN_SUPPORT_SERVICES.includes(args.at(-1))
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `container-${args.at(-1)}\n`,
      };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  try {
    await runDockerWebWorkflow(
      parseArgs([
        'up',
        '--mode',
        'prod',
        '--strategy',
        'blue-green',
        '--build-memory',
        '12g',
        '--build-cpus',
        '4',
        '--build-max-parallelism',
        '1',
      ]),
      {
        env: { PATH: 'test-path' },
        envFilePath,
        proxyDrainMs: 0,
        rootDir: tempDir,
        runCommand,
        startWatcherContainer: async (argv, options = {}) => {
          watcherStarts.push({
            argv,
            env: options.env,
            rootDir: options.rootDir,
          });
        },
      }
    );

    const paths = getBlueGreenPaths(tempDir);
    const watchPaths = getWatchPaths(tempDir);
    assert.equal(readBlueGreenActiveColor(paths), 'blue');
    const history = JSON.parse(fs.readFileSync(watchPaths.historyFile, 'utf8'));
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'successful');
    assert.equal(history[0].activeColor, 'blue');
    assert.match(
      fs.readFileSync(paths.proxyConfigFile, 'utf8'),
      /server web-blue:7803 resolve max_fails=1 fail_timeout=5s;/
    );
    assert.match(
      fs.readFileSync(paths.proxyConfigFile, 'utf8'),
      /X-Platform-Deployment-Stamp/
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args[0] === 'compose' &&
          args[1] === '-f' &&
          args[2] === PROD_COMPOSE_FILE &&
          args.includes('ps') &&
          args.at(-1) === 'web'
      )
    );
    const runtimeUpIndex = calls.findIndex(
      ([command, args]) =>
        command === 'docker' &&
        args[0] === 'compose' &&
        args[1] === '-f' &&
        args[2] === PROD_COMPOSE_FILE &&
        args.includes('up') &&
        args.includes('web-blue') &&
        !args.includes(BLUE_GREEN_PROXY_SERVICE) &&
        !BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE.some((service) =>
          args.includes(service)
        ) &&
        !BLUE_GREEN_DEFERRED_SUPPORT_SERVICES.some((service) =>
          args.includes(service)
        )
    );
    const hiveUpIndex = calls.findIndex(
      ([command, args]) =>
        command === 'docker' &&
        args[0] === 'compose' &&
        args[1] === '-f' &&
        args[2] === PROD_COMPOSE_FILE &&
        args.includes('up') &&
        args.includes(getBlueGreenHiveServiceName('blue')) &&
        args.includes('hive-realtime') &&
        !BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE.some((service) =>
          args.includes(service)
        )
    );
    const proxyUpIndex = calls.findIndex(
      ([command, args]) =>
        command === 'docker' &&
        args[0] === 'compose' &&
        args[1] === '-f' &&
        args[2] === PROD_COMPOSE_FILE &&
        args.includes('up') &&
        args.includes(BLUE_GREEN_PROXY_SERVICE) &&
        !args.includes('web-blue') &&
        !args.includes(getBlueGreenHiveServiceName('blue'))
    );

    assert.notEqual(runtimeUpIndex, -1);
    assert.notEqual(hiveUpIndex, -1);
    assert.notEqual(proxyUpIndex, -1);
    assert.ok(runtimeUpIndex < proxyUpIndex);
    assert.ok(proxyUpIndex < hiveUpIndex);
    const buildCalls = calls.filter(
      ([command, args]) =>
        command === 'docker' &&
        args[0] === 'buildx' &&
        args.includes('bake') &&
        !args.includes('--no-cache')
    );
    assert.ok(buildCalls.length > 1);
    assert.ok(
      buildCalls.every(([, args, callEnv]) => {
        return (
          args.includes('--builder') &&
          args.includes(DEFAULT_BUILDER_NAME) &&
          callEnv.BUILDX_BUILDER === DEFAULT_BUILDER_NAME &&
          callEnv.COMPOSE_PARALLEL_LIMIT === '1'
        );
      })
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('wget') &&
          args.includes('http://127.0.0.1:7803/__platform/drain-status')
      )
    );
    assert.deepEqual(watcherStarts, [
      {
        argv: ['--resume-if-running'],
        env: { PATH: 'test-path' },
        rootDir: tempDir,
      },
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDockerWebWorkflow does not recursively start watcher from watcher deploys', async () => {
  const calls = [];
  const watcherStarts = [];
  let webProxyPsCalls = 0;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-watcher-child-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === 'buildkit') {
      return { code: 0, signal: null, stderr: '', stdout: 'buildkit-id\n' };
    }

    if (args.includes('ps') && args.at(-1) === BLUE_GREEN_PROXY_SERVICE) {
      webProxyPsCalls += 1;
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: webProxyPsCalls === 1 ? '' : 'proxy-123\n',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      return { code: 0, signal: null, stderr: '', stdout: 'container-blue\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'hive-db-migrate') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: 'hive-db-migrate-123\n',
      };
    }

    if (
      args.includes('ps') &&
      BLUE_GREEN_SUPPORT_SERVICES.includes(args.at(-1))
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `container-${args.at(-1)}\n`,
      };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  try {
    await runDockerWebWorkflow(
      parseArgs([
        'up',
        '--mode',
        'prod',
        '--strategy',
        'blue-green',
        '--build-memory',
        '12g',
        '--build-cpus',
        '4',
        '--build-max-parallelism',
        '1',
      ]),
      {
        env: { PATH: 'test-path', [WATCHER_CONTAINER_ENV]: '1' },
        envFilePath,
        proxyDrainMs: 0,
        rootDir: tempDir,
        runCommand,
        startWatcherContainer: async (argv) => {
          watcherStarts.push(argv);
        },
      }
    );

    assert.deepEqual(watcherStarts, []);
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args[0] === 'compose' &&
          args.includes('rm') &&
          args.at(-1) === 'buildkit'
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDockerWebWorkflow recovers from stale blue-green container name conflicts', async () => {
  const calls = [];
  let upSucceeded = false;
  let webProxyPsCalls = 0;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-conflict-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === BLUE_GREEN_PROXY_SERVICE) {
      webProxyPsCalls += 1;
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: upSucceeded && webProxyPsCalls > 1 ? 'proxy-123\n' : '',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: upSucceeded ? 'container-blue\n' : '',
      };
    }

    if (
      args.includes('ps') &&
      BLUE_GREEN_SUPPORT_SERVICES.includes(args.at(-1))
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: upSucceeded ? `container-${args.at(-1)}\n` : '',
      };
    }

    if (
      command === 'docker' &&
      args[0] === 'compose' &&
      args.includes('up') &&
      args.includes('web-blue')
    ) {
      if (!upSucceeded) {
        upSucceeded = true;
        return {
          code: 1,
          signal: null,
          stderr:
            'Error response from daemon: Conflict. The container name "/platform-web-blue-1" is already in use by container "stale-blue". You have to remove (or rename) that container to be able to reuse that name.',
          stdout: '',
        };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (
      command === 'docker' &&
      args[0] === 'rm' &&
      args[1] === '-f' &&
      args[2] === 'platform-web-blue-1'
    ) {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  try {
    await runDockerWebWorkflow(
      parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green']),
      {
        env: {
          DOCKER_WEB_COMPOSE_PROJECT_NAME: 'platform',
          PATH: 'test-path',
        },
        envFilePath,
        proxyDrainMs: 0,
        rootDir: tempDir,
        runCommand,
        startWatcherContainer: async () => {},
      }
    );

    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args[0] === 'rm' &&
          args[1] === '-f' &&
          args[2] === 'platform-web-blue-1'
      )
    );
    assert.equal(
      calls.filter(
        ([command, args]) =>
          command === 'docker' && args[0] === 'compose' && args.includes('up')
      ).length,
      5
    );
    assert.equal(readBlueGreenActiveColor(getBlueGreenPaths(tempDir)), 'blue');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runBlueGreenProdWorkflow does not clear a blue-green lane before a failed replacement build', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-build-first-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);
  const calls = [];

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      return { code: 0, signal: null, stderr: '', stdout: 'blue-123\n' };
    }

    if (args.includes('ps') && args.at(-1) === BLUE_GREEN_PROXY_SERVICE) {
      return { code: 0, signal: null, stderr: '', stdout: 'proxy-123\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-green') {
      return { code: 0, signal: null, stderr: '', stdout: 'green-123\n' };
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{json .NetworkSettings.Ports}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `${BLUE_GREEN_PROXY_PORTS_JSON}\n`,
      };
    }

    if (args.includes('config') && args.includes('--format')) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: JSON.stringify({
          services: {
            [BLUE_GREEN_PROXY_SERVICE]: { image: 'nginx:1.31.0-alpine' },
          },
        }),
      };
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{.Config.Image}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: 'nginx:1.31.0-alpine\n',
      };
    }

    if (args[0] === 'inspect' && args.at(-1) === 'blue-123') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    if (args.includes('build') && args.includes('web-green')) {
      return {
        code: 1,
        signal: null,
        stderr: 'web build failed',
        stdout: '',
      };
    }

    if (args.includes('up') && args.includes('--build')) {
      return {
        code: 1,
        signal: null,
        stderr: 'web build failed',
        stdout: '',
      };
    }

    if (
      args.includes('stop') &&
      (args.includes('web-blue') || args.includes('web-green'))
    ) {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (
      args.includes('rm') &&
      (args.includes('web-blue') || args.includes('web-green'))
    ) {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  try {
    await assert.rejects(
      () =>
        runBlueGreenProdWorkflow(
          {
            action: 'up',
            composeArgs: [],
            composeGlobalArgs: ['--profile', 'redis'],
            mode: 'prod',
            strategy: 'blue-green',
          },
          {
            env: { PATH: 'test-path' },
            envFilePath,
            rootDir: tempDir,
            runCommand,
          }
        ),
      /web build failed/
    );

    assert.ok(calls.some((call) => call.includes(' build web-green')));
    assert.equal(
      calls.some(
        (call) =>
          call.includes(' stop web-blue') ||
          call.includes(' stop web-green') ||
          call.includes(' rm -f web-blue') ||
          call.includes(' rm -f web-green')
      ),
      false
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runBlueGreenProdWorkflow keeps a promoted web lane when Hive migration fails', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-web-promoted-hive-fails-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);
  const calls = [];
  let webStarted = false;
  let proxyStarted = false;

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const resultFor = (stdout = '') => ({
    code: 0,
    signal: null,
    stderr: '',
    stdout,
  });

  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);

    if (command === 'docker' && args[0] === 'ps') {
      return resultFor('');
    }

    if (args.includes('ps') && args.includes('-q')) {
      const serviceName = args.at(-1);

      if (serviceName === 'web-blue') return resultFor('blue-123\n');
      if (serviceName === 'web-green') {
        return resultFor(webStarted ? 'green-123\n' : '');
      }
      if (serviceName === BLUE_GREEN_PROXY_SERVICE) {
        return resultFor(proxyStarted ? 'proxy-123\n' : '');
      }
      if (serviceName === 'web') return resultFor('');
      if (BLUE_GREEN_SUPPORT_SERVICES.includes(serviceName)) {
        return resultFor('');
      }

      return resultFor('');
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{json .NetworkSettings.Ports}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return resultFor(`${BLUE_GREEN_PROXY_PORTS_JSON}\n`);
    }

    if (args.includes('config') && args.includes('--format')) {
      return resultFor(
        JSON.stringify({
          services: {
            [BLUE_GREEN_PROXY_SERVICE]: { image: 'nginx:1.31.0-alpine' },
          },
        })
      );
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{.Config.Image}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return resultFor('nginx:1.31.0-alpine\n');
    }

    if (args[0] === 'inspect') {
      return resultFor('healthy\n');
    }

    if (args.includes('build')) {
      return resultFor('');
    }

    if (args[0] === 'buildx' && args[1] === 'bake') {
      return resultFor('');
    }

    if (args.includes('up') && args.includes('web-green')) {
      webStarted = true;
      return resultFor('');
    }

    if (args.includes('up') && args.includes(BLUE_GREEN_PROXY_SERVICE)) {
      proxyStarted = true;
      return resultFor('');
    }

    if (
      args.includes('exec') &&
      args.includes(BLUE_GREEN_PROXY_SERVICE) &&
      (args.includes('wget') || args.includes('nginx'))
    ) {
      return resultFor('');
    }

    if (isHiveDbMigrateRun(command, args)) {
      return {
        code: 1,
        signal: null,
        stderr: 'hive migration failed',
        stdout: '',
      };
    }

    if (
      args.includes('exec') &&
      args.includes('web-blue') &&
      args.includes('node')
    ) {
      return resultFor(JSON.stringify({ inflightRequests: 0 }));
    }

    if (args.includes('stop') || args.includes('rm')) {
      return resultFor('');
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  try {
    await assert.rejects(
      () =>
        runBlueGreenProdWorkflow(
          {
            action: 'up',
            composeArgs: [],
            composeGlobalArgs: [],
            mode: 'prod',
            strategy: 'blue-green',
          },
          {
            drainPollMs: 0,
            drainTimeoutMs: 5_000,
            env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME, PATH: 'test-path' },
            envFilePath,
            latestCommit: {
              hash: 'commit-green',
              shortHash: 'green',
              subject: 'Promote web before Hive',
            },
            proxyDrainMs: 0,
            rootDir: tempDir,
            runCommand,
          }
        ),
      (error) => {
        assert.match(error.message, /hive migration failed/);
        assert.equal(
          error.blueGreenStages.find((stage) => stage.id === 'web-promote')
            ?.status,
          'succeeded'
        );
        assert.equal(
          error.blueGreenStages.find((stage) => stage.id === 'hive-migrate')
            ?.status,
          'failed'
        );
        return true;
      }
    );

    assert.equal(readBlueGreenActiveColor(paths), 'green');
    assert.ok(
      calls.findIndex(
        (call) =>
          call.includes(' exec -T web-proxy nginx -s reload') ||
          call.includes(' exec -T web-proxy wget')
      ) < calls.findIndex((call) => call.includes(' hive-db-migrate'))
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getBlueGreenComposeMigration stages target ports while the legacy project exists', async () => {
  const migration = await getBlueGreenComposeMigration({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: {
      COMPOSE_PROJECT_NAME: 'tuturuuu',
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
      PATH: 'test-path',
    },
    rootDir: '/tmp/platform',
    runCommand: async (command, args, options = {}) => {
      assert.equal(
        `${command} ${args.join(' ')}`,
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`
      );
      assert.equal(options.env.COMPOSE_PROJECT_NAME, 'platform');
      assert.equal(options.env.DOCKER_WEB_COMPOSE_PROJECT_NAME, 'platform');

      return { code: 0, signal: null, stderr: '', stdout: 'legacy\n' };
    },
  });

  assert.equal(migration.sourceProjectName, 'platform');
  assert.equal(migration.targetProjectName, 'tuturuuu');
  assert.equal(migration.targetEnv.COMPOSE_PROJECT_NAME, 'tuturuuu');
  assert.equal(migration.targetEnv.DOCKER_WEB_REDIS_HOST_PORT, '16379');
  assert.equal(migration.targetEnv.DOCKER_HIVE_PROXY_HOST_PORT, '17814');
  assert.equal(migration.targetEnv.DOCKER_WEB_PROXY_HOST_PORT, '17803');
  assert.equal(migration.targetFinalEnv.DOCKER_HIVE_PROXY_HOST_PORT, '7814');
  assert.equal(migration.targetFinalEnv.DOCKER_WEB_PROXY_HOST_PORT, '7803');
  assert.equal(
    migration.targetEnv.DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT,
    'platform'
  );
});

test('hasBlueGreenProxyHostPortBindings requires support host ports on web-proxy', async () => {
  let inspectPorts = {
    '7803/tcp': [{ HostIp: '0.0.0.0', HostPort: '7803' }],
  };

  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;

    if (
      key ===
      `docker compose -f ${PROD_COMPOSE_FILE} ps -q ${BLUE_GREEN_PROXY_SERVICE}`
    ) {
      return { code: 0, signal: null, stderr: '', stdout: 'proxy-123\n' };
    }

    if (key === 'docker inspect -f {{json .NetworkSettings.Ports}} proxy-123') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `${JSON.stringify(inspectPorts)}\n`,
      };
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  assert.equal(
    await hasBlueGreenProxyHostPortBindings({
      composeFile: PROD_COMPOSE_FILE,
      env: { PATH: 'test-path' },
      runCommand,
    }),
    false
  );

  inspectPorts = {
    ...inspectPorts,
    '7814/tcp': [{ HostIp: '0.0.0.0', HostPort: '7814' }],
  };

  assert.equal(
    await hasBlueGreenProxyHostPortBindings({
      composeFile: PROD_COMPOSE_FILE,
      env: { PATH: 'test-path' },
      runCommand,
    }),
    false
  );

  inspectPorts = {
    ...inspectPorts,
    '7816/tcp': [{ HostIp: '0.0.0.0', HostPort: '7816' }],
  };

  assert.equal(
    await hasBlueGreenProxyHostPortBindings({
      composeFile: PROD_COMPOSE_FILE,
      env: { PATH: 'test-path' },
      runCommand,
    }),
    true
  );
});

test('hasComposeServiceExpectedImage detects stale compose service images', async () => {
  let runningImage = 'nginx:1.27-alpine';

  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;

    if (key === `docker compose -f ${PROD_COMPOSE_FILE} config --format json`) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: JSON.stringify({
          services: {
            [BLUE_GREEN_PROXY_SERVICE]: { image: 'nginx:1.31.0-alpine' },
          },
        }),
      };
    }

    if (
      key ===
      `docker compose -f ${PROD_COMPOSE_FILE} ps -q ${BLUE_GREEN_PROXY_SERVICE}`
    ) {
      return { code: 0, signal: null, stderr: '', stdout: 'proxy-123\n' };
    }

    if (key === 'docker inspect -f {{.Config.Image}} proxy-123') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `${runningImage}\n`,
      };
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  assert.equal(
    await hasComposeServiceExpectedImage(BLUE_GREEN_PROXY_SERVICE, {
      composeFile: PROD_COMPOSE_FILE,
      env: { PATH: 'test-path' },
      runCommand,
    }),
    false
  );

  runningImage = 'nginx:1.31.0-alpine';

  assert.equal(
    await hasComposeServiceExpectedImage(BLUE_GREEN_PROXY_SERVICE, {
      composeFile: PROD_COMPOSE_FILE,
      env: { PATH: 'test-path' },
      runCommand,
    }),
    true
  );
});

test('runBlueGreenProdWorkflow recreates web-proxy when the Hive host port is missing', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-hive-port-refresh-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);
  const calls = [];
  let targetStarted = false;
  let hiveStarted = false;
  let forcedProxyRefresh = false;

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const resultFor = (stdout = '') => ({
    code: 0,
    signal: null,
    stderr: '',
    stdout,
  });

  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);

    if (command === 'docker' && args[0] === 'ps') {
      return resultFor('');
    }

    if (args.includes('ps') && args.includes('-q')) {
      const serviceName = args.at(-1);

      if (serviceName === 'web-blue') return resultFor('blue-123\n');
      if (serviceName === BLUE_GREEN_PROXY_SERVICE) {
        return resultFor('proxy-123\n');
      }
      if (serviceName === 'web') return resultFor('');
      if (serviceName === 'web-green') {
        return resultFor(targetStarted ? 'green-123\n' : '');
      }
      if (serviceName === 'buildkit') {
        return resultFor('buildkit-123\n');
      }
      if (serviceName === 'hive-db-migrate') {
        return resultFor(
          args.includes('-a') && hiveStarted ? 'hive-db-migrate-123\n' : ''
        );
      }
      if (BLUE_GREEN_SUPPORT_SERVICES.includes(serviceName)) {
        return resultFor(targetStarted ? `${serviceName}-123\n` : '');
      }

      return resultFor('');
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{json .NetworkSettings.Ports}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return resultFor(
        `${JSON.stringify({
          '7803/tcp': [{ HostIp: '0.0.0.0', HostPort: '7803' }],
        })}\n`
      );
    }

    if (args[0] === 'inspect') {
      return resultFor('healthy\n');
    }

    if (args.includes('build')) {
      return resultFor('');
    }

    if (args[0] === 'buildx' && args[1] === 'prune') {
      return resultFor('');
    }

    if (isHiveDbMigrateRun(command, args)) {
      return resultFor('');
    }

    if (args.includes('up') && args.includes('web-green')) {
      targetStarted = true;
      return resultFor('');
    }

    if (args.includes('up') && args.includes('hive-green')) {
      hiveStarted = true;
      return resultFor('');
    }

    if (
      args.includes('up') &&
      BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE.some((service) =>
        args.includes(service)
      )
    ) {
      return resultFor('');
    }

    if (args.includes('up') && args.includes(BLUE_GREEN_PROXY_SERVICE)) {
      forcedProxyRefresh =
        forcedProxyRefresh || args.includes('--force-recreate');
      return resultFor('');
    }

    if (
      args.includes('exec') &&
      args.includes('web-blue') &&
      args.includes('node')
    ) {
      return resultFor(JSON.stringify({ inflightRequests: 0 }));
    }

    if (
      args.includes('exec') &&
      args.includes(BLUE_GREEN_PROXY_SERVICE) &&
      (args.includes('wget') || args.includes('nginx'))
    ) {
      return resultFor('');
    }

    if (args.includes('stop') || args.includes('rm')) {
      return resultFor('');
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  try {
    await runBlueGreenProdWorkflow(
      {
        action: 'up',
        composeArgs: [],
        composeGlobalArgs: [],
        mode: 'prod',
        strategy: 'blue-green',
      },
      {
        drainPollMs: 0,
        drainTimeoutMs: 5_000,
        env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME, PATH: 'test-path' },
        envFilePath,
        proxyDrainMs: 0,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(readBlueGreenActiveColor(paths), 'green');
    assert.equal(forcedProxyRefresh, true);
    assert.ok(
      calls.some(
        (call) =>
          call.includes(' up --detach --no-build --force-recreate') &&
          (call.includes(` ${BLUE_GREEN_PROXY_SERVICE} `) ||
            call.endsWith(` ${BLUE_GREEN_PROXY_SERVICE}`))
      )
    );
    assert.ok(
      calls.findIndex(
        (call) =>
          call.includes(' up --detach --no-build --force-recreate') &&
          (call.includes(` ${BLUE_GREEN_PROXY_SERVICE} `) ||
            call.endsWith(` ${BLUE_GREEN_PROXY_SERVICE}`))
      ) < calls.findIndex((call) => call.includes(' hive-green'))
    );
    assert.equal(
      calls.some((call) => call.includes(' buildx prune ')),
      false
    );
    const hiveUpIndex = calls.findIndex(
      (call) =>
        call.includes(' up --detach --no-build') && call.includes(' hive-green')
    );
    const hiveMigrationCleanupIndex = calls.indexOf(
      `docker compose -f ${PROD_COMPOSE_FILE} rm --stop -f hive-db-migrate`
    );

    assert.ok(hiveUpIndex >= 0, 'expected Hive services to start');
    assert.ok(
      hiveMigrationCleanupIndex > hiveUpIndex,
      'expected dependency-started Hive migration cleanup after Hive starts'
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runBlueGreenProdWorkflow recreates web-proxy when its image is stale', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-proxy-image-refresh-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);
  const calls = [];
  let targetStarted = false;
  let forcedProxyRefresh = false;

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const resultFor = (stdout = '') => ({
    code: 0,
    signal: null,
    stderr: '',
    stdout,
  });

  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);

    if (command === 'docker' && args[0] === 'ps') {
      return resultFor('');
    }

    if (args.includes('ps') && args.includes('-q')) {
      const serviceName = args.at(-1);

      if (serviceName === 'web-blue') return resultFor('blue-123\n');
      if (serviceName === BLUE_GREEN_PROXY_SERVICE) {
        return resultFor('proxy-123\n');
      }
      if (serviceName === 'web') return resultFor('');
      if (serviceName === 'web-green') {
        return resultFor(targetStarted ? 'green-123\n' : '');
      }
      if (BLUE_GREEN_SUPPORT_SERVICES.includes(serviceName)) {
        return resultFor(targetStarted ? `${serviceName}-123\n` : '');
      }

      return resultFor('');
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{json .NetworkSettings.Ports}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return resultFor(`${BLUE_GREEN_PROXY_PORTS_JSON}\n`);
    }

    if (args.includes('config') && args.includes('--format')) {
      return resultFor(
        JSON.stringify({
          services: {
            [BLUE_GREEN_PROXY_SERVICE]: { image: 'nginx:1.31.0-alpine' },
          },
        })
      );
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{.Config.Image}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return resultFor('nginx:1.27-alpine\n');
    }

    if (args[0] === 'inspect') {
      return resultFor('healthy\n');
    }

    if (args.includes('build')) {
      return resultFor('');
    }

    if (args[0] === 'buildx' && args[1] === 'prune') {
      return resultFor('');
    }

    if (isHiveDbMigrateRun(command, args)) {
      return resultFor('');
    }

    if (args.includes('up') && args.includes('web-green')) {
      targetStarted = true;
      return resultFor('');
    }

    if (args.includes('up') && args.includes('hive-green')) {
      return resultFor('');
    }

    if (
      args.includes('up') &&
      BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE.some((service) =>
        args.includes(service)
      )
    ) {
      return resultFor('');
    }

    if (args.includes('up') && args.includes(BLUE_GREEN_PROXY_SERVICE)) {
      forcedProxyRefresh =
        forcedProxyRefresh || args.includes('--force-recreate');
      return resultFor('');
    }

    if (
      args.includes('exec') &&
      args.includes('web-blue') &&
      args.includes('node')
    ) {
      return resultFor(JSON.stringify({ inflightRequests: 0 }));
    }

    if (
      args.includes('exec') &&
      args.includes(BLUE_GREEN_PROXY_SERVICE) &&
      (args.includes('wget') || args.includes('nginx'))
    ) {
      return resultFor('');
    }

    if (args.includes('stop') || args.includes('rm')) {
      return resultFor('');
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  try {
    await runBlueGreenProdWorkflow(
      {
        action: 'up',
        composeArgs: [],
        composeGlobalArgs: [],
        mode: 'prod',
        strategy: 'blue-green',
      },
      {
        drainPollMs: 0,
        drainTimeoutMs: 5_000,
        env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME, PATH: 'test-path' },
        envFilePath,
        proxyDrainMs: 0,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(readBlueGreenActiveColor(paths), 'green');
    assert.equal(forcedProxyRefresh, true);
    const targetHealthyIndex = calls.findIndex(
      (call) =>
        call.includes('inspect') &&
        (call.includes('green-123') || call.includes('hive-green-123'))
    );
    const proxyRefreshIndex = calls.findIndex(
      (call) =>
        call.includes(' up --detach --no-build --force-recreate') &&
        (call.includes(` ${BLUE_GREEN_PROXY_SERVICE} `) ||
          call.endsWith(` ${BLUE_GREEN_PROXY_SERVICE}`))
    );

    assert.notEqual(targetHealthyIndex, -1);
    assert.notEqual(proxyRefreshIndex, -1);
    assert.ok(targetHealthyIndex < proxyRefreshIndex);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runBlueGreenProdWorkflow uses staged ports before direct migration proxy handoff', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-migrate-'));
  const rootDir = path.join(tempDir, 'platform');
  const envFilePath = path.join(rootDir, 'apps', 'web', '.env.local');
  const calls = [];
  let targetStarted = false;

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );

  const resultFor = (stdout = '') => ({
    code: 0,
    signal: null,
    stderr: '',
    stdout,
  });

  const runCommand = async (command, args, options = {}) => {
    const key = `${command} ${args.join(' ')}`;
    const env = options.env ?? {};
    calls.push({ env, key });

    if (command === 'docker' && args[0] === 'ps') {
      return resultFor('');
    }

    if (
      key === `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q` &&
      env.COMPOSE_PROJECT_NAME === 'platform'
    ) {
      return resultFor('legacy-web-proxy\n');
    }

    if (args[0] === 'inspect') {
      return resultFor('healthy\n');
    }

    if (args.includes('build')) {
      assert.equal(env.COMPOSE_PROJECT_NAME, 'tuturuuu');
      assert.equal(env.DOCKER_WEB_REDIS_HOST_PORT, '16379');
      return resultFor('');
    }

    if (args.includes('ps') && args.includes('-q')) {
      const serviceName = args.at(-1);

      if (targetStarted) {
        return resultFor(`${serviceName}-id\n`);
      }

      return resultFor('');
    }

    if (isHiveDbMigrateRun(command, args)) {
      assert.equal(env.COMPOSE_PROJECT_NAME, 'tuturuuu');
      assert.equal(env.DOCKER_WEB_REDIS_HOST_PORT, '16379');
      assert.equal(env.DOCKER_WEB_PROXY_HOST_PORT, '17803');
      return resultFor('');
    }

    if (args.includes('up') && args.includes('web-blue')) {
      targetStarted = true;
      assert.equal(env.COMPOSE_PROJECT_NAME, 'tuturuuu');
      assert.equal(env.DOCKER_WEB_REDIS_HOST_PORT, '16379');
      assert.equal(env.DOCKER_WEB_PROXY_HOST_PORT, '17803');
      return resultFor('');
    }

    if (
      args.includes('up') &&
      args.some((arg) => typeof arg === 'string' && arg.startsWith('hive')) &&
      env.COMPOSE_PROJECT_NAME === 'tuturuuu'
    ) {
      assert.equal(env.DOCKER_WEB_REDIS_HOST_PORT, '16379');
      return resultFor('');
    }

    if (
      args.includes('up') &&
      BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE.some((service) =>
        args.includes(service)
      ) &&
      env.COMPOSE_PROJECT_NAME === 'tuturuuu'
    ) {
      return resultFor('');
    }

    if (
      args.includes('exec') &&
      args.includes(BLUE_GREEN_PROXY_SERVICE) &&
      (args.includes('wget') || args.includes('nginx'))
    ) {
      return resultFor('');
    }

    if (
      args.includes('stop') &&
      args.includes('--timeout') &&
      args.includes(BLUE_GREEN_PROXY_SERVICE)
    ) {
      return resultFor('');
    }

    if (
      args.includes('up') &&
      args.includes(BLUE_GREEN_PROXY_SERVICE) &&
      env.COMPOSE_PROJECT_NAME === 'tuturuuu' &&
      !args.includes('--force-recreate')
    ) {
      assert.equal(env.DOCKER_WEB_PROXY_HOST_PORT, '17803');
      return resultFor('');
    }

    if (
      args.includes('up') &&
      args.includes('--force-recreate') &&
      args.includes(BLUE_GREEN_PROXY_SERVICE)
    ) {
      assert.equal(env.COMPOSE_PROJECT_NAME, 'tuturuuu');
      assert.equal(env.DOCKER_WEB_PROXY_HOST_PORT, '7803');
      return resultFor('');
    }

    if (
      (args.includes('stop') || args.includes('rm')) &&
      args.some((arg) => typeof arg === 'string' && arg.startsWith('hive'))
    ) {
      return resultFor('');
    }

    if (args.includes('down') && env.COMPOSE_PROJECT_NAME === 'platform') {
      return resultFor('');
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  try {
    const result = await runBlueGreenProdWorkflow(
      {
        action: 'up',
        composeArgs: [],
        composeGlobalArgs: ['--profile', 'redis'],
        mode: 'prod',
        strategy: 'blue-green',
      },
      {
        env: {
          DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
          PATH: 'test-path',
        },
        envFilePath,
        now: () => 0,
        rootDir,
        runCommand,
      }
    );

    assert.equal(result.migration.status, 'completed');
    assert.ok(
      calls.some(
        ({ env, key }) =>
          key.includes(' up --detach --no-build --remove-orphans') &&
          key.includes(' redis ') &&
          env.DOCKER_WEB_REDIS_HOST_PORT === '16379'
      )
    );
    assert.ok(
      calls.some(
        ({ env, key }) =>
          key.endsWith(' up --detach --no-build --force-recreate web-proxy') &&
          env.DOCKER_WEB_PROXY_HOST_PORT === '7803'
      )
    );
    assert.ok(
      calls.some(
        ({ env, key }) =>
          key.endsWith(
            ' --profile redis --profile cloudflared down --remove-orphans'
          ) && env.COMPOSE_PROJECT_NAME === 'platform'
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runComposeUpWithNameConflictRecovery removes stale Compose recreate temp containers', async () => {
  const calls = [];
  let upAttempts = 0;
  const tempName = '50824ff4b149_platform-markitdown-1';

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (command === 'docker' && args[0] === 'compose' && args.includes('up')) {
      upAttempts += 1;

      if (upAttempts === 1) {
        return {
          code: 1,
          signal: null,
          stderr: `Error response from daemon: Conflict. The container name "/${tempName}" is already in use by container "stale-markitdown". You have to remove (or rename) that container to be able to reuse that name.`,
          stdout: '',
        };
      }
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runComposeUpWithNameConflictRecovery({
    composeFile: PROD_COMPOSE_FILE,
    env: {
      COMPOSE_PROJECT_NAME: 'platform',
      PATH: 'test-path',
    },
    runCommand,
    services: ['web-green', 'markitdown', 'storage-unzip-proxy'],
    upArgs: [
      'up',
      '--build',
      '--detach',
      '--remove-orphans',
      'web-green',
      'markitdown',
      'storage-unzip-proxy',
    ],
  });

  assert.equal(upAttempts, 2);
  assert.ok(
    calls.some(
      ([command, args]) =>
        command === 'docker' &&
        args[0] === 'rm' &&
        args[1] === '-f' &&
        args[2] === tempName
    )
  );
});

test('runDockerWebWorkflow switches traffic to the new color after it becomes healthy', async () => {
  const calls = [];
  let drainChecks = 0;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-switch-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === BLUE_GREEN_PROXY_SERVICE) {
      return { code: 0, signal: null, stderr: '', stdout: 'proxy-123\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-green') {
      return { code: 0, signal: null, stderr: '', stdout: 'container-green\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      return { code: 0, signal: null, stderr: '', stdout: 'container-blue\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'hive-db-migrate') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: 'hive-db-migrate-123\n',
      };
    }

    if (
      args.includes('ps') &&
      BLUE_GREEN_SUPPORT_SERVICES.includes(args.at(-1))
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `container-${args.at(-1)}\n`,
      };
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{json .NetworkSettings.Ports}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `${BLUE_GREEN_PROXY_PORTS_JSON}\n`,
      };
    }

    if (args.includes('config') && args.includes('--format')) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: JSON.stringify({
          services: {
            [BLUE_GREEN_PROXY_SERVICE]: { image: 'nginx:1.31.0-alpine' },
          },
        }),
      };
    }

    if (
      args[0] === 'inspect' &&
      args[2] === '{{.Config.Image}}' &&
      args.at(-1) === 'proxy-123'
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: 'nginx:1.31.0-alpine\n',
      };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    if (isHiveDbMigrateRun(command, args)) {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (
      args.includes('exec') &&
      args.includes('web-blue') &&
      args.includes('node') &&
      args.some(
        (arg) =>
          typeof arg === 'string' &&
          arg.includes('http://127.0.0.1:7803/__platform/drain-status')
      )
    ) {
      drainChecks += 1;
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: JSON.stringify({
          inflightRequests: drainChecks === 1 ? 2 : 0,
          shuttingDown: false,
          timestamp: Date.now(),
        }),
      };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  try {
    await runDockerWebWorkflow(
      parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green']),
      {
        drainPollMs: 0,
        drainTimeoutMs: 5_000,
        env: { PATH: 'test-path' },
        envFilePath,
        proxyDrainMs: 0,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(readBlueGreenActiveColor(paths), 'green');
    const proxyConfig = fs.readFileSync(paths.proxyConfigFile, 'utf8');
    assert.match(
      proxyConfig,
      /server web-green:7803 resolve max_fails=1 fail_timeout=5s;/
    );
    assert.match(
      proxyConfig,
      /server web-blue:7803 backup resolve max_fails=1 fail_timeout=5s;/
    );
    const promotionUpCall = calls.find(
      ([command, args]) =>
        command === 'docker' &&
        args[0] === 'compose' &&
        args[1] === '-f' &&
        args[2] === PROD_COMPOSE_FILE &&
        args.includes('up')
    );
    assert.ok(promotionUpCall);
    assert.ok(!promotionUpCall[1].includes(BLUE_GREEN_PROXY_SERVICE));
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('stop') &&
          args.includes('web-green')
      )
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('rm') &&
          args.includes('web-green')
      )
    );
    assert.ok(
      calls.findIndex(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('rm') &&
          args.includes('web-green')
      ) <
        calls.findIndex(
          ([command, args]) =>
            command === 'docker' &&
            args.includes('up') &&
            args.includes('web-green')
        )
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes('web-blue') &&
          args.includes('node') &&
          args.some(
            (arg) =>
              typeof arg === 'string' &&
              arg.includes('http://127.0.0.1:7803/__platform/drain-status')
          )
      )
    );
    assert.equal(drainChecks, 2);
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('nginx') &&
          args.includes('-t')
      )
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('reload')
      )
    );
    assert.ok(
      calls.findIndex(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('nginx') &&
          args.includes('-t')
      ) <
        calls.findIndex(
          ([command, args]) =>
            command === 'docker' &&
            args.includes('exec') &&
            args.includes(BLUE_GREEN_PROXY_SERVICE) &&
            args.includes('reload')
        )
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('wget') &&
          args.includes('http://127.0.0.1:7803/__platform/drain-status')
      )
    );
    assert.ok(
      !calls.some(
        ([command, args]) =>
          command === 'docker' &&
          (args.includes('stop') || args.includes('rm')) &&
          args.includes('web-blue')
      )
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args[0] === 'compose' &&
          args.includes('rm') &&
          args.at(-1) === 'hive-db-migrate'
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDockerWebWorkflow ignores stale active colors without live containers', async () => {
  const calls = [];
  let webBluePsCalls = 0;
  let webProxyPsCalls = 0;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-stale-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === BLUE_GREEN_PROXY_SERVICE) {
      webProxyPsCalls += 1;
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: webProxyPsCalls === 1 ? '' : 'proxy-123\n',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      webBluePsCalls += 1;
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: webBluePsCalls === 1 ? '' : 'container-blue\n',
      };
    }

    if (
      args.includes('ps') &&
      BLUE_GREEN_SUPPORT_SERVICES.includes(args.at(-1))
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `container-${args.at(-1)}\n`,
      };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  try {
    await runDockerWebWorkflow(
      parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green']),
      {
        env: { PATH: 'test-path' },
        envFilePath,
        proxyDrainMs: 0,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(readBlueGreenActiveColor(paths), 'blue');
    const runtimeUpIndex = calls.findIndex(
      ([command, args]) =>
        command === 'docker' &&
        args[0] === 'compose' &&
        args[1] === '-f' &&
        args[2] === PROD_COMPOSE_FILE &&
        args.includes('up') &&
        args.includes('web-blue') &&
        !args.includes(BLUE_GREEN_PROXY_SERVICE)
    );
    const proxyUpIndex = calls.findIndex(
      ([command, args]) =>
        command === 'docker' &&
        args[0] === 'compose' &&
        args[1] === '-f' &&
        args[2] === PROD_COMPOSE_FILE &&
        args.includes('up') &&
        args.includes(BLUE_GREEN_PROXY_SERVICE) &&
        !args.includes('web-blue')
    );

    assert.notEqual(runtimeUpIndex, -1);
    assert.notEqual(proxyUpIndex, -1);
    assert.ok(runtimeUpIndex < proxyUpIndex);
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('wget')
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runBlueGreenCachedRecoveryWorkflow writes a valid proxy config before starting the proxy', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-cache-recovery-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);
  const calls = [];
  let activeBootstrapped = false;
  let standbyBootstrapped = false;

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (command === 'docker' && args[0] === 'image') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (command === 'docker' && args[0] === 'tag') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (command === 'docker' && args[0] === 'ps') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (
      command === 'docker' &&
      args[0] === 'compose' &&
      args.includes('up') &&
      args.includes(BLUE_GREEN_PROXY_SERVICE) &&
      args.includes('web-blue')
    ) {
      activeBootstrapped = true;
      assert.match(
        fs.readFileSync(paths.proxyConfigFile, 'utf8'),
        /server web-blue:7803 resolve max_fails=1 fail_timeout=5s;/
      );
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (
      command === 'docker' &&
      args[0] === 'compose' &&
      args.includes('up') &&
      args.includes('web-green')
    ) {
      standbyBootstrapped = true;
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === BLUE_GREEN_PROXY_SERVICE) {
      return { code: 0, signal: null, stderr: '', stdout: 'proxy-123\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: activeBootstrapped ? 'blue-123\n' : '',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'hive-blue') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: activeBootstrapped ? 'hive-blue-123\n' : '',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'hive-realtime') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: activeBootstrapped ? 'hive-realtime-123\n' : '',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'meet-realtime') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: activeBootstrapped ? 'meet-realtime-123\n' : '',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'hive-db-migrate') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: 'hive-db-migrate-123\n',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'web-green') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: standbyBootstrapped ? 'green-123\n' : '',
      };
    }

    if (args.includes('ps') && args.at(-1) === 'hive-green') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: standbyBootstrapped ? 'hive-green-123\n' : '',
      };
    }

    if (isHiveDbMigrateRun(command, args)) {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('rm') && args.at(-1) === 'hive-db-migrate') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    if (
      args.includes('exec') &&
      (args.includes('nginx') || args.includes('wget'))
    ) {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };

  try {
    await runBlueGreenCachedRecoveryWorkflow(
      {
        action: 'up',
        composeArgs: [],
        composeGlobalArgs: ['--profile', 'redis'],
        mode: 'prod',
        strategy: 'blue-green',
      },
      {
        cachedImageTag: 'platform-web-cache:cached123',
        env: { PATH: 'test-path' },
        envFilePath,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(readBlueGreenActiveColor(paths), 'blue');
    const proxyConfig = fs.readFileSync(paths.proxyConfigFile, 'utf8');
    assert.match(
      proxyConfig,
      /server web-blue:7803 resolve max_fails=1 fail_timeout=5s;/
    );
    assert.match(
      proxyConfig,
      /server web-green:7803 backup resolve max_fails=1 fail_timeout=5s;/
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args[0] === 'compose' &&
          args.includes('up') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('web-blue')
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
