#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const result = spawnSync('bun', ['run', 'build:web'], {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
