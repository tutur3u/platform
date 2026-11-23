import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptCameraPreview } from './adopt-camera-preview';
import { CameraEffects } from './camera-effects';
import { applyForcedMute } from './forced-media';
import { createLocalMediaControls } from './local-media-controls';
import { diffLocalTracks } from './negotiation';
import { stopLocalCapture } from './presence-transport';
import { syncPublishedSenders } from './published-senders';

class FakeTrack {
  readyState: 'live' | 'ended' = 'live';
  enabled = true;
  contentHint = '';
  constructor(readonly kind: 'audio' | 'video') {}
  stop() {
    this.readyState = 'ended';
  }
  addEventListener() {}
}
class FakeStream {
  constructor(readonly tracks: FakeTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

const asStream = (stream: FakeStream) => stream as unknown as MediaStream;
const cameraTracks: FakeTrack[] = [];
const processedTracks: FakeTrack[] = [];

function stubCanvasPipeline() {
  const video = {
    muted: false,
    playsInline: false,
    srcObject: null as unknown,
    videoWidth: 1280,
    videoHeight: 720,
    play: async () => undefined,
    pause: () => undefined,
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      filter: '',
      drawImage: () => undefined,
    }),
    captureStream: () => {
      const output = new FakeTrack('video');
      processedTracks.push(output);
      return { getVideoTracks: () => [output] };
    },
  };
  vi.stubGlobal('document', {
    createElement: (tag: string) => (tag === 'video' ? video : canvas),
  });
}

const getUserMedia = vi.fn(
  async (_constraints: MediaStreamConstraints) =>
    new FakeStream([
      (() => {
        const track = new FakeTrack('video');
        cameraTracks.push(track);
        return track;
      })(),
    ])
);

beforeEach(() => {
  cameraTracks.length = 0;
  processedTracks.length = 0;
  getUserMedia.mockClear();
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  stubCanvasPipeline();
});
afterEach(() => vi.unstubAllGlobals());

function setup(effects: CameraEffects, audio = new FakeTrack('audio')) {
  const localStreamRef = {
    current: asStream(new FakeStream([audio])) as MediaStream | null,
  };
  const mediaRef = {
    current: {
      audioEnabled: true,
      videoEnabled: false,
      screenEnabled: false,
    } as MeetMediaState,
  };
  const applyMedia = vi.fn(async (next: MeetMediaState) => {
    mediaRef.current = next;
  });
  const controls = createLocalMediaControls({
    activeRef: { current: true },
    effects,
    localStreamRef,
    screenStreamRef: { current: null },
    mediaRef,
    setLocalStream: vi.fn(),
    setScreenStream: vi.fn(),
    applyMedia,
  });
  return { applyMedia, audio, controls, localStreamRef, mediaRef };
}

it('camera off ends the raw capture, the processed output and keeps audio live', async () => {
  const effects = new CameraEffects();
  await effects.setLook({ filter: 'warm', softness: 0 });
  const { controls, localStreamRef, audio, applyMedia } = setup(effects);
  await controls.toggleCamera();
  expect(cameraTracks).toHaveLength(1);
  expect(processedTracks).toHaveLength(1);
  expect(cameraTracks[0]?.readyState).toBe('live');
  expect(processedTracks[0]?.readyState).toBe('live');
  expect(localStreamRef.current?.getVideoTracks()).toEqual([
    processedTracks[0],
  ]);

  await controls.toggleCamera();

  for (const track of [...cameraTracks, ...processedTracks])
    expect(track.readyState).toBe('ended');
  expect(localStreamRef.current?.getVideoTracks()).toHaveLength(0);
  expect(audio.readyState).toBe('live');
  expect(localStreamRef.current?.getAudioTracks()).toEqual([audio]);
  expect(applyMedia).toHaveBeenLastCalledWith(
    expect.objectContaining({ videoEnabled: false, audioEnabled: true }),
    localStreamRef.current
  );
});

it('camera off ends an unprocessed capture', async () => {
  const { controls } = setup(new CameraEffects());
  await controls.toggleCamera();
  await controls.toggleCamera();
  expect(cameraTracks.map((track) => track.readyState)).toEqual(['ended']);
});

