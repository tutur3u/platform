const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { getBlueGreenSupportBuildInputHashes } = require('./blue-green.js');

const relative = 'apps/hive/fixture.js';
const original = Buffer.from('original');
const replacement = Buffer.from('replacement-longer');

function fixture(t) {
  const rootDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'support-hash-'))
  );
  t.after(() => fs.rmSync(rootDir, { force: true, recursive: true }));
  const file = path.join(rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, original);
  return { rootDir, file };
}

function expected(data, size = data.length) {
  return crypto
    .createHash('sha256')
    .update(relative)
    .update('\0')
    .update(String(size))
    .update('\0')
    .update(data)
    .update('\0')
    .digest('hex');
}

async function hash(rootDir, fsImpl = fs) {
  const hashes = await getBlueGreenSupportBuildInputHashes({
    rootDir,
    fsImpl,
    targetColor: 'blue',
    env: {
      DOCKER_BACKEND_ENABLED: 'false',
      DOCKER_WEB_CRON_RUNNER_ENABLED: 'false',
      SUPERMEMORY_ENABLED: 'false',
    },
    runCommand: async (command, args) => {
      assert.equal(command, 'git');
      assert.equal(args[0], 'ls-files');
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: args.includes('apps/hive/') ? `${relative}\0` : '',
      };
    },
  });
  assert.ok(hashes);
  return hashes['hive-blue'];
}

test('binds build-input metadata and bytes to the same descriptor during replacement', async (t) => {
  const { rootDir, file } = fixture(t);
  let swapped = false;
  let opens = 0;
  let closes = 0;
  const reads = [];
  const swap = () => {
    if (swapped) return;
    swapped = true;
    fs.renameSync(file, `${file}.original`);
    fs.writeFileSync(file, replacement);
  };
  const fsImpl = {
    ...fs,
    statSync(name) {
      const stat = fs.statSync(name);
      if (name === file) swap();
      return stat;
    },
    fstatSync(fd) {
      const stat = fs.fstatSync(fd);
      swap();
      return stat;
    },
    openSync(...args) {
      const fd = fs.openSync(...args);
      opens++;
      return fd;
    },
    readFileSync(input, ...args) {
      reads.push(input);
      return fs.readFileSync(input, ...args);
    },
    closeSync(fd) {
      closes++;
      return fs.closeSync(fd);
    },
  };
  assert.equal(await hash(rootDir, fsImpl), expected(original));
  assert.equal(swapped, true);
  assert.deepEqual(fs.readFileSync(file), replacement);
  assert.equal(opens, 1);
  assert.equal(closes, 1);
  assert.equal(reads.length, 1);
  assert.equal(typeof reads[0], 'number');
});

test('closes the descriptor on read failure and hashes one complete missing marker', async (t) => {
  const { rootDir } = fixture(t);
  let closed = 0;
  const fsImpl = {
    ...fs,
    readFileSync() {
      throw new Error('fixture read failure');
    },
    closeSync(fd) {
      closed++;
      return fs.closeSync(fd);
    },
  };
  const missing = crypto
    .createHash('sha256')
    .update(relative)
    .update('\0missing\0')
    .digest('hex');
  assert.equal(await hash(rootDir, fsImpl), missing);
  assert.equal(closed, 1);
});

test('preserves tracked symlink inputs and hashes the target bytes under the alias', {
  skip: process.platform === 'win32',
}, async (t) => {
  const { rootDir, file } = fixture(t);
  const target = path.join(rootDir, 'target');
  fs.renameSync(file, target);
  fs.symlinkSync(target, file);
  assert.equal(await hash(rootDir), expected(original));
  fs.writeFileSync(target, replacement);
  assert.equal(await hash(rootDir), expected(replacement));
});

test('skips directories and keeps the existing missing-file marker', async (t) => {
  const { rootDir, file } = fixture(t);
  fs.unlinkSync(file);
  fs.mkdirSync(file);
  assert.equal(await hash(rootDir), crypto.createHash('sha256').digest('hex'));
  fs.rmdirSync(file);
  assert.equal(
    await hash(rootDir),
    crypto
      .createHash('sha256')
      .update(relative)
      .update('\0missing\0')
      .digest('hex')
  );
});
