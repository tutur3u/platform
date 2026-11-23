import type { CameraEffects } from './camera-effects';

/**
 * Release the camera device: stop every video track (the raw capture, any
 * processed output and its source), dispose the effects pipeline and return
 * the stream without video. `track.enabled = false` only blanks frames and
 * leaves the hardware (and its indicator light) on.
 */
export function releaseCameraTracks(
  stream: MediaStream | null,
  effects: CameraEffects
): MediaStream {
  effects.dispose();
  for (const track of stream?.getVideoTracks() ?? []) track.stop();
  return new MediaStream(stream?.getAudioTracks() ?? []);
}

/** Keep a restored "camera on" state live, or release the camera for "off". */
export function settleCameraState(
  videoEnabled: boolean,
  stream: MediaStream | null,
  effects: CameraEffects
): MediaStream | null {
  if (videoEnabled) {
    effects.setEnabled(true);
    return null;
  }
  return releaseCameraTracks(stream, effects);
}

/** Stop tracks of a join-screen preview whose device kind the room locked. */
export function stopLockedPreviewTracks(
  stream: MediaStream | null,
  locks: { audio: boolean; video: boolean }
) {
  if (locks.audio)
    for (const track of stream?.getAudioTracks() ?? []) track.stop();
  if (locks.video)
    for (const track of stream?.getVideoTracks() ?? []) track.stop();
}
