const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BUILDKIT_SERVICE_NAME,
  cleanupBuildkitAfterBuild,
  DEFAULT_BUILDER_NAME,
  DEFAULT_BUILDKIT_HOST_PORT,
  ensureBuildkitBuilder,
  getAutoBuildCpus,
  getAutoBuildMaxParallelism,
  getAutoBuildMemory,
  getBuildkitPaths,
  getBuilderConfigFingerprint,
  getDockerMemoryLimitBytes,
  getResolvedBuildkitComposeEnv,
  isBuildxBuilderUsable,
  isTransientBuildkitComposeUpError,
  isBunTarballExtractionError,
  LEGACY_BUILDER_NAMES,
  normalizeBuilderConfig,
  parseMemoryToBytes,
  parsePositiveInteger,
  parsePositiveNumber,
  pruneBuildkitCacheAfterBuild,
  readBuilderState,
  recoverBuildkitBunInstallCache,
  renderBuildkitConfig,
  shouldPruneBuildkitAfterBuild,
  shouldStopBuildkitAfterBuild,
  stopBuildkitComposeServiceAfterBuild,
} = require('./docker-web/buildkit-builder.js');
const {
  BUILD_RESOURCE_PROFILES,
  createBuildResourceProfileSelection,
  getBuildResourceProfilePaths,
  getNextLowerBuildResourceProfile,
  hasExplicitBuildResourceCliConfig,
  hasExplicitBuildResourceEnv,
  isBuildkitResourceProfileFallbackError,
  isDefaultBuildResourceCliConfig,
  persistBuildResourceProfile,
  readBuildResourceProfileState,
  shouldUseAdaptiveBuildResourceProfile,
} = require('./docker-web/resource-profiles.js');
const { PROD_COMPOSE_FILE } = require('./docker-web/compose.js');

test('parsePositiveNumber accepts positive numeric values and rejects invalid ones', () => {
  assert.equal(parsePositiveNumber('8'), 8);
  assert.equal(parsePositiveNumber(' 2.5 '), 2.5);
  assert.equal(parsePositiveNumber(4), 4);
  assert.equal(parsePositiveNumber('0'), null);
  assert.equal(parsePositiveNumber('-1'), null);
  assert.equal(parsePositiveNumber('abc'), null);
});

test('parsePositiveInteger only accepts positive integers', () => {
  assert.equal(parsePositiveInteger('4'), 4);
  assert.equal(parsePositiveInteger(3), 3);
  assert.equal(parsePositiveInteger('2.5'), null);
  assert.equal(parsePositiveInteger('0'), null);
});

test('normalizeBuilderConfig returns null when no throttling config is present', () => {
  assert.equal(normalizeBuilderConfig({}, {}), null);
});

test('adaptive build resource profiles treat root defaults as automatic caps', () => {
  assert.equal(
    isDefaultBuildResourceCliConfig({
      cpus: '4',
      maxParallelism: '1',
      memory: 'auto',
    }),
    true
  );
  assert.equal(
    hasExplicitBuildResourceCliConfig({
      cpus: '4',
      maxParallelism: '1',
      memory: 'auto',
    }),
    false
  );
  assert.equal(
    hasExplicitBuildResourceCliConfig({
      cpus: '4',
      maxParallelism: '2',
      memory: 'auto',
    }),
    true
  );
  assert.equal(
    shouldUseAdaptiveBuildResourceProfile({
      cpus: '4',
      env: {},
      maxParallelism: '1',
      memory: 'auto',
    }),
    true
  );
  assert.equal(shouldUseAdaptiveBuildResourceProfile({ env: {} }), false);
});

test('adaptive build resource profiles opt out for explicit env or CLI caps', () => {
  assert.equal(
    hasExplicitBuildResourceEnv({
      DOCKER_WEB_BUILD_MEMORY: '12g',
    }),
    true
  );
  assert.equal(
    shouldUseAdaptiveBuildResourceProfile({
      cpus: '4',
      env: {
        DOCKER_WEB_BUILD_RESOURCE_PROFILE_ADAPTIVE: '0',
      },
      maxParallelism: '1',
      memory: 'auto',
    }),
    false
  );
  assert.equal(
    shouldUseAdaptiveBuildResourceProfile({
      cpus: '2',
      env: {},
      maxParallelism: '1',
      memory: '8g',
    }),
    false
  );
  assert.equal(
    shouldUseAdaptiveBuildResourceProfile({
      cpus: '4',
      env: {
        DOCKER_WEB_BUILD_CPUS: '4',
      },
      maxParallelism: '1',
      memory: 'auto',
    }),
    false
  );
});

