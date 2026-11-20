import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyClassTimerCommand } from './class-timer';
import { applyMeetClassService } from './class-service';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  formatClassTimer,
  getMeetRealtimeScopesForRole,
  MEET_CLASS_COHOST_SCOPE,
  MEET_ATTENDANCE_RETENTION_PROOF,
  meetClassFeatures,
  type MeetRealtimeTokenPayload,
  meetRealtimeClientMessageSchema,
  meetRealtimeTokenPayloadSchema,
} from './index';

const HOST_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const SPEAKER_ID = 'c1f0c9b7-1a4e-4b0c-9d0a-0a1c2b3d4e5f';
const COHOST_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const NOW = '2026-07-31T12:00:00.000Z';
const MEETING = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';

function token(
  overrides: Partial<MeetRealtimeTokenPayload> = {}
): MeetRealtimeTokenPayload {
  const role = overrides.role ?? 'host';
  return meetRealtimeTokenPayloadSchema.parse({
    accountId: role === 'host' ? HOST_ID : SPEAKER_ID,
    displayName: role === 'host' ? 'Host' : 'Speaker',
    exp: Math.floor(Date.parse(NOW) / 1000) + 600,
    limits: {},
    meetingId: MEETING,
    role,
    roomId: 'workspace:meeting',
    scopes: getMeetRealtimeScopesForRole(role),
    userId: role === 'host' ? HOST_ID : SPEAKER_ID,
    wsId: WS,
    ...overrides,
  });
}

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

function run(
  state: ReturnType<typeof createMeetRoomSnapshot>,
  message: Parameters<typeof applyMeetRoomCommand>[1]['message'],
  as: MeetRealtimeTokenPayload,
  now = NOW
) {
  if (message.type !== 'classTimer.command')
    return applyMeetRoomCommand(state, { message, now, token: as });
  const actorRole =
    as.role === 'host'
      ? 'host'
      : as.scopes.includes(MEET_CLASS_COHOST_SCOPE)
        ? 'cohost'
        : null;
  if (!actorRole) {
    const applied = applyClassTimerCommand(
      state.classTimer,
      { action: message.action, durationMs: message.durationMs },
      as,
      now
    );
    return {
      state,
      reply: applied.ok ? [] : [{ error: applied.error }],
      broadcast: [],
    };
  }
  const applied = applyMeetClassService(
    state,
    {
      aud: 'meet-service',
      purpose: 'class-timer',
      roomId: as.roomId,
      exp: Math.floor(Date.parse(now) / 1000) + 60,
      action: message.action,
      durationMs: message.durationMs,
      actorUserId: as.userId,
      actorRole,
    },
    meetClassFeatures(),
    now
  );
  const error =
    applied.body &&
    typeof applied.body === 'object' &&
    'error' in applied.body &&
    typeof applied.body.error === 'string'
      ? applied.body.error
      : null;
  return {
    state: applied.snapshot,
    reply: error ? [{ error }] : [],
    broadcast: applied.broadcast,
  };
}

