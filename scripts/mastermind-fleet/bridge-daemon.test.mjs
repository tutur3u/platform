import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BACKOFF,
  backoffDelay,
  fetchTicket,
  runBridge,
  runConnection,
  SAFETY_HELLO_MS,
} from './bridge.mjs';
import { NOW, replyFrame, SECRET, uuid } from './bridge-test-fixture.mjs';
import { signRequest } from './publish.mjs';

test('asks Web for a ticket with the publisher signature and trusts only a TLS socket address', async () => {
  const seen = [];
  const respond =
    (body, status = 200) =>
    async (url, init) => {
      seen.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    };
  const ask = (fetchImpl) =>
    fetchTicket({
      origin: 'https://tuturuuu.com',
      secret: SECRET,
      machineId: 'skr-m4',
      fetchImpl,
      now: () => NOW,
    });
  const ticket = 't'.repeat(43);
  assert.deepEqual(
    await ask(
      respond({ url: 'wss://store.example/v1/bridge/connect', ticket })
    ),
    { url: 'wss://store.example/v1/bridge/connect', ticket }
  );
  const { url, init } = seen[0];
  assert.equal(
    url,
    'https://tuturuuu.com/api/v1/mastermind/fleet/bridge/ticket'
  );
  assert.equal(init.body, '{"machineId":"skr-m4"}');
  assert.equal(init.redirect, 'error');
  const expected = signRequest(
    SECRET,
    'POST',
    '/api/v1/mastermind/fleet/bridge/ticket',
    init.body,
    NOW
  );
  assert.equal(init.headers['x-mm-signature'], expected['x-mm-signature']);
  for (const bad of [
    { url: 'ws://store.example/v1/bridge/connect', ticket },
    { url: 'https://store.example/v1/bridge/connect', ticket },
    { url: 'wss://store.example/v1/bridge/connect', ticket: 'short' },
    {},
  ])
    await assert.rejects(ask(respond(bad)), { message: 'ticket_invalid' });
  await assert.rejects(ask(respond({}, 503)), { message: 'ticket_503' });
  await assert.rejects(
    ask(async () => {
      throw new Error('offline');
    }),
    { message: 'ticket_unreachable' }
  );
});

/** A scriptable stand-in for the global WebSocket. */
function fakeSocketClass() {
  const sockets = [];
  class FakeSocket {
    constructor(url, protocols) {
      Object.assign(this, { url, protocols, sent: [], listeners: {} });
      sockets.push(this);
    }
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
    send(data) {
      this.sent.push(data);
    }
    close(code = 1000) {
      this.listeners.close?.({ code });
    }
    emit(type, event = {}) {
      this.listeners[type]?.(event);
    }
    frames() {
      return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s));
    }
  }
  return { FakeSocket, sockets };
}

const tick = () => new Promise((done) => setImmediate(done));
const quietTimers = {
  setInterval: () => 0,
  clearInterval: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
};

test('presents the ticket as a subprotocol, says hello, acknowledges replies and ignores duplicates in flight', async () => {
  const { FakeSocket, sockets } = fakeSocketClass();
  let release;
  const gate = new Promise((done) => (release = done));
  const handled = [];
  const done = runConnection({
    url: 'wss://store.example/v1/bridge/connect',
    ticket: 'the-ticket',
    WebSocketImpl: FakeSocket,
    timers: quietTimers,
    pokes: () => [{ topic: 'usage', revision: 4, observedAt: 'x' }],
    onReply: async (frame) => {
      handled.push(frame.envelope.id);
      await gate;
      return { v: 1, t: 'ack', id: frame.envelope.id, state: 'delivered' };
    },
  });
  const [socket] = sockets;
  assert.deepEqual(socket.protocols, ['mm-bridge.v1', 'the-ticket']);
  // The ticket never rides in the address.
  assert.ok(!socket.url.includes('the-ticket'));
  socket.emit('open');
  assert.deepEqual(socket.frames(), [
    { v: 1, t: 'hello' },
    { v: 1, t: 'poke', topic: 'usage', revision: 4, observedAt: 'x' },
  ]);
  const data = JSON.stringify(replyFrame(1));
  socket.emit('message', { data });
  socket.emit('message', { data });
  socket.emit('message', { data: 'pong' });
  socket.emit('message', { data: '{not json' });
  socket.emit('message', {
    data: JSON.stringify({ v: 1, t: 'shell', cmd: 'x' }),
  });
  socket.emit('message', { data: 'x'.repeat(40_000) });
  await tick();
  assert.deepEqual(handled, [uuid(1)]);
  release();
  await tick();
  assert.deepEqual(socket.frames().at(-1), {
    v: 1,
    t: 'ack',
    id: uuid(1),
    state: 'delivered',
  });
  socket.close(4001);
  assert.deepEqual(await done, {
    reason: 'closed',
    code: 4001,
    stable: false,
    opened: true,
  });
});

