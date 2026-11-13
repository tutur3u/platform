import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { MIRA_PRIVATE_NOTICE_VERSION } from '../../../packages/realtime/src/meet/room-mira-private';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';
import type { RoomServiceState } from './room-service';

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
    waitUntil: () => {},
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  const socket = {
    deserializeAttachment: () => ({ token }),
  } as unknown as WebSocket;
  return { room, socket, values, storage, state };
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

const otherId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
function chatEntry(id: string, retained: boolean) {
  return {
    type: 'chat.message' as const,
    id,
    userId: token.userId,
    displayName: 'Ada',
    body: id,
    createdAt: '2026-11-13T01:00:00.000Z',
    retained,
  };
}
function restartRoom() {
  const { room, values, storage, state } = fixture();
  const snapshot = values.get('snapshot') as RoomServiceState;
  const person = snapshot.presence[token.userId]!;
  person.accountId = token.userId;
  person.displayName = 'Ada';
  person.joinedAt = '2026-11-13T01:00:00.000Z';
  person.lastSeenAt = '2020-01-01T00:00:00.000Z';
  snapshot.presence[otherId] = {
    ...person,
    userId: otherId,
    accountId: otherId,
    displayName: 'Bea',
  };
  snapshot.chat = [
    ...Array.from({ length: 600 }, (_, index) => chatEntry(`m${index}`, true)),
    chatEntry('hidden', false),
  ];
  snapshot.miraPrivate = {
    choices: {
      [token.userId]: {
        choice: 'continue',
        version: MIRA_PRIVATE_NOTICE_VERSION,
        meetingId: token.meetingId,
        accountId: token.userId,
        recordedAt: 1_700_000_000_000,
        revision: 4,
      },
      [otherId]: {
        choice: 'mute',
        version: MIRA_PRIVATE_NOTICE_VERSION,
        meetingId: token.meetingId,
        accountId: token.userId,
        recordedAt: 1,
        revision: 9,
      },
    },
    sessions: { [token.userId]: [sessionId] },
  };
  const closes: Array<{ code?: number; reason?: string }> = [];
  const order: string[] = [];
  const sockets = [WebSocket.OPEN, WebSocket.OPEN, WebSocket.CLOSED].map(
    (readyState) => ({
      readyState,
      deserializeAttachment: () => ({ token }),
      close(code?: number, reason?: string) {
        order.push('close');
        closes.push({ code, reason });
        this.readyState = WebSocket.CLOSED;
      },
    })
  );
  (room as unknown as { sockets: () => WebSocket[] }).sockets = () =>
    sockets as unknown as WebSocket[];
  return { room, values, storage, snapshot, closes, order, state };
}
function service(userId: string, body: unknown) {
  return new Request('https://room.example/room-service', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-meet-token': JSON.stringify({
        ...token,
        userId,
        accountId: userId,
        scopes: ['meet:server'],
      }),
    },
    body: JSON.stringify(body),
  });
}

test('a failed restart write does not disconnect clients', async () => {
  const { room, storage, closes } = restartRoom();
  storage.put = async () => {
    throw new Error('storage unavailable');
  };
  await assert.rejects(room.prepareForRestart(), /storage unavailable/);
  assert.deepEqual(closes, []);
});

test('restart preparation restores the same account and drops a transferred choice', async () => {
  const { room, values, storage, closes, order, state } = restartRoom();
  const put = storage.put.bind(storage);
  storage.put = async (key: string, value: unknown) => {
    order.push('persist');
    await put(key, value);
  };
  await room.prepareForRestart();
  assert.deepEqual(closes, [
    { code: 1012, reason: 'service restart' },
    { code: 1012, reason: 'service restart' },
  ]);
  assert.ok(order.indexOf('persist') < order.indexOf('close'));
  const saved = values.get('snapshot') as RoomServiceState;
  assert.equal(saved.presence[token.userId]?.userId, token.userId);
  assert.equal(saved.presence[token.userId]?.accountId, token.userId);
  assert.equal(saved.presence[token.userId]?.displayName, 'Ada');
  assert.equal(
    saved.presence[token.userId]?.joinedAt,
    '2026-11-13T01:00:00.000Z'
  );
  assert.notEqual(
    saved.presence[token.userId]?.lastSeenAt,
    '2020-01-01T00:00:00.000Z'
  );
  assert.equal(saved.presence[otherId]?.userId, otherId);
  assert.equal(saved.presence[otherId]?.accountId, otherId);
  assert.equal(saved.presence[otherId]?.displayName, 'Bea');
  assert.equal(saved.chat?.length, 500);
  assert.equal(saved.chat?.[0]?.id, 'm100');
  assert.equal(saved.chat?.[499]?.id, 'm599');
  assert.equal(
    saved.chat?.some((entry) => entry.id === 'hidden'),
    false
  );
  assert.equal(saved.miraPrivate?.choices[otherId], undefined);
  assert.deepEqual(saved.miraPrivate?.sessions[token.userId], [sessionId]);
  assert.equal(saved.miraPrivate?.choices[token.userId]?.choice, 'continue');
  assert.equal(saved.miraPrivate?.choices[token.userId]?.revision, 4);
  assert.equal(
    saved.miraPrivate?.choices[token.userId]?.meetingId,
    token.meetingId
  );
  assert.equal(
    saved.miraPrivate?.choices[token.userId]?.accountId,
    token.userId
  );

  const restored = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  const owner = await restored.fetch(
    service(token.userId, { action: 'mira.private.read' })
  );
  const stranger = await restored.fetch(
    service(otherId, { action: 'mira.private.read' })
  );
  const history = await restored.fetch(
    service(token.userId, { action: 'read' })
  );
  const loaded = (restored as unknown as { snapshot: RoomServiceState })
    .snapshot;
  assert.equal(loaded.presence[token.userId]?.userId, token.userId);
  assert.equal(loaded.presence[token.userId]?.accountId, token.userId);
  assert.equal(loaded.presence[token.userId]?.displayName, 'Ada');
  assert.equal(loaded.presence[otherId]?.accountId, otherId);
  assert.equal(loaded.chat?.length, 500);
  assert.equal(loaded.chat?.[0]?.id, 'm100');
  assert.equal(loaded.miraPrivate?.choices[otherId], undefined);
  assert.equal(
    loaded.miraPrivate?.choices[token.userId]?.accountId,
    token.userId
  );
  assert.equal(
    loaded.miraPrivate?.choices[token.userId]?.meetingId,
    token.meetingId
  );
  assert.equal(owner.status, 200);
  assert.deepEqual(await owner.json(), {
    version: MIRA_PRIVATE_NOTICE_VERSION,
    choice: saved.miraPrivate?.choices[token.userId],
    sessions: [sessionId],
    admitted: true,
  });
  assert.equal(stranger.status, 200);
  assert.deepEqual(await stranger.json(), {
    version: MIRA_PRIVATE_NOTICE_VERSION,
    choice: null,
    sessions: [],
    admitted: true,
  });
  assert.equal(history.status, 200);
  const replay = (await history.json()) as { chat: Array<{ id: string }> };
  assert.equal(replay.chat.length, 500);
  assert.equal(replay.chat[0]?.id, 'm100');
  assert.equal(replay.chat[499]?.id, 'm599');
  assert.equal(
    replay.chat.some((entry) => entry.id === 'hidden'),
    false
  );
});
