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
    activeRef.current = false;
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await pending;
    expect(stop).toHaveBeenCalledOnce();
    expect(applyMedia).not.toHaveBeenCalled();
  }
);
