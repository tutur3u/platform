import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
} from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { type NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockGetClaims = vi.fn();
const mockAdminClient = { from: vi.fn() } as { auth?: unknown; from: unknown };
const mockCreateClient = vi.fn((..._args: unknown[]) => ({
  auth: { getClaims: mockGetClaims, getUser: mockGetUser },
}));
const mockCreateAdminClient = vi.fn((..._args: unknown[]) => mockAdminClient);

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockExtractIP = vi.fn().mockReturnValue('192.168.1.1');
const mockIsIPBlocked = vi.fn().mockResolvedValue(null);
const mockRecordAuthFailure = vi.fn();
const mockCascadeBackendRateLimit = vi.fn();
const mockIsBackendRateLimitError = vi.fn();

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: (h: unknown) => mockExtractIP(h),
  isIPBlocked: (ip: unknown) => mockIsIPBlocked(ip),
  recordApiAuthFailure: (ip: unknown, endpoint: unknown) =>
    mockRecordAuthFailure(ip, endpoint),
}));

vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  cascadeBackendRateLimitToProxyBan: (
    ...args: Parameters<typeof mockCascadeBackendRateLimit>
  ) => mockCascadeBackendRateLimit(...args),
  isBackendRateLimitError: (
    ...args: Parameters<typeof mockIsBackendRateLimitError>
  ) => mockIsBackendRateLimitError(...args),
}));

const mockHasAuthenticatedApiSession = vi.fn().mockReturnValue(false);

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  hasAuthenticatedApiSession: (request: unknown) =>
    mockHasAuthenticatedApiSession(request),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: vi.fn(),
}));

const mockCheckRateLimit = vi
  .fn()
  .mockResolvedValue({ allowed: true, headers: {} });

vi.mock('../lib/rate-limit', () => ({
  checkRateLimit: (key: unknown, config: unknown) =>
    mockCheckRateLimit(key, config),
}));

const mockResolveWebAbuseDecision = vi.fn();
const mockEnforceAdaptiveStepUpChallenge = vi.fn();
const mockGetAdaptiveRateLimitConfig = vi.fn();
const mockRecordResponseAbuseSignal = vi.fn();

vi.mock('../lib/abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: (input: unknown) =>
    mockEnforceAdaptiveStepUpChallenge(input),
  getAdaptiveRateLimitConfig: (config: unknown, decision: unknown) =>
    mockGetAdaptiveRateLimitConfig(config, decision),
  recordResponseAbuseSignal: (input: unknown) =>
    mockRecordResponseAbuseSignal(input),
  resolveWebAbuseDecision: (input: unknown) =>
    mockResolveWebAbuseDecision(input),
}));

const mockCheckSuspension = vi.fn().mockResolvedValue({ suspended: false });

vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: (userId: unknown) => mockCheckSuspension(userId),
}));

const mockValidateAiTempAuthRequest = vi
  .fn()
  .mockResolvedValue({ status: 'missing' });

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: (request: unknown) =>
    mockValidateAiTempAuthRequest(request),
}));

import { CURRENT_USER_APP_SESSION_AUTH } from '../app/api/v1/users/me/session-auth';
// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import {
  getDefaultAppSessionVerificationOptions,
  resolveSessionAuthContext,
  type SessionAuthContext,
  withSessionAuth,
} from '../lib/api-auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url = 'http://localhost:3000/api/test'
): NextRequest {
  return new Request(url, { method }) as unknown as NextRequest;
}

