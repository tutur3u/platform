import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  alice,
  host,
  open,
  selfRoom,
  streamA,
  tokenOf,
} from '../../../packages/realtime/src/meet/room-self-capture.fixtures';
import { MIRA_ROOM_NOTICE_VERSION } from '../../../packages/realtime/src/meet/room-mira-acceptance';
import { endMeetRoom } from '../../../packages/realtime/src/meet/room-ending';
import { verifyMeetSelfOutboxCredential } from '../../../packages/realtime/src/meet/service-credential';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';
import type { RoomServiceState } from './room-service';

Object.assign(globalThis, { WebSocketRequestResponsePair: class {} });
const secret = 'self-outbox-test-secret';

function fixture(seed: RoomServiceState, env: Partial<MeetRoomEnv> = {}) {
  const values = new Map<string, unknown>([['snapshot', seed]]);
  let deadline: number | null = null;
  const socketOf = (id: string) => ({
    readyState: WebSocket.OPEN as number,
    deserializeAttachment: () => ({
      token: { ...tokenOf(id), roomId: 'ws:room' },
    }),
    serializeAttachment: () => undefined,
    send: () => undefined,
    close: () => undefined,
  });
  const sockets = [socketOf(host), socketOf(alice)];
  const state = {
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
      getAlarm: async () => deadline,
      setAlarm: async (next: number) => {
        deadline = next;
      },
    },
    setWebSocketAutoResponse: () => undefined,
    getWebSockets: () => sockets,
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    waitUntil: () => undefined,
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {
    MEET_REALTIME_TOKEN_SECRET: secret,
    ...env,
  } as MeetRoomEnv);
  return {
    room,
    sockets,
    snapshot: () => values.get('snapshot') as RoomServiceState,
    deadline: () => deadline,
    alarm: async () => {
      deadline = null;
      await room.alarm();
    },
  };
}

test('a leave reaches the stored outbox without arming delivery when unbound', async () => {
  const f = fixture(open(selfRoom(), alice, streamA));
  const leaving = f.sockets[1]!;
  leaving.readyState = WebSocket.CLOSED;
  await f.room.webSocketClose(leaving as unknown as WebSocket, 1000);
  const outbox = f.snapshot().selfCapture?.outbox ?? [];
  assert.deepEqual(
    outbox.map(({ accountId, seq, kind }) => ({ accountId, seq, kind })),
    [{ accountId: alice, seq: 2, kind: 'close' }]
  );
  assert.equal(f.deadline(), null);
});

test('the bound alarm delivers the outbox once due and drops acknowledged entries', async () => {
  const requests: Request[] = [];
  const fetch = async (request: Request) => {
    requests.push(request.clone());
    const body = (await request.json()) as {
      entries: { sessionId: string; accountId: string; seq: number }[];
    };
    return Response.json({ acked: body.entries });
  };
  const f = fixture(open(selfRoom(), alice, streamA), {
    MEET_AI_SELF_OUTBOX: { fetch },
  } as Partial<MeetRoomEnv>);
  const leaving = f.sockets[1]!;
  leaving.readyState = WebSocket.CLOSED;
  const before = Date.now();
  await f.room.webSocketClose(leaving as unknown as WebSocket, 1000);
  const due = f.snapshot().selfCapture?.delivery?.nextAt ?? 0;
  assert.ok(due >= before + 10_000);
  assert.ok((f.deadline() ?? Infinity) <= due);
  // Not due yet: nothing is sent.
  await f.alarm();
  assert.equal(requests.length, 0);
  const stored = f.snapshot();
  stored.selfCapture!.delivery = { attempts: 0, nextAt: 0 };
  // Every persist records the durable room id; a cold alarm reads it there.
  stored.roomName = 'ws:room';
  const g = fixture(stored, {
    MEET_AI_SELF_OUTBOX: { fetch },
  } as Partial<MeetRoomEnv>);
  await g.alarm();
  assert.equal(requests.length, 1);
  const token = requests[0]!.headers
    .get('Authorization')!
    .slice('Bearer '.length);
  assert.equal(
    verifyMeetSelfOutboxCredential(token, secret)?.purpose,
    'self-outbox'
  );
  assert.deepEqual(g.snapshot().selfCapture?.outbox, []);
  assert.equal(g.snapshot().selfCapture?.delivery, undefined);
});

const serviceCall = (room: MeetRoomDurableObject, id: string, body: object) =>
  room.fetch(
    new Request('https://meet.test/room-service', {
      method: 'POST',
      headers: {
        'x-meet-token': JSON.stringify({ ...tokenOf(id), roomId: 'ws:room' }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  );

test('hibernation keeps the outbox and the room sequence counter', async () => {
  const f = fixture(open(selfRoom(), alice, streamA));
  const leaving = f.sockets[1]!;
  leaving.readyState = WebSocket.CLOSED;
  await f.room.webSocketClose(leaving as unknown as WebSocket, 1000);
  // A fresh object loads only what storage holds.
  const g = fixture(structuredClone(f.snapshot()));
  const response = await serviceCall(g.room, alice, {
    action: 'mira.room.choice',
    choice: 'off',
    version: MIRA_ROOM_NOTICE_VERSION,
    acceptanceRevision: 1,
    source: 'toggle',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    g.snapshot().selfCapture?.outbox.map(({ accountId, seq, kind }) => ({
      accountId,
      seq,
      kind,
    })),
    [
      { accountId: alice, seq: 2, kind: 'close' },
      { accountId: alice, seq: 3, kind: 'withdraw' },
    ]
  );
});

test('room.restore keeps undrained entries, epochs and sequences', async () => {
  const T = 1_000_000;
  let seed = open(selfRoom(), alice, streamA);
  seed = endMeetRoom(
    {
      ...seed,
      budget: {
        expiresAt: Date.now() + 3_600_000,
        accountedAt: T,
        participantMilliseconds: 0,
        maxPublishers: 10,
        maxViewers: 10,
      },
      lifecycle: { version: 0, hadConnection: true, ownerAccountId: host },
    },
    new Date(T).toISOString()
  ) as RoomServiceState;
  const before = structuredClone(seed.selfCapture!);
  assert.equal(before.outbox.length, 1);
  const f = fixture(seed);
  const response = await serviceCall(f.room, host, {
    action: 'room.restore',
    expectedVersion: seed.lifecycle!.version,
  });
  assert.equal(response.status, 200);
  const restored = f.snapshot();
  assert.equal(restored.ended, false);
  assert.deepEqual(restored.selfCapture?.outbox, before.outbox);
  assert.deepEqual(restored.selfCapture?.accounts, before.accounts);
  assert.deepEqual(restored.selfCapture?.delivery, before.delivery);
  // A restart of the restored room writes them back unchanged.
  const g = fixture(structuredClone(restored));
  await g.room.prepareForRestart();
  assert.deepEqual(g.snapshot().selfCapture?.outbox, before.outbox);
  assert.deepEqual(g.snapshot().selfCapture?.accounts, before.accounts);
});
