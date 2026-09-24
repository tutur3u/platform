import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import type { RemoteMedia } from '../call/lib/remote-streams';

/** Only explicitly opted-in microphone tracks enter the assistant mix. */
export function miraInputTracks(
  participants: Record<string, MeetRealtimePresence>,
  selfUserId: string | null,
  localStream: MediaStream | null,
  remoteMedia: RemoteMedia,
  sessionId?: string
) {
  return Object.values(participants).flatMap((participant) => {
    if (
      !sessionId ||
      participant.assistantAudio?.sessionId !== sessionId ||
      !participant.assistantAudio?.microphoneEnabled ||
      !participant.media.audioEnabled
    )
      return [];
    const tracks =
      participant.userId === selfUserId
        ? (localStream?.getAudioTracks() ?? [])
        : [remoteMedia[participant.userId]?.audio];
    return tracks.filter(
      (track): track is MediaStreamTrack =>
        !!track && track.readyState === 'live'
    );
  });
}
