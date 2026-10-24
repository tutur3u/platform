// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  blocked: vi.fn(),
  auth: vi.fn(),
  client: vi.fn(),
  rate: vi.fn(),
  cascade: vi.fn(),
  decision: vi.fn(),
  adaptive: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: () => null,
  verifyAppSessionRequest: vi.fn(),
  createAppSessionUser: vi.fn(),
  attachSupabaseAuthUser: vi.fn(),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_ACCESS_SCOPE: 'cli',
  CLI_APP_TARGET_APP: 'cli',
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.auth,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.client,
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: () => '192.0.2.1',
  isIPBlocked: mocks.blocked,
  buildAbuseRiskSubjects: () => [],
  recordApiAuthFailure: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  isBackendRateLimitError: (error: { status?: number } | null) =>
    error?.status === 429,
  cascadeBackendRateLimitToProxyBan: mocks.cascade,
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  writeVerifiedSessionCacheForSubjects: vi.fn(),
}));
vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  hasAuthenticatedApiSession: () => false,
}));
vi.mock('@tuturuuu/utils/constants', () => ({
  MAX_PAYLOAD_SIZE: 1024 * 1024,
  MAX_SHORT_TEXT_LENGTH: 255,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('./abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: vi.fn(),
  getAdaptiveRateLimitConfig: mocks.adaptive,
  recordResponseAbuseSignal: vi.fn(),
  resolveWebAbuseDecision: mocks.decision,
}));
vi.mock('./infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
}));
vi.mock('./rate-limit', () => ({ checkRateLimit: mocks.rate }));

import { forwardCalendarRequest } from '../../../infrastructure/src/lib/mobile-calendar/gateway';
import { GET, PATCH } from '../app/api/v1/users/calendar-settings/route';
import { withSessionAuth } from './api-auth';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.mockResolvedValue(null);
  mocks.client.mockResolvedValue({});
  mocks.auth.mockResolvedValue({
    user: null,
    authError: { status: 429, message: 'synthetic-private-provider-error' },
  });
  mocks.cascade.mockResolvedValue(null);
});

it.each(['ip-already-blocked', 'backend-auth-rate-limit'])(
  'classifies actual personal GET %s without inventing limiter fields',
  async (reason) => {
    if (reason === 'ip-already-blocked') {
      mocks.blocked.mockResolvedValue({
        reason: 'synthetic-private-ban',
        expiresAt: new Date(Date.now() + 60000),
      });
    }
    const response = await GET(
      new NextRequest('https://calendar.test/api/v1/users/calendar-settings'),
      { params: Promise.resolve({}) }
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('x-proxy-block-reason')).toBe(reason);
    expect(response.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-ratelimit-policy')).toBe(
      reason === 'ip-already-blocked'
        ? 'calendar-route-ip-block'
        : 'calendar-auth-provider'
    );
    for (const name of ['window', 'caller-class']) {
      expect(response.headers.get(`x-ratelimit-${name}`)).toBe('unknown');
    }
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(
      JSON.stringify([...response.headers]) + (await response.text())
    ).not.toContain('synthetic-private');
    if (reason === 'ip-already-blocked')
      expect(mocks.auth).not.toHaveBeenCalled();
    else expect(mocks.cascade).toHaveBeenCalledTimes(1);
  }
);

it.each(['ip-already-blocked', 'backend-auth-rate-limit'])(
  'preserves actual Calendar %s classification through the real gateway',
  async (reason) => {
    if (reason === 'ip-already-blocked') {
      mocks.blocked.mockResolvedValue({
        reason: 'synthetic-private-ban',
        expiresAt: new Date(Date.now() + 60000),
      });
    }
    const result = await forwardCalendarRequest(
      new Request(
        'https://infra.test/api/v1/mobile-calendar/api/v1/users/calendar-settings',
        { headers: { Authorization: 'Bearer synthetic-token' } }
      ),
      {
        verifyToken: async () => true,
        loadSecret: async () => 'a'.repeat(43),
        fetch: (async (url) =>
          GET(new NextRequest(String(url)), {
            params: Promise.resolve({}),
          })) as typeof fetch,
      }
    );
    expect(result.status).toBe(429);
    expect(result.headers.get('x-proxy-block-reason')).toBe(reason);
    expect(result.headers.get('retry-after')).toMatch(/^\d+$/);
    for (const name of ['set-cookie', 'x-tuturuuu-calendar-gateway'])
      expect(result.headers.has(name)).toBe(false);
    expect(await result.text()).not.toContain('synthetic-private');
  }
);

vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: async () => ({ suspended: false }),
}));

it('admits one personal preference save despite exhausted shared gateway IP quota', async () => {
  const single = vi
    .fn()
    .mockResolvedValue({ data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null });
  const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), single };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  mocks.client.mockResolvedValue({ from: () => query });
  mocks.auth.mockResolvedValue({
    user: { id: 'legitimate-user' },
    authError: null,
  });
  mocks.rate.mockImplementation(async (key: string) =>
    key.startsWith('session:ip:')
      ? new Response(null, { status: 429 })
      : { allowed: true, headers: {} }
  );
  mocks.decision.mockResolvedValue({});
  mocks.adaptive.mockImplementation((config) => ({ config, decision: {} }));
  // The old route used the default wrapper: another caller's exhausted gateway
  // IP quota rejected this first save before the actor was even authenticated.
  const oldPolicy = withSessionAuth(() => NextResponse.json({ saved: true }));
  const oldResult = await oldPolicy(
    new NextRequest('https://calendar.test/api/v1/users/calendar-settings', {
      method: 'PATCH',
    }),
    { params: Promise.resolve({}) }
  );
  expect(oldResult.status).toBe(429);
  expect(mocks.auth).not.toHaveBeenCalled();
  mocks.rate.mockClear();

  const result = await PATCH(
    new NextRequest('https://calendar.test/api/v1/users/calendar-settings', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer synthetic-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ timezone: 'Asia/Ho_Chi_Minh' }),
    }),
    { params: Promise.resolve({}) }
  );
  expect(result.status).toBe(200);
  expect(mocks.auth).toHaveBeenCalledTimes(1);
  expect(mocks.rate).toHaveBeenCalledExactlyOnceWith(
    'session:user:mutate:legitimate-user',
    { windowMs: 60000, maxRequests: 60 }
  );
  expect(single).toHaveBeenCalledTimes(1);
});

it('still rejects unauthorized saves before invoking the actor quota', async () => {
  mocks.auth.mockResolvedValue({ user: null, authError: null });
  const response = await PATCH(
    new NextRequest('https://calendar.test/api/v1/users/calendar-settings', {
      method: 'PATCH',
    }),
    { params: Promise.resolve({}) }
  );
  expect(response.status).toBe(401);
  expect(mocks.rate).not.toHaveBeenCalled();
});

it('retains the authenticated save quota', async () => {
  mocks.auth.mockResolvedValue({
    user: { id: 'legitimate-user' },
    authError: null,
  });
  mocks.decision.mockResolvedValue({});
  mocks.adaptive.mockImplementation((config) => ({ config, decision: {} }));
  mocks.rate.mockResolvedValue(new Response(null, { status: 429 }));
  const response = await PATCH(
    new NextRequest('https://calendar.test/api/v1/users/calendar-settings', {
      method: 'PATCH',
    }),
    { params: Promise.resolve({}) }
  );
  expect(response.status).toBe(429);
  expect(mocks.rate).toHaveBeenCalledExactlyOnceWith(
    'session:user:mutate:legitimate-user',
    { windowMs: 60000, maxRequests: 60 }
  );
});
