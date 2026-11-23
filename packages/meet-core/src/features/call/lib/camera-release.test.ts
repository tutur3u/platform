import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptCameraPreview } from './adopt-camera-preview';
import { CameraEffects } from './camera-effects';
import { applyForcedMute } from './forced-media';
import { createLocalMediaControls } from './local-media-controls';
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
      fillRect: () => undefined,
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

it('keeps the SFU publication fed with black frames while the camera is released', async () => {
  const { sender, video, closeTrack, base } = senderFixture();
  const off = await syncPublishedSenders({
    ...base,
    published: [video],
    desired: [],
    stream: asStream(new FakeStream([new FakeTrack('audio')])),
  });
  const idle = vi.mocked(sender.replaceTrack).mock.calls.at(-1)?.[0];
  // The idle track is a canvas track, never a camera capture.
  expect(idle).toBe(processedTracks.at(-1));
  expect(cameraTracks).toHaveLength(0);
  expect(closeTrack).not.toHaveBeenCalled();
  expect(off).toEqual([video]);

  const fresh = new FakeTrack('video');
  const on = await syncPublishedSenders({
    ...base,
    published: off,
    desired: [video],
    stream: asStream(new FakeStream([fresh])),
  });
  expect(sender.replaceTrack).toHaveBeenLastCalledWith(fresh);
  expect(closeTrack).not.toHaveBeenCalled();
  expect(on).toEqual([video]);
  expect((idle as unknown as FakeTrack).readyState).toBe('ended');
});

it('closes the publication for a later fresh publish when no idle track is available', async () => {
  vi.stubGlobal('document', undefined);
  const { sender, video, senders, closeTrack, base } = senderFixture();
  const remaining = await syncPublishedSenders({
    ...base,
    published: [video],
    desired: [],
    stream: asStream(new FakeStream([new FakeTrack('audio')])),
  });
  expect(closeTrack).toHaveBeenCalledOnce();
  expect(sender.replaceTrack).toHaveBeenCalledWith(null);
  expect(senders.size).toBe(0);
  expect(remaining).toEqual([]);
});
