import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { FakeInternalApiError } = vi.hoisted(() => ({
  FakeInternalApiError: class extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code?: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getInternalApiClient: vi.fn(),
  uploadMeetAiChunk: vi.fn(),
  InternalApiError: FakeInternalApiError,
}));

import type { SelfStreamGrant } from './self-api';
import { SELF_FRAME_SAMPLES } from './self-chunker';
import { SelfCaptureController } from './self-controller';
import {
  eligibleInputs,
  fakeApi,
  fakeEngine,
  fakeTrack,
  SELF_SESSION,
  streamOf,
} from './self-test-support';

const settle = () => vi.advanceTimersByTimeAsync(0);
const speak = (push: (frame: Float32Array) => void) => {
  for (let i = 0; i < 75; i++)
    push(new Float32Array(SELF_FRAME_SAMPLES).fill(0.1));
  for (let i = 0; i < 200; i++) push(new Float32Array(SELF_FRAME_SAMPLES));
};
function setup(api = fakeApi()) {
  const engine = fakeEngine();
  const controller = new SelfCaptureController({
    api,
    engine: engine.factory,
    newId: () => 'chunk-id',
  });
  return { api, controller, ...engine };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('per-speaker capture controller', () => {
  it('room mode never opens a stream or taps the microphone', async () => {
    const { api, controller, factory } = setup();
    const track = fakeTrack();
    controller.update(eligibleInputs(track, { mode: 'room' }));
    controller.update(
      eligibleInputs(track, { session: { sessionId: 's', protocol: 'legacy' } })
    );
    await settle();
    expect(api.open).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ kind: 'off' });
  });

  it('captures nothing before this participant allows it, or with Mira off', async () => {
    const { api, controller, factory } = setup();
    const track = fakeTrack();
    controller.update(eligibleInputs(track, { allow: false }));
    controller.update(eligibleInputs(track, { miraOn: false }));
    await settle();
    expect(api.open).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it('opens a stream, then taps only the local microphone track', async () => {
    const { api, controller, factory } = setup();
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    expect(factory).not.toHaveBeenCalled();
    await settle();
    expect(api.open).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0]![0]).toBe(track);
    expect(controller.getState()).toEqual({ kind: 'capturing' });
  });

  it('uploads a speech chunk under the stream and consent revision', async () => {
    const { api, controller, frames } = setup();
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    speak(frames.push);
    await settle();
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.upload.mock.calls[0]![0]).toMatchObject({
      sessionId: 'session-1',
      streamId: 'stream-1',
      consentRevision: 3,
      sequence: 0,
      startSample: 0,
    });
  });

  it('does not capture without confirmed echo cancellation', async () => {
    const { api, controller, factory } = setup();
    controller.update(eligibleInputs(fakeTrack(false)));
    controller.update(eligibleInputs(fakeTrack(null)));
    await settle();
    expect(api.open).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ kind: 'unsupported' });
  });

  it('stops when echo cancellation is lost after a settings change', async () => {
    const { controller, engine, frames } = setup();
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    await settle();
    track.setEcho(false);
    for (let i = 0; i < 25; i++)
      frames.push(new Float32Array(SELF_FRAME_SAMPLES));
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'unsupported' });
  });

  it('re-checks a replacement microphone before tapping it', async () => {
    const { controller, engine } = setup();
    const first = fakeTrack();
    controller.update(eligibleInputs(first));
    await settle();
    const good = fakeTrack();
    controller.update(eligibleInputs(good));
    expect(engine.swapTrack).toHaveBeenCalledWith(good);
    controller.update(eligibleInputs(fakeTrack(false)));
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'unsupported' });
  });

  it('stops at once and drops buffered audio when the participant declines', async () => {
    const api = fakeApi({ upload: vi.fn(() => new Promise(() => undefined)) });
    const { controller, engine, frames } = setup(api);
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    await settle();
    speak(frames.push);
    await settle();
    const signal = api.upload.mock.calls[0]![1];
    controller.update(eligibleInputs(track, { allow: false }));
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(true);
    expect(controller.getState()).toEqual({ kind: 'off' });
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('stops on a mode change or when the session leaves per-speaker', async () => {
    const { controller, engine } = setup();
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    await settle();
    controller.update(eligibleInputs(track, { mode: 'room' }));
    expect(engine.dispose).toHaveBeenCalledTimes(1);
  });

  it('renews the lease every 30 seconds', async () => {
    const { api, controller } = setup();
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.renew).toHaveBeenCalledWith({
      sessionId: 'session-1',
      streamId: 'stream-1',
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.renew).toHaveBeenCalledTimes(2);
  });

  it('stops and drops everything when a renewal is refused', async () => {
    const api = fakeApi({
      renew: vi.fn(async () => {
        throw new FakeInternalApiError('conflict', 409);
      }),
    });
    const { controller, engine } = setup(api);
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'stopped' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.renew).toHaveBeenCalledTimes(1);
    expect(api.open).toHaveBeenCalledTimes(1);
  });

  it('a refused chunk stops capture and only a rejoin opens again', async () => {
    const api = fakeApi({
      upload: vi.fn(async () => {
        throw new FakeInternalApiError(
          'gone',
          409,
          'MEET_TRANSCRIPT_CONSENT_REQUIRED'
        );
      }),
    });
    const { controller, engine, frames } = setup(api);
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    await settle();
    speak(frames.push);
    await settle();
    expect(controller.getState()).toEqual({ kind: 'stopped' });
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    controller.update(eligibleInputs(track));
    await settle();
    expect(api.open).toHaveBeenCalledTimes(1);
    controller.update(eligibleInputs(track, { joinEpoch: 2 }));
    await settle();
    expect(api.open).toHaveBeenCalledTimes(2);
  });

  it('shows guests the guest state and never captures', async () => {
    const api = fakeApi({
      open: vi.fn(async () => {
        throw new FakeInternalApiError('no', 409, 'MEET_SELF_NOT_ELIGIBLE');
      }),
    });
    const { controller, factory } = setup(api);
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    expect(controller.getState()).toEqual({ kind: 'guest' });
    expect(factory).not.toHaveBeenCalled();
    const known = setup();
    known.controller.update(eligibleInputs(fakeTrack(), { guest: true }));
    await settle();
    expect(known.api.open).not.toHaveBeenCalled();
    expect(known.controller.getState()).toEqual({ kind: 'guest' });
  });

  it('retries a rate-limited open after 30 seconds', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(
        new FakeInternalApiError('slow', 409, 'MEET_SELF_RATE_LIMITED')
      )
      .mockResolvedValue({
        streamId: 's2',
        consentRevision: 1,
        leaseExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      });
    const { controller, factory } = setup(fakeApi({ open }));
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    expect(controller.getState()).toEqual({ kind: 'paused' });
    expect(factory).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(open).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toEqual({ kind: 'capturing' });
  });

  it('pauses while disconnected and reopens a fresh stream on reconnect', async () => {
    const { api, controller, engine } = setup();
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    await settle();
    controller.update(eligibleInputs(track, { connected: false }));
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'paused' });
    controller.update(eligibleInputs(track, { connected: true, joinEpoch: 2 }));
    await settle();
    expect(api.open).toHaveBeenCalledTimes(2);
  });

  it('is off without a microphone', () => {
    const { controller } = setup();
    controller.update({
      ...eligibleInputs(fakeTrack()),
      stream: streamOf(),
      session: SELF_SESSION,
    });
    expect(controller.getState()).toEqual({ kind: 'off' });
  });

  it('ignores an open that resolves after the participant declined', async () => {
    let finish!: (value: SelfStreamGrant) => void;
    const api = fakeApi({
      open: vi.fn(
        () =>
          new Promise<SelfStreamGrant>((resolve) => {
            finish = resolve;
          })
      ),
    });
    const { controller, factory } = setup(api);
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    controller.update(eligibleInputs(track, { allow: false }));
    finish({
      streamId: 'late',
      consentRevision: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await settle();
    expect(factory).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ kind: 'off' });
  });
});

