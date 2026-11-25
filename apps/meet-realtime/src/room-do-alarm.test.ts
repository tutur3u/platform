import assert from 'node:assert/strict';
import { afterEach, test } from 'bun:test';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';
import { roomAlarmTime } from './room-maintenance';

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
