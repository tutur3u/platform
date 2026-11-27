#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function comparePaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function collectMobileTestFiles(testDir, rootDir = process.cwd()) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTestDir = path.resolve(resolvedRoot, testDir);
  const entries = [];

  function walk(currentDir) {
    const dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
    dirEntries.sort((a, b) => comparePaths(a.name, b.name));

    for (const entry of dirEntries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('_test.dart')) continue;

      const relativePath = path
        .relative(resolvedRoot, fullPath)
        .split(path.sep)
        .join('/');
      const { size } = fs.statSync(fullPath);
      entries.push({ path: relativePath, weight: Math.max(1, size) });
    }
  }

  walk(resolvedTestDir);
  entries.sort((a, b) => comparePaths(a.path, b.path));
  return entries;
}

export function planMobileTestShards(entries, totalShards) {
  if (!Number.isInteger(totalShards) || totalShards < 1) {
    throw new RangeError(
      `totalShards must be a positive integer, got ${totalShards}`
    );
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new RangeError('entries must be a non-empty array');
  }
  if (totalShards > entries.length) {
    throw new RangeError(
      `totalShards (${totalShards}) exceeds test file count (${entries.length})`
    );
  }

  const shards = Array.from({ length: totalShards }, (_, index) => ({
    index,
    files: [],
    totalWeight: 0,
  }));

  const sortedByWeight = [...entries].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return comparePaths(a.path, b.path);
  });

  for (const entry of sortedByWeight) {
    let target = shards[0];
    for (let i = 1; i < shards.length; i++) {
      if (shards[i].totalWeight < target.totalWeight) {
        target = shards[i];
      }
    }
    target.files.push(entry.path);
    target.totalWeight += entry.weight;
  }

  for (const shard of shards) {
    shard.files.sort(comparePaths);
  }

  return shards;
}

export function parseArgs(argv) {
  let totalShards;
  let shardIndex;
  let testDir = 'test';
  let concurrency = 2;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    const next = argv[i + 1];
    if (arg === '--total-shards') {
      totalShards = Number(next);
      i++;
    } else if (arg === '--shard-index') {
      shardIndex = Number(next);
      i++;
    } else if (arg === '--test-dir') {
      testDir = next;
      i++;
    } else if (arg === '--concurrency') {
      concurrency = Number(next);
      i++;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(totalShards) || totalShards < 1) {
    throw new Error(`Invalid --total-shards: ${totalShards}`);
  }
  if (
    !Number.isInteger(shardIndex) ||
    shardIndex < 0 ||
    shardIndex >= totalShards
  ) {
    throw new Error(
      `Invalid --shard-index: ${shardIndex} (expected 0..${totalShards - 1})`
    );
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`Invalid --concurrency: ${concurrency}`);
  }

  return { totalShards, shardIndex, testDir, concurrency, dryRun };
}

function main() {
  const { totalShards, shardIndex, testDir, concurrency, dryRun } = parseArgs(
    process.argv.slice(2)
  );
  const entries = collectMobileTestFiles(testDir, process.cwd());
  const shards = planMobileTestShards(entries, totalShards);
  const shard = shards[shardIndex];
  const kb = (shard.totalWeight / 1024).toFixed(1);

  console.log(
    `[mobile-shard] shard ${shardIndex}/${totalShards}: ${shard.files.length} files (${kb} KB) of ${entries.length} total test files`
  );
  console.log(
    `::group::Mobile test shard ${shardIndex} file list (${shard.files.length} files)`
  );
  for (const file of shard.files) {
    console.log(file);
  }
  console.log('::endgroup::');

  if (dryRun) return;

  const result = spawnSync(
    'flutter',
    [
      'test',
      '--no-pub',
      `--concurrency=${concurrency}`,
      '-r',
      'expanded',
      ...shard.files,
    ],
    { stdio: 'inherit' }
  );

  if (result.error) {
    console.error(
      `[mobile-shard] failed to spawn flutter: ${result.error.message}`
    );
    process.exit(1);
  }
  if (result.signal) {
    console.error(
      `[mobile-shard] flutter terminated by signal ${result.signal}`
    );
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
