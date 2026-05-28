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
  isBunTarballExtractionError,
  LEGACY_BUILDER_NAMES,
  normalizeBuilderConfig,
  parseMemoryToBytes,
  parsePositiveInteger,
  parsePositiveNumber,
  pruneBuildkitCacheAfterBuild,
  readBuilderState,
  renderBuildkitConfig,
  shouldPruneBuildkitAfterBuild,
  shouldStopBuildkitAfterBuild,
  stopBuildkitComposeServiceAfterBuild,
} = require('./docker-web/buildkit-builder.js');
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
    '8418m'
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
      memory: '8418m',
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
    /--build-memory 12g --build-cpus 4 --build-max-parallelism 1/
  );
  assert.match(
    packageJson.scripts['serve:web:docker:bg'],
    /--build-memory 12g --build-cpus 4 --build-max-parallelism 1/
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
