import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { observeRoomConnections } from '../../../packages/realtime/src/meet/room-lifecycle';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';

const start = Date.parse('2026-10-06T00:00:00Z');
const token = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  role: 'host',
  roomId: 'room',
  scopes: ['meet:server'],
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});
Object.assign(globalThis, { WebSocketRequestResponsePair: class {} });
function fixture() {
  let clock = start;
  const OriginalDate = Date;
  globalThis.Date = class extends OriginalDate {
    constructor(value?: string | number) {
      super(value ?? clock);
    }
    static override now() {
      return clock;
    }
  } as unknown as DateConstructor;
  const initial = observeRoomConnections(
    admitOrHold(createMeetRoomSnapshot(), token, new Date(start).toISOString())
      .state,
    new Set([token.userId]),
    start,
    token
  );
  const values = new Map<string, unknown>([['snapshot', initial]]);
  let deadline: number | null = null;
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    getAlarm: async () => deadline,
    setAlarm: async (next: number) => {
      deadline = next;
    },
  };
  const socket = {
    readyState: WebSocket.OPEN as number,
    deserializeAttachment: () => ({ token }),
    send: () => {},
    close: () => {},
  };
  const sockets = [socket];
  const state = {
    storage,
    setWebSocketAutoResponse: () => {},
    getWebSockets: () => sockets,
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  const sent: { type: string }[] = [];
  (
    room as unknown as { broadcast: (messages: { type: string }[]) => void }
  ).broadcast = (messages) => sent.push(...messages);
  return {
    room,
    socket,
    sockets,
    storage,
    sent,
    values,
    state,
    clock: (next: number) => {
      clock = next;
    },
    restore: () => {
      globalThis.Date = OriginalDate;
    },
    snapshot: () => values.get('snapshot') as typeof initial,
    alarm: async () => {
      deadline = null;
      await room.alarm();
    },
    deadline: () => deadline,
  };
}
test('durable alarm ends five minutes from disconnect, not presence grace', async () => {
  const f = fixture();
  try {
    f.clock(start + 1000);
    f.socket.readyState = WebSocket.CLOSED;
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1006);
    assert.equal(f.snapshot().lifecycle!.emptySince, start + 1000);
    f.clock(start + 31001);
    await f.alarm();
    assert.equal(f.snapshot().ended, false);
    assert.equal(f.deadline(), start + 301000);
    f.clock(start + 300999);
    await f.alarm();
    assert.equal(f.snapshot().ended, false);
    f.clock(start + 301000);
    await f.alarm();
    assert.equal(f.snapshot().ended, true);
    assert.equal(
      f.sent.filter((message) => message.type === 'room.ended').length,
      1
    );
    await f.alarm();
    assert.equal(
      f.sent.filter((message) => message.type === 'room.ended').length,
      1
    );
  } finally {
    f.restore();
  }
});
test('quiet calls and another open socket never start an empty timer', async () => {
  const f = fixture();
  try {
    f.clock(start + 45 * 60000);
    await f.alarm();
    assert.equal(f.snapshot().ended, false);
    assert.equal(f.snapshot().lifecycle!.emptySince, undefined);
    f.sockets.push({ ...f.socket });
    f.socket.readyState = WebSocket.CLOSED;
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1000);
    assert.equal(f.snapshot().lifecycle!.emptySince, undefined);
    assert.ok(f.snapshot().presence[token.userId]);
  } finally {
    f.restore();
  }
});
test('hibernated reload retains the original deadline', async () => {
  const f = fixture();
  try {
    f.socket.readyState = WebSocket.CLOSED;
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1000);
    f.clock(start + 300000);
    const reloaded = new MeetRoomDurableObject(f.state, {} as MeetRoomEnv);
    await reloaded.alarm();
    assert.equal(f.snapshot().ended, true);
    assert.equal(f.snapshot().budget!.expiresAt, start + 2 * 60 * 60000);
  } finally {
    f.restore();
  }
});
test('a recovered open socket cancels an old deadline', async () => {
  const f = fixture();
  try {
    f.socket.readyState = WebSocket.CLOSED;
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1006);
    f.clock(start + 20000);
    f.socket.readyState = WebSocket.OPEN;
    await f.alarm();
    assert.equal(f.snapshot().lifecycle!.emptySince, undefined);
    f.clock(start + 301000);
    await f.alarm();
    assert.equal(f.snapshot().ended, false);
  } finally {
    f.restore();
  }
});
test('failed storage prevents an uncommitted end broadcast', async () => {
  const f = fixture();
  try {
    f.socket.readyState = WebSocket.CLOSED;
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1000);
    f.clock(start + 300000);
    f.storage.put = async () => {
      throw new Error('storage unavailable');
    };
    await assert.rejects(f.alarm(), /storage unavailable/);
    assert.equal(f.snapshot().ended, false);
    assert.equal(
      f.sent.filter((message) => message.type === 'room.ended').length,
      0
    );
  } finally {
    f.restore();
  }
});
