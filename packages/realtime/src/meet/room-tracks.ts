import type {
  MeetRealtimeRoomTrack,
  MeetRealtimeServerMessage,
} from './messages';

export const MAX_RETIRED_TRACKS_PER_PARTICIPANT = 512;

export function meetTrackKey(track: MeetRealtimeRoomTrack) {
  return `${encodeURIComponent(track.sessionId)}:${encodeURIComponent(track.trackName ?? track.mid ?? track.userId)}`;
}

export function retiredTrackKey(track: MeetRealtimeRoomTrack) {
  return `${encodeURIComponent(track.userId)}:${meetTrackKey(track)}`;
}

/** A recovered publisher replaces its previous registration for each named track. */
export function replaceRoomPublications(
  current: Record<string, MeetRealtimeRoomTrack>,
  published: MeetRealtimeRoomTrack[],
  retired: Record<string, true> = {}
) {
  if (published.some((track) => retired[retiredTrackKey(track)]))
    return {
      tracks: current,
      broadcast: [],
      retired,
      stale: true,
      error: 'stale_publication',
    };
  const tracks = { ...current };
  const nextRetired = { ...retired };
  const closed = new Map<string, MeetRealtimeRoomTrack[]>();
  for (const next of published) {
    for (const [key, previous] of Object.entries(tracks)) {
      if (
        next.trackName &&
        previous.trackName === next.trackName &&
        previous.userId === next.userId &&
        previous.sessionId !== next.sessionId
      ) {
        delete tracks[key];
        nextRetired[retiredTrackKey(previous)] = true;
        const group = closed.get(previous.sessionId) ?? [];
        group.push(previous);
        closed.set(previous.sessionId, group);
      }
    }
    tracks[meetTrackKey(next)] = next;
  }
  for (const userId of new Set(published.map((track) => track.userId))) {
    const prefix = `${encodeURIComponent(userId)}:`;
    if (
      Object.keys(nextRetired).filter((key) => key.startsWith(prefix)).length >
      MAX_RETIRED_TRACKS_PER_PARTICIPANT
    )
      return {
        tracks: current,
        broadcast: [],
        retired,
        stale: true,
        error: 'publisher_rejoin_required',
      };
  }
  const broadcast: MeetRealtimeServerMessage[] = [...closed].map(
    ([sessionId, removed]) => ({
      type: 'track.closed',
      sessionId,
      userId: removed[0]!.userId,
      tracks: removed,
    })
  );
  return {
    tracks,
    broadcast,
    retired: nextRetired,
    stale: false,
    error: undefined,
  };
}
