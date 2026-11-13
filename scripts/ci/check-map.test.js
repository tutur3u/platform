const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { ciFilters, selectLocalChecks, validateMap } = require('./check-map.js');

test('shared map selects local checks for changed and deleted supplier paths', () => {
  const selected = selectLocalChecks([
    'apps/web/src/app/api/example/route.ts',
    'apps/web/messages/en.json',
    'apps/database/supabase/migrations/20261109090000_example.sql',
    'packages/sdk/package.json',
  ]);
  for (const id of [
    'api-route-wrappers',
    'mobile-api-mappings',
    'i18n',
    'migration-timestamps',
    'sdk-portable',
    'package-release-dependencies',
  ])
    assert.ok(selected.has(id), id);
  assert.equal(selected.has('docs-audit'), false);
  assert.equal(selectLocalChecks(['README.md']).size, 0);
});

test('map retains CI scopes and control paths', () => {
  const filters = ciFilters();
  assert.deepEqual(Object.keys(filters), [
    'oxc',
    'i18n',
    'docs',
    'migrations',
    'mobile',
    'plugin',
    'fonts',
  ]);
  for (const patterns of Object.values(filters)) {
    for (const control of [
      '.github/**',
      'package.json',
      'bun.lock',
      'turbo.json',
      'tsconfig*.json',
    ])
      assert.ok(patterns.includes(control), control);
  }
  assert.ok(filters.plugin.includes('AGENTS.md'));
});

test('CLI emits one JSON filter value usable by paths-filter', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-check-map-'));
  try {
    const output = path.join(root, 'output');
    execFileSync(
      process.execPath,
      [path.join(__dirname, 'check-map.js'), '--ci-filters'],
      { env: { ...process.env, GITHUB_OUTPUT: output } }
    );
    const line = fs.readFileSync(output, 'utf8');
    assert.deepEqual(JSON.parse(line.slice('filters='.length)), ciFilters());
    assert.equal(line.trim().split('\n').length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('malformed map data fails rather than producing an empty check set', () => {
  assert.throws(() => validateMap({ version: 99 }));
  assert.throws(() =>
    validateMap({ version: 1, ciScopes: {}, localChecks: {} })
  );
  assert.throws(() =>
    validateMap({ version: 1, ciScopes: { docs: [] }, localChecks: {} })
  );
  assert.throws(() =>
    validateMap({ version: 1, ciScopes: {}, localChecks: { docs: '[' } })
  );
});
