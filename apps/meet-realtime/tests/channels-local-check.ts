import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ChannelTicket } from '../../../packages/realtime/src/channels/schema';
import { publishChannelBroadcast } from '../../../packages/realtime/src/channels/server';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';

const worker = new URL(
  process.env.PROGRAMMING_LOCAL_WORKER_URL ?? 'http://127.0.0.1:8876'
);
assert(['127.0.0.1', 'localhost'].includes(worker.hostname));
const secret = process.env.PROGRAMMING_LOCAL_TOKEN_SECRET;
assert(secret, 'A disposable Wrangler secret is required');
const topic = `board-realtime-${randomUUID()}`;
const sockets: WebSocket[] = [];
function ticket(overrides: Partial<ChannelTicket> = {}) {
  return signRealtimePayload(
    {
      aud: 'tuturuuu.channels',
      kind: 'join',
      role: 'editor',
      topic,
      userId: randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 60,
      ...overrides,
    },
    secret
  );
}
async function connect(token: string, self = false) {
  const url = new URL('/channels', worker);
  url.protocol = 'ws:';
  url.searchParams.set('token', token);
  url.searchParams.set('self', String(self));
  const socket = new WebSocket(url);
  sockets.push(socket);
  const received: Record<string, unknown>[] = [];
  socket.addEventListener('message', (event) =>
    received.push(JSON.parse(String(event.data)))
  );
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('WebSocket timeout')),
      5000
    );
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket rejected'));
      },
      { once: true }
    );
  });
  return { socket, received };
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    assert(Date.now() < deadline, 'Expected realtime event did not arrive');
    await Bun.sleep(10);
  }
}
try {
  for (const token of [
    'invalid',
    ticket({ exp: 1 }),
    ticket({ kind: 'publish' }),
  ]) {
    const response = await fetch(new URL(`/channels?token=${token}`, worker));
    assert([401, 403].includes(response.status));
  }
  const actor = randomUUID();
  const a = await connect(ticket({ userId: actor }));
  const b = await connect(ticket());
  const isolated = await connect(
    ticket({ topic: `board-realtime-${randomUUID()}` })
  );
  a.socket.send(
    JSON.stringify({
      type: 'broadcast',
      event: 'task:upsert',
      payload: { id: 'task' },
    })
  );
  await until(() => b.received.some((m) => m.event === 'task:upsert'));
  assert(
    !a.received.some((m) => m.event === 'task:upsert'),
    'Default sender echo must be disabled'
  );
  assert(
    !isolated.received.some((m) => m.event === 'task:upsert'),
    'Topics must remain isolated'
  );
  a.socket.send(
    JSON.stringify({
      type: 'track',
      payload: { user: { id: 'spoof' }, userId: 'spoof', cursor: { x: 1 } },
    })
  );
  await until(() =>
    b.received.some(
      (m) =>
        m.type === 'presence' && (m.state as Record<string, unknown>)?.[actor]
    )
  );
  const state = b.received.findLast((m) => m.type === 'presence')!
    .state as Record<string, { userId: string; user: { id: string } }[]>;
  assert.equal(state[actor]![0]!.userId, actor);
  assert.equal(state[actor]![0]!.user.id, actor);
  const secondSession = await connect(ticket({ userId: actor }));
  secondSession.socket.send(
    JSON.stringify({ type: 'track', payload: { cursor: { x: 2 } } })
  );
  await until(() =>
    b.received.some(
      (m) =>
        ((m.state as Record<string, unknown[]>)?.[actor]?.length ?? 0) === 2
    )
  );
  a.socket.close();
  await until(
    () =>
      (
        b.received.findLast((m) => m.type === 'presence')?.state as Record<
          string,
          unknown[]
        >
      )?.[actor]?.length === 1
  );
  await publishChannelBroadcast(
    topic,
    { type: 'broadcast', event: 'server:update', payload: { revision: 2 } },
    { endpoint: worker.toString(), secret }
  );
  await until(() => b.received.some((m) => m.event === 'server:update'));
  const readonly = await connect(ticket({ role: 'viewer' }));
  const closed = new Promise<number>((resolve) =>
    readonly.socket.addEventListener('close', (e) => resolve(e.code), {
      once: true,
    })
  );
  readonly.socket.send(
    JSON.stringify({ type: 'broadcast', event: 'write', payload: {} })
  );
  assert.equal(await closed, 1008);
  const expired = await connect(
    ticket({ exp: Math.floor(Date.now() / 1000) + 2 })
  );
  assert.equal(
    await new Promise<number>((resolve) =>
      expired.socket.addEventListener('close', (e) => resolve(e.code), {
        once: true,
      })
    ),
    1008
  );
  console.log(
    'Cloudflare channel local integration passed: auth, fanout, isolation, presence identity, multi-session cleanup, publisher, read-only writes, quiet expiry'
  );
} finally {
  for (const socket of sockets) socket.close();
}
