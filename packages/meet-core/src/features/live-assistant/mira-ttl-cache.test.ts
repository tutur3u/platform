import { afterEach, expect, it, vi } from 'vitest';
import { MiraTtlCache } from './mira-ttl-cache';

const cacheValue = () => true;

afterEach(() => vi.useRealTimers());

it('reuses an entry before expiry and reloads it at 60 seconds', async () => {
  vi.useFakeTimers();
  const cache = new MiraTtlCache<number>();
  const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
  await expect(cache.read('key', load, cacheValue)).resolves.toBe(1);

  vi.advanceTimersByTime(59_999);
  await expect(cache.read('key', load, cacheValue)).resolves.toBe(1);
  expect(load).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1);
  await expect(cache.read('key', load, cacheValue)).resolves.toBe(2);
  expect(load).toHaveBeenCalledTimes(2);
});

it('evicts the oldest entry at capacity and keeps the next entry', async () => {
  vi.useFakeTimers();
  const cache = new MiraTtlCache<number>();
  for (let i = 0; i <= 2048; i++)
    await cache.read(String(i), async () => i, cacheValue);

  const reload = vi.fn(async () => -1);
  await expect(cache.read('1', reload, cacheValue)).resolves.toBe(1);
  expect(reload).not.toHaveBeenCalled();
  await expect(cache.read('0', reload, cacheValue)).resolves.toBe(-1);
  expect(reload).toHaveBeenCalledTimes(1);
});

it('keeps an invalidated in-flight load from replacing a fresh entry', async () => {
  const cache = new MiraTtlCache<number>();
  const stale = Promise.withResolvers<number>();
  const pending = cache.read('key', () => stale.promise, cacheValue);
  cache.delete('key');
  await expect(cache.read('key', async () => 2, cacheValue)).resolves.toBe(2);

  stale.resolve(1);
  await expect(pending).resolves.toBe(1);
  const reload = vi.fn(async () => 3);
  await expect(cache.read('key', reload, cacheValue)).resolves.toBe(2);
  expect(reload).not.toHaveBeenCalled();
});
