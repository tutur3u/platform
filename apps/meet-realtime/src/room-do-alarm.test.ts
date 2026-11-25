import assert from 'node:assert/strict';
import { afterEach, test } from 'bun:test';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';
import { expireRoomLive } from '../../../packages/realtime/src/meet/room-live';
import {
  armRoomAlarm,
  expiryDeadline,
  roomAlarmTime,
  scheduleRoomFollowUps,
} from './room-maintenance';
import { selfOutbox } from './room-self-outbox';

const token = meetRealtimeTokenPayloadSchema.parse({
  exp: Math.floor(Date.now() / 1000) + 600,
  limits: {},
  meetingApp: 'meet',
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
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * A room whose budget still owes a media cleanup, with `nextCleanupAt` set
 * to `cleanupAt` (0 marks it due now; undefined is an older snapshot).
 * Its storage refuses alarm times <= 0, as Cloudflare does.
 */
function owingRoom(cleanupAt: number | undefined) {
  const now = Date.now();
  const snapshot = {
    ...admitOrHold(createMeetRoomSnapshot(), token, new Date().toISOString())
      .state,
    budget: {
      expiresAt: now + 3_600_000,
      accountedAt: now,
      participantMilliseconds: 0,
      maxPublishers: 10,
      maxViewers: 10,
      pendingPublications: [
        { sessionId: 'session', userId: token.userId, trackName: 'audio' },
      ],
      ...(cleanupAt === undefined ? {} : { nextCleanupAt: cleanupAt }),
    },
  };
  const values = new Map<string, unknown>([['snapshot', snapshot]]);
  let alarm: number | null = null;
  const alarms: number[] = [];
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    getAlarm: async () => alarm,
    setAlarm: async (at: number) => {
      if (!(at > 0))
        throw new TypeError(
          'setAlarm() cannot be called with an alarm time <= 0'
        );
      alarms.push(at);
      alarm = at;
    },
  };
  const room = new MeetRoomDurableObject(
    {
      storage,
      setWebSocketAutoResponse: () => {},
      getWebSockets: () => [],
      waitUntil: () => {},
      blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    } as unknown as DurableObjectState,
    {} as MeetRoomEnv
  );
  const read = () =>
    room.fetch(
      new Request('https://room.example/room-service', {
        method: 'POST',
        headers: { 'x-meet-token': JSON.stringify(token) },
        body: JSON.stringify({ action: 'mira.private.read' }),
      })
    );
  return {
    room,
    values,
    alarms,
    read,
    fire: async () => {
      alarm = null;
      await room.alarm();
    },
  };
}

test('hands setAlarm only future times', () => {
  const now = 1_800_000_000_000;
  assert.equal(roomAlarmTime(0, now), now + 1);
  assert.equal(roomAlarmTime(-5, now), now + 1);
  assert.equal(roomAlarmTime(now - 1000, now), now + 1);
  assert.equal(roomAlarmTime(now + 5000, now), now + 5000);
  assert.equal(roomAlarmTime(Number.NaN, now), undefined);
  assert.equal(roomAlarmTime(Number.POSITIVE_INFINITY, now), undefined);
});

for (const cleanupAt of [0, undefined]) {
  test(`schedules a future alarm with cleanup at ${cleanupAt}`, async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('no network in tests');
    }) as unknown as typeof fetch;
    const before = Date.now();
    const { read, alarms, fire, values } = owingRoom(cleanupAt);
    const response = await read();
    assert.equal(response.status, 200);
    assert.ok(alarms.length > 0);
    for (const at of alarms) assert.ok(at > 0 && at >= before);
    // The sweep the alarm runs still attempts the owed cleanup: it fails here
    // and is deferred, and the next alarm is again in the future.
    await fire();
    const budget = (
      values.get('snapshot') as { budget: { cleanupAttempts?: number } }
    ).budget;
    assert.equal(budget.cleanupAttempts, 1);
    assert.ok(alarms.at(-1)! > Date.now());
  });
}

test('one non-finite wake source does not hide the valid earliest one', () => {
  const emptySince = 1_800_000_000_000;
  const snapshot = {
    ...createMeetRoomSnapshot(),
    lifecycle: { emptySince },
    // An older pending Mira on without its expiry reads as NaN.
    miraRoom: { pendingOn: { a: {} } },
  } as unknown as Parameters<typeof selfOutbox.wakeAt>[0];
  const wake = selfOutbox.wakeAt(snapshot, {} as MeetRoomEnv);
  assert.ok(Number.isFinite(wake));
  assert.ok(wake! > emptySince);
});

test('drops a non-finite deadline with a warning, never as now', async () => {
  const set: number[] = [];
  const storage = {
    getAlarm: async () => null,
    setAlarm: async (at: number) => {
      set.push(at);
    },
  } as unknown as Parameters<typeof armRoomAlarm>[0];
  const warn = console.warn;
  const warnings: unknown[] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    await armRoomAlarm(storage, Number.NaN, Date.now());
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(set, []);
  assert.equal(warnings.length, 1);
});

test('schedules a non-finite expiry once; the sweep clears it', async () => {
  const now = Date.now();
  assert.equal(expiryDeadline(Number.NaN, now), now);
  assert.equal(expiryDeadline(now + 5000, now), now + 5000);
  const snapshot = {
    ...admitOrHold(createMeetRoomSnapshot(), token, new Date(now).toISOString())
      .state,
    liveAssistant: {
      sessionId: 's',
      ownerId: token.userId,
      expiresAt: Number.NaN,
    },
  } as unknown as Parameters<typeof scheduleRoomFollowUps>[0]['snapshot'];
  const sweeps: (number | undefined)[] = [];
  const followUps = (current: typeof snapshot) =>
    scheduleRoomFollowUps({
      snapshot: current,
      connectedUserIds: new Set([token.userId]),
      now,
      scheduleSweep: async (deadline) => {
        sweeps.push(deadline);
      },
      scheduleEmptyRoom: async () => {},
    });
  await followUps(snapshot);
  assert.ok(sweeps.includes(now));
  // The sweep the alarm runs drops the assistant, so nothing re-arms.
  const swept = expireRoomLive(snapshot as never, now);
  assert.ok(swept);
  sweeps.length = 0;
  await followUps(swept.state as typeof snapshot);
  assert.ok(!sweeps.includes(now));
});
