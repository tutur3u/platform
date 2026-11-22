const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { commandFor } = require('./oxc');

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'oxc-wrapper-'));
  mkdirSync(path.join(root, 'apps/app/src/routes/{-$locale}'), {
    recursive: true,
  });
  writeFileSync(path.join(root, 'apps/app/src/routes/{-$locale}/ship.tsx'), '');
  writeFileSync(path.join(root, 'apps/app/src/a.ts'), '');
  return root;
}

test('accepts a brace path only when it names an existing file', () => {
  const root = repo();
  const { args } = commandFor(
    'lint',
    ['apps/app/src/routes/{-$locale}/ship.tsx', 'apps/app/src/a.ts'],
    root
  );
  assert.ok(args.some((arg) => arg.endsWith('{-$locale}/ship.tsx')));
});

test('still refuses globs and flags', () => {
  const root = repo();
  for (const file of [
    'apps/app/src/*.ts',
    'apps/app/src/{a,b}.ts',
    'apps/app/src/routes/{-$locale}/missing.tsx',
    'apps/app/src/a?.ts',
    '--fix',
  ]) {
    assert.throws(
      () => commandFor('format', [file], root),
      /without flags or globs/,
      file
    );
  }
});
