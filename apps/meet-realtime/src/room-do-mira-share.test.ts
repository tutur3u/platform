import assert from 'node:assert/strict';
import { afterEach, setSystemTime, test } from 'bun:test';
import { meetRealtimeTokenPayloadSchema } from '../../../packages/realtime/src/meet/primitives';
import { createMeetRoomSnapshot } from '../../../packages/realtime/src/meet/room';
import { admitOrHold } from '../../../packages/realtime/src/meet/room-admission';
import { MIRA_PRIVATE_NOTICE_VERSION } from '../../../packages/realtime/src/meet/room-mira-private';
import {
  MIRA_SHARE_CONTEXT_TTL_MS,
  miraShareContextKey,
} from '../../../packages/realtime/src/meet/room-mira-share';
import { roomService } from '../../../packages/realtime/src/meet/room-service';
import { signMeetServiceCredential } from '../../../packages/realtime/src/meet/service-credential';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';
import type { RoomServiceState } from './room-service';

Object.assign(globalThis, { WebSocketRequestResponsePair: class {} });
const start = Date.parse('2026-11-25T00:00:00Z');
const secret = 'mira-share-secret';
const account = '00000000-0000-4000-8000-000000000001';
const meetingId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000004';
const key = miraShareContextKey(account);
const token = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId,
  mode: 'call',
  role: 'host',
  roomId: 'ws:room',
  scopes: ['meet:server'],
  userId: account,
  accountId: account,
  wsId: '00000000-0000-4000-8000-000000000003',
});
const privateMira = {
  scopes: ['meet:server', 'meet:live-server', 'meet:private-mira'],
};
const tutor = [
  { assistant: false, body: 'Explain photosynthesis again' },
  { assistant: true, body: 'Plants turn light into sugar.' },
];
const share = { action: 'mira.share.context', tutor };
const read = { action: 'mira.share.private.read', sessionId };
afterEach(() => setSystemTime());

/** The person is in the room, chose Continue, started Mira and shares. */
function seed() {
  let state: RoomServiceState = admitOrHold(
    createMeetRoomSnapshot(),
    token,
    new Date(start).toISOString()
  ).state;
  for (const input of [
    {
      action: 'mira.private.choice',
      choice: 'continue',
      version: MIRA_PRIVATE_NOTICE_VERSION,
    },
    { action: 'mira.private.register', sessionId },
    { action: 'mira.share.set', enabled: true },
  ])
    state = roomService(state, token, input).state;
  return state;
}

