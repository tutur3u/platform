const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  getComposeCommandArgs,
  runChecked,
  runCommand,
  waitForComposeServiceHealthy,
} = require('./compose.js');

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
  const cpus = parsePositiveNumber(
    rawConfig?.cpus ?? env.DOCKER_WEB_BUILD_CPUS
  );
  const maxParallelism = parsePositiveInteger(
    rawConfig?.maxParallelism ?? env.DOCKER_WEB_BUILD_MAX_PARALLELISM
  );
  const memory =
    typeof (rawConfig?.memory ?? env.DOCKER_WEB_BUILD_MEMORY) === 'string'
      ? (rawConfig?.memory ?? env.DOCKER_WEB_BUILD_MEMORY).trim() || null
      : null;
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

  return {
    driver: driverMatch?.[1]?.trim() ?? null,
    exists: true,
  };
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
  return {
    ...env,
    DOCKER_WEB_BUILD_CPUS:
      config.cpus == null ? env.DOCKER_WEB_BUILD_CPUS : String(config.cpus),
    DOCKER_WEB_BUILD_MAX_PARALLELISM:
      config.maxParallelism == null
        ? env.DOCKER_WEB_BUILD_MAX_PARALLELISM
        : String(config.maxParallelism),
    DOCKER_WEB_BUILD_MEMORY: config.memory ?? env.DOCKER_WEB_BUILD_MEMORY,
    DOCKER_WEB_BUILDKIT_PORT:
      env.DOCKER_WEB_BUILDKIT_PORT ?? String(DEFAULT_BUILDKIT_HOST_PORT),
  };
}

async function ensureBuildkitComposeService({
  composeFile,
  composeGlobalArgs = [],
  config,
  env,
  fsImpl,
  runCommand: run,
}) {
  if (!composeFile) {
    return env;
  }

  const composeEnv = getBuildkitComposeEnv(config, env);

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

  if (
    !builder.exists ||
    builder.driver !== 'remote' ||
    state?.fingerprint !== fingerprint
  ) {
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

module.exports = {
  BUILDKIT_CONFIG_FILE,
  BUILDKIT_RUNTIME_DIR,
  BUILDKIT_STATE_FILE,
  BUILDKIT_SERVICE_NAME,
  DEFAULT_BUILDKIT_HOST_PORT,
  DEFAULT_BUILDER_NAME,
  LEGACY_BUILDER_NAMES,
  ensureBuildkitComposeService,
  ensureBuildkitBuilder,
  getBuildkitPaths,
  getBuilderConfigFingerprint,
  normalizeBuilderConfig,
  parsePositiveInteger,
  parsePositiveNumber,
  renderBuildkitConfig,
  readBuilderState,
  writeBuilderState,
};
