const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { launcherHashes } = require('./sdk-rollout-engine');
const { fingerprint } = require('./sdk-rollout-state');
const { assertChildCompletes } = require('./sdk-rollout-test-support');

// Launchers reject symlinks; supplier fingerprints record and resolve them.
// Descriptor classification rejects special files without waiting on a FIFO.
function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-descriptor-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, 'bin'));
  return home;
}
const mkfifo = (file) => cp.execFileSync('mkfifo', [file]);

test('launcher hashes cover regular launcher bytes', (t) => {
  const home = tempHome(t);
  fs.writeFileSync(path.join(home, 'bin/bun'), 'shim');
  const before = launcherHashes(home, { shims: ['bun'] });
  assert.deepEqual(Object.keys(before), ['bun']);
  fs.writeFileSync(path.join(home, 'bin/bun'), 'changed');
  assert.notEqual(launcherHashes(home, { shims: ['bun'] }).bun, before.bun);
});

test('launcher hashes reject a symlinked launcher without following it', (t) => {
  const home = tempHome(t);
  fs.writeFileSync(path.join(home, 'outside'), 'shim');
  fs.symlinkSync(path.join(home, 'outside'), path.join(home, 'bin/bun'));
  assert.throws(
    () => launcherHashes(home, { shims: ['bun'] }),
    /Resource launchers must be regular files/
  );
});

test('launcher hashes reject a FIFO launcher without blocking', (t) => {
  const home = tempHome(t);
  mkfifo(path.join(home, 'bin/bun'));
  assertChildCompletes(
    `
    const assert = require('node:assert/strict');
    const { loadRollout } = require('./sdk-rollout-test-support');
    assert.throws(
      () => loadRollout('engine').launcherHashes(process.argv[1], { shims: ['bun'] }),
      /Resource launchers must be regular files/
    );
  `,
    [home]
  );
});

test('fingerprint hashes file bytes and directory trees', (t) => {
  const home = tempHome(t);
  const file = path.join(home, 'bin/state');
  fs.writeFileSync(file, 'one');
  const first = fingerprint(home);
  assert.equal(fingerprint(home), first);
  fs.writeFileSync(file, 'two');
  assert.notEqual(fingerprint(home), first);
  assert.equal(fingerprint(path.join(home, 'absent')), 'missing');
});

test('fingerprint records a symlink and hashes its resolved target', (t) => {
  const home = tempHome(t);
  fs.writeFileSync(path.join(home, 'target'), 'bytes');
  fs.symlinkSync(path.join(home, 'target'), path.join(home, 'bin/link'));
  const linked = fingerprint(path.join(home, 'bin/link'));
  assert.notEqual(linked, fingerprint(path.join(home, 'target')));
  fs.writeFileSync(path.join(home, 'target'), 'changed');
  assert.notEqual(fingerprint(path.join(home, 'bin/link')), linked);
});

test('fingerprint rejects a FIFO without blocking', (t) => {
  const home = tempHome(t);
  mkfifo(path.join(home, 'bin/pipe'));
  assertChildCompletes(
    `
    const assert = require('node:assert/strict');
    const { loadRollout } = require('./sdk-rollout-test-support');
    assert.throws(
      () => loadRollout('state').fingerprint(process.argv[1]),
      /Unsupported supplier state/
    );
  `,
    [home]
  );
});
