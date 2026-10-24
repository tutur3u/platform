const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  loadRollout,
  beforeRead,
  assertChildCompletes,
} = require('./sdk-rollout-test-support');

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-race-'))
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'bin'));
  return root;
}
function replaceWithLink(file, replacement) {
  fs.renameSync(file, `${file}.checked`);
  fs.symlinkSync(replacement, file);
}

test('launcher check/read swap hashes checked bytes instead of a replacement symlink', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'bin/bun');
  const outside = path.join(root, 'outside');
  fs.writeFileSync(file, 'checked launcher');
  fs.writeFileSync(outside, 'unchecked launcher');
  const expected = loadRollout('engine').launcherHashes(root, {
    shims: ['bun'],
  });
  const hook = beforeRead(file, () => replaceWithLink(file, outside));
  const actual = loadRollout('engine', hook).launcherHashes(root, {
    shims: ['bun'],
  });
  hook.assertSwapped();
  assert.deepEqual(actual, expected);
});

test('fingerprint check/read swap hashes checked file bytes and mode', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'state');
  const replacement = path.join(root, 'replacement');
  fs.writeFileSync(file, 'checked state', { mode: 0o600 });
  fs.writeFileSync(replacement, 'unchecked state', { mode: 0o644 });
  const expected = loadRollout('state').fingerprint(file);
  const hook = beforeRead(file, () => replaceWithLink(file, replacement));
  const actual = loadRollout('state', hook).fingerprint(file);
  hook.assertSwapped();
  assert.equal(actual, expected);
});

for (const boundary of [
  'before enumeration',
  'after enumeration',
  'during child hashing',
]) {
  test(`fingerprint rejects a directory replacement ${boundary}`, (t) => {
    const root = fixture(t);
    const directory = path.join(root, 'state');
    const replacement = path.join(root, 'replacement');
    for (const [name, mode] of [
      [directory, 0o700],
      [replacement, 0o755],
    ]) {
      fs.mkdirSync(name, { mode });
      fs.writeFileSync(path.join(name, 'child'), 'identical bytes', {
        mode: 0o600,
      });
    }
    const state = loadRollout('state');
    const checkedHash = state.fingerprint(directory);
    assert.notEqual(state.fingerprint(replacement), checkedHash);
    let swaps = 0;
    const swap = () => {
      fs.renameSync(directory, `${directory}.checked`);
      fs.renameSync(replacement, directory);
      swaps++;
    };
    const overrides =
      boundary === 'during child hashing'
        ? beforeRead(path.join(directory, 'child'), swap)
        : {
            readdirSync(input, ...args) {
              if (input === directory && boundary === 'before enumeration')
                swap();
              const entries = fs.readdirSync(input, ...args);
              if (input === directory && boundary === 'after enumeration')
                swap();
              return entries;
            },
          };
    assert.throws(
      () => loadRollout('state', overrides).fingerprint(directory),
      /Supplier directory changed while fingerprinting/
    );
    assert.equal(swaps, 1, 'directory swap hook ran once');
  });
}

for (const name of ['package.json', 'bun.lock', 'bun.lockb']) {
  test(`cache manifest ${name} check/read swap retains checked references`, (t) => {
    const root = fixture(t);
    const global = path.join(root, '.bun/install/global');
    fs.mkdirSync(global, { recursive: true });
    const file = path.join(global, name);
    const replacement = path.join(root, 'replacement');
    fs.writeFileSync(file, `${'a'.repeat(64)}.tgz`);
    fs.writeFileSync(replacement, `${'b'.repeat(64)}.tgz`);
    const hook = beforeRead(file, () => replaceWithLink(file, replacement));
    const actual = loadRollout('state', hook).cacheReferences(root, root);
    hook.assertSwapped();
    assert.deepEqual(actual, [
      path.join(root, 'suppliers', `${'a'.repeat(64)}.tgz`),
    ]);
  });
}

test('cache manifest reader follows an existing symlink', (t) => {
  const root = fixture(t);
  const global = path.join(root, '.bun/install/global');
  fs.mkdirSync(global, { recursive: true });
  const target = path.join(root, 'linked-manifest');
  fs.writeFileSync(target, `${'a'.repeat(64)}.tgz`);
  fs.symlinkSync(target, path.join(global, 'package.json'));
  assert.deepEqual(loadRollout('state').cacheReferences(root, root), [
    path.join(root, 'suppliers', `${'a'.repeat(64)}.tgz`),
  ]);
});

test('cache manifest rejects a symlink to a FIFO within the child deadline', (t) => {
  const root = fixture(t);
  const global = path.join(root, '.bun/install/global');
  fs.mkdirSync(global, { recursive: true });
  const fifo = path.join(root, 'fifo');
  cp.execFileSync('mkfifo', [fifo]);
  fs.symlinkSync(fifo, path.join(global, 'package.json'));
  assertChildCompletes(
    `
    const assert = require('node:assert/strict');
    const { loadRollout } = require('./sdk-rollout-test-support');
    assert.throws(
      () => loadRollout('state').cacheReferences(process.argv[1], process.argv[1]),
      /Global package manifest exceeds cache reference bounds/
    );
  `,
    [root]
  );
});
