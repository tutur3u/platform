import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'bun:test';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';
import {
  BOARD_LIMITS,
  BOARD_TICKET_AUDIENCE,
  type BoardTicket,
} from '../../../packages/realtime/src/meet/board-sync-schema';
import { WhiteboardRoomDurableObject } from './whiteboard-room-do';

const SECRET = 'test-secret-test-secret';
const ids = {
  meetingId: crypto.randomUUID(),
  wsId: crypto.randomUUID(),
  boardId: crypto.randomUUID(),
};
let now = 1_800_000_000_000;
const realNow = Date.now;
const realFetch = globalThis.fetch;
const ticket = (over: Partial<BoardTicket> = {}): BoardTicket => ({
  aud: BOARD_TICKET_AUDIENCE,
  kind: 'join',
  ...ids,
  actorKind: 'member',
  userId: 'u1',
  displayName: 'Ada',
  role: 'edit',
  exp: Math.floor(now / 1000) + 120,
  ...over,
});
const rect = (id: string, version = 1) => ({
  id,
  type: 'rectangle',
  version,
  versionNonce: 1,
});

function fakeSocket() {
  const sent: any[] = [];
  let attachment: unknown;
  let closed: number | null = null;
  return {
    sent,
    get closed() {
      return closed;
    },
    readyState: 1,
    send: (data: string) => sent.push(JSON.parse(data)),
    close: (code = 1000) => {
      closed = code;
    },
    serializeAttachment: (value: unknown) => {
      attachment = structuredClone(value);
    },
    deserializeAttachment: () => structuredClone(attachment),
  };
}

function fixture(env: Record<string, string> = {}) {
  const values = new Map<string, unknown>();
  const ops = { puts: 0, alarms: 0, fetches: 0 };
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  const state = {
    storage: {
      get: async (key: string) => structuredClone(values.get(key)),
      put: async (entries: Record<string, unknown>) => {
        ops.puts++;
        for (const [k, v] of Object.entries(entries))
          values.set(k, structuredClone(v));
      },
      delete: async (keys: string[]) => {
        for (const key of keys) values.delete(key);
      },
      setAlarm: async () => {
        ops.alarms++;
      },
    },
    getWebSockets: () => sockets,
    acceptWebSocket: (s: ReturnType<typeof fakeSocket>) => sockets.push(s),
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  } as unknown as DurableObjectState;
  (globalThis as any).WebSocketPair = class {
    0 = fakeSocket();
    1 = fakeSocket();
  };
  const config = {
    WHITEBOARD_ROOM: {} as DurableObjectNamespace,
    MEET_REALTIME_TOKEN_SECRET: SECRET,
    PLATFORM_API_BASE_URL: 'https://platform.example.invalid',
    ...env,
  };
  const the = new WhiteboardRoomDurableObject(state, config);
  /** A new instance over the same storage and sockets, like an eviction. */
  const restart = () => new WhiteboardRoomDurableObject(state, config);
  async function join(over: Partial<BoardTicket> = {}) {
    const request = new Request('https://x/whiteboard', {
      headers: {
        Upgrade: 'websocket',
        'x-board-ticket': JSON.stringify(ticket(over)),
      },
    });
    const response = await the.fetch(request).catch((e) => e);
    return response;
  }
  return { the, values, ops, sockets, state, join, restart };
}

beforeEach(() => {
  Date.now = () => now;
  globalThis.fetch = (async (_url: URL, init: RequestInit) => {
    const op = JSON.parse(String(init.body)).op;
    (globalThis as any).__fetches.push(op);
    const status = (globalThis as any).__status?.[op];
    if (status) return new Response(null, { status });
    return Response.json({
      updatedAt: 'u',
      elements: op === 'load' ? [rect('seed')] : undefined,
    });
  }) as typeof fetch;
  (globalThis as any).__fetches = [];
  (globalThis as any).__status = {};
});
afterEach(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
});

// A real Response with status 101 is not constructible in Node; the adapter
// returns one only after the socket is accepted, so tests assert on the
// accepted socket instead of the response.
async function open(
  f: ReturnType<typeof fixture>,
  over: Partial<BoardTicket> = {}
) {
  await f.join(over).catch(() => undefined);
  return f.sockets.at(-1)!;
}

