import type {
  CloudflareSfuTrack,
  MeetRealtimeRoomTrack,
  MeetRealtimeTrackKind,
} from '@tuturuuu/realtime/meet';
import { remoteTrackKey } from './call-state';
import { userIdFromTrackName } from './negotiation';
import {
  type RemoteTrackOwner,
  releaseClosedSubscriptions,
} from './remote-playback';
import type { RemoteMedia } from './remote-streams';
import type { SfuTracksResponse } from './sfu-response';

/** Only successful, still-authoritative publications may bind a receiver. */
export function applySubscribeResponse(
  answer: SfuTracksResponse | undefined,
  pending: CloudflareSfuTrack[],
  live: Record<string, MeetRealtimeRoomTrack>,
  owners: Map<string, RemoteTrackOwner>
) {
  if (!answer || answer.errorCode) throw new Error('sfu_subscribe_failed');
  if (answer.requiresImmediateRenegotiation && !answer.sessionDescription)
    throw new Error('sfu_subscribe_offer_missing');
  for (const track of answer.tracks ?? []) {
    if (track.errorCode || track.mid === undefined || !track.trackName)
      continue;
    const requested = pending.find(
      (entry) => entry.trackName === track.trackName
    );
    const userId = userIdFromTrackName(track.trackName);
    if (!requested?.sessionId || !userId) continue;
    const subscriptionKey = remoteTrackKey({
      sessionId: requested.sessionId,
      trackName: track.trackName,
    } as MeetRealtimeRoomTrack);
    if (!live[subscriptionKey]) continue;
    owners.set(track.mid, {
      userId,
      kind: track.trackName.split('-').at(-1) as MeetRealtimeTrackKind,
      subscriptionKey,
    });
  }
}

export function pruneObsoleteReceivers(
  live: Record<string, MeetRealtimeRoomTrack>,
  owners: Map<string, RemoteTrackOwner>,
  subscribed: Set<string>,
  setMedia: (update: (current: RemoteMedia) => RemoteMedia) => void
) {
  const stale = new Set(
    [...owners.values()]
      .map((owner) => owner.subscriptionKey)
      .filter((key) => !live[key])
  );
  releaseClosedSubscriptions(stale, owners, subscribed, new Set(), setMedia);
}
