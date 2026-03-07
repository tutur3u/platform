const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildInfoMarkerPath,
  syncBuildInfoCache,
} = require('./run-tsgo-build.js');

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-tsgo-build-'));
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

test('syncBuildInfoCache clears stale build info when the cache key changes', () => {
  const repoRoot = createTempRepo();
  const workspaceDir = path.join(repoRoot, 'apps/web');
  const buildInfoPath = path.join(workspaceDir, 'tsconfig.tsbuildinfo');

  writeFile(path.join(repoRoot, 'bun.lock'), 'lock-v1');
  writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ packageManager: 'bun@1.3.10' })
  );
  writeFile(path.join(workspaceDir, 'package.json'), JSON.stringify({}));
  writeFile(path.join(workspaceDir, 'tsconfig.json'), JSON.stringify({}));
  writeFile(buildInfoPath, 'stale-build-info');

  syncBuildInfoCache(workspaceDir);

  assert.equal(fs.existsSync(buildInfoPath), false);
  assert.equal(
    fs.existsSync(path.join(workspaceDir, buildInfoMarkerPath)),
    true
  );
});

test('syncBuildInfoCache preserves build info when the dependency key is unchanged', () => {
  const repoRoot = createTempRepo();
  const workspaceDir = path.join(repoRoot, 'packages/utils');
  const buildInfoPath = path.join(workspaceDir, 'tsconfig.tsbuildinfo');

  writeFile(path.join(repoRoot, 'bun.lock'), 'lock-v1');
  writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ packageManager: 'bun@1.3.10' })
  );
  writeFile(path.join(workspaceDir, 'package.json'), JSON.stringify({}));
  writeFile(path.join(workspaceDir, 'tsconfig.json'), JSON.stringify({}));

  syncBuildInfoCache(workspaceDir);
  writeFile(buildInfoPath, 'fresh-build-info');

  const result = syncBuildInfoCache(workspaceDir);

  assert.equal(result.cacheKeyChanged, false);
  assert.equal(fs.readFileSync(buildInfoPath, 'utf8'), 'fresh-build-info');
});

test('syncBuildInfoCache invalidates build info when bun.lock changes', () => {
  const repoRoot = createTempRepo();
  const workspaceDir = path.join(repoRoot, 'packages/hooks');
  const buildInfoPath = path.join(workspaceDir, 'tsconfig.tsbuildinfo');

  writeFile(path.join(repoRoot, 'bun.lock'), 'lock-v1');
  writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ packageManager: 'bun@1.3.10' })
  );
  writeFile(path.join(workspaceDir, 'package.json'), JSON.stringify({}));
  writeFile(path.join(workspaceDir, 'tsconfig.json'), JSON.stringify({}));

  syncBuildInfoCache(workspaceDir);
  writeFile(buildInfoPath, 'fresh-build-info');
  writeFile(path.join(repoRoot, 'bun.lock'), 'lock-v2');

  const result = syncBuildInfoCache(workspaceDir);

  assert.equal(result.cacheKeyChanged, true);
  assert.equal(fs.existsSync(buildInfoPath), false);
});
