import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  alice,
  env as selfEnv,
  host,
  open,
  otherSession,
  selfRoom,
  sessionId,
  streamA,
  tokenOf,
} from '../../../packages/realtime/src/meet/room-self-capture.fixtures';
import {
  SELF_OUTBOX_MAX_ENTRIES,
  type SelfOutboxEntry,
} from '../../../packages/realtime/src/meet/room-self-capture-state';
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
    // The per-speaker flag and allowlist for the fixture workspace.
    ...selfEnv,
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
  stored.selfCapture!.delivery = { attempts: 0, nextAt: 0, startedAt: 0 };
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

const miraOff = {
  action: 'mira.room.choice',
  choice: 'off',
  version: MIRA_ROOM_NOTICE_VERSION,
  acceptanceRevision: 1,
  source: 'toggle',
};
const outboxFetch = {
  fetch: async () => Response.json({ acked: [] }),
};

test('a new ending restarts an exhausted delivery cycle', async () => {
  const seed = open(selfRoom(), alice, streamA);
  const stale: SelfOutboxEntry = {
    sessionId: otherSession,
    accountId: host,
    seq: 1,
    kind: 'close',
  };
  seed.selfCapture = {
    ...seed.selfCapture!,
    outbox: [stale],
    delivery: { attempts: 30, startedAt: 0, nextAt: 25 * 3_600_000 },
  };
  const f = fixture(seed, {
    MEET_AI_SELF_OUTBOX: outboxFetch,
  } as Partial<MeetRoomEnv>);
  const before = Date.now();
  const response = await serviceCall(f.room, alice, miraOff);
  assert.equal(response.status, 200);
  const delivery = f.snapshot().selfCapture?.delivery;
  assert.equal(delivery?.attempts, 0);
  assert.ok((delivery?.startedAt ?? 0) >= before);
  assert.deepEqual(
    f.snapshot().selfCapture?.outbox.map((e) => e.kind),
    ['close', 'withdraw']
  );
  const deadline = f.deadline();
  assert.ok(deadline !== null && deadline <= Date.now() + 10_000);
});

test('the room refuses a second live session and never restarts an ended one', async () => {
  const f = fixture(open(selfRoom(), alice, streamA));
  const start = (id: string) => ({
    action: 'transcript.session',
    sessionId: id,
    active: true,
    protocol: 'self_v1',
    generation: 3,
  });
  const live = await serviceCall(f.room, host, start(otherSession));
  assert.equal(live.status, 409);
  assert.equal(
    ((await live.json()) as { code: string }).code,
    'MEET_SELF_SESSION_LIVE'
  );

  const seed = open(selfRoom(), alice, streamA);
  seed.selfCapture = {
    ...seed.selfCapture!,
    session: { ...seed.selfCapture!.session!, status: 'ended' },
    endedSessions: [otherSession],
  };
  const g = fixture(seed);
  const ended = await serviceCall(g.room, host, start(otherSession));
  assert.equal(ended.status, 409);
  assert.equal(
    ((await ended.json()) as { code: string }).code,
    'MEET_SELF_SESSION_ENDED'
  );
  // Re-recording the ended session is refused too: nothing reopens.
  const same = await serviceCall(g.room, host, start(sessionId));
  assert.equal(same.status, 409);
  assert.equal(
    ((await same.json()) as { code: string }).code,
    'MEET_SELF_SESSION_ENDED'
  );
  assert.equal(g.snapshot().selfCapture?.session?.status, 'ended');
  const begin = await serviceCall(g.room, alice, {
    action: 'transcription.self.openBegin',
    sessionId,
  });
  assert.equal(
    ((await begin.json()) as { reason: string }).reason,
    'no_session'
  );
});

test('a full outbox refuses new opens and keeps every entry', async () => {
  const seed = open(selfRoom(), alice, streamA);
  seed.selfCapture = {
    ...seed.selfCapture!,
    outbox: Array.from({ length: SELF_OUTBOX_MAX_ENTRIES }, (_, i) => ({
      sessionId: otherSession,
      accountId: host,
      seq: i + 1,
      kind: 'close' as const,
    })),
  };
  const f = fixture(seed);
  const response = await serviceCall(f.room, alice, {
    action: 'transcription.self.openBegin',
    sessionId,
  });
  assert.equal(response.status, 200);
  assert.equal(
    ((await response.json()) as { reason: string }).reason,
    'capacity'
  );
  assert.equal(
    f.snapshot().selfCapture?.outbox.length,
    SELF_OUTBOX_MAX_ENTRIES
  );
});

test('a refused command still stores the endings it settled', async () => {
  const seed = open(selfRoom(), alice, streamA);
  // An untick the fence has not settled yet.
  const choices = seed.transcriptConsent!.choices;
  seed.transcriptConsent = {
    ...seed.transcriptConsent!,
    choices: { ...choices, [alice]: { ...choices[alice]!, choice: 'decline' } },
  };
  const f = fixture(seed);
  const refused = await serviceCall(f.room, alice, {
    action: 'transcript.mode.set',
    mode: 'room',
  });
  assert.equal(refused.status, 403);
  assert.deepEqual(
    f.snapshot().selfCapture?.outbox.map((e) => e.kind),
    ['withdraw']
  );
});
