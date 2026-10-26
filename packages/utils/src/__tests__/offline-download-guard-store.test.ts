import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbuseGuardUnavailableError } from '../abuse-guard/client';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  hitWindows: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  verify: vi.fn(),
  trust: vi.fn(),
  redis: vi.fn(),
  limiterRedis: vi.fn(),
  ip: vi.fn(() => '192.0.2.1'),
}));
vi.mock('../abuse-guard/select', () => ({ selectAbuseGuard: mocks.select }));
vi.mock('@tuturuuu/turnstile/server', () => ({
  verifyTurnstileToken: mocks.verify,
}));
vi.mock('../abuse-protection/edge', () => ({
  extractIPFromRequest: mocks.ip,
}));
vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: mocks.trust,
}));
vi.mock('../upstash-rest', () => ({
  getUpstashRestRedisClient: mocks.redis,
  getUpstashRatelimitRedisClient: mocks.limiterRedis,
}));
vi.mock('../api-proxy-guard', () => ({
  buildProxySessionSubjectKey: (name: string, value: string) =>
    `session:${createHash('sha256').update(`${name}:${value}`).digest('hex').slice(0, 24)}`,
  getProxySessionSubjectKeyFromCookieHeader: async () => null,
}));

import {
  guardOfflineDownloadRequest,
  OFFLINE_DOWNLOAD_HEADER,
} from '../offline-download-guard';

function request(token?: string) {
  return new NextRequest(
    'https://example.test/api/v1/workspaces/workspace/inventory/products',
    {
      headers: {
        authorization: 'Bearer synthetic-session',
        [OFFLINE_DOWNLOAD_HEADER]: '1',
        ...(token ? { 'x-tuturuuu-turnstile-token': token } : {}),
      },
    }
  );
}

describe('offline download guard on the Durable Object store', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OFFLINE_DOWNLOAD_PROTECTION_ENABLED', 'true');
    vi.clearAllMocks();
    mocks.select.mockReturnValue({
      kind: 'durable-object',
      client: { hitWindows: mocks.hitWindows, get: mocks.get, set: mocks.set },
    });
    mocks.hitWindows.mockResolvedValue({
      ok: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue(true);
    mocks.trust.mockResolvedValue(new Map());
    mocks.verify.mockResolvedValue(undefined);
  });

  it('charges IP then session windows in one sequential call', async () => {
    mocks.get.mockResolvedValue('passed');
    await expect(guardOfflineDownloadRequest(request())).resolves.toBeNull();
    expect(mocks.select).toHaveBeenCalledWith('offline');
    expect(mocks.hitWindows).toHaveBeenCalledTimes(1);
    const [subjects] = mocks.hitWindows.mock.calls[0]!;
    expect(subjects).toEqual([
      {
        partition: 'ip:192.0.2.1',
        windows: [
          { key: '1m', limit: 1200, windowMs: 60_000, algo: 'sliding' },
          { key: '1h', limit: 30_000, windowMs: 3_600_000, algo: 'sliding' },
        ],
      },
      {
        partition: expect.stringMatching(/^session:/u),
        windows: [
          { key: '1m', limit: 600, windowMs: 60_000, algo: 'sliding' },
          { key: '1h', limit: 12_000, windowMs: 3_600_000, algo: 'sliding' },
        ],
      },
    ]);
    expect(mocks.redis).not.toHaveBeenCalled();
    expect(mocks.limiterRedis).not.toHaveBeenCalled();
  });

  it('returns 429 with a positive Retry-After on denial', async () => {
    mocks.hitWindows.mockResolvedValue({
      ok: false,
      resetAt: Date.now() + 30_500,
      subjectIndex: 1,
    });
    const response = await guardOfflineDownloadRequest(request());
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(response?.headers.get('X-RateLimit-Policy')).toBe(
      'offline-capable-read'
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('challenges, then grants a 15-minute reusable clearance', async () => {
    expect((await guardOfflineDownloadRequest(request()))?.status).toBe(403);
    await expect(
      guardOfflineDownloadRequest(request('real-proof'))
    ).resolves.toBeNull();
    expect(mocks.set).toHaveBeenCalledWith(
      expect.stringMatching(/^offline:clearance:session:/u),
      'passed',
      { ttlMs: 900_000 }
    );
  });

  it.each([
    new AbuseGuardUnavailableError('timeout'),
    new AbuseGuardUnavailableError('guard_stopped'),
    new AbuseGuardUnavailableError('unauthorized'),
  ])('fails closed when the store throws $code', async (error) => {
    mocks.hitWindows.mockRejectedValue(error);
    const response = await guardOfflineDownloadRequest(request());
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Retry-After')).toBe('30');
  });

  it('fails closed when granting clearance fails', async () => {
    mocks.set.mockRejectedValue(new AbuseGuardUnavailableError('network'));
    const response = await guardOfflineDownloadRequest(request('real-proof'));
    expect(response?.status).toBe(503);
  });

  it('fails closed without falling back when the backend is off', async () => {
    mocks.select.mockReturnValue({ kind: 'off' });
    const response = await guardOfflineDownloadRequest(request());
    expect(response?.status).toBe(503);
    expect(mocks.redis).not.toHaveBeenCalled();
  });
});
