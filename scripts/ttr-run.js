#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { resourceCommand } = require('./trusted-ttr.js');

try {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [command, ...rest] = resourceCommand(args);
  const result = spawnSync(command, rest, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
