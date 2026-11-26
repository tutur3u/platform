import { afterEach, expect, it, vi } from 'vitest';
import {
  invalidateMeetGuestHostCache,
  readMeetGuestHost,
} from '@tuturuuu/utils/meet-guest-host-cache';
vi.mock('server-only', () => ({}));
const meeting = {
  id: 'm',
  creator_id: 'host',
  ws_id: 'workspace',
  name: 'Workshop',
};
afterEach(() => {
  invalidateMeetGuestHostCache('m');
  vi.useRealTimers();
});

it('coalesces a burst, expires a positive entry and invalidates a pending lookup', async () => {
  vi.useFakeTimers();
  const load = vi.fn(async () => meeting);
  const burst = Array.from({ length: 100 }, () => readMeetGuestHost('m', load));
  expect((await Promise.all(burst)).every((value) => value === meeting)).toBe(
    true
  );
  vi.advanceTimersByTime(29_999);
  await readMeetGuestHost('m', load);
  expect(load).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  const pending = readMeetGuestHost('m', load);
  invalidateMeetGuestHostCache('m');
  expect(await pending).toBeNull();
  expect(await readMeetGuestHost('m', load)).toBe(meeting);
  expect(load).toHaveBeenCalledTimes(3);
});

it('retries after a negative result or a lookup error', async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue(meeting);
  expect(await readMeetGuestHost('m', load)).toBeNull();
  await expect(readMeetGuestHost('m', load)).rejects.toThrow('unavailable');
  expect(await readMeetGuestHost('m', load)).toBe(meeting);
});
