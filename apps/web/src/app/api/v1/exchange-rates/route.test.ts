import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  attachSupabaseAuthUser: vi.fn(),
  buildAbuseRiskSubjects: vi.fn(),
  checkRateLimit: vi.fn(),
  checkUserSuspension: vi.fn(),
  createAdminClient: vi.fn(),
  createAppSessionUser: vi.fn(),
  createClient: vi.fn(),
  enforceAdaptiveStepUpChallenge: vi.fn(),
  extractIPFromHeaders: vi.fn(),
  getAdaptiveRateLimitConfig: vi.fn(),
  getAppSessionTokenFromRequest: vi.fn(),
  hasAuthenticatedApiSession: vi.fn(),
  isBackendRateLimitError: vi.fn(),
  isIPBlocked: vi.fn(),
  recordApiAuthFailure: vi.fn(),
  recordResponseAbuseSignal: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  resolveWebAbuseDecision: vi.fn(),
  setLogDrainUserContext: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
  verifyAppSessionRequest: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  writeVerifiedSessionCacheForSubjects: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: mocks.attachSupabaseAuthUser,
  createAppSessionUser: mocks.createAppSessionUser,
  getAppSessionTokenFromRequest: mocks.getAppSessionTokenFromRequest,
  verifyAppSessionRequest: mocks.verifyAppSessionRequest,
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_ACCESS_SCOPE: 'cli:access',
  CLI_APP_TARGET_APP: 'cli',
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  buildAbuseRiskSubjects: mocks.buildAbuseRiskSubjects,
  extractIPFromHeaders: mocks.extractIPFromHeaders,
  isIPBlocked: mocks.isIPBlocked,
  recordApiAuthFailure: mocks.recordApiAuthFailure,
}));

vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  cascadeBackendRateLimitToProxyBan: vi.fn(),
  isBackendRateLimitError: mocks.isBackendRateLimitError,
}));

vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  writeVerifiedSessionCacheForSubjects:
    mocks.writeVerifiedSessionCacheForSubjects,
}));

vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: mocks.checkUserSuspension,
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: mocks.validateAiTempAuthRequest,
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  hasAuthenticatedApiSession: mocks.hasAuthenticatedApiSession,
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  MAX_PAYLOAD_SIZE: 1024 * 1024,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

vi.mock('@/lib/abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: mocks.enforceAdaptiveStepUpChallenge,
  getAdaptiveRateLimitConfig: mocks.getAdaptiveRateLimitConfig,
  recordResponseAbuseSignal: mocks.recordResponseAbuseSignal,
  resolveWebAbuseDecision: mocks.resolveWebAbuseDecision,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  setLogDrainUserContext: mocks.setLogDrainUserContext,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('next/server', async (load) => ({
  ...(await load<object>()),
  connection: async () => {},
}));

import { GET } from './route';

const from = vi.fn();
const request = () =>
  new NextRequest('https://finance.test/api/v1/exchange-rates');
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.clearAllMocks();
  query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
  };
  for (const method of ['select', 'eq', 'order', 'limit'])
    query[method]!.mockReturnValue(query);
  query.single!.mockResolvedValue({
    data: { date: '2026-10-03' },
    error: null,
  });
  query.order!.mockImplementation((column: string) =>
    column === 'target_currency'
      ? Promise.resolve({
          data: [
            {
              base_currency: 'USD',
              target_currency: 'VND',
              rate: 25000,
              date: '2026-10-03',
            },
          ],
          error: null,
        })
      : query
  );
  from.mockReturnValue(query);
  mocks.attachSupabaseAuthUser.mockReturnValue({ from });
  mocks.createAdminClient.mockResolvedValue({ from });
  mocks.createClient.mockResolvedValue({ from });
  mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
    user: null,
    authError: null,
  });
  mocks.createAppSessionUser.mockReturnValue({
    id: 'actor-1',
    created_at: '2026-01-01T00:00:00Z',
  });
  mocks.getAppSessionTokenFromRequest.mockReturnValue('ttr_app_synthetic');
  mocks.verifyAppSessionRequest.mockReturnValue({
    ok: true,
    claims: {
      target_app: 'finance',
      origin_app: 'web',
      scopes: ['internal-app:session'],
    },
  });
  mocks.extractIPFromHeaders.mockReturnValue('203.0.113.1');
  mocks.isIPBlocked.mockResolvedValue(null);
  mocks.buildAbuseRiskSubjects.mockReturnValue([]);
  mocks.checkUserSuspension.mockResolvedValue({ suspended: false });
  mocks.resolveWebAbuseDecision.mockResolvedValue({
    decisionSource: 'test',
    reasons: [],
    subjects: [],
    tier: 'normal',
    trustMultiplier: 1,
  });
  mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
});

describe('exchange rates with real session middleware', () => {
  it('reads rates for a verified Finance app session with no Supabase login', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      date: '2026-10-03',
      data: [{ target_currency: 'VND' }],
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.resolveAuthenticatedSessionUser).not.toHaveBeenCalled();
    expect(mocks.verifyAppSessionRequest).toHaveBeenCalled();
  });
  it('rejects an invalid app session before reading rates', async () => {
    mocks.verifyAppSessionRequest.mockReturnValue({ ok: false });
    expect((await GET(request())).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it('retains Supabase JWT authentication', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'jwt-user' },
      authError: null,
    });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it('does not grant anonymous callers a privileged database client', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it('retains the suspension gate for app sessions', async () => {
    mocks.checkUserSuspension.mockResolvedValue({ suspended: true });
    expect((await GET(request())).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});
