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
    setAlarm: async () => {},
  };
  const state = {
    storage,
    getWebSockets: () => [],
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  const socket = {
    deserializeAttachment: () => ({ token }),
  } as unknown as WebSocket;
  return { room, socket, values };
}
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
