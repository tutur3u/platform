import type {
  MeetApprovedParticipant,
  MeetMediaState,
  MeetReaction,
  MeetRealtimePresence,
  MeetRealtimeRecordingState,
  MeetRealtimeRole,
  MeetRealtimeRoomTrack,
  MeetRealtimeServerMessage,
  MeetRealtimeStageState,
  MeetRealtimeWaitingParticipant,
  MeetRoomSettings,
  ClassTimer,
} from '@tuturuuu/realtime/meet';
import {
  applyPresenceDelta,
  clampMeetMedia,
  isMeetMediaLocked,
  retainRoomChat,
} from '@tuturuuu/realtime/meet';

export type CallAdmission = 'connecting' | 'waiting' | 'admitted' | 'denied';

/**
 * Where a call is in its life, derived from the room state and whether this
 * device has joined. `ended` is the room closing for everyone; leaving locally
 * is a UI concern and does not change the lifecycle.
 */
export type CallLifecycle =
  | 'preparing'
  | 'joining'
  | 'live'
  | 'ended'
  | 'error';

export interface CallChatMessage {
  retained?: boolean;
  replayed?: boolean;
  clientMessageId?: string;
  accountId?: string;
  avatarUrl?: string;
  assistant?: boolean;
  attachmentIds?: string[];
  body: string;
  createdAt: string;
  displayName: string;
  id: string;
  userId: string;
}

export interface CallState {
  liveAssistant?: { sessionId: string; ownerId: string };
  title?: string;
  roomExpiresAt?: string;
  maxParticipants?: number;
  ended: boolean;
  canManageParticipants?: boolean;
  recentSpeakerIds?: string[];
  presenceSeq?: number | null;
  presenceNeedsResync?: boolean;
  roomId?: string;
  bulkAdmission?: { admitted: number; denied: number; remaining: number };
  settings: MeetRoomSettings;
  approved: MeetApprovedParticipant[];
  reactions: Array<{
    reaction: MeetReaction;
    userId: string;
    createdAt: string;
  }>;
  admission: CallAdmission;
  admissionReason?: 'denied' | 'removed';
  chat: CallChatMessage[];
  /** Set when the room rejects something, cleared on the next success. */
  error: string | null;
  participants: Record<string, MeetRealtimePresence>;
  recording: {
    ownerDeviceId?: string;
    sessionId: string | null;
    state: MeetRealtimeRecordingState;
  };
  remoteTracks: Record<string, MeetRealtimeRoomTrack>;
  role: MeetRealtimeRole | null;
  classRole: 'host' | 'cohost' | 'participant';
  classAttendanceEnabled: boolean;
  classTimerEnabled: boolean;
  classTimer: ClassTimer | null;
  classTimerServerNow: string | null;
  selfUserId: string | null;
  stage: MeetRealtimeStageState;
  waiting: MeetRealtimeWaitingParticipant[];
}

export const INITIAL_CALL_STATE: CallState = {
  ended: false,
  settings: { shareNotes: false },
  approved: [],
  reactions: [],
  admission: 'connecting',
  chat: [],
  error: null,
  participants: {},
  recording: { sessionId: null, state: 'idle' },
  remoteTracks: {},
  role: null,
  classRole: 'participant',
  classAttendanceEnabled: false,
  classTimerEnabled: false,
  classTimer: null,
  classTimerServerNow: null,
  selfUserId: null,
  stage: {
    activeSpeakerIds: [],
    hostUserId: null,
    locked: false,
    raisedHandUserIds: [],
  },
  waiting: [],
};

export function remoteTrackKey(track: MeetRealtimeRoomTrack) {
  return `${encodeURIComponent(track.sessionId)}:${encodeURIComponent(track.trackName ?? track.mid ?? track.userId)}`;
}

/**
 * Folds a server message into the state the call UI renders. Pure so the whole
 * room lifecycle can be exercised without a socket, a peer connection or a
 * browser.
 */
