import { expect, it, vi } from 'vitest';
import { cleanupLegacyCalendarCaches } from './legacy-offline-cache';

function storage() {
  const names = new Set([
    'tuturuuu-offline-precache-old',
    'tuturuuu-offline-runtime-v1',
    'calendar-precache-current',
    'calendar-runtime-v1',
    'other-app-precache-old',
  ]);
  return {
    names,
    keys: vi.fn(async () => [...names]),
    delete: vi.fn(async (name: string) => names.delete(name)),
  };
}

it('retires only legacy caches on Calendar, with no repeat deletion after migration', async () => {
  const cache = storage();
  const input = { origin: 'https://calendar.tuturuuu.com', storage: cache };
  await cleanupLegacyCalendarCaches(input);
  expect([...cache.names]).toEqual([
    'calendar-precache-current',
    'calendar-runtime-v1',
    'other-app-precache-old',
  ]);
  expect(cache.delete).toHaveBeenCalledTimes(2);
  await cleanupLegacyCalendarCaches(input);
  expect(cache.delete).toHaveBeenCalledTimes(2);
});

it.each([
  'https://tuturuuu.com',
  'https://staging.tuturuuu.com',
  'https://calendar.tuturuuu.com.attacker.invalid',
  'http://calendar.tuturuuu.com',
])('preserves every cache on %s', async (origin) => {
  const cache = storage();
  await cleanupLegacyCalendarCaches({ origin, storage: cache });
  expect(cache.keys).not.toHaveBeenCalled();
  expect(cache.delete).not.toHaveBeenCalled();
  expect(cache.names.size).toBe(5);
});
