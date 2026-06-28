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

function appSessionRequest() {
  return new NextRequest('https://app.test/api/v1/users/me/profile', {
    headers: {
      authorization: 'Bearer ttr_app_token',
    },
    method: 'PATCH',
  });
}

describe('withSessionAuth app-session step-up controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attachSupabaseAuthUser.mockReturnValue({ from: vi.fn() });
    mocks.buildAbuseRiskSubjects.mockReturnValue([]);
    mocks.checkUserSuspension.mockResolvedValue({ suspended: false });
    mocks.createAdminClient.mockResolvedValue({ admin: true });
    mocks.createAppSessionUser.mockReturnValue({
      created_at: '2026-06-26T00:00:00.000Z',
      email: 'user@example.com',
      id: 'user-1',
    });
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(
      NextResponse.json(
        {
          code: 'ABUSE_CHALLENGE_REQUIRED',
          error: 'Forbidden',
          message: 'Additional verification is required before retrying.',
        },
        { status: 403 }
      )
    );
    mocks.extractIPFromHeaders.mockReturnValue('203.0.113.1');
    mocks.getAppSessionTokenFromRequest.mockReturnValue('ttr_app_token');
    mocks.isIPBlocked.mockResolvedValue(null);
    mocks.resolveWebAbuseDecision.mockResolvedValue({
      decisionSource: 'test',
      reasons: [],
      subjectKey: 'session:test',
      subjects: [],
      tier: 'challenge_required',
      trustMultiplier: 1,
    });
    mocks.verifyAppSessionRequest.mockReturnValue({
      claims: {
        origin_app: 'external-app',
        scopes: ['users:profile:write'],
        target_app: 'platform',
      },
      ok: true,
    });
  });

  it('keeps app-session mutation step-up challenges enabled by default', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler, {
      allowAppSessionAuth: { requiredScope: 'users:profile:write' },
      rateLimit: false,
    });

    const response = await route(appSessionRequest());

    expect(response.status).toBe(403);
    expect(mocks.enforceAdaptiveStepUpChallenge).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows scoped server-to-server app-session mutations to skip browser step-up', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler, {
      allowAppSessionAuth: { requiredScope: 'users:profile:write' },
      rateLimit: false,
      skipAppSessionStepUpChallenge: true,
    });

    const response = await route(appSessionRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.enforceAdaptiveStepUpChallenge).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
