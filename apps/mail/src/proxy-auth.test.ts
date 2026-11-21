import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { guardApiProxyBody } from '@tuturuuu/utils/api-proxy-body';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';
import { MAIL_ATTACHMENT_REQUEST_BYTES } from './lib/mail/attachment-upload-policy';

const mocks = vi.hoisted(() => {
  const authProxy = vi.fn();

  return {
    authProxy,
    clearSupabaseAuthCookies: vi.fn(
      (_request: NextRequest, response: NextResponse) => response
    ),
    consumeVerifyTokenRequest: vi.fn(),
    createCentralizedAuthProxy: vi.fn(() => authProxy),
    createIntlMiddleware: vi.fn<typeof import('next-intl/middleware').default>(
      () => () => NextResponse.next()
    ),
    getAppSessionClaimsFromRequest: vi.fn(),
    getRequestHeadersWithResponseCookies: vi.fn(
      (_request: NextRequest, response: NextResponse) => response.headers
    ),
    guardApiProxyRequest: vi.fn(),
    hasSupportedSupabaseAuthCookie: vi.fn(),
    hasWebAppSessionTokenFromRequest: vi.fn(),
    normalizeAuthRedirectPath: vi.fn(
      (value: string | null | undefined, _origin: string, fallback: string) =>
        value ?? fallback
    ),
    propagateAuthCookies: vi.fn(),
    refreshAppSessionForRequest: vi.fn(),
    resolveMountedSession: vi.fn(),
  };
});

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (
    ...args: Parameters<typeof mocks.clearSupabaseAuthCookies>
  ) => mocks.clearSupabaseAuthCookies(...args),
  getAppSessionClaimsFromRequest: (
    ...args: Parameters<typeof mocks.getAppSessionClaimsFromRequest>
  ) => mocks.getAppSessionClaimsFromRequest(...args),
  hasSupportedSupabaseAuthCookie: (
    ...args: Parameters<typeof mocks.hasSupportedSupabaseAuthCookie>
  ) => mocks.hasSupportedSupabaseAuthCookie(...args),
  hasWebAppSessionTokenFromRequest: (
    ...args: Parameters<typeof mocks.hasWebAppSessionTokenFromRequest>
  ) => mocks.hasWebAppSessionTokenFromRequest(...args),
}));

vi.mock('@tuturuuu/auth/proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tuturuuu/auth/proxy')>();
  return {
    ...actual,
    createMountedAppAuth: (
      options: Parameters<typeof actual.createMountedAppAuth>[0]
    ) =>
      actual.createMountedAppAuth(options, {
        resolveMountedSharedSession: mocks.resolveMountedSession,
        consumeMountedSharedSession: actual.consumeMountedSharedSession,
      }),
    consumeVerifyTokenRequest: (
      ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
    ) => mocks.consumeVerifyTokenRequest(...args),
    createCentralizedAuthProxy: (
      ...args: Parameters<typeof mocks.createCentralizedAuthProxy>
    ) => mocks.createCentralizedAuthProxy(...args),
    getRequestHeadersWithResponseCookies: (
      ...args: Parameters<typeof mocks.getRequestHeadersWithResponseCookies>
    ) => mocks.getRequestHeadersWithResponseCookies(...args),
    normalizeAuthRedirectPath: (
      ...args: Parameters<typeof mocks.normalizeAuthRedirectPath>
    ) => mocks.normalizeAuthRedirectPath(...args),
    propagateAuthCookies: (
      ...args: Parameters<typeof mocks.propagateAuthCookies>
    ) => mocks.propagateAuthCookies(...args),
    refreshAppSessionForRequest: (
      ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
    ) => mocks.refreshAppSessionForRequest(...args),
  };
});

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  hasAuthenticatedBearerToken: (headers: Headers) =>
    headers.get('authorization')?.startsWith('Bearer ') ?? false,
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: (...args: Parameters<typeof mocks.createIntlMiddleware>) =>
    mocks.createIntlMiddleware(...args),
}));

vi.mock('next-intl/routing', () => ({
  defineRouting: (config: unknown) => config,
}));

vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: 'a',
    redirect: () => undefined,
    usePathname: () => '/',
    useRouter: () => ({}),
  }),
}));