function fixture(
  initial?: RoomServiceState,
  stored: Record<string, unknown> = {}
) {
  setSystemTime(new Date(start));
  const values = new Map<string, unknown>([
    ['snapshot', initial ?? seed()],
    ...Object.entries(stored),
  ]);
  let deadline: number | null = null;
  const storage = {
    get: async (name: string) => values.get(name),
    put: async (name: string, value: unknown) => {
      values.set(name, structuredClone(value));
    },
    delete: async (names: string | string[]) => {
      for (const name of [names].flat()) values.delete(name);
    },
    getAlarm: async () => deadline,
    setAlarm: async (next: number) => {
      deadline = next;
    },
  };
  const socket = {
    readyState: WebSocket.OPEN as number,
    deserializeAttachment: () => ({ token }),
    serializeAttachment: () => undefined,
    send: () => undefined,
    close: () => undefined,
  };
  const state = {
    storage,
    setWebSocketAutoResponse: () => undefined,
    getWebSockets: () => [socket],
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    waitUntil: () => undefined,
  } as unknown as DurableObjectState;
  // An erasure republishes the room's attendance index to the directory
  // room, as the deployed binding does.
  const room = new MeetRoomDurableObject(state, {
    MEET_REALTIME_TOKEN_SECRET: secret,
    MEET_ROOM: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response(null, { status: 200 }) }),
    },
  } as unknown as MeetRoomEnv);
  const call = async (body: object, extra: object = {}) => {
    const response = await room.fetch(
      new Request('https://meet.test/room-service', {
        method: 'POST',
        headers: {
          'x-meet-token': JSON.stringify({ ...token, ...extra }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
  return {
    room,
    call,
    socket,
    values,
    snapshot: () => values.get('snapshot') as RoomServiceState,
    deadline: () => deadline,
    advance: (ms: number) => setSystemTime(new Date(Date.now() + ms)),
  };
}

test('stores shared tutor chat under its own key, never in the snapshot', async () => {
  const f = fixture();
  assert.equal((await f.call(share)).status, 200);
  const snapshot = f.snapshot();
  assert.ok(!JSON.stringify(snapshot).includes('photosynthesis'));
  assert.equal(snapshot.miraSharePending, undefined);
  assert.deepEqual((f.values.get(key) as { tutor: unknown }).tutor, tutor);
  const shared = await f.call(read, privateMira);
  assert.deepEqual(shared.body.tutor, tutor);
  assert.equal(shared.body.sharedAt, snapshot.miraShares![account]!.updatedAt);
  // Room Mira has no private scope and never reads it.
  assert.equal(
    (await f.call(read, { scopes: ['meet:server', 'meet:live-server'] }))
      .status,
    403
  );
  const expiry =
    snapshot.miraShares![account]!.context!.updatedAt +
    MIRA_SHARE_CONTEXT_TTL_MS;
  assert.ok(f.deadline() !== null && f.deadline()! <= expiry);
});

test('deletes the stored chat on revoke and returns the sessions to stop', async () => {
  const f = fixture();
  await f.call(share);
  const revoked = await f.call({ action: 'mira.share.set', enabled: false });
  assert.equal(revoked.status, 200);
  assert.deepEqual(revoked.body.sessions, [sessionId]);
  assert.equal(f.values.has(key), false);
  assert.equal((await f.call(read, privateMira)).status, 403);
});

test('never serves a key left at an older revision after re-enabling', async () => {
  const f = fixture();
  await f.call(share);
  const old = structuredClone(f.values.get(key));
  await f.call({ action: 'mira.share.set', enabled: false });
  await f.call({ action: 'mira.share.set', enabled: true });
  f.advance(1000);
  await f.call(share);
  // A write that left the earlier revision's text behind is never served.
  f.values.set(key, old);
  assert.deepEqual((await f.call(read, privateMira)).body.tutor, []);
});

test('deletes the stored chat when the Private Mira choice changes', async () => {
  const f = fixture();
  await f.call(share);
  await f.call({ action: 'mira.private.ended', sessionId });
  assert.equal(f.values.has(key), true);
  await f.call({
    action: 'mira.private.choice',
    choice: 'mute',
    version: MIRA_PRIVATE_NOTICE_VERSION,
  });
  assert.equal(f.values.has(key), false);
  assert.equal(f.snapshot().miraShares?.[account]?.context, undefined);
});

test('sweeps expired chat on the alarm with no further requests', async () => {
  const f = fixture();
  await f.call(share);
  assert.equal(f.values.has(key), true);
  f.advance(MIRA_SHARE_CONTEXT_TTL_MS + 1000);
  await f.room.alarm();
  assert.equal(f.values.has(key), false);
  assert.equal(f.snapshot().miraShares?.[account]?.context, undefined);
});

test('deletes an evicted person’s stored chat when the room cap is reached', async () => {
  let initial = seed();
  const others = Array.from({ length: 19 }, (_, index) =>
    `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`
  );
  const stored: Record<string, unknown> = {};
  others.forEach((id, index) => {
    const updatedAt = start - 60_000 + index;
    initial = {
      ...initial,
      miraPrivate: {
        ...initial.miraPrivate!,
        choices: {
          ...initial.miraPrivate!.choices,
          [id]: {
            choice: 'continue',
            version: MIRA_PRIVATE_NOTICE_VERSION,
            meetingId,
            accountId: id,
            recordedAt: start,
            revision: 1,
          },
        },
      },
      miraShares: {
        ...initial.miraShares,
        [id]: {
          enabled: true,
          revision: 1,
          choiceRevision: 1,
          meetingId,
          updatedAt: start - 120_000,
          context: { updatedAt, bytes: 14_000 },
        },
      },
    };
    stored[miraShareContextKey(id)] = { tutor, updatedAt, revision: 1 };
  });
  const f = fixture(initial, stored);
  assert.equal((await f.call(share)).status, 200);
  assert.equal(f.values.has(miraShareContextKey(others[0]!)), false);
  assert.equal(f.values.has(miraShareContextKey(others[1]!)), true);
  assert.equal(f.values.has(key), true);
});

test('deletes the stored chat when the meeting ends', async () => {
  const f = fixture();
  await f.call(share);
  await f.room.webSocketMessage(
    f.socket as unknown as WebSocket,
    JSON.stringify({ type: 'room.end' })
  );
  assert.equal(f.snapshot().ended, true);
  assert.equal(f.values.has(key), false);
});

test('deletes leftover stored chat when an ended meeting is restored', async () => {
  const ending = fixture();
  await ending.room.webSocketMessage(
    ending.socket as unknown as WebSocket,
    JSON.stringify({ type: 'room.end' })
  );
  const ended = ending.snapshot();
  const grant = seed().miraShares![account]!;
  const f = fixture(
    {
      ...ended,
      miraShares: {
        [account]: { ...grant, context: { updatedAt: start, bytes: 100 } },
      },
    },
    { [key]: { tutor, updatedAt: start, revision: grant.revision } }
  );
  const restored = await f.call({
    action: 'room.restore',
    expectedVersion: ended.lifecycle?.version ?? 0,
  });
  assert.equal(restored.status, 200);
  assert.equal(f.values.has(key), false);
  assert.equal(f.snapshot().miraShares, undefined);
});

test('deletes the stored chat on a subject erasure', async () => {
  const f = fixture();
  await f.call(share);
  const response = await f.room.fetch(
    new Request('https://meet.internal/class-service', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signMeetServiceCredential(
          {
            aud: 'meet-service',
            purpose: 'attendance-erase',
            roomId: 'ws:room',
            exp: Math.floor(Date.now() / 1000) + 60,
            erase: 'subject',
            userId: account,
            generation: 1,
          },
          secret
        )}`,
      },
    })
  );
  assert.equal(response.status, 200);
  assert.equal(f.values.has(key), false);
  assert.equal(f.snapshot().miraShares?.[account], undefined);
});
