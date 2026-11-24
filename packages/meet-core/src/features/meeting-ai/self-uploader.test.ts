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
vi.mock('@tuturuuu/internal-api/client', () => ({
  getInternalApiClient: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getInternalApiClient: vi.fn(),
  uploadMeetAiChunk: vi.fn(),
  InternalApiError: FakeInternalApiError,
}));

import { selfChunkForm } from './self-api';
import { SELF_FRAME_SAMPLES, type SelfChunk } from './self-chunker';
import { SELF_PENDING_MAX_SAMPLES, SelfUploader } from './self-uploader';
import { fakeApi } from './self-test-support';

const chunk = (startSample: number, seconds = 2): SelfChunk => ({
  startSample,
  samples: new Float32Array(seconds * 16_000).fill(0.1),
  speechFrames: seconds * 50,
});
const grant = { sessionId: 'sess', streamId: 'str', consentRevision: 4 };
const ids = () => {
  let n = 0;
  return () => `id-${n++}`;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('self uploader', () => {
  it('sends only the allowed fields and numbers chunks from zero', async () => {
    const api = fakeApi();
    const uploader = new SelfUploader(
      api,
      grant,
      { onFailure: vi.fn() },
      ids()
    );
    uploader.enqueue(chunk(0));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.upload).toHaveBeenCalledTimes(1);
    const sent = api.upload.mock.calls[0]![0];
    expect(sent).toMatchObject({
      ...grant,
      id: 'id-0',
      sequence: 0,
      startSample: 0,
    });
    const form = selfChunkForm(sent);
    expect([...form.keys()].sort()).toEqual([
      'audio',
      'consentRevision',
      'id',
      'sequence',
      'sessionId',
      'startSample',
      'streamId',
    ]);
    expect(form.has('sources')).toBe(false);
    expect(form.has('speakerAccountId')).toBe(false);
  });

  it('keeps one upload in flight', async () => {
    let release!: () => void;
    const api = fakeApi({
      upload: vi.fn(
        () => new Promise((resolve) => (release = () => resolve({})))
      ),
    });
    const uploader = new SelfUploader(
      api,
      grant,
      { onFailure: vi.fn() },
      ids()
    );
    uploader.enqueue(chunk(0));
    uploader.enqueue(chunk(32_000));
    uploader.enqueue(chunk(64_000));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.upload).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it('holds at most 60 seconds of pending audio and drops the rest', async () => {
    const api = fakeApi({ upload: vi.fn(() => new Promise(() => undefined)) });
    const uploader = new SelfUploader(
      api,
      grant,
      { onFailure: vi.fn() },
      ids()
    );
    for (let i = 0; i < 8; i++) uploader.enqueue(chunk(i * 160_000, 10));
    expect(uploader.pendingSamples).toBeLessThanOrEqual(
      SELF_PENDING_MAX_SAMPLES
    );
    expect(uploader.pendingSamples).toBe(SELF_PENDING_MAX_SAMPLES);
    expect(uploader.droppedForCap).toBe(2);
  });

  it('drops the whole queue and reports a refusal', async () => {
    const onFailure = vi.fn();
    const api = fakeApi({
      upload: vi.fn(async () => {
        throw new FakeInternalApiError(
          'conflict',
          409,
          'MEET_TRANSCRIPT_CONSENT_REQUIRED'
        );
      }),
    });
    const uploader = new SelfUploader(api, grant, { onFailure }, ids());
    uploader.enqueue(chunk(0));
    uploader.enqueue(chunk(32_000));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onFailure).toHaveBeenCalledWith('refused');
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(uploader.pendingSamples).toBe(0);
    expect(uploader.enqueue(chunk(0))).toBe(false);
  });

  it('retries a transient failure with the same chunk id, then moves on', async () => {
    const api = fakeApi({
      upload: vi.fn(async () => {
        throw new FakeInternalApiError('down', 503);
      }),
    });
    const onFailure = vi.fn();
    const uploader = new SelfUploader(api, grant, { onFailure }, ids());
    uploader.enqueue(chunk(0));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.upload).toHaveBeenCalledTimes(3);
    expect(new Set(api.upload.mock.calls.map(([c]) => c.id)).size).toBe(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(uploader.pendingSamples).toBe(0);
  });

  it('aborts the request in flight when stopped', async () => {
    const api = fakeApi({ upload: vi.fn(() => new Promise(() => undefined)) });
    const uploader = new SelfUploader(
      api,
      grant,
      { onFailure: vi.fn() },
      ids()
    );
    uploader.enqueue(chunk(0));
    await vi.advanceTimersByTimeAsync(0);
    const signal = api.upload.mock.calls[0]![1];
    uploader.stop();
    expect(signal.aborted).toBe(true);
    expect(uploader.pendingSamples).toBe(0);
  });

  it('frames are 20 ms', () => {
    expect(SELF_FRAME_SAMPLES / 16).toBe(20);
  });
});

describe('self uploader rate limits and leases', () => {
  it('waits at least 10 seconds after a 429', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new FakeInternalApiError('slow', 429))
      .mockResolvedValue({});
    const api = fakeApi({ upload });
    const uploader = new SelfUploader(
      api,
      grant,
      { onFailure: vi.fn() },
      ids()
    );
    uploader.enqueue(chunk(0));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(upload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('honours a longer Retry-After', async () => {
    const limited = Object.assign(new FakeInternalApiError('slow', 429), {
      retryAfter: 25,
    });
    const upload = vi.fn().mockRejectedValueOnce(limited).mockResolvedValue({});
    const uploader = new SelfUploader(
      fakeApi({ upload }),
      grant,
      { onFailure: vi.fn() },
      ids()
    );
    uploader.enqueue(chunk(0));
    await vi.advanceTimersByTimeAsync(24_000);
    expect(upload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('reports a lapsed lease separately and drops the queue', async () => {
    const onFailure = vi.fn();
    const upload = vi.fn(async () => {
      throw new FakeInternalApiError('lease', 409, 'MEET_SELF_LEASE_EXPIRED');
    });
    const uploader = new SelfUploader(
      fakeApi({ upload }),
      grant,
      { onFailure },
      ids()
    );
    uploader.enqueue(chunk(0));
    uploader.enqueue(chunk(32_000));
    await vi.advanceTimersByTimeAsync(0);
    expect(onFailure).toHaveBeenCalledWith('lease_expired');
    expect(uploader.pendingSamples).toBe(0);
  });

  it('reports each accepted chunk', async () => {
    const onSent = vi.fn();
    const uploader = new SelfUploader(
      fakeApi(),
      grant,
      { onFailure: vi.fn(), onSent },
      ids()
    );
    uploader.enqueue(chunk(0));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSent).toHaveBeenCalledTimes(1);
  });
});
