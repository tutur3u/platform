const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  getComposeCommandArgs,
  hasComposeServiceContainer,
  runChecked,
  runCommand,
  waitForComposeServiceHealthy,
} = require('./compose.js');
const { isTransientDockerRegistryError } = require('./registry-errors.js');
const {
  getAutoBuildMemoryBudget,
  isBuildkitResourceProfileFallbackError,
} = require('./resource-profiles.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BUILDKIT_RUNTIME_DIR = path.join(
  ROOT_DIR,
  'tmp',
  'docker-web',
  'buildkit'
);
const BUILDKIT_CONFIG_FILE = path.join(BUILDKIT_RUNTIME_DIR, 'buildkitd.toml');
const BUILDKIT_STATE_FILE = path.join(
  BUILDKIT_RUNTIME_DIR,
  'builder-config.json'
);
const DEFAULT_BUILDER_NAME = 'tuturuuu';
const DEFAULT_BUILDKIT_HOST_PORT = 7914;
const BUILDKIT_SERVICE_NAME = 'buildkit';
const LEGACY_BUILDER_NAMES = ['platform-web-capped-builder'];
const BUILD_STALL_RECOVERY_REASON = 'build-stall-timeout';
const CACHED_BUILD_ERROR_RECOVERY_REASON = 'cached-build-error';
const DISABLED_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);
const AUTO_BUILD_RESOURCE = 'auto';
const BYTES_PER_GIB = 1024 * 1024 * 1024;
const DEFAULT_AUTO_BUILD_MEMORY = '12g';
const LOW_DOCKER_MEMORY_THRESHOLD_BYTES = 10 * BYTES_PER_GIB;
const LARGE_DOCKER_MEMORY_THRESHOLD_BYTES = 16 * BYTES_PER_GIB;
const DEFAULT_BUILDKIT_COMPOSE_UP_MAX_ATTEMPTS = 4;
const DEFAULT_BUILDKIT_COMPOSE_UP_INITIAL_DELAY_MS = 5_000;
const DEFAULT_BUILDKIT_COMPOSE_UP_MAX_DELAY_MS = 60_000;
const BUILDKIT_PRUNE_MODES = new Set(['all', 'bounded', 'off']);
const DEFAULT_BUILDKIT_PRUNE_MODE = 'bounded';
const DEFAULT_BUILDKIT_PRUNE_UNTIL = '168h';
const DEFAULT_BUILDKIT_PRUNE_KEEP_STORAGE = '50gb';

function parsePositiveNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveInteger(value) {
  const parsed = parsePositiveNumber(value);

  if (!parsed || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function getPositiveIntegerEnv(env, name, fallback) {
  const parsed = parsePositiveInteger(env?.[name]);

  return parsed ?? fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseMemoryToBytes(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([kmgt]i?b?|b)?$/u);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2] ?? 'b';
  const multiplier =
    unit === 't' || unit === 'tb' || unit === 'tib'
      ? 1024 * BYTES_PER_GIB
      : unit === 'g' || unit === 'gb' || unit === 'gib'
        ? BYTES_PER_GIB
        : unit === 'm' || unit === 'mb' || unit === 'mib'
          ? 1024 * 1024
          : unit === 'k' || unit === 'kb' || unit === 'kib'
            ? 1024
            : 1;

  return Math.floor(amount * multiplier);
}

function getDockerMemoryLimitBytes(env = process.env) {
  return parseMemoryToBytes(env.DOCKER_WEB_DOCKER_MEMORY_LIMIT);
}

function getAutoBuildMemory(env = process.env) {
  return getAutoBuildMemoryBudget(env) ?? DEFAULT_AUTO_BUILD_MEMORY;
}

function getAutoBuildCpus(env = process.env) {
  const dockerMemoryLimitBytes = getDockerMemoryLimitBytes(env);

  if (
    dockerMemoryLimitBytes &&
    dockerMemoryLimitBytes < LOW_DOCKER_MEMORY_THRESHOLD_BYTES
  ) {
    return 1;
  }

  if (
    dockerMemoryLimitBytes &&
    dockerMemoryLimitBytes < LARGE_DOCKER_MEMORY_THRESHOLD_BYTES
  ) {
    return 2;
  }

  return 4;
}

function getAutoBuildMaxParallelism(env = process.env) {
  const dockerMemoryLimitBytes = getDockerMemoryLimitBytes(env);

  if (
    dockerMemoryLimitBytes &&
    dockerMemoryLimitBytes < LARGE_DOCKER_MEMORY_THRESHOLD_BYTES
  ) {
    return 1;
  }

  return 2;
}

function normalizeAutoString(value) {
  return (
    typeof value === 'string' &&
    value.trim().toLowerCase() === AUTO_BUILD_RESOURCE
  );
}

function normalizeBuildMemory(value, env = process.env) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizeAutoString(normalizedValue)
    ? getAutoBuildMemory(env)
    : normalizedValue;
}

