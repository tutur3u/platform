import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { readCalendarFile } from './calendar-cf-files.mjs';

function fixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'calendar-file-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'input');
  fs.writeFileSync(file, 'original');
  return { dir, file };
}

test('Calendar file reads reject symlinks and directories', (t) => {
  const { dir, file } = fixture(t);
  const link = join(dir, 'link');
  fs.symlinkSync(file, link);
  assert.throws(() => readCalendarFile(link), { code: 'ELOOP' });
  assert.throws(() => readCalendarFile(dir), /regular Calendar file/);
});

test('replacement after open is rejected and the descriptor is closed', (t) => {
  const { dir, file } = fixture(t);
  const replacement = join(dir, 'replacement');
  fs.writeFileSync(replacement, 'replacement');
  const originalOpen = fs.openSync;
  let opened;
  const hook = mock.method(fs, 'openSync', (...args) => {
    opened = originalOpen(...args);
    fs.renameSync(replacement, file);
    return opened;
  });
  t.after(() => hook.mock.restore());
  assert.throws(() => readCalendarFile(file), /file identity/);
  assert.throws(() => fs.fstatSync(opened), { code: 'EBADF' });
});

test('replacement after validation cannot redirect a descriptor read', (t) => {
  const { dir, file } = fixture(t);
  const replacement = join(dir, 'replacement');
  fs.writeFileSync(replacement, 'replacement');
  const originalRead = fs.readFileSync;
  const hook = mock.method(fs, 'readFileSync', (fd, ...args) => {
    assert.equal(typeof fd, 'number');
    fs.renameSync(replacement, file);
    return originalRead(fd, ...args);
  });
  t.after(() => hook.mock.restore());
  assert.equal(readCalendarFile(file).bytes.toString(), 'original');
});
