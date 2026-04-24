import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  redis: {
    decr: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    incr: vi.fn(),
    set: vi.fn(),
    ttl: vi.fn(),
  },
}));

vi.mock('../upstash-rest.js', () => ({
  getUpstashRestRedisClient: () => mocks.getRedis(),
}));

describe('ai temp auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRedis.mockResolvedValue(mocks.redis);
    mocks.redis.get.mockResolvedValue('0');
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.incr.mockResolvedValue(1);
    mocks.redis.decr.mockResolvedValue(0);
    mocks.redis.expire.mockResolvedValue(1);
    mocks.redis.del.mockResolvedValue(1);
  });

  it('mints a 60-second token and stores only its digest in Redis', async () => {
    const { mintAiTempAuthToken } = await import('../ai-temp-auth.js');

    const minted = await mintAiTempAuthToken({
      user: { id: 'user-1', email: 'user@test.com' },
      wsId: 'workspace-1',
      creditWsId: 'workspace-1',
      creditSource: 'workspace',
    });

    expect(minted).not.toBeNull();
    expect(minted?.token).toContain('.');
    expect(minted?.expiresAt).toBeGreaterThan(Date.now());
    expect(mocks.redis.set).toHaveBeenCalledTimes(1);

    const [key, payload, options] = mocks.redis.set.mock.calls[0]!;
    expect(key).toMatch(/^ai:temp-auth:token:/);
    expect(key).not.toContain(minted!.token);
    expect(JSON.stringify(payload)).not.toContain(minted!.token);
    expect(options).toEqual({ ex: 60 });
  });

  it('validates an unrevoked token and returns its cached identity context', async () => {
    const { mintAiTempAuthToken, validateAiTempAuthRequest } = await import(
      '../ai-temp-auth.js'
    );

    const minted = await mintAiTempAuthToken({
      user: { id: 'user-1', email: 'user@test.com' },
      wsId: 'workspace-1',
      creditWsId: 'workspace-2',
      creditSource: 'personal',
    });
    const storedPayload = mocks.redis.set.mock.calls[0]![1];
    mocks.redis.get
      .mockResolvedValueOnce(storedPayload)
      .mockResolvedValueOnce(storedPayload.authVersion);

    const request = new Request('https://app.test/api/ai/chat', {
      headers: { 'x-tuturuuu-ai-temp-auth': minted!.token },
    });

    await expect(validateAiTempAuthRequest(request)).resolves.toEqual({
      status: 'valid',
      context: expect.objectContaining({
        user: { id: 'user-1', email: 'user@test.com' },
        wsId: 'workspace-1',
        creditWsId: 'workspace-2',
        creditSource: 'personal',
      }),
    });
  });

  it('rejects a token when the user auth version has changed', async () => {
    const { mintAiTempAuthToken, validateAiTempAuthRequest } = await import(
      '../ai-temp-auth.js'
    );

    const minted = await mintAiTempAuthToken({
      user: { id: 'user-1', email: null },
      wsId: 'workspace-1',
    });
    const storedPayload = mocks.redis.set.mock.calls[0]![1];
    mocks.redis.get
      .mockResolvedValueOnce(storedPayload)
      .mockResolvedValueOnce('2');

    const request = new Request('https://app.test/api/ai/chat', {
      headers: { 'x-tuturuuu-ai-temp-auth': minted!.token },
    });

    await expect(validateAiTempAuthRequest(request)).resolves.toEqual({
      status: 'revoked',
    });
  });

  it('falls back when Redis is unavailable', async () => {
    mocks.getRedis.mockResolvedValue(null);
    const { mintAiTempAuthToken, validateAiTempAuthRequest } = await import(
      '../ai-temp-auth.js'
    );

    await expect(
      mintAiTempAuthToken({ user: { id: 'user-1', email: null } })
    ).resolves.toBeNull();

    const request = new Request('https://app.test/api/ai/chat', {
      headers: { 'x-tuturuuu-ai-temp-auth': 'token.secret' },
    });
    await expect(validateAiTempAuthRequest(request)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('falls back when Redis token reads or writes fail', async () => {
    const { mintAiTempAuthToken, validateAiTempAuthRequest } = await import(
      '../ai-temp-auth.js'
    );

    mocks.redis.set.mockRejectedValueOnce(new Error('redis write failed'));
    await expect(
      mintAiTempAuthToken({ user: { id: 'user-1', email: null } })
    ).resolves.toBeNull();

    mocks.redis.get.mockRejectedValueOnce(new Error('redis read failed'));
    const request = new Request('https://app.test/api/ai/chat', {
      headers: { 'x-tuturuuu-ai-temp-auth': 'token.secret' },
    });
    await expect(validateAiTempAuthRequest(request)).resolves.toEqual({
      status: 'invalid',
    });
  });

  it('bumps the per-user auth version for automatic token revocation', async () => {
    const { revokeUserAiTempAuthTokens } = await import('../ai-temp-auth.js');

    await expect(revokeUserAiTempAuthTokens('user-1')).resolves.toBe(true);
    expect(mocks.redis.incr).toHaveBeenCalledWith(
      'ai:temp-auth:user-version:user-1'
    );
    expect(mocks.redis.expire).toHaveBeenCalledWith(
      'ai:temp-auth:user-version:user-1',
      86_400
    );
  });
});

describe('ai credit snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRedis.mockResolvedValue(mocks.redis);
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.del.mockResolvedValue(1);
    mocks.redis.incr.mockResolvedValue(1);
    mocks.redis.decr.mockResolvedValue(0);
    mocks.redis.expire.mockResolvedValue(1);
  });

  it('writes, reads, and invalidates short-lived credit snapshots', async () => {
    const {
      invalidateAiCreditSnapshot,
      readAiCreditSnapshot,
      writeAiCreditSnapshot,
    } = await import('../ai-temp-auth.js');
    const snapshot = {
      remainingCredits: 1200,
      maxOutputTokens: 4096,
      tier: 'PRO',
      allowedModels: ['google/gemini-2.5-flash'],
      allowedFeatures: ['chat'],
      dailyLimit: null,
      updatedAt: Date.now(),
    };

    await expect(
      writeAiCreditSnapshot({
        wsId: 'workspace-1',
        userId: 'user-1',
        snapshot,
      })
    ).resolves.toBe(true);
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'ai:credits:snapshot:workspace-1:user-1',
      snapshot,
      { ex: 15 }
    );

    mocks.redis.get.mockResolvedValue(snapshot);
    await expect(
      readAiCreditSnapshot({ wsId: 'workspace-1', userId: 'user-1' })
    ).resolves.toEqual(snapshot);

    await expect(
      invalidateAiCreditSnapshot({ wsId: 'workspace-1', userId: 'user-1' })
    ).resolves.toBe(true);
    expect(mocks.redis.del).toHaveBeenCalledWith(
      'ai:credits:snapshot:workspace-1:user-1'
    );
  });

  it('tracks charge in-flight markers with a short TTL', async () => {
    const {
      decrementAiCreditChargeInFlight,
      hasAiCreditChargeInFlight,
      incrementAiCreditChargeInFlight,
    } = await import('../ai-temp-auth.js');

    await expect(
      incrementAiCreditChargeInFlight({ wsId: 'workspace-1', userId: 'user-1' })
    ).resolves.toBe(true);
    expect(mocks.redis.incr).toHaveBeenCalledWith(
      'ai:credits:in-flight:workspace-1:user-1'
    );
    expect(mocks.redis.expire).toHaveBeenCalledWith(
      'ai:credits:in-flight:workspace-1:user-1',
      60
    );

    mocks.redis.get.mockResolvedValueOnce(1);
    await expect(
      hasAiCreditChargeInFlight({ wsId: 'workspace-1', userId: 'user-1' })
    ).resolves.toBe(true);

    await expect(
      decrementAiCreditChargeInFlight({ wsId: 'workspace-1', userId: 'user-1' })
    ).resolves.toBe(true);
    expect(mocks.redis.decr).toHaveBeenCalledWith(
      'ai:credits:in-flight:workspace-1:user-1'
    );
    expect(mocks.redis.del).toHaveBeenCalledWith(
      'ai:credits:in-flight:workspace-1:user-1'
    );
  });

  it('fails open when Redis snapshot operations throw', async () => {
    const {
      invalidateAiCreditSnapshot,
      readAiCreditSnapshot,
      writeAiCreditSnapshot,
    } = await import('../ai-temp-auth.js');
    const snapshot = {
      remainingCredits: 1200,
      maxOutputTokens: 4096,
      tier: 'PRO',
      allowedModels: [],
      allowedFeatures: [],
      dailyLimit: null,
      updatedAt: Date.now(),
    };

    mocks.redis.set.mockRejectedValueOnce(new Error('redis write failed'));
    await expect(
      writeAiCreditSnapshot({
        wsId: 'workspace-1',
        userId: 'user-1',
        snapshot,
      })
    ).resolves.toBe(false);

    mocks.redis.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(
      readAiCreditSnapshot({ wsId: 'workspace-1', userId: 'user-1' })
    ).resolves.toBeNull();

    mocks.redis.del.mockRejectedValueOnce(new Error('redis delete failed'));
    await expect(
      invalidateAiCreditSnapshot({ wsId: 'workspace-1', userId: 'user-1' })
    ).resolves.toBe(false);
  });

  it('uses a credit snapshot only when it is fresh, not near exhaustion, and no charge is in flight', async () => {
    const { isAiCreditSnapshotUsable } = await import('../ai-temp-auth.js');
    const freshSnapshot = {
      remainingCredits: 1200,
      maxOutputTokens: 4096,
      tier: 'PRO',
      allowedModels: [],
      allowedFeatures: [],
      dailyLimit: null,
      updatedAt: Date.now(),
    };

    expect(isAiCreditSnapshotUsable(freshSnapshot)).toBe(true);
    expect(
      isAiCreditSnapshotUsable({ ...freshSnapshot, remainingCredits: 49 })
    ).toBe(false);
    expect(
      isAiCreditSnapshotUsable({
        ...freshSnapshot,
        updatedAt: Date.now() - 16_000,
      })
    ).toBe(false);
    expect(isAiCreditSnapshotUsable(freshSnapshot, { inFlight: true })).toBe(
      false
    );
  });
});
