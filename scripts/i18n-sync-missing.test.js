const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { processDirectory } = require('./i18n-sync-missing');
const { privateTempDirSync, writeExclusiveFileSync } = require('./safe-fs');

function fixture(t) {
  const root = privateTempDirSync('i18n-sync-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('translation sync preserves existing values and copies only missing keys', (t) => {
  const root = fixture(t);
  writeExclusiveFileSync(
    path.join(root, 'en.json'),
    '{"z":"new","a":"source"}'
  );
  writeExclusiveFileSync(path.join(root, 'vi.json'), '{"a":"existing"}');
  assert.deepEqual(processDirectory('.', root), { added: 1, dir: '.' });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, 'vi.json'), 'utf8')),
    {
      a: 'existing',
      z: 'new',
    }
  );
});

test('translation sync leaves a missing destination absent', (t) => {
  const root = fixture(t);
  writeExclusiveFileSync(path.join(root, 'en.json'), '{}');
  assert.deepEqual(processDirectory('.', root), { added: 0, dir: '.' });
  assert.equal(fs.existsSync(path.join(root, 'vi.json')), false);
});

test('translation sync refuses a linked destination and preserves its target', (t) => {
  if (process.platform === 'win32') return t.skip('requires POSIX symlinks');
  const root = fixture(t);
  writeExclusiveFileSync(path.join(root, 'en.json'), '{"missing":"source"}');
  const target = path.join(root, 'original.json');
  writeExclusiveFileSync(target, '{}');
  fs.symlinkSync(target, path.join(root, 'vi.json'));
  const result = processDirectory('.', root);
  assert.equal(result.added, 0);
  assert.match(result.error, /ELOOP/);
  assert.equal(fs.readFileSync(target, 'utf8'), '{}');
});
