import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  admitOrHold,
  aggregateAttendance,
  applyMeetRoomCommand,
  ATTENDANCE_RETENTION_MS,
  MEET_ATTENDANCE_RETENTION_PROOF,
  attendanceCsv,
  maintainAttendanceCopy,
  nextAttendanceAlarm,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRoomStateView,
  type MeetRealtimeTokenPayload,
  meetRealtimeTokenPayloadSchema,
  pruneMeetPresence,
  releaseParticipant,
} from './index';

const HOST_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const GUEST_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const DEVICE_B = 'c1f0c9b7-1a4e-4b0c-9d0a-0a1c2b3d4e5f';
const NOW = '2026-07-31T12:00:00.000Z';

function token(
  overrides: Partial<MeetRealtimeTokenPayload> = {}
): MeetRealtimeTokenPayload {
  const role = overrides.role ?? 'host';
  return meetRealtimeTokenPayloadSchema.parse({
    accountId: HOST_ID,
    displayName: 'Host',
    exp: Math.floor(Date.parse(NOW) / 1000) + 600,
    limits: {},
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    participantKind: 'member',
    role,
    roomId: 'workspace:meeting',
    scopes: getMeetRealtimeScopesForRole(role),
    userId: HOST_ID,
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    ...overrides,
  });
}

