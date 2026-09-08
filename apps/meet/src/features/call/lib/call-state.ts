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
} from '@tuturuuu/realtime/meet';

export type CallAdmission = 'connecting' | 'waiting' | 'admitted' | 'denied';

export interface CallChatMessage {
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
  title?: string;
  ended: boolean;
  settings: MeetRoomSettings;
  approved: MeetApprovedParticipant[];
  reactions: Array<{
    reaction: MeetReaction;
    userId: string;
    createdAt: string;
  }>;
  admission: CallAdmission;
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
  selfUserId: null,
  stage: {
    activeSpeakerIds: [],
    hostUserId: null,
    locked: false,
    raisedHandUserIds: [],
  },
  waiting: [],
};

const MAX_CHAT_MESSAGES = 500;

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
    case 'room.title.changed':
      return { ...state, title: message.title };
    case 'room.ended':
      return { ...state, ended: true, participants: {}, remoteTracks: {} };
    case 'room.settings':
      return { ...state, settings: message.settings };
    case 'admission.approved':
      return { ...state, approved: message.participants };
    case 'reaction':
      return { ...state, reactions: [...state.reactions, message].slice(-24) };
    case 'ready':
      return {
        ...state,
        admission: message.admission === 'waiting' ? 'waiting' : 'admitted',
        remoteTracks: {},
        role: message.role,
        selfUserId: message.userId,
        stage: message.stage,
      };

    case 'presence':
      return {
        ...state,
        participants: Object.fromEntries(
          message.presence.map((entry) => [entry.userId, entry])
        ),
      };

    case 'stage':
      return { ...state, stage: message.stage };

    case 'chat.message':
      return {
        ...state,
        chat: [
          ...state.chat,
          {
            body: message.body,
            createdAt: message.createdAt,
            displayName: message.displayName,
            id: message.id,
            userId: message.userId,
          },
        ].slice(-MAX_CHAT_MESSAGES),
      };

    case 'admission.pending':
      return { ...state, waiting: message.participants };

    case 'admission.result':
      return {
        ...state,
        admission: message.admitted ? 'admitted' : 'denied',
      };

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
        return { ...state, admission: 'denied' };
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

    case 'error':
      return { ...state, error: message.error };

    default:
      return state;
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
  if (!lastReadId) return chat.length;
  const index = chat.findIndex((message) => message.id === lastReadId);
  return index < 0 ? chat.length : chat.length - index - 1;
}
