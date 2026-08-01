import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  MEET_PRESENCE_TTL_MS,
  type MeetRealtimeTokenPayload,
  meetRealtimeTokenPayloadSchema,
  pruneMeetPresence,
  releaseParticipant,
  remoteMeetTracks,
} from './index';

const HOST_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const GUEST_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const SPEAKER_ID = 'c1f0c9b7-1a4e-4b0c-9d0a-0a1c2b3d4e5f';
const NOW = '2026-07-31T12:00:00.000Z';

function token(
  overrides: Partial<MeetRealtimeTokenPayload> = {}
): MeetRealtimeTokenPayload {
  const role = overrides.role ?? 'host';
  return meetRealtimeTokenPayloadSchema.parse({
    exp: Math.floor(Date.parse(NOW) / 1000) + 600,
    limits: {},
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    mode: 'call',
    role,
    roomId: 'workspace:meeting',
    scopes: getMeetRealtimeScopesForRole(role),
    userId: role === 'host' ? HOST_ID : GUEST_ID,
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    ...overrides,
  });
}

function run(
  state: ReturnType<typeof createMeetRoomSnapshot>,
  message: Parameters<typeof applyMeetRoomCommand>[1]['message'],
  as: MeetRealtimeTokenPayload
) {
  return applyMeetRoomCommand(state, { message, now: NOW, token: as });
}

describe('meet room admission', () => {
  it('places a lobby token in the waiting list instead of presence', () => {
    const result = admitOrHold(
      createMeetRoomSnapshot(),
      token({ admission: 'lobby', displayName: 'Guest', role: 'speaker' }),
      NOW
    );

    expect(result.state.presence[GUEST_ID]).toBeUndefined();
    expect(result.state.waiting[GUEST_ID]?.displayName).toBe('Guest');
    expect(result.reply[0]).toMatchObject({
      admission: 'waiting',
      type: 'ready',
    });
    expect(result.toManagers[0]).toMatchObject({ type: 'admission.pending' });
  });

  it('admits an open token straight into presence', () => {
    const result = admitOrHold(createMeetRoomSnapshot(), token(), NOW);

    expect(result.state.presence[HOST_ID]).toBeDefined();
    expect(result.state.waiting).toEqual({});
    expect(result.reply[0]).toMatchObject({ admission: 'admitted' });
  });

  it('refuses every command from a participant still waiting', () => {
    const held = admitOrHold(
      createMeetRoomSnapshot(),
      token({ admission: 'lobby', role: 'speaker' }),
      NOW
    );

    const result = run(
      held.state,
      { body: 'let me in', type: 'chat.message' },
      token({ admission: 'lobby', role: 'speaker' })
    );

    expect(result.reply[0]).toMatchObject({
      error: 'awaiting_admission',
      type: 'error',
    });
    expect(result.broadcast).toHaveLength(0);
  });

  it('moves an admitted guest into presence and notifies them', () => {
    const held = admitOrHold(
      createMeetRoomSnapshot(),
      token({ admission: 'lobby', displayName: 'Guest', role: 'speaker' }),
      NOW
    );

    const result = run(
      held.state,
      { admit: true, type: 'admission.decide', userId: GUEST_ID },
      token()
    );

    expect(result.state.waiting[GUEST_ID]).toBeUndefined();
    expect(result.state.presence[GUEST_ID]?.displayName).toBe('Guest');
    expect(result.direct).toEqual([
      {
        message: {
          admitted: true,
          decidedBy: HOST_ID,
          type: 'admission.result',
        },
        userId: GUEST_ID,
      },
    ]);
  });

  it('disconnects a denied guest without adding them to presence', () => {
    const held = admitOrHold(
      createMeetRoomSnapshot(),
      token({ admission: 'lobby', role: 'speaker' }),
      NOW
    );

    const result = run(
      held.state,
      { admit: false, type: 'admission.decide', userId: GUEST_ID },
      token()
    );

    expect(result.state.presence[GUEST_ID]).toBeUndefined();
    expect(result.state.waiting[GUEST_ID]).toBeUndefined();
    expect(result.disconnect).toEqual([GUEST_ID]);
  });

  it('only lets participant managers decide admission', () => {
    // An admitted speaker, distinct from the guest waiting in the lobby, so the
    // permission check is what rejects the decision rather than the
    // awaiting-admission guard.
    const speaker = token({ role: 'speaker', userId: SPEAKER_ID });
    const inRoom = admitOrHold(createMeetRoomSnapshot(), speaker, NOW).state;
    const held = admitOrHold(
      inRoom,
      token({ admission: 'lobby', role: 'speaker' }),
      NOW
    );

    const result = run(
      held.state,
      { admit: true, type: 'admission.decide', userId: GUEST_ID },
      speaker
    );

    expect(result.reply[0]).toMatchObject({ error: 'permission_denied' });
    expect(result.state.waiting[GUEST_ID]).toBeDefined();
  });
});