describe('Mail proxy auth handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
  });

  it.each([503, 403])(
    'returns terminal auth %i before locale or workspace handling',
    async (status) => {
      const terminal = NextResponse.json(
        { error: 'unavailable' },
        {
          status,
          headers: { 'cache-control': 'no-store' },
        }
      );
      mocks.authProxy.mockResolvedValue(terminal);
      const response = await proxy(
        new NextRequest('https://mail.tuturuuu.com/en/personal/inbox')
      );
      expect(response).toBe(terminal);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(response.headers.get('location')).toBeNull();
      expect(mocks.getAppSessionClaimsFromRequest).not.toHaveBeenCalled();
      expect(mocks.getRequestHeadersWithResponseCookies).not.toHaveBeenCalled();
    }
  );

  it('passes mobile Bearer requests through the API guard without cookie refresh', async () => {
    const request = new NextRequest(
      'https://mail.tuturuuu.localhost/api/v1/workspaces/personal/mail/bootstrap',
      { headers: { authorization: 'Bearer mobile-session' } }
    );
    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:mail:api',
    });
  });

  it('passes the scoped upload budget to the body guard for a 3 MiB PDF', async () => {
    mocks.guardApiProxyRequest.mockImplementation(
      (request: NextRequest, options: { maxPayloadBytes?: number }) =>
        guardApiProxyBody(request, options.maxPayloadBytes)
    );
    const body = new FormData();
    body.append(
      'file',
      new Blob(['%PDF-1.7\n', new Uint8Array(3 * 1024 * 1024)], {
        type: 'application/pdf',
      }),
      'document.pdf'
    );
    const request = new NextRequest(
      'https://mail.tuturuuu.com/api/v1/workspaces/personal/mail/mailboxes/box/drafts/draft/attachments',
      {
        method: 'POST',
        headers: { authorization: 'Bearer mobile-session' },
        body,
      }
    );
    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:mail:api',
      maxPayloadBytes: MAIL_ATTACHMENT_REQUEST_BYTES,
    });
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('retains the generic body rejection for the same PDF on another route', async () => {
    mocks.guardApiProxyRequest.mockImplementation(
      (request: NextRequest, options: { maxPayloadBytes?: number }) =>
        guardApiProxyBody(request, options.maxPayloadBytes)
    );
    const body = new FormData();
    body.append(
      'file',
      new Blob([new Uint8Array(3 * 1024 * 1024)], {
        type: 'application/pdf',
      }),
      'document.pdf'
    );
    const request = new NextRequest(
      'https://mail.tuturuuu.com/api/v1/workspaces/personal/mail/mailboxes/box/drafts/draft',
      {
        method: 'POST',
        headers: { authorization: 'Bearer mobile-session' },
        body,
      }
    );
    const response = await proxy(request);
    expect(response.status).toBe(413);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:mail:api',
    });
    expect(await response.json()).toMatchObject({
      message: 'Request body exceeds limit',
    });
  });

  it('preserves API guard rejection for Bearer requests', async () => {
    const rejection = NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
    mocks.guardApiProxyRequest.mockResolvedValueOnce(rejection);
    const response = await proxy(
      new NextRequest(
        'https://mail.tuturuuu.localhost/api/v1/workspaces/personal/mail/bootstrap',
        { headers: { authorization: 'Bearer invalid-session' } }
      )
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalledOnce();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('preserves MFA recovery cookies when the Bearer guard requires assurance', async () => {
    const rejection = NextResponse.json(
      { code: 'MFA_REQUIRED', error: 'MFA verification required' },
      {
        status: 403,
        headers: { 'X-Tuturuuu-Auth-Assurance': 'required' },
      }
    );
    rejection.cookies.set('sb-project-auth-token', 'rotated-session');
    mocks.guardApiProxyRequest.mockResolvedValueOnce(rejection);
    const response = await proxy(
      new NextRequest(
        'https://mail.tuturuuu.localhost/api/v1/workspaces/personal/mail/bootstrap',
        { headers: { authorization: 'Bearer needs-assurance' } }
      )
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(response.cookies.get('sb-project-auth-token')?.value).toBe(
      'rotated-session'
    );
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('consumes verify-token requests before centralized auth redirects', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://mail.tuturuuu.localhost/personal'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValueOnce(verifyResponse);
    const request = new NextRequest(
      'https://mail.tuturuuu.localhost/verify-token?token=copy-token&nextUrl=%2Fpersonal'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(mocks.consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('keeps Supabase-authenticated login requests inside Mail instead of restarting central handoff', async () => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/personal');
    const request = new NextRequest(
      'https://mail.tuturuuu.localhost/login?next=%2Fpersonal'
    );

    const response = await proxy(request);

    expect(response.headers.get('Location')).toBe(
      'https://mail.tuturuuu.localhost/personal'
    );
    expect(mocks.authProxy).toHaveBeenCalledWith(request);
    expect(mocks.normalizeAuthRedirectPath).toHaveBeenCalledWith(
      '/personal',
      'https://mail.tuturuuu.localhost',
      '/personal/inbox'
    );
  });

  it('falls back to the default locale for wildcard health-check language headers', async () => {
    const request = new NextRequest('https://mail.tuturuuu.localhost/login', {
      headers: { 'accept-language': '*' },
    });

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.authProxy).toHaveBeenCalledWith(request);
  });

  it.each(['/api/v1/webhooks/mail/cloudflare', '/api/v1/webhooks/mail/ses'])(
    'lets the signed provider webhook bypass session auth: %s',
    async (path) => {
      const request = new NextRequest(
        `https://mail.tuturuuu.localhost${path}`,
        {
          method: 'POST',
        }
      );

      const response = await proxy(request);

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    }
  );

  it('does not bypass session auth for nearby webhook paths', async () => {
    const request = new NextRequest(
      'https://mail.tuturuuu.localhost/api/v1/webhooks/mail/cloudflare/untrusted',
      { method: 'POST' }
    );

    await proxy(request);

    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledOnce();
  });
});

describe('Mail entry redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
  });
  it.each(['/', '/en', '/vi', '/personal', '/vi/personal'])(
    'opens personal inbox directly from %s and preserves query state',
    async (path) => {
      const response = await proxy(
        new NextRequest(
          `https://mail.tuturuuu.localhost${path}?mailbox=selected`
        )
      );
      expect(response.headers.get('location')).toBe(
        `https://mail.tuturuuu.localhost${path.startsWith('/vi') ? '/vi' : ''}/personal/inbox?mailbox=selected`
      );
      expect(mocks.propagateAuthCookies).toHaveBeenCalled();
    }
  );
  it.each(['no-redirect', 'hash-nav', 'multiAccount'])(
    'preserves the %s auth/navigation escape hatch',
    async (flag) => {
      const response = await proxy(
        new NextRequest(`https://mail.tuturuuu.localhost/?${flag}=1`)
      );
      expect(response.headers.get('location')).toBeNull();
    }
  );
});

it('persists an explicit English entry locale over a Vietnamese cookie or language header', async () => {
  mocks.authProxy.mockResolvedValue(NextResponse.next());
  mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
  mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
  const response = await proxy(
    new NextRequest('https://mail.tuturuuu.localhost/en/personal', {
      headers: { cookie: 'NEXT_LOCALE=vi', 'accept-language': 'vi' },
    })
  );
  expect(response.headers.get('location')).toBe(
    'https://mail.tuturuuu.localhost/personal/inbox'
  );
  expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('en');
});

describe('mounted Mail app-owned redirects', () => {
  beforeEach(() => {
    mocks.resolveMountedSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    vi.clearAllMocks();
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.normalizeAuthRedirectPath.mockImplementation(
      (value, _origin, fallback) => value ?? fallback
    );
  });
  it.each(['en', 'vi'])(
    'retains the explicit mounted %s locale on a deep link',
    async (locale) => {
      const { default: createIntlMiddleware } = await vi.importActual<
        typeof import('next-intl/middleware')
      >('next-intl/middleware');
      mocks.createIntlMiddleware.mockImplementationOnce(createIntlMiddleware);
      mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
      const path = `/mail/${locale}/personal/inbox?q=one%26two`;
      const request = new NextRequest(`https://tuturuuu.com${path}`, {
        nextConfig: { basePath: '/mail' },
        headers: { cookie: 'NEXT_LOCALE=vi; sb-fixture-auth-token=shared' },
      });

      const response = await proxy(request);

      expect(response.headers.get('location')).toBeNull();
    }
  );
});

describe('mounted Mail shared-session boundary', () => {
  beforeEach(() => {
    mocks.resolveMountedSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    vi.clearAllMocks();
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getRequestHeadersWithResponseCookies.mockImplementation(
      (request: NextRequest) => request.headers
    );
  });
  it.each([
    '/mail/not-available',
    '/mail/api/v1/mail/domains',
    '/mail/verify-token?token=untrusted',
  ])('never writes a satellite session while handling %s', async (path) => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    const response = await proxy(
      new NextRequest(`https://tuturuuu.com${path}`, {
        headers: { cookie: 'sb-fixture-auth-token=shared' },
        nextConfig: { basePath: '/mail' },
      })
    );
    expect(mocks.consumeVerifyTokenRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
    expect(
      response.headers
        .getSetCookie()
        .filter((cookie) =>
          /^(?:tuturuuu_app_session|sb-[^=]+-auth-token)/u.test(cookie)
        )
    ).toEqual([]);
  });
  it('guards mounted functions without refreshing or clearing the shared session', async () => {
    const { nativeFunctionProxy } =
      await import('./runtime/native-function-proxy');
    const request = new NextRequest('https://tuturuuu.com/mail/_fn/fixture', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'sb-fixture-auth-token=shared',
      },
      nextConfig: { basePath: '/mail' },
    });
    const response = await withBridgeRequest(
      { request, appBase: '/mail' },
      () => nativeFunctionProxy(request)
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(expect.anything(), {
      prefixBase: 'proxy:mail:functions',
    });
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe('mounted Mail handoff return', () => {
  const APEX = 'https://tuturuuu.com';
  const BASE = '/mail';
  const mounted = (path: string) =>
    new NextRequest(APEX + BASE + path, { nextConfig: { basePath: BASE } });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMountedSession.mockResolvedValue({
      ok: false,
      error: 'Shared session unavailable',
    });
  });

  it('rejects mutation methods at the mounted verifier', async () => {
    const response = await proxy(
      new NextRequest(APEX + BASE + '/vi/verify-token?nextUrl=%2Fpersonal', {
        method: 'POST',
        nextConfig: { basePath: BASE },
      })
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.resolveMountedSession).not.toHaveBeenCalled();
  });

  it('canonicalizes a page on the alternate Mail mount before satellite auth', async () => {
    const path = '/mail/login?next=%2Fpersonal%2Finbox';
    const response = await proxy(
      new NextRequest('https://web.tutur3u.com' + path, {
        nextConfig: { basePath: BASE },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(APEX + path);
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('round-trips a signed-out deep link through Web and the mounted verifier', async () => {
    const path = '/personal?view=week&q=one%26two';
    const handoff = await proxy(mounted(path));
    expect(handoff.status).toBe(307);
    const login = new URL(handoff.headers.get('location') ?? '');
    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    const verifier = new URL(login.searchParams.get('returnUrl') ?? '');
    expect(verifier.origin + verifier.pathname).toBe(
      APEX + BASE + '/verify-token'
    );
    expect(verifier.searchParams.get('nextUrl')).toBe(path);
    expect(handoff.headers.getSetCookie()).toEqual([]);

    mocks.resolveMountedSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    const completion = await proxy(mounted('/verify-token' + verifier.search));
    expect(completion.status).toBe(307);
    expect(completion.headers.get('location')).toBe(APEX + BASE + path);
    expect(completion.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    'https://tuturuuu.com/calendar/personal',
    '//evil.example/personal',
    '/../calendar/personal',
  ])('keeps a verifier return for %s inside the mount', async (next) => {
    mocks.resolveMountedSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    const response = await proxy(
      mounted('/verify-token?' + new URLSearchParams({ nextUrl: next }))
    );
    expect(response.headers.get('location')).toBe(APEX + BASE);
  });

  it.each(['/personal', '/verify-token?nextUrl=%2Fpersonal'])(
    'requests MFA for %s',
    async (path) => {
      mocks.resolveMountedSession.mockResolvedValue({
        ok: false,
        error: 'MFA required',
      });
      const response = await proxy(mounted(path));
      const login = new URL(response.headers.get('location') ?? '');
      expect(login.searchParams.get('mfa')).toBe('required');
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  );

  it('returns the assurance service failure on a mounted page', async () => {
    mocks.resolveMountedSession.mockResolvedValue({
      ok: false,
      error: 'Account assurance unavailable',
    });
    const response = await proxy(mounted('/personal'));
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
  it('keeps the subdomain handoff on the token consumer', async () => {
    mocks.consumeVerifyTokenRequest.mockResolvedValueOnce(
      NextResponse.redirect('https://mail.tuturuuu.com/personal/inbox')
    );
    const response = await proxy(
      new NextRequest(
        'https://mail.tuturuuu.com/verify-token?token=t&nextUrl=%2Fpersonal%2Finbox'
      )
    );
    expect(mocks.consumeVerifyTokenRequest).toHaveBeenCalledTimes(1);
    expect(response.headers.get('location')).toBe(
      'https://mail.tuturuuu.com/personal/inbox'
    );
  });
});
