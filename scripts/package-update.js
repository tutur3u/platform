#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { PAUSED_APP_DIRECTORIES } = require('./paused-runtimes.js');

function updatePlan(root = path.resolve(__dirname, '..')) {
  const manifests = [path.join(root, 'package.json')];
  for (const parent of ['apps', 'packages']) {
    for (const entry of fs.readdirSync(path.join(root, parent), {
      withFileTypes: true,
    })) {
      if (
        !entry.isDirectory() ||
        (parent === 'apps' && PAUSED_APP_DIRECTORIES.has(entry.name))
      )
        continue;
      const file = path.join(root, parent, entry.name, 'package.json');
      if (fs.existsSync(file)) manifests.push(file);
    }
  }
  const names = manifests.map(
    (file) => JSON.parse(fs.readFileSync(file, 'utf8')).name
  );
  if (
    names.some(
      (name) =>
        typeof name !== 'string' ||
        !/^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/.test(name)
    )
  )
    throw new Error('Invalid workspace name in dependency update plan');
  return ['update', ...names.sort().map((name) => `--filter=${name}`)];
}

function main() {
  const args = updatePlan();
  if (process.argv.includes('--dry-run')) args.push('--dry-run');
  const result = spawnSync('bun', args, {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
module.exports = { updatePlan };

if (require.main === module) {
  main();
}
