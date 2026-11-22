// Boundaries of one secret request on the machine: the command's
// environment, what "delivered" means, size limits, and pairing expiry
// across the owner-key lock.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, test } from 'node:test';
import { childEnv, deliver } from './secret-deliver.mjs';
import { EXIT, runPair, runRequest } from './secret-flow.mjs';
import {
  machineKey,
  ownerKeys,
  revokeOwnerKey,
  spoolFiles,
  withOwnerKeysLock,
} from './secret-machine.mjs';
import { ownerMac, pairingKey, parsePairingCode } from './secret-pairing.mjs';
import { b64url, ownerKeyId } from './secret-protocol.mjs';
import {
  makeWorld,
  openDecision,
  resolved,
  signedAnswer,
  writeSpool,
} from './secret-test-world.mjs';

let world;
afterEach(() => world?.cleanup());

const node = (script) => [process.execPath, '-e', script];

function worldWith(operations) {
  world = makeWorld();
  world.writeOperations(operations);
  return world;
}

const start = (operationId, overrides = {}) =>
  runRequest({
    paths: world.paths,
    operationId,
    checkPlatform: () => world.helper,
    pollMs: 10,
    print: () => {},
    ...overrides,
  });

async function answer(run) {
  const { secret } = await openDecision(world.paths);
  const { mode: _m, sig: _s, ...request } = secret;
  writeSpool(
    world.paths,
    request.requestId,
    1,
    signedAnswer(request, world.owner)
  );
  return { request, exit: await run };
}

