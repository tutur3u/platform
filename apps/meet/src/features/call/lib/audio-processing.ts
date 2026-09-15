/** Keep processing on the captured microphone so native AEC sees remote playback. */
export type AudioProcessing = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};
export const DEFAULT_AUDIO_PROCESSING: AudioProcessing = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function microphoneConstraints(
  processing: AudioProcessing = DEFAULT_AUDIO_PROCESSING,
  deviceId = ''
): MediaTrackConstraints {
  return {
    ...processing,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    channelCount: { ideal: 1 },
  };
}

/** Prefer system-wide native AEC only when this track advertises that mode. */
export function trackProcessingConstraints(
  track: MediaStreamTrack,
  preferences: AudioProcessing
): MediaTrackConstraints {
  const modes = track.getCapabilities?.().echoCancellation as
    | Array<boolean | string>
    | undefined;
  const constraints = { ...track.getConstraints?.(), ...preferences };
  return preferences.echoCancellation && modes?.includes('all')
    ? Object.assign(constraints, { echoCancellation: { ideal: 'all' } })
    : constraints;
}

export async function enhanceMicrophone(
  track: MediaStreamTrack | undefined,
  preferences: AudioProcessing
) {
  if (
    !track
      ?.getCapabilities?.()
      .echoCancellation?.some((mode: unknown) => mode === 'all')
  )
    return;
  try {
    await track.applyConstraints(
      trackProcessingConstraints(track, preferences)
    );
  } catch {
    /* Capture already requested ordinary native AEC; keep that working mic. */
  }
}

export class NativeAudioProcessing {
  private preferences = { ...DEFAULT_AUDIO_PROCESSING };
  private pending = false;
  constructor(private getStream: () => MediaStream | null) {}

  getPreferences = () => ({ ...this.preferences });
  getSettings = () =>
    this.getStream()?.getAudioTracks()[0]?.getSettings() ?? null;

  setPreferences = async (next: AudioProcessing) => {
    if (this.pending) throw new Error('Audio processing update in progress');
    this.pending = true;
    try {
      const track = this.getStream()?.getAudioTracks()[0];
      if (track?.readyState === 'live') {
        // Preserve device constraints and the muted state; do not reacquire a mic.
        await track.applyConstraints(trackProcessingConstraints(track, next));
      }
      this.preferences = { ...next };
    } finally {
      this.pending = false;
    }
  };
}
