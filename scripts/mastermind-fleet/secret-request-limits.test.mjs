// Boundaries of one secret request on the machine: the command's
// environment, what "delivered" means, size limits, and pairing expiry
// across the owner-key lock.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { afterEach, test } from 'node:test';
import { childEnv } from './secret-deliver.mjs';
import { EXIT, runPair, runRequest } from './secret-flow.mjs';
import {
  ownerKeys,
  revokeOwnerKey,
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
