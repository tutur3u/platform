import type { MeetFinalizationState } from './finalization';
import type { RoomBudget } from './room-budget';
import type { MeetApprovedParticipant, MeetRoomSettings } from './room-options';
import { outcome } from './room-outcome';
import {
  failActiveRecording,
  type RoomRecording,
  recordingMessage,
} from './room-recording';
import type { RoomAttachment } from './room-service';
import type { RoomUsage } from './room-usage';
import type { TranscriptionRoomState } from './transcription';

export { meetTrackKey } from './room-tracks';

import type {
  MeetRealtimeClientMessage,
  MeetRealtimeRoomTrack,
  MeetRealtimeServerMessage,
  MeetRealtimeSfuClientMessage,
} from './messages';
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
// Historical boundary retained for regression tests; open sockets no longer expire.
export const MEET_CONNECTED_PRESENCE_TTL_MS = 10 * 60_000;

export interface MeetRoomSnapshot
  extends TranscriptionRoomState,
    MeetFinalizationState {
  lifecycle?: import('./room-lifecycle').MeetRoomLifecycle;
  liveAssistant?: import('./room-live').RoomLiveState;
  budget?: RoomBudget;
  attachments?: Record<string, RoomAttachment>;
  usage?: RoomUsage;
  approved?: Record<string, MeetApprovedParticipant>;
  settings?: MeetRoomSettings;
  ended?: boolean;
  lastReactionAt?: Record<string, number>;
  retiredTracks?: Record<string, true>;
  retiredSessions?: Record<string, true>;
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

export type MeetSfuIntent = {
  message: MeetRealtimeSfuClientMessage;
  requestId?: string;
};

export interface MeetRoomOutcome {
  broadcast: MeetRealtimeServerMessage[];
  direct: Array<{ message: MeetRealtimeServerMessage; userId: string }>;
  disconnect: string[];
  reply: MeetRealtimeServerMessage[];
  toManagers: MeetRealtimeServerMessage[];
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

export function pruneMeetPresence(
  state: MeetRoomSnapshot,
  nowMs: number,
  connectedUserIds?: ReadonlySet<string>
): MeetRoomSnapshot {
  const presence: Record<string, MeetRealtimePresence> = {};
  let changed = false;

  for (const [userId, entry] of Object.entries(state.presence)) {
    // Open sockets are authoritative; hibernating clients need no presence writes.
    const ttl = connectedUserIds?.has(userId)
      ? Number.POSITIVE_INFINITY
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

export { admitOrHold } from './room-admission';

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
    ...(state.recording.ownerDeviceId === userId
      ? failActiveRecording(state)
      : state),
    lastReactionAt,
    retiredSessions: Object.fromEntries(
      Object.entries(state.retiredSessions ?? {}).filter(
        ([key]) => !key.startsWith(`${encodeURIComponent(userId)}:`)
      )
    ),
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

export { applyMeetRoomCommand } from './room-commands';

export function remoteMeetTracks(state: MeetRoomSnapshot, userId: string) {
  return Object.values(state.tracks).filter((track) => track.userId !== userId);
}
