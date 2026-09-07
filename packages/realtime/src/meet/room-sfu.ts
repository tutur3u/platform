import type { MeetRealtimeSfuClientMessage } from './messages';
import {
  canMeetRealtimePublish,
  hasMeetRealtimeScope,
  MEET_REALTIME_SCOPES,
} from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomOutcome, MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';
import { meetTrackKey, replaceRoomPublications } from './room-tracks';
export function applySfuCommand(
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
    const { tracks, broadcast, retired, error } = replaceRoomPublications(
      state.tracks,
      published,
      state.retiredTracks
    );
    if (error) return denied(state, error, message.requestId);
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
