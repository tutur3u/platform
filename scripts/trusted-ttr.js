#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { homedir } = require('node:os');
const path = require('node:path');

// Package managers prepend workspace binaries to PATH. Operational commands
// must use the independently installed CLI, even when the workspace dist is old.
function trustedTtr(home = homedir()) {
  return path.join(home, '.bun', 'bin', 'ttr');
}

function run(args) {
  const result = spawnSync(trustedTtr(), args, {
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { trustedTtr };
