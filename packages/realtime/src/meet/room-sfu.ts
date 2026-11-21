import type {
  MeetRealtimeClientMessage,
  MeetRealtimeSfuClientMessage,
} from './messages';
import {
  canMeetRealtimePublish,
  canMeetRealtimeManageParticipants,
  isMeetMediaLocked,
  meetTrackKind,
  hasMeetRealtimeScope,
  MEET_REALTIME_SCOPES,
} from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import type {
  MeetRoomOutcome,
  MeetRoomSnapshot,
  MeetRoomSocketAttachment,
} from './room';
import { roomCapacityError } from './room-budget';
import { denied, outcome } from './room-outcome';
import { meetTrackKey, replaceRoomPublications } from './room-tracks';
import { advertisedCameraRids } from './simulcast-layers';
export function applySfuCommand(
  state: MeetRoomSnapshot,
  message: MeetRealtimeSfuClientMessage,
  token: MeetRealtimeTokenPayload,
  canCloseSubscriptions?: () => boolean
): MeetRoomOutcome {
  if (message.type === 'sfu.tracks.update') {
    // Only the subscriber's own provider-confirmed receivers may change layer,
    // and only to a layer a current room camera publication advertises. A
    // receiver can never be pointed at anything it could not subscribe to.
    const cameras = new Map(
      Object.values(state.tracks).map((track) => [
        `${track.sessionId}\u0000${track.trackName}`,
        track,
      ])
    );
    if (
      !hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.sfuSubscribe) ||
      !canCloseSubscriptions?.() ||
      message.tracks.some((track) => {
        const publication = cameras.get(
          `${track.sessionId}\u0000${track.trackName}`
        );
        return (
          !track.simulcast ||
          !publication ||
          publication.userId === token.userId ||
          meetTrackKind(publication) !== 'video' ||
          !publication.cameraRids?.includes(track.simulcast.preferredRid) ||
          (track.location !== undefined && track.location !== 'remote')
        );
      })
    )
      return denied(state, 'permission_denied', message.requestId);
    return outcome(state, {
      sfu: {
        requestId: message.requestId,
        message: {
          ...message,
          tracks: message.tracks.map(
            ({ mid, sessionId, trackName, simulcast }) => ({
              location: 'remote',
              mid,
              sessionId,
              trackName,
              simulcast,
            })
          ),
        },
      },
    });
  }
  if (message.type === 'sfu.tracks.close' && message.subscription) {
    if (
      !hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.sfuSubscribe) ||
      !canCloseSubscriptions?.()
    )
      return denied(state, 'permission_denied', message.requestId);
    return outcome(state, {
      sfu: {
        requestId: message.requestId,
        message: {
          ...message,
          force: true,
          tracks: message.tracks.map(({ mid }) => ({ mid })),
        },
      },
    });
  }

  const requiredScope =
    message.type === 'sfu.tracks.subscribe'
      ? MEET_REALTIME_SCOPES.sfuSubscribe
      : message.type === 'sfu.tracks.close'
        ? MEET_REALTIME_SCOPES.sfuPublish
        : MEET_REALTIME_SCOPES.sfuJoin;

  if (
    message.type === 'sfu.tracks.publish' &&
    !message.tracks.every((track) => {
      const kind = meetTrackKind(track);
      const namedKind = meetTrackKind({ trackName: track.trackName });
      const actor = {
        ...token,
        canManageParticipants: canMeetRealtimeManageParticipants(token),
      };
      return (
        canMeetRealtimePublish(token, kind) &&
        !isMeetMediaLocked(state.settings, actor, kind) &&
        !isMeetMediaLocked(
          state.settings,
          actor,
          namedKind === 'video' && !track.trackName?.endsWith('-video')
            ? kind
            : namedKind
        )
      );
    })
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
    const capacityError = roomCapacityError(state, token);
    if (capacityError) return denied(state, capacityError, message.requestId);
    if (message.tracks.some((track) => !track.mid))
      return denied(state, 'invalid_publication', message.requestId);
    if (
      state.retiredSessions?.[
        `${encodeURIComponent(token.userId)}:${encodeURIComponent(message.sessionId)}`
      ]
    )
      return denied(state, 'stale_publication', message.requestId);
    const mediaSections = new Map(
      message.sessionDescription.sdp
        .split(/(?=^m=)/m)
        .map((section) => [
          section.match(/^a=mid:(.+)\r?$/m)?.[1]?.trim(),
          section,
        ])
    );
    // The media line must agree with the advertised kind when SDP carries it.
    // This also prevents an audio label from bypassing a camera lock.
    if (
      message.tracks.some((track) => {
        const section = mediaSections.get(track.mid);
        const kind = meetTrackKind(track);
        const audio = kind === 'audio' || kind === 'screen_audio';
        return (
          (track.location !== undefined && track.location !== 'local') ||
          !!section?.startsWith(audio ? 'm=video ' : 'm=audio ')
        );
      })
    )
      return denied(state, 'publish_not_allowed', message.requestId);
    const published = message.tracks.map((track) => {
      const section = mediaSections.get(track.mid);
      const kind = meetTrackKind(track);
      const cameraRids =
        kind === 'video' && section ? advertisedCameraRids(section) : [];
      return {
        ...track,
        sessionId: message.sessionId,
        userId: token.userId,
        ...(cameraRids.length > 1 ? { cameraRids } : {}),
      };
    });
    const { tracks, broadcast, retired, error } = replaceRoomPublications(
      state.tracks,
      published,
      state.retiredTracks
    );
    if (error) return denied(state, error, message.requestId);
    if (new Set(published.map(meetTrackKey)).size !== published.length)
      return denied(state, 'invalid_publication', message.requestId);
    if (
      Object.values(tracks).filter((track) => track.userId === token.userId)
        .length > 6
    )
      return denied(state, 'media_track_limit_reached', message.requestId);
    const next = { ...state, tracks, retiredTracks: retired };

    return outcome(next, {
      broadcast: [
        ...broadcast,
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
    if ([...closing].some((key) => state.tracks[key]?.userId !== token.userId))
      return denied(state, 'permission_denied', message.requestId);
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

  if (message.type === 'sfu.tracks.subscribe') {
    if (
      message.tracks.some(
        (track) => track.location && track.location !== 'remote'
      )
    )
      return denied(state, 'invalid_subscription', message.requestId);
    return outcome(state, {
      sfu: {
        message: {
          ...message,
          tracks: message.tracks.map(({ sessionId, trackName, simulcast }) => ({
            location: 'remote',
            sessionId,
            trackName,
            simulcast,
          })),
        },
        requestId: message.requestId,
      },
    });
  }
  return outcome(state, { sfu: { message, requestId: message.requestId } });
}

type SocketSessionRegistry = Record<string, string[]>;

/** Only provider-confirmed receiver MIDs in a socket's own session may be closed or re-layered. */
export function canCloseMeetSubscriptions(
  sessions: SocketSessionRegistry | undefined,
  message: MeetRealtimeClientMessage
) {
  if (
    (message.type !== 'sfu.tracks.close' &&
      message.type !== 'sfu.tracks.update') ||
    !sessions ||
    !Object.hasOwn(sessions, message.sessionId)
  )
    return false;
  const mids = sessions[message.sessionId]!;
  return message.tracks.every(
    (track) => !!track.mid && mids.includes(track.mid)
  );
}

function updateMeetSubscriberRegistry(
  sessions: SocketSessionRegistry,
  command: MeetRealtimeClientMessage,
  result: unknown
): SocketSessionRegistry {
  if (!result || typeof result !== 'object') return sessions;
  if (
    command.type === 'sfu.session.create' &&
    'sessionId' in result &&
    typeof result.sessionId === 'string'
  )
    return Object.fromEntries(
      [...Object.entries(sessions), [result.sessionId, []]].slice(-4)
    );
  if (!('sessionId' in command) || !Object.hasOwn(sessions, command.sessionId))
    return sessions;
  const current = sessions[command.sessionId]!;
  if (
    command.type === 'sfu.tracks.subscribe' &&
    'tracks' in result &&
    Array.isArray(result.tracks)
  ) {
    const mids = result.tracks.flatMap((track: unknown) =>
      track &&
      typeof track === 'object' &&
      'mid' in track &&
      typeof track.mid === 'string' &&
      !('errorCode' in track && track.errorCode)
        ? [track.mid]
        : []
    );
    return {
      ...sessions,
      [command.sessionId]: [...new Set([...current, ...mids])].slice(-512),
    };
  }
  if (command.type === 'sfu.tracks.close' && command.subscription) {
    const closing = new Set(command.tracks.map((track) => track.mid));
    return {
      ...sessions,
      [command.sessionId]: current.filter((mid) => !closing.has(mid)),
    };
  }
  return sessions;
}

export function recordMeetSubscriptionOperation(
  socket: {
    serializeAttachment: (attachment: MeetRoomSocketAttachment) => void;
  },
  attached: MeetRoomSocketAttachment | null,
  message: MeetRealtimeClientMessage,
  replies: MeetRoomOutcome['reply']
) {
  if (
    !attached ||
    !message.type.startsWith('sfu.') ||
    typeof socket.serializeAttachment !== 'function'
  )
    return;
  const reply = replies.find((entry) => entry.type === 'sfu.response');
  if (!reply) return;
  const prior = attached.sessions ?? {};
  const sessions = updateMeetSubscriberRegistry(prior, message, reply.result);
  if (sessions !== prior) socket.serializeAttachment({ ...attached, sessions });
}

export const LAYER_UPDATE_RATE_LIMITED = 'layer_update_rate_limited';

/**
 * A layer switch changes no tracks, presence, settings or lifecycle; only the
 * running time accounting advances. Those outcomes may skip the durable write.
 */
export function isMeetStatelessSfuOutcome(
  previous: MeetRoomSnapshot,
  result: MeetRoomOutcome
) {
  const next = result.state;
  return (
    !result.broadcast.length &&
    !result.toManagers.length &&
    !result.direct.length &&
    !result.disconnect.length &&
    next.tracks === previous.tracks &&
    next.presence === previous.presence &&
    next.waiting === previous.waiting &&
    next.settings === previous.settings &&
    next.ended === previous.ended &&
    next.lifecycle === previous.lifecycle &&
    next.attendance === previous.attendance &&
    result.reply.length > 0 &&
    result.reply.every(
      (reply) =>
        (reply.type === 'sfu.response' &&
          reply.action === 'sfu.tracks.update') ||
        (reply.type === 'error' && reply.error === LAYER_UPDATE_RATE_LIMITED)
    )
  );
}

/**
 * Coalesces durable snapshot writes for layer switches: at most one per
 * interval, so time accounting lost on an eviction is bounded by it.
 */
export function createMeetSnapshotWriteGate(
  intervalMs = 15_000,
  clock: () => number = Date.now
) {
  let lastWrite = -Infinity;
  return (previous: MeetRoomSnapshot, result: MeetRoomOutcome) => {
    const now = clock();
    if (
      isMeetStatelessSfuOutcome(previous, result) &&
      now - lastWrite < intervalMs
    )
      return true;
    lastWrite = now;
    return false;
  };
}
