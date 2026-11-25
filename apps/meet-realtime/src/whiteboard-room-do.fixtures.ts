import { afterEach, beforeEach, jest } from 'bun:test';
import { guestElement } from '../../../packages/realtime/src/meet/board-sync-guest.fixtures';
import {
  BOARD_TICKET_AUDIENCE,
  type BoardTicket,
} from '../../../packages/realtime/src/meet/board-sync-schema';
import { WhiteboardRoomDurableObject } from './whiteboard-room-do';

export const SECRET = 'test-secret-test-secret';
export const ids = {
  meetingId: crypto.randomUUID(),
  wsId: crypto.randomUUID(),
  boardId: crypto.randomUUID(),
};
/** The test clock; `Date.now` reads it while the room hooks are installed. */
export const clock = { now: 1_800_000_000_000 };
const realNow = Date.now;
const realFetch = globalThis.fetch;
export const ticket = (over: Partial<BoardTicket> = {}): BoardTicket => ({
  aud: BOARD_TICKET_AUDIENCE,
  kind: 'join',
  ...ids,
  actorKind: 'member',
  userId: 'u1',
  displayName: 'Ada',
  role: 'edit',
  exp: Math.floor(Date.now() / 1000) + 120,
  ...over,
});
/** A complete rectangle, as a guest's editor sends it. */
export const full = (id: string, over: Record<string, unknown> = {}) =>
  guestElement('rectangle', { id, ...over });
export const rect = (id: string, version = 1) => ({
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

/**
 * A room over fake storage and sockets. Guest drawing is on unless a test
 * passes `MEET_GUEST_WHITEBOARD_DRAW` (or `undefined` for a missing switch),
 * so the guest budget tests exercise the write path.
 */
export function fixture(env: Record<string, string | undefined> = {}) {
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
    MEET_GUEST_WHITEBOARD_DRAW: 'true',
    ...env,
  };
  const the = new WhiteboardRoomDurableObject(state, config);
  const message = (socket: (typeof sockets)[number], data: string) =>
    the.webSocketMessage(socket as unknown as WebSocket, data);
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
  return { the, values, ops, sockets, state, join, message, restart };
}

/** Installs the test clock and a fake platform for each test in a file. */
export function installRoomTestHooks() {
  beforeEach(() => {
    Date.now = () => clock.now;
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
    if (jest.isFakeTimers()) jest.useRealTimers();
    Date.now = realNow;
    globalThis.fetch = realFetch;
  });
}

export function useRoomFakeTimers() {
  Date.now = realNow;
  jest.useFakeTimers({ now: clock.now });
}

// A real Response with status 101 is not constructible in Node; the adapter
// returns one only after the socket is accepted, so tests assert on the
// accepted socket instead of the response.
export async function open(
  f: ReturnType<typeof fixture>,
  over: Partial<BoardTicket> = {}
) {
  await f.join(over).catch(() => undefined);
  return f.sockets.at(-1)!;
}