it('camera on re-acquires on the selected device and publishes a fresh track', async () => {
  const { controls, localStreamRef, applyMedia, mediaRef } = setup(
    new CameraEffects()
  );
  await controls.selectDevice('video', 'front-camera');
  await controls.toggleCamera();
  await controls.toggleCamera();
  await controls.toggleCamera();

  expect(getUserMedia).toHaveBeenCalledTimes(2);
  const constraints = getUserMedia.mock.calls[1]?.[0].video as {
    deviceId: { exact: string };
    width: { ideal: number };
  };
  expect(constraints.deviceId).toEqual({ exact: 'front-camera' });
  expect(constraints.width).toEqual({ ideal: 1280 });
  const [first, second] = cameraTracks;
  expect(first).not.toBe(second);
  expect(first?.readyState).toBe('ended');
  expect(second?.readyState).toBe('live');
  expect(second?.enabled).toBe(true);
  expect(applyMedia).toHaveBeenLastCalledWith(
    expect.objectContaining({ videoEnabled: true }),
    localStreamRef.current
  );
  expect(localStreamRef.current?.getVideoTracks()).toEqual([second]);
});

it('releases the camera adopted from the join screen', async () => {
  const preview = new FakeTrack('video');
  const effects = new CameraEffects();
  const { controls, localStreamRef, mediaRef } = setup(effects);
  await adoptCameraPreview(
    asStream(new FakeStream([preview])),
    { current: true },
    effects,
    localStreamRef,
    (stream) => {
      localStreamRef.current = stream;
    }
  );
  mediaRef.current = { ...mediaRef.current, videoEnabled: true };
  expect(localStreamRef.current?.getVideoTracks()).toEqual([preview]);
  await controls.toggleCamera();
  expect(preview.readyState).toBe('ended');
  expect(localStreamRef.current?.getVideoTracks()).toHaveLength(0);
});

it('releases the camera when a host mutes video', () => {
  const effects = new CameraEffects();
  const dispose = vi.spyOn(effects, 'dispose');
  const camera = new FakeTrack('video');
  const mic = new FakeTrack('audio');
  const next = applyForcedMute(
    { audioEnabled: true, videoEnabled: true, screenEnabled: false },
    ['video'],
    asStream(new FakeStream([mic, camera])),
    null,
    () => effects.dispose()
  );
  expect(next.videoEnabled).toBe(false);
  expect(camera.readyState).toBe('ended');
  expect(mic.readyState).toBe('live');
  expect(dispose).toHaveBeenCalledOnce();
});

function senderFixture() {
  const sender = { replaceTrack: vi.fn() } as unknown as RTCRtpSender;
  const video = { kind: 'video' as const, trackName: 'user-video' };
  const senders = new Map([[video.trackName, sender]]);
  const closeTrack = vi.fn();
  const pc = {
    getTransceivers: () => [{ mid: '1', sender }],
  } as unknown as RTCPeerConnection;
  return {
    sender,
    video,
    senders,
    closeTrack,
    base: {
      pc,
      sessionId: 'session',
      screenStream: null,
      senders,
      closeTrack,
      isCurrent: () => true,
      reset: vi.fn(),
    },
  };
}

it('closes the video publication when the camera is released and publishes afresh on camera-on', async () => {
  const { sender, video, senders, closeTrack, base } = senderFixture();
  const afterOff = await syncPublishedSenders({
    ...base,
    published: [video],
    desired: [],
    stream: asStream(new FakeStream([new FakeTrack('audio')])),
  });
  expect(closeTrack).toHaveBeenCalledOnce();
  expect(sender.replaceTrack).toHaveBeenCalledWith(null);
  expect(senders.size).toBe(0);
  expect(afterOff).toEqual([]);
  // Nothing but camera tracks ever reach the sender: no keepalive canvas.
  expect(cameraTracks).toHaveLength(0);
  expect(processedTracks).toHaveLength(0);
  expect(diffLocalTracks(afterOff, [video]).publish).toEqual([video]);
});

it('republishes after a host video lock is lifted', async () => {
  const { video, closeTrack, base } = senderFixture();
  // Lock: the room already retired the publication, so no close is sent, yet
  // the plan must still leave the published ledger.
  const locked = await syncPublishedSenders({
    ...base,
    published: [video],
    desired: [],
    stream: asStream(new FakeStream([new FakeTrack('audio')])),
    closeTrack: () => Promise.resolve(),
  });
  expect(locked).toEqual([]);
  expect(closeTrack).not.toHaveBeenCalled();
  // Unlock and camera on: the ledger has no video, so it is published again.
  const fresh = new FakeTrack('video');
  const unlocked = await syncPublishedSenders({
    ...base,
    published: locked,
    desired: [video],
    stream: asStream(new FakeStream([fresh])),
  });
  expect(diffLocalTracks(unlocked, [video]).publish).toEqual([video]);
});

