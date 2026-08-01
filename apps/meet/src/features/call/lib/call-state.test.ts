import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import { describe, expect, it } from 'vitest';
import {
  type CallState,
  INITIAL_CALL_STATE,
  isHandRaised,
  reduceCallState,
  selectFocusedUserId,
  selectOthers,
  selectSelf,
} from './call-state';

const SELF = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const OTHER = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const THIRD = 'c1f0c9b7-1a4e-4b0c-9d0a-0a1c2b3d4e5f';

function presence(userId: string, displayName: string, media = {}) {
  return {
    displayName,
    joinedAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-01T00:00:00.000Z',
    media: {
      audioEnabled: false,
      screenEnabled: false,
      videoEnabled: false,
      ...media,
    },
    role: 'speaker' as const,
    userId,
  };
}

function reduceAll(
  messages: MeetRealtimeServerMessage[],
  from = INITIAL_CALL_STATE
) {
  return messages.reduce(reduceCallState, from);
}

const READY: MeetRealtimeServerMessage = {
  admission: 'admitted',
  expiresAt: '2026-08-01T01:00:00.000Z',
  limits: {
    maxPublishers: 8,
    maxViewers: 96,
    video: {
      defaultCameraEnabled: false,
      maxFrameRate: 24,
      maxHeight: 720,
      maxWidth: 1280,
    },
  },
  mode: 'call',
  role: 'host',
  roomId: 'ws:meeting',
  stage: {
    activeSpeakerIds: [],
    hostUserId: SELF,
    locked: false,
    raisedHandUserIds: [],
  },
  type: 'ready',
  userId: SELF,
};

describe('call state admission', () => {
  it('records identity and role from ready', () => {
    const state = reduceAll([READY]);

    expect(state.admission).toBe('admitted');
    expect(state.selfUserId).toBe(SELF);
    expect(state.role).toBe('host');
  });

  it('holds in the waiting room until admitted', () => {
    const waiting = reduceAll([{ ...READY, admission: 'waiting' }]);
    expect(waiting.admission).toBe('waiting');

    const admitted = reduceCallState(waiting, {
      admitted: true,
      decidedBy: OTHER,
      type: 'admission.result',
    });
    expect(admitted.admission).toBe('admitted');
  });

  it('marks a denied participant so the UI can stop', () => {
    const denied = reduceAll([
      { ...READY, admission: 'waiting' },
      { admitted: false, decidedBy: OTHER, type: 'admission.result' },
    ]);

    expect(denied.admission).toBe('denied');
  });

  it('tracks the host waiting list', () => {
    const state = reduceAll([
      READY,
      {
        participants: [
          {
            displayName: 'Guest',
            requestedAt: '2026-08-01T00:00:00.000Z',
            userId: OTHER,
          },
        ],
        type: 'admission.pending',
      },
    ]);

    expect(state.waiting).toHaveLength(1);
    expect(state.waiting[0]?.displayName).toBe('Guest');
  });
});

describe('call state tracks', () => {
  const withSelf = reduceAll([READY]);

  it('ignores our own tracks echoed back on the broadcast', () => {
    const state = reduceCallState(withSelf, {
      sessionId: 'session-self',
      tracks: [
        {
          kind: 'audio',
          sessionId: 'session-self',
          trackName: `${SELF}-audio`,
          userId: SELF,
        },
      ],
      type: 'track.published',
      userId: SELF,
    });

    expect(state.remoteTracks).toEqual({});
  });

  it('collects remote tracks and drops them when closed', () => {
    const published = reduceCallState(withSelf, {
      sessionId: 'session-other',
      tracks: [
        {
          kind: 'video',
          sessionId: 'session-other',
          trackName: `${OTHER}-video`,
          userId: OTHER,
        },
      ],
      type: 'track.published',
      userId: OTHER,
    });
    expect(Object.keys(published.remoteTracks)).toHaveLength(1);

    const closed = reduceCallState(published, {
      sessionId: 'session-other',
      tracks: [
        {
          kind: 'video',
          sessionId: 'session-other',
          trackName: `${OTHER}-video`,
          userId: OTHER,
        },
      ],
      type: 'track.closed',
      userId: OTHER,
    });
    expect(closed.remoteTracks).toEqual({});
  });

  it('drops a removed participant and every track they owned', () => {
    const state = reduceAll(
      [
        {
          sessionId: 'session-other',
          tracks: [
            {
              kind: 'video',
              sessionId: 'session-other',
              trackName: `${OTHER}-video`,
              userId: OTHER,
            },
          ],
          type: 'track.published',
          userId: OTHER,
        },
        {
          presence: [presence(SELF, 'Me'), presence(OTHER, 'Them')],
          roomId: 'ws:meeting',
          type: 'presence',
        },
        { by: SELF, type: 'participant.removed', userId: OTHER },
      ],
      withSelf
    );

    expect(state.participants[OTHER]).toBeUndefined();
    expect(state.remoteTracks).toEqual({});
  });

  it('ends our own call when we are the one removed', () => {
    const state = reduceCallState(withSelf, {
      by: OTHER,
      type: 'participant.removed',
      userId: SELF,
    });

    expect(state.admission).toBe('denied');
  });
});

