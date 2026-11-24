/**
 * The only audio per-speaker capture may tap: the live, processed microphone
 * track of the local call stream. Remote tracks, screen audio and assistant
 * output are never passed in.
 */
export function ownMicrophoneTrack(
  stream: MediaStream | null
): MediaStreamTrack | null {
  return (
    stream?.getAudioTracks().find((track) => track.readyState === 'live') ??
    null
  );
}

/**
 * Echo cancellation must be confirmed on the track itself, not assumed.
 * Browsers report `true`, or the newer `'all'` and `'remote-only'` modes,
 * which also cancel the call's remote playback.
 */
export function hasConfirmedEchoCancellation(track: MediaStreamTrack | null) {
  if (!track || track.readyState !== 'live') return false;
  try {
    const mode: unknown = track.getSettings().echoCancellation;
    return mode === true || mode === 'all' || mode === 'remote-only';
  } catch {
    return false;
  }
}
