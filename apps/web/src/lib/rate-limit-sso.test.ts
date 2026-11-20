// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  available: false,
  incrRateWindow: vi.fn(),
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  hasUpstashRestEnv: () => mocks.available,
  getUpstashRestRedisClient: async () => ({
    incrRateWindow: mocks.incrRateWindow,
  }),
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.available = false;
});
it('keeps existing default behavior but denies SSO when Redis is absent', async () => {
  const { checkRateLimitRedis } = await import('./rate-limit');
  const config = { windowMs: 60_000, maxRequests: 20 };
  expect(
    (await checkRateLimitRedis('sso', config, { failClosed: true })).allowed
  ).toBe(false);
  expect((await checkRateLimitRedis('legacy', config)).allowed).toBe(true);
});
it('denies SSO when the configured Redis operation fails', async () => {
  mocks.available = true;
  mocks.incrRateWindow.mockRejectedValue(Error('private diagnostic'));
  const { checkRateLimitRedis } = await import('./rate-limit');
  expect(
    (
      await checkRateLimitRedis(
        'sso',
        { windowMs: 60_000, maxRequests: 20 },
        { failClosed: true }
      )
    ).allowed
  ).toBe(false);
});
it('enforces the existing shared limiter count for SSO', async () => {
  mocks.available = true;
  mocks.incrRateWindow.mockResolvedValue({ n: 21, ttlMs: 60_000 });
  const { checkRateLimitRedis } = await import('./rate-limit');
  expect(
    (
      await checkRateLimitRedis(
        'sso',
        { windowMs: 60_000, maxRequests: 20 },
        { failClosed: true }
      )
    ).allowed
  ).toBe(false);
});
