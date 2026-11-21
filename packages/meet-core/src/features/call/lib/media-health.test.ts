import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchSenderBandwidth } from './bandwidth';
import { createMediaPolicy, watchPageVisibility } from './media-policy';
import { createMediaQualityRecorder } from './media-quality';
import { planWindowedRemoteSubscriptions } from './negotiation';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function fakeSender(trackId: string, kind: 'audio' | 'video', rids?: string[]) {
  let parameters = {
    encodings: rids ? rids.map((rid) => ({ rid })) : [{}],
  } as RTCRtpSendParameters;
  return {
    track: { id: trackId, kind },
    getParameters: () => parameters,
    setParameters: vi.fn(async (next: RTCRtpSendParameters) => {
      parameters = next;
    }),
  } as unknown as RTCRtpSender & { setParameters: ReturnType<typeof vi.fn> };
}

function watch(stats: Array<Record<string, unknown>>, smallMode = true) {
  const camera = fakeSender('cam', 'video', ['f', 'h', 'q']);
  const mic = fakeSender('mic', 'audio');
  const pc = {
    connectionState: 'connected',
    signalingState: 'stable',
    getStats: async () => new Map(stats.map((stat, i) => [String(i), stat])),
  } as unknown as RTCPeerConnection;
  const recorder = { recordSender: vi.fn() };
  const watcher = watchSenderBandwidth({
    readPeer: () => pc,
    readSenders: () =>
      new Map<string, RTCRtpSender>([
        ['u-video', camera],
        ['u-audio', mic],
      ]),
    mode: () => 'auto',
    hasAudience: () => true,
    audience: () => ({ participants: 40, smallMode }),
    recorder,
  });
  return { camera, recorder, dispose: watcher.dispose };
}
const active = (sender: RTCRtpSender) =>
  sender.getParameters().encodings.map((encoding) => encoding.active);

