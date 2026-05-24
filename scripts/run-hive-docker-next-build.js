#!/usr/bin/env node

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const {
  getDockerNextBuildCpus,
  getDockerStaticGenerationMaxConcurrency,
  mergeNodeOptions,
} = require('./run-web-docker-next-build.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const HIVE_DIR = path.join(ROOT_DIR, 'apps', 'hive');
const NEXT_BIN = path.join(
  HIVE_DIR,
  'node_modules',
  'next',
  'dist',
  'bin',
  'next'
);

function unquoteEnvValue(value) {
  if (value.length < 2) return value;

  const first = value[0];
  const last = value[value.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFileContent(content) {
  const entries = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) continue;

    const normalizedLine = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex <= 0) continue;

    const key = normalizedLine.slice(0, separatorIndex).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;

    entries[key] = unquoteEnvValue(
      normalizedLine.slice(separatorIndex + 1).trim()
    );
  }

  return entries;
}

function parseArgs(argv) {
  const args = {
    envFile: null,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--env-file') {
      args.envFile = argv[index + 1] ?? null;
      index++;
      continue;
    }

    if (arg?.startsWith('--env-file=')) {
      args.envFile = arg.slice('--env-file='.length);
    }
  }

  return args;
}

function loadEnvFile(filePath, fsImpl = fs) {
  if (!filePath) return {};

  return parseEnvFileContent(fsImpl.readFileSync(filePath, 'utf8'));
}

function getHiveDockerNextBuildArgs() {
  return [NEXT_BIN, 'build', '--turbopack'];
}

function getHiveDockerNextBuildEnv(baseEnv, envFileValues = {}) {
  const env = {
    ...baseEnv,
    ...envFileValues,
  };

  return {
    ...env,
    DOCKER_WEB_NEXT_BUILD_CPUS: String(getDockerNextBuildCpus(env)),
    DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY: String(
      getDockerStaticGenerationMaxConcurrency(env)
    ),
    NODE_OPTIONS: mergeNodeOptions(env.NODE_OPTIONS, env),
  };
}

function main() {
  const { envFile } = parseArgs(process.argv.slice(2));
  const envFileValues = loadEnvFile(envFile);
  const env = getHiveDockerNextBuildEnv(process.env, envFileValues);
  const nodeBinary = env.DOCKER_WEB_NODE_BINARY || 'node';
  const result = spawnSync(nodeBinary, getHiveDockerNextBuildArgs(), {
    cwd: HIVE_DIR,
    env,
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
  getHiveDockerNextBuildArgs,
  getHiveDockerNextBuildEnv,
  loadEnvFile,
  parseArgs,
  parseEnvFileContent,
};