test('the command environment comes from the OS account and the operation only', async () => {
  const requester = {
    HOME: '/tmp/requester-home',
    LANG: 'requester-locale',
    SSH_AUTH_SOCK: '/tmp/requester-agent.sock',
    LD_PRELOAD: '/tmp/requester.so',
  };
  const saved = Object.fromEntries(
    Object.keys(requester).map((name) => [name, process.env[name]])
  );
  Object.assign(process.env, requester);
  try {
    worldWith({});
    const dump = `require('fs').readFileSync(0); require('fs').writeFileSync(${JSON.stringify(world.received)}, JSON.stringify(process.env))`;
    world.writeOperations({
      plain: { purpose: 'Env', argv: node(dump), delivery: 'stdin' },
      agent: {
        purpose: 'Env with agent',
        argv: node(dump),
        delivery: 'stdin',
        sshAuthSock: '/tmp/owner-agent.sock',
      },
    });
    const account = os.userInfo();
    const expected = {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      HOME: account.homedir,
      USER: account.username,
      LOGNAME: account.username,
      LANG: 'en_US.UTF-8',
    };
    assert.equal((await answer(start('plain'))).exit, EXIT.ok);
    const plain = JSON.parse(fs.readFileSync(world.received, 'utf8'));
    for (const [name, value] of Object.entries(expected))
      assert.equal(plain[name], value, name);
    for (const name of ['SSH_AUTH_SOCK', 'LD_PRELOAD'])
      assert.equal(plain[name], undefined, name);
    assert.equal((await answer(start('agent'))).exit, EXIT.ok);
    const withAgent = JSON.parse(fs.readFileSync(world.received, 'utf8'));
    assert.equal(withAgent.SSH_AUTH_SOCK, '/tmp/owner-agent.sock');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  assert.deepEqual(childEnv({}, { homedir: '/Users/o', username: 'o' }), {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: '/Users/o',
    USER: 'o',
    LOGNAME: 'o',
    LANG: 'en_US.UTF-8',
  });
});

test('an operation with a relative or malformed SSH agent path is refused', async () => {
  worldWith({
    relative: {
      purpose: 'Bad agent',
      argv: node('0'),
      delivery: 'stdin',
      sshAuthSock: 'agent.sock',
    },
  });
  await assert.rejects(start('relative'), /secret_operation_ssh_agent/);
  assert.deepEqual(fs.readdirSync(world.paths.openDir), []);
});

test('"delivered" means written to the input pipe, even when the command never reads it', async () => {
  worldWith({
    ignore: {
      purpose: 'Ignores its input',
      argv: node('setTimeout(() => {}, 50)'),
      delivery: 'stdin',
    },
  });
  const { request, exit } = await answer(start('ignore'));
  assert.equal(exit, EXIT.ok);
  const record = resolved(world.paths, request.requestId);
  assert.equal(record.secretOutcome.outcome, 'delivered');
  assert.equal(record.outcome, 'Written to command');
});

test('a command over 8,192 UTF-8 bytes is refused before asking', async () => {
  worldWith({
    args: {
      purpose: 'Takes arguments',
      argv: node('0'),
      delivery: 'stdin',
      extraArgs: true,
    },
  });
  // 4,000 UTF-16 units but 12,000 UTF-8 bytes.
  const extra = Array.from({ length: 20 }, () => 'ậ'.repeat(200));
  await assert.rejects(start('args', { extra }), /secret_operation_args/);
  assert.deepEqual(fs.readdirSync(world.paths.openDir), []);
});

test('a pairing proof that gets the owner-key lock after expiry enrolls nothing', async () => {
  world = makeWorld();
  withOwnerKeysLock(world.paths, () =>
    revokeOwnerKey(world.paths, ownerKeyId(world.ownerRaw))
  );
  const printed = [];
  let deadline = Number.POSITIVE_INFINITY;
  let armed = false;
  let reads = 0;
  // Once armed, the poll's own reading is still in time and every later
  // one (inside the lock) is at the deadline.
  const now = () => (armed && ++reads > 1 ? deadline : Date.now());
  const run = runPair({
    paths: world.paths,
    checkPlatform: () => world.helper,
    pollMs: 10,
    now,
    print: (line) => printed.push(line),
  });
  const decision = await openDecision(world.paths, 'pair-');
  const code = printed.find((l) => l.startsWith('Pairing code: ')).slice(14);
  const { mode: _m, v: _v, machineMac: _mac, ...fields } = decision.secret;
  deadline = Date.parse(fields.expiresAt);
  const key = pairingKey(parsePairingCode(code), fields.pairingId);
  const ownerKey = b64url(world.ownerRaw);
  writeSpool(world.paths, decision.id, 1, {
    action: 'pair',
    pair: {
      ownerKey,
      ownerMac: b64url(ownerMac(key, { ...fields, ownerKey })),
    },
  });
  armed = true;
  assert.equal(await run, EXIT.expired);
  assert.deepEqual(ownerKeys(world.paths), []);
  assert.equal(
    resolved(world.paths, decision.id).secretOutcome.outcome,
    'expired'
  );
});

test('a write the command pipe refuses is not delivered', async () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
      },
    }),
    kill() {},
  });
  const run = deliver(
    { argv: ['/usr/bin/true'], delivery: 'stdin', output: 'withheld' },
    Buffer.from('disposable'),
    { spawn: () => child }
  );
  assert.equal(await run.delivered, false);
});

/** Holds the owner-key lock as another process would, until released. */
function holdLock(paths) {
  fs.mkdirSync(path.dirname(paths.ownerKeysLock), { recursive: true });
  fs.mkdirSync(paths.ownerKeysLock);
  return () => fs.rmdirSync(paths.ownerKeysLock);
}

/** Resolves once the flow has taken the spool file and waits for the lock. */
async function pickedUp(paths, id) {
  while (spoolFiles(paths, id).length)
    await new Promise((resolve) => setTimeout(resolve, 5));
  await new Promise((resolve) => setTimeout(resolve, 80));
}

