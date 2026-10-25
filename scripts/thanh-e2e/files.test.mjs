import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock, test } from 'node:test';
import { ensureFirebaseConfig, readPidFile } from './files.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thanh-files-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('Firebase input is created once and preserves an existing config', (t) => {
  const file = path.join(fixture(t), 'google-services.json');
  ensureFirebaseConfig(file, 'dummy');
  assert.equal(fs.readFileSync(file, 'utf8'), 'dummy');
  ensureFirebaseConfig(file, 'replacement');
  assert.equal(fs.readFileSync(file, 'utf8'), 'dummy');
});

test('Firebase input never follows an existing or dangling symlink', (t) => {
  const dir = fixture(t);
  const target = path.join(dir, 'target');
  const link = path.join(dir, 'google-services.json');
  fs.symlinkSync(target, link);
  ensureFirebaseConfig(link, 'dummy');
  // Exclusive create proves the dangling target was not followed.
  fs.writeFileSync(target, 'private config', { flag: 'wx' });
  ensureFirebaseConfig(link, 'dummy');
  assert.equal(fs.readFileSync(target, 'utf8'), 'private config');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
});

test('Firebase input reports creation failures other than EEXIST', (t) => {
  assert.throws(
    () =>
      ensureFirebaseConfig(path.join(fixture(t), 'missing', 'config'), 'dummy'),
    { code: 'ENOENT' }
  );
});

test('PID state handles missing, malformed and valid files', (t) => {
  const file = path.join(fixture(t), 'server.pid');
  assert.equal(readPidFile(file), null);
  for (const value of ['', '0', '-1', '1.5', 'garbage', '9007199254740992']) {
    fs.writeFileSync(file, value);
    assert.equal(readPidFile(file), null, value);
  }
  fs.writeFileSync(file, '12345\n');
  assert.equal(readPidFile(file), 12345);
});

test('PID state rejects symlinks, directories and oversized files', (t) => {
  const dir = fixture(t);
  const target = path.join(dir, 'target');
  fs.writeFileSync(target, '12345');
  const link = path.join(dir, 'server.pid');
  fs.symlinkSync(target, link);
  assert.throws(() => readPidFile(link), { code: 'ELOOP' });
  assert.throws(() => readPidFile(dir), /regular file/u);
  fs.writeFileSync(target, '1'.repeat(65));
  assert.throws(() => readPidFile(target), /at most 64 bytes/u);
});

test('PID state reads the opened inode after its pathname is replaced', (t) => {
  const dir = fixture(t);
  const file = path.join(dir, 'server.pid');
  const replacement = path.join(dir, 'replacement');
  fs.writeFileSync(file, '12345');
  fs.writeFileSync(replacement, '67890');
  const originalOpen = fs.openSync;
  const open = mock.method(fs, 'openSync', (...args) => {
    const fd = originalOpen(...args);
    fs.renameSync(replacement, file);
    return fd;
  });
  t.after(() => open.mock.restore());
  assert.equal(readPidFile(file), 12345);
  assert.equal(fs.readFileSync(file, 'utf8'), '67890');
});
