import { type NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appSessionToken: vi.fn(),
  checkRateLimit: vi.fn(),
  checkUserSuspension: vi.fn(),
  createClient: vi.fn(),
  enforceStepUp: vi.fn(),
  isIPBlocked: vi.fn(),
  resolveDecision: vi.fn(),
  resolveSessionUser: vi.fn(),
  validateTempAuth: vi.fn(),
  verifyAppSession: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: (client: unknown) => client,
  createAppSessionUser: (claims: { sub: string }) => ({
    created_at: '2026-01-01T00:00:00.000Z',
    id: claims.sub,
  }),
  getAppSessionTokenFromRequest: () => mocks.appSessionToken(),
  verifyAppSessionRequest: () => mocks.verifyAppSession(),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_ACCESS_SCOPE: 'cli:access',
  CLI_APP_TARGET_APP: 'cli',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ admin: true }),
  createClient: () => mocks.createClient(),
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  buildAbuseRiskSubjects: () => [],
  extractIPFromHeaders: () => '203.0.113.7',
  isIPBlocked: () => mocks.isIPBlocked(),
  recordApiAuthFailure: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  cascadeBackendRateLimitToProxyBan: vi.fn(),
  isBackendRateLimitError: () => false,
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  writeVerifiedSessionCacheForSubjects: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: (userId: string) => mocks.checkUserSuspension(userId),
}));
vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: () => mocks.validateTempAuth(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  hasAuthenticatedApiSession: () => false,
}));
vi.mock('@tuturuuu/utils/constants', () => ({ MAX_PAYLOAD_SIZE: 1_048_576 }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: () => mocks.resolveSessionUser(),
}));
vi.mock('./abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: (input: unknown) =>
    mocks.enforceStepUp(input),
  getAdaptiveRateLimitConfig: (config: unknown) => ({ config }),
  recordResponseAbuseSignal: vi.fn(),
  resolveWebAbuseDecision: (input: unknown) => mocks.resolveDecision(input),
}));
vi.mock('./infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
}));
vi.mock('./rate-limit', () => ({
  checkRateLimit: (key: string, config: unknown) =>
    mocks.checkRateLimit(key, config),
}));

import { resetRecentIpClears } from '@tuturuuu/utils/abuse-protection/recent-ip-block';
import { withSessionAuth } from './api-auth';

