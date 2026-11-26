// @vitest-environment node
vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
vi.mock('../offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
}));

import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedGuestActor } from '../api-proxy-guest-budget';
import { makeRequest } from './api-proxy-test-request';

/**
 * A verified Meet guest gets its own budget under a per-meeting and a
 * per-address cap; everything else stays on the anonymous per-IP budget.
 * The limiter mock keeps real sliding windows so caps are counted, not
 * asserted from call shapes.
 */
const mocks = vi.hoisted(() => ({
  ids: [] as string[],
  windows: new Map<string, number[]>(),
}));

vi.mock('@upstash/ratelimit', () => {
  const DURATION: Record<string, number> = {
    '1 m': 60_000,
    '1 h': 3_600_000,
    '1 d': 86_400_000,
  };
  class MockRatelimit {
    prefix: string;
    max: number;
    span: number;
    static slidingWindow(limit: number, duration: string) {
      return { limit, duration };
    }
    constructor(config: {
      prefix: string;
      limiter: { limit: number; duration: string };
    }) {
      this.prefix = config.prefix;
      this.max = config.limiter.limit;
      this.span = DURATION[config.limiter.duration] ?? 60_000;
    }
    async limit(id: string) {
      mocks.ids.push(id);
      const key = `${this.prefix}|${id}`;
      const now = Date.now();
      const hits = (mocks.windows.get(key) ?? []).filter(
        (at) => at > now - this.span
      );
      const success = hits.length < this.max;
      if (success) hits.push(now);
      mocks.windows.set(key, hits);
      return {
        success,
        limit: this.max,
        remaining: Math.max(0, this.max - hits.length),
        reset: now + this.span,
      };
    }
  }
  return { Ratelimit: MockRatelimit };
});
vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    static fromEnv() {
      return {};
    }
  },
}));
vi.mock('../abuse-protection/edge', () => ({
  extractIPFromRequest: (headers: Headers) =>
    headers.get('x-test-ip') ?? '198.51.100.7',
  isIPBlockedEdge: async () => null,
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: true,
    updatedAt: null,
    updatedBy: null,
  }),
}));
vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: async () => new Map(),
  hasCachedIpBlockAppealRelief: async () => false,
}));
vi.mock('../request-emoji-limit', () => ({
  validateRequestEmojiLimit: async () => null,
}));

const MEETING = '00000000-0000-4000-8000-000000000001';
const SCHOOL_IP = '203.0.113.10';

/** Stands in for the Meet resolver: only the "signed" cookie names a guest. */
async function resolveGuest(req: NextRequest) {
  const cookie = req.headers.get('cookie') ?? '';
  const match = /^signed-guest=([a-z0-9-]+)@([a-z0-9-]+)$/u.exec(cookie);
  return match
    ? ({ guestId: match[1]!, scopeId: match[2]! } as VerifiedGuestActor)
    : null;
}

async function poll(
  options: { guest?: string; meeting?: string; ip?: string } = {}
) {
  const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
  const meeting = options.meeting ?? MEETING;
  return guardApiProxyRequest(
    makeRequest(`/api/meet-call/${meeting}/transcript-consent`, 'GET', {
      'x-test-ip': options.ip ?? SCHOOL_IP,
      ...(options.guest
        ? { cookie: `signed-guest=${options.guest}@${meeting}` }
        : {}),
    }),
    { prefixBase: 'proxy:meet:api', resolveGuestActor: resolveGuest }
  );
}

