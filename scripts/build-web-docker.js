#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const {
  applyCoolifyAppUrlFallbacks,
} = require('../apps/web/docker/coolify-env.js');

const { buildAdmissionContext } = require('./ci/hosted-web-e2e-admission');

const DEFAULT_DOCKER_WEB_TURBO_CONCURRENCY = 1;

function parsePositiveInteger(value) {
  const normalized = String(value ?? '').trim();

  if (!/^[1-9]\d*$/u.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function resolveDockerWebTurboConcurrency(env = process.env) {
  return (
    parsePositiveInteger(env.DOCKER_WEB_TURBO_CONCURRENCY) ??
    parsePositiveInteger(env.DOCKER_WEB_BUILD_MAX_PARALLELISM) ??
    DEFAULT_DOCKER_WEB_TURBO_CONCURRENCY
  );
}

function getBuildWebDockerArgs(env = process.env) {
  if (Object.keys(buildAdmissionContext(env)).length) {
    return [
      'x',
      '--no-install',
      'turbo',
      'run',
      'build:docker',
      '--filter=@tuturuuu/web',
      '--concurrency=1',
    ];
  }
  return [
    'run',
    'build:web:docker',
    '--',
    `--concurrency=${resolveDockerWebTurboConcurrency(env)}`,
  ];
}

function runBuildWebDocker() {
  const env = applyCoolifyAppUrlFallbacks({ ...process.env });
  const result = spawnSync('bun', getBuildWebDockerArgs(env), {
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
  runBuildWebDocker();
}

module.exports = {
  DEFAULT_DOCKER_WEB_TURBO_CONCURRENCY,
  getBuildWebDockerArgs,
  parsePositiveInteger,
  resolveDockerWebTurboConcurrency,
  runBuildWebDocker,
};
