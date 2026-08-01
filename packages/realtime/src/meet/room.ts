import type {
  MeetRealtimeClientMessage,
  MeetRealtimeRoomTrack,
  MeetRealtimeServerMessage,
  MeetRealtimeSfuClientMessage,
} from './messages';
import {
  canMeetRealtimeControlRecording,
  canMeetRealtimeManageParticipants,
  canMeetRealtimePublish,
  canMeetRealtimeUpdateStage,
  hasMeetRealtimeScope,
  MEET_REALTIME_SCOPES,
} from './permissions';
import {
  type MeetRealtimePresence,
  type MeetRealtimeRecordingState,
  type MeetRealtimeStageState,
  type MeetRealtimeStreamState,
  type MeetRealtimeTokenPayload,
  type MeetRealtimeWaitingParticipant,
  meetRealtimeStageStateSchema,
} from './primitives';

export const MEET_PRESENCE_TTL_MS = 30_000;

export interface MeetRoomSnapshot {
  presence: Record<string, MeetRealtimePresence>;
  recording: {
    sessionId: string | null;
    state: MeetRealtimeRecordingState;
  };
  stage: MeetRealtimeStageState;
  streamState: MeetRealtimeStreamState;
  tracks: Record<string, MeetRealtimeRoomTrack>;
  waiting: Record<string, MeetRealtimeWaitingParticipant>;
}

/**
 * A Cloudflare Realtime SFU call the transport must perform on the room's
 * behalf. Keeping it as data rather than a callback is what lets the whole
 * room reducer stay pure and unit-testable without network or credentials.
 */
export type MeetSfuIntent = {
  message: MeetRealtimeSfuClientMessage;
  requestId?: string;
};

export interface MeetRoomOutcome {
  /** Sent to every connected client in the room. */
  broadcast: MeetRealtimeServerMessage[];
  /** Sent to one specific participant, wherever they are connected. */
  direct: Array<{ message: MeetRealtimeServerMessage; userId: string }>;
  /** Participants the transport should disconnect after flushing messages. */
  disconnect: string[];
  /** Sent back to the participant that produced the command. */
  reply: MeetRealtimeServerMessage[];
  /** Sent only to participants that can manage the room. */
  toManagers: MeetRealtimeServerMessage[];
  /** Cloudflare SFU work for the transport to execute, if any. */
  sfu: MeetSfuIntent | null;
  state: MeetRoomSnapshot;
}

export interface MeetRoomCommand {
  message: MeetRealtimeClientMessage;
  now: string;
  token: MeetRealtimeTokenPayload;
}

export function createMeetRoomSnapshot(): MeetRoomSnapshot {
  return {
    presence: {},
    recording: { sessionId: null, state: 'idle' },
    stage: meetRealtimeStageStateSchema.parse({}),
    streamState: 'idle',
    tracks: {},
    waiting: {},
  };
}

export function getMeetDisplayName(token: MeetRealtimeTokenPayload) {
  return token.displayName || (token.role === 'host' ? 'Host' : 'Participant');
}

export function createMeetPresence(
  token: MeetRealtimeTokenPayload,
  now: string,
  media?: Partial<MeetRealtimePresence['media']>
): MeetRealtimePresence {
  return {
    displayName: getMeetDisplayName(token),
    joinedAt: now,
    lastSeenAt: now,
    media: {
      audioEnabled: false,
      screenEnabled: false,
      videoEnabled: token.limits.video.defaultCameraEnabled,
      ...media,
    },
    role: token.role,
    userId: token.userId,
  };
}

export function meetTrackKey(track: MeetRealtimeRoomTrack) {
  return `${track.sessionId}:${track.trackName ?? track.mid ?? track.userId}`;
}

/** Drops presence entries whose heartbeat has lapsed. */
export function pruneMeetPresence(
  state: MeetRoomSnapshot,
  nowMs: number
): MeetRoomSnapshot {
  const presence: Record<string, MeetRealtimePresence> = {};
  let changed = false;

  for (const [userId, entry] of Object.entries(state.presence)) {
    if (Date.parse(entry.lastSeenAt) + MEET_PRESENCE_TTL_MS < nowMs) {
      changed = true;
      continue;
    }
    presence[userId] = entry;
  }

  return changed ? { ...state, presence } : state;
}

