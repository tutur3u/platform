import { afterEach, expect, it, vi } from 'vitest';
import { CameraEffects } from './camera-effects';
import { createLocalMediaControls } from './local-media-controls';

afterEach(() => vi.unstubAllGlobals());
it.each(['toggleMicrophone', 'toggleCamera', 'toggleScreenShare'] as const)(
  '%s stops a permission result that arrives after leaving',
  async (method) => {
    let resolve!: (stream: MediaStream) => void;
    const capture = new Promise<MediaStream>((done) => {
      resolve = done;
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: () => capture,
        getDisplayMedia: () => capture,
      },
    });
    const activeRef = { current: true };
    const stop = vi.fn();
    const applyMedia = vi.fn();
    const controls = createLocalMediaControls({
      activeRef,
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
      applyMedia,
    });
    const pending = controls[method]();
    // Let the serialized microphone operation begin its permission request.
    await Promise.resolve();
    activeRef.current = false;
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await pending;
    expect(stop).toHaveBeenCalledOnce();
    expect(applyMedia).not.toHaveBeenCalled();
  }
);

it('keeps a replacement microphone alive when publishing fails so recovery can retry', async () => {
  const oldTrack = { kind: 'audio', stop: vi.fn() };
  const newTrack = { kind: 'audio', stop: vi.fn() };
  class Stream {
    constructor(private tracks: unknown[]) {}
    getTracks() {
      return this.tracks;
    }
  }
  vi.stubGlobal('MediaStream', Stream);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn(async () => new Stream([newTrack])) },
  });
  const localStreamRef = {
    current: new Stream([oldTrack]) as unknown as MediaStream,
  };
  const controls = createLocalMediaControls({
    activeRef: { current: true },
    effects: new CameraEffects(),
    localStreamRef,
    screenStreamRef: { current: null },
    mediaRef: {
      current: {
        audioEnabled: true,
        videoEnabled: false,
        screenEnabled: false,
      },
    },
    setLocalStream: vi.fn(),
    setScreenStream: vi.fn(),
    applyMedia: vi.fn(async () => {
      throw new Error('temporary transport failure');
    }),
  });
  await expect(
    controls.selectDevice('audio', 'new-microphone')
  ).rejects.toThrow('temporary transport failure');
  expect(localStreamRef.current.getTracks()).toEqual([newTrack]);
  expect(oldTrack.stop).toHaveBeenCalledOnce();
  expect(newTrack.stop).not.toHaveBeenCalled();
  expect(controls.getSelectedDevices().audio).toBe('new-microphone');
});

it('applies a processing change to the replacement microphone after acquisition finishes', async () => {
  let resolve!: (stream: MediaStream) => void;
  const capture = new Promise<MediaStream>((done) => {
    resolve = done;
  });
  const replacement = {
    kind: 'audio',
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
    applyConstraints: vi.fn(async () => undefined),
  };
  class Stream {
    constructor(private tracks: (typeof replacement)[]) {}
    getTracks() {
      return this.tracks;
    }
    getAudioTracks() {
      return this.tracks;
    }
  }
  vi.stubGlobal('MediaStream', Stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => capture } });
  const localStreamRef = { current: new Stream([]) as unknown as MediaStream };
  const controls = createLocalMediaControls({
    activeRef: { current: true },
    effects: new CameraEffects(),
    localStreamRef,
    screenStreamRef: { current: null },
    mediaRef: {
      current: {
        audioEnabled: true,
        videoEnabled: false,
        screenEnabled: false,
      },
    },
    setLocalStream: vi.fn(),
    setScreenStream: vi.fn(),
    applyMedia: vi.fn(async () => undefined),
  });
  const switching = controls.selectDevice('audio', 'new');
  const preferences = {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
  };
  const processing = controls.setAudioProcessing(preferences);
  expect(replacement.applyConstraints).not.toHaveBeenCalled();
  resolve(new Stream([replacement]) as unknown as MediaStream);
  await Promise.all([switching, processing]);
  expect(replacement.applyConstraints).toHaveBeenCalledWith(preferences);
  expect(controls.getAudioProcessing()).toEqual(preferences);
});
