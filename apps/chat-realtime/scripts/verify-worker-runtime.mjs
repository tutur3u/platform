import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';
import {
  ALICE,
  BOB,
  CONVERSATION,
  messageEvent,
  openSocket,
  publish,
  SECRET,
  subscribeTicket,
  WS,
} from './runtime-client.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
let server;
const conversationTicket = (userId, extra = {}) =>
  subscribeTicket({
    conversationId: CONVERSATION,
    room: 'conversation',
    userId,
    ...extra,
  });

before(async () => {
  server = await startCfViteWorker({
    mode: 'source',
    root,
    secrets: {
      CHAT_REALTIME_STOPPED: 'false',
      CHAT_REALTIME_TOKEN_SECRET: SECRET,
    },
  });
});
after(() => server?.close());

test('rejects missing, wrong-kind and non-upgrade connects', async () => {
  const health = await server.fetch('/health');
  assert.deepEqual(await health.json(), { ok: true, stopped: false });
  assert.equal((await server.fetch('/v1/connect')).status, 426);
  const noTicket = new WebSocket(
    new URL('/v1/connect', server.origin.replace(/^http/u, 'ws')),
    ['tuturuuu.chat.v1']
  );
  const outcome = await new Promise((resolve) => {
    noTicket.addEventListener('open', () => resolve('open'));
    noTicket.addEventListener('error', () => resolve('error'));
  });
  assert.equal(outcome, 'error', 'a connect without a ticket never opens');
  await assert.rejects(
    openSocket(server.origin, 'forged.ticket'),
    'a forged ticket never opens'
  );
});

test('fans out persisted events by audience with ordered sequence numbers', async () => {
  const aliceInbox = await openSocket(
    server.origin,
    await subscribeTicket({ userId: ALICE })
  );
  const bobInbox = await openSocket(
    server.origin,
    await subscribeTicket({ userId: BOB })
  );
  await aliceInbox.next((f) => f.t === 'online' && f.userId === BOB && f.on);

  const alice = await openSocket(
    server.origin,
    await conversationTicket(ALICE)
  );
  const bob = await openSocket(server.origin, await conversationTicket(BOB));
  await alice.next(
    (f) => f.t === 'presence' && f.userId === BOB && f.state === 'foreground'
  );

  const response = await publish(server, messageEvent('message.created'));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.seq, 1);
  assert.deepEqual([...result.foregroundUserIds].sort(), [ALICE, BOB]);
  for (const client of [alice, bob]) {
    const frame = await client.next((f) => f.t === 'event');
    assert.equal(frame.seq, 1);
    assert.equal(frame.event.type, 'message.created');
  }
  await bobInbox.next(
    (f) => f.t === 'event' && f.event.type === 'message.created'
  );

  // An event for Alice only never reaches Bob's sockets.
  const privateEvent = messageEvent('read.updated', {
    audience: { scope: 'users', userIds: [ALICE] },
    lastReadAt: new Date().toISOString(),
    userId: ALICE,
  });
  delete privateEvent.message;
  assert.equal((await publish(server, privateEvent)).status, 200);
  await alice.next((f) => f.t === 'event' && f.seq === 2);
  assert.equal(
    (await publish(server, messageEvent('message.updated'))).status,
    200
  );
  await bob.next((f) => f.t === 'event' && f.seq === 3);
  assert.equal(
    bob.frames.some((f) => f.seq === 2),
    false
  );
  assert.equal(
    bobInbox.frames.some((f) => f.event?.type === 'read.updated'),
    false
  );

  // Typing reaches others only; background presence leaves push enabled.
  alice.send({ on: true, t: 'typing' });
  await bob.next((f) => f.t === 'typing' && f.userId === ALICE && f.on);
  bob.send({ state: 'background', t: 'presence' });
  await alice.next(
    (f) => f.t === 'presence' && f.userId === BOB && f.state === 'background'
  );
  const after = await (
    await publish(server, messageEvent('message.created'))
  ).json();
  assert.deepEqual(after.foregroundUserIds, [ALICE]);
  assert.equal(
    alice.frames.some((f) => f.t === 'typing'),
    false
  );

  for (const client of [alice, bob, aliceInbox, bobInbox]) client.close();
});

