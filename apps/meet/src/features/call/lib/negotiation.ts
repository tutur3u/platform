import type {
  CloudflareSfuTrack,
  MeetRealtimeRoomTrack,
  MeetRealtimeTrackKind,
} from '@tuturuuu/realtime/meet';
import { remoteTrackKey } from './call-state';

export interface LocalTrackPlan {
  kind: MeetRealtimeTrackKind;
  trackName: string;
}

/**
 * Track names have to be stable and unique per participant: the SFU addresses a
 * remote track by `{sessionId, trackName}`, so two people publishing "video"
 * would be indistinguishable without the owner baked in.
 */
export function localTrackName(userId: string, kind: MeetRealtimeTrackKind) {
  return `${userId}-${kind}`;
}

/**
 * Which of our tracks should currently be published, given what the user has
 * enabled. Screen share is a separate track from the camera so it can be
 * toggled without renegotiating the camera.
 */
export function planLocalTracks(
  userId: string,
  media: {
    audioEnabled: boolean;
    screenEnabled: boolean;
    videoEnabled: boolean;
  }
): LocalTrackPlan[] {
  const plan: LocalTrackPlan[] = [];
  if (media.audioEnabled) {
    plan.push({ kind: 'audio', trackName: localTrackName(userId, 'audio') });
  }
  if (media.videoEnabled) {
    plan.push({ kind: 'video', trackName: localTrackName(userId, 'video') });
  }
  if (media.screenEnabled) {
    plan.push({ kind: 'screen', trackName: localTrackName(userId, 'screen') });
  }
  return plan;
}

export interface TrackDiff {
  publish: LocalTrackPlan[];
  unpublish: LocalTrackPlan[];
}

/** What changed between the tracks we have published and the ones we want. */
export function diffLocalTracks(
  published: LocalTrackPlan[],
  desired: LocalTrackPlan[]
): TrackDiff {
  const publishedNames = new Set(published.map((track) => track.trackName));
  const desiredNames = new Set(desired.map((track) => track.trackName));

  return {
    publish: desired.filter((track) => !publishedNames.has(track.trackName)),
    unpublish: published.filter((track) => !desiredNames.has(track.trackName)),
  };
}

/**
 * Remote tracks we should pull but have not yet. Anything already subscribed,
 * or belonging to us, is skipped so a re-render never re-pulls the room.
 */
export function planRemoteSubscriptions(
  remoteTracks: Record<string, MeetRealtimeRoomTrack>,
  subscribedKeys: Iterable<string>,
  selfUserId: string | null
): CloudflareSfuTrack[] {
  const subscribed = new Set(subscribedKeys);

  return Object.values(remoteTracks)
    .filter((track) => {
      if (track.userId === selfUserId) return false;
      if (!track.trackName) return false;
      return !subscribed.has(remoteTrackKey(track));
    })
    .map((track) => ({
      location: 'remote',
      sessionId: track.sessionId,
      trackName: track.trackName,
    }));
}

/** Subscriptions whose publisher has gone away. */
export function staleSubscriptions(
  remoteTracks: Record<string, MeetRealtimeRoomTrack>,
  subscribedKeys: Iterable<string>
) {
  return [...subscribedKeys].filter((key) => !(key in remoteTracks));
}

/**
 * Applies the workspace's video ceiling to a camera track. Cloudflare bills on
 * egress, so capping here is the difference between a predictable bill and an
 * open-ended one.
 */
export function videoConstraints(limits: {
  maxFrameRate: number;
  maxHeight: number;
  maxWidth: number;
}): MediaTrackConstraints {
  return {
    frameRate: { ideal: limits.maxFrameRate, max: limits.maxFrameRate },
    height: { ideal: limits.maxHeight, max: limits.maxHeight },
    width: { ideal: limits.maxWidth, max: limits.maxWidth },
  };
}

/**
 * Recovers the owner from a track name.
 *
 * Remote tracks arrive on the peer connection with an opaque id, so the only
 * way to attribute a stream to a participant is the name we chose when
 * publishing: `<userId>-<kind>`. Returns null for anything not in that shape.
 */
export function userIdFromTrackName(
  trackName: string | undefined
): string | null {
  if (!trackName) return null;
  const separator = trackName.lastIndexOf('-');
  if (separator <= 0) return null;

  const userId = trackName.slice(0, separator);
  const kind = trackName.slice(separator + 1);
  if (!['audio', 'video', 'screen'].includes(kind)) return null;

  return userId || null;
}
