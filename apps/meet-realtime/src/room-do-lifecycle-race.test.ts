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
  const socket = {
    readyState: WebSocket.OPEN as number,
    deserializeAttachment: () => ({ token }),
    send: () => {},
    close: () => {
      socket.readyState = WebSocket.CLOSED;
    },
  };
  let alarm: number | null = null;
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    getAlarm: async () => alarm,
    setAlarm: async (next: number) => {
      alarm = next;
    },
  };
  const state = {
    storage,
    setWebSocketAutoResponse: () => {},
    getWebSockets: () => [socket],
    waitUntil: (_work: Promise<unknown>) => {},
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  return {
    room,
    socket,
    values,
    initial,
    clock: (next: number) => {
      clock = next;
    },
    restore: () => {
      globalThis.Date = OriginalDate;
    },
    snapshot: () => values.get('snapshot') as typeof initial,
    deadline: () => alarm,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function service(body: unknown) {
  return new Request('https://room.example/room-service', {
    method: 'POST',
    headers: {
      'x-meet-token': JSON.stringify(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
test('provider-await alarm cannot end a reconnected and newly disconnected generation', async () => {
  const f = fixture();
  try {
    f.initial.budget!.pendingPublications = [
      { userId: token.userId, sessionId: 'session', mid: '0' },
    ];
    f.socket.readyState = WebSocket.CLOSED;
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1006);
    const oldVersion = f.snapshot().lifecycle!.version;
    const provider = deferred<object>();
    const entered = deferred<void>();
    (f.room as unknown as { sfuClient: () => unknown }).sfuClient = () => ({
      closeTracks: () => {
        entered.resolve();
        return provider.promise;
      },
    });
    f.clock(start + 300000);
    const oldAlarm = f.room.alarm();
    await entered.promise;
    f.socket.readyState = WebSocket.OPEN;
    await f.room.webSocketMessage(
      f.socket as unknown as WebSocket,
      JSON.stringify({ type: 'presence.join' })
    );
    f.clock(start + 301000);
    f.socket.readyState = WebSocket.CLOSED;
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1000);
    assert.ok(f.snapshot().lifecycle!.version > oldVersion);
    assert.equal(f.snapshot().lifecycle!.emptySince, start + 301000);
    provider.resolve({});
    await oldAlarm;
    assert.equal(f.snapshot().ended, false);
    assert.equal(f.snapshot().budget!.pendingPublications?.length, 0);
    f.clock(start + 601000);
    await f.room.alarm();
    assert.equal(f.snapshot().ended, true);
  } finally {
    f.restore();
  }
});
test('device switch starts a persisted deadline when it removes the last admitted device', async () => {
  const f = fixture();
  try {
    const replacement = {
      ...token,
      userId: '11111111-1111-4111-8111-111111111111',
      accountId: token.userId,
    };
    const response = await f.room.fetch(
      new Request('https://room.example/room-device', {
        method: 'POST',
        headers: {
          'x-meet-token': JSON.stringify(replacement),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'switch' }),
      })
    );
    assert.equal(response.status, 200);
    assert.equal(f.snapshot().lifecycle!.emptySince, start);
    assert.equal(f.deadline(), start + 300000);
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1000);
    f.clock(start + 300000);
    await f.room.alarm();
    assert.equal(f.snapshot().ended, true);
  } finally {
    f.restore();
  }
});
test('durable service enforces original owner and stale restore CAS without extending budget', async () => {
  const f = fixture();
  try {
    f.socket.readyState = WebSocket.CLOSED;
    await f.room.webSocketClose(f.socket as unknown as WebSocket, 1000);
    f.clock(start + 300000);
    await f.room.alarm();
    const ended = f.snapshot();
    const stale = await f.room.fetch(
      service({
        action: 'room.restore',
        expectedVersion: ended.lifecycle!.version - 1,
      })
    );
    assert.equal(stale.status, 409);
    const response = await f.room.fetch(
      service({
        action: 'room.restore',
        expectedVersion: ended.lifecycle!.version,
      })
    );
    assert.equal(response.status, 200);
    assert.equal(f.snapshot().ended, false);
    assert.equal(f.snapshot().budget!.expiresAt, ended.budget!.expiresAt);
    assert.equal(f.snapshot().lifecycle!.emptySince, start + 300000);
    assert.equal(
      (
        await f.room.fetch(
          service({
            action: 'room.restore',
            expectedVersion: ended.lifecycle!.version,
          })
        )
      ).status,
      409
    );
  } finally {
    f.restore();
  }
});
