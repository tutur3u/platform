import { afterEach, expect, it, vi } from 'vitest';
import { LiveAudioBatcher } from '../../../cloudflare/live/audio-batcher';

afterEach(() => vi.useRealTimers());

it('batches small PCM packets and preserves sequence order', async () => {
  vi.useFakeTimers();
  const deliver = vi.fn().mockResolvedValue(undefined);
  const batcher = new LiveAudioBatcher(deliver, vi.fn(), 0);
  batcher.push(btoa('\0\0'));
  batcher.push(btoa('\u0001\0'));
  expect(deliver).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(200);
  await batcher.drain();
  expect(deliver).toHaveBeenCalledOnce();
  expect(deliver.mock.calls[0]?.slice(0, 2)).toEqual([btoa('\0\0\u0001\0'), 0]);
});

it('does not replay queued audio after an interruption', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const deliver = vi
    .fn()
    .mockImplementationOnce(() => pending)
    .mockResolvedValue(undefined);
  const batcher = new LiveAudioBatcher(deliver, vi.fn());
  batcher.push(btoa('\0'.repeat(24000)));
  await Promise.resolve();
  batcher.push(btoa('\0'.repeat(24000)));
  batcher.clear();
  release();
  await batcher.drain();
  expect(deliver).toHaveBeenCalledOnce();
});

it('does not let a hung delivery block speech after interruption', async () => {
  const deliver = vi
    .fn()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValue(undefined);
  const batcher = new LiveAudioBatcher(deliver, vi.fn());
  batcher.push(btoa('\0'.repeat(24000)));
  await Promise.resolve();
  batcher.clear();
  batcher.push(btoa('\u0001'.repeat(24000)));
  await batcher.drain();
  expect(deliver).toHaveBeenCalledTimes(2);
});

it('cancels in-flight transport and returns a sequence fence before replacement speech', async () => {
  let signal: AbortSignal | undefined;
  const deliver = vi.fn(
    async (_data, _sequence, _at, nextSignal: AbortSignal) => {
      signal = nextSignal;
    }
  );
  const batcher = new LiveAudioBatcher(deliver, vi.fn(), 0);
  batcher.push(btoa('\0'.repeat(24000)));
  await batcher.drain();
  const fence = batcher.clear();
  expect(signal?.aborted).toBe(true);
  batcher.push(btoa('\0'.repeat(24000)));
  await batcher.drain();
  expect(deliver.mock.calls[0]?.[1]).toBeLessThan(fence);
  expect(deliver.mock.calls[1]?.[1]).toBeGreaterThan(fence);
});
