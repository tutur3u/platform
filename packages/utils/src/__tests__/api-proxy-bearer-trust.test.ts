import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  trust: vi.fn(),
  blocked: vi.fn(),
  prefixes: [] as string[],
}));
vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    constructor(config: { prefix: string }) {
      mocks.prefixes.push(config.prefix);
    }
    limit(key: string) {
      return mocks.limit(key);
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
vi.mock('../abuse-protection/edge', () => ({
  extractIPFromRequest: () => '192.0.2.1',
  isIPBlockedEdge: () => mocks.blocked(),
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: true,
  }),
}));
vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: (keys: string[]) => mocks.trust(keys),
  hasCachedIpBlockAppealRelief: async () => false,
}));
vi.mock('../request-emoji-limit', () => ({
  validateRequestEmojiLimit: async () => null,
}));

// Use the actual server subject builder, rather than a separately invented hash.
import { buildAbuseRiskSubjects } from '../abuse-protection/reputation';

const path = '/api/v1/mobile-calendar/api/v1/users/calendar-settings';
const token = 'synthetic-native-session';
function verifiedKey(value = token) {
  return buildAbuseRiskSubjects({
    headers: { authorization: `Bearer ${value}` },
    userId: 'synthetic-user',
  }).find((subject) => subject.subject_type === 'session')!.subject_key;
}
async function request(authorization = `Bearer ${token}`, cookie?: string) {
  const { guardApiProxyRequest } = await import('../api-proxy-guard');
  return guardApiProxyRequest(
    new NextRequest(`https://infra.test${path}`, {
      headers: { authorization, ...(cookie ? { cookie } : {}) },
    }),
    { prefixBase: 'proxy:infra:api' }
  );
}

describe('native Calendar gateway verified session parity', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
    vi.stubEnv('API_PROXY_EDGE_TRUST_ENABLED', '1');
    mocks.prefixes.length = 0;
    mocks.limit.mockReset().mockResolvedValue({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 30_000,
    });
    mocks.blocked.mockReset().mockResolvedValue(null);
    mocks.trust.mockReset().mockResolvedValue(new Map());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uses exactly the authenticated server key, preserving rate limits and Retry-After', async () => {
    const key = verifiedKey();
    mocks.trust.mockImplementation(async (keys: string[]) => {
      expect(keys).toContain(key);
      expect(JSON.stringify(keys)).not.toContain(token);
      return new Map([[key, { m: 1 }]]);
    });
    const response = await request();
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('Retry-After')).toBe('30');
    expect(mocks.limit).toHaveBeenCalledWith(key);
    expect(mocks.prefixes).toContain(
      'proxy:infra:api:default:authenticated:get:minute'
    );
  });

  it.each([`Bearer forged`, `Bearer ${token}`, 'Bearer malformed token'])(
    'unverified or evicted credentials retain the anonymous IP budget: %s',
    async (header) => {
      const response = await request(header);
      expect(response?.status).toBe(429);
      expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
        'anonymous'
      );
      expect(mocks.limit).toHaveBeenCalledWith('ip:192.0.2.1');
    }
  );

  it('rotated credentials cannot inherit the old session cache entry', async () => {
    mocks.trust.mockResolvedValue(new Map([[verifiedKey(), { m: 1 }]]));
    const response = await request('Bearer rotated-session');
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledWith('ip:192.0.2.1');
  });

  it('uses Bearer precedence even when a different trusted cookie is present', async () => {
    const { buildProxySessionSubjectKey } = await import('../api-proxy-guard');
    const cookieKey = await buildProxySessionSubjectKey(
      'sb-test-auth-token',
      'cookie'
    );
    mocks.trust.mockResolvedValue(new Map([[cookieKey, { m: 1 }]]));
    const response = await request(
      'Bearer forged',
      'sb-test-auth-token=cookie'
    );
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
  });

  it('retains IP blocks even for verified native sessions', async () => {
    mocks.trust.mockResolvedValue(new Map([[verifiedKey(), { m: 1 }]]));
    mocks.blocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
    });
    const response = await request();
    expect(response?.headers.get('X-Proxy-Block-Reason')).toBe(
      'ip-already-blocked'
    );
    expect(mocks.limit).not.toHaveBeenCalled();
  });
});