describe('meet room participant controls', () => {
  const joined = admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), token(), NOW).state,
    token({ role: 'speaker' }),
    NOW
  ).state;

  it('lets any participant raise and lower their own hand', () => {
    const raised = run(
      joined,
      { raised: true, type: 'hand.raise' },
      token({ role: 'speaker' })
    );
    expect(raised.state.stage.raisedHandUserIds).toEqual([GUEST_ID]);

    const lowered = run(
      raised.state,
      { raised: false, type: 'hand.raise' },
      token({ role: 'speaker' })
    );
    expect(lowered.state.stage.raisedHandUserIds).toEqual([]);
  });

  it('still restricts wholesale stage updates to stage writers', () => {
    const result = run(
      joined,
      {
        stage: {
          activeSpeakerIds: [],
          hostUserId: GUEST_ID,
          locked: true,
          raisedHandUserIds: [],
        },
        type: 'stage.update',
      },
      token({ role: 'speaker' })
    );

    expect(result.reply[0]).toMatchObject({
      error: 'stage_update_not_allowed',
    });
  });

  it('force-mutes the requested kinds and republishes presence', () => {
    const speaking = run(
      joined,
      {
        media: { audioEnabled: true, screenEnabled: true, videoEnabled: true },
        type: 'presence.update',
      },
      token({ role: 'speaker' })
    );

    const result = run(
      speaking.state,
      {
        kinds: ['audio', 'screen'],
        type: 'participant.mute',
        userId: GUEST_ID,
      },
      token()
    );

    expect(result.state.presence[GUEST_ID]?.media).toEqual({
      audioEnabled: false,
      screenEnabled: false,
      videoEnabled: true,
    });
    expect(result.broadcast.at(-1)).toMatchObject({
      by: HOST_ID,
      type: 'participant.muted',
    });
  });

  it('removes a participant and asks the transport to disconnect them', () => {
    const result = run(
      joined,
      { type: 'participant.remove', userId: GUEST_ID },
      token()
    );

    expect(result.state.presence[GUEST_ID]).toBeUndefined();
    expect(result.disconnect).toEqual([GUEST_ID]);
    expect(result.broadcast.at(-1)).toMatchObject({
      type: 'participant.removed',
      userId: GUEST_ID,
    });
  });

  it('refuses to let a host remove themselves', () => {
    const result = run(
      joined,
      { type: 'participant.remove', userId: HOST_ID },
      token()
    );

    expect(result.reply[0]).toMatchObject({ error: 'cannot_remove_self' });
    expect(result.state.presence[HOST_ID]).toBeDefined();
  });
});