test('adaptive build resource profile selection reads and persists runtime state', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildkit-profile-'));
  const paths = getBuildResourceProfilePaths(tempDir);

  try {
    const lowProfile = BUILD_RESOURCE_PROFILES.find(
      (profile) => profile.name === 'low'
    );
    persistBuildResourceProfile({
      previousProfileName: 'stable',
      profile: lowProfile,
      reason: 'test',
      stateFile: paths.stateFile,
    });

    const selection = createBuildResourceProfileSelection({
      cpus: '4',
      env: {},
      maxParallelism: '1',
      memory: 'auto',
      paths,
    });

    assert.equal(selection.enabled, true);
    assert.equal(selection.profileName, 'low');
    assert.equal(selection.profile.memory, '10g');
    assert.equal(selection.stateFile, paths.stateFile);
    assert.equal(readBuildResourceProfileState(paths).profileName, 'low');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('adaptive build resource profile fallback classification is specific to BuildKit infrastructure failures', () => {
  assert.equal(getNextLowerBuildResourceProfile('default')?.name, 'stable');
  assert.equal(getNextLowerBuildResourceProfile('floor'), null);
  assert.equal(
    isBuildkitResourceProfileFallbackError(
      new Error(
        'rpc error: code = Unavailable desc = closing transport due to: connection error: desc = "error reading from server: EOF", received prior goaway: code: NO_ERROR'
      )
    ),
    true
  );
  assert.equal(
    isBuildkitResourceProfileFallbackError(
      new Error(
        [
          '#2 ERROR: context deadline exceeded',
          '> [internal] waiting for connection:',
          'ERROR: context deadline exceeded',
        ].join('\n')
      )
    ),
    true
  );
  assert.equal(
    isBuildkitResourceProfileFallbackError(
      new Error('Name: tuturuuu\nDriver: remote\nStatus: inactive\n')
    ),
    true
  );
  assert.equal(
    isBuildkitResourceProfileFallbackError(
      new Error('TypeScript error: Property "foo" does not exist')
    ),
    false
  );
});

test('isBuildxBuilderUsable requires a running remote builder when status is reported', () => {
  assert.equal(
    isBuildxBuilderUsable({
      driver: 'remote',
      exists: true,
      status: null,
    }),
    true
  );
  assert.equal(
    isBuildxBuilderUsable({
      driver: 'remote',
      exists: true,
      status: 'running',
    }),
    true
  );
  assert.equal(
    isBuildxBuilderUsable({
      driver: 'remote',
      exists: true,
      status: 'inactive',
    }),
    false
  );
  assert.equal(
    isBuildxBuilderUsable({
      driver: 'docker-container',
      exists: true,
      status: 'running',
    }),
    false
  );
});

test('normalizeBuilderConfig reads throttling defaults from env', () => {
  assert.deepEqual(
    normalizeBuilderConfig(
      {},
      {
        DOCKER_WEB_BUILD_CPUS: '8',
        DOCKER_WEB_BUILD_MAX_PARALLELISM: '2',
        DOCKER_WEB_BUILD_MEMORY: '16g',
      }
    ),
    {
      builderName: DEFAULT_BUILDER_NAME,
      cpus: 8,
      endpoint: `tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`,
      maxParallelism: 2,
      memory: '16g',
    }
  );
});

test('normalizeBuilderConfig resolves auto throttling from current Docker memory', () => {
  const currentDockerMemory = String(9364279296);
  const largeDockerMemory = String(28 * 1024 * 1024 * 1024);

  assert.equal(parseMemoryToBytes('8g'), 8 * 1024 * 1024 * 1024);
  assert.equal(
    getDockerMemoryLimitBytes({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: currentDockerMemory,
    }),
    9364279296
  );
  assert.equal(
    getAutoBuildMemory({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: currentDockerMemory,
    }),
    '6144m'
  );
  assert.equal(
    getAutoBuildCpus({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: currentDockerMemory,
    }),
    1
  );
  assert.equal(
    getAutoBuildMaxParallelism({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: currentDockerMemory,
    }),
    1
  );
  assert.equal(
    getAutoBuildMemory({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: largeDockerMemory,
    }),
    '21504m'
  );
  assert.deepEqual(
    normalizeBuilderConfig(
      {
        cpus: 'auto',
        maxParallelism: 'auto',
        memory: 'auto',
      },
      {
        DOCKER_WEB_DOCKER_MEMORY_LIMIT: currentDockerMemory,
      }
    ),
    {
      builderName: DEFAULT_BUILDER_NAME,
      cpus: 1,
      endpoint: `tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`,
      maxParallelism: 1,
      memory: '6144m',
    }
  );
  assert.deepEqual(
    normalizeBuilderConfig(
      {
        cpus: '4',
        maxParallelism: '1',
        memory: 'auto',
      },
      {
        DOCKER_WEB_DOCKER_MEMORY_LIMIT: largeDockerMemory,
      }
    ),
    {
      builderName: DEFAULT_BUILDER_NAME,
      cpus: 4,
      endpoint: `tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`,
      maxParallelism: 1,
      memory: '21504m',
    }
  );
});

test('getResolvedBuildkitComposeEnv resolves helper-only auto values for Compose', () => {
  assert.deepEqual(
    {
      DOCKER_WEB_BUILD_CPUS: getResolvedBuildkitComposeEnv({
        DOCKER_WEB_BUILD_CPUS: 'auto',
        DOCKER_WEB_BUILD_MAX_PARALLELISM: 'auto',
        DOCKER_WEB_BUILD_MEMORY: 'auto',
        DOCKER_WEB_DOCKER_MEMORY_LIMIT: String(28 * 1024 * 1024 * 1024),
      }).DOCKER_WEB_BUILD_CPUS,
      DOCKER_WEB_BUILD_MAX_PARALLELISM: getResolvedBuildkitComposeEnv({
        DOCKER_WEB_BUILD_CPUS: 'auto',
        DOCKER_WEB_BUILD_MAX_PARALLELISM: 'auto',
        DOCKER_WEB_BUILD_MEMORY: 'auto',
        DOCKER_WEB_DOCKER_MEMORY_LIMIT: String(28 * 1024 * 1024 * 1024),
      }).DOCKER_WEB_BUILD_MAX_PARALLELISM,
      DOCKER_WEB_BUILD_MEMORY: getResolvedBuildkitComposeEnv({
        DOCKER_WEB_BUILD_CPUS: 'auto',
        DOCKER_WEB_BUILD_MAX_PARALLELISM: 'auto',
        DOCKER_WEB_BUILD_MEMORY: 'auto',
        DOCKER_WEB_DOCKER_MEMORY_LIMIT: String(28 * 1024 * 1024 * 1024),
      }).DOCKER_WEB_BUILD_MEMORY,
    },
    {
      DOCKER_WEB_BUILD_CPUS: '4',
      DOCKER_WEB_BUILD_MAX_PARALLELISM: '2',
      DOCKER_WEB_BUILD_MEMORY: '21504m',
    }
  );
});

test('normalizeBuilderConfig rejects invalid CPU and parallelism values', () => {
  assert.throws(
    () => normalizeBuilderConfig({ cpus: 'nope' }, {}),
    /Build CPUs must be a positive number/
  );
  assert.throws(
    () => normalizeBuilderConfig({ maxParallelism: '1.5' }, {}),
    /Build max parallelism must be a positive integer/
  );
});

test('renderBuildkitConfig writes max parallelism in BuildKit TOML format', () => {
  assert.equal(
    renderBuildkitConfig(2),
    ['[worker.oci]', '  max-parallelism = 2', ''].join('\n')
  );
});

test('isTransientBuildkitComposeUpError detects Docker registry timeouts only', () => {
  assert.equal(
    isTransientBuildkitComposeUpError(
      new Error(
        'buildkit Error Head "https://registry-1.docker.io/v2/moby/buildkit/manifests/buildx-stable-1": Get "https://auth.docker.io/token?service=registry.docker.io": context deadline exceeded (Client.Timeout exceeded while awaiting headers)'
      )
    ),
    true
  );
  assert.equal(
    isTransientBuildkitComposeUpError(
      new Error(
        'ERROR: failed to solve: node:24-bookworm-slim: failed to fetch oauth token: unexpected status from POST request to https://auth.docker.io/token: 504 Gateway Timeout: error code: 504'
      )
    ),
    true
  );
  assert.equal(
    isTransientBuildkitComposeUpError(
      new Error(
        'Error response from daemon: pull access denied for moby/buildkit, repository does not exist or may require docker login'
      )
    ),
    false
  );
});

test('shouldPruneBuildkitAfterBuild defaults on and accepts explicit opt-out', () => {
  assert.equal(shouldPruneBuildkitAfterBuild({}), true);
  assert.equal(
    shouldPruneBuildkitAfterBuild({
      DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD: '1',
    }),
    true
  );
  assert.equal(
    shouldPruneBuildkitAfterBuild({
      DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD: 'false',
    }),
    false
  );
  assert.equal(
    shouldPruneBuildkitAfterBuild({
      DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD: ' off ',
    }),
    false
  );
});

test('shouldStopBuildkitAfterBuild defaults on and accepts explicit opt-out', () => {
  assert.equal(shouldStopBuildkitAfterBuild({}), true);
  assert.equal(
    shouldStopBuildkitAfterBuild({
      DOCKER_WEB_BUILDKIT_STOP_AFTER_BUILD: '1',
    }),
    true
  );
  assert.equal(
    shouldStopBuildkitAfterBuild({
      DOCKER_WEB_BUILDKIT_STOP_AFTER_BUILD: 'false',
    }),
    false
  );
  assert.equal(
    shouldStopBuildkitAfterBuild({
      DOCKER_WEB_BUILDKIT_STOP_AFTER_BUILD: ' off ',
    }),
    false
  );
});

test('isBunTarballExtractionError detects truncated Bun install failures', () => {
  assert.equal(
    isBunTarballExtractionError(
      new Error(
        [
          'RUN --mount=type=cache bun install --frozen-lockfile',
          '3173 packages installed [64.38s]',
          'Failed to install 1 package',
        ].join('\n')
      )
    ),
    true
  );
  assert.equal(
    isBunTarballExtractionError(new Error('lockfile had changes')),
    false
  );
});

test('pruneBuildkitCacheAfterBuild prunes all cache for the active builder', async () => {
  const calls = [];

  const result = await pruneBuildkitCacheAfterBuild({
    env: { BUILDX_BUILDER: 'platform-test-builder' },
    runCommand: async (command, args, options = {}) => {
      calls.push({
        args,
        command,
        env: options.env,
      });

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
  });

  assert.deepEqual(result, {
    builderName: 'platform-test-builder',
    pruned: true,
    skipped: false,
  });
  assert.deepEqual(calls, [
    {
      args: [
        'buildx',
        'prune',
        '--builder',
        'platform-test-builder',
        '--all',
        '--force',
      ],
      command: 'docker',
      env: { BUILDX_BUILDER: 'platform-test-builder' },
    },
  ]);
});

test('pruneBuildkitCacheAfterBuild skips when disabled', async () => {
  const calls = [];

  const result = await pruneBuildkitCacheAfterBuild({
    env: { DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD: '0' },
    runCommand: async (command, args) => {
      calls.push([command, args]);
      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
  });

  assert.deepEqual(result, {
    builderName: null,
    pruned: false,
    skipped: true,
  });
  assert.deepEqual(calls, []);
});

test('stopBuildkitComposeServiceAfterBuild removes the running compose service', async () => {
  const calls = [];

  const result = await stopBuildkitComposeServiceAfterBuild({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: { PATH: 'test-path' },
    runCommand: async (command, args, options = {}) => {
      calls.push({
        args,
        command,
        env: options.env,
      });

      if (args.includes('ps') && args.at(-1) === BUILDKIT_SERVICE_NAME) {
        return { code: 0, signal: null, stderr: '', stdout: 'buildkit-id\n' };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
  });

  assert.deepEqual(result, {
    removed: true,
    skipped: false,
    stopped: true,
  });
  assert.deepEqual(
    calls.map(({ command, args }) => [command, args]),
    [
      [
        'docker',
        [
          'compose',
          '-f',
          PROD_COMPOSE_FILE,
          '--profile',
          'redis',
          'ps',
          '-q',
          BUILDKIT_SERVICE_NAME,
        ],
      ],
      [
        'docker',
        [
          'compose',
          '-f',
          PROD_COMPOSE_FILE,
          '--profile',
          'redis',
          'ps',
          '-a',
          '-q',
          BUILDKIT_SERVICE_NAME,
        ],
      ],
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
          BUILDKIT_SERVICE_NAME,
        ],
      ],
      [
        'docker',
        [
          'compose',
          '-f',
          PROD_COMPOSE_FILE,
          '--profile',
          'redis',
          'rm',
          '-f',
          BUILDKIT_SERVICE_NAME,
        ],
      ],
    ]
  );
});

test('cleanupBuildkitAfterBuild skips prune when BuildKit is already stopped', async () => {
  const calls = [];

  const result = await cleanupBuildkitAfterBuild({
    composeFile: PROD_COMPOSE_FILE,
    env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME, PATH: 'test-path' },
    runCommand: async (command, args) => {
      calls.push([command, args]);

      if (
        args.includes('ps') &&
        args.includes('-a') &&
        args.at(-1) === BUILDKIT_SERVICE_NAME
      ) {
        return { code: 0, signal: null, stderr: '', stdout: 'buildkit-id\n' };
      }

      if (args.includes('ps') && args.at(-1) === BUILDKIT_SERVICE_NAME) {
        return { code: 0, signal: null, stderr: '', stdout: '' };
      }

      if (args.includes('rm') && args.at(-1) === BUILDKIT_SERVICE_NAME) {
        return { code: 0, signal: null, stderr: '', stdout: '' };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    },
  });

  assert.deepEqual(result, {
    prune: {
      builderName: null,
      pruned: false,
      skipped: true,
    },
    skipped: false,
    stop: {
      removed: true,
      skipped: false,
      stopped: false,
    },
  });
  assert.deepEqual(calls, [
    [
      'docker',
      ['compose', '-f', PROD_COMPOSE_FILE, 'ps', '-q', BUILDKIT_SERVICE_NAME],
    ],
    [
      'docker',
      ['compose', '-f', PROD_COMPOSE_FILE, 'ps', '-q', BUILDKIT_SERVICE_NAME],
    ],
    [
      'docker',
      [
        'compose',
        '-f',
        PROD_COMPOSE_FILE,
        'ps',
        '-a',
        '-q',
        BUILDKIT_SERVICE_NAME,
      ],
    ],
    [
      'docker',
      ['compose', '-f', PROD_COMPOSE_FILE, 'rm', '-f', BUILDKIT_SERVICE_NAME],
    ],
  ]);
});

test('recoverBuildkitBunInstallCache recreates BuildKit when exec cache prune loses transport', async () => {
  const calls = [];

  const result = await recoverBuildkitBunInstallCache({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: { BUILDX_BUILDER: DEFAULT_BUILDER_NAME, PATH: 'test-path' },
    runCommand: async (command, args) => {
      calls.push([command, args]);

      if (
        args[0] === 'buildx' &&
        args[1] === 'prune' &&
        args.includes('type=exec.cachemount')
      ) {
        return {
          code: 1,
          signal: null,
          stderr:
            'rpc error: code = Unavailable desc = closing transport: error reading from server: EOF',
          stdout: '',
        };
      }

      if (args.includes('ps') && args.at(-1) === BUILDKIT_SERVICE_NAME) {
        return {
          code: 0,
          signal: null,
          stderr: '',
          stdout: 'buildkit-id\n',
        };
      }

      if (args[0] === 'inspect' && args.at(-1) === 'buildkit-id') {
        return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
      }

      if (command === 'docker') {
        return { code: 0, signal: null, stderr: '', stdout: '' };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    },
  });

  assert.equal(result.builderName, DEFAULT_BUILDER_NAME);
  assert.equal(result.execCachePruned, false);
  assert.deepEqual(result.service, {
    recreated: true,
    skipped: false,
  });
  assert.deepEqual(
    calls.map(([command, args]) => `${command} ${args.join(' ')}`),
    [
      `docker buildx prune --builder ${DEFAULT_BUILDER_NAME} --force --filter type=exec.cachemount`,
      `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop --timeout 1 ${BUILDKIT_SERVICE_NAME}`,
      `docker compose -f ${PROD_COMPOSE_FILE} --profile redis rm -f ${BUILDKIT_SERVICE_NAME}`,
      `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build ${BUILDKIT_SERVICE_NAME}`,
      `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q ${BUILDKIT_SERVICE_NAME}`,
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} buildkit-id',
    ]
  );
});

test('recoverBuildkitBunInstallCache resolves auto memory before Compose recreate', async () => {
  const calls = [];

  await recoverBuildkitBunInstallCache({
    composeFile: PROD_COMPOSE_FILE,
    composeGlobalArgs: ['--profile', 'redis'],
    env: {
      BUILDX_BUILDER: DEFAULT_BUILDER_NAME,
      DOCKER_WEB_BUILD_CPUS: 'auto',
      DOCKER_WEB_BUILD_MAX_PARALLELISM: 'auto',
      DOCKER_WEB_BUILD_MEMORY: 'auto',
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: String(28 * 1024 * 1024 * 1024),
      PATH: 'test-path',
    },
    runCommand: async (command, args, options = {}) => {
      calls.push({ args, command, env: options.env });

      if (args.includes('ps') && args.at(-1) === BUILDKIT_SERVICE_NAME) {
        return {
          code: 0,
          signal: null,
          stderr: '',
          stdout: 'buildkit-id\n',
        };
      }

      if (args[0] === 'inspect' && args.at(-1) === 'buildkit-id') {
        return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    },
  });

  const composeBuildkitCalls = calls.filter(
    (call) =>
      call.command === 'docker' &&
      call.args[0] === 'compose' &&
      call.args.includes(BUILDKIT_SERVICE_NAME)
  );

  assert.ok(composeBuildkitCalls.length > 0);

  for (const call of composeBuildkitCalls) {
    assert.equal(call.env.DOCKER_WEB_BUILD_MEMORY, '21504m');
    assert.equal(call.env.DOCKER_WEB_BUILD_CPUS, '4');
    assert.equal(call.env.DOCKER_WEB_BUILD_MAX_PARALLELISM, '2');
  }
});

test('getBuilderConfigFingerprint is stable for the same config', () => {
  const config = {
    builderName: DEFAULT_BUILDER_NAME,
    cpus: 8,
    maxParallelism: 2,
    memory: '16g',
  };

  assert.equal(
    getBuilderConfigFingerprint(config),
    getBuilderConfigFingerprint(config)
  );
});

test('ensureBuildkitBuilder returns the original env when throttling is disabled', async () => {
  const env = { PATH: 'test-path' };

  assert.equal(await ensureBuildkitBuilder({}, { env }), env);
});

test('ensureBuildkitBuilder creates a capped buildx builder and persists state', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildkit-builder-'));
  const calls = [];
  const paths = getBuildkitPaths(tempDir);

  try {
    const env = await ensureBuildkitBuilder(
      {
        cpus: '8',
        maxParallelism: '2',
        memory: '16g',
      },
      {
        env: { PATH: 'test-path' },
        rootDir: tempDir,
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

          return { code: 0, signal: null, stderr: '', stdout: '' };
        },
      }
    );

    assert.equal(env.BUILDX_BUILDER, DEFAULT_BUILDER_NAME);
    assert.equal(env.COMPOSE_PARALLEL_LIMIT, '2');
    assert.match(
      fs.readFileSync(paths.buildkitConfigFile, 'utf8'),
      /max-parallelism = 2/
    );
    assert.deepEqual(readBuilderState(paths), {
      builderName: DEFAULT_BUILDER_NAME,
      fingerprint: getBuilderConfigFingerprint({
        builderName: DEFAULT_BUILDER_NAME,
        cpus: 8,
        endpoint: `tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`,
        maxParallelism: 2,
        memory: '16g',
      }),
    });
    assert.ok(
      calls.some(
        (call) =>
          call.command === 'docker' &&
          call.args[0] === 'buildx' &&
          call.args[1] === 'create' &&
          call.args.includes('--driver') &&
          call.args[5] === 'remote' &&
          call.args.includes(`tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`)
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('ensureBuildkitBuilder retries transient BuildKit compose startup with backoff', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'buildkit-builder-retry-')
  );
  const calls = [];
  const delays = [];
  let composeUpAttempts = 0;

  try {
    const env = await ensureBuildkitBuilder(
      {
        cpus: '2',
        maxParallelism: '1',
        memory: '4g',
      },
      {
        composeFile: PROD_COMPOSE_FILE,
        composeGlobalArgs: ['--profile', 'redis'],
        env: {
          DOCKER_WEB_BUILDKIT_UP_INITIAL_DELAY_MS: '1',
          DOCKER_WEB_BUILDKIT_UP_MAX_DELAY_MS: '4',
          PATH: 'test-path',
        },
        rootDir: tempDir,
        runCommand: async (command, args, options = {}) => {
          calls.push({
            args,
            command,
            stdio: options.stdio ?? 'inherit',
            teeOutput: options.teeOutput ?? false,
          });

          if (
            command === 'docker' &&
            args[0] === 'compose' &&
            args.includes('up') &&
            args.includes(BUILDKIT_SERVICE_NAME)
          ) {
            composeUpAttempts += 1;

            return composeUpAttempts < 3
              ? {
                  code: 1,
                  signal: null,
                  stderr:
                    'buildkit Error Head "https://registry-1.docker.io/v2/moby/buildkit/manifests/buildx-stable-1": Get "https://auth.docker.io/token?service=registry.docker.io": context deadline exceeded (Client.Timeout exceeded while awaiting headers)',
                  stdout: '',
                }
              : { code: 0, signal: null, stderr: '', stdout: '' };
          }

          if (args.includes('ps') && args.includes(BUILDKIT_SERVICE_NAME)) {
            return {
              code: 0,
              signal: null,
              stderr: '',
              stdout: 'buildkit-id\n',
            };
          }

          if (args[0] === 'inspect' && args.includes('buildkit-id')) {
            return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
          }

          if (args[0] === 'buildx' && args[1] === 'inspect') {
            return { code: 1, signal: null, stderr: '', stdout: '' };
          }

          return { code: 0, signal: null, stderr: '', stdout: '' };
        },
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      }
    );

    assert.equal(env.BUILDX_BUILDER, DEFAULT_BUILDER_NAME);
    assert.equal(composeUpAttempts, 3);
    assert.deepEqual(delays, [1, 2]);
    assert.equal(
      calls.filter(
        (call) =>
          call.command === 'docker' &&
          call.args[0] === 'compose' &&
          call.args.includes('up') &&
          call.args.includes(BUILDKIT_SERVICE_NAME) &&
          call.stdio === 'pipe' &&
          call.teeOutput
      ).length,
      3
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('ensureBuildkitBuilder reuses an existing builder when the fingerprint matches', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'buildkit-builder-reuse-')
  );
  const calls = [];
  const paths = getBuildkitPaths(tempDir);
  const config = {
    builderName: DEFAULT_BUILDER_NAME,
    cpus: 8,
    endpoint: `tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`,
    maxParallelism: 2,
    memory: '16g',
  };

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.stateFile,
      JSON.stringify(
        {
          builderName: DEFAULT_BUILDER_NAME,
          fingerprint: getBuilderConfigFingerprint(config),
        },
        null,
        2
      ),
      'utf8'
    );

    const env = await ensureBuildkitBuilder(config, {
      env: { PATH: 'test-path' },
      rootDir: tempDir,
      runCommand: async (command, args, options = {}) => {
        calls.push({
          args,
          command,
          env: options.env,
          stdio: options.stdio ?? 'inherit',
        });

        if (args[0] === 'buildx' && args[1] === 'inspect') {
          return {
            code: 0,
            signal: null,
            stderr: '',
            stdout: 'Driver: remote\n',
          };
        }

        return { code: 0, signal: null, stderr: '', stdout: '' };
      },
    });

    assert.equal(env.BUILDX_BUILDER, DEFAULT_BUILDER_NAME);
    assert.equal(env.COMPOSE_PARALLEL_LIMIT, '2');
    assert.equal(
      calls.filter(
        (call) =>
          call.command === 'docker' &&
          call.args[0] === 'buildx' &&
          call.args[1] === 'create'
      ).length,
      0
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('ensureBuildkitBuilder recreates an inactive remote builder even when the fingerprint matches', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'buildkit-builder-inactive-')
  );
  const calls = [];
  const paths = getBuildkitPaths(tempDir);
  const config = {
    builderName: DEFAULT_BUILDER_NAME,
    cpus: 2,
    endpoint: `tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`,
    maxParallelism: 1,
    memory: '10g',
  };

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.stateFile,
      JSON.stringify(
        {
          builderName: DEFAULT_BUILDER_NAME,
          fingerprint: getBuilderConfigFingerprint(config),
        },
        null,
        2
      ),
      'utf8'
    );

    const env = await ensureBuildkitBuilder(config, {
      env: { PATH: 'test-path' },
      rootDir: tempDir,
      runCommand: async (command, args, options = {}) => {
        calls.push({
          args,
          command,
          env: options.env,
          stdio: options.stdio ?? 'inherit',
        });

        if (args[0] === 'buildx' && args[1] === 'inspect') {
          return {
            code: 0,
            signal: null,
            stderr: '',
            stdout: [
              `Name: ${DEFAULT_BUILDER_NAME}`,
              'Driver: remote',
              'Nodes:',
              `Name: ${DEFAULT_BUILDER_NAME}0`,
              `Endpoint: tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`,
              'Status: inactive',
              '',
            ].join('\n'),
          };
        }

        return { code: 0, signal: null, stderr: '', stdout: '' };
      },
    });

    assert.equal(env.BUILDX_BUILDER, DEFAULT_BUILDER_NAME);
    assert.ok(
      calls.some(
        (call) =>
          call.command === 'docker' &&
          call.args[0] === 'buildx' &&
          call.args[1] === 'rm' &&
          call.args.includes(DEFAULT_BUILDER_NAME)
      )
    );
    assert.ok(
      calls.some(
        (call) =>
          call.command === 'docker' &&
          call.args[0] === 'buildx' &&
          call.args[1] === 'create' &&
          call.args.includes('--driver') &&
          call.args.includes('remote') &&
          call.args.includes(`tcp://127.0.0.1:${DEFAULT_BUILDKIT_HOST_PORT}`)
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('ensureBuildkitBuilder removes legacy docker-container BuildKit containers', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'buildkit-builder-legacy-')
  );
  const calls = [];
  const legacyContainerName = `buildx_buildkit_${DEFAULT_BUILDER_NAME}0`;

  try {
    await ensureBuildkitBuilder(
      {
        cpus: '2',
        maxParallelism: '1',
        memory: '4g',
      },
      {
        env: { PATH: 'test-path' },
        rootDir: tempDir,
        runCommand: async (command, args, options = {}) => {
          calls.push({
            args,
            command,
            env: options.env,
            stdio: options.stdio ?? 'inherit',
          });

          if (args[0] === 'buildx' && args[1] === 'inspect') {
            return {
              code: 0,
              signal: null,
              stderr: '',
              stdout: 'Driver: docker-container\n',
            };
          }

          if (args[0] === 'ps' && args.includes('{{.Names}}')) {
            return {
              code: 0,
              signal: null,
              stderr: '',
              stdout: `${legacyContainerName}\n`,
            };
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
          call.args[1] === 'rm' &&
          call.args.includes(DEFAULT_BUILDER_NAME)
      )
    );
    assert.ok(
      calls.some(
        (call) =>
          call.command === 'docker' &&
          call.args[0] === 'rm' &&
          call.args[1] === '-f' &&
          call.args.includes(legacyContainerName)
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('ensureBuildkitBuilder removes stale legacy Buildx builder names', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'buildkit-builder-stale-name-')
  );
  const calls = [];
  const legacyBuilderName = LEGACY_BUILDER_NAMES[0];

  try {
    await ensureBuildkitBuilder(
      {
        cpus: '2',
        maxParallelism: '1',
        memory: '4g',
      },
      {
        env: { PATH: 'test-path' },
        rootDir: tempDir,
        runCommand: async (command, args, options = {}) => {
          calls.push({
            args,
            command,
            env: options.env,
            stdio: options.stdio ?? 'inherit',
          });

          if (args[0] === 'buildx' && args[1] === 'inspect') {
            if (args[2] === legacyBuilderName) {
              return {
                code: 0,
                signal: null,
                stderr: '',
                stdout: 'Driver: docker-container\n',
              };
            }

            return { code: 1, signal: null, stderr: '', stdout: '' };
          }

          if (args[0] === 'ps' && args.includes('{{.Names}}')) {
            return { code: 0, signal: null, stderr: '', stdout: '' };
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
          call.args[1] === 'rm' &&
          call.args.includes(legacyBuilderName)
      )
    );
    assert.ok(
      calls.some(
        (call) =>
          call.command === 'docker' &&
          call.args[0] === 'buildx' &&
          call.args[1] === 'create' &&
          call.args.includes(DEFAULT_BUILDER_NAME)
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('production Docker root scripts keep the default build caps', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  const webPackageJson = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', 'apps', 'web', 'package.json'),
      'utf8'
    )
  );
  const turboConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'turbo.json'), 'utf8')
  );
  const buildWebDockerScript = fs.readFileSync(
    path.join(__dirname, 'build-web-docker.js'),
    'utf8'
  );
  const runWebDockerNextBuildScript = fs.readFileSync(
    path.join(__dirname, 'run-web-docker-next-build.js'),
    'utf8'
  );
  const webNextConfig = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'web', 'next.config.ts'),
    'utf8'
  );

  assert.match(
    packageJson.scripts['serve:web:docker'],
    /--build-memory auto --build-cpus 4 --build-max-parallelism 1/
  );
  assert.match(
    packageJson.scripts['serve:web:docker:bg'],
    /--build-memory auto --build-cpus 4 --build-max-parallelism 1/
  );
  assert.equal(
    packageJson.scripts['build:web:docker'],
    'bun turbo:local run build:docker -F @tuturuuu/web'
  );
  assert.equal(
    webPackageJson.scripts['build:docker'],
    'bun ../../scripts/run-web-docker-next-build.js'
  );
  assert.match(
    runWebDockerNextBuildScript,
    /NODE_MAX_OLD_SPACE_SIZE_BUCKETS_MB = \[\s*16384, 12288, 8192, 7168, 6144, 4096,?\s*\]/
  );
  assert.match(
    runWebDockerNextBuildScript,
    /DEFAULT_NEXT_BUILD_ENGINE = 'turbopack'/
  );
  assert.match(
    runWebDockerNextBuildScript,
    /DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE/
  );
  assert.match(runWebDockerNextBuildScript, /DOCKER_WEB_NEXT_BUILD_ENGINE/);
  assert.match(runWebDockerNextBuildScript, /--max-old-space-size=\$\{/);
  assert.match(runWebDockerNextBuildScript, /--experimental-require-module/);
  assert.match(runWebDockerNextBuildScript, /DOCKER_WEB_NODE_BINARY/);
  assert.match(
    runWebDockerNextBuildScript,
    /NEXT_BUILD_ENGINES\.get\(nextBuildEngine\)/
  );
  assert.deepEqual(turboConfig.tasks['build:docker'].dependsOn, ['^build']);
  for (const taskName of ['build', 'build:docker']) {
    const outputs = turboConfig.tasks[taskName].outputs;
    assert.ok(
      outputs.includes('.next/**'),
      `${taskName} should cache production Next outputs`
    );
    assert.ok(
      outputs.includes('!.next/cache/**'),
      `${taskName} should skip volatile production Next cache`
    );
    assert.ok(
      outputs.includes('!.next/dev/**'),
      `${taskName} should not archive local Next dev server state`
    );
  }
  assert.match(buildWebDockerScript, /build:web:docker/);
  assert.match(webNextConfig, /DOCKER_WEB_STATIC_PAGE_GENERATION_TIMEOUT/);
  assert.match(webNextConfig, /DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY/);
  assert.match(
    webNextConfig,
    /DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY'[\s\S]*isDockerStandaloneBuild \? 4 : undefined/
  );
  assert.match(webNextConfig, /DOCKER_WEB_NEXT_BUILD_CPUS/);
  assert.match(
    webNextConfig,
    /DOCKER_WEB_NEXT_BUILD_CPUS'[\s\S]*isDockerStandaloneBuild \? 4 : undefined/
  );
  assert.match(webNextConfig, /staticPageGenerationTimeout/);
  assert.match(webNextConfig, /staticGenerationMaxConcurrency/);
});
