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
  if (!isCurrent()) return;
  owner.track = track;
  setMedia((current) =>
    isCurrent()
      ? {
          ...current,
          [owner.userId]: { ...current[owner.userId], [owner.kind]: track },
        }
      : current
  );
  const release = () => {
    if (!isCurrent() || owner.track !== track) return;
    subscribed.delete(owner.subscriptionKey);
    setMedia((current) =>
      isCurrent() ? removeRemotePlayback(current, owner) : current
    );
  };
  if (track.readyState === 'ended') release();
  else track.addEventListener('ended', release, { once: true });
}

/** A stale session closing must not clear its replacement's live playback. */
export function removeRemotePlayback(
  current: RemoteMedia,
  owner: RemoteTrackOwner
): RemoteMedia {
  if (!owner.track || current[owner.userId]?.[owner.kind] !== owner.track)
    return current;
  const next = { ...current, [owner.userId]: { ...current[owner.userId] } };
  delete next[owner.userId]![owner.kind];
  if (!Object.keys(next[owner.userId]!).length) delete next[owner.userId];
  return next;
}

/** Only an overlapping in-flight offer needs a fresh subscriber connection. */
export function releaseClosedSubscriptions(
  closed: Set<string>,
  owners: Map<string, RemoteTrackOwner>,
  subscribed: Set<string>,
  pending: Set<string>,
  setMedia: (update: (current: RemoteMedia) => RemoteMedia) => void
): boolean {
  for (const key of closed) subscribed.delete(key);
  for (const [mid, owner] of owners) {
    if (!closed.has(owner.subscriptionKey)) continue;
    owners.delete(mid);
    setMedia((current) => removeRemotePlayback(current, owner));
  }
  return [...closed].some((key) => pending.has(key));
}
