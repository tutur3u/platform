import { expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeClientMessageSchema,
  meetRealtimeTokenPayloadSchema,
  releaseParticipant,
} from './index';
import { canReadRoomNotes } from './room-controls';

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
it.each(['participant.remove', 'admission.forget'])(
  'revokes remembered account permission through a device with %s',
  (type) => {
    const state = initial();
    state.approved = { [account]: { userId: account, displayName: 'Guest' } };
    expect(
      run(state, { type, userId: device }).state.approved?.[account]
    ).toBeUndefined();
  }
);
it('keeps opt-in notes sharing when only recording policy changes', () => {
  const state = initial();
  state.settings = { shareNotes: true, shareNotesAfterMeeting: true };
  expect(
    run(state, {
      type: 'room.settings.update',
      settings: { shareRecordings: true },
    }).state.settings
  ).toEqual({
    shareNotes: true,
    shareNotesAfterMeeting: true,
    shareRecordings: true,
  });
});
it('preserves access for legacy device-keyed approvals', () => {
  const state = initial();
  state.presence = {};
  state.approved = { [device]: { userId: device, displayName: 'Guest' } };
  state.settings = { shareNotes: true };
  expect(canReadRoomNotes(state, guest)).toBe(true);
});
it('acknowledges chat once and sends it only to other admitted devices', () => {
  const result = run(
    initial(),
    { type: 'chat.message', body: 'Hello', requestId: 'request' },
    guest
  );
  expect(result.reply).toHaveLength(1);
  expect(result.broadcast).toHaveLength(0);
  expect(result.direct.map((entry) => entry.userId)).toEqual([host.userId]);
});
it('allows legacy host recordings and terminal updates without an ID', () => {
  const result = run(initial(), {
    type: 'recording.state',
    state: 'recording',
    recordingSessionId: account,
  });
  expect(result.state.recording.state).toBe('recording');
  expect(
    run(result.state, { type: 'recording.state', state: 'idle' }).state
      .recording.sessionId
  ).toBeNull();
});
it('rejects stale stop commands and marks interrupted history failed', () => {
  const state = run(initial(), {
    type: 'recording.state',
    state: 'starting',
    recordingSessionId: account,
  }).state;
  expect(
    run(state, {
      type: 'recording.state',
      state: 'stopping',
      recordingSessionId: device,
    }).reply[0]
  ).toMatchObject({ error: 'recording_not_owned' });
  const released = releaseParticipant(state, host.userId, host.roomId).state;
  expect(released.recording.sessionId).toBeNull();
  expect(released.recordings?.[0]).toMatchObject({
    status: 'failed',
    endedAt: expect.any(String),
  });
});
