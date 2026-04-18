#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const {
  applyCoolifyAppUrlFallbacks,
} = require('../apps/web/docker/coolify-env.js');

const env = applyCoolifyAppUrlFallbacks({ ...process.env });

const result = spawnSync('bun', ['run', 'build:web'], {
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