export function meetPresenceMessage(
  state: MeetRoomSnapshot,
  roomId: string
): MeetRealtimeServerMessage {
  return {
    presence: Object.values(state.presence),
    roomId,
    type: 'presence',
  };
}

export function meetAdmissionPendingMessage(
  state: MeetRoomSnapshot
): MeetRealtimeServerMessage {
  return {
    participants: Object.values(state.waiting),
    type: 'admission.pending',
  };
}

function outcome(
  state: MeetRoomSnapshot,
  partial: Partial<Omit<MeetRoomOutcome, 'state'>> = {}
): MeetRoomOutcome {
  return {
    broadcast: partial.broadcast ?? [],
    direct: partial.direct ?? [],
    disconnect: partial.disconnect ?? [],
    reply: partial.reply ?? [],
    sfu: partial.sfu ?? null,
    toManagers: partial.toManagers ?? [],
    state,
  };
}

function denied(
  state: MeetRoomSnapshot,
  error: string,
  requestId?: string
): MeetRoomOutcome {
  return outcome(state, { reply: [{ error, requestId, type: 'error' }] });
}

/**
 * Registers a participant that has just connected. Anyone holding a `lobby`
 * token lands in the waiting list instead of presence until a manager admits
 * them.
 */
export function admitOrHold(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  now: string
): MeetRoomOutcome {
  if (token.admission === 'lobby' && !state.presence[token.userId]) {
    const next: MeetRoomSnapshot = {
      ...state,
      waiting: {
        ...state.waiting,
        [token.userId]: {
          displayName: getMeetDisplayName(token),
          requestedAt: now,
          userId: token.userId,
        },
      },
    };

    return outcome(next, {
      reply: [buildReady(next, token, 'waiting')],
      toManagers: [meetAdmissionPendingMessage(next)],
    });
  }

  const next: MeetRoomSnapshot = {
    ...state,
    presence: {
      ...state.presence,
      [token.userId]: createMeetPresence(token, now),
    },
  };

  return outcome(next, {
    broadcast: [meetPresenceMessage(next, token.roomId)],
    reply: [buildReady(next, token, 'admitted')],
  });
}

function buildReady(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  admission: 'admitted' | 'waiting'
): MeetRealtimeServerMessage {
  return {
    admission,
    expiresAt: new Date(token.exp * 1000).toISOString(),
    limits: token.limits,
    mode: token.mode,
    role: token.role,
    roomId: token.roomId,
    stage: state.stage,
    type: 'ready',
    userId: token.userId,
  };
}

/** Removes a participant that has disconnected. */
export function releaseParticipant(
  state: MeetRoomSnapshot,
  userId: string,
  roomId: string
): MeetRoomOutcome {
  const presence = { ...state.presence };
  const waiting = { ...state.waiting };
  delete presence[userId];
  delete waiting[userId];

  const tracks = Object.fromEntries(
    Object.entries(state.tracks).filter(([, track]) => track.userId !== userId)
  );
  const next: MeetRoomSnapshot = {
    ...state,
    presence,
    stage: {
      ...state.stage,
      activeSpeakerIds: state.stage.activeSpeakerIds.filter(
        (id) => id !== userId
      ),
      raisedHandUserIds: state.stage.raisedHandUserIds.filter(
        (id) => id !== userId
      ),
    },
    tracks,
    waiting,
  };

  return outcome(next, {
    broadcast: [
      meetPresenceMessage(next, roomId),
      { stage: next.stage, type: 'stage' },
    ],
    toManagers: [meetAdmissionPendingMessage(next)],
  });
}

/**
 * The single authority for what a client message does to a room. Pure: it
 * returns the next snapshot plus the messages and Cloudflare SFU work the
 * transport should carry out, so the Durable Object and the Bun server share
 * identical behaviour.
 */