export function reduceCallState(
  state: CallState,
  message: MeetRealtimeServerMessage
): CallState {
  switch (message.type) {
    case 'assistant.live':
      return {
        ...state,
        liveAssistant: message.active
          ? { sessionId: message.sessionId, ownerId: message.ownerId }
          : undefined,
      };
    case 'room.title.changed':
      return { ...state, title: message.title };
    case 'room.ended':
      return {
        ...state,
        ended: true,
        liveAssistant: undefined,
        participants: {},
        remoteTracks: {},
      };
    case 'room.settings':
      return { ...state, settings: message.settings };
    case 'admission.approved':
      return { ...state, approved: message.participants };
    case 'reaction':
      return { ...state, reactions: [...state.reactions, message].slice(-24) };
    case 'ready':
      return {
        ...state,
        liveAssistant: undefined,
        admission: message.admission === 'waiting' ? 'waiting' : 'admitted',
        admissionReason: undefined,
        roomExpiresAt: message.roomExpiresAt,
        maxParticipants: message.limits?.maxParticipants,
        error: null,
        remoteTracks: message.tracks
          ? Object.fromEntries(
              message.tracks
                .filter((track) => track.userId !== message.userId)
                .map((track) => [remoteTrackKey(track), track])
            )
          : message.resumed
            ? state.remoteTracks
            : {},
        role: message.role,
        classRole:
          message.classRole ??
          (message.role === 'host' ? 'host' : 'participant'),
        classAttendanceEnabled: message.classAttendanceEnabled === true,
        classTimerEnabled: message.classTimerEnabled === true,
        classTimer:
          message.admission === 'waiting' ? null : (message.classTimer ?? null),
        classTimerServerNow:
          message.admission === 'waiting' ? null : (message.serverNow ?? null),
        canManageParticipants:
          message.canManageParticipants ?? message.role === 'host',
        roomId: message.roomId,
        presenceSeq: null,
        presenceNeedsResync: false,
        selfUserId: message.userId,
        stage: message.stage,
      };

    case 'presence':
      if (state.ended || (state.roomId && state.roomId !== message.roomId))
        return state;
      return {
        ...state,
        presenceSeq: message.seq ?? null,
        presenceNeedsResync: false,
        participants: Object.fromEntries(
          message.presence.map((entry) => [entry.userId, entry])
        ),
      };

    case 'presence.delta': {
      if (
        state.admission !== 'admitted' ||
        state.ended ||
        state.roomId !== message.roomId ||
        state.presenceNeedsResync
      )
        return state;
      const result = applyPresenceDelta(
        state.participants,
        state.presenceSeq ?? null,
        message
      );
      return {
        ...state,
        participants: result.presence,
        presenceSeq: result.seq,
        presenceNeedsResync: result.gap,
      };
    }

    case 'admission.bulkResult':
      return {
        ...state,
        bulkAdmission: {
          admitted: message.admitted,
          denied: message.denied,
          remaining: message.remaining,
        },
      };

    case 'stage':
      return { ...state, stage: message.stage };

    case 'chat.message':
      if (state.chat.some((entry) => entry.id === message.id)) return state;
      return {
        ...state,
        chat: retainRoomChat(
          [
            ...state.chat,
            {
              replayed: message.replayed,
              clientMessageId: message.clientMessageId,
              accountId: message.accountId,
              avatarUrl: message.avatarUrl,
              assistant: message.assistant,
              attachmentIds: message.attachmentIds,
              body: message.body,
              createdAt: message.createdAt,
              displayName: message.displayName,
              id: message.id,
              userId: message.userId,
              retained: message.retained,
            },
          ].sort(
            (a, b) =>
              a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
          )
        ),
      };

    case 'admission.pending':
      return { ...state, waiting: message.participants };

    case 'admission.result':
      return {
        ...state,
        admission: message.admitted ? 'admitted' : 'denied',
        admissionReason: message.admitted ? undefined : 'denied',
        roomExpiresAt: message.roomExpiresAt ?? state.roomExpiresAt,
        error: message.admitted ? null : state.error,
      };

    case 'sfu.response':
      return message.action === 'sfu.tracks.publish' ||
        message.action === 'sfu.tracks.close'
        ? { ...state, error: null }
        : state;

    case 'track.published': {
      const remoteTracks = { ...state.remoteTracks };
      for (const track of message.tracks) {
        // Our own tracks come back on the broadcast; subscribing to them would
        // loop our audio straight back to us.
        if (track.userId === state.selfUserId) continue;
        // Older room snapshots can still contain an expired publisher session.
        for (const [key, previous] of Object.entries(remoteTracks)) {
          if (
            track.trackName &&
            previous.userId === track.userId &&
            previous.trackName === track.trackName &&
            previous.sessionId !== track.sessionId
          )
            delete remoteTracks[key];
        }
        remoteTracks[remoteTrackKey(track)] = track;
      }
      return { ...state, remoteTracks };
    }

    case 'track.closed': {
      const remoteTracks = { ...state.remoteTracks };
      for (const track of message.tracks) {
        delete remoteTracks[remoteTrackKey(track)];
      }
      return { ...state, remoteTracks };
    }

    case 'participant.removed': {
      if (message.userId === state.selfUserId) {
        return { ...state, admission: 'denied', admissionReason: 'removed' };
      }
      const participants = { ...state.participants };
      delete participants[message.userId];
      return {
        ...state,
        participants,
        remoteTracks: Object.fromEntries(
          Object.entries(state.remoteTracks).filter(
            ([, track]) => track.userId !== message.userId
          )
        ),
      };
    }

    case 'recording.state':
      return {
        ...state,
        recording: {
          ownerDeviceId: message.ownerDeviceId,
          sessionId:
            message.state === 'idle' || message.state === 'error'
              ? null
              : (message.recordingSessionId ?? state.recording.sessionId),
          state: message.state,
        },
      };

    case 'classTimer':
      return {
        ...state,
        classTimer: message.timer,
        classTimerServerNow: message.serverNow,
        error: null,
      };
    case 'error':
      return { ...state, error: message.error };

    default:
      return state;
  }
}

