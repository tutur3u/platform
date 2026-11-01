// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  computeRmsLevel,
  createMediaDeviceStore,
  filterDevicesByKind,
  startMicrophoneMeter,
} from './lobby-media';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('maps silence to zero and normal speech RMS to a bounded [0, 1] level', () => {
  expect(computeRmsLevel([])).toBe(0);
  expect(computeRmsLevel([0, 0.001, -0.001, 0])).toBe(0);
  const moderate = computeRmsLevel([0.08, -0.08, 0.08, -0.08]);
  expect(moderate).toBeGreaterThan(0.3);
  expect(moderate).toBeLessThan(0.5);
  expect(computeRmsLevel([0.9, -0.9, 0.9, -0.9])).toBe(1);
});

it('filters duplicate, default and communications entries while preserving order', () => {
  const devices = [
    { kind: 'audioinput', deviceId: 'default', label: 'Default' },
    {
      kind: 'audioinput',
      deviceId: 'communications',
      label: 'Communications - Headset',
    },
    { kind: 'audioinput', deviceId: '', label: 'Blank' },
    { kind: 'audioinput', deviceId: 'mic-1', label: 'USB Mic' },
    { kind: 'audioinput', deviceId: 'mic-1', label: 'USB Mic duplicate' },
    { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD' },
  ] as MediaDeviceInfo[];

  expect(filterDevicesByKind(devices, 'audioinput')).toEqual([
    expect.objectContaining({ deviceId: 'mic-1', label: 'USB Mic' }),
  ]);
  expect(filterDevicesByKind(devices, 'videoinput')).toEqual([
    expect.objectContaining({ deviceId: 'cam-1', label: 'FaceTime HD' }),
  ]);
});

it('subscribes to devicechange and updates snapshots only when devices or labels change', async () => {
  let changeHandler: (() => void) | undefined;
  let current = [
    { kind: 'audioinput', deviceId: 'mic-1', label: '' },
  ] as MediaDeviceInfo[];
  const enumerateDevices = vi.fn(async () => current);
  const addEventListener = vi.fn((_event: string, cb: () => void) => {
    changeHandler = cb;
  });
  const removeEventListener = vi.fn();

  const store = createMediaDeviceStore({
    enumerateDevices,
    addEventListener:
      addEventListener as unknown as MediaDevices['addEventListener'],
    removeEventListener:
      removeEventListener as unknown as MediaDevices['removeEventListener'],
  });

  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
  const firstSnapshot = store.getSnapshot();
  expect(firstSnapshot).toHaveLength(1);

  await store.refresh();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()).toBe(firstSnapshot);

  current = [
    { kind: 'audioinput', deviceId: 'mic-1', label: 'Studio Mic' },
  ] as MediaDeviceInfo[];
  changeHandler?.();
  await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
  expect(store.getSnapshot()[0]?.label).toBe('Studio Mic');

  unsubscribe();
  expect(removeEventListener).toHaveBeenCalledOnce();
});

it('publishes only the newest enumerateDevices result when calls settle out of order', async () => {
  const pending: Array<(devices: MediaDeviceInfo[]) => void> = [];
  const enumerateDevices = vi.fn(
    () =>
      new Promise<MediaDeviceInfo[]>((resolve) => {
        pending.push(resolve);
      })
  );
  const store = createMediaDeviceStore({ enumerateDevices });
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);

  const newer = store.refresh();
  expect(pending).toHaveLength(2);

  pending[1]?.([
    { kind: 'audioinput', deviceId: 'mic-2', label: 'New Mic' },
  ] as MediaDeviceInfo[]);
  await newer;
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()[0]?.deviceId).toBe('mic-2');

  // The stale first enumeration (e.g. before a device was unplugged) settles last.
  pending[0]?.([
    { kind: 'audioinput', deviceId: 'mic-1', label: 'Old Mic' },
  ] as MediaDeviceInfo[]);
  await Promise.resolve();
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()[0]?.deviceId).toBe('mic-2');

  unsubscribe();
});

it('samples a live audio track through an unconnected AnalyserNode and cleans up', () => {
  vi.useFakeTimers();
  const disconnectSource = vi.fn();
  const disconnectAnalyser = vi.fn();
  const closeContext = vi.fn(async () => {});
  let muted = false;

  vi.stubGlobal(
    'MediaStream',
    class MockMediaStream {
      constructor(private tracks: MediaStreamTrack[] = []) {}
      getAudioTracks() {
        return this.tracks;
      }
      getTracks() {
        return this.tracks;
      }
    }
  );

  vi.stubGlobal(
    'AudioContext',
    class MockAudioContext {
      state = 'running';
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: disconnectSource };
      }
      createAnalyser() {
        return {
          fftSize: 256,
          smoothingTimeConstant: 0,
          disconnect: disconnectAnalyser,
          getFloatTimeDomainData: (target: Float32Array) => {
            target.fill(0.1);
          },
        };
      }
      resume = vi.fn(async () => {});
      close = closeContext;
    }
  );

  const track = {
    enabled: true,
    get muted() {
      return muted;
    },
    readyState: 'live',
  } as unknown as MediaStreamTrack;
  const levels: number[] = [];
  const stop = startMicrophoneMeter(
    new MediaStream([track]),
    (level) => levels.push(level),
    50
  );

  expect(levels.at(-1)).toBeGreaterThan(0.4);
  muted = true;
  vi.advanceTimersByTime(50);
  expect(levels.at(-1)).toBe(0);

  stop();
  expect(disconnectSource).toHaveBeenCalledOnce();
  expect(disconnectAnalyser).toHaveBeenCalledOnce();
  expect(closeContext).toHaveBeenCalledOnce();
});
