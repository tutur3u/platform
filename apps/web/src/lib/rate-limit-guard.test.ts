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
  const closed = await checkRateLimitRedis('sso', config, {
    failClosed: true,
  });
  expect(closed.allowed).toBe(false);
  expect(closed.unavailable).toBe(true);
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

it('logs the guard failure code and runtime cause when a count fails open', async () => {
  vi.stubEnv('ABUSE_GUARD_FAMILIES', 'ratelimit');
  const { AbuseGuardUnavailableError } =
    await import('@tuturuuu/utils/abuse-guard/client');
  mocks.client!.incrRateWindow.mockRejectedValueOnce(
    new AbuseGuardUnavailableError('network', undefined, {
      cause: new TypeError('Network connection lost.'),
    })
  );
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { checkRateLimitRedis } = await import('./rate-limit');

  expect((await checkRateLimitRedis('a', config)).allowed).toBe(true);
  expect(error).toHaveBeenCalledWith(
    'Redis rate limit error, allowing request:',
    {
      errorType: 'AbuseGuardUnavailableError',
      code: 'network',
      causeType: 'TypeError',
      causeMessage: 'Network connection lost.',
    }
  );
  error.mockRestore();
});

it('retries a failed store init instead of keeping it for the isolate', async () => {
  vi.stubEnv('ABUSE_GUARD_FAMILIES', 'ratelimit');
  vi.useFakeTimers({ toFake: ['Date'] });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mocks.getClient
    .mockRejectedValueOnce(new Error('binding not ready'))
    .mockResolvedValueOnce(null);
  const { checkRateLimitRedis } = await import('./rate-limit');
  const count = () => checkRateLimitRedis('cron', config, { failClosed: true });

  try {
    expect((await count()).unavailable).toBe(true);
    // Inside the retry interval the failed init is not repeated per request.
    expect((await count()).unavailable).toBe(true);
    expect(mocks.getClient).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 30_000);
    expect((await count()).unavailable).toBe(true);
    expect(mocks.getClient).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 30_000);
    const recovered = await count();
    expect(recovered).toMatchObject({ allowed: true });
    expect(recovered.unavailable).toBeUndefined();
    expect(mocks.getClient).toHaveBeenCalledTimes(3);
    await count();
    expect(mocks.getClient).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
    warn.mockRestore();
  }
});
