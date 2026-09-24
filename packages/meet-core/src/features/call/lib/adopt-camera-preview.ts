import type { CameraEffects } from './camera-effects';

export async function adoptCameraPreview(
  stream: MediaStream | null,
  active: { current: boolean },
  effects: CameraEffects,
  local: { current: MediaStream | null },
  setLocal: (stream: MediaStream) => void
) {
  const source = stream
    ?.getVideoTracks()
    .find((track) => track.readyState === 'live');
  if (!source) return;
  if (!active.current) {
    source.stop();
    return;
  }
  const track = await effects.setSource(source);
  if (!track || !active.current) {
    effects.dispose();
    return;
  }
  const next = new MediaStream([
    ...(local.current?.getAudioTracks() ?? []),
    track,
  ]);
  local.current = next;
  setLocal(next);
}