const decision = { subjects: [], tier: 'standard', trustMultiplier: 1 };
const blockInfo = {
  blockLevel: 1,
  blockedAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  id: 'block-1',
  reason: 'manual',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function request(method = 'GET') {
  return new Request('https://tasks.example.com/api/v1/workspaces/ws/tasks', {
    method,
  }) as unknown as NextRequest;
}

const handler = vi.fn(async () => NextResponse.json({ ok: true }));
const appSessionRoute = () =>
  withSessionAuth(handler, { allowAppSessionAuth: { targetApp: 'tasks' } });
const cookieRoute = () => withSessionAuth(handler);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('withSessionAuth security lookups', () => {
  const unhandled = vi.fn();

  beforeEach(() => {
    resetRecentIpClears();
    vi.clearAllMocks();
    process.on('unhandledRejection', unhandled);
    mocks.appSessionToken.mockReturnValue(null);
    mocks.verifyAppSession.mockReturnValue({
      claims: {
        iat: 1,
        origin_app: 'web',
        sub: 'app-user',
        target_app: 'tasks',
      },
      ok: true,
    });
    mocks.isIPBlocked.mockResolvedValue(null);
    mocks.checkUserSuspension.mockResolvedValue({ suspended: false });
    mocks.resolveDecision.mockResolvedValue(decision);
    mocks.enforceStepUp.mockResolvedValue(null);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} });
    mocks.validateTempAuth.mockResolvedValue({ status: 'missing' });
    mocks.createClient.mockResolvedValue({ cookie: true });
    mocks.resolveSessionUser.mockResolvedValue({
      authError: null,
      user: { created_at: '2026-01-01T00:00:00.000Z', id: 'cookie-user' },
    });
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandled);
  });

  it('overlaps app-session suspension and abuse lookups with the IP block check', async () => {
    mocks.appSessionToken.mockReturnValue('ttr_app_token');
    const block = deferred<null>();
    mocks.isIPBlocked.mockReturnValue(block.promise);

    const pending = appSessionRoute()(request());
    await flush();

    expect(mocks.checkUserSuspension).toHaveBeenCalledWith('app-user');
    expect(mocks.resolveDecision).toHaveBeenCalledWith(
      expect.objectContaining({ authKind: 'app-session', userId: 'app-user' })
    );
    expect(handler).not.toHaveBeenCalled();

    block.resolve(null);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('answers an IP block before an app-session suspension', async () => {
    mocks.appSessionToken.mockReturnValue('ttr_app_token');
    mocks.isIPBlocked.mockResolvedValue(blockInfo);
    mocks.checkUserSuspension.mockResolvedValue({ suspended: true });
    mocks.resolveDecision.mockRejectedValue(new Error('trust lookup failed'));

    const response = await appSessionRoute()(request());
    await flush();

    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('answers an app-session suspension before the abuse decision is applied', async () => {
    mocks.appSessionToken.mockReturnValue('ttr_app_token');
    mocks.checkUserSuspension.mockResolvedValue({
      reason: 'Abuse',
      suspended: true,
    });
    mocks.resolveDecision.mockRejectedValue(new Error('trust lookup failed'));

    const response = await appSessionRoute()(request('POST'));
    await flush();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
      message: 'Abuse',
    });
    expect(mocks.enforceStepUp).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalledWith(
      expect.stringContaining('session:user'),
      expect.anything()
    );
    expect(handler).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('keeps temp auth ahead of app-session lookups on routes that allow both', async () => {
    mocks.appSessionToken.mockReturnValue('ttr_app_token');
    mocks.validateTempAuth.mockResolvedValue({
      context: { user: { id: 'temp-user' } },
      status: 'valid',
    });

    const response = await withSessionAuth(handler, {
      allowAiTempAuth: true,
      allowAppSessionAuth: { targetApp: 'tasks' },
    })(request());

    expect(response.status).toBe(200);
    expect(mocks.checkUserSuspension).toHaveBeenCalledTimes(1);
    expect(mocks.checkUserSuspension).toHaveBeenCalledWith('temp-user');
    expect(mocks.resolveDecision).toHaveBeenCalledTimes(1);
    expect(mocks.resolveDecision).toHaveBeenCalledWith(
      expect.objectContaining({ authKind: 'temp', userId: 'temp-user' })
    );
  });

  it('checks the IP block before Supabase auth for cookie sessions', async () => {
    mocks.isIPBlocked.mockResolvedValue(blockInfo);

    const response = await cookieRoute()(request());

    expect(response.status).toBe(429);
    expect(mocks.resolveSessionUser).not.toHaveBeenCalled();
    expect(mocks.checkUserSuspension).not.toHaveBeenCalled();
  });

  it('answers 401 before any suspension or abuse lookup for an unauthenticated cookie request', async () => {
    mocks.resolveSessionUser.mockResolvedValue({ authError: null, user: null });
    mocks.checkUserSuspension.mockResolvedValue({ suspended: true });

    const response = await cookieRoute()(request());

    expect(response.status).toBe(401);
    expect(mocks.checkUserSuspension).not.toHaveBeenCalled();
    expect(mocks.resolveDecision).not.toHaveBeenCalled();
  });

  it('starts the abuse decision alongside the cookie-session suspension check', async () => {
    const suspension = deferred<{ suspended: boolean }>();
    mocks.checkUserSuspension.mockReturnValue(suspension.promise);

    const pending = cookieRoute()(request());
    await flush();

    expect(mocks.resolveDecision).toHaveBeenCalledWith(
      expect.objectContaining({ authKind: 'session', userId: 'cookie-user' })
    );
    expect(handler).not.toHaveBeenCalled();

    suspension.resolve({ suspended: false });
    expect((await pending).status).toBe(200);
  });

  it('fails open when the suspension lookup throws', async () => {
    mocks.checkUserSuspension.mockRejectedValue(new Error('store down'));

    const response = await cookieRoute()(request());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
