const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { runChecked, runCommand } = require('./compose.js');

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
const DEFAULT_BUILDER_NAME = 'platform-web-capped-builder';
const DEFAULT_CPU_PERIOD = 100_000;

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
    maxParallelism,
    memory,
  };
}

function getBuilderDriverOptions(config) {
  const options = ['default-load=true'];

  if (config.memory) {
    options.push(`memory=${config.memory}`);
  }

  if (config.cpus) {
    options.push(`cpu-period=${DEFAULT_CPU_PERIOD}`);
    options.push(
      `cpu-quota=${Math.max(1, Math.floor(config.cpus * DEFAULT_CPU_PERIOD))}`
    );
  }

  return options;
}

function getBuilderConfigFingerprint(config) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        builderName: config.builderName,
        cpus: config.cpus,
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

async function hasBuildxBuilder(
  builderName,
  { env, runCommand: run = runCommand }
) {
  const result = await run('docker', ['buildx', 'inspect', builderName], {
    env,
    stdio: 'pipe',
  });

  return result.code === 0;
}

async function ensureBuildkitBuilder(
  rawConfig,
  {
    env = process.env,
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
  const fingerprint = getBuilderConfigFingerprint(config);
  const state = readBuilderState(paths, fsImpl);
  const builderExists = await hasBuildxBuilder(config.builderName, {
    env,
    runCommand: run,
  });

  if (!builderExists || state?.fingerprint !== fingerprint) {
    if (config.maxParallelism) {
      fsImpl.writeFileSync(
        paths.buildkitConfigFile,
        renderBuildkitConfig(config.maxParallelism),
        'utf8'
      );
    }

    if (builderExists) {
      await runChecked(
        'docker',
        ['buildx', 'rm', '--keep-state', config.builderName],
        {
          env,
          fsImpl,
          runCommand: run,
        }
      );
    }

    const args = [
      'buildx',
      'create',
      '--name',
      config.builderName,
      '--driver',
      'docker-container',
      '--bootstrap',
    ];

    for (const option of getBuilderDriverOptions(config)) {
      args.push('--driver-opt', option);
    }

    if (config.maxParallelism) {
      args.push('--buildkitd-config', paths.buildkitConfigFile);
    }

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

  return {
    ...env,
    BUILDX_BUILDER: config.builderName,
  };
}

module.exports = {
  BUILDKIT_CONFIG_FILE,
  BUILDKIT_RUNTIME_DIR,
  BUILDKIT_STATE_FILE,
  DEFAULT_BUILDER_NAME,
  DEFAULT_CPU_PERIOD,
  ensureBuildkitBuilder,
  getBuildkitPaths,
  getBuilderConfigFingerprint,
  getBuilderDriverOptions,
  normalizeBuilderConfig,
  parsePositiveInteger,
  parsePositiveNumber,
  renderBuildkitConfig,
  readBuilderState,
  writeBuilderState,
};
