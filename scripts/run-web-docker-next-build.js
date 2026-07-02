#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'apps', 'web');
const NEXT_BIN = path.join(
  WEB_DIR,
  'node_modules',
  'next',
  'dist',
  'bin',
  'next'
);
const AUTO_NODE_MAX_OLD_SPACE_SIZE = 'auto';
const NODE_MAX_OLD_SPACE_SIZE_BUCKETS_MB = [
  16384, 12288, 8192, 7168, 6144, 4096,
];
const MIN_NODE_MAX_OLD_SPACE_SIZE_MB = 4096;
const DOCKER_MEMORY_RESERVE_MB = 1024;
const SMALL_DOCKER_MEMORY_THRESHOLD_MB = 10 * 1024;
const LARGE_DOCKER_MEMORY_THRESHOLD_MB = 16 * 1024;
const TINY_DOCKER_STATIC_GENERATION_MAX_CONCURRENCY = 1;
const SMALL_DOCKER_STATIC_GENERATION_MAX_CONCURRENCY = 2;
const LARGE_DOCKER_STATIC_GENERATION_MAX_CONCURRENCY = 4;
const TINY_DOCKER_NEXT_BUILD_CPUS = 1;
const SMALL_DOCKER_NEXT_BUILD_CPUS = 2;
const LARGE_DOCKER_NEXT_BUILD_CPUS = 4;
const DEFAULT_NEXT_BUILD_ENGINE = 'turbopack';
const DEFAULT_NEXT_APP_ONLY = true;
const NEXT_BUILD_ENGINES = new Map([
  ['turbopack', '--turbopack'],
  ['turbo', '--turbopack'],
]);

function parseMemoryToMb(value) {
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
      ? 1024 * 1024
      : unit === 'g' || unit === 'gb' || unit === 'gib'
        ? 1024
        : unit === 'm' || unit === 'mb' || unit === 'mib'
          ? 1
          : unit === 'k' || unit === 'kb' || unit === 'kib'
            ? 1 / 1024
            : 1 / (1024 * 1024);

  return Math.floor(amount * multiplier);
}

function getAutoDockerNodeMaxOldSpaceSizeMb(env) {
  const dockerMemoryMb = parseMemoryToMb(env.DOCKER_WEB_DOCKER_MEMORY_LIMIT);
  const buildMemoryMb = parseMemoryToMb(env.DOCKER_WEB_BUILD_MEMORY);
  const availableMemoryMb =
    dockerMemoryMb && buildMemoryMb
      ? Math.min(dockerMemoryMb, buildMemoryMb)
      : (dockerMemoryMb ?? buildMemoryMb);

  if (
    availableMemoryMb &&
    availableMemoryMb < SMALL_DOCKER_MEMORY_THRESHOLD_MB
  ) {
    return MIN_NODE_MAX_OLD_SPACE_SIZE_MB;
  }

  const buildHeapBudgetMb = availableMemoryMb
    ? availableMemoryMb - DOCKER_MEMORY_RESERVE_MB
    : null;

  if (
    !buildHeapBudgetMb ||
    buildHeapBudgetMb < MIN_NODE_MAX_OLD_SPACE_SIZE_MB
  ) {
    return MIN_NODE_MAX_OLD_SPACE_SIZE_MB;
  }

  return (
    NODE_MAX_OLD_SPACE_SIZE_BUCKETS_MB.find(
      (bucket) => bucket <= buildHeapBudgetMb
    ) ?? MIN_NODE_MAX_OLD_SPACE_SIZE_MB
  );
}

function getDockerNodeMaxOldSpaceSizeMb(env) {
  const rawValue = String(env.DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE ?? '').trim();

  if (!rawValue || rawValue.toLowerCase() === AUTO_NODE_MAX_OLD_SPACE_SIZE) {
    return getAutoDockerNodeMaxOldSpaceSizeMb(env);
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE must be positive.');
  }

  if (parsed < MIN_NODE_MAX_OLD_SPACE_SIZE_MB) {
    throw new Error(
      'DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE must be at least 4096.'
    );
  }

  return parsed;
}

