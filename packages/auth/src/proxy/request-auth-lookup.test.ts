// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  getUserById: vi.fn(),
  listFactors: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      admin: { getUserById: mocks.getUserById },
      getClaims: mocks.getClaims,
      getUser: mocks.getUser,
    },
    rpc: async () => ({ data: 'factor', error: null }),
  }),
  createClient: async () => ({
    auth: { mfa: { listFactors: mocks.listFactors } },
  }),
}));
vi.mock('@tuturuuu/utils/offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
}));

import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { enforceRequiredMfaRequest } from '@tuturuuu/utils/required-mfa-runtime';
import { refreshAppSessionForRequest } from './index';

const now = Math.floor(Date.now() / 1000);
const claims = {
  aal: 'aal1',
  email: 'actor@example.com',
  exp: now + 600,
  iat: now - 10,
  session_id: 'session-1',
  sub: 'actor',
};
const user = { id: 'actor', app_metadata: {}, factors: [] };

function lookupCount() {
  return (
    mocks.getUser.mock.calls.length +
    mocks.getUserById.mock.calls.length +
    mocks.listFactors.mock.calls.length
  );
}

function sessionCookie(accessToken: string) {
  return `base64-${Buffer.from(
    JSON.stringify({ access_token: accessToken })
  ).toString('base64url')}`;
}

function mailApiRequest(accessToken = 'eyJaccess-1') {
  return new NextRequest('https://mail.tuturuuu.com/api/v1/mail/threads', {
    headers: { cookie: `sb-project-auth-token=${sessionCookie(accessToken)}` },
  });
}

async function runMailApiAuth(req: NextRequest) {
  const refresh = await refreshAppSessionForRequest(req, {
    sessionMode: 'supabase-first',
    targetApp: 'mail',
  });
  const guard = await guardApiProxyRequest(req, {
    prefixBase: 'proxy:mail:api',
  });
  return { guard, refresh };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'request-auth-lookup-test');
  mocks.updateSession.mockImplementation(async (request: NextRequest) => ({
    claims,
    res: NextResponse.next({ request }),
  }));
  mocks.getClaims.mockResolvedValue({ data: { claims }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
  mocks.listFactors.mockResolvedValue({
    data: { all: [], totp: [] },
    error: null,
  });
});

describe('request-scoped verified user lookup', () => {
  it('performs one verified user lookup across refresh, guard and MFA', async () => {
    // Before this memo the same flow made 5 lookups: getUser x2,
    // getUserById x2 and listFactors x1.
    const { guard, refresh } = await runMailApiAuth(mailApiRequest());
    expect(refresh).toMatchObject({ ok: true });
    expect(guard).toBeNull();
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('eyJaccess-1');
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(lookupCount()).toBe(1);
  });

  it('does not share a lookup between separate requests', async () => {
    await runMailApiAuth(mailApiRequest());
    await runMailApiAuth(mailApiRequest());
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(lookupCount()).toBe(2);
  });

  it('re-runs the lookup when the session token changes within a request', async () => {
    const req = mailApiRequest('eyJaccess-1');
    await runMailApiAuth(req);
    req.cookies.set('sb-project-auth-token', sessionCookie('eyJaccess-2'));
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'session_not_found' },
    });
    const response = await enforceRequiredMfaRequest(req);
    expect(mocks.getUser).toHaveBeenLastCalledWith('eyJaccess-2');
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(response?.status).toBe(401);
  });

  it('does not cache a failed lookup and fails closed', async () => {
    const req = mailApiRequest();
    mocks.getUser.mockRejectedValueOnce(new Error('auth unavailable'));
    const { guard, refresh } = await runMailApiAuth(req);
    // The failure was evicted: refresh revalidated by id, and the MFA check
    // retried the token lookup instead of reading the failure back.
    expect(mocks.getUserById).toHaveBeenCalledExactlyOnceWith('actor');
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(refresh).toMatchObject({ ok: true });
    expect(guard).toBeNull();

    const failed = mailApiRequest();
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'bad_jwt' },
    });
    expect((await runMailApiAuth(failed)).guard?.status).toBe(401);
    expect(
      (await enforceRequiredMfaRequest(failed))?.status,
      'a later call never reads a positive result'
    ).toBe(401);
  });

  it('keeps the downstream ban and MFA checks on the memoized user', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          ...user,
          banned_until: new Date(Date.now() + 60_000).toISOString(),
        },
      },
      error: null,
    });
    const { guard, refresh } = await runMailApiAuth(mailApiRequest());
    expect(refresh).toMatchObject({ ok: false });
    expect(guard?.status).toBe(401);
  });

  it('reads TOTP enrollment from the memoized user instead of listing factors', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          ...user,
          factors: [{ factor_type: 'totp', id: 'f', status: 'verified' }],
        },
      },
      error: null,
    });
    const { refresh } = await runMailApiAuth(mailApiRequest());
    expect(refresh).toMatchObject({ ok: false, error: 'MFA required' });
    expect(mocks.listFactors).not.toHaveBeenCalled();
  });

  it('looks up an app token that this request did not mint', async () => {
    const { token } = createAppSessionToken({
      targetApp: 'mail',
      userId: 'actor',
    });
    const req = new NextRequest('https://mail.tuturuuu.com/api/v1/mail', {
      headers: { authorization: `Bearer ${token}` },
    });
    await guardApiProxyRequest(req, { prefixBase: 'proxy:mail:api' });
    expect(mocks.getUserById).toHaveBeenCalledExactlyOnceWith('actor');
  });
});
