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
import {
  createMobileClientCredential,
  MOBILE_CLIENT_HEADER,
} from './auth/mobile-client-credential';

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
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
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
      preferSupabaseSessionAuth: true,
      rateLimit: false,
      skipAppSessionStepUpChallenge: true,
    });

    const response = await route(appSessionRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.enforceAdaptiveStepUpChallenge).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes stepUpExempt to the app-session path for heuristic challenges', async () => {
    mocks.resolveWebAbuseDecision.mockResolvedValue({
      decisionSource: 'heuristic',
      reasons: ['suspicious_browser_mutation'],
      subjectKey: 'session:test',
      subjects: [],
      tier: 'challenge_required',
      trustMultiplier: 1,
    });
    const stepUpExempt = vi.fn(async () => true);
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler, {
      allowAppSessionAuth: { requiredScope: 'users:profile:write' },
      rateLimit: false,
      stepUpExempt,
    });

    const response = await route(appSessionRequest());

    expect(response.status).toBe(200);
    expect(stepUpExempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' })
    );
    expect(mocks.enforceAdaptiveStepUpChallenge).not.toHaveBeenCalled();
  });

  it('uses the switched cookie account for PATCH instead of a stale app session', async () => {
    const switchedUser = {
      created_at: '2026-06-26T00:00:00.000Z',
      email: 'user-b@example.com',
      id: 'user-b',
    };
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn() } });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: switchedUser,
    });
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    mocks.createAppSessionUser.mockReturnValue({
      created_at: '2026-06-26T00:00:00.000Z',
      email: 'user-a@example.com',
      id: 'user-a',
    });

    const route = withSessionAuth(
      async (_request, { user }) =>
        user.id === 'user-b'
          ? NextResponse.json({ success: true })
          : NextResponse.json(
              { error: 'Notification not found' },
              { status: 404 }
            ),
      {
        allowAppSessionAuth: { targetApp: 'mail' },
        preferSupabaseSessionAuth: true,
        rateLimit: false,
      }
    );
    const response = await route(
      new NextRequest('https://tuturuuu.com/api/v1/notifications/n-1', {
        headers: {
          authorization: 'Bearer stale-user-a-app-session',
          cookie: 'sb-project-auth-token=switched-user-b-session',
        },
        method: 'PATCH',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.verifyAppSessionRequest).not.toHaveBeenCalled();
  });

  it('reads the Supabase session when Chat also sends an app-session marker', async () => {
    const signedInUser = {
      created_at: '2026-06-26T00:00:00.000Z',
      email: 'user-b@example.com',
      id: 'user-b',
    };
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    mocks.createClient.mockImplementation(async (sessionRequest: Request) => {
      const authorization = sessionRequest.headers.get('authorization') ?? '';
      const cookie = sessionRequest.headers.get('cookie') ?? '';
      const isolated =
        authorization.startsWith('Bearer ttr_app_') ||
        cookie
          .split(';')
          .some((part) => part.trim().startsWith('tuturuuu_app_session='));
      return {
        auth: {
          getUser: vi.fn().mockResolvedValue(
            isolated
              ? {
                  data: { user: null },
                  error: { message: 'Auth session missing' },
                }
              : { data: { user: signedInUser }, error: null }
          ),
        },
      };
    });
    mocks.resolveAuthenticatedSessionUser.mockImplementation(
      async (client: {
        auth: {
          getUser: () => Promise<{
            data: { user: typeof signedInUser | null };
            error: { message: string } | null;
          }>;
        };
      }) => {
        const { data, error } = await client.auth.getUser();
        return { authError: error, user: data.user };
      }
    );

    const route = withSessionAuth(
      async (_request, { user }) => NextResponse.json({ userId: user.id }),
      {
        allowAppSessionAuth: { targetApp: 'chat' },
        preferSupabaseSessionAuth: true,
        rateLimit: false,
      }
    );
    const response = await route(
      new NextRequest(
        'https://chat.tuturuuu.com/api/v1/notifications/unread-count',
        {
          headers: {
            authorization: 'Bearer ttr_app_chat-session',
            cookie:
              'tuturuuu_app_session=ttr_app_chat-session; sb-project-auth-token=signed-in',
          },
        }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ userId: 'user-b' });
    expect(mocks.verifyAppSessionRequest).not.toHaveBeenCalled();
    const sessionRequest = mocks.createClient.mock.calls[0]?.[0] as Request;
    expect(sessionRequest.headers.get('authorization')).toBeNull();
    expect(sessionRequest.headers.get('cookie')).toBe(
      'sb-project-auth-token=signed-in'
    );
  });

  it('keeps a present Supabase cookie from falling back to the app session', async () => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Auth session missing' },
        }),
      },
    });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: { message: 'Auth session missing' },
      user: null,
    });

    const route = withSessionAuth(async () => NextResponse.json({ ok: true }), {
      allowAppSessionAuth: { targetApp: 'chat' },
      preferSupabaseSessionAuth: true,
      rateLimit: false,
    });
    const response = await route(
      new NextRequest(
        'https://chat.tuturuuu.com/api/v1/notifications/unread-count',
        {
          headers: {
            authorization: 'Bearer ttr_app_chat-session',
            cookie: 'sb-project-auth-token=stale',
          },
        }
      )
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyAppSessionRequest).not.toHaveBeenCalled();
  });
});

