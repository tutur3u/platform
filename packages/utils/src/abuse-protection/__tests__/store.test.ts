import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  hasEnv: vi.fn(() => true),
  reportLegacy: vi.fn(),
}));

vi.mock('../../upstash-rest', () => ({
  getUpstashRestRedisClient: mocks.getClient,
  hasUpstashRestEnv: mocks.hasEnv,
  reportLegacyFamilyWithoutStore: mocks.reportLegacy,
}));

describe('getAbuseProtectionStore', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('resolves the ratelimit guard store per call without consulting Upstash', async () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'ratelimit');
    const first = { get: vi.fn() };
    const second = { get: vi.fn() };
    mocks.getClient.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { getAbuseProtectionStore } = await import('../store.js');

    // The selector owns caching; this module never pins a guard client.
    await expect(getAbuseProtectionStore()).resolves.toBe(first);
    await expect(getAbuseProtectionStore()).resolves.toBe(second);
    expect(mocks.getClient).toHaveBeenNthCalledWith(1, { family: 'ratelimit' });
    expect(mocks.getClient).toHaveBeenNthCalledWith(2, { family: 'ratelimit' });
    expect(mocks.hasEnv).not.toHaveBeenCalled();
  });

  it('fails open with an error log when the guard store throws', async () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'ratelimit');
    mocks.getClient.mockRejectedValueOnce(new Error('binding unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAbuseProtectionStore } = await import('../store.js');

    await expect(getAbuseProtectionStore()).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('alerts once and fails open when neither store is configured', async () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', '');
    mocks.hasEnv.mockReturnValue(false);
    const { getAbuseProtectionStore } = await import('../store.js');

    await expect(getAbuseProtectionStore()).resolves.toBeNull();
    await expect(getAbuseProtectionStore()).resolves.toBeNull();
    expect(mocks.reportLegacy).toHaveBeenCalledTimes(1);
    expect(mocks.reportLegacy).toHaveBeenCalledWith('ratelimit');
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('caches the legacy client until a command failure invalidates it', async () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', '');
    mocks.hasEnv.mockReturnValue(true);
    const legacy = { get: vi.fn() };
    mocks.getClient.mockResolvedValue(legacy);
    const { getAbuseProtectionStore, invalidateAbuseProtectionStore } =
      await import('../store.js');

    await getAbuseProtectionStore();
    await getAbuseProtectionStore();
    expect(mocks.getClient).toHaveBeenCalledTimes(1);
    expect(mocks.getClient).toHaveBeenCalledWith();
    invalidateAbuseProtectionStore();
    await getAbuseProtectionStore();
    expect(mocks.getClient).toHaveBeenCalledTimes(2);
  });
});