export function applyMeetRoomCommand(
  state: MeetRoomSnapshot,
  { message, now, token }: MeetRoomCommand
): MeetRoomOutcome {
  const { roomId, userId } = token;

  // A participant still in the lobby may do nothing but wait.
  if (state.waiting[userId] && message.type !== 'presence.join') {
    return denied(state, 'awaiting_admission');
  }

  switch (message.type) {
    case 'presence.join': {
      if (state.waiting[userId]) return outcome(state);

      const next = {
        ...state,
        presence: {
          ...state.presence,
          [userId]: createMeetPresence(
            { ...token, displayName: message.displayName || token.displayName },
            now,
            message.media
          ),
        },
      };
      return outcome(next, {
        broadcast: [meetPresenceMessage(next, roomId)],
      });
    }

    case 'presence.update': {
      const existing = state.presence[userId] ?? createMeetPresence(token, now);
      const next = {
        ...state,
        presence: {
          ...state.presence,
          [userId]: { ...existing, lastSeenAt: now, media: message.media },
        },
      };
      return outcome(next, {
        broadcast: [meetPresenceMessage(next, roomId)],
      });
    }

    case 'chat.message': {
      if (!hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.chatWrite)) {
        return denied(state, 'permission_denied', message.requestId);
      }
      return outcome(state, {
        broadcast: [
          {
            body: message.body,
            createdAt: now,
            displayName:
              state.presence[userId]?.displayName ?? getMeetDisplayName(token),
            id: `${now}:${userId}`,
            requestId: message.requestId,
            type: 'chat.message',
            userId,
          },
        ],
      });
    }

    case 'stage.update': {
      if (!canMeetRealtimeUpdateStage(token)) {
        return denied(state, 'stage_update_not_allowed', message.requestId);
      }
      const next = { ...state, stage: message.stage };
      return outcome(next, {
        broadcast: [
          { requestId: message.requestId, stage: next.stage, type: 'stage' },
        ],
      });
    }

    case 'hand.raise': {
      const raised = new Set(state.stage.raisedHandUserIds);
      if (message.raised) {
        raised.add(userId);
      } else {
        raised.delete(userId);
      }
      const next = {
        ...state,
        stage: { ...state.stage, raisedHandUserIds: [...raised] },
      };
      return outcome(next, {
        broadcast: [
          { requestId: message.requestId, stage: next.stage, type: 'stage' },
        ],
      });
    }

    case 'admission.decide': {
      if (!canMeetRealtimeManageParticipants(token)) {
        return denied(state, 'permission_denied', message.requestId);
      }

      const pending = state.waiting[message.userId];
      if (!pending) {
        return denied(state, 'participant_not_waiting', message.requestId);
      }

      const waiting = { ...state.waiting };
      delete waiting[message.userId];

      if (!message.admit) {
        const next = { ...state, waiting };
        return outcome(next, {
          direct: [
            {
              message: {
                admitted: false,
                decidedBy: userId,
                type: 'admission.result',
              },
              userId: message.userId,
            },
          ],
          disconnect: [message.userId],
          toManagers: [meetAdmissionPendingMessage(next)],
        });
      }

      const next: MeetRoomSnapshot = {
        ...state,
        presence: {
          ...state.presence,
          [message.userId]: {
            displayName: pending.displayName,
            joinedAt: now,
            lastSeenAt: now,
            media: {
              audioEnabled: false,
              screenEnabled: false,
              videoEnabled: false,
            },
            role: 'speaker',
            userId: message.userId,
          },
        },
        waiting,
      };

      return outcome(next, {
        broadcast: [meetPresenceMessage(next, roomId)],
        direct: [
          {
            message: {
              admitted: true,
              decidedBy: userId,
              type: 'admission.result',
            },
            userId: message.userId,
          },
        ],
        toManagers: [meetAdmissionPendingMessage(next)],
      });
    }

    case 'participant.mute': {
      if (!canMeetRealtimeManageParticipants(token)) {
        return denied(state, 'permission_denied', message.requestId);
      }

      const target = state.presence[message.userId];
      if (!target) {
        return denied(state, 'participant_not_found', message.requestId);
      }

      const media = { ...target.media };
      for (const kind of message.kinds) {
        if (kind === 'audio') media.audioEnabled = false;
        if (kind === 'video') media.videoEnabled = false;
        if (kind === 'screen') media.screenEnabled = false;
      }

      const next = {
        ...state,
        presence: {
          ...state.presence,
          [message.userId]: { ...target, lastSeenAt: now, media },
        },
      };

      return outcome(next, {
        broadcast: [
          meetPresenceMessage(next, roomId),
          {
            by: userId,
            kinds: message.kinds,
            requestId: message.requestId,
            type: 'participant.muted',
            userId: message.userId,
          },
        ],
      });
    }

    case 'participant.remove': {
      if (!canMeetRealtimeManageParticipants(token)) {
        return denied(state, 'permission_denied', message.requestId);
      }
      if (message.userId === userId) {
        return denied(state, 'cannot_remove_self', message.requestId);
      }

      const released = releaseParticipant(state, message.userId, roomId);
      return {
        ...released,
        broadcast: [
          ...released.broadcast,
          {
            by: userId,
            requestId: message.requestId,
            type: 'participant.removed',
            userId: message.userId,
          },
        ],
        disconnect: [message.userId],
      };
    }

    case 'recording.state': {
      if (!canMeetRealtimeControlRecording(token)) {
        return denied(state, 'permission_denied', message.requestId);
      }
      const next: MeetRoomSnapshot = {
        ...state,
        recording: {
          sessionId: message.recordingSessionId ?? state.recording.sessionId,
          state: message.state,
        },
      };
      return outcome(next, {
        broadcast: [
          {
            recordingSessionId: next.recording.sessionId ?? undefined,
            requestId: message.requestId,
            state: next.recording.state,
            type: 'recording.state',
          },
        ],
      });
    }

    case 'stream.state': {
      if (!hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.streamControl)) {
        return denied(state, 'permission_denied', message.requestId);
      }
      const next = { ...state, streamState: message.state };
      return outcome(next, {
        broadcast: [
          {
            requestId: message.requestId,
            state: message.state,
            type: 'stream.state',
          },
        ],
      });
    }

    default:
      return applySfuCommand(state, message, token);
  }
}

