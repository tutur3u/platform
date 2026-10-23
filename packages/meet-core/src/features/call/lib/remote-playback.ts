import type { MeetRealtimeTrackKind } from '@tuturuuu/realtime/meet';
import type { RemoteMedia } from './remote-streams';

export type RemoteTrackOwner = {
  userId: string;
  kind: MeetRealtimeTrackKind;
  subscriptionKey: string;
  track?: MediaStreamTrack;
};

// Participant ids key plain objects; never let one address the prototype chain.
const UNSAFE_MEDIA_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Release ended subscriptions so the room's retry loop can pull them again. */
export function attachRemotePlayback(
  owner: RemoteTrackOwner,
  track: MediaStreamTrack,
  subscribed: Set<string>,
  isCurrent: () => boolean,
  setMedia: (update: (current: RemoteMedia) => RemoteMedia) => void
) {
  if (!isCurrent() || UNSAFE_MEDIA_KEYS.has(owner.userId)) return;
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
  if (
    !owner.track ||
    !Object.hasOwn(current, owner.userId) ||
    current[owner.userId]?.[owner.kind] !== owner.track
  )
    return current;
  const { [owner.userId]: tracks, ...others } = current;
  const remaining = { ...tracks };
  delete remaining[owner.kind];
  return Object.keys(remaining).length
    ? { ...others, [owner.userId]: remaining }
    : others;
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

/** Renegotiation can reuse a receiver without dispatching another track event. */
export function reconcileRemotePlayback(
  pc: RTCPeerConnection,
  owners: Map<string, RemoteTrackOwner>,
  subscribed: Set<string>,
  isCurrentConnection: () => boolean,
  setMedia: (update: (current: RemoteMedia) => RemoteMedia) => void
) {
  if (!isCurrentConnection()) return;
  for (const transceiver of pc.getTransceivers()) {
    const mid = transceiver.mid;
    const owner = mid === null ? undefined : owners.get(mid);
    if (!owner || mid === null) continue;
    const track = transceiver.receiver.track;
    if (track.readyState !== 'live') continue;
    const isCurrent = () => isCurrentConnection() && owners.get(mid) === owner;
    if (owner.track !== track)
      attachRemotePlayback(owner, track, subscribed, isCurrent, setMedia);
    if (isCurrent() && owner.track?.readyState === 'live')
      subscribed.add(owner.subscriptionKey);
  }
}

/** Bind once before negotiation; reconciliation also covers reused receivers. */
export function listenRemotePlayback(
  pc: RTCPeerConnection,
  owners: Map<string, RemoteTrackOwner>,
  subscribed: Set<string>,
  isCurrentConnection: () => boolean,
  setMedia: (update: (current: RemoteMedia) => RemoteMedia) => void
) {
  pc.addEventListener('track', (event) => {
    const mid = event.transceiver.mid;
    const owner = mid === null ? undefined : owners.get(mid);
    if (!owner || mid === null) return;
    attachRemotePlayback(
      owner,
      event.track,
      subscribed,
      () => isCurrentConnection() && owners.get(mid) === owner,
      setMedia
    );
    if (
      pc.signalingState === 'stable' &&
      isCurrentConnection() &&
      owners.get(mid) === owner &&
      owner.track === event.track &&
      event.track.readyState === 'live'
    )
      subscribed.add(owner.subscriptionKey);
  });
}
