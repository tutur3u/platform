// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: null as null | {
    incrRateWindow: ReturnType<typeof vi.fn>;
  },
  getClient: vi.fn(),
  hasEnv: vi.fn(() => true),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: mocks.getClient,
  hasUpstashRestEnv: mocks.hasEnv,
}));

const config = { maxRequests: 2, windowMs: 60_000 };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.client = {
    incrRateWindow: vi.fn(async () => ({ n: 1, ttlMs: 60_000 })),
  };
  mocks.getClient.mockImplementation(async () => mocks.client);
});

afterEach(() => vi.unstubAllEnvs());

it('counts in the abuse-guard store when the ratelimit family is assigned', async () => {
  vi.stubEnv('ABUSE_GUARD_FAMILIES', 'ratelimit');
  const { checkRateLimitRedis } = await import('./rate-limit');

  mocks
    .client!.incrRateWindow.mockResolvedValueOnce({ n: 1, ttlMs: 60_000 })
    .mockResolvedValueOnce({ n: 3, ttlMs: 38_000 });
  expect((await checkRateLimitRedis('otp:ip', config)).allowed).toBe(true);
  expect((await checkRateLimitRedis('otp:ip', config)).allowed).toBe(false);

  expect(mocks.getClient).toHaveBeenCalledTimes(1);
  expect(mocks.getClient).toHaveBeenCalledWith({ family: 'ratelimit' });
  // An assigned family never consults or falls back to the Upstash env.
  expect(mocks.hasEnv).not.toHaveBeenCalled();
  expect(mocks.client!.incrRateWindow).toHaveBeenCalledWith(
    'ratelimit:otp:ip',
    60_000
  );
});

it('keeps each caller fail policy when the assigned store is unusable', async () => {
  vi.stubEnv('ABUSE_GUARD_FAMILIES', 'ratelimit');
  mocks.getClient.mockResolvedValue(null);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { checkRateLimitRedis } = await import('./rate-limit');

  expect((await checkRateLimitRedis('legacy', config)).allowed).toBe(true);
  expect(
    (await checkRateLimitRedis('sso', config, { failClosed: true })).allowed
  ).toBe(false);
  expect(mocks.hasEnv).not.toHaveBeenCalled();
  warn.mockRestore();
});

it('uses the legacy Upstash client when the family is not assigned', async () => {
  vi.stubEnv('ABUSE_GUARD_FAMILIES', '');
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { checkRateLimitRedis } = await import('./rate-limit');

  expect((await checkRateLimitRedis('legacy', config)).allowed).toBe(true);
  expect(mocks.hasEnv).toHaveBeenCalled();
  expect(mocks.getClient).toHaveBeenCalledWith();
  log.mockRestore();
});