describe('meet room SFU relay', () => {
  const joined = admitOrHold(createMeetRoomSnapshot(), token(), NOW).state;
  const sessionDescription = { sdp: 'v=0', type: 'offer' } as const;

  it('records published tracks and hands the call to the transport', () => {
    const result = run(
      joined,
      {
        sessionDescription,
        sessionId: 'session-1',
        tracks: [{ kind: 'audio', mid: '0', trackName: 'host-audio' }],
        type: 'sfu.tracks.publish',
      },
      token()
    );

    expect(result.sfu?.message.type).toBe('sfu.tracks.publish');
    expect(Object.values(result.state.tracks)).toEqual([
      {
        kind: 'audio',
        mid: '0',
        sessionId: 'session-1',
        trackName: 'host-audio',
        userId: HOST_ID,
      },
    ]);
    expect(result.broadcast[0]).toMatchObject({ type: 'track.published' });
  });

  it('drops closed tracks from the room registry', () => {
    const published = run(
      joined,
      {
        sessionDescription,
        sessionId: 'session-1',
        tracks: [{ kind: 'audio', trackName: 'host-audio' }],
        type: 'sfu.tracks.publish',
      },
      token()
    );

    const closed = run(
      published.state,
      {
        sessionId: 'session-1',
        tracks: [{ kind: 'audio', trackName: 'host-audio' }],
        type: 'sfu.tracks.close',
      },
      token()
    );

    expect(closed.state.tracks).toEqual({});
    expect(closed.broadcast[0]).toMatchObject({ type: 'track.closed' });
  });

  it('never emits an SFU intent for a viewer publish attempt', () => {
    const result = run(
      joined,
      {
        sessionDescription,
        sessionId: 'session-1',
        tracks: [{ kind: 'video' }],
        type: 'sfu.tracks.publish',
      },
      token({ role: 'viewer', userId: GUEST_ID })
    );

    expect(result.sfu).toBeNull();
    expect(result.reply[0]).toMatchObject({ error: 'publish_not_allowed' });
  });

  it('lists only other participants tracks for subscription', () => {
    const published = run(
      joined,
      {
        sessionDescription,
        sessionId: 'session-1',
        tracks: [{ kind: 'audio', trackName: 'host-audio' }],
        type: 'sfu.tracks.publish',
      },
      token()
    );

    expect(remoteMeetTracks(published.state, HOST_ID)).toEqual([]);
    expect(remoteMeetTracks(published.state, GUEST_ID)).toHaveLength(1);
  });
});

describe('meet room lifecycle', () => {
  it('clears presence, hands and tracks when a participant leaves', () => {
    const joined = admitOrHold(createMeetRoomSnapshot(), token(), NOW).state;
    const raised = run(joined, { raised: true, type: 'hand.raise' }, token());
    const published = run(
      raised.state,
      {
        sessionDescription: { sdp: 'v=0', type: 'offer' },
        sessionId: 'session-1',
        tracks: [{ kind: 'audio', trackName: 'host-audio' }],
        type: 'sfu.tracks.publish',
      },
      token()
    );

    const released = releaseParticipant(
      published.state,
      HOST_ID,
      'workspace:meeting'
    );

    expect(released.state.presence).toEqual({});
    expect(released.state.tracks).toEqual({});
    expect(released.state.stage.raisedHandUserIds).toEqual([]);
  });

  it('prunes presence only after the heartbeat lapses', () => {
    const joined = admitOrHold(createMeetRoomSnapshot(), token(), NOW).state;
    const nowMs = Date.parse(NOW);

    expect(pruneMeetPresence(joined, nowMs).presence[HOST_ID]).toBeDefined();
    expect(
      pruneMeetPresence(joined, nowMs + MEET_PRESENCE_TTL_MS + 1).presence
    ).toEqual({});
  });

  it('tracks recording state for the whole room', () => {
    const joined = admitOrHold(createMeetRoomSnapshot(), token(), NOW).state;
    const result = run(
      joined,
      {
        recordingSessionId: 'session-abc',
        state: 'recording',
        type: 'recording.state',
      },
      token()
    );

    expect(result.state.recording).toEqual({
      sessionId: 'session-abc',
      state: 'recording',
    });
    expect(result.broadcast[0]).toMatchObject({
      recordingSessionId: 'session-abc',
      state: 'recording',
      type: 'recording.state',
    });
  });

  it('keeps recording control away from ordinary speakers', () => {
    const joined = admitOrHold(createMeetRoomSnapshot(), token(), NOW).state;
    const result = run(
      joined,
      { state: 'recording', type: 'recording.state' },
      token({ role: 'speaker', userId: GUEST_ID })
    );

    expect(result.reply[0]).toMatchObject({ error: 'permission_denied' });
    expect(result.state.recording.state).toBe('idle');
  });
});
