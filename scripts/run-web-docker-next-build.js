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
const DEFAULT_NODE_MAX_OLD_SPACE_SIZE_MB = 4096;

function getDockerNodeMaxOldSpaceSizeMb(env) {
  const rawValue = String(env.DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE ?? '').trim();

  if (!rawValue) {
    return DEFAULT_NODE_MAX_OLD_SPACE_SIZE_MB;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE must be positive.');
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

const nodeBinary = process.env.DOCKER_WEB_NODE_BINARY || 'node';
const result = spawnSync(nodeBinary, [NEXT_BIN, 'build', '--turbopack'], {
  cwd: WEB_DIR,
  env: {
    ...process.env,
    NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS, process.env),
  },
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
