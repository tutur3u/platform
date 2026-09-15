import { expect, it, vi } from 'vitest';
import {
  enhanceMicrophone,
  microphoneConstraints,
  NativeAudioProcessing,
  trackProcessingConstraints,
} from './audio-processing';
import { SCREEN_CAPTURE_OPTIONS } from './screen-capture';

it('enables native speech processing and avoids whole-system feedback by default', () => {
  expect(microphoneConstraints()).toMatchObject({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });
  expect(SCREEN_CAPTURE_OPTIONS.systemAudio).toBe('exclude');
  expect(SCREEN_CAPTURE_OPTIONS.audio.restrictOwnAudio).toBe(true);
});

it('updates the current microphone without unmuting it or losing its device constraint', async () => {
  const track = {
    enabled: false,
    readyState: 'live',
    getConstraints: () => ({ deviceId: { exact: 'headset' } }),
    applyConstraints: vi.fn(async () => undefined),
    getSettings: () => ({ echoCancellation: true }),
  };
  const control = new NativeAudioProcessing(
    () =>
      ({
        getAudioTracks: () => [track],
      }) as unknown as MediaStream
  );
  await control.setPreferences({
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
  });
  expect(track.applyConstraints).toHaveBeenCalledWith({
    deviceId: { exact: 'headset' },
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
  });
  expect(track.enabled).toBe(false);
  expect(control.getSettings()).toEqual({ echoCancellation: true });
  expect(microphoneConstraints(control.getPreferences(), 'new')).toMatchObject({
    deviceId: { exact: 'new' },
    noiseSuppression: false,
  });
});

it('retains preferences after unsupported constraints fail', async () => {
  const control = new NativeAudioProcessing(
    () =>
      ({
        getAudioTracks: () => [
          {
            readyState: 'live',
            getConstraints: () => ({}),
            applyConstraints: async () => {
              throw new Error('unsupported');
            },
          },
        ],
      }) as unknown as MediaStream
  );
  await expect(
    control.setPreferences({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    })
  ).rejects.toThrow('unsupported');
  expect(control.getPreferences().echoCancellation).toBe(true);
});

it('remembers preferences before acquiring a microphone', async () => {
  const control = new NativeAudioProcessing(() => null);
  await control.setPreferences({
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
  });
  expect(control.getPreferences().noiseSuppression).toBe(false);
  expect(control.getSettings()).toBeNull();
});

it('prefers advertised all-system AEC without making unsupported browsers lose capture', async () => {
  const track = {
    getCapabilities: () => ({ echoCancellation: [true, false, 'all'] }),
    getConstraints: () => ({}),
    applyConstraints: vi.fn(async () => {
      throw new Error('device rejected mode');
    }),
  } as unknown as MediaStreamTrack;
  const preferences = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  expect(trackProcessingConstraints(track, preferences)).toMatchObject({
    echoCancellation: { ideal: 'all' },
  });
  await expect(enhanceMicrophone(track, preferences)).resolves.toBeUndefined();
  expect(
    trackProcessingConstraints(track, {
      ...preferences,
      echoCancellation: false,
    }).echoCancellation
  ).toBe(false);
});