describe('attendance ledger', () => {
  beforeEach(() => {
    vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'true');
    vi.stubEnv(
      'MEET_ATTENDANCE_RETENTION_VERIFIED',
      MEET_ATTENDANCE_RETENTION_PROOF
    );
    vi.stubEnv('MEET_CLASS_TIMER_ENABLED', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('records a member on admit and does not open a second interval on reconnect', () => {
    const host = token();
    const admitted = admitOrHold(createMeetRoomSnapshot(), host, NOW);
    expect(admitted.state.attendance).toEqual([
      expect.objectContaining({
        kind: 'member',
        userId: HOST_ID,
        deviceUserId: HOST_ID,
        displayName: 'Host',
        joinedAt: NOW,
      }),
    ]);
    const rejoined = applyMeetRoomCommand(admitted.state, {
      message: { type: 'presence.join', displayName: 'Host' },
      now: new Date(Date.parse(NOW) + 5_000).toISOString(),
      token: host,
    });
    expect(rejoined.state.attendance).toHaveLength(1);
    expect(rejoined.state.attendance?.[0]?.leftAt).toBeUndefined();
  });

  it('keeps lobby guests out until they are admitted, then stores the guest id and name', () => {
    const host = token();
    const guest = token({
      accountId: GUEST_ID,
      admission: 'lobby',
      displayName: 'Lan',
      guest: true,
      participantKind: 'guest',
      role: 'speaker',
      userId: GUEST_ID,
    });
    const waiting = admitOrHold(createMeetRoomSnapshot(), guest, NOW);
    expect(waiting.state.presence[GUEST_ID]).toBeUndefined();
    expect(waiting.state.attendance).toBeUndefined();
    expect(waiting.state.waiting[GUEST_ID]?.participantKind).toBe('guest');
    const room = admitOrHold(waiting.state, host, NOW).state;
    const admitted = applyMeetRoomCommand(room, {
      message: { type: 'admission.decide', admit: true, userId: GUEST_ID },
      now: NOW,
      token: host,
    });
    expect(admitted.state.attendance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'guest',
          guestId: GUEST_ID,
          displayName: 'Lan (guest)',
          joinedAt: NOW,
        }),
      ])
    );
    expect(admitted.direct.map((entry) => entry.message.type)).toContain(
      'classTimer'
    );
  });

  it('closes the open interval when the participant is released after presence was pruned', () => {
    const host = token();
    const admitted = admitOrHold(createMeetRoomSnapshot(), host, NOW).state;
    const later = '2026-07-31T12:20:00.000Z';
    const pruned = pruneMeetPresence(admitted, Date.parse(later), new Set());
    expect(pruned.presence[HOST_ID]).toBeUndefined();
    const released = releaseParticipant(pruned, HOST_ID, host.roomId, later);
    expect(released.state.attendance?.[0]?.leftAt).toBe(later);
  });

  it('unions overlapping devices and rounds the joined minutes', () => {
    const rows = aggregateAttendance(
      [
        {
          sourceKey: `${HOST_ID}:${NOW}`,
          deviceUserId: HOST_ID,
          kind: 'member',
          userId: HOST_ID,
          displayName: 'Earlier',
          joinedAt: NOW,
          leftAt: '2026-07-31T12:10:00.000Z',
        },
        {
          sourceKey: `${DEVICE_B}:2026-07-31T12:05:00.000Z`,
          deviceUserId: DEVICE_B,
          kind: 'member',
          userId: HOST_ID,
          displayName: 'Later',
          joinedAt: '2026-07-31T12:05:00.000Z',
          leftAt: '2026-07-31T12:15:00.000Z',
        },
        {
          sourceKey: `${GUEST_ID}:short`,
          deviceUserId: GUEST_ID,
          kind: 'guest',
          guestId: GUEST_ID,
          displayName: 'Short',
          joinedAt: '2026-07-31T12:00:00.000Z',
          leftAt: '2026-07-31T12:00:20.000Z',
        },
        {
          sourceKey: `${GUEST_ID}:half`,
          deviceUserId: DEVICE_B,
          kind: 'guest',
          guestId: '11111111-1111-4111-8111-111111111111',
          displayName: 'Half',
          joinedAt: '2026-07-31T12:00:00.000Z',
          leftAt: '2026-07-31T12:00:30.000Z',
        },
      ],
      '2026-07-31T13:00:00.000Z'
    );
    expect(rows.find((row) => row.name === 'Later')).toMatchObject({
      name: 'Later',
      firstJoin: NOW,
      totalMinutes: 15,
      kind: 'member',
    });
    expect(rows.some((row) => 'userId' in row || 'guestId' in row)).toBe(false);
    expect(rows.find((row) => row.name === 'Short')?.totalMinutes).toBe(0);
    expect(rows.find((row) => row.name === 'Half')?.totalMinutes).toBe(1);
  });

  it('escapes CSV cells and hides the ledger from the browser room view', () => {
    const csv = attendanceCsv([
      {
        name: '=HYPERLINK("http://evil")',
        firstJoin: NOW,
        totalMinutes: 4,
        kind: 'guest',
      },
      {
        name: 'A "Bee"',
        firstJoin: NOW,
        totalMinutes: 1,
        kind: 'member',
      },
    ]);
    expect(csv.split('\n')[0]).toBe('name,first_join,total_minutes,kind');
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(csv).toContain('"A ""Bee"""');
    expect(csv).not.toContain('user_id');
    expect(csv).not.toContain(GUEST_ID);
    const host = token();
    const speaker = token({
      role: 'speaker',
      userId: GUEST_ID,
      accountId: GUEST_ID,
    });
    const state = {
      ...createMeetRoomSnapshot(),
      attendance: [
        {
          sourceKey: `${HOST_ID}:${NOW}`,
          deviceUserId: HOST_ID,
          kind: 'member' as const,
          userId: HOST_ID,
          displayName: 'Host',
          joinedAt: NOW,
        },
      ],
    };
    expect(meetRoomStateView(state, host)).not.toHaveProperty('attendance');
    expect(meetRoomStateView(state, speaker)).not.toHaveProperty('attendance');
    expect(meetRoomStateView(state, speaker).settings).toBeUndefined();
  });

  it('caps an open interval at the room end in the fallback export', () => {
    const rows = aggregateAttendance(
      [
        {
          sourceKey: `${HOST_ID}:${NOW}`,
          deviceUserId: HOST_ID,
          kind: 'member',
          userId: HOST_ID,
          displayName: 'Ada',
          joinedAt: NOW,
        },
      ],
      '2026-07-31T13:00:00.000Z',
      '2026-07-31T12:10:00.000Z'
    );
    expect(rows[0]?.totalMinutes).toBe(10);
  });
});

describe('attendance copy expiry', () => {
  const open = {
    sourceKey: `${HOST_ID}:${NOW}`,
    deviceUserId: HOST_ID,
    kind: 'member' as const,
    userId: HOST_ID,
    displayName: 'Ada',
    joinedAt: NOW,
  };

  it('expires a copy from joined_at without waiting for a read', () => {
    const nowMs = Date.parse(NOW) + ATTENDANCE_RETENTION_MS + 1_000;
    const now = new Date(nowMs).toISOString();
    const freshJoined = new Date(nowMs - 60_000).toISOString();
    const kept = maintainAttendanceCopy(
      [open, { ...open, sourceKey: 'fresh', joinedAt: freshJoined }],
      true,
      now
    );
    expect(kept?.map((row) => row.sourceKey)).toEqual(['fresh']);
    expect(nextAttendanceAlarm(kept, nowMs)).toBe(
      Date.parse(freshJoined) + ATTENDANCE_RETENTION_MS
    );
    expect(nextAttendanceAlarm([open], nowMs)).toBeUndefined();
  });

  it('closes open intervals when collection is off', () => {
    const closed = maintainAttendanceCopy([open], false, NOW);
    expect(closed?.[0]?.leftAt).toBe(NOW);
  });
});
