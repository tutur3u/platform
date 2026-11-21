import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  BRIDGE_ACK_DOMAIN,
  BRIDGE_ACK_KEY_INFO,
  BRIDGE_DIGEST_KEY_INFO,
  BRIDGE_POKE_TOPICS,
  BRIDGE_REPLY_DOMAIN,
  BRIDGE_SEAL_KEY_INFO,
  BRIDGE_PROTOCOL_VERSION as WEB_VERSION,
  BRIDGE_SUBPROTOCOL as WEB_SUBPROTOCOL,
  bridgeAckSigningString,
  bridgeMachineFrameSchema,
  bridgeReplyEnvelopeSchema,
  bridgeReplySigningString,
} from '../../packages/utils/src/mastermind-store/bridge-protocol.ts';
import {
  ACK_DOMAIN,
  ACK_KEY_INFO,
  ackSigningString,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUBPROTOCOL,
  createLedger,
  DIGEST_KEY_INFO,
  handleReply,
  REPLY_DOMAIN,
  replySigningString,
  RETRY_WINDOW_MS,
  SEAL_KEY_INFO,
  textDigest,
  verifyReply,
} from './bridge-core.mjs';
import {
  ACTOR,
  NOW,
  replyFrame,
  SECRET,
  signedAck,
  tempDir,
  uuid,
} from './bridge-test-fixture.mjs';
import { POKE_TOPICS, readPokes, sendPoke } from './poke.mjs';

function harness(steer) {
  const dir = tempDir();
  const file = path.join(dir, 'bridge-replies.jsonl');
  const calls = [];
  const clock = { now: NOW };
  const deps = {
    secret: SECRET,
    machineId: 'skr-m4',
    ledger: createLedger(file),
    steer: async (input) => {
      calls.push(input);
      return steer ? steer(input) : { delivery: 'steered' };
    },
    now: () => clock.now,
    firstSeen: new Map(),
  };
  return { deps, calls, clock, file, dir };
}

test('matches the Web protocol: version, labels, topics and the signed bytes', () => {
  assert.equal(BRIDGE_PROTOCOL_VERSION, WEB_VERSION);
  assert.equal(BRIDGE_SUBPROTOCOL, WEB_SUBPROTOCOL);
  assert.equal(REPLY_DOMAIN, BRIDGE_REPLY_DOMAIN);
  assert.equal(ACK_DOMAIN, BRIDGE_ACK_DOMAIN);
  assert.equal(SEAL_KEY_INFO, BRIDGE_SEAL_KEY_INFO);
  assert.equal(DIGEST_KEY_INFO, BRIDGE_DIGEST_KEY_INFO);
  assert.equal(ACK_KEY_INFO, BRIDGE_ACK_KEY_INFO);
  assert.deepEqual(POKE_TOPICS, [...BRIDGE_POKE_TOPICS]);
  for (const over of [{}, { environmentId: 'env-2' }]) {
    const { envelope } = replyFrame(7, over);
    assert.equal(bridgeReplyEnvelopeSchema.safeParse(envelope).success, true);
    assert.equal(
      replySigningString(envelope),
      bridgeReplySigningString(envelope)
    );
    const ack = {
      id: envelope.id,
      machineId: envelope.machineId,
      state: 'delivered',
      delivery: 'steered',
      textDigest: envelope.textDigest,
    };
    assert.equal(ackSigningString(ack), bridgeAckSigningString(ack));
  }
  // The audit digest is keyed: the same text hashes differently per secret.
  assert.equal(
    replyFrame(1).envelope.textDigest,
    textDigest(SECRET, 'reply 1')
  );
  assert.notEqual(textDigest(SECRET, 'yes'), textDigest('x'.repeat(40), 'yes'));
});