test('an idle connection sends pings and a rare safety request; it asks again at once only while replies are waiting', async () => {
  const { FakeSocket, sockets } = fakeSocketClass();
  const intervals = [];
  let pending = false;
  let clock = 1_000_000;
  const done = runConnection({
    url: 'wss://store.example/v1/bridge/connect',
    ticket: 'the-ticket',
    WebSocketImpl: FakeSocket,
    timers: {
      setInterval: (run, ms) => intervals.push({ run, ms }),
      clearInterval: () => undefined,
    },
    hasPending: () => pending,
    now: () => clock,
    onReply: async () => null,
  });
  const [socket] = sockets;
  socket.emit('open');
  assert.deepEqual(socket.frames(), [{ v: 1, t: 'hello' }]);
  const tickAll = () => {
    clock += 15_000;
    socket.emit('message', { data: 'pong' });
    for (const { run } of intervals) run();
  };
  for (let i = 0; i < 20; i++) tickAll();
  assert.equal(socket.frames().length, 1);
  assert.ok(socket.sent.includes('ping'));
  pending = true;
  tickAll();
  assert.deepEqual(socket.frames(), [
    { v: 1, t: 'hello' },
    { v: 1, t: 'hello' },
  ]);
  // A replay that came back full means more is waiting: ask again once the
  // batch is handled, without any local backlog.
  pending = false;
  for (let n = 1; n <= 50; n++)
    socket.emit('message', { data: JSON.stringify(replyFrame(n)) });
  await tick();
  tickAll();
  assert.equal(socket.frames().filter((f) => f.t === 'hello').length, 3);
  tickAll();
  assert.equal(socket.frames().filter((f) => f.t === 'hello').length, 3);
  // With nothing to do, one safety request goes out per ten minutes: it
  // recovers a lost push or a replay the bridge refused.
  clock += SAFETY_HELLO_MS;
  socket.emit('message', { data: 'pong' });
  for (const { run } of intervals) run();
  assert.equal(socket.frames().filter((f) => f.t === 'hello').length, 4);
  tickAll();
  assert.equal(socket.frames().filter((f) => f.t === 'hello').length, 4);
  // A silent peer is dropped, so a dead socket never looks connected.
  clock += 60_000;
  for (const { run } of intervals) run();
  assert.equal((await done).reason, 'closed');
});

test('backs off between half and all of a doubling step, capped at a minute', () => {
  assert.equal(
    backoffDelay(0, () => 0),
    BACKOFF.minMs / 2
  );
  assert.equal(
    backoffDelay(0, () => 1),
    BACKOFF.minMs
  );
  assert.equal(
    backoffDelay(3, () => 1),
    8 * BACKOFF.minMs
  );
  assert.equal(
    backoffDelay(30, () => 1),
    BACKOFF.maxMs
  );
  assert.equal(
    backoffDelay(30, () => 0),
    BACKOFF.maxMs / 2
  );
});

test('reconnects with a growing, bounded wait and one ticket per attempt', async () => {
  const controller = new AbortController();
  const waits = [];
  let tickets = 0;
  await runBridge({
    origin: 'https://tuturuuu.com',
    secret: SECRET,
    machineId: 'skr-m4',
    onReply: async () => null,
    fetchImpl: async () => {
      tickets++;
      return new Response('{}', { status: 503 });
    },
    random: () => 1,
    sleep: async (ms) => {
      waits.push(ms);
      if (waits.length === 9) controller.abort();
    },
    signal: controller.signal,
  });
  assert.equal(tickets, 9);
  assert.deepEqual(
    waits,
    [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000, 60000]
  );
});
