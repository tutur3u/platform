import type {
  MeetRealtimeRoomTrack,
  MeetRealtimeServerMessage,
} from './messages';

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
    return { tracks: current, broadcast: [], retired, stale: true };
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
  const broadcast: MeetRealtimeServerMessage[] = [...closed].map(
    ([sessionId, removed]) => ({
      type: 'track.closed',
      sessionId,
      userId: removed[0]!.userId,
      tracks: removed,
    })
  );
  return { tracks, broadcast, retired: nextRetired, stale: false };
}
