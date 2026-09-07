import type {
  MeetRealtimeRoomTrack,
  MeetRealtimeServerMessage,
} from './messages';

export function meetTrackKey(track: MeetRealtimeRoomTrack) {
  return `${track.sessionId}:${track.trackName ?? track.mid ?? track.userId}`;
}

/** A recovered publisher replaces its previous registration for each named track. */
export function replaceRoomPublications(
  current: Record<string, MeetRealtimeRoomTrack>,
  published: MeetRealtimeRoomTrack[]
) {
  const tracks = { ...current };
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
  return { tracks, broadcast };
}
