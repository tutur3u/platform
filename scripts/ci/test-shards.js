const fs = require('node:fs');
const path = require('node:path');

const EXCLUDED = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.git',
  'dist',
  'build',
  'coverage',
]);

// Counts only balance work. Vitest remains responsible for discovering and
// executing each workspace's complete suite with its own configuration.
function testWeight(directory) {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !EXCLUDED.has(entry.name)) {
      count += testWeight(path.join(directory, entry.name));
    } else if (
      entry.isFile() &&
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
    ) {
      count++;
    }
  }
  return count;
}

function discoverPackages(root) {
  const packages = [];
  for (const parent of ['apps', 'packages']) {
    for (const entry of fs.readdirSync(path.join(root, parent), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, parent, entry.name);
      const manifest = path.join(directory, 'package.json');
      if (!fs.existsSync(manifest)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (!pkg.scripts?.test || pkg.name === '@tuturuuu/tanstack-web') continue;
      if (!/^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/.test(pkg.name)) {
        throw new Error(`Invalid test workspace name in ${manifest}`);
      }
      packages.push({
        name: pkg.name,
        weight: Math.max(1, testWeight(directory)),
      });
    }
  }
  if (!packages.length) throw new Error('No test workspaces found');
  if (new Set(packages.map((pkg) => pkg.name)).size !== packages.length) {
    throw new Error('Duplicate test workspace names');
  }
  return packages;
}

function planShards(packages, total) {
  if (!Number.isInteger(total) || total < 1 || total > packages.length) {
    throw new Error(
      'Shard count must be positive and not exceed workspace count'
    );
  }
  const shards = Array.from({ length: total }, () => ({
    packages: [],
    weight: 0,
  }));
  const sorted = [...packages].sort(
    (a, b) => b.weight - a.weight || a.name.localeCompare(b.name)
  );
  for (const pkg of sorted) {
    const shard = shards.reduce((lightest, candidate) =>
      candidate.weight < lightest.weight ? candidate : lightest
    );
    shard.packages.push(pkg.name);
    shard.weight += pkg.weight;
  }
  return shards;
}

function commandForShard(shards, index, coverage = false) {
  if (!Number.isInteger(index) || index < 0 || index >= shards.length) {
    throw new Error('Invalid shard index');
  }
  if (!shards[index].packages.length) throw new Error('Empty test shard');
  return [
    'turbo:local',
    'run',
    'test',
    '--concurrency=2',
    ...shards[index].packages.map((name) => `--filter=${name}`),
    '--filter=!@tuturuuu/tanstack-web',
    '--',
    '--maxWorkers=2',
    ...(coverage ? ['--coverage'] : []),
  ];
}

function affectedShards(root, total, raw) {
  const packages = discoverPackages(root);
  const shards = planShards(packages, total);
  if (!raw) return shards;
  let selection;
  try {
    selection = JSON.parse(raw);
  } catch {
    return shards;
  }
  if (
    selection?.mode !== 'affected' ||
    !Array.isArray(selection.workspaces) ||
    selection.workspaces.some(
      (dir) =>
        typeof dir !== 'string' ||
        !/^(apps|packages)\/[a-zA-Z0-9_-]+$/.test(dir)
    )
  )
    return shards;
  const names = new Set();
  for (const dir of selection.workspaces) {
    const manifest = path.join(root, dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    names.add(JSON.parse(fs.readFileSync(manifest, 'utf8')).name);
  }
  return shards.map((shard) => ({
    ...shard,
    packages: shard.packages.filter((name) => names.has(name)),
  }));
}

module.exports = {
  affectedShards,
  commandForShard,
  discoverPackages,
  planShards,
  testWeight,
};
