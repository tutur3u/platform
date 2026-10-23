import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUpstashRestRedisClientMock } = vi.hoisted(() => ({
  getUpstashRestRedisClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: getUpstashRestRedisClientMock,
}));

import {
  consumeCalendarOAuthNonce,
  resetLocalCalendarOAuthNonceStoreForTests,
} from './calendar-oauth-nonce-store';

const now = 1_000_000;
const input = {
  expiresAt: now + 600_000,
  nonce: 'nonce-1',
  now,
  provider: 'google' as const,
};

describe('calendar OAuth nonce store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    resetLocalCalendarOAuthNonceStoreForTests();
  });

  it('consumes a nonce atomically in Redis for its remaining lifetime', async () => {
    const set = vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    getUpstashRestRedisClientMock.mockResolvedValue({ set });

    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('consumed');
    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('replayed');
    expect(set).toHaveBeenCalledWith(
      'calendar:oauth-state:v1:google:nonce-1',
      '1',
      { ex: 600, nx: true }
    );
  });

  it('fails closed when Redis errors', async () => {
    getUpstashRestRedisClientMock.mockResolvedValue({
      set: vi.fn().mockRejectedValue(new Error('down')),
    });

    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('unavailable');
  });

  it('refuses the process-local fallback in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    getUpstashRestRedisClientMock.mockResolvedValue(null);

    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('unavailable');
    vi.unstubAllEnvs();
  });

  it('falls back to a process-local single-use store without Redis', async () => {
    getUpstashRestRedisClientMock.mockResolvedValue(null);

    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('consumed');
    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('replayed');
    await expect(
      consumeCalendarOAuthNonce({ ...input, provider: 'microsoft' })
    ).resolves.toBe('consumed');
    await expect(
      consumeCalendarOAuthNonce({ ...input, now: input.expiresAt + 1 })
    ).resolves.toBe('consumed');
  });
});
