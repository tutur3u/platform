const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { repoRoot } = require('./workflow-config-test-helpers.js');

function resolvedVitestPackages(lockfile) {
  // Read resolved package identities, never dependency-path alias keys.
  return new Set(
    [
      ...lockfile.matchAll(/^\s+"[^"]+": \["((?:vitest|@vitest\/[^/@"]+))@/gmu),
    ].map((match) => match[1])
  );
}

test('Vitest exclusions use resolved identities instead of nested dependency aliases', () => {
  const fixture = `
    "vitest": ["vitest@5.0.3", "", {}],
    "@vitest/browser": ["@vitest/browser@5.0.3", "", {}],
    "@vitest/browser/pngjs": ["pngjs@7.0.0", "", {}],
    "@vitest/browser/ws": ["ws@8.18.0", "", {}],
    "arbitrary/alias": ["@vitest/expect@5.0.3", "", {}],
  `;
  assert.deepEqual([...resolvedVitestPackages(fixture)].sort(), [
    '@vitest/browser',
    '@vitest/expect',
    'vitest',
  ]);
});

test('all resolved locked Vitest packages bypass the dependency release-age delay', () => {
  const bunfig = fs.readFileSync(path.join(repoRoot, 'bunfig.toml'), 'utf8');
  const lockfile = fs.readFileSync(path.join(repoRoot, 'bun.lock'), 'utf8');
  const packages = resolvedVitestPackages(lockfile);
  assert.ok(packages.has('vitest'));
  assert.ok(packages.has('@vitest/browser'));
  for (const packageName of packages) {
    assert.ok(
      bunfig.split(/\r?\n/u).includes(`  "${packageName}",`),
      `${packageName} must bypass the release-age delay`
    );
  }
});
