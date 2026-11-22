import {
  type AttendanceInterval,
  closeAttendanceInterval,
} from './attendance-ledger';
import type { ClassTimer } from './class-timer';
import { type MeetClassFeatures, meetClassFeatures } from './class-features';
import {
  canMeetRealtimeManageParticipants,
  canMeetRealtimeRunActivities,
  meetNonClassMedia,
} from './permissions';
import type { RoomBudget } from './room-budget';
import type { RoomFormsState } from './room-forms';
import { hasMeetMediaContextConflict } from './room-media-role';
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
  extends TranscriptionRoomState, RoomFormsState {
  lifecycle?: import('./room-lifecycle').MeetRoomLifecycle;
  liveAssistant?: import('./room-live').RoomLiveState;
  budget?: RoomBudget;
  attachments?: Record<string, RoomAttachment>;
  usage?: RoomUsage;
  mediaQuality?: import('./room-media-quality').RoomMediaQuality;
  approved?: Record<string, MeetApprovedParticipant>;
  settings?: MeetRoomSettings;
  ended?: boolean;
  lastReactionAt?: Record<string, number>;
  /** Sender user id -> last accepted Follow/Summon request (epoch ms). */
  lastNavigationAt?: Record<string, number>;
  /** Sender user id -> last relayed follow stop (epoch ms). */
  lastNavigationStopAt?: Record<string, number>;
  retiredTracks?: Record<string, true>;
  retiredSessions?: Record<string, true>;
  presence: Record<string, MeetRealtimePresence>;
  presenceSeq?: number;
  deniedAutoAdmission?: string[];
  /** Stable guest account id -> removal ban expires at (epoch ms). */
  removedGuests?: Record<string, number>;
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
  classTimer?: ClassTimer | null;
  attendance?: AttendanceInterval[];
  attendanceEpoch?: number;
  /** Durable room id so a cold alarm can still publish the attendance directory. */
  roomName?: string;
  attendanceIndex?: import('./attendance-directory').AttendanceIndexState;
  endedAt?: string;
  serviceLimits?: Record<string, { resetAt: number; count: number }>;
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
  /**
   * Whether the room's workspace may use Meet AI (allowlist, resolved by the
   * runtime). Absent means not eligible, so enabling note sharing is denied.
   */
  notesEligible?: boolean;
  requireAdmission?: boolean;
  canCloseSubscriptions?: () => boolean;
  /** Absent uses the process environment. An omitted switch stays off. */
  classFeatures?: MeetClassFeatures;
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
    ...(canMeetRealtimeManageParticipants(token) && token.role !== 'host'
      ? { canManageParticipants: true }
      : {}),
    ...(token.guest ? { guest: true as const } : {}),
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
    nonClassMedia: meetNonClassMedia(token),
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
  roomId: string,
  seq?: number
): MeetRealtimeServerMessage {
  return {
    presence: Object.values(state.presence),
    roomId,
    type: 'presence',
    ...(seq === undefined ? {} : { seq }),
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
  roomId: string,
  now: string | MeetClassFeatures = new Date().toISOString(),
  featureOverride?: MeetClassFeatures
): MeetRoomOutcome {
  const features =
    typeof now === 'string' ? (featureOverride ?? meetClassFeatures()) : now;
  const leftAt = typeof now === 'string' ? now : new Date().toISOString();
  const presence = { ...state.presence };
  const waiting = { ...state.waiting };
  const lastReactionAt = { ...state.lastReactionAt };
  delete lastReactionAt[userId];
  const lastNavigationAt = { ...state.lastNavigationAt };
  delete lastNavigationAt[userId];
  const lastNavigationStopAt = { ...state.lastNavigationStopAt };
  delete lastNavigationStopAt[userId];
  delete presence[userId];
  delete waiting[userId];

  const tracks = Object.fromEntries(
    Object.entries(state.tracks).filter(([, track]) => track.userId !== userId)
  );
  const attendance = features.attendance
    ? closeAttendanceInterval(state.attendance, userId, leftAt)
    : state.attendance;
  const next: MeetRoomSnapshot = {
    ...(state.recording.ownerDeviceId === userId
      ? failActiveRecording(state)
      : state),
    ...(attendance === state.attendance ? {} : { attendance }),
    lastReactionAt,
    ...(state.lastNavigationAt ? { lastNavigationAt } : {}),
    ...(state.lastNavigationStopAt ? { lastNavigationStopAt } : {}),
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

export type MeetRoomSocketAttachment = {
  token: MeetRealtimeTokenPayload;
  presenceSeq?: number;
  supportsPresenceDelta?: boolean;
  sessions?: Record<string, string[]>;
};
type MeetRoomSocket = {
  readyState: number;
  send: (message: string) => void;
  close: (code: number, reason: string) => void;
  deserializeAttachment: () => unknown;
  serializeAttachment: (value: MeetRoomSocketAttachment) => void;
};

/** Use one serialized frame for room broadcasts and filter by live admission. */
export function createMeetRoomSocketDelivery<Socket extends MeetRoomSocket>({
  sockets,
  read,
  fullPresence,
  announcements,
}: {
  sockets: () => Socket[];
  read: () => MeetRoomSnapshot;
  fullPresence: (roomId: string) => MeetRealtimeServerMessage;
  announcements: () => MeetRealtimeServerMessage[];
}) {
  const attachmentOf = (socket: Socket) =>
    socket.deserializeAttachment() as MeetRoomSocketAttachment | null;
  const tokenOf = (socket: Socket) => {
    const token = attachmentOf(socket)?.token;
    return token && !hasMeetMediaContextConflict(read(), token) ? token : null;
  };
  function sendTo(
    socket: Socket,
    message: MeetRealtimeServerMessage,
    wire?: string
  ) {
    if (
      message.type === 'activity.mine' ||
      message.type === 'activity.host' ||
      message.type === 'penboard.snapshot' ||
      message.type === 'penboard.stroke'
    ) {
      const state = read();
      const token = tokenOf(socket);
      if (
        !token ||
        state.ended ||
        !state.presence[token.userId] ||
        state.waiting[token.userId] ||
        (message.type === 'activity.host' &&
          !canMeetRealtimeRunActivities(token))
      )
        return;
    }
    try {
      socket.send(wire ?? JSON.stringify(message));
      if (
        (message.type === 'presence' || message.type === 'presence.delta') &&
        message.seq !== undefined
      ) {
        const attachment = attachmentOf(socket);
        if (attachment && typeof socket.serializeAttachment === 'function')
          socket.serializeAttachment({
            ...attachment,
            presenceSeq: message.seq,
          });
      }
      if (
        message.type === 'admission.approved' ||
        (message.type === 'ready' && message.admission === 'admitted')
      )
        for (const active of announcements())
          socket.send(JSON.stringify(active));
    } catch {
      // A closing socket is not an error worth surfacing to the room.
    }
  }

  function sendToSocket(socket: Socket, replies: MeetRealtimeServerMessage[]) {
    for (const reply of replies) sendTo(socket, reply);
  }

  function broadcast(messages: MeetRealtimeServerMessage[]) {
    messages = messages.filter((message) => message.type !== 'presence');
    if (!messages.length) return;
    const frames = messages.map((message) => ({
      message,
      wire: JSON.stringify(message),
    }));
    let legacyPresence: MeetRealtimeServerMessage | undefined;
    let legacyWire: string | undefined;
    for (const socket of sockets()) {
      const token = tokenOf(socket);
      const admitted = token && read().presence[token.userId];
      for (const { message, wire } of frames) {
        if (
          message.type !== 'room.ended' &&
          !(
            message.type === 'participant.removed' &&
            message.userId === token?.userId
          ) &&
          !admitted
        )
          continue;
        if (message.type === 'presence.delta') {
          const attachment = attachmentOf(socket);
          if (
            !attachment?.supportsPresenceDelta ||
            attachment.presenceSeq === undefined
          ) {
            legacyPresence ??= fullPresence(message.roomId);
            legacyWire ??= JSON.stringify(legacyPresence);
            sendTo(socket, legacyPresence, legacyWire);
            continue;
          }
        }
        sendTo(socket, message, wire);
      }
    }
  }

  function sendToUser(userId: string, messages: MeetRealtimeServerMessage[]) {
    if (!messages.length) return;
    for (const socket of sockets()) {
      if (tokenOf(socket)?.userId !== userId) continue;
      for (const message of messages) {
        sendTo(socket, message);
        const token = tokenOf(socket);
        if (message.type === 'admission.result' && message.admitted && token)
          sendTo(socket, fullPresence(token.roomId));
      }
    }
  }

  function sendToManagers(messages: MeetRealtimeServerMessage[]) {
    if (!messages.length) return;
    for (const socket of sockets()) {
      const token = tokenOf(socket);
      if (!token) continue;
      const manages = canMeetRealtimeManageParticipants(token);
      // The activity view also goes to workspace co-hosts, who run activities
      // without managing participants. Nothing else here reaches them.
      const runs = canMeetRealtimeRunActivities(token);
      for (const message of messages)
        if (manages || (runs && message.type === 'activity.host'))
          sendTo(socket, message);
    }
  }

  function disconnect(userIds: string[]) {
    if (!userIds.length) return;
    const targets = new Set(userIds);
    for (const socket of sockets()) {
      const token = tokenOf(socket);
      if (token && targets.has(token.userId))
        socket.close(4403, 'removed_from_room');
    }
  }

  function notifyJoin(
    socket: Socket,
    result: MeetRoomOutcome,
    emit: typeof broadcast
  ) {
    sendToSocket(socket, result.reply);
    emit(result.broadcast);
    sendToManagers(result.toManagers);
  }

  function connectedUsers(excluded?: Socket) {
    const users = new Set<string>();
    for (const socket of sockets()) {
      if (socket === excluded || socket.readyState !== WebSocket.OPEN) continue;
      const token = tokenOf(socket);
      if (token) users.add(token.userId);
    }
    return users;
  }

  function resyncRestoredSockets() {
    const state = read();
    if (state.presenceSeq === undefined) return;
    for (const socket of sockets()) {
      const attachment = attachmentOf(socket);
      if (
        attachment &&
        attachment.presenceSeq !== state.presenceSeq &&
        state.presence[attachment.token.userId] &&
        tokenOf(socket)
      )
        sendTo(socket, fullPresence(attachment.token.roomId));
    }
  }
  return {
    notifyJoin,
    sendToSocket,
    connectedUsers,
    resyncRestoredSockets,
    attachmentOf,
    tokenOf,
    sendTo,
    broadcast,
    sendToUser,
    sendToManagers,
    disconnect,
  };
}
