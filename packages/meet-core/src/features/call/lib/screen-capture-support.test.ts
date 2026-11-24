import { afterEach, expect, it, vi } from 'vitest';
import { CameraEffects } from './camera-effects';
import { createLocalMediaControls } from './local-media-controls';
import { SCREEN_CAPTURE_OPTIONS } from './screen-capture';

function controls() {
  return createLocalMediaControls({
    activeRef: { current: true },
    effects: new CameraEffects(),
    localStreamRef: { current: null },
    screenStreamRef: { current: null },
    mediaRef: {
      current: {
        audioEnabled: false,
        videoEnabled: false,
        screenEnabled: false,
      },
    },
    setLocalStream: vi.fn(),
    setScreenStream: vi.fn(),
    applyMedia: vi.fn(),
  });
}
afterEach(() => vi.unstubAllGlobals());
it.each(['Android', 'iPhone', 'iPad'])(
  'reports unsupported capture without a native picker on %s',
  async (userAgent) => {
    vi.stubGlobal('navigator', { userAgent, mediaDevices: {} });
    await expect(controls().toggleScreenShare()).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
  }
);
it('calls the picker synchronously from the click and surfaces denial instead of silently returning', async () => {
  const getDisplayMedia = vi.fn(() =>
    Promise.reject(new DOMException('Denied', 'NotAllowedError'))
  );
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });
  const promise = controls().toggleScreenShare();
  expect(getDisplayMedia).toHaveBeenCalledOnce();
  await expect(promise).rejects.toMatchObject({ name: 'NotAllowedError' });
});

it('requests system audio with the echo flags on every share', async () => {
  const getDisplayMedia = vi.fn(() =>
    Promise.reject(new DOMException('Denied', 'NotAllowedError'))
  );
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });
  await controls()
    .toggleScreenShare()
    .catch(() => undefined);
  expect(getDisplayMedia).toHaveBeenCalledWith(SCREEN_CAPTURE_OPTIONS);
  expect(SCREEN_CAPTURE_OPTIONS.audio).toMatchObject({
    restrictOwnAudio: true,
  });
  expect(SCREEN_CAPTURE_OPTIONS.audio).not.toHaveProperty(
    'suppressLocalAudioPlayback'
  );
});