test('accepts only a reply Web sealed and signed for this machine, intact and in date', () => {
  const check = (frame, now = NOW) =>
    verifyReply(frame, { secret: SECRET, machineId: 'skr-m4', now });
  const good = check(replyFrame(1, { text: 'private words' }));
  assert.equal(good.ok, true);
  assert.equal(good.text, 'private words');
  // The wire frame carries no readable text.
  assert.ok(
    !JSON.stringify(replyFrame(1, { text: 'private words' })).includes(
      'private'
    )
  );
  const tamper = (change) => {
    const frame = replyFrame();
    change(frame);
    return check(frame).code;
  };
  const other = replyFrame(2, { text: 'rm -rf everything' }).envelope;
  for (const change of [
    // Another reply's sealed text, with or without its digest.
    (f) => (f.envelope.box = other.box),
    (f) =>
      Object.assign(f.envelope, {
        box: other.box,
        textDigest: other.textDigest,
      }),
    (f) => (f.envelope.box.data = `${f.envelope.box.data.slice(0, -2)}AA`),
    (f) => (f.envelope.box.extra = 'x'),
    (f) => (f.envelope.threadId = 'thread:other'),
    (f) => (f.envelope.environmentId = 'env-9'),
    (f) => (f.envelope.actorId = uuid(9)),
    (f) => (f.envelope.expiresAt += 1),
    (f) => (f.sig = 'a'.repeat(64)),
    (f) => (f.sig = 'zz'),
    (f) => (f.envelope.text = 'plain text is not a field'),
    (f) => (f.envelope.attachments = ['x']),
    (f) => (f.t = 'command'),
    (f) => (f.v = 2),
  ])
    assert.equal(tamper(change), 'bad_signature');
  // Signed with another secret, or for another machine.
  assert.equal(check(replyFrame(1, {}, 'x'.repeat(40))).code, 'bad_signature');
  assert.equal(
    check(replyFrame(1, { machineId: 'other' })).code,
    'bad_signature'
  );
  // Out of date, from the future, or signed for longer than a day.
  assert.equal(check(replyFrame(), NOW + 60_000).code, 'expired');
  assert.equal(
    check(
      replyFrame(1, {
        issuedAt: NOW + 10 * 60_000,
        expiresAt: NOW + 11 * 60_000,
      })
    ).code,
    'expired'
  );
  assert.equal(
    check(replyFrame(1, { expiresAt: NOW + 25 * 60 * 60_000 })).code,
    'expired'
  );
  // Correctly sealed and signed, but not an acceptable message.
  for (const text of ['   ', 'x'.repeat(4001)])
    assert.equal(check(replyFrame(1, { text })).code, 'bad_signature');
  assert.deepEqual(check({ v: 1, t: 'reply' }), {
    ok: false,
    code: 'bad_signature',
  });
});

test('delivers once with the reply id as the idempotency key and records no text', async () => {
  const { deps, calls, file } = harness();
  const frame = replyFrame(1, {
    environmentId: 'env-2',
    text: 'private words',
  });
  const ack = await handleReply(frame, deps);
  // Signed by this machine, so Web can tell it from anything the store says.
  assert.deepEqual(
    ack,
    signedAck(frame, { state: 'delivered', delivery: 'steered' })
  );
  assert.equal(bridgeMachineFrameSchema.safeParse(ack).success, true);
  assert.deepEqual(calls, [
    {
      threadId: 'thread:project:mcp%3Aabc:1',
      message: 'private words',
      clientRequestId: `mm-reply:${uuid(1)}`,
      environmentId: 'env-2',
    },
  ]);
  const stored = fs.readFileSync(file, 'utf8');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(!stored.includes('private words'));
  assert.deepEqual(JSON.parse(stored), {
    id: uuid(1),
    at: new Date(NOW).toISOString(),
    actorId: ACTOR,
    threadId: 'thread:project:mcp%3Aabc:1',
    environmentId: 'env-2',
    digest: frame.envelope.textDigest,
    state: 'delivered',
    delivery: 'steered',
  });
});

test('answers a replay from the ledger without sending again, even after a restart', async () => {
  const { deps, calls, file } = harness();
  const frame = replyFrame(1);
  const first = await handleReply(frame, deps);
  assert.deepEqual(await handleReply(replyFrame(1), deps), first);
  const restarted = { ...deps, ledger: createLedger(file) };
  assert.deepEqual(await handleReply(replyFrame(1), restarted), first);
  assert.equal(calls.length, 1);
  // The same id with other words, or another target, was never delivered
  // under that id.
  for (const over of [{ text: 'other' }, { environmentId: 'env-9' }]) {
    const changed = replyFrame(1, over);
    assert.deepEqual(
      await handleReply(changed, restarted),
      signedAck(changed, { state: 'failed', code: 'bad_signature' })
    );
  }
  assert.equal(calls.length, 1);
});

test('refuses a forged reply without touching T3 or the ledger', async () => {
  const { deps, calls, file } = harness();
  const forged = replyFrame(1);
  forged.envelope.threadId = 'thread:somewhere-else';
  assert.deepEqual(
    await handleReply(forged, deps),
    signedAck(forged, { state: 'failed', code: 'bad_signature' })
  );
  assert.equal(
    await handleReply({ v: 1, t: 'reply', envelope: {} }, deps),
    null
  );
  assert.equal(calls.length, 0);
  assert.equal(fs.existsSync(file), false);
});

