const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { worker } = require('./sdk-rollout-engine');
const { parseIdentity } = require('./sdk-rollout-identity');

const backend = { linux: 'linux-proc-v1', darwin: 'darwin-libproc-v1' }[
  process.platform
];
const skip = !backend && 'process identity backends cover Linux and macOS';
const start = (birth) => ({
  backend,
  host: 'host-a',
  boot: 'boot-a',
  namespace: 'namespace-a',
  birth,
});
const receipt = (pid, birth) =>
  JSON.stringify({ pid, ownershipVersion: 1, pidStart: start(birth) });
const read = (file) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;

// capable.before/after: whether the supplier ships the identity module before
// and after installation. identity(pid, call) overrides the self receipt.
function fixture(t, capable, identity = (pid) => receipt(pid, 'worker')) {
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rollout-identity-'));
  t.after(() => fs.rmSync(userHome, { recursive: true, force: true }));
  const home = path.join(userHome, '.tuturuuu/resources');
  const root = path.join(userHome, '.bun/install/global/node_modules/tuturuuu');
  const bin = path.join(userHome, '.bun/bin');
  const module = path.join(root, 'dist/cli/resources-process-identity.js');
  for (const directory of [home, bin, path.join(root, 'bin')])
    fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.join(root, 'dist/cli'), { recursive: true });
  fs.mkdirSync(path.join(home, 'bin'));
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  const manifest = (version, build) => ({
    name: 'tuturuuu',
    version,
    ...(build ? { tuturuuuBuild: { channel: 'dev', rolloutProtocol: 1 } } : {}),
    bin: { ttr: './bin/ttr.cjs' },
  });
  write(path.join(root, 'package.json'), manifest('0.28.0'));
  fs.writeFileSync(path.join(root, 'bin/ttr.cjs'), 'old supplier');
  fs.writeFileSync(path.join(root, 'dist/cli/resources-entry.js'), 'entry');
  if (capable.before) fs.writeFileSync(module, 'identity');
  for (const name of ['ttr', 'tuturuuu', 'tutur3u'])
    fs.symlinkSync(path.join(root, 'bin/ttr.cjs'), path.join(bin, name));
  const config = {
    version: 1,
    enabled: true,
    roots: [userHome],
    repositories: [userHome],
    turboConcurrency: 1,
    vitestWorkers: 2,
    buildJobs: 3,
  };
  write(path.join(home, 'config.json'), config);
  write(path.join(home, 'install.json'), { shims: ['bun'], shellFiles: [] });
  fs.writeFileSync(path.join(home, 'bin/bun'), 'shim');
  const tarball = path.join(userHome, 'candidate.tgz');
  fs.writeFileSync(tarball, 'verified fixture bytes');
  const sha256 = crypto
    .createHash('sha256')
    .update('verified fixture bytes')
    .digest('hex');
  const admission = path.join(home, 'admission/owner.json');
  const seen = { calls: [], inspected: [], identity: 0 };
  let nextChild = 900_000;
  // Mirrors run(): onSpawn must succeed before the gated launcher executes.
  const invoke = async (_command, args, settings = {}) => {
    const child = ++nextChild;
    settings.onSpawn?.(child);
    seen.calls.push({ args, owner: read(admission), child });
    if (args[1] === 'identity')
      return identity(Number(args[3]), seen.identity++);
    if (args[0] === 'add') {
      write(
        path.join(root, 'package.json'),
        manifest('0.29.0-dev.1.abcdef0', true)
      );
      fs.writeFileSync(path.join(root, 'bin/ttr.cjs'), 'new supplier');
      if (capable.after) fs.writeFileSync(module, 'identity');
      else fs.rmSync(module, { force: true });
    }
    if (args[1] === 'setup')
      return JSON.stringify({
        entry: path.join(root, 'dist/cli/resources-entry.js'),
      });
    if (args[1] === 'run' && args.at(-1) === 'true')
      seen.slot = read(path.join(home, 'slots/0/owner.json'));
    return '';
  };
  const inspect = (command, args, settings) => {
    assert.equal(command, path.join(bin, 'ttr'));
    assert.equal(settings.env.PATH.startsWith(bin), true);
    seen.inspected.push(Number(args[3]));
    return receipt(Number(args[3]), `child-${args[3]}`);
  };
  const run = (dependencies = {}) =>
    worker(
      {
        tarball,
        sha256,
        version: '0.29.0-dev.1.abcdef0',
        waitDrain: 0,
      },
      { userHome, env: {}, run: invoke, inspect, ...dependencies }
    );
  return { home, root, seen, run, admission };
}
const call = (seen, name) =>
  seen.calls.find((entry) => entry.args.includes(name));
const setupCall = (seen) =>
  seen.calls.find(
    (entry) => entry.args[1] === 'setup' && !entry.args.includes('--dry-run')
  );

