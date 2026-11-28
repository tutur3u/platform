import assert from 'node:assert/strict';
import { afterEach, test } from 'bun:test';
import {
  admitOrHold,
  CloudflareSfuError,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  MEET_MEDIA_CLEANUP_MAX_ATTEMPTS,
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
  scopes: [...getMeetRealtimeScopesForRole('host'), 'meet:server'],
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

function mediaCleanupFixture(options: {
  env?: Partial<MeetRoomEnv>;
  cleanupAttempts?: number;
  nextCleanupAt?: number;
  ended?: boolean;
}) {
  let clock = Date.parse('2026-11-28T08:00:00Z');
  const OriginalDate = Date;
  globalThis.Date = class extends OriginalDate {
    constructor(value?: string | number) {
      super(value ?? clock);
    }
    static override now() {
      return clock;
    }
  } as unknown as DateConstructor;

  const base = admitOrHold(
    createMeetRoomSnapshot(),
    token,
    new Date(clock).toISOString()
  ).state;
  const snapshot = {
    ...base,
    ended: options.ended ?? true,
    presence: options.ended === false ? base.presence : {},
    lifecycle: { version: 1, hadConnection: true },
    budget: {
      expiresAt: options.ended === false ? clock + 3_600_000 : clock,
      accountedAt: clock,
      participantMilliseconds: 0,
      maxPublishers: 10,
      maxViewers: 10,
      pendingPublications: [
        {
          sessionId: 'sfu-session-1',
          userId: token.userId,
          trackName: 'audio',
          mid: '0',
        },
      ],
      cleanupAttempts: options.cleanupAttempts,
      nextCleanupAt: options.nextCleanupAt ?? 0,
    },
  };
  const values = new Map<string, unknown>([['snapshot', snapshot]]);
  let alarm: number | null = null;
  const alarms: number[] = [];
  let writes = 0;
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      if (key === 'snapshot') writes++;
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
  let env: MeetRoomEnv = {
    CLOUDFLARE_REALTIME_APP_ID: 'app',
    CLOUDFLARE_REALTIME_APP_SECRET: 'secret',
    ...options.env,
  } as MeetRoomEnv;
  const makeRoom = () =>
    new MeetRoomDurableObject(
      {
        storage,
        setWebSocketAutoResponse: () => {},
        getWebSockets: () => [],
        waitUntil: () => {},
        blockConcurrencyWhile: (run: () => Promise<void>) => run(),
      } as unknown as DurableObjectState,
      env
    );
  let room = makeRoom();
  const warnings: unknown[][] = [];
  const errors: unknown[][] = [];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args: unknown[]) => warnings.push(args);
  console.error = (...args: unknown[]) => errors.push(args);

  return {
    get room() {
      return room;
    },
    setEnv(next: Partial<MeetRoomEnv>) {
      env = { ...env, ...next };
      room = makeRoom();
    },
    restart() {
      room = makeRoom();
      return room;
    },
    setSfu(client: {
      closeTracks: (input: unknown) => Promise<unknown>;
      getSession: (sessionId: string) => Promise<unknown>;
    }) {
      (room as unknown as { sfuClient: () => unknown }).sfuClient = () =>
        client;
    },
    advanceToAlarm() {
      assert.ok(alarm !== null, 'expected an armed alarm');
      clock = alarm;
      alarm = null;
    },
    setClock(next: number) {
      clock = next;
    },
    currentAlarm: () => alarm,
    alarms,
    writes: () => writes,
    warnings,
    errors,
    snapshot: () =>
      values.get('snapshot') as {
        budget?: {
          pendingPublications?: unknown[];
          cleanupAttempts?: number;
          cleanupStopped?: boolean;
          nextCleanupAt?: number;
        };
      },
    restore() {
      globalThis.Date = OriginalDate;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}

test('bounds media cleanup retries, stops arming alarms and emits warn then one terminal error', async () => {
  const f = mediaCleanupFixture({});
  try {
    let closeCalls = 0;
    let getCalls = 0;
    const sfu = {
      closeTracks: async () => {
        closeCalls++;
        throw new CloudflareSfuError(
          'cloudflare_sfu_request_failed:503 {"errorCode":"temporary"}',
          503,
          'temporary'
        );
      },
      getSession: async () => {
        getCalls++;
        throw new CloudflareSfuError(
          'cloudflare_sfu_request_failed:503 {"errorCode":"temporary"}',
          503,
          'temporary'
        );
      },
    };
    f.setSfu(sfu);
    await f.room.alarm();
    while (f.currentAlarm() !== null) {
      f.advanceToAlarm();
      await f.room.alarm();
    }
    assert.equal(closeCalls, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS);
    assert.equal(getCalls, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS);
    assert.equal(f.alarms.length, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS - 1);
    assert.equal(f.writes(), MEET_MEDIA_CLEANUP_MAX_ATTEMPTS);
    assert.equal(f.warnings.length, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS - 1);
    assert.equal(f.errors.length, 1);
    assert.equal(f.snapshot().budget?.cleanupStopped, true);
    assert.equal(f.snapshot().budget?.nextCleanupAt, undefined);
    assert.equal(f.currentAlarm(), null);

    // Restarting or receiving a follow-up alarm does zero work and arms no alarm.
    f.restart();
    f.setSfu(sfu);
    f.setClock(Date.now() + 86_400_000);
    await f.room.alarm();
    assert.equal(closeCalls, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS);
    assert.equal(getCalls, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS);
    assert.equal(f.currentAlarm(), null);
  } finally {
    f.restore();
  }
});

test('mid-I/O Durable Object restarts cannot replenish media cleanup attempts', async () => {
  const f = mediaCleanupFixture({});
  try {
    let closeCalls = 0;
    for (let i = 0; i < MEET_MEDIA_CLEANUP_MAX_ATTEMPTS + 4; i++) {
      f.restart();
      f.setSfu({
        closeTracks: async () => {
          closeCalls++;
          // Simulate isolate crash/abort before provider responds.
          throw new Error('isolate_evicted');
        },
        getSession: async () => {
          throw new Error('isolate_evicted');
        },
      });
      if (f.currentAlarm() !== null) f.advanceToAlarm();
      await f.room.alarm();
    }
    assert.equal(closeCalls, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS);
    assert.equal(f.snapshot().budget?.cleanupStopped, true);
    assert.equal(f.currentAlarm(), null);
  } finally {
    f.restore();
  }
});

test('confirms HTTP 404 session-gone on first attempt with zero warnings, errors or follow-up alarms', async () => {
  const f = mediaCleanupFixture({});
  try {
    let closeCalls = 0;
    let getCalls = 0;
    f.setSfu({
      closeTracks: async () => {
        closeCalls++;
        throw new CloudflareSfuError(
          'cloudflare_sfu_request_failed:404 {"errorCode":"not_found_session_error"}',
          404,
          'not_found_session_error',
          'Session not found'
        );
      },
      getSession: async () => {
        getCalls++;
        return { tracks: [] };
      },
    });
    await f.room.alarm();
    assert.equal(closeCalls, 1);
    assert.equal(getCalls, 0);
    assert.deepEqual(f.snapshot().budget?.pendingPublications, []);
    assert.equal(f.snapshot().budget?.cleanupStopped, undefined);
    assert.equal(f.warnings.length, 0);
    assert.equal(f.errors.length, 0);
    assert.equal(f.currentAlarm(), null);
  } finally {
    f.restore();
  }
});

test('retries unrecognized 404 responses within the bound and logs status/errorCode only with one terminal error', async () => {
  const f = mediaCleanupFixture({});
  try {
    let closeCalls = 0;
    const html404 = new CloudflareSfuError(
      'cloudflare_sfu_request_failed:404 <html><body>proxy-secret-body sfu-session-1</body></html>',
      404
    );
    const route404 = new CloudflareSfuError(
      'cloudflare_sfu_request_failed:404 {"errorCode":"route_not_found","errorDescription":"secret-session-1"}',
      404,
      'route_not_found',
      'secret-session-1'
    );
    f.setSfu({
      closeTracks: async () => {
        closeCalls++;
        throw closeCalls === 1 ? html404 : route404;
      },
      getSession: async () => {
        throw closeCalls === 1 ? html404 : route404;
      },
    });
    await f.room.alarm();
    while (f.currentAlarm() !== null) {
      f.advanceToAlarm();
      await f.room.alarm();
    }
    assert.equal(closeCalls, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS);
    assert.equal(f.snapshot().budget?.cleanupStopped, true);
    assert.equal(f.snapshot().budget?.pendingPublications?.length, 1);
    assert.equal(f.warnings.length, MEET_MEDIA_CLEANUP_MAX_ATTEMPTS - 1);
    assert.equal(f.errors.length, 1);
    assert.deepEqual(f.warnings[0]?.[1], {
      reason: 'sfu_unrecognized_not_found',
      status: 404,
      attempts: 1,
      maxAttempts: MEET_MEDIA_CLEANUP_MAX_ATTEMPTS,
      remaining: 1,
    });
    assert.deepEqual(f.errors[0]?.[1], {
      reason: 'sfu_unrecognized_not_found',
      status: 404,
      errorCode: 'route_not_found',
      attempts: MEET_MEDIA_CLEANUP_MAX_ATTEMPTS,
      maxAttempts: MEET_MEDIA_CLEANUP_MAX_ATTEMPTS,
      remaining: 1,
    });
    const serialized = JSON.stringify([...f.warnings, ...f.errors]);
    assert.ok(!serialized.includes('proxy-secret-body'));
    assert.ok(!serialized.includes('secret-session-1'));
    assert.ok(!serialized.includes('sfu-session-1'));
    assert.equal(f.currentAlarm(), null);
  } finally {
    f.restore();
  }
});

test('legacy stuck snapshots at attempt 32 terminate after one final check', async () => {
  const f = mediaCleanupFixture({ cleanupAttempts: 32, nextCleanupAt: 0 });
  try {
    let closeCalls = 0;
    f.setSfu({
      closeTracks: async () => {
        closeCalls++;
        throw new CloudflareSfuError('cloudflare_sfu_request_failed:503', 503);
      },
      getSession: async () => {
        throw new CloudflareSfuError('cloudflare_sfu_request_failed:503', 503);
      },
    });
    await f.room.alarm();
    assert.equal(closeCalls, 1);
    assert.equal(f.snapshot().budget?.cleanupStopped, true);
    assert.equal(f.errors.length, 1);
    assert.equal(f.currentAlarm(), null);
  } finally {
    f.restore();
  }
});

for (const fenceValue of ['true', '1']) {
  test(`MEET_MEDIA_CLEANUP_DISABLED=${fenceValue} halts SFU calls, writes and alarms until lifted`, async () => {
    const f = mediaCleanupFixture({
      env: { MEET_MEDIA_CLEANUP_DISABLED: fenceValue },
    });
    try {
      let closeCalls = 0;
      const sfu = {
        closeTracks: async () => {
          closeCalls++;
          return {};
        },
        getSession: async () => ({ tracks: [] }),
      };
      f.setSfu(sfu);
      await f.room.alarm();
      assert.equal(closeCalls, 0);
      assert.equal(f.writes(), 0);
      assert.equal(f.alarms.length, 0);
      assert.equal(f.snapshot().budget?.pendingPublications?.length, 1);

      // Lifting the fence resumes cleanup on the next wake and clears pending tracks.
      f.setEnv({ MEET_MEDIA_CLEANUP_DISABLED: 'false' });
      f.setSfu(sfu);
      await f.room.alarm();
      assert.equal(closeCalls, 1);
      assert.deepEqual(f.snapshot().budget?.pendingPublications, []);
      assert.equal(f.currentAlarm(), null);
    } finally {
      f.restore();
    }
  });
}
