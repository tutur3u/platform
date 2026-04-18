const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_BUILDER_NAME,
  ensureBuildkitBuilder,
  getBuildkitPaths,
  getBuilderConfigFingerprint,
  getBuilderDriverOptions,
  normalizeBuilderConfig,
  parsePositiveInteger,
  parsePositiveNumber,
  readBuilderState,
  renderBuildkitConfig,
} = require('./docker-web/buildkit-builder.js');

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
      maxParallelism: 2,
      memory: '16g',
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

test('getBuilderDriverOptions converts memory and CPUs into driver options', () => {
  assert.deepEqual(
    getBuilderDriverOptions({
      builderName: DEFAULT_BUILDER_NAME,
      cpus: 8,
      maxParallelism: 2,
      memory: '16g',
    }),
    ['default-load=true', 'memory=16g', 'cpu-period=100000', 'cpu-quota=800000']
  );
});

test('renderBuildkitConfig writes max parallelism in BuildKit TOML format', () => {
  assert.equal(
    renderBuildkitConfig(2),
    ['[worker.oci]', '  max-parallelism = 2', ''].join('\n')
  );
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
    assert.match(
      fs.readFileSync(paths.buildkitConfigFile, 'utf8'),
      /max-parallelism = 2/
    );
    assert.deepEqual(readBuilderState(paths), {
      builderName: DEFAULT_BUILDER_NAME,
      fingerprint: getBuilderConfigFingerprint({
        builderName: DEFAULT_BUILDER_NAME,
        cpus: 8,
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
          call.args.includes('memory=16g') &&
          call.args.includes('cpu-period=100000') &&
          call.args.includes('cpu-quota=800000') &&
          call.args.includes('--buildkitd-config') &&
          call.args.includes(paths.buildkitConfigFile)
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
          return { code: 0, signal: null, stderr: '', stdout: 'builder ok\n' };
        }

        return { code: 0, signal: null, stderr: '', stdout: '' };
      },
    });

    assert.equal(env.BUILDX_BUILDER, DEFAULT_BUILDER_NAME);
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

test('production Docker root scripts keep the default build caps', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );

  assert.match(
    packageJson.scripts['serve:web:docker'],
    /--build-memory 16g --build-cpus 8/
  );
  assert.match(
    packageJson.scripts['serve:web:docker:bg'],
    /--build-memory 16g --build-cpus 8/
  );
});