describe('call state selectors', () => {
  const base: CallState = reduceAll([
    READY,
    {
      presence: [
        presence(SELF, 'Me'),
        presence(OTHER, 'Zoe'),
        presence(THIRD, 'Adam'),
      ],
      roomId: 'ws:meeting',
      type: 'presence',
    },
  ]);

  it('separates self from everyone else', () => {
    expect(selectSelf(base)?.displayName).toBe('Me');
    expect(selectOthers(base).map((p) => p.displayName)).toEqual([
      'Adam',
      'Zoe',
    ]);
  });

  it('floats raised hands to the top of the roster', () => {
    const raised = reduceCallState(base, {
      stage: { ...base.stage, raisedHandUserIds: [OTHER] },
      type: 'stage',
    });

    expect(selectOthers(raised).map((p) => p.displayName)).toEqual([
      'Zoe',
      'Adam',
    ]);
    expect(isHandRaised(raised, OTHER)).toBe(true);
  });

  it('focuses the active speaker over everyone else', () => {
    const speaking = reduceCallState(base, {
      stage: { ...base.stage, activeSpeakerIds: [OTHER] },
      type: 'stage',
    });

    expect(selectFocusedUserId(speaking)).toBe(OTHER);
  });

  it('falls back to whoever is sharing their screen', () => {
    const sharing = reduceCallState(base, {
      presence: [
        presence(SELF, 'Me'),
        presence(OTHER, 'Zoe'),
        presence(THIRD, 'Adam', { screenEnabled: true }),
      ],
      roomId: 'ws:meeting',
      type: 'presence',
    });

    expect(selectFocusedUserId(sharing)).toBe(THIRD);
  });

  it('focuses ourselves when we are alone', () => {
    const alone = reduceCallState(base, {
      presence: [presence(SELF, 'Me')],
      roomId: 'ws:meeting',
      type: 'presence',
    });

    expect(selectFocusedUserId(alone)).toBe(SELF);
  });
});

describe('call state chat and recording', () => {
  it('appends chat in arrival order', () => {
    const state = reduceAll([
      READY,
      {
        body: 'hello',
        createdAt: '2026-08-01T00:00:01.000Z',
        displayName: 'Zoe',
        id: 'm1',
        type: 'chat.message',
        userId: OTHER,
      },
      {
        body: 'hi',
        createdAt: '2026-08-01T00:00:02.000Z',
        displayName: 'Me',
        id: 'm2',
        type: 'chat.message',
        userId: SELF,
      },
    ]);

    expect(state.chat.map((m) => m.body)).toEqual(['hello', 'hi']);
  });

  it('tracks recording state and keeps the session id across updates', () => {
    const state = reduceAll([
      READY,
      {
        recordingSessionId: 'rec-1',
        state: 'recording',
        type: 'recording.state',
      },
      { state: 'stopping', type: 'recording.state' },
    ]);

    expect(state.recording).toEqual({ sessionId: 'rec-1', state: 'stopping' });
  });

  it('surfaces room errors', () => {
    const state = reduceCallState(INITIAL_CALL_STATE, {
      error: 'permission_denied',
      type: 'error',
    });

    expect(state.error).toBe('permission_denied');
  });
});
