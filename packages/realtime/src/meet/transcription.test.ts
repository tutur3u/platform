import { expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeClientMessageSchema,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  normalizeTranscriptionConsent,
  transcriptionClientSnapshot,
} from './transcription';

const now = '2026-09-09T00:00:00Z';
const account = '11111111-1111-4111-8111-111111111111';
const device = '22222222-2222-4222-8222-222222222222';
const host = meetRealtimeTokenPayloadSchema.parse({
  userId: '33333333-3333-4333-8333-333333333333',
  exp: 2000000000,
  role: 'host',
  scopes: getMeetRealtimeScopesForRole('host'),
  mode: 'call',
  limits: {},
  meetingId: account,
  roomId: 'room',
  wsId: account,
});
const guest = {
  ...host,
  userId: device,
  accountId: account,
  role: 'speaker' as const,
  scopes: getMeetRealtimeScopesForRole('speaker'),
};
const initial = () =>
  admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), host, now).state,
    guest,
    now
  ).state;
function run(
  state: ReturnType<typeof initial>,
  message: unknown,
  actor = host
) {
  return applyMeetRoomCommand(state, {
    message: meetRealtimeClientMessageSchema.parse(message),
    token: actor,
    now,
  });
}

const sessionId = '44444444-4444-4444-8444-444444444444';
const start = {
  type: 'transcription.state',
  state: {
    active: true,
    sessionId,
    startedBy: host.userId,
    language: 'vi+en',
    consentRequired: true,
  },
};
it('validates state and consent at the websocket boundary', () => {
  expect(meetRealtimeClientMessageSchema.safeParse(start).success).toBe(true);
  for (const patch of [
    { sessionId: null },
    { language: 'fr' },
    { consentRequired: false },
    { startedBy: 'spoof' },
    { active: 'true' },
  ])
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        ...start,
        state: { ...start.state, ...patch },
      }).success
    ).toBe(false);
  expect(
    meetRealtimeClientMessageSchema.safeParse({
      type: 'transcription.consent',
      userId: device,
      allowed: true,
    }).success
  ).toBe(true);
  expect(
    meetRealtimeClientMessageSchema.safeParse({
      type: 'transcription.consent',
      userId: 'bad',
      allowed: true,
    }).success
  ).toBe(false);
  expect(
    meetRealtimeClientMessageSchema.safeParse({
      type: 'transcription.consent',
      userId: device,
      allowed: 'yes',
    }).success
  ).toBe(false);
});
it('allows only admitted hosts to change state and preserves other room data', () => {
  const state = initial();
  const result = run(state, start);
  expect(result.state.transcription).toEqual(start.state);
  expect(result.state.presence).toEqual(state.presence);
  expect(result.broadcast).toEqual([start]);
  expect(run(state, start, guest).reply).toMatchObject([
    { error: 'permission_denied' },
  ]);
  expect(run(createMeetRoomSnapshot(), start).reply).toMatchObject([
    { error: 'awaiting_admission' },
  ]);
  expect(
    run(state, { ...start, state: { ...start.state, startedBy: device } }).reply
  ).toMatchObject([{ error: 'permission_denied' }]);
  expect(
    run(state, start, {
      ...guest,
      scopes: getMeetRealtimeScopesForRole('host'),
    }).reply
  ).toMatchObject([{ error: 'permission_denied' }]);
});
it('binds consent to the participant device, including withdrawal; host cannot override', () => {
  const message = {
    type: 'transcription.consent',
    userId: device,
    allowed: true,
  };
  const result = run(run(initial(), start).state, message, guest);
  expect(result.state.transcriptionConsents).toEqual({
    sessionId,
    decisions: { [device]: true },
  });
  expect(result.broadcast).toEqual([]);
  expect(result.toManagers).toEqual([]);
  expect(result.direct).toEqual([{ userId: host.userId, message }]);
  expect(result.reply).toEqual([message]);
  const withdrawn = run(result.state, { ...message, allowed: false }, guest);
  expect(withdrawn.state.transcriptionConsents?.decisions[device]).toBe(false);
  for (const actor of [host, { ...guest, userId: account }]) {
    const denied = run(result.state, message, actor);
    expect(denied.state.transcriptionConsents).toEqual(
      result.state.transcriptionConsents
    );
    expect(denied.reply[0]).toMatchObject({ type: 'error' });
    expect(denied.direct).toEqual([]);
    expect(denied.broadcast).toEqual([]);
  }
});
it('rejects waiting sockets even with host role and no longer admits removed sockets', () => {
  const state = initial();
  delete state.presence[device];
  const message = {
    type: 'transcription.consent',
    userId: device,
    allowed: true,
  };
  expect(run(state, message, guest).reply).toMatchObject([
    { error: 'awaiting_admission' },
  ]);
  state.waiting[host.userId] = {
    userId: host.userId,
    displayName: 'Host',
    requestedAt: now,
  };
  expect(run(state, start).broadcast).toEqual([]);
});
it('replays active state on admission, but the consent roster only to its host', () => {
  let state = run(initial(), start).state;
  state = run(
    state,
    { type: 'transcription.consent', userId: device, allowed: false },
    guest
  ).state;
  const hostReplay = admitOrHold(state, host, now).reply;
  expect(hostReplay).toContainEqual(start);
  expect(hostReplay.filter((m) => m.type === 'transcription.consent')).toEqual(
    []
  );
  const guestReplay = admitOrHold(state, guest, now).reply;
  expect(guestReplay).toContainEqual(start);
  const outsider = {
    ...guest,
    userId: '55555555-5555-4555-8555-555555555555',
    accountId: undefined,
  };
  expect(
    admitOrHold(state, outsider, now).reply.filter(
      (m) => m.type === 'transcription.consent'
    )
  ).toEqual([]);
  const waiting = { ...outsider, admission: 'lobby' as const };
  expect(
    admitOrHold(state, waiting, now).reply.filter((m) =>
      m.type.startsWith('transcription.')
    )
  ).toEqual([]);
});
it('resets consent for a new session and supports host stop', () => {
  let state = run(initial(), start).state;
  state = run(
    state,
    { type: 'transcription.consent', userId: device, allowed: true },
    guest
  ).state;
  const stop = { ...start, state: { ...start.state, active: false } };
  state = run(state, stop).state;
  expect(state.transcription?.active).toBe(false);
  expect(state.transcriptionConsents).toBeUndefined();
  state = run(state, {
    ...start,
    state: {
      ...start.state,
      sessionId: '66666666-6666-4666-8666-666666666666',
    },
  }).state;
  expect(state.transcriptionConsents).toEqual({
    sessionId: state.transcription?.sessionId,
    decisions: {},
  });
});

