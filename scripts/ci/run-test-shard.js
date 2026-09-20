#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  commandForShard,
  discoverPackages,
  planShards,
} = require('./test-shards.js');

const [index, total, mode] = process.argv.slice(2);
if (
  !/^\d+$/.test(index ?? '') ||
  !/^\d+$/.test(total ?? '') ||
  (mode && mode !== '--coverage' && mode !== '--plan')
) {
  throw new Error(
    'Usage: node scripts/ci/run-test-shard.js <zero-based-index> <total> [--coverage|--plan]'
  );
}
const root = path.resolve(__dirname, '../..');
const shards = planShards(discoverPackages(root), Number(total));
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
}
