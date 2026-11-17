const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  getCopiedRelativePaths,
  getCopiedWorkspaceManifestPaths,
  getStageContent,
  listFileDependencyPaths,
  listWorkspacePackageJsonPaths,
} = require('../check-docker-web.js');

const dockerfile = readFileSync(
  path.join(__dirname, '../../apps/web/Dockerfile'),
  'utf8'
);
const deps = getStageContent(dockerfile, 'deps');

test('report-only Web E2E frozen install receives every workspace manifest', () => {
  assert.ok(deps, 'the dependency stage must exist');
  const install = deps.indexOf('bun install --frozen-lockfile');
  assert.ok(install >= 0, 'the dependency stage must retain frozen installs');
  assert.deepEqual(
    getCopiedWorkspaceManifestPaths(deps.slice(0, install)),
    listWorkspacePackageJsonPaths()
  );
});

test('report-only Web E2E receives file-backed dependencies before install', () => {
  const install = deps.indexOf('bun install --frozen-lockfile');
  const copied = new Set(getCopiedRelativePaths(deps.slice(0, install)));
  assert.deepEqual(
    listFileDependencyPaths().filter((file) => !copied.has(file)),
    []
  );
});
