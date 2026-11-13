#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { commandForShard, affectedShards } = require('./test-shards.js');

const [index, total, mode] = process.argv.slice(2);
if (
  process.argv.length > 5 ||
  !/^\d+$/.test(index ?? '') ||
  !/^\d+$/.test(total ?? '') ||
  (mode && mode !== '--coverage' && mode !== '--plan')
) {
  throw new Error(
    'Usage: node scripts/ci/run-test-shard.js <zero-based-index> <total> [--coverage|--plan]'
  );
}
const root = path.resolve(__dirname, '../..');
const shards = affectedShards(
  root,
  Number(total),
  process.env.AFFECTED_SELECTION
);
if (!Number.isInteger(Number(index)) || Number(index) >= shards.length)
  throw new Error('Invalid shard index');
const applicable = shards[Number(index)].packages.length > 0;
if (mode === '--plan' && process.env.GITHUB_OUTPUT)
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `applicable=${applicable}\n`);
if (!applicable) {
  console.log('Shard not applicable; no tests executed.');
  process.exit(0);
}
const args = commandForShard(shards, Number(index), mode === '--coverage');
console.log(
  JSON.stringify({
    shard: Number(index),
    total: Number(total),
    ...shards[Number(index)],
  })
);
if (mode !== '--plan') {
  const result = spawnSync('bun', args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (
    process.exitCode === 0 &&
    mode === '--coverage' &&
    shards[Number(index)].packages.includes('@tuturuuu/meet')
  ) {
    const focused = spawnSync(
      'bun',
      [
        'x',
        '--no-install',
        'vitest',
        'run',
        '--config',
        'vitest.native-auth.config.ts',
        '--maxWorkers=1',
        '--coverage',
        '--coverage.reportsDirectory=coverage/native-auth',
      ],
      {
        cwd: path.join(root, 'apps/meet'),
        stdio: 'inherit',
        env: process.env,
      }
    );
    if (focused.error) throw focused.error;
    process.exitCode = focused.status ?? 1;
  }
}
