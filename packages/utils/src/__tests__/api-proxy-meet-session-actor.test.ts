// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppCoordinationToken } from '../app-coordination-token';

/**
 * Meet room polling (status, consent, polls, quiz) reads `/api/meet-*` through
 * the Meet Worker's proxy guard. A signed-in participant must be limited as
 * their user with the authenticated budget; only verified credentials may
 * leave the strict anonymous per-IP budget. Runs the real assurance check.
 */
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  limit: vi.fn(),
  prefixes: [] as string[],
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('../offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
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

const providerCookie = (accessToken: string, project = 'project') =>
  `sb-${project}-auth-token=base64-${Buffer.from(
    JSON.stringify({ access_token: accessToken })
  ).toString('base64url')}`;

function setupProvider() {
  const getUser = vi.fn(async (token: string) =>
    token === 'eyJmember'
      ? { data: { user: { id: 'member', app_metadata: {} } }, error: null }
      : { data: { user: null }, error: { code: 'bad_jwt' } }
  );
  mocks.admin.mockResolvedValue({
    rpc: async () => ({ data: null, error: null }),
    auth: {
      getUser,
      getClaims: async () => ({ data: null, error: null }),
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, app_metadata: {} } },
        }),
      },
    },
  });
  return { getUser };
}

async function pollMeetRoom(cookie?: string) {
  const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
  return guardApiProxyRequest(
    new NextRequest(
      'https://tuturuuu.com/api/meet-call/00000000-0000-4000-8000-000000000001/transcript-consent',
      { headers: cookie ? { cookie } : {} }
    ),
    { prefixBase: 'proxy:meet:api' }
  );
}

describe('Meet room polling at the API proxy guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-meet-actor-secret');
    mocks.prefixes.length = 0;
    // Every window reports exhausted so the response names the caller class.
    mocks.limit.mockImplementation(async () => ({
      success: false,
      limit: 0,
      remaining: 0,
      reset: Date.now() + 30_000,
    }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('limits a provider-verified Meet participant as their user', async () => {
    const { getUser } = setupProvider();
    const response = await pollMeetRoom(providerCookie('eyJmember'));
    expect(getUser).toHaveBeenCalledWith('eyJmember');
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(mocks.limit).toHaveBeenCalledWith('user:member');
    expect(mocks.limit).not.toHaveBeenCalledWith('ip:192.0.2.1');
  });

  it('limits a signed Meet app session as its user', async () => {
    setupProvider();
    const { token } = createAppCoordinationToken({
      userId: 'member',
      targetApp: 'meet',
    });
    const response = await pollMeetRoom(`tuturuuu_app_session=${token}`);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(mocks.limit).toHaveBeenCalledWith('user:member');
  });

  it('limits a signed web app session as its user on the shared origin', async () => {
    // tuturuuu.com/meet receives the web app-session cookie. The signed token
    // only attributes the request to its own user for rate limiting; it grants
    // no Meet access, which the route's own session check still decides.
    setupProvider();
    const { token } = createAppCoordinationToken({
      userId: 'member',
      targetApp: 'web',
    });
    const response = await pollMeetRoom(`tuturuuu_web_app_session=${token}`);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(mocks.limit).toHaveBeenCalledWith('user:member');
  });

  it('keeps an app session signed with another secret anonymous', async () => {
    setupProvider();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'attacker-secret');
    const { token } = createAppCoordinationToken({
      userId: 'victim',
      targetApp: 'meet',
    });
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-meet-actor-secret');
    const response = await pollMeetRoom(`tuturuuu_app_session=${token}`);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).not.toHaveBeenCalledWith('user:victim');
  });

  it('gives no actor when two credentials name different users', async () => {
    setupProvider();
    const { token } = createAppCoordinationToken({
      userId: 'victim',
      targetApp: 'meet',
    });
    const response = await pollMeetRoom(
      `${providerCookie('eyJmember')}; tuturuuu_app_session=${token}`
    );
    expect(mocks.limit).not.toHaveBeenCalledWith('user:victim');
    expect(mocks.limit).not.toHaveBeenCalledWith('user:member');
    expect(response?.headers.get('X-RateLimit-Caller-Class')).not.toBe(
      'authenticated'
    );
  });

  it('keeps a forged app session on the anonymous per-IP budget', async () => {
    setupProvider();
    const response = await pollMeetRoom(
      'tuturuuu_app_session=ttr_app_forged.signature'
    );
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledWith('ip:192.0.2.1');
    expect(mocks.limit).not.toHaveBeenCalledWith('user:member');
  });

  it('keeps another project cookie on the anonymous per-IP budget', async () => {
    const { getUser } = setupProvider();
    const response = await pollMeetRoom(providerCookie('eyJmember', 'foreign'));
    expect(getUser).not.toHaveBeenCalled();
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledWith('ip:192.0.2.1');
  });

  it('never grants a budget to an undecodable provider cookie', async () => {
    setupProvider();
    const response = await pollMeetRoom('sb-project-auth-token=not-a-session');
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).not.toHaveBeenCalledWith('user:member');
  });

  it('refuses a provider cookie the provider does not recognise', async () => {
    setupProvider();
    const response = await pollMeetRoom(providerCookie('eyJforged'));
    expect(response?.status).toBe(401);
    expect(mocks.limit).not.toHaveBeenCalledWith('user:member');
  });
});
