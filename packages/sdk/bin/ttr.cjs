#!/usr/bin/env bun

const { existsSync } = require('node:fs');
const { join } = require('node:path');

if (existsSync(join(__dirname, '../src/cli/index.ts'))) {
  console.error(
    'Workspace ttr bin is disabled: its dist may be stale. Use ~/.bun/bin/ttr or bun ttr. For source development run bun packages/sdk/src/cli/index.ts from the repo root with a disposable TTR_RESOURCES_HOME.'
  );
  process.exitCode = 1;
} else {
  require(join(__dirname, '../dist/cli/index.js'));
}
