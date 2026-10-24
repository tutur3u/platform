import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarPreferenceGuardOptions } from './calendar-preference-guard';

const mocks = vi.hoisted(() => ({
  trust: vi.fn(),
  blocked: vi.fn(),
  buckets: new Map<string, number>(),
}));
vi.mock('@tuturuuu/utils/offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow(limit: number) {
      return { limit };
    }
    constructor(
      private config: { prefix: string; limiter: { limit: number } }
    ) {}
    limit(key: string) {
      const bucket = `${this.config.prefix}:${key}`;
      const count = (mocks.buckets.get(bucket) ?? 0) + 1;
      mocks.buckets.set(bucket, count);
      return Promise.resolve({
        success: count <= this.config.limiter.limit,
        limit: this.config.limiter.limit,
        remaining: Math.max(0, this.config.limiter.limit - count),
        reset: Date.now() + 30_000,
      });
    }
  },
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    static fromEnv() {
      return {};
    }
  },
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  extractIPFromRequest: () => '192.0.2.1',
  isIPBlockedEdge: () => mocks.blocked(),
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: true,
  }),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: (keys: string[]) => mocks.trust(keys),
  hasCachedIpBlockAppealRelief: async () => false,
}));
vi.mock('@tuturuuu/utils/request-emoji-limit', () => ({
  validateRequestEmojiLimit: async () => null,
}));

// Use the actual server subject builder, rather than a separately invented hash.
import { buildAbuseRiskSubjects } from '@tuturuuu/utils/abuse-protection/reputation';

const path = '/api/v1/users/calendar-settings';
const token = 'synthetic-native-session';
function verifiedKey(value = token) {
  return buildAbuseRiskSubjects({
    headers: { authorization: `Bearer ${value}` },
    userId: 'synthetic-user',
  }).find((subject) => subject.subject_type === 'session')!.subject_key;
}
async function request(pathname: string) {
  const { guardApiProxyRequest } = await import(
    '@tuturuuu/utils/api-proxy-guard'
  );
  const req = new NextRequest(`https://tuturuuu.com${pathname}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ timezone: 'Asia/Ho_Chi_Minh' }),
  });
  return guardApiProxyRequest(req, {
    ...calendarPreferenceGuardOptions(req),
  });
}

describe('Calendar preference mutation budget', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
    vi.stubEnv('API_PROXY_EDGE_TRUST_ENABLED', '1');
    mocks.buckets.clear();
    mocks.blocked.mockReset().mockResolvedValue(null);
    mocks.trust.mockReset().mockResolvedValue(new Map());
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([path, '/api/v1/workspaces/synthetic-ws/calendar-settings'])(
    'admits one save after unrelated mutations exhaust their budget: %s',
    async (pathname) => {
      const key = verifiedKey();
      mocks.trust.mockResolvedValue(new Map([[key, { m: 1, verified: true }]]));
      const unrelated = '/api/v1/calendar/connections';
      for (let i = 0; i < 60; i++) expect(await request(unrelated)).toBeNull();
      expect((await request(unrelated))?.status).toBe(429);
      expect(await request(pathname)).toBeNull();
    }
  );

  it('retains the same bounded quota shared by personal and workspace saves', async () => {
    const key = verifiedKey();
    mocks.trust.mockResolvedValue(new Map([[key, { m: 1, verified: true }]]));
    for (let i = 0; i < 60; i++) expect(await request(path)).toBeNull();
    const response = await request(
      '/api/v1/workspaces/synthetic-ws/calendar-settings'
    );
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(response?.headers.get('X-RateLimit-Window')).toBe('minute');
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('Retry-After')).toBe('30');
  });

  it('retains anonymous IP quotas for unverified bearer tokens', async () => {
    for (let i = 0; i < 30; i++) expect(await request(path)).toBeNull();
    const response = await request(path);
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
  });

  it('retains IP blocks for preference saves', async () => {
    mocks.blocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
    });
    const response = await request(path);
    expect(response?.headers.get('X-Proxy-Block-Reason')).toBe(
      'ip-already-blocked'
    );
    expect(mocks.buckets.size).toBe(0);
  });
});