describe('per-speaker capture controller, consent and lease fences', () => {
  it('tells a guest they cannot contribute before anything else', async () => {
    const { api, controller } = setup();
    controller.update(
      eligibleInputs(fakeTrack(), { guest: true, allow: false, miraOn: false })
    );
    await settle();
    expect(controller.getState()).toEqual({ kind: 'guest' });
    expect(api.open).not.toHaveBeenCalled();
  });

  it('never opens while a local decline is held, and stops at once on one', async () => {
    const { api, controller, engine } = setup();
    const track = fakeTrack();
    controller.update(eligibleInputs(track, { held: true }));
    await settle();
    expect(api.open).not.toHaveBeenCalled();
    controller.update(eligibleInputs(track));
    await settle();
    expect(api.open).toHaveBeenCalledTimes(1);
    controller.update(eligibleInputs(track, { held: true }));
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'off' });
  });

  it('does not claim capture when the track ends while the stream opens', async () => {
    let finish!: (value: SelfStreamGrant) => void;
    const api = fakeApi({
      open: vi.fn(
        () =>
          new Promise<SelfStreamGrant>((resolve) => {
            finish = resolve;
          })
      ),
    });
    const { controller, factory } = setup(api);
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    track.end();
    finish({
      streamId: 's',
      consentRevision: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await settle();
    expect(factory).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ kind: 'off' });
  });

  it('says unsupported when echo cancellation is lost while the stream opens', async () => {
    let finish!: (value: SelfStreamGrant) => void;
    const api = fakeApi({
      open: vi.fn(
        () =>
          new Promise<SelfStreamGrant>((resolve) => {
            finish = resolve;
          })
      ),
    });
    const { controller, factory } = setup(api);
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    track.setEcho(false);
    finish({
      streamId: 's',
      consentRevision: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await settle();
    expect(factory).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ kind: 'unsupported' });
  });

  it('opens a new stream when a chunk reports a lapsed lease', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(
        new FakeInternalApiError('lease', 409, 'MEET_SELF_LEASE_EXPIRED')
      )
      .mockResolvedValue({});
    const { api, controller, frames, engine } = setup(fakeApi({ upload }));
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    speak(frames.push);
    await settle();
    expect(api.open).toHaveBeenCalledTimes(2);
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'capturing' });
  });

  it('stops after repeated lapsed leases without an accepted chunk', async () => {
    const upload = vi.fn(async () => {
      throw new FakeInternalApiError('lease', 409, 'MEET_SELF_LEASE_EXPIRED');
    });
    const { api, controller, frames } = setup(fakeApi({ upload }));
    controller.update(eligibleInputs(fakeTrack()));
    for (let round = 0; round < 6; round++) {
      await settle();
      speak(frames.push);
      await settle();
    }
    expect(api.open).toHaveBeenCalledTimes(4);
    expect(controller.getState()).toEqual({ kind: 'stopped' });
  });

  it('reopens when a renewal reports a lapsed lease', async () => {
    const renew = vi
      .fn()
      .mockRejectedValueOnce(
        new FakeInternalApiError('lease', 409, 'MEET_SELF_LEASE_EXPIRED')
      );
    const { api, controller } = setup(fakeApi({ renew }));
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.open).toHaveBeenCalledTimes(2);
  });

  it('treats any other chunk 409 as final', async () => {
    const upload = vi.fn(async () => {
      throw new FakeInternalApiError('no', 409, 'MEET_SELF_STREAM_CLOSED');
    });
    const { api, controller, frames } = setup(fakeApi({ upload }));
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    speak(frames.push);
    await settle();
    expect(api.open).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'stopped' });
  });

  it('accepts the newer echo cancellation modes', async () => {
    for (const mode of ['all', 'remote-only']) {
      const { controller } = setup();
      controller.update(eligibleInputs(fakeTrack(mode)));
      await settle();
      expect(controller.getState()).toEqual({ kind: 'capturing' });
    }
  });

  it('keeps capturing in a background tab and stops for good on pagehide', async () => {
    const api = fakeApi({ upload: vi.fn(() => new Promise(() => undefined)) });
    const { controller, engine, frames } = setup(api);
    const page = new EventTarget();
    const detach = controller.attachUnload(page);
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    page.dispatchEvent(new Event('visibilitychange'));
    expect(controller.getState()).toEqual({ kind: 'capturing' });
    speak(frames.push);
    await settle();
    const signal = api.upload.mock.calls[0]![1];
    page.dispatchEvent(new Event('pagehide'));
    expect(signal.aborted).toBe(true);
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'off' });
    detach();
  });
});