function normalizeBuildCpus(value, env = process.env) {
  if (value == null) {
    return null;
  }

  return normalizeAutoString(value)
    ? getAutoBuildCpus(env)
    : parsePositiveNumber(value);
}

function normalizeBuildMaxParallelism(value, env = process.env) {
  if (value == null) {
    return null;
  }

  return normalizeAutoString(value)
    ? getAutoBuildMaxParallelism(env)
    : parsePositiveInteger(value);
}

function renderBuildkitConfig(maxParallelism) {
  if (!maxParallelism) {
    return '';
  }

  return ['[worker.oci]', `  max-parallelism = ${maxParallelism}`, ''].join(
    '\n'
  );
}

function getBuildkitPaths(rootDir = ROOT_DIR) {
  const runtimeDir = path.join(rootDir, 'tmp', 'docker-web', 'buildkit');

  return {
    buildkitConfigFile: path.join(runtimeDir, 'buildkitd.toml'),
    runtimeDir,
    stateFile: path.join(runtimeDir, 'builder-config.json'),
  };
}

function normalizeBuilderConfig(rawConfig, env = process.env) {
  const builderName =
    rawConfig?.builderName ||
    env.DOCKER_WEB_BUILD_BUILDER_NAME ||
    DEFAULT_BUILDER_NAME;
  const rawCpus = rawConfig?.cpus ?? env.DOCKER_WEB_BUILD_CPUS;
  const rawMaxParallelism =
    rawConfig?.maxParallelism ?? env.DOCKER_WEB_BUILD_MAX_PARALLELISM;
  const rawMemory = rawConfig?.memory ?? env.DOCKER_WEB_BUILD_MEMORY;
  const cpus = normalizeBuildCpus(rawCpus, env);
  const maxParallelism = normalizeBuildMaxParallelism(rawMaxParallelism, env);
  const memory = normalizeBuildMemory(rawMemory, env);
  const endpoint =
    rawConfig?.endpoint ||
    env.DOCKER_WEB_BUILDKIT_ENDPOINT ||
    `tcp://127.0.0.1:${env.DOCKER_WEB_BUILDKIT_PORT || DEFAULT_BUILDKIT_HOST_PORT}`;

  if (rawConfig?.cpus !== undefined && rawConfig?.cpus !== null && !cpus) {
    throw new Error('Build CPUs must be a positive number.');
  }

  if (
    rawConfig?.maxParallelism !== undefined &&
    rawConfig?.maxParallelism !== null &&
    !maxParallelism
  ) {
    throw new Error('Build max parallelism must be a positive integer.');
  }

  if (!memory && !cpus && !maxParallelism) {
    return null;
  }

  if (!builderName.trim()) {
    throw new Error('DOCKER_WEB_BUILD_BUILDER_NAME must not be empty.');
  }

  return {
    builderName: builderName.trim(),
    cpus,
    endpoint,
    maxParallelism,
    memory,
  };
}

function getBuilderConfigFingerprint(config) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        builderName: config.builderName,
        cpus: config.cpus,
        driver: 'remote',
        endpoint: config.endpoint,
        maxParallelism: config.maxParallelism,
        memory: config.memory,
      })
    )
    .digest('hex');
}

function readBuilderState(paths = getBuildkitPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.stateFile)) {
    return null;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(paths.stateFile, 'utf8'));
  } catch {
    return null;
  }
}

function writeBuilderState(state, paths = getBuildkitPaths(), fsImpl = fs) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(paths.stateFile, JSON.stringify(state, null, 2), 'utf8');
}

async function inspectBuildxBuilder(
  builderName,
  { env, runCommand: run = runCommand }
) {
  const result = await run('docker', ['buildx', 'inspect', builderName], {
    env,
    stdio: 'pipe',
  });

  if (result.code !== 0) {
    return {
      driver: null,
      exists: false,
    };
  }

  const driverMatch = result.stdout.match(/^Driver:\s*(.+)$/imu);
  const statusMatch = result.stdout.match(/^Status:\s*(.+)$/imu);

  return {
    driver: driverMatch?.[1]?.trim() ?? null,
    exists: true,
    status: statusMatch?.[1]?.trim() ?? null,
  };
}