function parsePositiveIntegerEnv(env, name) {
  const rawValue = String(env[name] ?? '').trim();

  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function getDockerStaticGenerationMaxConcurrency(env) {
  const override = parsePositiveIntegerEnv(
    env,
    'DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY'
  );

  if (override) {
    return override;
  }

  const dockerMemoryMb = getEffectiveDockerMemoryMb(env);

  if (dockerMemoryMb && dockerMemoryMb < SMALL_DOCKER_MEMORY_THRESHOLD_MB) {
    return TINY_DOCKER_STATIC_GENERATION_MAX_CONCURRENCY;
  }

  if (dockerMemoryMb && dockerMemoryMb < LARGE_DOCKER_MEMORY_THRESHOLD_MB) {
    return SMALL_DOCKER_STATIC_GENERATION_MAX_CONCURRENCY;
  }

  return LARGE_DOCKER_STATIC_GENERATION_MAX_CONCURRENCY;
}

function getDockerNextBuildCpus(env) {
  const override = parsePositiveIntegerEnv(env, 'DOCKER_WEB_NEXT_BUILD_CPUS');

  if (override) {
    return override;
  }

  const dockerMemoryMb = getEffectiveDockerMemoryMb(env);

  if (dockerMemoryMb && dockerMemoryMb < SMALL_DOCKER_MEMORY_THRESHOLD_MB) {
    return TINY_DOCKER_NEXT_BUILD_CPUS;
  }

  if (dockerMemoryMb && dockerMemoryMb < LARGE_DOCKER_MEMORY_THRESHOLD_MB) {
    return SMALL_DOCKER_NEXT_BUILD_CPUS;
  }

  return LARGE_DOCKER_NEXT_BUILD_CPUS;
}

function isNativeWebBuildEnabled(env) {
  return String(env.DOCKER_WEB_NATIVE_BUILD ?? '').trim() === '1';
}

function getNextBuildEnvironment(baseEnv) {
  const env = {
    ...baseEnv,
    NODE_OPTIONS: mergeNodeOptions(baseEnv.NODE_OPTIONS, baseEnv),
  };

  if (isNativeWebBuildEnabled(baseEnv)) {
    const explicitCpus = parsePositiveIntegerEnv(
      baseEnv,
      'DOCKER_WEB_NEXT_BUILD_CPUS'
    );
    const explicitStaticGenerationMaxConcurrency = parsePositiveIntegerEnv(
      baseEnv,
      'DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY'
    );

    if (explicitCpus) {
      env.DOCKER_WEB_NEXT_BUILD_CPUS = String(explicitCpus);
    } else {
      delete env.DOCKER_WEB_NEXT_BUILD_CPUS;
    }

    if (explicitStaticGenerationMaxConcurrency) {
      env.DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY = String(
        explicitStaticGenerationMaxConcurrency
      );
    } else {
      delete env.DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY;
    }

    return env;
  }

  return {
    ...env,
    DOCKER_WEB_NEXT_BUILD_CPUS: String(getDockerNextBuildCpus(baseEnv)),
    DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY: String(
      getDockerStaticGenerationMaxConcurrency(baseEnv)
    ),
  };
}

function getEffectiveDockerMemoryMb(env) {
  const memoryValues = [
    parseMemoryToMb(env.DOCKER_WEB_DOCKER_MEMORY_LIMIT),
    parseMemoryToMb(env.DOCKER_WEB_BUILD_MEMORY),
  ].filter((value) => value && Number.isFinite(value) && value > 0);

  return memoryValues.length > 0 ? Math.min(...memoryValues) : null;
}

function splitNodeOptions(currentOptions) {
  return String(currentOptions ?? '')
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function removeMaxOldSpaceSizeOptions(tokens) {
  const nextTokens = [];
  let skipNext = false;

  for (const token of tokens) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (token === '--max-old-space-size') {
      skipNext = true;
      continue;
    }

    if (token.startsWith('--max-old-space-size=')) {
      continue;
    }

    nextTokens.push(token);
  }

  return nextTokens;
}

function mergeNodeOptions(currentOptions, env) {
  const tokens = new Set(
    removeMaxOldSpaceSizeOptions(splitNodeOptions(currentOptions))
  );
  const requiredOptions = [
    `--max-old-space-size=${getDockerNodeMaxOldSpaceSizeMb(env)}`,
    '--experimental-require-module',
  ];

  for (const option of requiredOptions) {
    tokens.add(option);
  }

  return [...tokens].join(' ');
}

function getDockerNextBuildEngine(env) {
  const rawValue = String(env.DOCKER_WEB_NEXT_BUILD_ENGINE ?? '').trim();

  if (!rawValue) {
    return DEFAULT_NEXT_BUILD_ENGINE;
  }

  const normalizedValue = rawValue.toLowerCase();

  if (!NEXT_BUILD_ENGINES.has(normalizedValue)) {
    throw new Error(
      `DOCKER_WEB_NEXT_BUILD_ENGINE must be one of: ${[
        ...NEXT_BUILD_ENGINES.keys(),
      ].join(', ')}.`
    );
  }

  return normalizedValue;
}

function getBooleanEnv(env, name, fallback) {
  const rawValue = String(env[name] ?? '')
    .trim()
    .toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(rawValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(rawValue)) {
    return false;
  }

  throw new Error(`${name} must be a boolean value.`);
}

function getDockerNextBuildArgs(env) {
  const nextBuildEngine = getDockerNextBuildEngine(env);
  const args = [NEXT_BIN, 'build', NEXT_BUILD_ENGINES.get(nextBuildEngine)];

  if (getBooleanEnv(env, 'DOCKER_WEB_NEXT_APP_ONLY', DEFAULT_NEXT_APP_ONLY)) {
    args.push('--experimental-app-only');
  }

  return args;
}

function main() {
  const nodeBinary = process.env.DOCKER_WEB_NODE_BINARY || 'node';
  const result = spawnSync(nodeBinary, getDockerNextBuildArgs(process.env), {
    cwd: WEB_DIR,
    env: getNextBuildEnvironment(process.env),
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  } else {
    process.exit(result.status ?? 1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getEffectiveDockerMemoryMb,
  getAutoDockerNodeMaxOldSpaceSizeMb,
  getDockerNextBuildArgs,
  getDockerNextBuildCpus,
  getDockerNodeMaxOldSpaceSizeMb,
  getDockerStaticGenerationMaxConcurrency,
  getNextBuildEnvironment,
  isNativeWebBuildEnabled,
  mergeNodeOptions,
  parseMemoryToMb,
};
