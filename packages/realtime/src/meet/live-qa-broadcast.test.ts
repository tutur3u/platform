import { afterEach, expect, it, vi } from 'vitest';
import {
  createLiveQaBroadcastWindow,
  LIVE_QA_BROADCAST_DELAY_MS,
} from './live-qa-broadcast';
import type { MeetRealtimeServerMessage } from './messages';

afterEach(() => {
  vi.useRealTimers();
});

const snapshot = (revision: number): MeetRealtimeServerMessage => ({
  type: 'qa.snapshot',
  snapshot: { questions: [], revision },
});

it('arms one timer for a burst and none once it has fired', () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const window = createLiveQaBroadcastWindow(emit);
  for (let revision = 1; revision <= 50; revision++)
    window.hold([snapshot(revision)]);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(LIVE_QA_BROADCAST_DELAY_MS);
  expect(emit).toHaveBeenCalledTimes(1);
  expect(emit).toHaveBeenCalledWith([snapshot(50)]);
  // The flush does not schedule another one, however long the room idles.
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(LIVE_QA_BROADCAST_DELAY_MS * 100);
  expect(emit).toHaveBeenCalledTimes(1);
});

it('clears the pending timer and the held snapshot when the room ends', () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const window = createLiveQaBroadcastWindow(emit);
  window.hold([snapshot(1)]);
  expect(vi.getTimerCount()).toBe(1);
  const now = window.hold([{ type: 'room.ended' }]);
  expect(now).toEqual([{ type: 'room.ended' }]);
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(LIVE_QA_BROADCAST_DELAY_MS * 10);
  expect(emit).not.toHaveBeenCalled();
});

it('does not arm a timer for frames that are not shared snapshots', () => {
  vi.useFakeTimers();
  const window = createLiveQaBroadcastWindow(vi.fn());
  const reply = {
    ...snapshot(2),
    requestId: 'qa:1',
  } as MeetRealtimeServerMessage;
  expect(window.hold([reply])).toEqual([reply]);
  expect(vi.getTimerCount()).toBe(0);
});

it('flushes at once and leaves no timer behind', () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const window = createLiveQaBroadcastWindow(emit);
  window.hold([snapshot(1)]);
  window.flush();
  expect(emit).toHaveBeenCalledWith([snapshot(1)]);
  expect(vi.getTimerCount()).toBe(0);
  window.flush();
  expect(emit).toHaveBeenCalledTimes(1);
});
