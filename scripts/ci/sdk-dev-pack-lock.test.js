const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { acquirePackLock } = require('./sdk-dev-pack-lock');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-pack-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, '.dev-pack.lock');
}
test('live pack owners are never displaced and releases retain ownership', (t) => {
  const file = fixture(t),
    release = acquirePackLock(file);
  assert.throws(() => acquirePackLock(file), /DEV_PACK_BUSY/);
  release();
  assert.equal(fs.existsSync(file), false);
});
test('a killed pack owner can be reclaimed without a time expiry', async (t) => {
  const file = fixture(t);
  const helper = require.resolve('./sdk-dev-pack-lock');
  const child = cp.spawn(
    process.execPath,
    [
      '-e',
      `require(${JSON.stringify(helper)}).acquirePackLock(${JSON.stringify(file)});console.log('locked');setInterval(()=>{},1000);`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const closed = new Promise((resolve) => child.once('close', resolve));
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
  });
  const oldOwner = JSON.parse(fs.readFileSync(file));
  child.kill('SIGKILL');
  await closed;
  const release = acquirePackLock(file);
  assert.notEqual(JSON.parse(fs.readFileSync(file)).nonce, oldOwner.nonce);
  release();
});
test('malformed metadata and interrupted reclaimer require inspection', (t) => {
  const file = fixture(t);
  fs.writeFileSync(file, '');
  assert.throws(() => acquirePackLock(file), /REPAIR_REQUIRED/);
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 2, pid: 2147483647, nonce: 'dead', groups: [] })
  );
  fs.mkdirSync(`${file}.reclaim`);
  assert.throws(() => acquirePackLock(file), /interrupted reclaim/);
  assert.equal(JSON.parse(fs.readFileSync(file)).nonce, 'dead');
});
