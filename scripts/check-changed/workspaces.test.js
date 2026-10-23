const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  readWorkspaces,
  reverseDependents,
  assertSafePaths,
} = require('./workspaces.js');

test('workspace graph includes every dependency category and excludes paused apps', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'changed-workspaces-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [workspace, manifest] of [
    ['packages/shared', { name: '@test/shared' }],
    [
      'apps/consumer',
      {
        name: '@test/consumer',
        dependencies: { '@test/shared': 'workspace:*' },
        devDependencies: { dev: '*' },
        peerDependencies: { peer: '*' },
        optionalDependencies: { optional: '*' },
      },
    ],
    [
      'apps/tanstack-web',
      { name: '@test/paused', dependencies: { '@test/shared': 'workspace:*' } },
    ],
  ]) {
    fs.mkdirSync(path.join(root, workspace), { recursive: true });
    fs.writeFileSync(
      path.join(root, workspace, 'package.json'),
      JSON.stringify(manifest)
    );
  }
  const entries = readWorkspaces(root);
  assert.deepEqual(
    entries.find((entry) => entry.workspace === 'apps/consumer').dependencies,
    ['@test/shared', 'dev', 'peer', 'optional']
  );
  assert.deepEqual(
    [...reverseDependents(new Set(['packages/shared']), entries)],
    ['packages/shared', 'apps/consumer']
  );
  assert.equal(
    entries.some((entry) => entry.workspace === 'apps/tanstack-web'),
    false
  );
});

test('reverse dependency cycles terminate without duplicate projects', () => {
  const entries = [
    { workspace: 'packages/a', name: 'a', dependencies: ['b'] },
    { workspace: 'packages/b', name: 'b', dependencies: ['a'] },
  ];
  assert.deepEqual(
    [...reverseDependents(new Set(['packages/a']), entries)],
    ['packages/a', 'packages/b']
  );
});

test('REV-6467-6: only option-like tool-relative prefixes are rejected', () => {
  assert.doesNotThrow(() =>
    assertSafePaths([
      'apps/git/src/app/[locale]/-/[wsId]/page.tsx',
      'packages/utils/src/-internal.ts',
      'docs/-notes.md',
    ])
  );
  for (const file of [
    '-a.ts',
    './-a.ts',
    'packages/utils/-a.test.ts',
    'apps/git/./--config.ts',
  ]) {
    assert.throws(() => assertSafePaths([file]), /Option-like/);
  }
});
