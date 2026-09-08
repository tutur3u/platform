import {
  type CloudflareSfuTrack,
  type MeetRealtimeRoomTrack,
  meetRealtimeTrackKindSchema,
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
  owners: Map<string, RemoteTrackOwner>,
  subscribed = new Set<string>(),
  setMedia: (update: (current: RemoteMedia) => RemoteMedia) => void = () => {}
) {
  if (!answer || answer.errorCode) throw new Error('sfu_subscribe_failed');
  if (answer.requiresImmediateRenegotiation && !answer.sessionDescription)
    throw new Error('sfu_subscribe_offer_missing');
  const reject = (mid: string | undefined) => {
    const owner = mid === undefined ? undefined : owners.get(mid);
    if (owner)
      releaseClosedSubscriptions(
        new Set([owner.subscriptionKey]),
        owners,
        subscribed,
        new Set(),
        setMedia
      );
  };
  for (const track of answer.tracks ?? []) {
    if (track.errorCode || track.mid === undefined || !track.trackName) {
      reject(track.mid);
      continue;
    }
    const requested = pending.find(
      (entry) => entry.trackName === track.trackName
    );
    const userId = userIdFromTrackName(track.trackName);
    if (!requested?.sessionId || !userId) {
      reject(track.mid);
      continue;
    }
    const subscriptionKey = remoteTrackKey({
      sessionId: requested.sessionId,
      trackName: track.trackName,
    } as MeetRealtimeRoomTrack);
    const publication = live[subscriptionKey];
    if (!publication || publication.userId !== userId) {
      reject(track.mid);
      continue;
    }
    const kind = meetRealtimeTrackKindSchema.safeParse(
      publication.kind ?? track.trackName.split('-').at(-1)
    );
    if (!kind.success) {
      reject(track.mid);
      continue;
    }
    owners.set(track.mid, {
      userId,
      kind: kind.data,
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