describe('withSessionAuth undetermined client IP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractIPFromHeaders.mockReturnValue('unknown');
    mocks.isIPBlocked.mockResolvedValue(null);
    mocks.hasAuthenticatedApiSession.mockReturnValue(false);
  });

  it('block-checks the shared unknown bucket instead of skipping it', async () => {
    mocks.isIPBlocked.mockResolvedValue({
      blockLevel: 1,
      blockedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      id: 'block-1',
      reason: 'manual',
    });
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler);

    const response = await route(
      new NextRequest('https://app.test/api/v1/test', { method: 'GET' })
    );

    expect(mocks.isIPBlocked).toHaveBeenCalledWith(
      'unknown',
      expect.objectContaining({ source: 'api-auth' })
    );
    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rate-limits the shared unknown bucket for mutations', async () => {
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
    );
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler);

    const response = await route(
      new NextRequest('https://app.test/api/v1/test', { method: 'POST' })
    );

    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      'session:ip:mutate:unknown',
      expect.anything()
    );
    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('withSessionAuth stepUpExempt', () => {
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

  const nativeRequest = (method: string) =>
    new NextRequest('https://tuturuuu.com/api/v1/mastermind/fleet/x', {
      headers: {
        authorization: 'Bearer supabase-access-token',
        'user-agent': 'Dart/3.14 (dart:io)',
      },
      method,
      ...(method === 'POST' ? { body: '{}' } : {}),
    });

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
      // Supabase verification is stubbed above. The real admission still checks
      // the server-signed mobile credential against the token's verified subject.
      const claims = Buffer.from(
        JSON.stringify({
          sub: owner.id,
          session_id: sessionId,
        })
      ).toString('base64url');
      return new NextRequest(
        'https://tuturuuu.com/api/v1/mastermind/fleet/state',
        {
          headers: {
            authorization: `Bearer header.${claims}.signature`,
            ...headers,
          },
        }
      );
    }

    expect((await route(request('native-session', {}))).status).toBe(401);
    expect(
      (
        await route(
          request('native-session', {
            [MOBILE_CLIENT_HEADER]: genericCredential,
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await route(
          request('another-session', {
            [MOBILE_CLIENT_HEADER]: credential,
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await route(
          request('native-session', {
            [MOBILE_CLIENT_HEADER]: credential,
            'sec-fetch-site': 'same-origin',
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await route(
          request('native-session', {
            [MOBILE_CLIENT_HEADER]: credential,
          })
        )
      ).status
    ).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('requires a fresh MFA proof on the dedicated Mastermind bearer', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler, fleetCredentialOptions);
    const now = Math.floor(Date.now() / 1000);
    mocks.getAppSessionTokenFromRequest.mockReturnValue('ttr_app_test');
    mocks.createAppSessionUser.mockReturnValue(owner);
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    const request = new NextRequest(
      'https://tuturuuu.com/api/v1/mastermind/fleet/state',
      {
        headers: { authorization: 'Bearer ttr_app_test' },
      }
    );
    for (const mfa of [
      undefined,
      { sessionId: 'mfa', verifiedAt: now - 86_401 },
    ]) {
      mocks.verifyAppSessionRequest.mockReturnValue({
        ok: true,
        claims: { mfa },
      });
      expect((await route(request)).status).toBe(403);
    }
    mocks.verifyAppSessionRequest.mockReturnValue({
      ok: true,
      claims: { mfa: { sessionId: 'mfa', verifiedAt: now - 1 } },
    });
    expect((await route(request)).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets an exempt user skip a challenged mutation', async () => {
    const stepUpExempt = vi.fn(async () => true);
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler, { rateLimit: false, stepUpExempt });

    const response = await route(nativeRequest('POST'));

    expect(response.status).toBe(200);
    expect(stepUpExempt).toHaveBeenCalledWith(owner);
    expect(mocks.enforceAdaptiveStepUpChallenge).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps the challenge for users the predicate refuses or that throw', async () => {
    for (const stepUpExempt of [
      vi.fn(async () => false),
      vi.fn(async () => {
        throw new Error('permission lookup failed');
      }),
    ]) {
      const handler = vi.fn(() => NextResponse.json({ ok: true }));
      const route = withSessionAuth(handler, {
        rateLimit: false,
        stepUpExempt,
      });

      const response = await route(nativeRequest('POST'));

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('does not consult the predicate when nothing would be challenged', async () => {
    mocks.resolveWebAbuseDecision.mockResolvedValue({
      decisionSource: 'default',
      reasons: [],
      subjectKey: null,
      subjects: [],
      tier: 'standard',
      trustMultiplier: 1,
    });
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    const stepUpExempt = vi.fn(async () => true);
    const route = withSessionAuth(() => NextResponse.json({ ok: true }), {
      rateLimit: false,
      stepUpExempt,
    });

    expect((await route(nativeRequest('POST'))).status).toBe(200);
    expect((await route(nativeRequest('GET'))).status).toBe(200);
    expect(stepUpExempt).not.toHaveBeenCalled();
  });

  it('never consults the predicate on a challenged read', async () => {
    mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    const stepUpExempt = vi.fn(async () => true);
    const route = withSessionAuth(() => NextResponse.json({ ok: true }), {
      rateLimit: false,
      stepUpExempt,
    });

    expect((await route(nativeRequest('GET'))).status).toBe(200);
    expect(stepUpExempt).not.toHaveBeenCalled();
  });

  it('keeps a server reputation challenge even for an exempt user', async () => {
    mocks.resolveWebAbuseDecision.mockResolvedValue({
      decisionSource: 'server',
      reasons: [
        'server_reputation_challenge_required',
        'suspicious_browser_mutation',
      ],
      subjectKey: 'session:test',
      subjects: [],
      tier: 'challenge_required',
      trustMultiplier: 1,
    });
    const stepUpExempt = vi.fn(async () => true);
    const route = withSessionAuth(() => NextResponse.json({ ok: true }), {
      rateLimit: false,
      stepUpExempt,
    });

    expect((await route(nativeRequest('POST'))).status).toBe(403);
    expect(stepUpExempt).not.toHaveBeenCalled();
  });

  it('keeps the challenge when the predicate throws synchronously', async () => {
    const route = withSessionAuth(() => NextResponse.json({ ok: true }), {
      rateLimit: false,
      stepUpExempt: (() => {
        throw new Error('sync failure');
      }) as never,
    });

    expect((await route(nativeRequest('POST'))).status).toBe(403);
  });

  it('still applies the rate limit to an exempt user', async () => {
    mocks.getAdaptiveRateLimitConfig.mockReturnValue({
      config: { maxRequests: 30, windowMs: 60_000 },
      decision: {},
    });
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
    );
    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const route = withSessionAuth(handler, {
      rateLimit: { maxRequests: 30, windowMs: 60_000 },
      stepUpExempt: async () => true,
    });

    expect((await route(nativeRequest('POST'))).status).toBe(429);
    expect(mocks.enforceAdaptiveStepUpChallenge).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