test('replays the gap after reconnect and asks for resync beyond it', async () => {
  const replay = await openSocket(
    server.origin,
    await conversationTicket(ALICE),
    { since: 1 }
  );
  const ready = replay.frames.find((f) => f.t === 'ready');
  const replayed = await replay.next(
    (f) => f.t === 'event' && f.seq === ready.seq
  );
  assert.ok(replayed);
  assert.deepEqual(
    replay.frames.filter((f) => f.t === 'event').map((f) => f.seq),
    Array.from({ length: ready.seq - 1 }, (_, index) => index + 2)
  );
  replay.close();

  const ahead = await openSocket(
    server.origin,
    await conversationTicket(ALICE),
    { since: 999 }
  );
  await ahead.next((f) => f.t === 'resync');
  ahead.close();
});

test('authenticates and bounds publishes', async () => {
  const event = messageEvent('message.created');
  assert.equal(
    (await publish(server, event, { kind: 'subscribe' })).status,
    401
  );
  assert.equal(
    (await publish(server, event, { ticketBody: '{}' })).status,
    401
  );
  assert.equal(
    (
      await publish(server, {
        ...event,
        wsId: '00000000-0000-4000-8000-0000000000a2',
      })
    ).status,
    400
  );
  assert.equal((await publish(server, { ...event, type: 'nope' })).status, 400);
  const huge = { ...event, message: { content: 'x'.repeat(70 * 1024) } };
  assert.equal((await publish(server, huge)).status, 413);
});

test('closes rate-limited, oversized, removed and expired sockets', async () => {
  const spammer = await openSocket(
    server.origin,
    await conversationTicket(BOB)
  );
  for (let index = 0; index < 25; index += 1)
    spammer.send({ on: true, t: 'typing' });
  assert.equal((await spammer.closed).code, 1008);

  const big = await openSocket(server.origin, await conversationTicket(BOB));
  big.socket.send(JSON.stringify({ pad: 'x'.repeat(4096), t: 'typing' }));
  assert.equal((await big.closed).code, 1009);

  const removed = await openSocket(
    server.origin,
    await conversationTicket(BOB)
  );
  const removal = messageEvent('member.removed', { userId: BOB });
  delete removal.message;
  assert.equal((await publish(server, removal)).status, 200);
  assert.equal((await removed.closed).code, 4003);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiring = await openSocket(
    server.origin,
    await conversationTicket(ALICE, {
      exp: nowSeconds + 2,
      iat: nowSeconds - 60,
    })
  );
  await sleep(2500);
  await publish(server, messageEvent('message.created'));
  await expiring.next((f) => f.t === 'expired');
  assert.equal((await expiring.closed).code, 4001);
});

test('caps sockets per user per room', async () => {
  const sockets = [];
  for (let index = 0; index < 6; index += 1) {
    sockets.push(
      await openSocket(server.origin, await subscribeTicket({ userId: ALICE }))
    );
  }
  assert.equal((await sockets[0].closed).code, 1008);
  for (const socket of sockets.slice(1)) socket.close();
});

test('keeps the frame log bounded and the sequence durable across restart', async () => {
  let last = 0;
  for (let index = 0; index < 205; index += 1) {
    last = (
      await (await publish(server, messageEvent('message.updated'))).json()
    ).seq;
  }
  const [{ frames }] = await server.durableObjectSql(
    'ChatConversationRoom',
    `${WS}:${CONVERSATION}`,
    'SELECT COUNT(*) AS frames FROM frames'
  );
  assert.ok(frames <= 200, `stored ${frames} frames`);

  await server.restart();
  const resumed = await openSocket(
    server.origin,
    await conversationTicket(ALICE),
    { since: last }
  );
  assert.equal(resumed.frames.find((f) => f.t === 'ready').seq, last);
  await sleep(200);
  assert.equal(
    resumed.frames.some((f) => f.t === 'resync' || f.t === 'event'),
    false
  );
  resumed.close();
});

test('the stop fence rejects connects and publishes and closes open sockets', async () => {
  const open = await openSocket(server.origin, await conversationTicket(ALICE));
  await server.close();
  server = await startCfViteWorker({
    mode: 'source',
    root,
    secrets: {
      CHAT_REALTIME_STOPPED: 'true',
      CHAT_REALTIME_TOKEN_SECRET: SECRET,
    },
  });
  // The old runtime is gone, so its socket closes; the stopped one refuses work.
  await open.closed;
  assert.deepEqual(await (await server.fetch('/health')).json(), {
    ok: true,
    stopped: true,
  });
  assert.equal(
    (await publish(server, messageEvent('message.created'))).status,
    503
  );
  await assert.rejects(
    openSocket(server.origin, await subscribeTicket({ userId: ALICE }))
  );
});
