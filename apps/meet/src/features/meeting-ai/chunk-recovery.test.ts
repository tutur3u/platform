import { describe, expect, it, vi } from 'vitest';
import { recoverMeetChunk } from './chunk-recovery';

describe('transcription recovery', () => {
  it('keeps polling an in-flight attempt after a lost response', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce({ status: 'processing' })
      .mockResolvedValueOnce({ status: 'completed', transcript: 'Recovered' });
    const onRetry = vi.fn();
    const result = await recoverMeetChunk(upload, {
      deadline: 10_000,
      now: () => 0,
      wait: async () => {},
      onRetry,
    });
    expect(result).toEqual({ status: 'completed', transcript: 'Recovered' });
    expect(upload).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
  it('does not retry denied or ended sessions', async () => {
    const upload = vi.fn().mockRejectedValue({ status: 403 });
    await expect(
      recoverMeetChunk(upload, {
        deadline: 10_000,
        now: () => 0,
        onRetry: vi.fn(),
      })
    ).rejects.toEqual({ status: 403 });
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('bounds recovery time without treating missing content as completed', async () => {
    let now = 0;
    const upload = vi.fn().mockResolvedValue({ status: 'failed' });
    await expect(
      recoverMeetChunk(upload, {
        deadline: 3000,
        now: () => now,
        wait: async (ms) => {
          now += ms;
        },
        onRetry: vi.fn(),
      })
    ).rejects.toThrow('recovery timed out');
    expect(now).toBe(3000);
  });
});

it('never starts an upload after the queued deadline expires', async () => {
  const upload = vi.fn();
  await expect(
    recoverMeetChunk(upload, {
      deadline: 100,
      now: () => 100,
      onRetry: vi.fn(),
    })
  ).rejects.toThrow('recovery timed out');
  expect(upload).not.toHaveBeenCalled();
});
it('aborts a stalled upload and releases the recovery queue', async () => {
  vi.useFakeTimers();
  try {
    const upload = vi.fn(
      (signal: AbortSignal) =>
        new Promise<{ status: string }>((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        )
    );
    const task = recoverMeetChunk(upload, {
      deadline: Date.now() + 1000,
      onRetry: vi.fn(),
    });
    const assertion = expect(task).rejects.toThrow('recovery timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(upload).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
