const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { commandFor } = require('./oxc.js');

test('Oxc requires explicit files and isolates paused/generated source', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'oxc-scope-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    'src/app.ts',
    'apps/tanstack-web/app.ts',
    'dist/app.ts',
  ]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), 'export const value = 1;\n');
  }
  symlinkSync(
    path.join(root, 'dist/app.ts'),
    path.join(root, 'src/generated.ts')
  );
  for (const files of [
    [],
    ['.'],
    ['src'],
    ['**/*.ts'],
    ['--write'],
    ['apps/tanstack-web/app.ts'],
    ['dist/app.ts'],
    ['src/generated.ts'],
    [__filename],
  ]) {
    assert.throws(() => commandFor('write', files, root));
  }
  const format = commandFor('format', ['src/app.ts'], root);
  assert.ok(format.args.includes('--check'));
  assert.ok(!format.args.includes('--write'));
  assert.equal(format.args.at(-1), path.join(root, 'src/app.ts'));
  assert.ok(commandFor('write', ['src/app.ts'], root).args.includes('--write'));
  assert.ok(
    commandFor('lint', ['src/app.ts'], root).args.includes('--deny-warnings')
  );
});

test('installed Oxc enforces dialogs and checks formatting without writing', (t) => {
  const root = path.resolve(__dirname, '..');
  const fixture = mkdtempSync(path.join(tmpdir(), 'oxc-tools-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const file = path.join(fixture, 'example.js');
  const invoke = (tool, config, args) =>
    spawnSync(
      path.join(root, 'node_modules', '.bin', tool),
      ['--config', path.join(root, config), '--threads', '1', ...args, file],
      { encoding: 'utf8' }
    );
  writeFileSync(file, 'alert("forbidden");\n');
  const lint = invoke('oxlint', '.oxlintrc.json', ['--deny-warnings']);
  assert.equal(lint.status, 1, lint.stdout + lint.stderr);
  assert.match(lint.stdout + lint.stderr, /no-alert/);
  const original = 'export const message="hello"\n';
  writeFileSync(file, original);
  const check = invoke('oxfmt', '.oxfmtrc.json', ['--check']);
  assert.equal(check.status, 1, check.stdout + check.stderr);
  assert.equal(readFileSync(file, 'utf8'), original);
  const write = invoke('oxfmt', '.oxfmtrc.json', ['--write']);
  assert.equal(write.status, 0, write.stdout + write.stderr);
  assert.equal(readFileSync(file, 'utf8'), "export const message = 'hello';\n");
  assert.equal(invoke('oxfmt', '.oxfmtrc.json', ['--check']).status, 0);
  assert.equal(
    invoke('oxlint', '.oxlintrc.json', ['--deny-warnings']).status,
    0
  );
});