test('loads the board once and sends the scene to a joiner', async () => {
  const f = fixture();
  const socket = await open(f);
  assert.equal(socket.sent[0].type, 'sync');
  assert.deepEqual(
    socket.sent[0].elements.map((e: any) => e.id),
    ['seed']
  );
  await open(f, { userId: 'u2' });
  assert.deepEqual((globalThis as any).__fetches, ['load']);
});

test('refuses an expired or unsigned join and a different board', async () => {
  const f = fixture();
  const expired = await f.join({ exp: Math.floor(now / 1000) - 1 });
  assert.equal(expired.status, 401);
  await open(f);
  const other = await f.join({ boardId: crypto.randomUUID() });
  assert.equal(other.status, 403);
});

test('relays edits from editors and closes a viewer that edits', async () => {
  const f = fixture();
  const editor = await open(f);
  const peer = await open(f, { userId: 'u2' });
  const viewer = await open(f, { userId: 'u3', role: 'view' });
  const message = JSON.stringify({
    type: 'elements',
    changes: [{ type: 'insert', element: rect('a') }],
  });
  await f.the.webSocketMessage(editor as any, message);
  assert.equal(peer.sent.at(-1).type, 'elements');
  assert.equal(viewer.sent.at(-1).changes[0].element.id, 'a');
  assert.ok(!editor.sent.some((m) => m.type === 'elements'));
  await f.the.webSocketMessage(viewer as any, message);
  assert.equal(viewer.closed, 1008);
});

test('a refresh may lower the role but not change the actor', async () => {
  const f = fixture();
  const socket = await open(f);
  await f.the.webSocketMessage(
    socket as any,
    JSON.stringify({
      type: 'authenticate',
      token: signRealtimePayload(ticket({ role: 'view' }), SECRET),
    })
  );
  assert.ok(socket.sent.some((m) => m.type === 'role' && m.role === 'view'));
  const other = await open(f, { userId: 'u9' });
  await f.the.webSocketMessage(
    other as any,
    JSON.stringify({
      type: 'authenticate',
      token: signRealtimePayload(ticket({ userId: 'someone-else' }), SECRET),
    })
  );
  assert.equal(other.closed, 1008);
});

test('rate limits a socket and rejects malformed messages', async () => {
  const f = fixture();
  const socket = await open(f);
  for (let i = 0; i <= BOARD_LIMITS.messageRate; i++)
    await f.the.webSocketMessage(
      socket as any,
      JSON.stringify({ type: 'cursor', x: 1, y: 1 })
    );
  assert.equal(socket.closed, 1008);
  const bad = await open(f, { userId: 'u2' });
  await f.the.webSocketMessage(bad as any, '{"type":"elements","changes":[]}');
  assert.equal(bad.closed, 1008);
});

test('flushes on the alarm after the last participant leaves', async () => {
  const f = fixture();
  const socket = await open(f);
  await f.the.webSocketMessage(
    socket as any,
    JSON.stringify({
      type: 'elements',
      changes: [{ type: 'insert', element: rect('a') }],
    })
  );
  f.sockets.splice(0);
  await f.the.webSocketClose();
  now += BOARD_LIMITS.idleFlushMs + 10;
  await f.the.alarm();
  assert.deepEqual((globalThis as any).__fetches, ['load', 'flush']);
});

test('the stop fence halts flushes and storage writes but keeps relaying', async () => {
  const f = fixture({ MEET_WHITEBOARD_FLUSH_DISABLED: 'true' });
  const editor = await open(f);
  const peer = await open(f, { userId: 'u2' });
  for (let i = 0; i < 20; i++)
    await f.the.webSocketMessage(
      editor as any,
      JSON.stringify({
        type: 'elements',
        changes: [{ type: 'insert', element: rect(`e${i}`) }],
      })
    );
  assert.equal(peer.sent.filter((m) => m.type === 'elements').length, 20);
  now += 60 * 60_000;
  await f.the.alarm();
  assert.deepEqual((globalThis as any).__fetches, ['load']);
  assert.equal(f.values.has('meta'), false);
});

test('the stop fence also keeps the identity out of storage until it lifts', async () => {
  const f = fixture({ MEET_WHITEBOARD_FLUSH_DISABLED: '1' });
  await open(f);
  assert.equal(f.values.has('identity'), false);
  assert.equal(f.ops.puts, 0);
});