/** A request whose valid answer is stuck behind a held owner-key lock. */
async function answerBehindLock(overrides) {
  world = makeWorld();
  const run = start('test-stdin', overrides);
  const { secret } = await openDecision(world.paths);
  const { mode: _m, sig: _s, ...request } = secret;
  const release = holdLock(world.paths);
  writeSpool(
    world.paths,
    request.requestId,
    1,
    signedAnswer(request, world.owner)
  );
  await pickedUp(world.paths, request.requestId);
  return { run, request, release };
}

test('a cancel while a valid answer waits for a lock that stays held withdraws the request', async () => {
  const controller = new AbortController();
  const { run, request, release } = await answerBehindLock({
    signal: controller.signal,
  });
  try {
    controller.abort();
    assert.equal(await run, EXIT.cancelled);
  } finally {
    release();
  }
  assert.equal(fs.existsSync(world.received), false);
  assert.equal(
    resolved(world.paths, request.requestId).secretOutcome.outcome,
    'cancelled'
  );
  assert.deepEqual(fs.readdirSync(world.paths.openDir), []);
});

test('expiry while a valid answer waits for a lock that stays held expires the request', async () => {
  let clock = null;
  const { run, request, release } = await answerBehindLock({
    now: () => clock ?? Date.now(),
  });
  try {
    clock = Date.parse(request.expiresAt);
    assert.equal(await run, EXIT.expired);
  } finally {
    release();
  }
  assert.equal(fs.existsSync(world.received), false);
  assert.equal(
    resolved(world.paths, request.requestId).secretOutcome.outcome,
    'expired'
  );
  assert.deepEqual(fs.readdirSync(world.paths.openDir), []);
});

test('a cancel while a pairing proof waits for the lock enrolls nothing once the lock frees', async () => {
  world = makeWorld();
  withOwnerKeysLock(world.paths, () =>
    revokeOwnerKey(world.paths, ownerKeyId(world.ownerRaw))
  );
  const printed = [];
  const controller = new AbortController();
  const run = runPair({
    paths: world.paths,
    checkPlatform: () => world.helper,
    pollMs: 10,
    signal: controller.signal,
    print: (line) => printed.push(line),
  });
  const decision = await openDecision(world.paths, 'pair-');
  const code = printed.find((l) => l.startsWith('Pairing code: ')).slice(14);
  const { mode: _m, v: _v, machineMac: _mac, ...fields } = decision.secret;
  const key = pairingKey(parsePairingCode(code), fields.pairingId);
  const ownerKey = b64url(world.ownerRaw);
  const release = holdLock(world.paths);
  writeSpool(world.paths, decision.id, 1, {
    action: 'pair',
    pair: {
      ownerKey,
      ownerMac: b64url(ownerMac(key, { ...fields, ownerKey })),
    },
  });
  await pickedUp(world.paths, decision.id);
  controller.abort();
  release();
  assert.equal(await run, EXIT.cancelled);
  assert.deepEqual(ownerKeys(world.paths), []);
});

test('creating the machine key never replaces what already sits at its path', () => {
  world = makeWorld();
  const file = world.paths.machineKeyFile;
  const existing = fs.readFileSync(file, 'utf8');
  // A key file open to other users is refused, and kept as it is.
  fs.chmodSync(file, 0o644);
  assert.throws(
    () => machineKey(world.paths, { create: true }),
    /secret_machine_key/
  );
  assert.equal(fs.readFileSync(file, 'utf8'), existing);
  // A symlink is not followed and its target is not written.
  const target = path.join(world.home, 'elsewhere.txt');
  fs.writeFileSync(target, 'untouched');
  fs.rmSync(file);
  fs.symlinkSync(target, file);
  assert.throws(
    () => machineKey(world.paths, { create: true }),
    /secret_machine_key/
  );
  assert.equal(fs.readFileSync(target, 'utf8'), 'untouched');
  assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
  // With nothing there, one exclusive create makes a 0600 key that reads back.
  fs.rmSync(file);
  const made = machineKey(world.paths, { create: true });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(machineKey(world.paths).publicKey, made.publicKey);
});