function isBuildxBuilderUsable(builder) {
  if (!builder.exists || builder.driver !== 'remote') {
    return false;
  }

  if (!builder.status) {
    return true;
  }

  return /^running$/iu.test(builder.status);
}

async function removeLegacyBuildkitContainer(
  builderName,
  { env, runCommand: run = runCommand }
) {
  const legacyContainerName = `buildx_buildkit_${builderName}0`;
  const result = await run(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      `name=^/${legacyContainerName}$`,
      '--format',
      '{{.Names}}',
    ],
    {
      env,
      stdio: 'pipe',
    }
  );

  if (
    result.code !== 0 ||
    !result.stdout
      .split('\n')
      .map((line) => line.trim())
      .includes(legacyContainerName)
  ) {
    return;
  }

  await run('docker', ['rm', '-f', legacyContainerName], {
    env,
    stdio: 'pipe',
  });
}

async function removeLegacyBuildxBuilders(
  builderName,
  { env, fsImpl = fs, runCommand: run = runCommand }
) {
  for (const legacyBuilderName of LEGACY_BUILDER_NAMES) {
    if (legacyBuilderName === builderName) {
      continue;
    }

    const legacyBuilder = await inspectBuildxBuilder(legacyBuilderName, {
      env,
      runCommand: run,
    });

    if (!legacyBuilder.exists) {
      continue;
    }

    await runChecked('docker', ['buildx', 'rm', legacyBuilderName], {
      env,
      fsImpl,
      runCommand: run,
    });

    await removeLegacyBuildkitContainer(legacyBuilderName, {
      env,
      runCommand: run,
    });
  }
}

function getBuildkitComposeEnv(config, env) {
  const baseEnv = getResolvedBuildkitComposeEnv(env);

  return {
    ...baseEnv,
    DOCKER_WEB_BUILD_CPUS:
      config.cpus == null ? baseEnv.DOCKER_WEB_BUILD_CPUS : String(config.cpus),
    DOCKER_WEB_BUILD_MAX_PARALLELISM:
      config.maxParallelism == null
        ? baseEnv.DOCKER_WEB_BUILD_MAX_PARALLELISM
        : String(config.maxParallelism),
    DOCKER_WEB_BUILD_MEMORY: config.memory ?? baseEnv.DOCKER_WEB_BUILD_MEMORY,
    DOCKER_WEB_BUILDKIT_PORT:
      env.DOCKER_WEB_BUILDKIT_PORT ?? String(DEFAULT_BUILDKIT_HOST_PORT),
  };
}

function getResolvedBuildkitComposeEnv(env = process.env) {
  const memory = normalizeBuildMemory(env.DOCKER_WEB_BUILD_MEMORY, env);
  const cpus = normalizeBuildCpus(env.DOCKER_WEB_BUILD_CPUS, env);
  const maxParallelism = normalizeBuildMaxParallelism(
    env.DOCKER_WEB_BUILD_MAX_PARALLELISM,
    env
  );

  return {
    ...env,
    DOCKER_WEB_BUILD_CPUS:
      cpus == null ? env.DOCKER_WEB_BUILD_CPUS : String(cpus),
    DOCKER_WEB_BUILD_MAX_PARALLELISM:
      maxParallelism == null
        ? env.DOCKER_WEB_BUILD_MAX_PARALLELISM
        : String(maxParallelism),
    DOCKER_WEB_BUILD_MEMORY: memory ?? env.DOCKER_WEB_BUILD_MEMORY,
    DOCKER_WEB_BUILDKIT_PORT:
      env.DOCKER_WEB_BUILDKIT_PORT ?? String(DEFAULT_BUILDKIT_HOST_PORT),
  };
}

function isTransientBuildkitComposeUpError(error) {
  return isTransientDockerRegistryError(error);
}