function applySfuCommand(
  state: MeetRoomSnapshot,
  message: MeetRealtimeSfuClientMessage,
  token: MeetRealtimeTokenPayload
): MeetRoomOutcome {
  const requiredScope =
    message.type === 'sfu.tracks.subscribe'
      ? MEET_REALTIME_SCOPES.sfuSubscribe
      : message.type === 'sfu.tracks.close'
        ? MEET_REALTIME_SCOPES.sfuPublish
        : MEET_REALTIME_SCOPES.sfuJoin;

  if (
    message.type === 'sfu.tracks.publish' &&
    !message.tracks.every((track) =>
      canMeetRealtimePublish(token, track.kind ?? 'video')
    )
  ) {
    return denied(state, 'publish_not_allowed', message.requestId);
  }

  if (
    message.type !== 'sfu.tracks.publish' &&
    !hasMeetRealtimeScope(token, requiredScope)
  ) {
    return denied(state, 'permission_denied', message.requestId);
  }

  if (message.type === 'sfu.tracks.publish') {
    const published = message.tracks.map((track) => ({
      ...track,
      sessionId: message.sessionId,
      userId: token.userId,
    }));
    const tracks = { ...state.tracks };
    for (const track of published) {
      tracks[meetTrackKey(track)] = track;
    }
    const next = { ...state, tracks };

    return outcome(next, {
      broadcast: [
        {
          requestId: message.requestId,
          sessionId: message.sessionId,
          tracks: published,
          type: 'track.published',
          userId: token.userId,
        },
      ],
      sfu: { message, requestId: message.requestId },
    });
  }

  if (message.type === 'sfu.tracks.close') {
    const closing = new Set(
      message.tracks.map((track) =>
        meetTrackKey({
          ...track,
          sessionId: message.sessionId,
          userId: token.userId,
        })
      )
    );
    const tracks = Object.fromEntries(
      Object.entries(state.tracks).filter(([key]) => !closing.has(key))
    );
    const next = { ...state, tracks };

    return outcome(next, {
      broadcast: [
        {
          requestId: message.requestId,
          sessionId: message.sessionId,
          tracks: message.tracks.map((track) => ({
            ...track,
            sessionId: message.sessionId,
            userId: token.userId,
          })),
          type: 'track.closed',
          userId: token.userId,
        },
      ],
      sfu: { message, requestId: message.requestId },
    });
  }

  return outcome(state, { sfu: { message, requestId: message.requestId } });
}

/** Every track currently published by someone other than `userId`. */
export function remoteMeetTracks(state: MeetRoomSnapshot, userId: string) {
  return Object.values(state.tracks).filter((track) => track.userId !== userId);
}
