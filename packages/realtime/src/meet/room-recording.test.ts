import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { applyRecording } from './room-recording';

const now = '2026-09-09T00:00:00Z';
const host = meetRealtimeTokenPayloadSchema.parse({
  roomId: 'workspace:meeting',
  mode: 'call',
  admission: 'open',
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  accountId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2692',
  exp: 2000000000,
  role: 'host',
  scopes: [],
  limits: { video: { defaultCameraEnabled: false } },
});
const guest = meetRealtimeTokenPayloadSchema.parse({
  ...host,
  userId: '4b320da6-6c8a-43fe-b1bf-09fbe77303f9',
  accountId: '4b320da6-6c8a-43fe-b1bf-09fbe77303f8',
  role: 'speaker',
});
const initial = () =>
  admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), host, now).state,
    guest,
    now
  ).state;
const run = (
  snapshot: ReturnType<typeof initial>,
  state: 'starting' | 'recording' | 'stopping' | 'idle',
  actor = host,
  id = 'recording-a'
) =>
  applyRecording(
    snapshot,
    {
      type: 'recording.state',
      state,
      recordingSessionId: id,
      requestId: 'request',
    },
    actor,
    now
  );

describe('room recording lease', () => {
  it('denies participant recording unless explicitly enabled', () => {
    expect(run(initial(), 'starting', guest).reply[0]).toMatchObject({
      error: 'permission_denied',
    });
    const state = initial();
    state.settings = {
      shareNotes: false,
      ...state.settings,
      allowParticipantRecording: true,
    };
    expect(run(state, 'starting', guest).state.recording.ownerDeviceId).toBe(
      guest.userId
    );
  });
  it('allows only one concurrent recording, including across devices of the same admin', () => {
    const claimed = run(initial(), 'starting').state;
    const other = { ...host, userId: 'host-second-device' };
    const joined = admitOrHold(claimed, other, now).state;
    expect(
      run(joined, 'starting', other, 'recording-b').reply[0]
    ).toMatchObject({ error: 'recording_already_active' });
    expect(run(claimed, 'recording').state.recording.state).toBe('recording');
  });
  it('cannot revive a recording after a remote stop or finalize another device recording', () => {
    const claimed = run(initial(), 'starting').state;
    const stopped = run(claimed, 'stopping').state;
    expect(run(stopped, 'recording').reply[0]).toMatchObject({
      error: 'recording_invalid_transition',
    });
    const shared = {
      ...stopped,
      settings: {
        shareNotes: false,
        ...stopped.settings,
        allowParticipantRecording: true,
      },
    };
    expect(run(shared, 'idle', guest).reply[0]).toMatchObject({
      error: 'recording_not_owned',
    });
    expect(run(stopped, 'idle').state.recording.state).toBe('idle');
  });
});

it('retains ready recordings when their owner releases the lease after upload', () => {
  const state = run(initial(), 'starting').state;
  state.recordings![0]!.status = 'ready';
  state.recordings![0]!.path = 'verified-recording.webm';
  expect(run(state, 'idle').state.recordings?.[0]?.status).toBe('ready');
});

it('lets an admin clear a stopped guest recording without clearing another session', () => {
  const state = initial();
  state.settings = { shareNotes: false, allowParticipantRecording: true };
  const started = run(state, 'starting', guest).state;
  const stopping = run(started, 'stopping', host).state;
  expect(
    run(stopping, 'idle', host, 'different').state.recording.sessionId
  ).toBe('recording-a');
  expect(run(stopping, 'idle', host).state.recording.sessionId).toBeNull();
});
