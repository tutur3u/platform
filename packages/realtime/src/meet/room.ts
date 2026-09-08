import {
  applyRoomControl,
  approvedParticipantsMessage,
  roomSettingsMessage,
} from './room-controls';
import type { MeetApprovedParticipant, MeetRoomSettings } from './room-options';
import { denied, outcome } from './room-outcome';
import {
  applyRecording,
  type RoomRecording,
  recordingMessage,
} from './room-recording';
import { applySfuCommand } from './room-sfu';
import {
  applyUsageReport,
  createRoomUsage,
  type RoomUsage,
} from './room-usage';

export { meetTrackKey } from './room-tracks';

import type {
  MeetRealtimeClientMessage,
  MeetRealtimeRoomTrack,
  MeetRealtimeServerMessage,
  MeetRealtimeSfuClientMessage,
} from './messages';
import {
  canMeetRealtimeManageParticipants,
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
export const MEET_CONNECTED_PRESENCE_TTL_MS = 10 * 60_000;

export interface MeetRoomSnapshot {
  usage?: RoomUsage;
  approved?: Record<string, MeetApprovedParticipant>;
  settings?: MeetRoomSettings;
  ended?: boolean;
  lastReactionAt?: Record<string, number>;
  retiredTracks?: Record<string, true>;
  presence: Record<string, MeetRealtimePresence>;
  recordings?: RoomRecording[];
  chat?: Extract<MeetRealtimeServerMessage, { type: 'chat.message' }>[];
  recording: {
    ownerDeviceId?: string;
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
    approved: {},
    settings: { shareNotes: false },
    ended: false,
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
    accountId: token.accountId,
    avatarUrl: token.avatarUrl,
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

/** Allow throttled connected tabs a bounded grace period before expiring. */
export function pruneMeetPresence(
  state: MeetRoomSnapshot,
  nowMs: number,
  connectedUserIds?: ReadonlySet<string>
): MeetRoomSnapshot {
  const presence: Record<string, MeetRealtimePresence> = {};
  let changed = false;

  for (const [userId, entry] of Object.entries(state.presence)) {
    const ttl = connectedUserIds?.has(userId)
      ? MEET_CONNECTED_PRESENCE_TTL_MS
      : MEET_PRESENCE_TTL_MS;
    if (Date.parse(entry.lastSeenAt) + ttl < nowMs) {
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
  if (state.ended)
    return outcome(state, {
      reply: [{ type: 'room.ended' }],
      disconnect: [token.userId],
    });
  if (
    token.admission === 'lobby' &&
    !state.presence[token.userId] &&
    !state.approved?.[token.accountId ?? token.userId]
  ) {
    const next: MeetRoomSnapshot = {
      ...state,
      waiting: {
        ...state.waiting,
        [token.userId]: {
          accountId: token.accountId,
          avatarUrl: token.avatarUrl,
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
    reply: [
      buildReady(next, token, 'admitted'),
      roomSettingsMessage(next),
      recordingMessage(next),
      ...(next.chat ?? []),
      ...(token.role === 'host' ? [approvedParticipantsMessage(next)] : []),
      ...(canMeetRealtimeManageParticipants(token)
        ? [meetAdmissionPendingMessage(next)]
        : []),
    ],
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
  const lastReactionAt = { ...state.lastReactionAt };
  delete lastReactionAt[userId];
  delete presence[userId];
  delete waiting[userId];

  const tracks = Object.fromEntries(
    Object.entries(state.tracks).filter(([, track]) => track.userId !== userId)
  );
  const next: MeetRoomSnapshot = {
    ...state,
    recording:
      state.recording.ownerDeviceId === userId
        ? { state: 'idle', sessionId: null }
        : state.recording,
    lastReactionAt,
    retiredTracks: Object.fromEntries(
      Object.entries(state.retiredTracks ?? {}).filter(
        ([key]) => !key.startsWith(`${encodeURIComponent(userId)}:`)
      )
    ),
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

  const closed = Object.values(state.tracks).filter(
    (track) => track.userId === userId
  );
  return outcome(next, {
    broadcast: [
      ...[...new Set(closed.map((track) => track.sessionId))].map(
        (sessionId) => ({
          type: 'track.closed' as const,
          userId,
          sessionId,
          tracks: closed.filter((track) => track.sessionId === sessionId),
        })
      ),
      meetPresenceMessage(next, roomId),
      recordingMessage(next),
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
  if (state.ended)
    return outcome(state, {
      reply: [{ type: 'room.ended' }],
      disconnect: [userId],
    });

  // A participant still in the lobby may do nothing but wait.
  if (state.waiting[userId] && message.type !== 'presence.join') {
    return denied(state, 'awaiting_admission');
  }

  const control = applyRoomControl(state, message, token, now);
  if (control) return control;
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

    case 'usage.report':
      if (!state.presence[userId]) return denied(state, 'awaiting_admission');
      return outcome({
        ...state,
        usage: applyUsageReport(
          state.usage ?? createRoomUsage(),
          userId,
          message.reportId,
          message.bytesReceived,
          now
        ),
      });

    case 'chat.message': {
      if (!hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.chatWrite)) {
        return denied(state, 'permission_denied', message.requestId);
      }
      const entry: Extract<
        MeetRealtimeServerMessage,
        { type: 'chat.message' }
      > = {
        type: 'chat.message',
        body: message.body,
        createdAt: now,
        displayName:
          state.presence[userId]?.displayName ?? getMeetDisplayName(token),
        avatarUrl: token.avatarUrl,
        accountId: token.accountId,
        id: crypto.randomUUID(),
        userId,
        attachmentIds: message.attachmentIds,
      };
      return outcome(
        { ...state, chat: [...(state.chat ?? []), entry].slice(-500) },
        {
          broadcast: [entry],
          reply: [{ ...entry, requestId: message.requestId }],
        }
      );
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
            accountId: pending.accountId,
            avatarUrl: pending.avatarUrl,
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
        usage: state.usage
          ? {
              ...state.usage,
              devices: { ...state.usage.devices, [message.userId]: true },
            }
          : undefined,
        approved: {
          ...state.approved,
          [pending.accountId ?? message.userId]: {
            userId: pending.accountId ?? message.userId,
            displayName: pending.displayName,
            avatarUrl: pending.avatarUrl,
          },
        },
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
          { userId: message.userId, message: roomSettingsMessage(next) },
          { userId: message.userId, message: recordingMessage(next) },
          ...(next.chat ?? []).map((entry) => ({
            userId: message.userId,
            message: entry,
          })),
          ...remoteMeetTracks(next, message.userId).map((track) => ({
            userId: message.userId,
            message: {
              type: 'track.published' as const,
              sessionId: track.sessionId,
              tracks: [track],
              userId: track.userId,
            },
          })),
        ],
        toManagers: [
          meetAdmissionPendingMessage(next),
          approvedParticipantsMessage(next),
        ],
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

      const approved = { ...state.approved };
      delete approved[message.userId];
      const released = releaseParticipant(
        { ...state, approved },
        message.userId,
        roomId
      );
      return {
        ...released,
        toManagers: [
          ...released.toManagers,
          approvedParticipantsMessage(released.state),
        ],
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

    case 'recording.state':
      return applyRecording(state, message, token, now);

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
      return message.type.startsWith('sfu.')
        ? applySfuCommand(state, message as MeetRealtimeSfuClientMessage, token)
        : outcome(state);
  }
}

/** Every track currently published by someone other than `userId`. */
export function remoteMeetTracks(state: MeetRoomSnapshot, userId: string) {
  return Object.values(state.tracks).filter((track) => track.userId !== userId);
}
