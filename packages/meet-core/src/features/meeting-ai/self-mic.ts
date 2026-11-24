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

/** Echo cancellation must be confirmed on the track itself, not assumed. */
export function hasConfirmedEchoCancellation(track: MediaStreamTrack | null) {
  if (!track || track.readyState !== 'live') return false;
  try {
    return track.getSettings().echoCancellation === true;
  } catch {
    return false;
  }
}
