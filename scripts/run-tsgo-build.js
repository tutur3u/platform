#!/usr/bin/env node

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const buildInfoMarkerPath = path.join('.turbo', 'tsgo-build-cache-key.json');
const buildInfoPaths = [
  'tsconfig.tsbuildinfo',
  'tsconfig.build.tsbuildinfo',
  path.join('dist', 'tsconfig.tsbuildinfo'),
  path.join('.turbo', 'tsconfig.tsbuildinfo'),
  path.join('.next', 'cache', '.tsbuildinfo'),
];

function readFileIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function findRepoRoot(cwd = process.cwd()) {
  let currentDir = cwd;

  while (true) {
    const hasRootPackageJson = fs.existsSync(
      path.join(currentDir, 'package.json')
    );
    const hasBunLock = fs.existsSync(path.join(currentDir, 'bun.lock'));

    if (hasRootPackageJson && hasBunLock) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(`Could not find repo root from ${cwd}`);
    }

    currentDir = parentDir;
  }
}

function computeBuildCacheKey(
  cwd = process.cwd(),
  repoRoot = findRepoRoot(cwd)
) {
  const hash = createHash('sha256');

  hash.update(readFileIfExists(path.join(repoRoot, 'bun.lock')));
  hash.update(readFileIfExists(path.join(repoRoot, 'package.json')));
  hash.update(readFileIfExists(path.join(cwd, 'package.json')));
  hash.update(readFileIfExists(path.join(cwd, 'tsconfig.json')));
  hash.update(readFileIfExists(path.join(cwd, 'tsconfig.build.json')));

  return hash.digest('hex');
}

function clearBuildInfo(cwd = process.cwd()) {
  for (const relativePath of buildInfoPaths) {
    const absolutePath = path.join(cwd, relativePath);

    if (fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { force: true });
    }
  }
}

function syncBuildInfoCache(cwd = process.cwd()) {
  const markerAbsolutePath = path.join(cwd, buildInfoMarkerPath);
  const markerDirectory = path.dirname(markerAbsolutePath);
  const repoRoot = findRepoRoot(cwd);
  const nextKey = computeBuildCacheKey(cwd, repoRoot);
  const previousKey = readFileIfExists(markerAbsolutePath);

  if (previousKey !== nextKey) {
    clearBuildInfo(cwd);
    fs.mkdirSync(markerDirectory, { recursive: true });
    fs.writeFileSync(markerAbsolutePath, nextKey);
  }

  return {
    cacheKeyChanged: previousKey !== nextKey,
    cacheKey: nextKey,
  };
}

function runTsgo(argv = process.argv.slice(2), cwd = process.cwd()) {
  const repoRoot = findRepoRoot(cwd);
  const tsgoBinary = path.join(repoRoot, 'node_modules/.bin/tsgo');

  syncBuildInfoCache(cwd);

  const result = spawnSync(tsgoBinary, argv, {
    cwd,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

if (require.main === module) {
  process.exit(runTsgo());
}

module.exports = {
  buildInfoMarkerPath,
  buildInfoPaths,
  clearBuildInfo,
  computeBuildCacheKey,
  findRepoRoot,
  runTsgo,
  syncBuildInfoCache,
};
