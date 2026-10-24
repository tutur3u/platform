const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  atomicWriteFileSync,
  privateTempDirSync,
  readFileSnapshot,
  readFileSnapshotSync,
  readOptionalFileSync,
  readRegularFile,
  readRegularFileSync,
  writeExclusiveFileSync,
} = require('./safe-fs');

function fixture(t) {
  const directory = privateTempDirSync('safe-fs-');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('temporary directories and exclusive files have private permissions', (t) => {
  const directory = fixture(t);
  const file = path.join(directory, 'receipt');
  writeExclusiveFileSync(file, 'first');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
  assert.throws(() => writeExclusiveFileSync(file, 'second'), {
    code: 'EEXIST',
  });
  assert.equal(fs.readFileSync(file, 'utf8'), 'first');
});

test('reads validate the opened file and enforce size bounds', async (t) => {
  const directory = fixture(t);
  const file = path.join(directory, 'input');
  writeExclusiveFileSync(file, 'abc');
  for (const read of [readRegularFileSync, readRegularFile]) {
    assert.equal(await read(file, { encoding: 'utf8', maxBytes: 3 }), 'abc');
    await assert.rejects(async () => read(file, { maxBytes: 2 }), {
      code: 'ERR_FS_FILE_TOO_LARGE',
    });
    await assert.rejects(
      async () => read(directory),
      (error) => ['ERR_FS_NOT_REGULAR', 'EISDIR'].includes(error.code)
    );
  }
  assert.equal(readFileSnapshotSync(file).stat.size, 3);
  assert.equal((await readFileSnapshot(file)).stat.size, 3);
  assert.equal(
    readOptionalFileSync(path.join(directory, 'missing')),
    undefined
  );
});

test('reads refuse a symlink even when its target is regular', async (t) => {
  if (process.platform === 'win32') return t.skip('requires POSIX symlinks');
  const directory = fixture(t);
  const file = path.join(directory, 'input');
  const link = path.join(directory, 'link');
  writeExclusiveFileSync(file, 'original');
  fs.symlinkSync(file, link);
  assert.throws(() => readRegularFileSync(link), { code: 'ELOOP' });
  await assert.rejects(readRegularFile(link), { code: 'ELOOP' });
  for (const options of [{}, { mode: 0o600 }])
    assert.throws(() => atomicWriteFileSync(link, 'changed', options), {
      code: 'ERR_FS_NOT_REGULAR',
    });
  assert.equal(fs.readFileSync(file, 'utf8'), 'original');
});

test('read stays on the opened descriptor if its pathname changes', (t) => {
  const directory = fixture(t);
  const file = path.join(directory, 'input');
  writeExclusiveFileSync(file, 'original');
  const fsImpl = {
    ...fs,
    fstatSync(fd) {
      fs.renameSync(file, path.join(directory, 'previous'));
      writeExclusiveFileSync(file, 'replacement');
      return fs.fstatSync(fd);
    },
  };
  const snapshot = readFileSnapshotSync(file, { fsImpl, encoding: 'utf8' });
  assert.equal(snapshot.data, 'original');
  assert.equal(snapshot.stat.size, 8);
});

test('bounded read rejects growth after descriptor inspection and closes on failure', (t) => {
  const directory = fixture(t);
  const file = path.join(directory, 'input');
  writeExclusiveFileSync(file, 'abc');
  let closed = false;
  const fsImpl = {
    ...fs,
    fstatSync(fd) {
      const stat = fs.fstatSync(fd);
      fs.appendFileSync(file, 'def');
      return stat;
    },
    closeSync(fd) {
      closed = true;
      fs.closeSync(fd);
    },
  };
  assert.throws(
    () => readRegularFileSync(file, { fsImpl, maxBytes: 3 }),
    /size cap/
  );
  assert.equal(closed, true);
});

test('atomic writes preserve existing bytes on failure and clean temporary files', (t) => {
  const directory = fixture(t);
  const file = path.join(directory, 'output');
  writeExclusiveFileSync(file, 'original');
  assert.throws(
    () =>
      atomicWriteFileSync(file, 'replacement', {
        fsImpl: {
          ...fs,
          renameSync() {
            throw new Error('rename failed');
          },
        },
      }),
    /rename failed/
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(directory), ['output']);
  atomicWriteFileSync(file, 'replacement');
  assert.equal(fs.readFileSync(file, 'utf8'), 'replacement');
  if (process.platform !== 'win32')
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(directory), ['output']);
});

test('default temp parent is the operating system temp directory', (t) => {
  const directory = fixture(t);
  assert.equal(path.dirname(directory), os.tmpdir());
});
