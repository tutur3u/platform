import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMountedAppAuth } from './mounted-app-auth';

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  factors: vi.fn(),
  assurance: vi.fn(),
  appClaims: vi.fn(),
  signedRefresh: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: mocks.assurance,
}));
vi.mock('./verified-request-user', () => ({
  peekVerifiedTotpFactor: mocks.factors,
  bindRequestAppToken: vi.fn(),
}));
vi.mock('./supabase-app-claims', () => ({
  createAppSessionClaimsFromSupabaseClaims: mocks.appClaims,
}));
vi.mock('./signed-refresh', () => ({
  resolveSignedAppSessionForRequest: mocks.signedRefresh,
}));

const sharedCookie = 'sb-nzamlzqfdwaaxdefwraj-auth-token.0=provider-session';
const now = new Date('2026-11-16T01:00:00Z');
const exp = Math.floor(now.getTime() / 1000) + 3600;

function request(
  basePath: string,
  path = '/en/workspace?view=list',
  origin = 'https://tuturuuu.com'
) {
  return new NextRequest(`${origin}${basePath}${path}`, {
    nextConfig: { basePath },
    headers: { cookie: sharedCookie },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    'https://nzamlzqfdwaaxdefwraj.supabase.co'
  );
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-only-signing-secret');
  mocks.updateSession.mockResolvedValue({
    res: NextResponse.next(),
    claims: { sub: 'provider-user', exp, aal: 'aal1' },
  });
  mocks.assurance.mockResolvedValue(null);
  mocks.factors.mockReturnValue(false);
  mocks.appClaims.mockResolvedValue({
    sub: 'provider-user',
    target_app: 'mind',
    exp,
  });
  mocks.signedRefresh.mockResolvedValue({ ok: false, error: 'legacy called' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('mounted app auth with real mount admission and shared resolver', () => {
  it.each([
    ['drive', '/drive'],
    ['chat', '/chat'],
    ['cms', '/cms'],
    ['forms', '/forms'],
    ['git', '/git'],
    ['ai', '/ai'],
    ['tasks', '/tasks'],
    ['learn', '/learn'],
    ['learn', '/lms/learn'],
    ['teach', '/teach'],
    ['teach', '/lms/teach'],
    ['nova', '/nova'],
  ])(
    'admits %s at %s and retains its base in login and verify returns',
    async (targetApp, base) => {
      const auth = createMountedAppAuth({ targetApp });
      expect(auth.isMounted(request(base))).toBe(true);
      const valid = await auth.auth(request(base));
      expect(valid.status).toBe(200);
      expect(mocks.updateSession).toHaveBeenCalledOnce();
      mocks.updateSession.mockResolvedValue({
        res: NextResponse.next(),
        claims: { sub: 'provider-user', exp: 1 },
      });
      const expired = await auth.auth(request(base));
      const login = new URL(expired.headers.get('location') ?? '');
      const callback = new URL(login.searchParams.get('returnUrl') ?? '');
      expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
      expect(callback.pathname).toBe(`${base}/verify-token`);
      expect(callback.searchParams.get('nextUrl')).toBe(
        '/en/workspace?view=list'
      );
      mocks.updateSession.mockResolvedValue({
        res: NextResponse.next(),
        claims: { sub: 'provider-user', exp, aal: 'aal1' },
      });
      const verified = await auth.auth(
        request(base, '/verify-token?nextUrl=%2Fen%2Fworkspace')
      );
      expect(verified.headers.get('location')).toBe(
        `https://tuturuuu.com${base}/en/workspace`
      );
      expect(mocks.signedRefresh).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['/tasks', 'https://tasks.tuturuuu.com'],
    ['/drive', 'https://tuturuuu.com'],
    ['', 'https://tuturuuu.com'],
  ])('refuses an unregistered origin/base pair %s %s', async (base, origin) => {
    const auth = createMountedAppAuth({ targetApp: 'tasks' });
    const req = request(base, '/en', origin);
    expect(auth.isMounted(req)).toBe(false);
    expect((await auth.resolveSession(req)).ok).toBe(false);
    expect((await auth.auth(req)).status).toBe(404);
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('sends missing credentials through Web login', async () => {
    const req = request('/tasks');
    req.cookies.clear();
    req.headers.delete('cookie');
    const response = await createMountedAppAuth({ targetApp: 'tasks' }).auth(
      req
    );
    expect(response.status).toBe(307);
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('keeps MFA and assurance failures explicit', async () => {
    const auth = createMountedAppAuth({ targetApp: 'tasks' });
    mocks.assurance.mockResolvedValue(new NextResponse(null, { status: 403 }));
    const mfa = await auth.auth(request('/tasks'));
    expect(
      new URL(mfa.headers.get('location') ?? '').searchParams.get('mfa')
    ).toBe('required');
    mocks.assurance.mockResolvedValue(new NextResponse(null, { status: 503 }));
    expect((await auth.auth(request('/tasks'))).status).toBe(503);
  });

  it('honors logout fences before resolving shared credentials', async () => {
    const req = request('/tasks');
    req.cookies.set('__Host-tuturuuu_app_signed_out', '1');
    const auth = createMountedAppAuth({ targetApp: 'tasks' });
    const result = await auth.resolveSession(req);
    expect(result).toEqual({ ok: false, error: 'App signed out' });
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });
});
