import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  collectMobileTestFiles,
  parseArgs,
  planMobileTestShards,
} from './run-mobile-test-shard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const mobileRoot = path.join(repoRoot, 'apps/mobile');

test('planMobileTestShards balances weighted files deterministically', () => {
  const entries = [
    { path: 'test/a_test.dart', weight: 100 },
    { path: 'test/b_test.dart', weight: 90 },
    { path: 'test/c_test.dart', weight: 80 },
    { path: 'test/d_test.dart', weight: 70 },
    { path: 'test/e_test.dart', weight: 60 },
    { path: 'test/f_test.dart', weight: 50 },
  ];

  const shards = planMobileTestShards(entries, 3);
  assert.equal(shards.length, 3);
  assert.deepEqual(
    shards.map((s) => s.totalWeight),
    [150, 150, 150]
  );
  assert.deepEqual(shards[0].files, ['test/a_test.dart', 'test/f_test.dart']);
  assert.deepEqual(shards[1].files, ['test/b_test.dart', 'test/e_test.dart']);
  assert.deepEqual(shards[2].files, ['test/c_test.dart', 'test/d_test.dart']);

  assert.throws(() => planMobileTestShards(entries, 0));
  assert.throws(() => planMobileTestShards(entries, 7));
  assert.throws(() => planMobileTestShards([], 2));
});

test('apps/mobile test files partition into 8 disjoint shards whose union equals the full set', () => {
  const entries = collectMobileTestFiles('test', mobileRoot);
  assert.ok(
    entries.length > 0,
    'expected mobile test files under apps/mobile/test'
  );

  const shards = planMobileTestShards(entries, 8);
  assert.equal(shards.length, 8);

  const seen = new Set();
  for (const shard of shards) {
    assert.ok(shard.files.length > 0, `shard ${shard.index} must not be empty`);
    for (const file of shard.files) {
      assert.ok(
        !seen.has(file),
        `file ${file} appeared in more than one shard`
      );
      seen.add(file);
    }
  }

  const expected = new Set(entries.map((entry) => entry.path));
  assert.deepEqual(seen, expected);

  const weights = shards.map((s) => s.totalWeight);
  const maxWeight = Math.max(...weights);
  const minWeight = Math.min(...weights);
  assert.ok(
    maxWeight / minWeight < 1.1,
    `expected tight weight balance across shards, got min=${minWeight} max=${maxWeight}`
  );
});

test('parseArgs validates flags and --dry-run prints the shard file list', () => {
  assert.deepEqual(
    parseArgs(['--total-shards', '8', '--shard-index', '3', '--dry-run']),
    {
      totalShards: 8,
      shardIndex: 3,
      testDir: 'test',
      concurrency: 2,
      dryRun: true,
    }
  );
  assert.throws(() => parseArgs(['--total-shards', '8', '--shard-index', '8']));
  assert.throws(() => parseArgs(['--total-shards', '0', '--shard-index', '0']));
  assert.throws(() => parseArgs(['--unknown-flag']));

  const output = execFileSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/ci/run-mobile-test-shard.mjs'),
      '--total-shards',
      '8',
      '--shard-index',
      '0',
      '--dry-run',
    ],
    { cwd: mobileRoot, encoding: 'utf8' }
  );

  assert.match(output, /\[mobile-shard\] shard 0\/8: \d+ files/);
  assert.match(output, /::group::Mobile test shard 0 file list/);
  assert.match(output, /_test\.dart/);
  assert.match(output, /::endgroup::/);
});
