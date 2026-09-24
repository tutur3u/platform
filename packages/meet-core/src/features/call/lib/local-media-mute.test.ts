import { afterEach, expect, it, vi } from 'vitest';
import { CameraEffects } from './camera-effects';
import { createLocalMediaControls } from './local-media-controls';

class Stream {
  constructor(private tracks: MediaStreamTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
}
function fixture(enabled = false) {
  const mic = {
    kind: 'audio',
    enabled,
    readyState: 'live',
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const localStreamRef = {
    current: (enabled ? new Stream([mic]) : null) as MediaStream | null,
  };
  const mediaRef = {
    current: {
      audioEnabled: enabled,
      videoEnabled: false,
      screenEnabled: false,
    },
  };
  const applyMedia = vi.fn(async (next) => {
    mediaRef.current = next;
  });
  vi.stubGlobal('MediaStream', Stream);
  const controls = createLocalMediaControls({
    activeRef: { current: true },
    effects: new CameraEffects(),
    localStreamRef,
    screenStreamRef: { current: null },
    mediaRef,
    setLocalStream: vi.fn(),
    setScreenStream: vi.fn(),
    applyMedia,
  });
  return { controls, localStreamRef, mediaRef, applyMedia, mic };
}
afterEach(() => vi.unstubAllGlobals());
it('cuts capture immediately and repeated mute never requests microphone permission', async () => {
  const { controls, mic, mediaRef } = fixture(true);
  const capture = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: capture } });
  const first = controls.muteMicrophone();
  expect(mic.enabled).toBe(false);
  await Promise.all([first, controls.muteMicrophone()]);
  expect(mediaRef.current.audioEnabled).toBe(false);
  expect(capture).not.toHaveBeenCalled();
});
it.each(['muteMicrophone', 'cancelPendingMicrophone'] as const)(
  '%s invalidates a permission request already in flight',
  async (method) => {
    const { controls, localStreamRef, applyMedia, mic } = fixture();
    let resolve!: (stream: MediaStream) => void;
    const capture = new Promise<MediaStream>((done) => {
      resolve = done;
    });
    const getUserMedia = vi.fn(() => capture);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const opening = controls.unmuteMicrophone();
    await Promise.resolve();
    expect(getUserMedia).toHaveBeenCalledOnce();
    const closing = controls[method]();
    resolve(new Stream([mic]) as unknown as MediaStream);
    await Promise.all([opening, closing]);
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(localStreamRef.current).toBeNull();
    expect(applyMedia.mock.calls.some(([state]) => state.audioEnabled)).toBe(
      false
    );
  }
);
it('preserves the latest intent across queued toggles', async () => {
  const { controls, mic, mediaRef } = fixture(true);
  await Promise.all([controls.toggleMicrophone(), controls.toggleMicrophone()]);
  expect(mic.enabled).toBe(true);
  expect(mediaRef.current.audioEnabled).toBe(true);
});
it('installs a device replacement disabled when protection intervenes during acquisition', async () => {
  const { controls, localStreamRef, mic, mediaRef } = fixture(true);
  let resolve!: (stream: MediaStream) => void;
  const capture = new Promise<MediaStream>((done) => {
    resolve = done;
  });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => capture } });
  const switching = controls.selectDevice('audio', 'replacement');
  await Promise.resolve();
  const closing = controls.muteMicrophone();
  expect(mic.enabled).toBe(false);
  const replacement = {
    kind: 'audio',
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  resolve(new Stream([replacement]) as unknown as MediaStream);
  await Promise.all([switching, closing]);
  expect(localStreamRef.current?.getAudioTracks()).toEqual([replacement]);
  expect(replacement.enabled).toBe(false);
  expect(mediaRef.current.audioEnabled).toBe(false);
});