/** The single place the lifecycle is derived from the room's flags. */
export function selectCallLifecycle(
  state: Pick<CallState, 'ended' | 'admission'>,
  joined: boolean
): CallLifecycle {
  if (state.ended) return 'ended';
  if (state.admission === 'denied') return 'error';
  if (state.admission === 'waiting') return 'joining';
  if (joined) return 'live';
  return state.admission === 'connecting' ? 'preparing' : 'joining';
}

/** Whether a screen for this lifecycle is still waiting on something. */
export function isCallLifecycleBusy(lifecycle: CallLifecycle): boolean {
  switch (lifecycle) {
    case 'preparing':
    case 'joining':
      return true;
    case 'live':
    case 'ended':
    case 'error':
      return false;
    default: {
      const unreachable: never = lifecycle;
      return unreachable;
    }
  }
}

export function selectSelf(state: CallState) {
  return state.selfUserId
    ? (state.participants[state.selfUserId] ?? null)
    : null;
}

/** Everyone except us, ordered so raised hands surface first. */
export function selectOthers(state: CallState) {
  const raised = new Set(state.stage.raisedHandUserIds);
  return Object.values(state.participants)
    .filter((entry) => entry.userId !== state.selfUserId)
    .sort((a, b) => {
      const handDelta =
        Number(raised.has(b.userId)) - Number(raised.has(a.userId));
      if (handDelta !== 0) return handDelta;
      return a.displayName.localeCompare(b.displayName);
    });
}

/**
 * Whoever the speaker view should focus. Prefers the active speaker, then
 * anyone sharing their screen, then the first other participant.
 */
export function selectFocusedUserId(state: CallState) {
  const [activeSpeaker] = state.stage.activeSpeakerIds.filter(
    (id) => id !== state.selfUserId && state.participants[id]
  );
  if (activeSpeaker) return activeSpeaker;

  const sharing = Object.values(state.participants).find(
    (entry) => entry.media.screenEnabled
  );
  if (sharing) return sharing.userId;

  return selectOthers(state)[0]?.userId ?? state.selfUserId;
}

export function isHandRaised(state: CallState, userId: string) {
  return state.stage.raisedHandUserIds.includes(userId);
}

export function describeMedia(media: MeetMediaState) {
  return {
    isCameraOn: media.videoEnabled,
    isMuted: !media.audioEnabled,
    isSharing: media.screenEnabled,
  };
}

/** Count unread arrivals even after the bounded chat history starts evicting. */
export function countUnreadChatMessages(
  chat: CallChatMessage[],
  lastReadId: string | null
) {
  if (!lastReadId) return chat.filter((entry) => !entry.replayed).length;
  const index = chat.findIndex((message) => message.id === lastReadId);
  return chat
    .slice(index < 0 ? 0 : index + 1)
    .filter((entry) => !entry.replayed).length;
}

function localMediaActor(state: CallState) {
  return {
    userId: state.selfUserId ?? '',
    accountId: state.participants[state.selfUserId ?? '']?.accountId,
    role: state.role ?? 'viewer',
    canManageParticipants: state.canManageParticipants,
  } as const;
}
export function localMediaLocks(state: CallState) {
  const actor = localMediaActor(state);
  return {
    audio: isMeetMediaLocked(state.settings, actor, 'audio'),
    video: isMeetMediaLocked(state.settings, actor, 'video'),
    screen: isMeetMediaLocked(state.settings, actor, 'screen'),
  };
}
export function clampLocalMedia(state: CallState, media: MeetMediaState) {
  return clampMeetMedia(state.settings, localMediaActor(state), media);
}