async function runBuildkitComposeUpWithBackoff({
  args,
  env,
  fsImpl,
  runCommand: run,
  sleep: sleepImpl = sleep,
}) {
  const maxAttempts = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_BUILDKIT_UP_MAX_ATTEMPTS',
    DEFAULT_BUILDKIT_COMPOSE_UP_MAX_ATTEMPTS
  );
  const maxDelayMs = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_BUILDKIT_UP_MAX_DELAY_MS',
    DEFAULT_BUILDKIT_COMPOSE_UP_MAX_DELAY_MS
  );
  let delayMs = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_BUILDKIT_UP_INITIAL_DELAY_MS',
    DEFAULT_BUILDKIT_COMPOSE_UP_INITIAL_DELAY_MS
  );
  let attempt = 1;

  while (attempt <= maxAttempts) {
    try {
      return await runChecked('docker', args, {
        env,
        fsImpl,
        runCommand: run,
        stdio: 'pipe',
        teeOutput: true,
      });
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientBuildkitComposeUpError(error)) {
        throw error;
      }

      process.stderr.write(
        `BuildKit compose startup hit a transient Docker registry error; retrying in ${delayMs}ms (attempt ${
          attempt + 1
        }/${maxAttempts}).\n`
      );
      await sleepImpl(delayMs);
      attempt += 1;
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }

  throw new Error('Unable to start BuildKit compose service.');
}

async function ensureBuildkitComposeService({
  composeFile,
  composeGlobalArgs = [],
  config,
  env,
  fsImpl,
  runCommand: run,
  sleep: sleepImpl,
}) {
  if (!composeFile) {
    return env;
  }

  const composeEnv = getBuildkitComposeEnv(config, env);

  await runBuildkitComposeUpWithBackoff({
    args: getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'up',
      '--detach',
      '--no-build',
      BUILDKIT_SERVICE_NAME
    ),
    env: composeEnv,
    fsImpl,
    runCommand: run,
    sleep: sleepImpl,
  });
  await waitForComposeServiceHealthy(BUILDKIT_SERVICE_NAME, {
    composeFile,
    composeGlobalArgs,
    env: composeEnv,
    runCommand: run,
  });

  return composeEnv;
}

async function ensureBuildkitBuilder(
  rawConfig,
  {
    env = process.env,
    composeFile = null,
    composeGlobalArgs = [],
    fsImpl = fs,
    paths = null,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
    sleep: sleepImpl,
  } = {}
) {
  paths ??= getBuildkitPaths(rootDir);
  const config = normalizeBuilderConfig(rawConfig, env);

  if (!config) {
    return env;
  }

  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.buildkitConfigFile,
    renderBuildkitConfig(config.maxParallelism),
    'utf8'
  );
  env = await ensureBuildkitComposeService({
    composeFile,
    composeGlobalArgs,
    config,
    env,
    fsImpl,
    runCommand: run,
    sleep: sleepImpl,
  });
  const fingerprint = getBuilderConfigFingerprint(config);
  const state = readBuilderState(paths, fsImpl);
  await removeLegacyBuildxBuilders(config.builderName, {
    env,
    fsImpl,
    runCommand: run,
  });
  const builder = await inspectBuildxBuilder(config.builderName, {
    env,
    runCommand: run,
  });

  if (!isBuildxBuilderUsable(builder) || state?.fingerprint !== fingerprint) {
    if (builder.exists) {
      await runChecked('docker', ['buildx', 'rm', config.builderName], {
        env,
        fsImpl,
        runCommand: run,
      });
    }

    await removeLegacyBuildkitContainer(config.builderName, {
      env,
      runCommand: run,
    });

    const args = [
      'buildx',
      'create',
      '--name',
      config.builderName,
      '--driver',
      'remote',
      config.endpoint,
    ];

    await runChecked('docker', args, {
      env,
      fsImpl,
      runCommand: run,
    });

    writeBuilderState(
      {
        builderName: config.builderName,
        fingerprint,
      },
      paths,
      fsImpl
    );
  }

  const nextEnv = {
    ...env,
    BUILDX_BUILDER: config.builderName,
  };

  if (nextEnv.COMPOSE_PARALLEL_LIMIT == null && config.maxParallelism) {
    nextEnv.COMPOSE_PARALLEL_LIMIT = String(config.maxParallelism);
  }

  return nextEnv;
}

function isBunTarballExtractionError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /Fail extracting tarball for "@biomejs\/cli-linux-x64"/iu.test(message) ||
    /Fail extracting tarball for "[^"]+"/iu.test(message) ||
    /failed?\s+to\s+extract(?:ing)?\s+tarball/iu.test(message) ||
    (/Failed to install \d+ packages?/iu.test(message) &&
      /(?:bun install|https:\/\/registry\.npmjs\.org\/.+\.tgz)/iu.test(message))
  );
}