const fakeUser = { id: 'user-123', email: 'test@test.com' };
const fakeClaims = {
  app_metadata: {},
  aud: 'authenticated',
  email: fakeUser.email,
  iat: 1_700_000_000,
  role: 'authenticated',
  sub: fakeUser.id,
  user_metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('withSessionAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete mockAdminClient.auth;
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mockGetClaims.mockResolvedValue({
      data: { claims: fakeClaims },
      error: null,
    });
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockIsIPBlocked.mockResolvedValue(null);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, headers: {} });
    mockCheckSuspension.mockResolvedValue({ suspended: false });
    mockHasAuthenticatedApiSession.mockReturnValue(false);
    mockCascadeBackendRateLimit.mockResolvedValue(null);
    mockIsBackendRateLimitError.mockReturnValue(false);
    mockValidateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
    mockResolveWebAbuseDecision.mockResolvedValue({
      confidenceScore: 10,
      decisionSource: 'default',
      reasons: [],
      riskScore: 50,
      subjectKey: 'user:user-123',
      subjects: [{ subject_key: 'user:user-123', subject_type: 'user' }],
      tier: 'standard',
      trustMultiplier: 1,
    });
    mockEnforceAdaptiveStepUpChallenge.mockResolvedValue(null);
    mockGetAdaptiveRateLimitConfig.mockImplementation((config, decision) => ({
      config,
      decision: {
        ...(typeof decision === 'object' && decision ? decision : {}),
        adjustedMaxRequests:
          typeof config === 'object' &&
          config !== null &&
          'maxRequests' in config
            ? Number(config.maxRequests)
            : 0,
      },
    }));
    mockRecordResponseAbuseSignal.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Happy path ----

  it('should call handler with user and supabase on success', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({ ok: true }));

    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ id: fakeUser.id }),
      })
    );
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it('should fall back to getUser when session claims are unavailable', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: null },
      error: new Error('claims unavailable'),
    });
    const handler = vi.fn().mockReturnValue(NextResponse.json({ ok: true }));

    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(200);
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ user: fakeUser }),
      {}
    );
  });

  // ---- IP block ----

  it('should return 429 when IP is blocked', async () => {
    mockIsIPBlocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60000),
      reason: 'abuse',
    });

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error).toBe('Too Many Requests');

    // Should have Retry-After header
    expect(response.headers.get('Retry-After')).toBeTruthy();
  });

  it('should ignore api_abuse IP blocks for authenticated session requests', async () => {
    mockHasAuthenticatedApiSession.mockReturnValue(true);
    mockIsIPBlocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60000),
      reason: 'api_abuse',
    });

    const handler = vi.fn().mockReturnValue(NextResponse.json({ ok: true }));
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should keep non-api_abuse IP blocks for authenticated session requests', async () => {
    mockHasAuthenticatedApiSession.mockReturnValue(true);
    mockIsIPBlocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60000),
      reason: 'password_login_failed',
    });

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  // ---- Rate limiting ----

  it('should return rate limit response when rate limit is exceeded', async () => {
    const rateLimitResponse = NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': '10' } }
    );
    mockCheckRateLimit.mockResolvedValue(rateLimitResponse);

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    // Auth should never have been called
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('should escalate backend auth 429 responses into a proxy-visible IP block', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: null },
      error: new Error('claims unavailable'),
    });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { status: 429, code: 'over_request_rate_limit' },
    });
    mockIsBackendRateLimitError.mockReturnValue(true);
    mockCascadeBackendRateLimit.mockResolvedValue({
      expiresAt: new Date(Date.now() + 300_000),
    });

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    expect(mockCascadeBackendRateLimit).toHaveBeenCalledWith({
      endpoint: '/api/test',
      ipAddress: '192.168.1.1',
      source: 'auth',
    });
    expect(mockRecordAuthFailure).not.toHaveBeenCalled();
    expect(response.headers.get('Retry-After')).toBe('300');
  });

  it('should skip default read rate limiting for GET requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('GET'));

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('should skip default read rate limiting for HEAD requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('HEAD'));

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('should skip default rate limiting for read-only POST requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler, { rateLimitKind: 'read' });
    await wrapped(makeRequest('POST'));

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('should use read key for read-only POST requests with a custom rate limit', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const customConfig = { windowMs: 30000, maxRequests: 99 };
    const wrapped = withSessionAuth(handler, {
      rateLimitKind: 'read',
      rateLimit: customConfig,
    });

    await wrapped(makeRequest('POST'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('read'),
      customConfig
    );
  });

  it('should use mutate key for POST requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('POST'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('mutate'),
      expect.objectContaining({ maxRequests: 60 })
    );
  });

  it('should enforce adaptive step-up before calling the handler', async () => {
    mockEnforceAdaptiveStepUpChallenge.mockResolvedValue(
      NextResponse.json(
        { code: 'ABUSE_CHALLENGE_REQUIRED', error: 'Forbidden' },
        { status: 403 }
      )
    );
    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(mockResolveWebAbuseDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        authKind: 'session',
        isRead: false,
        userId: fakeUser.id,
      })
    );
  });

  it('should use mutate key for PUT requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('PUT'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('mutate'),
      expect.any(Object)
    );
  });

  it('should use mutate key for DELETE requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('DELETE'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('mutate'),
      expect.any(Object)
    );
  });

  it('should use mutate key for PATCH requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('PATCH'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('mutate'),
      expect.any(Object)
    );
  });

  it('should use custom rate limit when provided', async () => {
    const customConfig = { windowMs: 10000, maxRequests: 5 };
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler, { rateLimit: customConfig });

    await wrapped(makeRequest('POST'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      customConfig
    );
  });

  it('should skip rate limiting when rateLimit is false', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler, { rateLimit: false });

    await wrapped(makeRequest('GET'));

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  // ---- Authentication ----

  it('should return 401 when auth fails', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: null },
      error: new Error('claims unavailable'),
    });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should record auth failure on 401', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: null },
      error: new Error('claims unavailable'),
    });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid'),
    });

    const wrapped = withSessionAuth(vi.fn());
    await wrapped(makeRequest('GET'));

    expect(mockRecordAuthFailure).toHaveBeenCalledWith(
      '192.168.1.1',
      '/api/test'
    );
  });

  it('should ignore valid AI temp auth unless the route opts in', async () => {
    mockValidateAiTempAuthRequest.mockResolvedValue({
      status: 'valid',
      context: {
        user: { id: 'temp-user-1', email: 'temp@example.com' },
        wsId: 'workspace-1',
      },
    });
    const handler = vi.fn().mockReturnValue(NextResponse.json({ ok: true }));

    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(200);
    expect(mockValidateAiTempAuthRequest).not.toHaveBeenCalled();
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user: expect.objectContaining({ id: fakeUser.id }),
      }),
      {}
    );
  });

  it('should accept valid AI temp auth without calling Supabase getUser when opted in', async () => {
    mockValidateAiTempAuthRequest.mockResolvedValue({
      status: 'valid',
      context: {
        user: { id: 'temp-user-1', email: 'temp@example.com' },
        wsId: 'workspace-1',
      },
    });
    const handler = vi.fn().mockReturnValue(NextResponse.json({ ok: true }));

    const wrapped = withSessionAuth(handler, { allowAiTempAuth: true });
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user: expect.objectContaining({ id: 'temp-user-1' }),
      }),
      {}
    );
  });

  it('should reject revoked AI temp auth without falling back to getUser', async () => {
    mockValidateAiTempAuthRequest.mockResolvedValue({ status: 'revoked' });
    const handler = vi.fn();

    const wrapped = withSessionAuth(handler, { allowAiTempAuth: true });
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should fall back to revalidated Supabase auth when AI temp auth is unavailable', async () => {
    mockValidateAiTempAuthRequest.mockResolvedValue({ status: 'unavailable' });
    const handler = vi.fn().mockReturnValue(NextResponse.json({ ok: true }));

    const wrapped = withSessionAuth(handler, { allowAiTempAuth: true });
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(200);
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalled();
  });

  it('should accept platform app-session cookie auth without calling Supabase getUser when opted in', async () => {
    const { token } = createAppSessionToken({
      email: 'agent@example.com',
      targetApp: 'platform',
      userId: 'app-user-1',
    });
    const request = new Request('http://localhost:3000/api/test', {
      headers: {
        cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
      },
      method: 'GET',
    }) as unknown as NextRequest;
    const handler = vi.fn(
      async (_request: NextRequest, context: SessionAuthContext) => {
        const userResult = await context.supabase.auth.getUser();
        const claimsResult = await context.supabase.auth.getClaims();
        const sessionResult = await context.supabase.auth.getSession();
        const claims = claimsResult.data?.claims as
          | { sub: string }
          | null
          | undefined;

        return NextResponse.json({
          claimsSub: claims?.sub,
          session: sessionResult.data.session,
          userId: userResult.data.user?.id,
        });
      }
    );

    const wrapped = withSessionAuth(handler, { allowAppSessionAuth: true });
    const response = await wrapped(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimsSub: 'app-user-1',
      session: null,
      userId: 'app-user-1',
    });
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        supabase: mockAdminClient,
        user: expect.objectContaining({
          email: 'agent@example.com',
          id: 'app-user-1',
        }),
      }),
      {}
    );
  });

  it('should reject unrelated app-session audiences when using the boolean app-session opt-in', async () => {
    const { token } = createAppSessionToken({
      email: 'agent@example.com',
      targetApp: 'learn',
      userId: 'app-user-1',
    });
    const request = new Request('http://localhost:3000/api/test', {
      headers: {
        cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
      },
      method: 'GET',
    }) as unknown as NextRequest;
    const handler = vi.fn();

    const wrapped = withSessionAuth(handler, { allowAppSessionAuth: true });
    const response = await wrapped(request);

    expect(response.status).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should bind sensitive calendar encryption APIs to the calendar app-session audience', async () => {
    const { token: unrelatedToken } = createAppSessionToken({
      email: 'agent@example.com',
      targetApp: 'learn',
      userId: 'app-user-1',
    });
    const unrelatedRequest = new Request(
      'http://localhost:3000/api/v1/workspaces/ws-1/encryption',
      {
        headers: {
          authorization: `Bearer ${unrelatedToken}`,
        },
        method: 'POST',
      }
    ) as unknown as NextRequest;

    const unrelatedResult = await resolveSessionAuthContext(unrelatedRequest, {
      allowAppSessionAuth: true,
    });

    expect(unrelatedResult.ok).toBe(false);
    if (!unrelatedResult.ok) {
      expect(unrelatedResult.response.status).toBe(401);
    }
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mockIsIPBlocked.mockResolvedValue(null);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, headers: {} });
    mockCheckSuspension.mockResolvedValue({ suspended: false });
    mockHasAuthenticatedApiSession.mockReturnValue(false);
    mockValidateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });

    const { token: calendarToken } = createAppSessionToken({
      email: 'agent@example.com',
      targetApp: 'calendar',
      userId: 'app-user-1',
    });
    const calendarRequest = new Request(
      'http://localhost:3000/api/v1/workspaces/ws-1/encryption',
      {
        headers: {
          authorization: `Bearer ${calendarToken}`,
        },
        method: 'POST',
      }
    ) as unknown as NextRequest;

    const calendarResult = await resolveSessionAuthContext(calendarRequest, {
      allowAppSessionAuth: true,
    });

    expect(calendarResult.ok).toBe(true);
    if (calendarResult.ok) {
      expect(calendarResult.user.id).toBe('app-user-1');
      expect(calendarResult.supabase).toBe(mockAdminClient);
    }
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });

  it('should keep shared satellite API audiences path-bound', () => {
    expect(
      getDefaultAppSessionVerificationOptions(
        'http://localhost:3000/api/v1/workspaces/ws-1/time-tracking/sessions'
      )
    ).toEqual({ targetApp: ['calendar', 'track'] });
    expect(
      getDefaultAppSessionVerificationOptions(
        'http://localhost:3000/api/v1/workspaces/ws-1/tulearn/home'
      )
    ).toEqual({ targetApp: ['learn', 'teach'] });
    expect(
      getDefaultAppSessionVerificationOptions(
        'http://localhost:3000/api/v1/workspaces/ws-1/users/groups'
      )
    ).toEqual({ targetApp: 'teach' });
    expect(
      getDefaultAppSessionVerificationOptions(
        'http://localhost:3000/api/v1/workspaces/ws-1/storage/list'
      )
    ).toEqual({
      targetApp: [
        'calendar',
        'cms',
        'drive',
        'finance',
        'hive',
        'inventory',
        'learn',
        'mind',
        'mira',
        'nova',
        'rewise',
        'tasks',
        'teach',
        'track',
      ],
    });
    expect(
      getDefaultAppSessionVerificationOptions(
        'http://localhost:3000/api/v1/users/me/profile'
      )
    ).toEqual({
      targetApp: [
        'calendar',
        'cms',
        'drive',
        'finance',
        'hive',
        'inventory',
        'learn',
        'mind',
        'mira',
        'nova',
        'rewise',
        'tasks',
        'teach',
        'track',
      ],
    });
  });

  it('should accept Inventory app-session auth for current-user bootstrap APIs', async () => {
    const { token } = createAppSessionToken({
      email: 'inventory@example.com',
      targetApp: 'inventory',
      userId: 'inventory-user-1',
    });
    const request = new Request(
      'http://localhost:3000/api/v1/users/me/default-workspace',
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        method: 'GET',
      }
    ) as unknown as NextRequest;

    const result = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      await expect(result.supabase.auth.getUser()).resolves.toEqual({
        data: { user: expect.objectContaining({ id: 'inventory-user-1' }) },
        error: null,
      });
      expect(result.user.id).toBe('inventory-user-1');
      expect(result.user.email).toBe('inventory@example.com');
      expect(result.supabase).toBe(mockAdminClient);
    }
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });

  it('should reject app-session auth that misses configured target and scope', async () => {
    const { token } = createAppSessionToken({
      email: 'agent@example.com',
      targetApp: 'learn',
      userId: 'app-user-1',
    });
    const request = new Request('http://localhost:3000/api/test', {
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: 'GET',
    }) as unknown as NextRequest;
    const handler = vi.fn();

    const wrapped = withSessionAuth(handler, {
      allowAppSessionAuth: {
        requiredScope: 'cli:access',
        targetApp: 'platform',
      },
    });
    const response = await wrapped(request);

    expect(response.status).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should accept app-session auth that matches configured target and scope', async () => {
    const session = createCliAppSession({
      email: 'agent@example.com',
      userId: 'app-user-1',
    });
    const request = new Request('http://localhost:3000/api/test', {
      headers: {
        authorization: `Bearer ${session.access.token}`,
      },
      method: 'GET',
    }) as unknown as NextRequest;
    const handler = vi.fn().mockReturnValue(NextResponse.json({ ok: true }));

    const wrapped = withSessionAuth(handler, {
      allowAppSessionAuth: {
        requiredScope: 'cli:access',
        targetApp: 'platform',
      },
    });
    const response = await wrapped(request);

    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        supabase: mockAdminClient,
        user: expect.objectContaining({
          email: 'agent@example.com',
          id: 'app-user-1',
        }),
      }),
      {}
    );
  });

  it('should apply configured app-session target and scope to shared auth resolution', async () => {
    const { token } = createAppSessionToken({
      email: 'agent@example.com',
      targetApp: 'learn',
      userId: 'app-user-1',
    });
    const request = new Request('http://localhost:3000/api/test', {
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: 'GET',
    }) as unknown as NextRequest;

    const result = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: {
        requiredScope: 'cli:access',
        targetApp: 'platform',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('should reject CLI refresh JWTs as app-session bearer auth', async () => {
    const session = createCliAppSession({
      email: 'agent@example.com',
      userId: 'app-user-1',
    });
    const request = new Request('http://localhost:3000/api/test', {
      headers: {
        authorization: `Bearer ${session.refresh.token}`,
      },
      method: 'GET',
    }) as unknown as NextRequest;
    const handler = vi.fn();

    const wrapped = withSessionAuth(handler, { allowAppSessionAuth: true });
    const response = await wrapped(request);

    expect(response.status).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should still enforce suspension checks for valid AI temp auth', async () => {
    mockValidateAiTempAuthRequest.mockResolvedValue({
      status: 'valid',
      context: { user: { id: 'temp-user-1', email: 'temp@example.com' } },
    });
    mockCheckSuspension.mockResolvedValue({
      suspended: true,
      reason: 'Suspended account',
    });
    const handler = vi.fn();

    const wrapped = withSessionAuth(handler, { allowAiTempAuth: true });
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(403);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  // ---- Suspension ----

  it('should return 403 when user is suspended', async () => {
    mockCheckSuspension.mockResolvedValue({
      suspended: true,
      reason: 'Spam activity',
    });

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.message).toBe('Spam activity');
  });

  // ---- Cache-Control ----

  it('should set Cache-Control on successful GET with cache option', async () => {
    const handler = vi
      .fn()
      .mockReturnValue(NextResponse.json({ data: 'test' }));
    const wrapped = withSessionAuth(handler, {
      cache: { maxAge: 60, swr: 30 },
    });

    const response = await wrapped(makeRequest('GET'));
    const cc = response.headers.get('Cache-Control');

    expect(cc).toBe('private, max-age=60, stale-while-revalidate=30');
  });

  it('should NOT set Cache-Control on POST even with cache option', async () => {
    const handler = vi
      .fn()
      .mockReturnValue(NextResponse.json({ data: 'created' }));
    const wrapped = withSessionAuth(handler, {
      cache: { maxAge: 60, swr: 30 },
    });

    const response = await wrapped(makeRequest('POST'));
    expect(response.headers.get('Cache-Control')).toBeNull();
  });

  it('should NOT set Cache-Control on error responses', async () => {
    const handler = vi
      .fn()
      .mockReturnValue(NextResponse.json({ error: 'bad' }, { status: 400 }));
    const wrapped = withSessionAuth(handler, {
      cache: { maxAge: 60 },
    });

    const response = await wrapped(makeRequest('GET'));
    expect(response.headers.get('Cache-Control')).toBeNull();
  });

  it('should set Cache-Control without swr when not provided', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler, {
      cache: { maxAge: 120 },
    });

    const response = await wrapped(makeRequest('GET'));
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=120');
  });

  // ---- Unknown IP handling ----

  it('should skip rate limiting and IP block for unknown IPs', async () => {
    mockExtractIP.mockReturnValue('unknown');

    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('GET'));

    expect(mockIsIPBlocked).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  // ---- Route params ----

  it('should resolve and pass route params to handler', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    const params = { wsId: 'workspace-1', boardId: 'board-2' };

    await wrapped(makeRequest('GET'), {
      params: Promise.resolve(params),
    });

    expect(handler.mock.calls[0]?.[2]).toEqual(params);
  });
});
