import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { MIRA_PRIVATE_NOTICE_VERSION } from '../../../packages/realtime/src/meet/room-mira-private';
import {
  MIRA_SHARE_CONTEXT_TTL_MS,
  miraShareContextKey,
} from '../../../packages/realtime/src/meet/room-mira-share';
import { roomService } from '../../../packages/realtime/src/meet/room-service';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';
import type { RoomServiceState } from './room-service';

Object.assign(globalThis, { WebSocketRequestResponsePair: class {} });
const start = Date.parse('2026-11-25T00:00:00Z');
const account = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000004';
const key = miraShareContextKey(account);
const token = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId: '00000000-0000-4000-8000-000000000002',
  mode: 'call',
  role: 'speaker',
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
const OriginalDate = Date;
afterEach(() => {
  globalThis.Date = OriginalDate;
});

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

function fixture() {
  let clock = start;
  globalThis.Date = class extends OriginalDate {
    constructor(value?: string | number) {
      super(value ?? clock);
    }
    static override now() {
      return clock;
    }
  } as unknown as DateConstructor;
  const values = new Map<string, unknown>([['snapshot', seed()]]);
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
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
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
    values,
    snapshot: () => values.get('snapshot') as RoomServiceState,
    deadline: () => deadline,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const share = { action: 'mira.share.context', tutor };
const read = { action: 'mira.share.private.read', sessionId };

test('stores shared tutor chat under its own key, never in the snapshot', async () => {
  const f = fixture();
  assert.equal((await f.call(share)).status, 200);
  const snapshot = f.snapshot();
  assert.ok(!JSON.stringify(snapshot).includes('photosynthesis'));
  assert.equal(snapshot.miraSharePending, undefined);
  assert.deepEqual((f.values.get(key) as { tutor: unknown }).tutor, tutor);
  assert.deepEqual((await f.call(read, privateMira)).body, { tutor });
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
