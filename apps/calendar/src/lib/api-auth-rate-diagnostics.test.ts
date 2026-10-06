// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  blocked: vi.fn(),
  auth: vi.fn(),
  client: vi.fn(),
  rate: vi.fn(),
  cascade: vi.fn(),
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
  getAdaptiveRateLimitConfig: vi.fn(),
  recordResponseAbuseSignal: vi.fn(),
  resolveWebAbuseDecision: vi.fn(),
}));
vi.mock('./infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
}));
vi.mock('./rate-limit', () => ({ checkRateLimit: mocks.rate }));

import { forwardCalendarRequest } from '../../../infrastructure/src/lib/mobile-calendar/gateway';
import { GET } from '../app/api/v1/users/calendar-settings/route';

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
    for (const name of ['policy', 'window', 'caller-class']) {
      expect(response.headers.has(`x-ratelimit-${name}`)).toBe(false);
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
    for (const name of [
      'x-ratelimit-policy',
      'x-ratelimit-window',
      'x-ratelimit-caller-class',
      'set-cookie',
      'x-tuturuuu-calendar-gateway',
    ])
      expect(result.headers.has(name)).toBe(false);
    expect(await result.text()).not.toContain('synthetic-private');
  }
);
