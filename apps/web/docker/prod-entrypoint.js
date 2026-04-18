#!/usr/bin/env node

const { spawn } = require('node:child_process');
const { applyCoolifyAppUrlFallbacks } = require('./coolify-env.js');

const child = spawn('node', ['apps/web/server.js'], {
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
