import type { MeetRealtimeTrackKind } from '@tuturuuu/realtime/meet';

export type RemoteMedia = Record<
  string,
  Partial<Record<MeetRealtimeTrackKind, MediaStreamTrack>>
>;

/** Preserve unaffected participants' playback when another track arrives. */
export function createRemoteStreamCache() {
  const cache = new Map<string, MediaStream>();
  return (media: RemoteMedia, sharingUsers: string) => {
    const sharing = new Set(sharingUsers.split(','));
    for (const id of cache.keys()) {
      if (!media[id]) cache.delete(id);
    }
    return Object.fromEntries(
      Object.entries(media).map(([id, tracks]) => {
        const selected = [
          tracks.audio,
          sharing.has(id) ? tracks.screen : tracks.video,
        ].filter((track): track is MediaStreamTrack => Boolean(track));
        let stream = cache.get(id);
        const current = stream?.getTracks() ?? [];
        if (
          !stream ||
          current.length !== selected.length ||
          selected.some((track) => !current.includes(track))
        ) {
          stream = new MediaStream(selected);
          cache.set(id, stream);
        }
        return [id, stream];
      })
    );
  };
}
