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
const NODE_MAX_OLD_SPACE_SIZE_BUCKETS_MB = [16384, 12288, 8192, 6144, 4096];
const MIN_NODE_MAX_OLD_SPACE_SIZE_MB = 4096;
const DEFAULT_NEXT_BUILD_ENGINE = 'webpack';
const NEXT_BUILD_ENGINES = new Map([
  ['turbopack', '--turbopack'],
  ['turbo', '--turbopack'],
  ['webpack', '--webpack'],
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
  const memoryLimitsMb = [
    parseMemoryToMb(env.DOCKER_WEB_DOCKER_MEMORY_LIMIT),
    parseMemoryToMb(env.DOCKER_WEB_BUILD_MEMORY),
  ].filter(Boolean);
  const availableMemoryMb =
    memoryLimitsMb.length > 0 ? Math.min(...memoryLimitsMb) : null;
  const halfDockerMemoryMb = availableMemoryMb
    ? Math.floor(availableMemoryMb / 2)
    : null;

  if (!halfDockerMemoryMb) {
    return MIN_NODE_MAX_OLD_SPACE_SIZE_MB;
  }

  return (
    NODE_MAX_OLD_SPACE_SIZE_BUCKETS_MB.find(
      (bucket) => bucket <= halfDockerMemoryMb
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

function main() {
  const nodeBinary = process.env.DOCKER_WEB_NODE_BINARY || 'node';
  const nextBuildEngine = getDockerNextBuildEngine(process.env);
  const result = spawnSync(
    nodeBinary,
    [NEXT_BIN, 'build', NEXT_BUILD_ENGINES.get(nextBuildEngine)],
    {
      cwd: WEB_DIR,
      env: {
        ...process.env,
        NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS, process.env),
      },
      stdio: 'inherit',
    }
  );

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
  getAutoDockerNodeMaxOldSpaceSizeMb,
  getDockerNodeMaxOldSpaceSizeMb,
  mergeNodeOptions,
  parseMemoryToMb,
};
