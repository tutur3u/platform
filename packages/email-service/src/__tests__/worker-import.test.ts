import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: async () => null,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

it('imports without timers and expires credentials and fallback rate limits during use', async () => {
  vi.resetModules();
  vi.spyOn(globalThis, 'setInterval').mockImplementation(() => {
    throw new Error('Worker global-scope timer forbidden');
  });
  let now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const { getCachedCredential, clearCredentialCache } = await import(
    '../security'
  );
  const { EmailRateLimiter } = await import('../protection/rate-limiter');
  const fetcher = vi.fn(async () => 'credential');
  await getCachedCredential('worker-import', fetcher, 1000);
  await getCachedCredential('worker-import', fetcher, 1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const limiter = new EmailRateLimiter({ workspacePerMinute: 1 });
  const metadata = { wsId: 'worker-import-expiry' };
  await limiter.incrementCounters(metadata, ['worker@example.invalid']);
  expect((await limiter.checkRateLimits(metadata)).allowed).toBe(false);
  now += 60_001;
  await getCachedCredential('worker-import', fetcher, 1000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await limiter.checkRateLimits(metadata)).allowed).toBe(true);
  expect(globalThis.setInterval).not.toHaveBeenCalled();
  clearCredentialCache();
});
