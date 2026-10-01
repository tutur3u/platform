import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import {
  CLI_APP_TARGET_APP,
  createCliAppSession,
} from '@tuturuuu/auth/cli-session';
import { GET, PUT } from './route';

afterEach(() => vi.unstubAllEnvs());
const actor = '00000000-0000-4000-8000-000000000001';
const from = vi.fn();
describe('Hidden route with real session authentication and signed tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      'APP_COORDINATION_TOKEN_SECRET',
      'synthetic-hidden-route-signing-secret'
    );
    const query = { select: vi.fn(), eq: vi.fn(), like: vi.fn() };
    query.like.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.eq.mockImplementation((key: string) =>
      key === 'value' ? Promise.resolve({ data: [], error: null }) : query
    );
    from.mockReturnValue(query);
    mocks.createAdminClient.mockResolvedValue({ from });
    mocks.buildAbuseRiskSubjects.mockReturnValue([]);
    mocks.extractIPFromHeaders.mockReturnValue('203.0.113.1');
    mocks.isIPBlocked.mockResolvedValue(null);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 100 });
    mocks.checkUserSuspension.mockResolvedValue({ suspended: false });
    mocks.resolveWebAbuseDecision.mockResolvedValue({
      tier: 'normal',
      subjects: [],
      reasons: [],
      trustMultiplier: 1,
    });
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
  });
  it.each(['track', 'rewise', 'tasks', 'meet', 'infra', 'calendar', 'git'])(
    'accepts real %s app session and rewritten web cookie',
    async (targetApp) => {
      const { token } = createAppSessionToken({ userId: actor, targetApp });
      for (const headers of [
        new Headers({ authorization: `Bearer ${token}` }),
        new Headers({ cookie: `tuturuuu_web_app_session=${token}` }),
      ]) {
        const response = await GET(
          new NextRequest(
            `https://app.test/api/v1/users/me/hidden-workspaces?expectedActorId=${actor}`,
            { headers }
          )
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ hiddenWorkspaceIds: [] });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
    }
  );
  it('accepts scoped CLI owner discovery without enabling mutation', async () => {
    const { access } = createCliAppSession({ userId: actor });
    const token = access.token;
    expect(access.claims.target_app).toBe(CLI_APP_TARGET_APP);
    const headers = { authorization: `Bearer ${token}` };
    const response = await GET(
      new NextRequest(
        `https://app.test/api/v1/users/me/hidden-workspaces?expectedActorId=${actor}`,
        { headers }
      )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hiddenWorkspaceIds: [] });
    from.mockClear();
    const mutation = await PUT(
      new NextRequest('https://app.test/api/v1/users/me/hidden-workspaces', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expectedActorId: actor,
          workspaceId: '00000000-0000-4000-8000-000000000010',
          hidden: true,
        }),
      })
    );
    expect(mutation.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it('denies a CLI token lacking the existing CLI access scope', async () => {
    const { token } = createAppSessionToken({
      userId: actor,
      targetApp: CLI_APP_TARGET_APP,
      originApp: 'cli',
    });
    const response = await GET(
      new NextRequest(
        `https://app.test/api/v1/users/me/hidden-workspaces?expectedActorId=${actor}`,
        { headers: { authorization: `Bearer ${token}` } }
      )
    );
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it('rejects a signed unregistered audience before data access', async () => {
    const { token } = createAppSessionToken({
      userId: actor,
      targetApp: 'unregistered-external-app',
    });
    const response = await GET(
      new NextRequest(
        `https://app.test/api/v1/users/me/hidden-workspaces?expectedActorId=${actor}`,
        { headers: { authorization: `Bearer ${token}` } }
      )
    );
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it('rejects expected actor mismatch even for a valid satellite session', async () => {
    const { token } = createAppSessionToken({
      userId: actor,
      targetApp: 'track',
    });
    const response = await GET(
      new NextRequest(
        'https://app.test/api/v1/users/me/hidden-workspaces?expectedActorId=another-actor',
        { headers: { authorization: `Bearer ${token}` } }
      )
    );
    expect(response.status).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });
});