test('identity receipts are strict about fields, bounds, backend and PID', {
  skip,
}, () => {
  const valid = JSON.parse(receipt(42, 'birth'));
  assert.deepEqual(parseIdentity(JSON.stringify(valid), 42), valid);
  for (const [output, pid] of [
    ['not json', 42],
    [JSON.stringify(valid), 43],
    [JSON.stringify(valid), 0],
    [JSON.stringify({ ...valid, pid: '42' }), 42],
    [JSON.stringify({ ...valid, extra: true }), 42],
    [JSON.stringify({ ...valid, ownershipVersion: 2 }), 42],
    [JSON.stringify({ pid: 42, ownershipVersion: 1 }), 42],
    [JSON.stringify({ ...valid, pidStart: { ...valid.pidStart, x: 'y' } }), 42],
    [
      JSON.stringify({ ...valid, pidStart: { ...valid.pidStart, host: '' } }),
      42,
    ],
    [
      JSON.stringify({
        ...valid,
        pidStart: { ...valid.pidStart, boot: 'b'.repeat(257) },
      }),
      42,
    ],
    [
      JSON.stringify({
        ...valid,
        pidStart: {
          ...valid.pidStart,
          backend:
            backend === 'linux-proc-v1' ? 'darwin-libproc-v1' : 'linux-proc-v1',
        },
      }),
      42,
    ],
    [
      JSON.stringify({ ...valid, pidStart: { ...valid.pidStart, birth: 7 } }),
      42,
    ],
  ])
    assert.throws(() => parseIdentity(output, pid), /not bound/);
});

test('an identity-capable target binds this worker before setup and qualification', {
  skip,
}, async (t) => {
  const f = fixture(t, { before: false, after: true });
  const result = await f.run();
  assert.equal(result.status, 'qualified');
  const install = call(f.seen, 'add');
  const probe = call(f.seen, 'identity');
  // The legacy supplier is never asked; the installed supplier is asked about
  // this live worker only.
  assert.ok(f.seen.calls.indexOf(probe) > f.seen.calls.indexOf(install));
  assert.equal(
    f.seen.calls.filter((entry) => entry.args[1] === 'identity').length,
    1
  );
  assert.equal(probe.args[3], String(process.pid));
  assert.equal(install.owner.ownershipVersion, undefined);
  const owner = setupCall(f.seen).owner;
  const { childPid, childStart, ownershipVersion, pidStart, ...metadata } =
    owner;
  const { childPid: _old, ...previous } = install.owner;
  assert.deepEqual(metadata, previous);
  assert.equal(ownershipVersion, 1);
  assert.deepEqual(pidStart, start('worker'));
  assert.equal(childPid, setupCall(f.seen).child);
  assert.deepEqual(childStart, start(`child-${childPid}`));
  assert.ok(f.seen.inspected.includes(childPid));
  assert.equal(f.seen.slot.ownershipVersion, 1);
  assert.equal(f.seen.slot.token, owner.token);
  assert.deepEqual(f.seen.slot.pidStart, pidStart);
  assert.equal(f.seen.slot.childPid, undefined);
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
});

test('a refused identity capture closes setup and restores the supplier', {
  skip,
}, async (t) => {
  for (const identity of [
    () => 'not json',
    (pid) => receipt(pid + 1, 'worker'),
    (pid) =>
      JSON.stringify({ ...JSON.parse(receipt(pid, 'worker')), extra: 1 }),
    () => {
      throw new Error('ttr failed (1)');
    },
  ]) {
    const f = fixture(t, { before: false, after: true }, identity);
    const result = await f.run();
    assert.equal(result.status, 'failed');
    assert.equal(result.rollback, 'restored');
    assert.equal(call(f.seen, 'setup'), undefined);
    assert.equal(call(f.seen, 'run'), undefined);
    assert.equal(fs.existsSync(path.join(f.home, 'slots/0')), false);
    assert.equal(read(path.join(f.root, 'package.json')).version, '0.28.0');
  }
  const f = fixture(t, { before: false, after: true });
  const result = await f.run({
    inspect: () => {
      throw new Error('inspection failed');
    },
  });
  assert.equal(result.rollback, 'restored');
  assert.equal(call(f.seen, 'setup'), undefined);
});

test('a legacy target keeps the unversioned owner and never asks for identity', {
  skip,
}, async (t) => {
  const f = fixture(t, { before: false, after: false });
  const result = await f.run();
  assert.equal(result.status, 'qualified');
  assert.equal(call(f.seen, 'identity'), undefined);
  assert.deepEqual(f.seen.inspected, []);
  const owner = setupCall(f.seen).owner;
  assert.equal(owner.childPid, setupCall(f.seen).child);
  for (const key of ['ownershipVersion', 'pidStart', 'childStart']) {
    assert.equal(owner[key], undefined);
    assert.equal(f.seen.slot[key], undefined);
  }
});

test('an identity-capable current supplier binds the lease from creation', {
  skip,
}, async (t) => {
  const f = fixture(t, { before: true, after: true });
  const result = await f.run();
  assert.equal(result.status, 'qualified');
  const install = call(f.seen, 'add');
  assert.equal(install.owner.ownershipVersion, 1);
  assert.deepEqual(install.owner.pidStart, start('worker'));
  assert.deepEqual(install.owner.childStart, start(`child-${install.child}`));
  assert.deepEqual(f.seen.slot.pidStart, start('worker'));

  const changed = fixture(t, { before: true, after: true }, (pid, index) =>
    receipt(pid, index ? 'other-birth' : 'worker')
  );
  const drift = await changed.run();
  assert.equal(drift.rollback, 'restored');
  assert.match(drift.error, /identity changed/);
  assert.equal(call(changed.seen, 'setup'), undefined);

  const downgrade = fixture(t, { before: true, after: false });
  const refused = await downgrade.run();
  assert.equal(refused.rollback, 'restored');
  assert.match(refused.error, /cannot verify/);
  assert.equal(call(downgrade.seen, 'setup'), undefined);
});

test('a failed capture under a capable supplier never takes the lease', {
  skip,
}, async (t) => {
  const f = fixture(t, { before: true, after: true }, () => 'not json');
  await assert.rejects(f.run(), /not bound/);
  assert.equal(call(f.seen, 'add'), undefined);
  assert.equal(fs.existsSync(path.join(f.home, 'admission')), false);
});
