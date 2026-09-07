import type { CloudflareSfuTrack } from '@tuturuuu/realtime/meet';
import type { LocalTrackPlan } from './negotiation';

/** Keep muted devices alive and explicitly retire a stopped screen share. */
export async function syncPublishedSenders({
  published,
  desired,
  senders,
  pc,
  sessionId,
  stream,
  screenStream,
  closeScreen,
}: {
  published: LocalTrackPlan[];
  desired: LocalTrackPlan[];
  senders: Map<string, RTCRtpSender>;
  pc: RTCPeerConnection | null;
  sessionId: string | null;
  stream: MediaStream;
  screenStream: MediaStream | null;
  closeScreen: (sessionId: string, track: CloudflareSfuTrack) => Promise<void>;
}) {
  const remaining: LocalTrackPlan[] = [];
  for (const plan of published) {
    const sender = senders.get(plan.trackName);
    const enabled = desired.some((entry) => entry.trackName === plan.trackName);
    if (plan.kind === 'screen' && !enabled) {
      const mid = pc
        ?.getTransceivers()
        .find((entry) => entry.sender === sender)?.mid;
      if (mid == null || !sessionId) throw new Error('sfu_session_failed');
      await closeScreen(sessionId, { ...plan, mid, location: 'local' });
      await sender?.replaceTrack(null);
      senders.delete(plan.trackName);
      continue;
    }
    const source =
      plan.kind === 'screen'
        ? screenStream?.getVideoTracks()[0]
        : plan.kind === 'audio'
          ? stream.getAudioTracks()[0]
          : stream.getVideoTracks()[0];
    // Disabled device tracks send silence/black frames, preventing SFU expiry.
    await sender?.replaceTrack(source ?? null);
    remaining.push(plan);
  }
  return remaining;
}
