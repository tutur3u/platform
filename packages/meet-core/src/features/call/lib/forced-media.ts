import type {
  MeetMediaState,
  MeetRealtimeTrackKind,
} from '@tuturuuu/realtime/meet';

export function applyForcedMute(
  media: MeetMediaState,
  kinds: MeetRealtimeTrackKind[],
  local: MediaStream | null,
  screen: MediaStream | null,
  disableEffects: () => void
) {
  const next = { ...media };
  for (const kind of kinds) {
    if (kind === 'audio') {
      next.audioEnabled = false;
      for (const track of local?.getAudioTracks() ?? []) track.enabled = false;
    }
    if (kind === 'video') {
      disableEffects();
      next.videoEnabled = false;
      for (const track of local?.getVideoTracks() ?? []) track.enabled = false;
    }
    if (kind === 'screen_audio')
      for (const track of screen?.getAudioTracks() ?? []) track.stop();
    if (kind === 'screen') {
      next.screenEnabled = false;
      for (const track of screen?.getTracks() ?? []) track.stop();
    }
  }
  return next;
}
