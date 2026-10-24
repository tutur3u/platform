// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarPreferenceGuardOptions } from './calendar-preference-guard';

const mocks = vi.hoisted(() => ({
  trust: vi.fn(),
  getUser: vi.fn(),
  assurance: vi.fn(),
  blocked: vi.fn(),
  buckets: new Map<string, number>(),
}));
vi.mock('@tuturuuu/utils/offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
}));
vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: (...args: unknown[]) => mocks.assurance(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ auth: { getUser: mocks.getUser } }),
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

const personal = '/api/v1/users/calendar-settings';
const workspace = '/api/v1/workspaces/synthetic-ws/calendar-settings';
async function request(
  pathname = personal,
  token = 'eyJvalid',
  useActor = true,
  method = 'GET'
) {
  const { guardApiProxyRequest } = await import(
    '@tuturuuu/utils/api-proxy-guard'
  );
  const req = new NextRequest(`https://tuturuuu.com${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'x-user-id': 'forged-actor' },
  });
  return guardApiProxyRequest(req, {
    ...calendarPreferenceGuardOptions(req),
    useVerifiedBearerActor: useActor,
  });
}

describe('cold-cache native preference reads', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
    vi.stubEnv('API_PROXY_EDGE_TRUST_ENABLED', '1');
    mocks.buckets.clear();
    mocks.blocked.mockReset().mockResolvedValue(null);
    mocks.trust.mockReset().mockResolvedValue(new Map());
    mocks.assurance.mockReset().mockResolvedValue({ status: 'allowed' });
    mocks.getUser.mockReset().mockImplementation(async (token: string) => ({
      data: {
        user:
          token === 'eyJforged'
            ? null
            : { id: token === 'eyJother' ? 'other-actor' : 'actor' },
      },
      error: token === 'eyJforged' ? { status: 401 } : null,
    }));
  });
  afterEach(() => vi.unstubAllEnvs());

  function exhaustSharedIp() {
    mocks.buckets.set(
      'proxy:web:calendar-preferences:default:anonymous:get:minute:ip:192.0.2.1',
      60
    );
  }

  it('reproduces the old first-open rejection despite successful bearer/MFA verification', async () => {
    exhaustSharedIp();
    const response = await request(personal, 'eyJvalid', false);
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.getUser).toHaveBeenCalledWith('eyJvalid');
    expect(mocks.assurance).toHaveBeenCalledTimes(1);
  });

  it('admits exactly the two initial Settings reads with a cold cache and exhausted shared IP', async () => {
    exhaustSharedIp();
    const personalResponse = await request(personal);
    expect(personalResponse?.status ?? 200).toBe(200);
    expect(personalResponse).toBeNull();
    expect(await request(workspace)).toBeNull();
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(
      mocks.buckets.get(
        'proxy:web:calendar-preferences:default:authenticated:get:minute:user:actor'
      )
    ).toBe(2);
    expect(
      mocks.buckets.get(
        'proxy:web:calendar-preferences:default:anonymous:get:minute:ip:192.0.2.1'
      )
    ).toBe(60);
  });

  it('does not elevate forged bearer credentials or trust a supplied actor header', async () => {
    const response = await request(personal, 'eyJforged');
    expect(response?.status).toBe(401);
    expect(mocks.buckets.size).toBe(0);
  });

  it('retains the anonymous IP cap when no supported bearer identity verifies', async () => {
    exhaustSharedIp();
    expect((await request(personal, 'forged'))?.status).toBe(429);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('shares actor quotas across token rotation while isolating other actors', async () => {
    mocks.buckets.set(
      'proxy:web:calendar-preferences:default:authenticated:get:minute:user:actor',
      600
    );
    const response = await request(personal, 'eyJrotated');
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('600');
    expect(response?.headers.get('X-RateLimit-Window')).toBe('minute');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe(
      'native-calendar-preferences'
    );
    expect(response?.headers.get('Retry-After')).toBe('30');
    expect(await request(personal, 'eyJother')).toBeNull();
  });

  it('still rejects a verified actor blocked by IP policy', async () => {
    mocks.blocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await request())?.headers.get('X-Proxy-Block-Reason')).toBe(
      'ip-already-blocked'
    );
    expect(mocks.buckets.size).toBe(0);
  });

  it('does not use verified identity to bypass required MFA', async () => {
    mocks.assurance.mockResolvedValue({ status: 'required' });
    expect((await request())?.status).toBe(403);
    expect(mocks.buckets.size).toBe(0);
  });
  it('isolates cold verified challenge issuance from generic, preferences and shared-IP mutation exhaustion', async () => {
    mocks.buckets.set(
      'proxy:web:api:default:anonymous:mutate:minute:ip:192.0.2.1',
      30
    );
    mocks.buckets.set(
      'proxy:web:calendar-preferences:default:authenticated:mutate:minute:user:actor',
      60
    );
    mocks.buckets.set(
      'proxy:web:native-integrity:default:anonymous:mutate:minute:ip:192.0.2.1',
      30
    );
    expect(
      await request(
        '/api/v1/native-integrity/challenge',
        'eyJvalid',
        true,
        'POST'
      )
    ).toBeNull();
    expect(
      await request('/api/v1/native-integrity/enroll', 'eyJother', true, 'POST')
    ).toBeNull();
    expect(
      mocks.buckets.get(
        'proxy:web:native-integrity:default:authenticated:mutate:minute:user:actor'
      )
    ).toBe(1);
    expect(
      mocks.buckets.get(
        'proxy:web:native-integrity:default:authenticated:mutate:minute:user:other-actor'
      )
    ).toBe(1);
    expect(
      mocks.buckets.get(
        'proxy:web:native-integrity:default:anonymous:mutate:minute:ip:192.0.2.1'
      )
    ).toBe(30);
    expect(
      mocks.buckets.get(
        'proxy:web:api:default:anonymous:mutate:minute:ip:192.0.2.1'
      )
    ).toBe(30);
    expect(
      mocks.buckets.get(
        'proxy:web:calendar-preferences:default:authenticated:mutate:minute:user:actor'
      )
    ).toBe(60);
    expect(mocks.assurance).toHaveBeenCalledTimes(2);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
  it('shares proof quotas across enrollment and issuance while preserving actor isolation and diagnostic headers', async () => {
    mocks.buckets.set(
      'proxy:web:native-integrity:default:authenticated:mutate:minute:user:actor',
      60
    );
    const denial = await request(
      '/api/v1/native-integrity/challenge',
      'eyJvalid',
      true,
      'POST'
    );
    expect(denial?.status).toBe(429);
    expect(denial?.headers.get('X-RateLimit-Policy')).toBe(
      'native-integrity-challenge'
    );
    expect(denial?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(denial?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(denial?.headers.get('X-RateLimit-Window')).toBe('minute');
    expect(denial?.headers.get('Retry-After')).toBe('30');
    expect(
      (
        await request(
          '/api/v1/native-integrity/enroll',
          'eyJrotated',
          true,
          'POST'
        )
      )?.status
    ).toBe(429);
    expect(
      await request(
        '/api/v1/native-integrity/challenge',
        'eyJother',
        true,
        'POST'
      )
    ).toBeNull();
  });
  it('retains anonymous proof issuance quotas and persistent IP blocks', async () => {
    mocks.buckets.set(
      'proxy:web:native-integrity:default:anonymous:mutate:minute:ip:192.0.2.1',
      30
    );
    const anonymous = await request(
      '/api/v1/native-integrity/challenge',
      'forged',
      true,
      'POST'
    );
    expect(anonymous?.status).toBe(429);
    expect(anonymous?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'anonymous'
    );
    mocks.blocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
    });
    const blocked = await request(
      '/api/v1/native-integrity/enroll',
      'eyJvalid',
      true,
      'POST'
    );
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('X-RateLimit-Policy')).toBe('proxy-ip-block');
  });
});
