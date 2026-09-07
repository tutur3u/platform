import type { CloudflareSfuTrack } from '@tuturuuu/realtime/meet';
import { type LocalTrackPlan, localTrackSource } from './negotiation';
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
    await sender?.replaceTrack(source);
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