test('reports a thread T3 refuses with a closed code', async () => {
  const refuse = (detail) => () => {
    throw Object.assign(new Error('t3_tool_error'), {
      code: 't3_tool_error',
      detail,
    });
  };
  for (const [detail, code] of [
    ['Thread thread:x was not found.', 'unknown_thread'],
    ['Thread thread:x does not exist.', 'unknown_thread'],
    ['Thread is archived and cannot receive messages.', 'thread_refused'],
    // Something else that is missing is not a missing thread.
    ['Provider session not found. Try again.', 'thread_refused'],
  ]) {
    const { deps } = harness(refuse(detail));
    const ack = await handleReply(replyFrame(1), deps);
    assert.equal(ack.code, code, detail);
    assert.equal(bridgeMachineFrameSchema.safeParse(ack).success, true);
  }
});

test('keeps a reply pending while the local server is away, then gives up truthfully', async () => {
  let up = false;
  const { deps, calls, clock } = harness(() => {
    if (!up) throw Object.assign(new Error('x'), { code: 't3_not_running' });
    return { delivery: 'started' };
  });
  const long = { expiresAt: NOW + 3_600_000 };
  assert.equal(await handleReply(replyFrame(1, long), deps), null);
  assert.equal(deps.firstSeen.size, 1);
  clock.now += 60_000;
  assert.equal(await handleReply(replyFrame(1, long), deps), null);
  up = true;
  assert.equal(
    (await handleReply(replyFrame(1, long), deps)).delivery,
    'started'
  );
  assert.equal(calls.length, 3);
  assert.equal(deps.firstSeen.size, 0);

  up = false;
  const frame = replyFrame(2, long);
  assert.equal(await handleReply(frame, deps), null);
  clock.now += RETRY_WINDOW_MS;
  assert.deepEqual(
    await handleReply(frame, deps),
    signedAck(frame, { state: 'failed', code: 'unavailable' })
  );
});

test('reports an interrupted send found in the thread as delivered without a manner', async () => {
  const { deps } = harness(() => ({ delivery: 'delivered' }));
  const frame = replyFrame(1);
  const ack = await handleReply(frame, deps);
  assert.deepEqual(ack, signedAck(frame, { state: 'delivered' }));
  assert.equal(bridgeMachineFrameSchema.safeParse(ack).success, true);
});

test('limits deliveries per thread per minute on the machine too', async () => {
  const { deps, calls } = harness();
  const hot = { threadId: 'thread:hot' };
  for (let n = 1; n <= 6; n++)
    assert.equal(
      (await handleReply(replyFrame(n, hot), deps)).state,
      'delivered'
    );
  const seventh = replyFrame(7, hot);
  assert.deepEqual(
    await handleReply(seventh, deps),
    signedAck(seventh, { state: 'failed', code: 'rate_limited' })
  );
  assert.equal((await handleReply(replyFrame(8), deps)).state, 'delivered');
  assert.equal(calls.length, 7);
});

test('pokes carry a topic and a revision only, and bad ones are dropped', () => {
  const dir = path.join(tempDir(), 'pokes');
  assert.equal(
    sendPoke(
      { topic: 'usage', revision: 5, observedAt: '2026-11-21T05:00:00Z' },
      { dir }
    ),
    true
  );
  assert.equal(sendPoke({ topic: 'usage', revision: 6 }, { dir }), true);
  assert.equal(
    sendPoke(
      {
        topic: 'state',
        revision: 2,
        observedAt: '2026-11-21T05:00:00Z',
        email: 'a@b.c',
      },
      { dir }
    ),
    true
  );
  for (const bad of [
    { topic: 'secrets', revision: 1 },
    { topic: 'usage', revision: -1 },
    { topic: 'usage', revision: 1.5 },
    { topic: 'usage', revision: 1, observedAt: 'yesterday' },
  ])
    assert.equal(sendPoke(bad, { dir }), false);
  const pokes = readPokes(dir);
  assert.deepEqual(
    pokes.map((poke) => [poke.topic, poke.revision, Object.keys(poke).length]),
    [
      ['state', 2, 3],
      ['usage', 6, 3],
    ]
  );
  assert.equal(fs.statSync(path.join(dir, 'usage.json')).mode & 0o777, 0o600);
  fs.writeFileSync(
    path.join(dir, 'threads.json'),
    '{"topic":"usage","revision":9,"observedAt":"2026-11-21T05:00:00Z"}'
  );
  assert.equal(readPokes(dir).length, 2);
  for (const poke of pokes)
    assert.equal(
      bridgeMachineFrameSchema.safeParse({ v: 1, t: 'poke', ...poke }).success,
      true
    );
});
