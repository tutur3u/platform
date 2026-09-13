import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';

const token = meetRealtimeTokenPayloadSchema.parse({
  exp: Math.floor(Date.now() / 1000) + 600,
  limits: {},
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  role: 'host',
  roomId: 'workspace:meeting',
  scopes: getMeetRealtimeScopesForRole('host'),
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});
globalThis.WebSocketRequestResponsePair =
  class {} as typeof WebSocketRequestResponsePair;
function fixture() {
  const snapshot = admitOrHold(
    createMeetRoomSnapshot(),
    token,
    new Date().toISOString()
  ).state;
  const values = new Map<string, unknown>([['snapshot', snapshot]]);
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    getAlarm: async () => null,
    setAlarm: async (_deadline: number) => {},
  };
  const state = {
    storage,
    setWebSocketAutoResponse: () => {},
    getWebSockets: () => [],
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  const socket = {
    deserializeAttachment: () => ({ token }),
  } as unknown as WebSocket;
  return { room, socket, values, storage };
}
test('a failed expiry write never broadcasts an uncommitted participant release', async () => {
  const { room, values, storage } = fixture();
  const snapshot = values.get('snapshot') as ReturnType<
    typeof createMeetRoomSnapshot
  >;
  snapshot.presence[token.userId]!.lastSeenAt = '2020-01-01T00:00:00Z';
  const sent: unknown[] = [];
  const observer = room as unknown as {
    broadcast: (messages: unknown[]) => void;
  };
  observer.broadcast = (messages) => {
    sent.push(...messages);
  };
  storage.put = async () => {
    throw new Error('storage unavailable');
  };
  await assert.rejects(room.alarm(), /storage unavailable/);
  assert.deepEqual(sent, []);
});
test('unexpected close retains media presence until its grace expires', async () => {
  const { room, socket, values } = fixture();
  await room.webSocketClose(socket, 1006);
  const saved = values.get('snapshot') as ReturnType<
    typeof createMeetRoomSnapshot
  >;
  assert.ok(saved.presence[token.userId]);
  // An empty socket set must not crash the sweep or cancel future expiration.
  await room.alarm();
  assert.ok((values.get('snapshot') as typeof saved).presence[token.userId]);
});
test('intentional leave immediately retires presence', async () => {
  const { room, socket, values } = fixture();
  await room.webSocketClose(socket, 1000);
  const saved = values.get('snapshot') as ReturnType<
    typeof createMeetRoomSnapshot
  >;
  assert.equal(saved.presence[token.userId], undefined);
  await room.webSocketClose(socket, 1000);
  assert.equal(
    values.get('snapshot'),
    saved,
    'a duplicate close does not write or broadcast another release'
  );
});
test('messages marked unsaved never enter durable snapshots', async () => {
  const { room, socket, values } = fixture();
  const snapshot = values.get('snapshot') as ReturnType<
    typeof createMeetRoomSnapshot
  >;
  snapshot.chat = [
    {
      type: 'chat.message',
      id: 'private',
      userId: token.userId,
      displayName: 'Host',
      body: 'Transient',
      createdAt: new Date().toISOString(),
      retained: false,
    },
  ];
  await room.webSocketClose(socket, 1006);
  assert.deepEqual((values.get('snapshot') as typeof snapshot).chat, []);
});

test('an idle connected room schedules only its resource deadline without broadcasting presence', async () => {
  const { room, socket, storage, values } = fixture();
  Object.assign(socket, { readyState: WebSocket.OPEN });
  const internals = room as unknown as {
    sockets: () => WebSocket[];
    broadcast: () => void;
  };
  internals.sockets = () => [socket];
  const alarms: number[] = [];
  let broadcasts = 0;
  storage.setAlarm = async (deadline: number) => {
    alarms.push(deadline);
  };
  internals.broadcast = () => {
    broadcasts++;
  };
  await room.alarm();
  assert.deepEqual(alarms, [
    (values.get('snapshot') as ReturnType<typeof createMeetRoomSnapshot>)
      .budget!.expiresAt,
  ]);
  assert.equal(broadcasts, 0);
});

test('the resource alarm persists a room end and final participant time', async () => {
  const { room, values } = fixture();
  const snapshot = values.get('snapshot') as ReturnType<
    typeof createMeetRoomSnapshot
  >;
  snapshot.budget!.expiresAt = Date.now() - 1;
  snapshot.budget!.accountedAt = snapshot.budget!.expiresAt - 60_000;
  const broadcasts: unknown[] = [];
  (room as unknown as { broadcast: (messages: unknown[]) => void }).broadcast =
    (messages) => {
      broadcasts.push(...messages);
    };
  await room.alarm();
  const saved = values.get('snapshot') as typeof snapshot;
  assert.equal(saved.ended, true);
  assert.deepEqual(saved.presence, {});
  assert.equal(saved.budget!.participantMilliseconds, 60_000);
  assert.ok(
    broadcasts.some(
      (message) => (message as { type: string }).type === 'room.ended'
    )
  );
});

test('failed media closure stays durable and a premature alarm does not retry the provider', async () => {
  const { room, values } = fixture();
  const snapshot = values.get('snapshot') as ReturnType<
    typeof createMeetRoomSnapshot
  >;
  snapshot.budget!.expiresAt = Date.now() - 1;
  snapshot.budget!.accountedAt = snapshot.budget!.expiresAt - 1000;
  snapshot.tracks.media = {
    userId: token.userId,
    sessionId: 'session',
    mid: '0',
    kind: 'video',
  };
  let calls = 0;
  (room as unknown as { sfuClient: () => unknown }).sfuClient = () => ({
    closeTracks: async () => {
      calls++;
      throw new Error('provider unavailable');
    },
  });
  await room.alarm();
  const saved = values.get('snapshot') as typeof snapshot;
  assert.equal(saved.budget!.cleanupAttempts, 1);
  assert.equal(saved.budget!.pendingPublications!.length, 1);
  assert.ok(saved.budget!.nextCleanupAt! > Date.now());
  await room.alarm();
  assert.equal(calls, 1);
});