it('ends with one live camera after a quick off/on toggle', async () => {
  const { controls, localStreamRef, applyMedia, mediaRef } = setup(
    new CameraEffects()
  );
  await controls.toggleCamera();
  const off = controls.toggleCamera();
  const on = controls.toggleCamera();
  await Promise.all([off, on]);
  expect(mediaRef.current.videoEnabled).toBe(true);
  expect(cameraTracks.filter((track) => track.readyState === 'live')).toEqual(
    localStreamRef.current?.getVideoTracks()
  );
  expect(localStreamRef.current?.getVideoTracks()).toHaveLength(1);
  expect(applyMedia.mock.calls.map(([next]) => next.videoEnabled)).toEqual([
    true,
    false,
    true,
  ]);
});

it('stops a camera that finishes opening after the user turned it off again', async () => {
  let open!: (stream: FakeStream) => void;
  getUserMedia.mockImplementationOnce(
    () =>
      new Promise<FakeStream>((resolve) => {
        open = resolve;
      })
  );
  const { controls, localStreamRef, applyMedia, mediaRef } = setup(
    new CameraEffects()
  );
  const pendingOn = controls.toggleCamera();
  await Promise.resolve();
  const off = controls.toggleCamera();
  const late = new FakeTrack('video');
  open(new FakeStream([late]));
  await Promise.all([pendingOn, off]);
  expect(late.readyState).toBe('ended');
  expect(mediaRef.current.videoEnabled).toBe(false);
  expect(localStreamRef.current?.getVideoTracks()).toHaveLength(0);
  expect(applyMedia.mock.calls.some(([next]) => next.videoEnabled)).toBe(false);
});

it('a failed camera-off publish cannot undo a newer camera-on', async () => {
  const { controls, mediaRef, applyMedia } = setup(new CameraEffects());
  await controls.toggleCamera();
  applyMedia.mockImplementationOnce(async () => {
    throw new Error('transport');
  });
  const off = controls.toggleCamera();
  const on = controls.toggleCamera();
  await expect(off).rejects.toThrow('transport');
  await on;
  expect(mediaRef.current.videoEnabled).toBe(true);
});

it('remembers a device chosen while the camera is off and uses it on camera-on', async () => {
  const { controls } = setup(new CameraEffects());
  await controls.toggleCamera();
  await controls.toggleCamera();
  getUserMedia.mockClear();
  await controls.selectDevice('video', 'rear-camera');
  expect(getUserMedia).not.toHaveBeenCalled();
  await controls.toggleCamera();
  expect(getUserMedia.mock.calls[0]?.[0].video).toMatchObject({
    deviceId: { exact: 'rear-camera' },
  });
});

it('stops a device that finishes opening after the camera was turned off', async () => {
  const { controls, localStreamRef, mediaRef } = setup(new CameraEffects());
  await controls.toggleCamera();
  let open!: (stream: FakeStream) => void;
  getUserMedia.mockImplementationOnce(
    () =>
      new Promise<FakeStream>((resolve) => {
        open = resolve;
      })
  );
  const switching = controls.selectDevice('video', 'rear-camera');
  await controls.toggleCamera();
  const late = new FakeTrack('video');
  open(new FakeStream([late]));
  await switching;
  expect(mediaRef.current.videoEnabled).toBe(false);
  expect(late.readyState).toBe('ended');
  expect(localStreamRef.current?.getVideoTracks()).toHaveLength(0);
  expect(cameraTracks.every((track) => track.readyState === 'ended')).toBe(
    true
  );
  expect(controls.getSelectedDevices().video).toBe('rear-camera');
});

it('leaves no live camera track behind after leaving', async () => {
  const effects = new CameraEffects();
  await effects.setLook({ filter: 'warm', softness: 0 });
  const { controls, localStreamRef } = setup(effects);
  await controls.toggleCamera();
  const setLocal = vi.fn();
  stopLocalCapture(
    effects,
    localStreamRef,
    { current: null },
    setLocal,
    vi.fn()
  );
  expect(setLocal).toHaveBeenCalledWith(null);
  expect(localStreamRef.current).toBeNull();
  for (const track of [...cameraTracks, ...processedTracks])
    expect(track.readyState).toBe('ended');
});
