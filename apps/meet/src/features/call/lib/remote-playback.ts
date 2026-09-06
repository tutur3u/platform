import type { MeetRealtimeTrackKind } from '@tuturuuu/realtime/meet';
import type { RemoteMedia } from './remote-streams';

export type RemoteTrackOwner = {
  userId: string;
  kind: MeetRealtimeTrackKind;
  subscriptionKey: string;
  track?: MediaStreamTrack;
};

/** Release ended subscriptions so the room's retry loop can pull them again. */
export function attachRemotePlayback(
  owner: RemoteTrackOwner,
  track: MediaStreamTrack,
  subscribed: Set<string>,
  isCurrent: () => boolean,
  setMedia: (update: (current: RemoteMedia) => RemoteMedia) => void
) {
  owner.track = track;
  setMedia((current) => ({
    ...current,
    [owner.userId]: { ...current[owner.userId], [owner.kind]: track },
  }));
  const release = () => {
    if (!isCurrent() || owner.track !== track) return;
    subscribed.delete(owner.subscriptionKey);
    setMedia((current) => {
      if (current[owner.userId]?.[owner.kind] !== track) return current;
      const next = {
        ...current,
        [owner.userId]: { ...current[owner.userId] },
      };
      delete next[owner.userId]![owner.kind];
      if (!Object.keys(next[owner.userId]!).length) delete next[owner.userId];
      return next;
    });
  };
  if (track.readyState === 'ended') release();
  else track.addEventListener('ended', release, { once: true });
}
