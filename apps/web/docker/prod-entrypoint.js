#!/usr/bin/env node

const { spawn } = require('node:child_process');
const { applyCoolifyAppUrlFallbacks } = require('./coolify-env.js');

const DEFAULT_MAX_HTTP_HEADER_SIZE = '65536';

function resolveMaxHttpHeaderSize(env = process.env) {
  const configured = env.DOCKER_WEB_NODE_MAX_HTTP_HEADER_SIZE?.trim();

  if (!configured) {
    return DEFAULT_MAX_HTTP_HEADER_SIZE;
  }

  if (!/^\d+$/u.test(configured)) {
    return DEFAULT_MAX_HTTP_HEADER_SIZE;
  }

  return configured;
}

function buildServerArgs(env = process.env) {
  return [
    `--max-http-header-size=${resolveMaxHttpHeaderSize(env)}`,
    '--require',
    './apps/web/docker/request-tracker.js',
    'apps/web/server.js',
  ];
}

function startServer() {
  const child = spawn('node', buildServerArgs(process.env), {
    env: applyCoolifyAppUrlFallbacks({ ...process.env }),
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    throw error;
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  }

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  return child;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  buildServerArgs,
  resolveMaxHttpHeaderSize,
  startServer,
};
