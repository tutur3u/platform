import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  offline: vi.fn(),
  prefixes: [] as string[],
  sessionActor: null as string | null,
}));
vi.mock('../offline-download-guard', () => ({
  guardOfflineDownloadRequest: mocks.offline,
}));
// The assurance check owns credential verification (covered by
// required-mfa-session-actor.test.ts); this suite covers how the guard uses it.
vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async (
    _request: unknown,
    _onBearer: unknown,
    listeners?: { onVerifiedSessionActor?: (userId: string) => void }
  ) => {
    if (mocks.sessionActor)
      listeners?.onVerifiedSessionActor?.(mocks.sessionActor);
    return null;
  },
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
  isIPBlockedEdge: async () => null,
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: true,
  }),
}));
vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: async () => new Map(),
  hasCachedIpBlockAppealRelief: async () => false,
}));
vi.mock('../request-emoji-limit', () => ({
  validateRequestEmojiLimit: async () => null,
}));

async function readHiddenWorkspaces() {
  const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
  return guardApiProxyRequest(
    new NextRequest(
      'https://tuturuuu.com/api/v1/users/me/hidden-workspaces?expectedActorId=member',
      { headers: { cookie: 'sb-project-auth-token=synthetic' } }
    ),
    { prefixBase: 'proxy:web:api' }
  );
}

describe('verified browser sessions at the API proxy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
    mocks.prefixes.length = 0;
    mocks.sessionActor = null;
    mocks.offline.mockReset().mockResolvedValue(null);
    mocks.limit.mockReset().mockImplementation(async () => ({
      success: false,
      limit: 0,
      remaining: 0,
      reset: Date.now() + 30_000,
    }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('limits a verified cookie session as its user with the authenticated users-me budget', async () => {
    mocks.sessionActor = 'member';
    const response = await readHiddenWorkspaces();
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('users-me');
    expect(mocks.limit).toHaveBeenCalledWith('user:member');
    expect(mocks.prefixes).toContain(
      'proxy:web:api:users-me:authenticated:get:minute'
    );
    expect(mocks.prefixes).not.toContain(
      'proxy:web:api:users-me:anonymous:get:minute'
    );
  });

  it('admits a verified session past the anonymous per-IP minute budget', async () => {
    mocks.sessionActor = 'member';
    const counts = new Map<string, number>();
    mocks.limit.mockImplementation(async (key: string) => {
      const used = (counts.get(key) ?? 0) + 1;
      counts.set(key, used);
      return {
        success: used <= 600,
        limit: 600,
        remaining: Math.max(0, 600 - used),
        reset: Date.now() + 30_000,
      };
    });
    for (let index = 0; index < 120; index += 1) {
      expect(await readHiddenWorkspaces()).toBeNull();
    }
    expect(counts.get('ip:192.0.2.1')).toBeUndefined();
  });

  it('keeps an unverified cookie on the strict anonymous per-IP budget', async () => {
    const response = await readHiddenWorkspaces();
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledWith('ip:192.0.2.1');
    expect(mocks.prefixes).toContain(
      'proxy:web:api:users-me:anonymous:get:minute'
    );
  });

  it('returns verified sessions to per-IP keying when the switch is off', async () => {
    vi.stubEnv('API_PROXY_SESSION_ACTOR_ENABLED', '0');
    mocks.sessionActor = 'member';
    const response = await readHiddenWorkspaces();
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledWith('ip:192.0.2.1');
  });

  it('never admits a cookie session actor to the offline-download guard', async () => {
    mocks.sessionActor = 'member';
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 600,
      remaining: 599,
      reset: Date.now() + 30_000,
    });
    expect(await readHiddenWorkspaces()).toBeNull();
    expect(mocks.limit).toHaveBeenCalledWith('user:member');
    expect(mocks.offline).toHaveBeenCalledWith(expect.anything(), {
      verifiedActor: null,
    });
  });
});
