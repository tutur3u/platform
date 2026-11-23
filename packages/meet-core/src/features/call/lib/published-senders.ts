import type { CloudflareSfuTrack } from '@tuturuuu/realtime/meet';
import {
  acquireIdleVideoTrack,
  releaseIdleVideoTrack,
} from './idle-video-track';
import { type LocalTrackPlan, localTrackSource } from './negotiation';
import { contentHintFor } from './sender-profile';
import type { SfuTracksResponse } from './sfu-response';
import type { MeetSignaling } from './signaling';

type PublishedSendersOptions = {
  published: LocalTrackPlan[];
  desired: LocalTrackPlan[];
  senders: Map<string, RTCRtpSender>;
  pc: RTCPeerConnection | null;
  sessionId: string | null;
  stream: MediaStream;
  screenStream: MediaStream | null;
  closeTrack: (sessionId: string, track: CloudflareSfuTrack) => Promise<void>;
  isCurrent: () => boolean;
  reset: () => void;
};

/** An uncertain close must not leave a reusable but unregistered publication. */
export async function syncPublishedSenders(options: PublishedSendersOptions) {
  try {
    return await updateSenders(options);
  } catch (error) {
    if (options.isCurrent()) options.reset();
    throw error;
  }
}

async function updateSenders({
  published,
  desired,
  senders,
  pc,
  sessionId,
  stream,
  screenStream,
  closeTrack,
}: PublishedSendersOptions) {
  const remaining: LocalTrackPlan[] = [];
  for (const plan of published) {
    const sender = senders.get(plan.trackName);
    const enabled = desired.some((entry) => entry.trackName === plan.trackName);
    const source = localTrackSource(plan.kind, stream, screenStream);
    // A released camera keeps its SFU publication alive with black frames, so
    // the next camera-on swaps a fresh track in without renegotiating. Without
    // an idle track the publication is closed below and republished later.
    if (plan.kind === 'video' && !enabled && sender) {
      const idle =
        source && source.readyState !== 'ended'
          ? source
          : acquireIdleVideoTrack();
      if (idle) {
        idle.contentHint = contentHintFor(plan.kind);
        await sender.replaceTrack(idle);
        remaining.push(plan);
        continue;
      }
    }
    if (
      ((plan.kind === 'screen' || plan.kind === 'screen_audio') && !enabled) ||
      !source ||
      source.readyState === 'ended'
    ) {
      const mid = pc
        ?.getTransceivers()
        .find((entry) => entry.sender === sender)?.mid;
      if (mid == null || !sessionId) throw new Error('sfu_session_failed');
      await closeTrack(sessionId, { ...plan, mid, location: 'local' });
      await sender?.replaceTrack(null);
      senders.delete(plan.trackName);
      continue;
    }
    // Disabled device tracks send silence/black frames, preventing SFU expiry.
    source.contentHint = contentHintFor(plan.kind);
    await sender?.replaceTrack(source);
    if (plan.kind === 'video') releaseIdleVideoTrack();
    remaining.push(plan);
  }
  return remaining;
}

export async function closePublishedTrack(
  signaling: MeetSignaling | null,
  sessionId: string,
  track: CloudflareSfuTrack
) {
  const result = await signaling?.request<SfuTracksResponse>({
    type: 'sfu.tracks.close',
    force: true,
    sessionId,
    tracks: [track],
  });
  if (
    !result ||
    result.errorCode ||
    result.tracks?.some((entry) => entry.errorCode)
  )
    throw new Error('sfu_track_close_failed');
}
