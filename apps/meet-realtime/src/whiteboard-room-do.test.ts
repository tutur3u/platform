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
        for (const [k, v] of Object.entries(entries)) values.set(k, structuredClone(v));
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
  const the = new WhiteboardRoomDurableObject(state, {
    WHITEBOARD_ROOM: {} as DurableObjectNamespace,
    MEET_REALTIME_TOKEN_SECRET: SECRET,
    PLATFORM_API_BASE_URL: 'https://platform.example.invalid',
    ...env,
  });
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
  return { the, values, ops, sockets, state, join };
}

beforeEach(() => {
  Date.now = () => now;
  globalThis.fetch = (async (_url: URL, init: RequestInit) => {
    const op = JSON.parse(String(init.body)).op;
    (globalThis as any).__fetches.push(op);
    return Response.json({
      updatedAt: 'u',
      elements: op === 'load' ? [rect('seed')] : undefined,
    });
  }) as typeof fetch;
  (globalThis as any).__fetches = [];
});
afterEach(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
});

// A real Response with status 101 is not constructible in Node; the adapter
// returns one only after the socket is accepted, so tests assert on the
// accepted socket instead of the response.
async function open(f: ReturnType<typeof fixture>, over: Partial<BoardTicket> = {}) {
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
  assert.ok(
    socket.sent.some((m) => m.type === 'role' && m.role === 'view')
  );
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