function isBuildStallTimeoutError(error) {
  return error?.name === 'CommandTimeoutError';
}

function isCachedBuildError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return /\bCACHED\s+ERROR\b/iu.test(message);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isRecoverableBuildkitCleanupError(error) {
  return isBuildkitResourceProfileFallbackError(error);
}

async function pruneBuildkitExecCacheMounts({
  builderName,
  env = process.env,
  fsImpl = fs,
  runCommand: run = runCommand,
} = {}) {
  await runChecked(
    'docker',
    [
      'buildx',
      'prune',
      '--builder',
      builderName,
      '--force',
      '--filter',
      'type=exec.cachemount',
    ],
    {
      env,
      fsImpl,
      runCommand: run,
    }
  );
}

async function recreateBuildkitComposeService({
  composeFile,
  composeGlobalArgs = [],
  env = process.env,
  fsImpl = fs,
  runCommand: run = runCommand,
} = {}) {
  if (!composeFile) {
    return {
      recreated: false,
      skipped: true,
    };
  }

  const composeEnv = getResolvedBuildkitComposeEnv(env);

  try {
    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'stop',
        '--timeout',
        '1',
        BUILDKIT_SERVICE_NAME
      ),
      {
        env: composeEnv,
        fsImpl,
        runCommand: run,
      }
    );
  } catch (error) {
    if (!isRecoverableBuildkitCleanupError(error)) {
      throw error;
    }

    process.stderr.write(
      `BuildKit stop failed during recovery; continuing with recreate: ${getErrorMessage(error)}\n`
    );
  }

  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'rm',
      '-f',
      BUILDKIT_SERVICE_NAME
    ),
    {
      env: composeEnv,
      fsImpl,
      runCommand: run,
    }
  );

  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'up',
      '--detach',
      '--no-build',
      BUILDKIT_SERVICE_NAME
    ),
    {
      env: composeEnv,
      fsImpl,
      runCommand: run,
    }
  );
  await waitForComposeServiceHealthy(BUILDKIT_SERVICE_NAME, {
    composeFile,
    composeGlobalArgs,
    env: composeEnv,
    runCommand: run,
  });

  return {
    recreated: true,
    skipped: false,
  };
}

async function recoverBuildkitBunInstallCache({
  composeFile,
  composeGlobalArgs = [],
  env = process.env,
  fsImpl = fs,
  reason = 'bun-tarball-extraction',
  runCommand: run = runCommand,
} = {}) {
  const builderName =
    env.BUILDX_BUILDER ||
    env.DOCKER_WEB_BUILD_BUILDER_NAME ||
    DEFAULT_BUILDER_NAME;
  let execCachePruned = false;

  try {
    await pruneBuildkitExecCacheMounts({
      builderName,
      env,
      fsImpl,
      runCommand: run,
    });
    execCachePruned = true;
  } catch (error) {
    if (!composeFile || !isRecoverableBuildkitCleanupError(error)) {
      throw error;
    }

    process.stderr.write(
      `BuildKit exec-cache prune failed during recovery; recreating BuildKit anyway: ${getErrorMessage(error)}\n`
    );
  }

  const service = await recreateBuildkitComposeService({
    composeFile,
    composeGlobalArgs,
    env,
    fsImpl,
    runCommand: run,
  });

  return {
    builderName,
    execCachePruned,
    reason,
    service,
  };
}

async function forceRecoverBuildkitAfterFailure({
  composeFile,
  composeGlobalArgs = [],
  env = process.env,
  fsImpl = fs,
  reason = 'buildkit-failure',
  runCommand: run = runCommand,
} = {}) {
  const builderName =
    env.BUILDX_BUILDER ||
    env.DOCKER_WEB_BUILD_BUILDER_NAME ||
    DEFAULT_BUILDER_NAME;

  return recoverBuildkitBunInstallCache({
    composeFile,
    composeGlobalArgs,
    env: {
      ...env,
      BUILDX_BUILDER: builderName,
    },
    fsImpl,
    reason,
    runCommand: run,
  });
}