describe('sender watcher', () => {
  const network = {
    type: 'candidate-pair',
    state: 'succeeded',
    nominated: true,
    availableOutgoingBitrate: 4_000_000,
    currentRoundTripTime: 0.04,
  };
  it('drops the full layer in thumbnail mode for a measured, quiet microphone', async () => {
    const { camera, recorder, dispose } = watch([
      network,
      {
        type: 'media-source',
        kind: 'audio',
        trackIdentifier: 'mic',
        audioLevel: 0,
      },
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(active(camera)).toEqual([false, true, true]);
    expect(recorder.recordSender).toHaveBeenCalledWith(
      expect.objectContaining({ sendLayers: 2, cpuLimited: false })
    );
    dispose();
  });

  it('keeps the full layer for a recent speaker or an unmeasured microphone', async () => {
    const speaking = watch([
      network,
      {
        type: 'media-source',
        kind: 'audio',
        trackIdentifier: 'mic',
        audioLevel: 0.3,
      },
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(active(speaking.camera)).toEqual([true, true, true]);
    speaking.dispose();
    const unmeasured = watch([network]);
    await vi.advanceTimersByTimeAsync(0);
    expect(active(unmeasured.camera)).toEqual([true, true, true]);
    unmeasured.dispose();
  });

  it('ignores shared audio as speech', async () => {
    const { camera, dispose } = watch([
      network,
      {
        type: 'media-source',
        kind: 'audio',
        trackIdentifier: 'mic',
        audioLevel: 0,
      },
      {
        type: 'media-source',
        kind: 'audio',
        trackIdentifier: 'shared',
        audioLevel: 0.9,
      },
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(active(camera)).toEqual([false, true, true]);
    dispose();
  });

  it('ignores a paused layer when reading CPU limitation', async () => {
    const { recorder, dispose } = watch(
      [
        network,
        {
          type: 'outbound-rtp',
          kind: 'video',
          active: false,
          qualityLimitationReason: 'cpu',
        },
        {
          type: 'outbound-rtp',
          kind: 'video',
          active: true,
          qualityLimitationReason: 'none',
        },
      ],
      false
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(recorder.recordSender).toHaveBeenLastCalledWith(
      expect.objectContaining({ cpuLimited: false })
    );
    dispose();
  });
});

describe('sender telemetry teardown', () => {
  it('clears the sender reading once its peer closes', async () => {
    const recorder = { recordSender: vi.fn() };
    const pc = { connectionState: 'closed', signalingState: 'closed' };
    const watcher = watchSenderBandwidth({
      readPeer: () => pc as unknown as RTCPeerConnection,
      readSenders: () => new Map(),
      mode: () => 'auto',
      hasAudience: () => true,
      recorder,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(recorder.recordSender).toHaveBeenCalledWith(null);
    watcher.dispose();
  });
});

describe('late sender samples', () => {
  it('never records stats that resolve after the peer closed', async () => {
    const recorder = { recordSender: vi.fn() };
    let resolveStats!: (stats: Map<string, unknown>) => void;
    const pc = {
      connectionState: 'connected',
      signalingState: 'stable',
      getStats: () =>
        new Promise((resolve) => {
          resolveStats = resolve;
        }),
    };
    const watcher = watchSenderBandwidth({
      readPeer: () => pc as unknown as RTCPeerConnection,
      readSenders: () => new Map(),
      mode: () => 'auto',
      hasAudience: () => true,
      recorder,
    });
    await vi.advanceTimersByTimeAsync(0);
    pc.connectionState = 'closed';
    resolveStats(new Map());
    await vi.advanceTimersByTimeAsync(0);
    expect(recorder.recordSender).not.toHaveBeenCalledWith(
      expect.objectContaining({ rttMs: expect.anything() })
    );
    watcher.dispose();
  });
});

describe('page visibility with Picture-in-Picture', () => {
  function fakeDocument() {
    const listeners = new Map<string, Set<() => void>>();
    return {
      visibilityState: 'visible' as DocumentVisibilityState,
      pip: false,
      addEventListener: (name: string, listener: () => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(listener);
      },
      removeEventListener: (name: string, listener: () => void) =>
        listeners.get(name)?.delete(listener),
      emit(name: string) {
        for (const listener of listeners.get(name) ?? []) listener();
      },
    };
  }

  it('saves again when Picture-in-Picture closes while hidden', () => {
    const doc = fakeDocument();
    const policy = createMediaPolicy(null);
    const stop = watchPageVisibility(policy, doc as never, () => doc.pip);
    doc.pip = true;
    doc.visibilityState = 'hidden';
    doc.emit('visibilitychange');
    vi.advanceTimersByTime(30_000);
    expect(policy.getSnapshot().visibility).toBe('visible');
    doc.pip = false;
    doc.emit('leavepictureinpicture');
    // Hidden time counts from the PiP close, so a quick switch stays cheap.
    expect(policy.getSnapshot().visibility).toBe('visible');
    vi.advanceTimersByTime(1500);
    expect(policy.getSnapshot().visibility).toBe('dimmed');
    stop();
  });

  it('derives the phase from wall time after the page was suspended', () => {
    const doc = fakeDocument();
    const policy = createMediaPolicy(null);
    let now = 0;
    const stop = watchPageVisibility(
      policy,
      doc as never,
      () => false,
      () => now
    );
    doc.visibilityState = 'hidden';
    doc.emit('visibilitychange');
    now = 60_000;
    doc.emit('enterpictureinpicture');
    expect(policy.getSnapshot().visibility).toBe('background');
    stop();
  });
});

describe('WebKit Picture-in-Picture', () => {
  it('reads the video presentation mode with the default detector', () => {
    const listeners = new Map<string, () => void>();
    const video = { webkitPresentationMode: 'picture-in-picture' };
    const doc = {
      visibilityState: 'hidden' as DocumentVisibilityState,
      querySelectorAll: () => [video],
      addEventListener: (name: string, listener: () => void) =>
        listeners.set(name, listener),
      removeEventListener: () => undefined,
    };
    const policy = createMediaPolicy(null);
    const stop = watchPageVisibility(policy, doc as never);
    vi.advanceTimersByTime(30_000);
    expect(policy.getSnapshot().visibility).toBe('visible');
    video.webkitPresentationMode = 'inline';
    listeners.get('webkitpresentationmodechanged')?.();
    vi.advanceTimersByTime(1500);
    expect(policy.getSnapshot().visibility).toBe('dimmed');
    stop();
  });
});

describe('document Picture-in-Picture', () => {
  it('watches a window that was already open when watching started', () => {
    const pipWindow = new EventTarget();
    const pip = Object.assign(new EventTarget(), {
      window: pipWindow as unknown,
    });
    vi.stubGlobal('documentPictureInPicture', pip);
    const doc = {
      visibilityState: 'hidden' as DocumentVisibilityState,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const policy = createMediaPolicy(null);
    const stop = watchPageVisibility(policy, doc as never);
    vi.advanceTimersByTime(30_000);
    expect(policy.getSnapshot().visibility).toBe('visible');
    pip.window = undefined;
    pipWindow.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(1500);
    expect(policy.getSnapshot().visibility).toBe('dimmed');
    stop();
    vi.unstubAllGlobals();
  });
});

describe('subscription ceiling', () => {
  it('opens new camera subscriptions no higher than the receiver ceiling', () => {
    const plan = planWindowedRemoteSubscriptions({
      ceiling: 'low',
      remoteTracks: {
        'a:a-video': {
          userId: 'a',
          sessionId: 'a',
          trackName: 'a-video',
          cameraRids: ['f', 'h', 'q'],
        },
      },
      subscribedKeys: [],
      selfUserId: 'me',
      videoWindow: { cameraUserIds: ['a'], spotlightUserId: 'a', changedAt: 0 },
    });
    expect(plan.pending[0]?.simulcast?.preferredRid).toBe('q');
  });
});

describe('media quality recorder expiry', () => {
  it('stops reporting readings that were not refreshed', () => {
    let now = 0;
    const recorder = createMediaQualityRecorder(() => now);
    recorder.recordSender({
      sendKbps: 400,
      availableSendKbps: null,
      rttMs: 30,
      loss: 0,
      cpuLimited: false,
      sendLayers: 2,
    });
    recorder.recordReceiver(
      {
        loss: 0,
        freezes: 0,
        rttMs: 30,
        availableKbps: null,
        receivedKbps: 400,
      },
      ['high'],
      false
    );
    const policy = {
      smallModePreference: 'auto' as const,
      audioOnly: false,
      visibility: 'visible' as const,
    };
    now = 6000;
    expect(recorder.take(policy)).toMatchObject({
      sendKbps: 400,
      recvVideoKbps: 400,
    });
    now = 90_000;
    expect(recorder.take(policy)).toMatchObject({
      sendKbps: null,
      recvVideoKbps: null,
      sendLayers: 0,
      layers: { high: 0, mid: 0, low: 0 },
    });
  });
});

describe('media quality recorder', () => {
  it('reports one interval of rates, layers and freezes without identifiers', () => {
    let now = 26_000;
    const recorder = createMediaQualityRecorder(() => now);
    now = 29_000;
    recorder.recordSender({
      sendKbps: 812.4,
      availableSendKbps: 2400,
      rttMs: 41,
      loss: 0.012345,
      cpuLimited: false,
      sendLayers: 3,
    });
    recorder.recordReceiver(
      {
        loss: 0.02,
        freezes: 2,
        rttMs: 40,
        availableKbps: null,
        receivedKbps: 1500,
      },
      ['high', 'low', 'low'],
      true
    );
    now = 30_000;
    const sample = recorder.take({
      smallModePreference: 'auto',
      audioOnly: false,
      visibility: 'visible',
    });
    expect(sample).toEqual({
      sendKbps: 812,
      availableSendKbps: 2400,
      recvVideoKbps: 1500,
      rttMs: 40,
      recvLoss: 0.02,
      sendLoss: 0.0123,
      freezes: 2,
      layers: { high: 1, mid: 0, low: 2 },
      sendLayers: 3,
      cpuLimited: false,
      audioOnly: false,
      smallMode: true,
      visibility: 'visible',
      intervalMs: 4000,
      cameraHeight: null,
      cameraFps: null,
      screenHeight: null,
      screenFps: null,
    });
    expect(
      recorder.take({
        smallModePreference: 'auto',
        audioOnly: false,
        visibility: 'visible',
      }).freezes
    ).toBe(0);
    expect(
      (globalThis as { __meetMediaStats?: unknown }).__meetMediaStats
    ).toBeDefined();
    // Once cameras stop being measured, the last reading is not reported.
    recorder.recordReceiver(null, [], false);
    expect(
      recorder.take({
        smallModePreference: 'auto',
        audioOnly: true,
        visibility: 'visible',
      })
    ).toMatchObject({
      recvVideoKbps: null,
      recvLoss: null,
      layers: { high: 0, mid: 0, low: 0 },
    });
  });
});
