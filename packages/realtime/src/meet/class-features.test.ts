import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetClassFeatures,
  meetRoomStateView,
  type MeetRealtimeTokenPayload,
  meetRealtimeTokenPayloadSchema,
  releaseParticipant,
} from './index';

const HOST_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const NOW = '2026-07-31T12:00:00.000Z';

function token(): MeetRealtimeTokenPayload {
  return meetRealtimeTokenPayloadSchema.parse({
    accountId: HOST_ID,
    displayName: 'Host',
    exp: Math.floor(Date.parse(NOW) / 1000) + 600,
    limits: {},
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    participantKind: 'member',
    role: 'host',
    roomId: 'workspace:meeting',
    scopes: getMeetRealtimeScopesForRole('host'),
    userId: HOST_ID,
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('class feature switches', () => {
  it('stays off unless the server value is the exact string true', () => {
    expect(meetClassFeatures(undefined)).toEqual({
      attendance: false,
      timer: false,
    });
    expect(meetClassFeatures({})).toEqual({
      attendance: false,
      timer: false,
    });
    expect(
      meetClassFeatures({
        MEET_CLASS_ATTENDANCE_ENABLED: 'false',
        MEET_CLASS_TIMER_ENABLED: '1',
      })
    ).toEqual({ attendance: false, timer: false });
    expect(
      meetClassFeatures({
        MEET_CLASS_ATTENDANCE_ENABLED: 'true',
        MEET_CLASS_TIMER_ENABLED: 'true',
      })
    ).toEqual({ attendance: true, timer: true });
  });

  it('does not record attendance, expose the ledger, or start a timer while off', () => {
    vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'false');
    vi.stubEnv('MEET_CLASS_TIMER_ENABLED', 'false');
    const host = token();
    const admitted = admitOrHold(createMeetRoomSnapshot(), host, NOW);
    expect(admitted.state.attendance).toBeUndefined();
    expect(admitted.reply[0]).toMatchObject({
      type: 'ready',
      classAttendanceEnabled: false,
      classTimerEnabled: false,
    });
    expect(admitted.reply[0]).not.toHaveProperty('classTimer');
    const view = meetRoomStateView(
      {
        ...admitted.state,
        attendance: [
          {
            sourceKey: `${HOST_ID}:${NOW}`,
            deviceUserId: HOST_ID,
            kind: 'member',
            userId: HOST_ID,
            displayName: 'Host',
            joinedAt: NOW,
          },
        ],
      },
      host
    );
    expect(view).not.toHaveProperty('attendance');
    const started = applyMeetRoomCommand(admitted.state, {
      message: {
        type: 'classTimer.command',
        action: 'start',
        durationMs: 60_000,
      },
      now: NOW,
      token: host,
    });
    expect(started.state.classTimer ?? null).toBeNull();
    expect(started.reply[0]).toMatchObject({
      type: 'error',
      error: 'unavailable',
    });
    const released = releaseParticipant(
      admitted.state,
      HOST_ID,
      host.roomId,
      NOW
    );
    expect(released.state.attendance).toBeUndefined();
  });

  it('records attendance and accepts a timer when the server enables both', () => {
    vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'true');
    vi.stubEnv('MEET_CLASS_TIMER_ENABLED', 'true');
    const host = token();
    const admitted = admitOrHold(createMeetRoomSnapshot(), host, NOW);
    expect(admitted.state.attendance).toHaveLength(1);
    expect(admitted.reply[0]).toMatchObject({
      classAttendanceEnabled: true,
      classTimerEnabled: true,
    });
    const started = applyMeetRoomCommand(admitted.state, {
      message: {
        type: 'classTimer.command',
        action: 'start',
        durationMs: 60_000,
      },
      now: NOW,
      token: host,
    });
    expect(started.state.classTimer).toMatchObject({ status: 'running' });
  });
});
