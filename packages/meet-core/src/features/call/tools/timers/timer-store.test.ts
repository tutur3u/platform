import { expect, it } from 'vitest';
import { createTimerStore, formatTimer, remainingMs } from './timer-store';

it('counts down, pauses and resets on this device', () => {
  const store = createTimerStore();
  store.choose(3);
  expect(store.get()).toEqual({
    durationMs: 180_000,
    endsAt: null,
    remainingMs: 180_000,
  });
  store.start(1_000);
  expect(remainingMs(store.get(), 61_000)).toBe(120_000);
  store.pause(61_000);
  expect(store.get().endsAt).toBeNull();
  expect(remainingMs(store.get(), 999_999)).toBe(120_000);
  store.start(100_000);
  expect(remainingMs(store.get(), 400_000)).toBe(0);
  store.reset();
  expect(store.get()).toMatchObject({ endsAt: null, remainingMs: 180_000 });
});

it('notifies subscribers and formats the clock', () => {
  const store = createTimerStore();
  let calls = 0;
  const stop = store.subscribe(() => calls++);
  store.choose(1);
  stop();
  store.choose(5);
  expect(calls).toBe(1);
  expect(formatTimer(65_000)).toBe('01:05');
  expect(formatTimer(1)).toBe('00:01');
});
