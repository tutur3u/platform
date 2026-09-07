import { afterEach, expect, it, vi } from 'vitest';
import { CameraEffects, cameraFilterCss } from './camera-effects';

afterEach(() => vi.unstubAllGlobals());
it('leaves the original camera untouched without effects and stops it on disposal', async () => {
  const stop = vi.fn();
  const source = {
    readyState: 'live',
    enabled: true,
    stop,
  } as unknown as MediaStreamTrack;
  const effects = new CameraEffects();
  expect(await effects.setSource(source)).toBe(source);
  effects.setEnabled(false);
  expect(source.enabled).toBe(false);
  effects.dispose();
  expect(stop).toHaveBeenCalledOnce();
});
it('bounds portrait softness and includes the chosen color treatment', () => {
  expect(cameraFilterCss({ filter: 'none', softness: -1 })).toBe('none');
  expect(cameraFilterCss({ filter: 'mono', softness: 2 })).toContain(
    'grayscale(1) blur(0.60px)'
  );
});
it('does not retain a video element when effect playback fails', async () => {
  const video = {
    muted: false,
    playsInline: false,
    srcObject: null,
    play: vi.fn().mockRejectedValue(new Error('blocked')),
  };
  vi.stubGlobal('document', { createElement: () => video });
  vi.stubGlobal('MediaStream', class {});
  const source = {
    readyState: 'live',
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const effects = new CameraEffects();
  await effects.setSource(source);
  await expect(
    effects.setLook({ filter: 'warm', softness: 0 })
  ).rejects.toThrow('blocked');
  expect(video.srcObject).toBeNull();
  effects.dispose();
  expect(source.stop).toHaveBeenCalledOnce();
});
