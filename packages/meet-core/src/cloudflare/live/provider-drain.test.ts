import type { Session } from '@google/genai/web';
import { afterEach, expect, it, vi } from 'vitest';
import { drainLiveProvider } from './provider';

afterEach(() => vi.useRealTimers());

function provider() {
  return { sendRealtimeInput: vi.fn(), close: vi.fn() };
}

it('signals the end of input and waits for the final turn on an ordinary stop', async () => {
  vi.useFakeTimers();
  const session = provider();
  const done = drainLiveProvider(session as unknown as Session);
  expect(session.sendRealtimeInput).toHaveBeenCalledWith({
    audioStreamEnd: true,
  });
  expect(session.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1100);
  await done;
  expect(session.close).toHaveBeenCalledTimes(1);
});

it('sends nothing upstream and closes immediately for a revoked workspace', async () => {
  vi.useFakeTimers();
  const session = provider();
  const done = drainLiveProvider(session as unknown as Session, false);
  expect(session.close).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  await done;
  expect(session.sendRealtimeInput).not.toHaveBeenCalled();
});