test('stores the identity on the first join when the fence is off', async () => {
  const f = fixture();
  await open(f);
  assert.deepEqual(f.values.get('identity'), ids);
});

test('never delivers a broadcast to a socket whose ticket expired', async () => {
  const f = fixture();
  const editor = await open(f);
  const stale = await open(f, {
    userId: 'u2',
    exp: Math.floor(now / 1000) + 5,
  });
  now += 10_000;
  await f.the
    .webSocketMessage(
      editor as any,
      JSON.stringify({ type: 'cursor', x: 1, y: 1 })
    )
    .catch(() => undefined);
  assert.equal(stale.closed, 1008);
  assert.ok(!stale.sent.some((m) => m.type === 'cursor'));
});

test('after an eviction the restored room sweeps expired sockets without a new message', async () => {
  const f = fixture();
  await open(f);
  const stale = await open(f, {
    userId: 'u2',
    exp: Math.floor(now / 1000) + 5,
  });
  const alarmsBefore = f.ops.alarms;
  const restored = f.restart();
  now += 10_000;
  await restored.alarm();
  assert.ok(f.ops.alarms >= alarmsBefore);
  assert.equal(stale.closed, 1008);
});

test('a viewer may ask for the scene only once every two seconds', async () => {
  const f = fixture();
  const viewer = await open(f, { role: 'view' });
  const base = viewer.sent.filter((m) => m.type === 'sync').length;
  for (let i = 0; i < 5; i++)
    await f.the.webSocketMessage(viewer as any, '{"type":"sync"}');
  assert.equal(viewer.sent.filter((m) => m.type === 'sync').length, base + 1);
  now += 2500;
  await f.the.webSocketMessage(viewer as any, '{"type":"sync"}');
  assert.equal(viewer.sent.filter((m) => m.type === 'sync').length, base + 2);
});

test('drops unsupported elements with a notice and keeps the socket open', async () => {
  const f = fixture();
  const editor = await open(f);
  const peer = await open(f, { userId: 'u2' });
  await f.the.webSocketMessage(
    editor as any,
    JSON.stringify({
      type: 'elements',
      changes: [
        { type: 'insert', element: { ...rect('img'), type: 'image' } },
        { type: 'insert', element: rect('ok') },
      ],
    })
  );
  assert.equal(editor.closed, null);
  assert.deepEqual(editor.sent.at(-1), {
    type: 'rejected',
    reason: 'unsupported',
  });
  assert.deepEqual(
    peer.sent.at(-1).changes.map((c: any) => c.element.id),
    ['ok']
  );
  await f.the.webSocketMessage(
    editor as any,
    JSON.stringify({
      type: 'elements',
      changes: [
        { type: 'insert', element: { ...rect('img2'), type: 'image' } },
      ],
    })
  );
  assert.equal(editor.closed, null);
});

test('tells the sender when the board is full and keeps the socket open', async () => {
  const f = fixture();
  const editor = await open(f);
  let refused = 0;
  for (let i = 0; i < 60; i++) {
    now += 1000;
    await f.the.webSocketMessage(
      editor as any,
      JSON.stringify({
        type: 'elements',
        changes: [
          {
            type: 'insert',
            element: { ...rect(`big${i}`), text: 'x'.repeat(60_000) },
          },
        ],
      })
    );
    refused += editor.sent.filter((m) => m.type === 'rejected').length;
    editor.sent.length = 0;
  }
  assert.ok(refused > 0);
  assert.equal(editor.closed, null);
});

test('a room closed by the platform reopens at the next join once the board is back', async () => {
  const f = fixture();
  const editor = await open(f);
  (globalThis as any).__status = { flush: 404 };
  await f.the.webSocketMessage(
    editor as any,
    JSON.stringify({
      type: 'elements',
      changes: [{ type: 'insert', element: rect('a') }],
    })
  );
  f.sockets.splice(0);
  await f.the.webSocketClose();
  now += BOARD_LIMITS.idleFlushMs + 10;
  await f.the.alarm();
  (globalThis as any).__status = { load: 404 };
  assert.equal((await f.join({ userId: 'u3' })).status, 410);
  assert.equal(f.sockets.length, 0);
  (globalThis as any).__status = {};
  const reopened = await open(f, { userId: 'u3' });
  assert.equal(reopened.sent[0].type, 'sync');
});
