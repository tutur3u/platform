import { getRequestVerifiedUser } from '@tuturuuu/utils/request-verified-user';
import { accountAssuranceCredentials } from '@tuturuuu/utils/required-mfa-credentials';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAppSessionForRequest } from './index';
import { isExpiringSetCookie } from './mounted-failure';

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  listFactors: vi.fn(),
  assurance: vi.fn(),
  appClaims: vi.fn(),
  signedRefresh: vi.fn(),
  cachedUser: null as null | {
    id: string;
    factors?: { factor_type: string; status: string }[];
  },
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: async () => ({
    auth: { mfa: { listFactors: mocks.listFactors } },
  }),
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: mocks.assurance,
}));
vi.mock('./supabase-app-claims', () => ({
  createAppSessionClaimsFromSupabaseClaims: mocks.appClaims,
}));
vi.mock('./signed-refresh', () => ({
  resolveSignedAppSessionForRequest: mocks.signedRefresh,
}));

const now = new Date('2026-11-17T01:00:00Z');
const exp = Math.floor(now.getTime() / 1000) + 3600;
const PROVIDER = 'sb-nzamlzqfdwaaxdefwraj-auth-token';
const session = `base64-${Buffer.from(
  JSON.stringify({ access_token: 'provider-access-token' })
).toString('base64url')}`;
const strict = {
  sessionMode: 'supabase-only',
  targetApp: 'mind',
  now,
} as const;

function request() {
  return new NextRequest('https://tuturuuu.com/mind/boards', {
    nextConfig: { basePath: '/mind' },
    headers: { cookie: `${PROVIDER}=${session}` },
  });
}

function claims(aal: 'aal1' | 'aal2') {
  mocks.updateSession.mockResolvedValue({
    res: NextResponse.next(),
    claims: { sub: 'provider-user', exp, aal },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    'https://nzamlzqfdwaaxdefwraj.supabase.co'
  );
  mocks.cachedUser = null;
  claims('aal1');
  // The assurance check revalidates each provider credential once per request;
  // this fixture records that revalidated user the way the real check does.
  mocks.assurance.mockImplementation(async (req: NextRequest) => {
    const user = mocks.cachedUser;
    if (user)
      for (const token of accountAssuranceCredentials(req))
        await getRequestVerifiedUser(req, token, async () => ({
          data: { user: user as never },
          error: null,
        }));
    return null;
  });
  mocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
  mocks.appClaims.mockResolvedValue({
    sub: 'provider-user',
    target_app: 'mind',
    exp,
  });
  mocks.signedRefresh.mockResolvedValue({ ok: false, error: 'legacy called' });
});

afterEach(() => vi.unstubAllEnvs());

describe('mounted TOTP assurance fails closed', () => {
  it('refuses when the factor listing throws and no verified user is cached', async () => {
    mocks.listFactors.mockRejectedValue(new Error('provider outage'));
    const result = await refreshAppSessionForRequest(request(), strict);
    expect(result).toMatchObject({
      ok: false,
      error: 'Account assurance unavailable',
    });
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.appClaims).not.toHaveBeenCalled();
  });

  it('refuses when the factor listing returns an error and no verified user is cached', async () => {
    mocks.listFactors.mockResolvedValue({
      data: null,
      error: new Error('provider error'),
    });
    const result = await refreshAppSessionForRequest(request(), strict);
    expect(result).toMatchObject({
      ok: false,
      error: 'Account assurance unavailable',
    });
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.appClaims).not.toHaveBeenCalled();
  });

  it('refuses when the cached verified user is a different principal', async () => {
    mocks.cachedUser = { id: 'someone-else', factors: [] };
    const result = await refreshAppSessionForRequest(request(), strict);
    expect(result).toMatchObject({
      ok: false,
      error: 'Account assurance unavailable',
    });
  });

  it('requires MFA for a TOTP-enrolled user at aal1', async () => {
    mocks.cachedUser = {
      id: 'provider-user',
      factors: [{ factor_type: 'totp', status: 'verified' }],
    };
    const result = await refreshAppSessionForRequest(request(), strict);
    expect(result).toMatchObject({ ok: false, error: 'MFA required' });
    expect(mocks.appClaims).not.toHaveBeenCalled();
    expect(mocks.listFactors).not.toHaveBeenCalled();
  });

  it('admits an aal2 session whose verified user has no verified TOTP factor', async () => {
    claims('aal2');
    mocks.cachedUser = {
      id: 'provider-user',
      factors: [{ factor_type: 'totp', status: 'unverified' }],
    };
    const result = await refreshAppSessionForRequest(request(), strict);
    expect(result.ok).toBe(true);
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.signedRefresh).not.toHaveBeenCalled();
  });

  it('carries no cookie deletion on the unavailable refusal', async () => {
    const res = NextResponse.next();
    res.headers.append('set-cookie', `${PROVIDER}.1=; Path=/; Max-Age=0`);
    mocks.updateSession.mockResolvedValue({
      res,
      claims: { sub: 'provider-user', exp, aal: 'aal1' },
    });
    const result = await refreshAppSessionForRequest(request(), strict);
    expect(result.ok).toBe(false);
    expect(
      (result.response?.headers.getSetCookie() ?? []).some((cookie) =>
        isExpiringSetCookie(cookie)
      )
    ).toBe(false);
  });
});
