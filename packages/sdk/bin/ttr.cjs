#!/usr/bin/env bun

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

if (existsSync(join(__dirname, '../src/cli/index.ts'))) {
  console.error(
    'Workspace ttr bin is disabled: its dist may be stale. Use ~/.bun/bin/ttr or bun ttr. For source development run bun packages/sdk/src/cli/index.ts from the repo root with a disposable TTR_RESOURCES_HOME.'
  );
  process.exitCode = 1;
} else {
  const entry = join(__dirname, '../dist/cli/index.js');
  // Controller locks need native APIs that Bun's libuv compatibility omits.
  if (process.versions.bun && process.argv[2] === 'balancer') {
    const child = spawnSync('node', [entry, ...process.argv.slice(2)], {
      stdio: 'inherit',
    });
    if (child.error) {
      console.error('ttr balancer requires Node.js on PATH.');
      process.exitCode = 1;
    } else if (child.signal) {
      process.kill(process.pid, child.signal);
    } else {
      process.exitCode = child.status ?? 1;
    }
  } else {
    require(entry);
  }
}