describe('per-speaker capture controller, notice and engine readiness', () => {
  it('stops and asks for the notice when the server requires it', async () => {
    const onNoticeRequired = vi.fn();
    const api = fakeApi({
      open: vi.fn(async () => {
        throw new FakeInternalApiError(
          'notice',
          409,
          'MEET_SELF_NOTICE_REQUIRED'
        );
      }),
    });
    const engine = fakeEngine();
    const controller = new SelfCaptureController({
      api,
      engine: engine.factory,
      onNoticeRequired,
    });
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    expect(onNoticeRequired).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'off' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.open).toHaveBeenCalledTimes(1);
    expect(engine.factory).not.toHaveBeenCalled();
    // While the notice is unconfirmed nothing opens, even on new inputs.
    controller.update(eligibleInputs(fakeTrack(), { noticeRequired: true }));
    await settle();
    expect(api.open).toHaveBeenCalledTimes(1);
  });

  it('reports capturing only once the microphone tap is running', async () => {
    let ready!: (engine: {
      swapTrack: () => void;
      dispose: () => void;
    }) => void;
    const factory = vi.fn(
      () =>
        new Promise<{ swapTrack: () => void; dispose: () => void }>(
          (resolve) => {
            ready = resolve;
          }
        )
    );
    const controller = new SelfCaptureController({
      api: fakeApi(),
      engine: factory,
    });
    controller.update(eligibleInputs(fakeTrack()));
    await settle();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ kind: 'paused' });
    ready({ swapTrack: vi.fn(), dispose: vi.fn() });
    await settle();
    expect(controller.getState()).toEqual({ kind: 'capturing' });
  });

  it('starts the lapsed-lease budget again for a new session', async () => {
    const upload = vi.fn(async () => {
      throw new FakeInternalApiError('lease', 409, 'MEET_SELF_LEASE_EXPIRED');
    });
    const { api, controller, frames } = setup(fakeApi({ upload }));
    const track = fakeTrack();
    controller.update(eligibleInputs(track));
    for (let round = 0; round < 3; round++) {
      await settle();
      speak(frames.push);
      await settle();
    }
    expect(api.open).toHaveBeenCalledTimes(4);
    controller.update(
      eligibleInputs(track, {
        session: { sessionId: 'session-2', protocol: 'self_v1' },
      })
    );
    await settle();
    speak(frames.push);
    await settle();
    // A fresh session reopens instead of counting the old session's reopens.
    expect(api.open).toHaveBeenCalledTimes(6);
    expect(controller.getState()).not.toEqual({ kind: 'stopped' });
  });
});