describe('class timer', () => {
  it('accepts preset durations and rejects bounds outside 1 to 180 minutes', () => {
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'classTimer.command',
        action: 'start',
        durationMs: 60_000,
      }).success
    ).toBe(true);
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'classTimer.command',
        action: 'start',
        durationMs: 30_000,
      }).success
    ).toBe(false);
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'classTimer.command',
        action: 'start',
        durationMs: 1.5,
      }).success
    ).toBe(false);
    expect(formatClassTimer(61_000)).toBe('01:01');
    expect(formatClassTimer(3_600_000)).toBe('1:00:00');
  });

  it('lets the host and a co-host start, and only the host pause, resume, or stop', () => {
    const host = token();
    const cohost = token({
      role: 'speaker',
      userId: COHOST_ID,
      accountId: COHOST_ID,
      scopes: [
        ...getMeetRealtimeScopesForRole('speaker'),
        MEET_CLASS_COHOST_SCOPE,
      ],
    });
    const speaker = token({ role: 'speaker' });
    let state = admitOrHold(createMeetRoomSnapshot(), host, NOW).state;
    state = admitOrHold(state, cohost, NOW).state;

    const socket = applyMeetRoomCommand(state, {
      message: {
        type: 'classTimer.command',
        action: 'start',
        durationMs: 60_000,
      },
      now: NOW,
      token: cohost,
    });
    expect(socket.reply[0]).toMatchObject({ error: 'unavailable' });
    expect(socket.state.classTimer ?? null).toBeNull();

    const denied = run(
      state,
      { type: 'classTimer.command', action: 'start', durationMs: 60_000 },
      speaker
    );
    expect(denied.reply[0]).toMatchObject({ error: 'permission_denied' });
    expect(denied.state.classTimer ?? null).toBeNull();

    const started = run(
      state,
      { type: 'classTimer.command', action: 'start', durationMs: 60_000 },
      cohost
    );
    expect(started.state.classTimer).toMatchObject({
      status: 'running',
      durationMs: 60_000,
      id: `${COHOST_ID}:${NOW}:60000`,
    });
    expect(started.broadcast[0]).toMatchObject({
      type: 'classTimer',
      serverNow: NOW,
    });

    const pausedByCohost = run(
      started.state,
      { type: 'classTimer.command', action: 'pause' },
      cohost
    );
    expect(pausedByCohost.reply[0]).toMatchObject({
      error: 'permission_denied',
    });
    expect(pausedByCohost.state.classTimer?.status).toBe('running');

    const paused = run(
      started.state,
      { type: 'classTimer.command', action: 'pause' },
      host
    );
    expect(paused.state.classTimer).toMatchObject({
      status: 'paused',
      remainingMs: 60_000,
    });
    expect(paused.state.classTimer?.endsAt).toBeUndefined();

    const resumed = run(
      paused.state,
      { type: 'classTimer.command', action: 'resume' },
      host
    );
    expect(resumed.state.classTimer?.status).toBe('running');
    expect(resumed.state.classTimer?.endsAt).toBe(
      new Date(Date.parse(NOW) + 60_000).toISOString()
    );

    const stopped = run(
      resumed.state,
      { type: 'classTimer.command', action: 'stop' },
      host
    );
    expect(stopped.state.classTimer).toBeNull();
    const idle = run(
      stopped.state,
      { type: 'classTimer.command', action: 'stop' },
      host
    );
    expect(idle.broadcast).toEqual([]);
    expect(idle.state.classTimer ?? null).toBeNull();
  });

  it('rejects a missing or too-long duration and replaces a running timer', () => {
    const host = token();
    const state = admitOrHold(createMeetRoomSnapshot(), host, NOW).state;
    const missing = run(
      state,
      { type: 'classTimer.command', action: 'start' },
      host
    );
    expect(missing.reply[0]).toMatchObject({ error: 'invalid_duration' });
    const tooLong = run(
      state,
      { type: 'classTimer.command', action: 'start', durationMs: 181 * 60_000 },
      host
    );
    expect(tooLong.reply[0]).toMatchObject({ error: 'invalid_duration' });
    expect(tooLong.state.classTimer ?? null).toBeNull();
    const started = run(
      state,
      { type: 'classTimer.command', action: 'start', durationMs: 60_000 },
      host
    );
    const replaced = run(
      started.state,
      { type: 'classTimer.command', action: 'start', durationMs: 180 * 60_000 },
      host
    );
    expect(replaced.state.classTimer?.durationMs).toBe(180 * 60_000);
  });

  it('marks a running timer ended on the next command and tells the room', () => {
    const host = token();
    const started = run(
      admitOrHold(createMeetRoomSnapshot(), host, NOW).state,
      { type: 'classTimer.command', action: 'start', durationMs: 60_000 },
      host
    );
    const later = new Date(Date.parse(NOW) + 61_000).toISOString();
    const expired = run(
      started.state,
      {
        type: 'presence.update',
        media: {
          audioEnabled: false,
          screenEnabled: false,
          videoEnabled: false,
        },
      },
      host,
      later
    );
    expect(expired.state.classTimer).toMatchObject({
      status: 'ended',
      remainingMs: 0,
    });
    expect(expired.state.classTimer?.endsAt).toBeUndefined();
    expect(expired.broadcast).toContainEqual({
      type: 'classTimer',
      timer: expired.state.classTimer,
      serverNow: later,
    });
  });

  it('includes the timer on an admitted ready message and hides it in the lobby', () => {
    const host = token();
    const guest = token({
      admission: 'lobby',
      role: 'speaker',
      userId: SPEAKER_ID,
    });
    const room = run(
      admitOrHold(createMeetRoomSnapshot(), host, NOW).state,
      { type: 'classTimer.command', action: 'start', durationMs: 300_000 },
      host
    ).state;
    const admitted = admitOrHold(room, host, NOW);
    expect(admitted.reply[0]).toMatchObject({
      type: 'ready',
      admission: 'admitted',
      classRole: 'host',
      classTimer: { status: 'running', durationMs: 300_000 },
      serverNow: NOW,
    });
    const waiting = admitOrHold(room, guest, NOW);
    expect(waiting.reply[0]).toMatchObject({
      type: 'ready',
      admission: 'waiting',
      classRole: 'participant',
    });
    expect(waiting.reply[0]).not.toHaveProperty('classTimer');
    expect(
      waiting.state.attendance?.some((row) => row.deviceUserId === SPEAKER_ID)
    ).toBe(false);
  });
});
