import { NextRequest, NextResponse } from 'next/server';
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
  hasSupportedSupabaseAuthCookie: vi.fn(),
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
  APP_SESSION_COOKIE_NAME: 'tuturuuu_app_session',
  attachSupabaseAuthUser: mocks.attachSupabaseAuthUser,
  createAppSessionUser: mocks.createAppSessionUser,
  getAppSessionTokenFromRequest: mocks.getAppSessionTokenFromRequest,
  hasSupportedSupabaseAuthCookie: mocks.hasSupportedSupabaseAuthCookie,
  verifyAppSessionRequestWithToken: mocks.verifyAppSessionRequest,
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

vi.mock('./abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: mocks.enforceAdaptiveStepUpChallenge,
  getAdaptiveRateLimitConfig: mocks.getAdaptiveRateLimitConfig,
  recordResponseAbuseSignal: mocks.recordResponseAbuseSignal,
  resolveWebAbuseDecision: mocks.resolveWebAbuseDecision,
}));

vi.mock('./infrastructure/log-drain', () => ({
  setLogDrainUserContext: mocks.setLogDrainUserContext,
}));

vi.mock('./rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

import { withSessionAuth } from './api-auth';
import {
  createMobileClientCredential,
  MOBILE_CLIENT_HEADER,
} from './auth/mobile-client-credential';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx (Fleet client authorization)
describe('withSessionAuth Mastermind fleet credentials', () => {
  const owner = {
    created_at: '2026-01-01T00:00:00.000Z',
    email: 'owner@example.com',
    id: 'owner-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildAbuseRiskSubjects.mockReturnValue([]);
    mocks.checkUserSuspension.mockResolvedValue({ suspended: false });
    mocks.extractIPFromHeaders.mockReturnValue('203.0.113.1');
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.isIPBlocked.mockResolvedValue(null);
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn() } });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: owner,
    });
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(
      NextResponse.json({ code: 'ABUSE_CHALLENGE_REQUIRED' }, { status: 403 })
    );
    mocks.resolveWebAbuseDecision.mockResolvedValue({
      decisionSource: 'heuristic',
      reasons: ['suspicious_browser_mutation'],
      subjectKey: 'session:test',
      subjects: [],
      tier: 'challenge_required',
      trustMultiplier: 1,
    });
  });

  const fleetStateUrl = 'https://tuturuuu.com/api/v1/mastermind/fleet/state';
  const fleetCredentialOptions = {
    rateLimit: false,
    allowAppSessionAuth: {
      targetApp: 'mastermind',
      requiredScope: 'internal-app:session',
    },
    requireMastermindMobileSessionForSupabase: true,
    appSessionMfaMaxAgeSeconds: 86_400,
  } as const;

  it.each([
    ['GET', '/state'],
    ['POST', '/decisions/decision-1/answer'],
  ])(
    'refuses the Web owner cookie before the fleet handler (%s %s)',
    async (method, path) => {
      const handler = vi.fn(() => NextResponse.json({ ok: true }));
      const route = withSessionAuth(handler, fleetCredentialOptions);
      const response = await route(
        new NextRequest(`https://tuturuuu.com/api/v1/mastermind/fleet${path}`, {
          method,
          headers: {
            cookie: 'sb-project-auth-token=web-session',
            'sec-fetch-site': 'same-origin',
          },
        })
      );
      expect(response.status).toBe(401);
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it('evaluates a native-session requirement function on every request', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    let required = false;
    const route = withSessionAuth(handler, {
      ...fleetCredentialOptions,
      requireMastermindMobileSessionForSupabase: () => required,
    });
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    const webCookie = () =>
      new NextRequest(fleetStateUrl, {
        headers: {
          cookie: 'sb-project-auth-token=web-session',
          'sec-fetch-site': 'same-origin',
        },
      });
    // Held: the earlier Supabase session admission still applies.
    expect((await route(webCookie())).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    required = true;
    mocks.createClient.mockClear();
    expect((await route(webCookie())).status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('binds mobile Fleet access to the verified bearer session', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler, fleetCredentialOptions);
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    const binding = { userId: owner.id, sessionId: 'native-session' };
    const genericCredential = createMobileClientCredential(binding).token;
    const credential = createMobileClientCredential({
      ...binding,
      mastermindSession: true,
    }).token;

    function request(sessionId: string, headers: Record<string, string>) {
      const claims = { sub: owner.id, session_id: sessionId };
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
      return new NextRequest(fleetStateUrl, {
        headers: {
          authorization: `Bearer header.${payload}.signature`,
          ...headers,
        },
      });
    }

    for (const [session, headers] of [
      ['native-session', {}],
      ['native-session', { [MOBILE_CLIENT_HEADER]: genericCredential }],
      ['another-session', { [MOBILE_CLIENT_HEADER]: credential }],
      [
        'native-session',
        { [MOBILE_CLIENT_HEADER]: credential, 'sec-fetch-site': 'same-origin' },
      ],
    ] as const)
      expect((await route(request(session, headers))).status).toBe(401);
    const admitted = request('native-session', {
      [MOBILE_CLIENT_HEADER]: credential,
    });
    expect((await route(admitted)).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('requires a fresh MFA proof on the dedicated Mastermind bearer', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler, fleetCredentialOptions);
    const now = Math.floor(Date.now() / 1000);
    mocks.getAppSessionTokenFromRequest.mockReturnValue('ttr_app_test');
    mocks.createAppSessionUser.mockReturnValue(owner);
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    const request = new NextRequest(fleetStateUrl, {
      headers: { authorization: 'Bearer ttr_app_test' },
    });
    const select = (verifiedAt?: number) =>
      mocks.verifyAppSessionRequest.mockReturnValue({
        ok: true,
        claims: {
          scopes: ['internal-app:session'],
          target_app: 'mastermind',
          mfa:
            verifiedAt === undefined
              ? undefined
              : { sessionId: 'mfa', verifiedAt },
        },
        token: 'ttr_app_admitted',
      });
    select();
    expect((await route(request)).status).toBe(403);
    select(now - 86_401);
    expect((await route(request)).status).toBe(403);
    select(now - 1);
    expect((await route(request)).status).toBe(200);
    expect(handler).toHaveBeenCalledExactlyOnceWith(
      request,
      expect.objectContaining({ appSessionToken: 'ttr_app_admitted' }),
      {}
    );
  });
});
