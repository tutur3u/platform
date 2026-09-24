import { MEET_AUDIO_BATCH_INTERVAL_MS } from '@tuturuuu/ai/meetings/audio-contract';
import { afterEach, expect, it, vi } from 'vitest';
import { MeetAudioBatcher } from './audio-batches';

afterEach(() => vi.useRealTimers());
it('uses one sequence window for simultaneous microphones and matches the database rate guard', async () => {
  vi.useFakeTimers();
  const send = vi.fn(),
    overflow = vi.fn();
  const batcher = new MeetAudioBatcher(send, overflow);
  batcher.start();
  const audio = new Blob([new Uint8Array(320044)]);
  for (let window = 0; window < 60; window++) {
    for (let speaker = 0; speaker < 12; speaker++)
      batcher.add({
        audio,
        startSeconds: window * 10,
        accountId: String(speaker),
        kind: 'microphone',
      });
    await vi.advanceTimersByTimeAsync(
      MEET_AUDIO_BATCH_INTERVAL_MS + (window === 0 ? 100 : 0)
    );
    expect(send).toHaveBeenCalledTimes(window + 1);
    expect(window).toBeLessThanOrEqual(((window + 1) * 10) / 8 + 2);
    expect(send.mock.calls[window]?.[0]).toHaveLength(12);
  }
  batcher.stop();
  expect(overflow).not.toHaveBeenCalled();
});
it('flushes final source clips once and stops its timer', async () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const batcher = new MeetAudioBatcher(send, vi.fn());
  batcher.start();
  batcher.add({
    audio: new Blob(['final']),
    startSeconds: 17,
    accountId: 'alice',
    kind: 'shared_audio',
  });
  batcher.stop();
  batcher.stop();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0][0]).toMatchObject({
    startSeconds: 17,
    accountId: 'alice',
    kind: 'shared_audio',
  });
});
it('bounds audio memory and drops disposed buffers without uploading', () => {
  const send = vi.fn(),
    overflow = vi.fn();
  const batcher = new MeetAudioBatcher(send, overflow);
  batcher.add({
    audio: new Blob([new Uint8Array(12_000_001)]),
    startSeconds: 0,
    kind: 'microphone',
  });
  expect(overflow).toHaveBeenCalledOnce();
  batcher.dispose();
  batcher.flush();
  expect(send).not.toHaveBeenCalled();
});