describe('the verified guest budget at the API proxy guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.ids.length = 0;
    mocks.windows.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('keys a verified guest by meeting and guest, never by the shared IP', async () => {
    expect(await poll({ guest: 'guest-a' })).toBeNull();
    expect(mocks.ids).toContain(`guest:${MEETING}:guest-a`);
    expect(mocks.ids).toContain(`guest-scope:${MEETING}`);
    expect(mocks.ids).toContain(`guest-ip:${SCHOOL_IP}`);
    expect(mocks.ids).not.toContain(`ip:${SCHOOL_IP}`);
  });

  it('keeps two guests on one IP working past the anonymous hourly budget', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 300 reads each in about an hour; the anonymous budget is 240 per hour
    // for the whole address.
    for (let index = 0; index < 300; index++) {
      vi.setSystemTime(Date.UTC(2026, 10, 26, 8) + index * 12_000);
      expect(await poll({ guest: 'guest-a' })).toBeNull();
      expect(await poll({ guest: 'guest-b' })).toBeNull();
    }
    const anonymous = await poll();
    expect(anonymous).toBeNull();
    expect(mocks.ids).toContain(`ip:${SCHOOL_IP}`);
  });

  it('keeps a forged or missing guest credential on the anonymous budget', async () => {
    vi.stubEnv('API_PROXY_ANON_READ_LIMIT_MINUTE', '2');
    const forged = async () => {
      const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
      return guardApiProxyRequest(
        makeRequest(`/api/meet-call/${MEETING}/transcript-consent`, 'GET', {
          'x-test-ip': SCHOOL_IP,
          // A client header and an unsigned cookie name a guest; neither counts.
          'x-meet-guest-id': 'guest-a',
          cookie: `__Host-meet-guest=guest-a.unsigned`,
        }),
        { prefixBase: 'proxy:meet:api', resolveGuestActor: resolveGuest }
      );
    };
    expect(await forged()).toBeNull();
    expect(await forged()).toBeNull();
    const refused = await forged();
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.ids.every((id) => id === `ip:${SCHOOL_IP}`)).toBe(true);
  });

  it('treats a failing resolver as no guest', async () => {
    const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
    const response = await guardApiProxyRequest(
      makeRequest(`/api/meet-call/${MEETING}/polls`, 'GET', {
        'x-test-ip': SCHOOL_IP,
      }),
      {
        prefixBase: 'proxy:meet:api',
        resolveGuestActor: async () => {
          throw new Error('secret unavailable');
        },
      }
    );
    expect(response).toBeNull();
    expect(new Set(mocks.ids)).toEqual(new Set([`ip:${SCHOOL_IP}`]));
  });

  it('holds the per-address guest ceiling for guest sessions from one IP', async () => {
    vi.stubEnv('API_PROXY_GUEST_READ_LIMIT_MINUTE', '3');
    const { GUEST_ADDRESS_MULTIPLIER } = await import(
      '../api-proxy-guest-budget.js'
    );
    // Each guest uses its whole minute; the address carries 40 guests' worth.
    for (let guest = 0; guest < GUEST_ADDRESS_MULTIPLIER; guest++)
      for (let read = 0; read < 3; read++)
        expect(await poll({ guest: `guest-${guest}` })).toBeNull();
    const extra = await poll({ guest: 'minted-guest' });
    expect(extra?.status).toBe(429);
    expect(extra?.headers.get('X-RateLimit-Caller-Class')).toBe('guest');
    // Another address is not affected.
    expect(await poll({ guest: 'minted-guest', ip: '192.0.2.44' })).toBeNull();
  });

  it('holds the per-meeting cap however many guests and addresses join', async () => {
    vi.stubEnv('API_PROXY_GUEST_READ_LIMIT_MINUTE', '2');
    const { GUEST_SCOPE_MULTIPLIER } = await import(
      '../api-proxy-guest-budget.js'
    );
    for (let guest = 0; guest < GUEST_SCOPE_MULTIPLIER; guest++)
      for (let read = 0; read < 2; read++)
        expect(
          await poll({ guest: `guest-${guest}`, ip: `192.0.2.${guest}` })
        ).toBeNull();
    const extra = await poll({ guest: 'minted-guest', ip: '198.51.100.99' });
    expect(extra?.status).toBe(429);
    expect(extra?.headers.get('X-RateLimit-Caller-Class')).toBe('guest');
    // Another meeting keeps its own cap.
    const other = '00000000-0000-4000-8000-000000000002';
    expect(
      await poll({ guest: 'minted-guest', ip: '198.51.100.99', meeting: other })
    ).toBeNull();
  });

  it('reports the guest class when one guest exhausts its own budget', async () => {
    vi.stubEnv('API_PROXY_GUEST_READ_LIMIT_MINUTE', '1');
    expect(await poll({ guest: 'guest-a' })).toBeNull();
    const refused = await poll({ guest: 'guest-a' });
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('X-RateLimit-Caller-Class')).toBe('guest');
    // The other guest on the same address keeps its own budget.
    expect(await poll({ guest: 'guest-b' })).toBeNull();
  });
});
