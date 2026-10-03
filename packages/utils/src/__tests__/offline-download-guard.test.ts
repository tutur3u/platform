import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  verify: vi.fn(),
  trust: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  redis: vi.fn(),
  limiterRedis: vi.fn(),
  ip: vi.fn(() => '192.0.2.1'),
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    limit(key: string) {
      return mocks.limit(key);
    }
  },
}));
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
  isOfflineCapableRead,
  OFFLINE_DOWNLOAD_HEADER,
} from '../offline-download-guard';

const path = '/api/v1/workspaces/workspace/inventory/products';
function request({
  bulk = false,
  token,
  bearer = 'synthetic-session',
  pathname = path,
  method = 'GET',
}: {
  bulk?: boolean;
  token?: string;
  bearer?: string | null;
  pathname?: string;
  method?: string;
} = {}) {
  return new NextRequest(`https://example.test${pathname}`, {
    method,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(bulk ? { [OFFLINE_DOWNLOAD_HEADER]: '1' } : {}),
      ...(token ? { 'x-tuturuuu-turnstile-token': token } : {}),
    },
  });
}

describe('offline download guards', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OFFLINE_DOWNLOAD_PROTECTION_ENABLED', 'true');
    vi.clearAllMocks();
    mocks.redis.mockResolvedValue({ get: mocks.get, set: mocks.set });
    mocks.limiterRedis.mockResolvedValue({});
    mocks.limit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    mocks.verify.mockResolvedValue(undefined);
    mocks.trust.mockResolvedValue(new Map());
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue('OK');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    '/api/v1/workspaces/ws/wallets',
    '/api/workspaces/ws/transactions/infinite',
    '/api/v1/workspaces/ws/members',
    '/api/v1/users/calendar-settings',
  ])(
    'preserves ordinary reads before protection activation: %s',
    async (pathname) => {
      vi.stubEnv('OFFLINE_DOWNLOAD_PROTECTION_ENABLED', '');
      mocks.redis.mockResolvedValue(null);
      mocks.limiterRedis.mockResolvedValue(null);
      expect(
        await guardOfflineDownloadRequest(request({ pathname }))
      ).toBeNull();
      expect(mocks.redis).not.toHaveBeenCalled();
      expect(mocks.limiterRedis).not.toHaveBeenCalled();
      expect(mocks.limit).not.toHaveBeenCalled();
    }
  );
  it.each(['', 'false', 'TRUE', '1'])(
    'blocks marked bulk downloads until explicit activation: %s',
    async (enabled) => {
      vi.stubEnv('OFFLINE_DOWNLOAD_PROTECTION_ENABLED', enabled);
      const response = await guardOfflineDownloadRequest(
        request({ bulk: true, token: 'captcha' })
      );
      expect(response?.status).toBe(503);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(response?.headers.get('Retry-After')).toBe('30');
      expect(mocks.redis).not.toHaveBeenCalled();
      expect(mocks.limit).not.toHaveBeenCalled();
      expect(mocks.verify).not.toHaveBeenCalled();
    }
  );
  it('does not infer activation from available Redis or account trust', async () => {
    vi.stubEnv('OFFLINE_DOWNLOAD_PROTECTION_ENABLED', 'false');
    mocks.trust.mockImplementation(
      async ([key]) => new Map([[key, { m: 2, verified: true }]])
    );
    expect(
      (await guardOfflineDownloadRequest(request({ bulk: true })))?.status
    ).toBe(503);
    expect(mocks.redis).not.toHaveBeenCalled();
    expect(mocks.trust).not.toHaveBeenCalled();
  });

  for (const pathname of [
    path,
    '/api/workspaces/ws/transactions/infinite',
    '/api/v1/workspaces/ws/task-boards/board/lists',
    '/api/v1/users/me/tasks',
    '/api/v1/workspaces/ws/calendar/events',
    '/api/v1/mobile-calendar/api/v1/workspaces/ws/calendar/events',
    '/api/v1/mobile-calendar/api/v1/users/calendar-settings',
    '/api/v1/workspaces/ws/products',
    '/api/v1/workspaces/ws/habits',
  ]) {
    it(`recognizes protected reads without requiring a client marker: ${pathname}`, () => {
      expect(isOfflineCapableRead(request({ pathname }))).toBe(true);
      expect(isOfflineCapableRead(request({ pathname, method: 'POST' }))).toBe(
        false
      );
    });
  }
  it('leaves unrelated APIs outside the new guard', async () => {
    expect(
      await guardOfflineDownloadRequest(
        request({ pathname: '/api/v1/auth/login', bulk: true })
      )
    ).toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'enforces the same IP and session budget with bulk=%s',
    async (bulk) => {
      expect(
        await guardOfflineDownloadRequest(request({ bulk, token: 'captcha' }))
      ).toBeNull();
      expect(mocks.limit.mock.calls.map(([key]) => key)).toEqual([
        'ip:192.0.2.1',
        'ip:192.0.2.1',
        expect.stringMatching(/^session:/),
        expect.stringMatching(/^session:/),
      ]);
      expect(JSON.stringify(mocks.limit.mock.calls)).not.toContain(
        'synthetic-session'
      );
    }
  );
  it.each([false, true])(
    'rate limits even when the marker is stripped: bulk=%s',
    async (bulk) => {
      mocks.limit.mockResolvedValue({
        success: false,
        reset: Date.now() + 2000,
      });
      const response = await guardOfflineDownloadRequest(
        request({ bulk, token: 'captcha' })
      );
      expect(response?.status).toBe(429);
      expect(Number(response?.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(mocks.verify).not.toHaveBeenCalled();
    }
  );
  it('issues an explicit challenge, not a permission denial', async () => {
    const response = await guardOfflineDownloadRequest(request({ bulk: true }));
    expect(response?.status).toBe(403);
    expect(response?.headers.get('X-Abuse-Challenge')).toBe('turnstile');
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('verifies once and shares session clearance across gateway and owner', async () => {
    const storage = new Map<string, unknown>();
    mocks.get.mockImplementation(async (key) => storage.get(key));
    mocks.set.mockImplementation(async (key, value) => {
      storage.set(key, value);
      return 'OK';
    });
    expect(
      await guardOfflineDownloadRequest(
        request({
          bulk: true,
          token: 'one-use',
          pathname: `/api/v1/mobile-calendar/api/v1/workspaces/ws/calendar/events`,
        })
      )
    ).toBeNull();
    expect(
      await guardOfflineDownloadRequest(
        request({
          bulk: true,
          token: 'one-use',
          pathname: '/api/v1/workspaces/ws/calendar/events',
        })
      )
    ).toBeNull();
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.stringMatching(/^offline:clearance:session:/),
      'passed',
      { ex: 900 }
    );
    expect(
      await guardOfflineDownloadRequest(
        request({ bulk: true, bearer: 'another-session' })
      )?.then((value) => value?.status)
    ).toBe(403);
  });
  it('does not treat a presented header or neutral verified session as elevated trust', async () => {
    mocks.trust.mockImplementation(
      async ([key]) => new Map([[key, { m: 1, verified: true }]])
    );
    expect(
      (await guardOfflineDownloadRequest(request({ bulk: true })))?.status
    ).toBe(403);
  });
  it('uses existing verified elevated trust without changing quotas', async () => {
    mocks.trust.mockImplementation(
      async ([key]) => new Map([[key, { m: 2, verified: true }]])
    );
    expect(
      await guardOfflineDownloadRequest(request({ bulk: true }))
    ).toBeNull();
    expect(mocks.limit).toHaveBeenCalledTimes(4);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('retains the challenge when Turnstile rejects the token', async () => {
    mocks.verify.mockRejectedValue(new Error('invalid'));
    expect(
      (
        await guardOfflineDownloadRequest(
          request({ bulk: true, token: 'invalid' })
        )
      )?.status
    ).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'fails closed when distributed storage is missing: bulk=%s',
    async (bulk) => {
      mocks.redis.mockResolvedValue(null);
      expect(
        (await guardOfflineDownloadRequest(request({ bulk })))?.status
      ).toBe(503);
    }
  );
  it('fails closed on limiter/store errors', async () => {
    mocks.limit.mockRejectedValue(new Error('unavailable'));
    expect((await guardOfflineDownloadRequest(request()))?.status).toBe(503);
  });
  it('keeps authenticated gateway sessions separate when the client IP is absent', async () => {
    mocks.ip.mockReturnValueOnce('unknown');
    expect(await guardOfflineDownloadRequest(request())).toBeNull();
    expect(mocks.limit).toHaveBeenCalledTimes(2);
    expect(
      mocks.limit.mock.calls.every(([key]) =>
        String(key).startsWith('session:')
      )
    ).toBe(true);
  });
  it('fails closed for an unknown anonymous address', async () => {
    mocks.ip.mockReturnValueOnce('unknown');
    expect(
      (await guardOfflineDownloadRequest(request({ bearer: null })))?.status
    ).toBe(503);
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it('guards global exchange rates and accepts Bearer separator whitespace', async () => {
    expect(
      isOfflineCapableRead(request({ pathname: '/api/v1/exchange-rates' }))
    ).toBe(true);
    const input = request();
    input.headers.set('authorization', 'Bearer   synthetic-session');
    expect(await guardOfflineDownloadRequest(input)).toBeNull();
    expect(mocks.limit).toHaveBeenCalledTimes(4);
  });
});