async function removeBuildkitComposeServiceAfterBuild({
  composeFile,
  composeGlobalArgs = [],
  env = process.env,
  fsImpl = fs,
  runCommand: run = runCommand,
} = {}) {
  const composeEnv = getResolvedBuildkitComposeEnv(env);
  const hasRunningContainer = await hasComposeServiceContainer(
    BUILDKIT_SERVICE_NAME,
    {
      composeFile,
      composeGlobalArgs,
      env: composeEnv,
      runCommand: run,
    }
  );
  const hasContainer = await hasComposeServiceContainer(BUILDKIT_SERVICE_NAME, {
    composeFile,
    composeGlobalArgs,
    env: composeEnv,
    includeStopped: true,
    runCommand: run,
  });

  if (!hasContainer) {
    return {
      removed: false,
      skipped: false,
      stopped: false,
    };
  }

  if (hasRunningContainer) {
    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'stop',
        '--timeout',
        '1',
        BUILDKIT_SERVICE_NAME
      ),
      {
        env: composeEnv,
        fsImpl,
        runCommand: run,
      }
    );
  }

  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'rm',
      '-f',
      BUILDKIT_SERVICE_NAME
    ),
    {
      env: composeEnv,
      fsImpl,
      runCommand: run,
    }
  );

  return {
    removed: true,
    skipped: false,
    stopped: hasRunningContainer,
  };
}

function shouldPruneBuildkitAfterBuild(env = process.env) {
  const rawValue = env.DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD;

  if (rawValue == null || String(rawValue).trim() === '') {
    return true;
  }

  return !DISABLED_ENV_VALUES.has(String(rawValue).trim().toLowerCase());
}

function getBuildkitPruneMode(env = process.env) {
  if (!shouldPruneBuildkitAfterBuild(env)) {
    return 'off';
  }

  const rawMode = String(env.DOCKER_WEB_BUILDKIT_PRUNE_MODE ?? '').trim();

  if (!rawMode) {
    return DEFAULT_BUILDKIT_PRUNE_MODE;
  }

  const mode = rawMode.toLowerCase();

  if (!BUILDKIT_PRUNE_MODES.has(mode)) {
    throw new Error(
      `DOCKER_WEB_BUILDKIT_PRUNE_MODE must be one of: ${[
        ...BUILDKIT_PRUNE_MODES,
      ].join(', ')}.`
    );
  }

  return mode;
}

function getBuildkitPruneUntil(env = process.env) {
  const value = String(env.DOCKER_WEB_BUILDKIT_PRUNE_UNTIL ?? '').trim();
  return value || DEFAULT_BUILDKIT_PRUNE_UNTIL;
}

function getBuildkitPruneKeepStorage(env = process.env) {
  const value = String(env.DOCKER_WEB_BUILDKIT_PRUNE_KEEP_STORAGE ?? '').trim();
  return value || DEFAULT_BUILDKIT_PRUNE_KEEP_STORAGE;
}

function shouldStopBuildkitAfterBuild(env = process.env) {
  const rawValue = env.DOCKER_WEB_BUILDKIT_STOP_AFTER_BUILD;

  if (rawValue == null || String(rawValue).trim() === '') {
    return true;
  }

  return !DISABLED_ENV_VALUES.has(String(rawValue).trim().toLowerCase());
}

async function pruneBuildkitCacheAfterBuild({
  env = process.env,
  fsImpl = fs,
  runCommand: run = runCommand,
} = {}) {
  const pruneMode = getBuildkitPruneMode(env);

  if (pruneMode === 'off') {
    return {
      builderName: null,
      mode: pruneMode,
      pruned: false,
      skipped: true,
    };
  }

  const builderName =
    env.BUILDX_BUILDER ||
    env.DOCKER_WEB_BUILD_BUILDER_NAME ||
    DEFAULT_BUILDER_NAME;
  const pruneArgs =
    pruneMode === 'all'
      ? ['buildx', 'prune', '--builder', builderName, '--all', '--force']
      : [
          'buildx',
          'prune',
          '--builder',
          builderName,
          '--force',
          '--filter',
          `until=${getBuildkitPruneUntil(env)}`,
          '--keep-storage',
          getBuildkitPruneKeepStorage(env),
        ];

  await runChecked('docker', pruneArgs, {
    env,
    fsImpl,
    runCommand: run,
  });

  return {
    builderName,
    keepStorage:
      pruneMode === 'bounded' ? getBuildkitPruneKeepStorage(env) : null,
    mode: pruneMode,
    pruned: true,
    skipped: false,
    until: pruneMode === 'bounded' ? getBuildkitPruneUntil(env) : null,
  };
}