it('room end clears session consent and disables transcription', () => {
  let state = run(initial(), start).state;
  state = run(
    state,
    { type: 'transcription.consent', userId: device, allowed: true },
    guest
  ).state;
  state = run(state, { type: 'room.end' }).state;
  expect(state.transcriptionConsents).toBeUndefined();
  expect(state.transcription?.active).toBe(false);
});

it('client snapshots expose only self consent and counts, even for the host', () => {
  let state = run(initial(), start).state;
  state = run(
    state,
    { type: 'transcription.consent', userId: device, allowed: true },
    guest
  ).state;
  const view = transcriptionClientSnapshot(state, host.userId);
  expect(view).toMatchObject({
    transcriptionConsent: { counts: { allowed: 1, declined: 0 } },
  });
  expect(JSON.stringify(view)).not.toContain(device);
  expect(transcriptionClientSnapshot(state, device)).toMatchObject({
    transcriptionConsent: { allowed: true },
  });
  expect(transcriptionClientSnapshot(state, 'outsider')).toEqual({});
});
it('drops unscoped legacy consent and mismatched sessions on restoration', () => {
  const state = run(initial(), start).state;
  state.transcriptionConsents = {
    sessionId: '66666666-6666-4666-8666-666666666666',
    decisions: { [device]: true },
  };
  expect(
    normalizeTranscriptionConsent(state).transcriptionConsents
  ).toBeUndefined();
  expect(
    normalizeTranscriptionConsent({ ...state, ended: true })
      .transcriptionConsents
  ).toBeUndefined();
});
