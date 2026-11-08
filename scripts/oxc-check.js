#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const files = process.argv.slice(2);
for (const [tool, flags] of [
  ['oxfmt', ['--check']],
  ['oxlint', ['--deny-warnings']],
]) {
  const result = spawnSync(
    path.resolve('node_modules/.bin', tool),
    [...flags, '--threads', '2', ...files],
    { stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