async function stopBuildkitComposeServiceAfterBuild({
  composeFile,
  composeGlobalArgs = [],
  env = process.env,
  fsImpl = fs,
  runCommand: run = runCommand,
} = {}) {
  if (!composeFile || !shouldStopBuildkitAfterBuild(env)) {
    return {
      removed: false,
      skipped: true,
      stopped: false,
    };
  }

  return removeBuildkitComposeServiceAfterBuild({
    composeFile,
    composeGlobalArgs,
    env,
    fsImpl,
    runCommand: run,
  });
}

async function cleanupBuildkitAfterBuild({
  composeFile,
  composeGlobalArgs = [],
  env = process.env,
  fsImpl = fs,
  runCommand: run = runCommand,
} = {}) {
  if (!env?.BUILDX_BUILDER && !env?.DOCKER_WEB_BUILD_BUILDER_NAME) {
    return {
      prune: {
        builderName: null,
        mode: 'off',
        pruned: false,
        skipped: true,
      },
      skipped: true,
      stop: {
        removed: false,
        skipped: true,
        stopped: false,
      },
    };
  }

  let serviceRunning = true;

  if (composeFile) {
    serviceRunning = await hasComposeServiceContainer(BUILDKIT_SERVICE_NAME, {
      composeFile,
      composeGlobalArgs,
      env,
      runCommand: run,
    });
  }

  const errors = [];
  let pruneResult = {
    builderName: null,
    mode: 'off',
    pruned: false,
    skipped: true,
  };

  if (serviceRunning) {
    try {
      pruneResult = await pruneBuildkitCacheAfterBuild({
        env,
        fsImpl,
        runCommand: run,
      });
    } catch (error) {
      errors.push(error);
    }
  }

  let stopResult = {
    removed: false,
    skipped: true,
    stopped: false,
  };

  try {
    stopResult = await stopBuildkitComposeServiceAfterBuild({
      composeFile,
      composeGlobalArgs,
      env,
      fsImpl,
      runCommand: run,
    });
  } catch (error) {
    errors.push(error);
  }

  if (errors.length > 0) {
    throw errors[0];
  }

  return {
    prune: pruneResult,
    skipped: false,
    stop: stopResult,
  };
}

module.exports = {
  BUILDKIT_CONFIG_FILE,
  BUILDKIT_RUNTIME_DIR,
  BUILDKIT_STATE_FILE,
  BUILDKIT_SERVICE_NAME,
  CACHED_BUILD_ERROR_RECOVERY_REASON,
  DEFAULT_BUILDKIT_HOST_PORT,
  DEFAULT_BUILDKIT_PRUNE_KEEP_STORAGE,
  DEFAULT_BUILDKIT_PRUNE_MODE,
  DEFAULT_BUILDKIT_PRUNE_UNTIL,
  DEFAULT_BUILDER_NAME,
  LEGACY_BUILDER_NAMES,
  cleanupBuildkitAfterBuild,
  ensureBuildkitComposeService,
  ensureBuildkitBuilder,
  forceRecoverBuildkitAfterFailure,
  getBuildkitPaths,
  getBuildkitPruneKeepStorage,
  getBuildkitPruneMode,
  getBuildkitPruneUntil,
  getAutoBuildCpus,
  getAutoBuildMaxParallelism,
  getAutoBuildMemory,
  getBuilderConfigFingerprint,
  getDockerMemoryLimitBytes,
  getResolvedBuildkitComposeEnv,
  isBuildxBuilderUsable,
  isRecoverableBuildkitCleanupError,
  isTransientDockerRegistryError,
  isTransientBuildkitComposeUpError,
  isBuildStallTimeoutError,
  isBunTarballExtractionError,
  isCachedBuildError,
  BUILD_STALL_RECOVERY_REASON,
  normalizeBuilderConfig,
  parseMemoryToBytes,
  parsePositiveInteger,
  parsePositiveNumber,
  pruneBuildkitCacheAfterBuild,
  pruneBuildkitExecCacheMounts,
  recoverBuildkitBunInstallCache,
  recreateBuildkitComposeService,
  renderBuildkitConfig,
  readBuilderState,
  removeBuildkitComposeServiceAfterBuild,
  shouldPruneBuildkitAfterBuild,
  shouldStopBuildkitAfterBuild,
  stopBuildkitComposeServiceAfterBuild,
  writeBuilderState,
};
