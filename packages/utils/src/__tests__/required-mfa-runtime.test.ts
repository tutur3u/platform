// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppCoordinationToken } from '../app-coordination-token';
import {
  enforceRequiredMfaRequest,
  getVerifiedMfaBearerUser,
} from '../required-mfa-runtime';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
const now = Math.floor(Date.now() / 1000);
type TestUser = {
  id: string;
  app_metadata: Record<string, unknown>;
  banned_until?: string;
};
type TestUserResult = {
  data: { user: TestUser | null };
  error: { code: string } | null;
};
function setup() {
  const user = {
    id: 'actor',
    app_metadata: {
      tuturuuu_required_mfa: { required: true, verifiedAfter: now - 30 },
    },
  };
  const getUserById = vi.fn(async (id: string): Promise<TestUserResult> => {
    return {
      data: { user: id === 'actor' ? user : { id, app_metadata: {} } },
      error: null,
    };
  });
  const getUser = vi.fn(async (): Promise<TestUserResult> => {
    return { data: { user }, error: null };
  });
  const getClaims = vi.fn(async () => ({
    data: { claims: { sub: 'actor', aal: 'aal1' } },
    error: null,
  }));
  mocks.admin.mockResolvedValue({
    rpc: async () => ({ data: 'factor', error: null }),
    auth: { getUser, getClaims, admin: { getUserById } },
  });
  return { getUser, getClaims, getUserById };
}
function request(headers: HeadersInit, path = '/api/v1/workspaces') {
  return new NextRequest(`https://tuturuuu.com${path}`, { headers });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-required-mfa-secret');
});
describe('connected required MFA request enforcement', () => {
  it('reports only a provider-verified bearer actor after MFA passes', async () => {
    const { getUser } = setup();
    getUser.mockResolvedValue({
      data: { user: { id: 'actor', app_metadata: {} } },
      error: null,
    });
    const verified = vi.fn();
    expect(
      await enforceRequiredMfaRequest(
        request({ authorization: 'Bearer eyJprovider', 'x-user-id': 'forged' }),
        verified
      )
    ).toBeNull();
    expect(verified).toHaveBeenCalledExactlyOnceWith('actor');
    expect(getUser).toHaveBeenCalledExactlyOnceWith('eyJprovider');
  });

  it('coalesces pending checks and replays callbacks only after all identities pass', async () => {
    const { getUser } = setup();
    const pending = Promise.withResolvers<TestUserResult>();
    getUser.mockReturnValue(pending.promise);
    const req = request({
      authorization: 'Bearer eyJprovider',
      'x-user-id': 'forged',
    });
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const first = enforceRequiredMfaRequest(req, firstCallback);
    const second = enforceRequiredMfaRequest(req, secondCallback);
    expect(getVerifiedMfaBearerUser(req)).toBeNull();
    pending.resolve({
      data: { user: { id: 'actor', app_metadata: {} } },
      error: null,
    });
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(getUser).toHaveBeenCalledExactlyOnceWith('eyJprovider');
    expect(firstCallback).toHaveBeenCalledExactlyOnceWith('actor');
    expect(secondCallback).toHaveBeenCalledExactlyOnceWith('actor');
    expect(getVerifiedMfaBearerUser(req)?.id).toBe('actor');
    const cachedCallback = vi.fn();
    await enforceRequiredMfaRequest(req, cachedCallback);
    expect(cachedCallback).toHaveBeenCalledExactlyOnceWith('actor');
    expect(getUser).toHaveBeenCalledTimes(1);
  });
  it('does not trust a forged identity or copy assurance to a cloned request', async () => {
    const { getUser } = setup();
    getUser.mockResolvedValue({
      data: { user: { id: 'actor', app_metadata: {} } },
      error: null,
    });
    const req = request({
      authorization: 'Bearer eyJprovider',
      'x-tuturuuu-verified-user': 'forged',
    });
    expect(getVerifiedMfaBearerUser(req)).toBeNull();
    await enforceRequiredMfaRequest(req);
    const clone = new NextRequest(req.clone());
    expect(getVerifiedMfaBearerUser(clone)).toBeNull();
    await enforceRequiredMfaRequest(clone);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(getVerifiedMfaBearerUser(clone)?.id).toBe('actor');
  });
  it('invalidates cached context when selected credentials change', async () => {
    const { getUser } = setup();
    getUser.mockResolvedValue({
      data: { user: { id: 'actor', app_metadata: {} } },
      error: null,
    });
    const req = request({ authorization: 'Bearer eyJprovider' });
    await enforceRequiredMfaRequest(req);
    req.headers.set('authorization', 'Bearer eyJother');
    expect(getVerifiedMfaBearerUser(req)).toBeNull();
    await enforceRequiredMfaRequest(req);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(getUser).toHaveBeenLastCalledWith('eyJother');
  });
  it('does not expose a bearer identity if an ambient identity fails assurance', async () => {
    const { getUser } = setup();
    getUser.mockResolvedValue({
      data: { user: { id: 'optional', app_metadata: {} } },
      error: null,
    });
    const required = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'infra',
    }).token;
    const req = request({
      authorization: 'Bearer eyJprovider',
      cookie: `tuturuuu_app_session=${required}`,
    });
    const callback = vi.fn();
    expect((await enforceRequiredMfaRequest(req, callback))?.status).toBe(403);
    expect(callback).not.toHaveBeenCalled();
    expect(getVerifiedMfaBearerUser(req)).toBeNull();
  });
  it('does not report a bearer actor when MFA rejects the request', async () => {
    setup();
    const verified = vi.fn();
    expect(
      (
        await enforceRequiredMfaRequest(
          request({ authorization: 'Bearer eyJprovider' }),
          verified
        )
      )?.status
    ).toBe(403);
    expect(verified).not.toHaveBeenCalled();
  });
  it('denies provider-authenticated AAL1 sessions with fresh required policy', async () => {
    setup();
    const response = await enforceRequiredMfaRequest(
      request({ authorization: 'Bearer eyJprovider' })
    );
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ code: 'MFA_REQUIRED' });
  });
  it('rejects a previously issued satellite cookie after a fresh provider ban', async () => {
    const { getUserById, getUser, getClaims } = setup();
    getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'actor',
          app_metadata: {},
          banned_until: new Date(Date.now() + 60_000).toISOString(),
        },
      },
      error: null,
    });
    const token = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'infra',
      scopes: ['internal-app:session'],
    }).token;
    const response = await enforceRequiredMfaRequest(
      request(
        { cookie: `tuturuuu_app_session=${token}` },
        '/api/v1/infrastructure/internal-accounts/employees/target/restore'
      )
    );
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({
      code: 'UNAUTHENTICATED',
      error: 'Authentication required',
    });
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(getUserById).toHaveBeenCalledExactlyOnceWith('actor');
    expect(getUser).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
  });
  it('rejects a provider bearer whose current session no longer exists', async () => {
    const { getUser, getUserById, getClaims } = setup();
    getUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'session_not_found' },
    });
    const response = await enforceRequiredMfaRequest(
      request(
        { authorization: 'Bearer eyJprovider' },
        '/api/v1/infrastructure/internal-accounts/employees/target/restore'
      )
    );
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({
      code: 'UNAUTHENTICATED',
      error: 'Authentication required',
    });
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(getUser).toHaveBeenCalledExactlyOnceWith('eyJprovider');
    expect(getUserById).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
  });
  it('does not borrow assurance from another cookie identity', async () => {
    setup();
    const optional = createAppCoordinationToken({
      userId: 'optional',
      targetApp: 'web',
    }).token;
    const required = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'infra',
    }).token;
    const response = await enforceRequiredMfaRequest(
      request({
        cookie: `tuturuuu_web_app_session=${optional}; tuturuuu_app_session=${required}`,
      })
    );
    expect(response?.status).toBe(403);
  });
  it('accepts a signed proof after the recovery boundary', async () => {
    setup();
    const token = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'infra',
      mfa: { factorId: 'factor', sessionId: 'session', verifiedAt: now - 5 },
    }).token;
    expect(
      await enforceRequiredMfaRequest(
        request({ authorization: `Bearer ${token}` })
      )
    ).toBeNull();
  });
  it('fails closed when current policy is unavailable', async () => {
    mocks.admin.mockRejectedValue(new Error('offline'));
    expect(
      (
        await enforceRequiredMfaRequest(
          request({ authorization: 'Bearer eyJprovider' })
        )
      )?.status
    ).toBe(503);
  });
  it('leaves independently authenticated machine requests to their own authentication', async () => {
    expect(
      await enforceRequiredMfaRequest(
        request({ authorization: 'Bearer machine-key' })
      )
    ).toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('leaves recovery requests reachable for their own challenge validation', async () => {
    expect(
      await enforceRequiredMfaRequest(
        request(
          { authorization: 'Bearer eyJprovider' },
          '/api/v1/auth/mfa/devices'
        )
      )
    ).toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
