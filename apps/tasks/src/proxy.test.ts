import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => {
  const authProxy = vi.fn();
  const centralizedAuthOptions: unknown[] = [];

  return {
    authProxy,
    centralizedAuthOptions,
    clearSupabaseAuthCookies: vi.fn(
      (_request: NextRequest, response: NextResponse) => response
    ),
    consumeVerifyTokenRequest: vi.fn(),
    createCentralizedAuthProxy: vi.fn((options: unknown) => {
      centralizedAuthOptions.push(options);
      return authProxy;
    }),
    getAppSessionClaimsFromRequest: vi.fn(),
    getCurrentUserDefaultWorkspace: vi.fn(),
    getRequestHeadersWithResponseCookies: vi.fn(),
    getUserConfig: vi.fn(),
    guardApiProxyRequest: vi.fn(),
    hasAuthenticatedBearerToken: vi.fn(),
    hasSupportedSupabaseAuthCookie: vi.fn(),
    hasWebAppSessionTokenFromRequest: vi.fn(),
    propagateAuthCookies: vi.fn(),
    refreshAppSessionForRequest: vi.fn(),
    withForwardedInternalApiAuth: vi.fn(),
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

vi.mock('@tuturuuu/auth/proxy', () => ({
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: (
    ...args: Parameters<typeof mocks.createCentralizedAuthProxy>
  ) => mocks.createCentralizedAuthProxy(...args),
  getRequestHeadersWithResponseCookies: (
    ...args: Parameters<typeof mocks.getRequestHeadersWithResponseCookies>
  ) => mocks.getRequestHeadersWithResponseCookies(...args),
  normalizeAuthRedirectPath: vi.fn(
    (_value: string | null | undefined, _origin: string, fallback: string) =>
      fallback
  ),
  propagateAuthCookies: (
    ...args: Parameters<typeof mocks.propagateAuthCookies>
  ) => mocks.propagateAuthCookies(...args),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: (
    ...args: Parameters<typeof mocks.getCurrentUserDefaultWorkspace>
  ) => mocks.getCurrentUserDefaultWorkspace(...args),
  getUserConfig: (...args: Parameters<typeof mocks.getUserConfig>) =>
    mocks.getUserConfig(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
  hasAuthenticatedBearerToken: (
    ...args: Parameters<typeof mocks.hasAuthenticatedBearerToken>
  ) => mocks.hasAuthenticatedBearerToken(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('@tuturuuu/satellite/i18n', () => ({
  defaultLocale: 'en',
  Link: 'a',
  redirect: vi.fn(),
  routing: { defaultLocale: 'en', locales: ['en', 'vi'] },
  supportedLocales: ['en', 'vi'],
  usePathname: () => '/',
  useRouter: () => ({}),
}));

describe('Tasks proxy auth mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(new Headers());
    mocks.getUserConfig.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedBearerToken.mockImplementation(
      (headers: Headers) =>
        headers.get('authorization') === 'Bearer ttr_app_access'
    );
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.withForwardedInternalApiAuth.mockReturnValue({
      defaultHeaders: { authorization: 'Bearer satellite-session' },
    });
  });

  it('registers Tasks auth as Supabase-first', () => {
    const options = mocks.centralizedAuthOptions[0] as
      | { appSession?: { sessionMode?: string; targetApp?: string } }
      | undefined;

    expect(options?.appSession).toMatchObject({
      sessionMode: 'supabase-first',
      targetApp: 'tasks',
    });
  });

  it('refreshes Supabase-cookie product APIs in Supabase-first mode', async () => {
    const request = new NextRequest('https://tasks.tuturuuu.com/api/v1/tasks', {
      headers: {
        cookie: 'sb-test-auth-token=shared',
      },
    });

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      sessionMode: 'supabase-first',
      targetApp: 'tasks',
    });
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:tasks:api',
    });
  });

  it('lets CLI bearer app-session API requests reach route auth without Tasks refresh', async () => {
    const request = new NextRequest(
      'https://tasks.tuturuuu.com/api/v1/workspaces/personal/tasks',
      {
        headers: {
          authorization: 'Bearer ttr_app_access',
        },
      }
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:tasks:api',
    });
  });

  it('lets mobile Supabase bearer API requests reach route auth without Tasks refresh', async () => {
    mocks.hasAuthenticatedBearerToken.mockReturnValue(true);
    const request = new NextRequest(
      'https://tasks.tuturuuu.com/api/v1/workspaces/personal/task-boards',
      {
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      }
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:tasks:api',
    });
  });

  it('rejects failed Supabase-first API refreshes without reaching route auth', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValueOnce({
      error: 'Invalid app session refresh credentials',
      ok: false,
    });
    const request = new NextRequest('https://tasks.tuturuuu.com/api/v1/tasks');

    const response = await proxy(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('rewrites Supabase-authenticated root requests to the personal task entrypoint', async () => {
    const authRequestHeaders = new Headers({
      cookie: 'sb-test-auth-token=shared',
    });
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(
      authRequestHeaders
    );
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    const request = new NextRequest('https://tasks.tuturuuu.com/');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://tasks.tuturuuu.com/personal/tasks'
    );
    expect(mocks.withForwardedInternalApiAuth).toHaveBeenCalledWith(
      authRequestHeaders
    );
    expect(mocks.getUserConfig).toHaveBeenCalledWith(
      'TASKS_FORCE_DEFAULT_WORKSPACE_REDIRECT',
      expect.objectContaining({
        defaultHeaders: expect.objectContaining({
          authorization: 'Bearer satellite-session',
        }),
      })
    );
  });

  it('rewrites root requests to the configured default workspace task entrypoint', async () => {
    const authRequestHeaders = new Headers({
      cookie: 'sb-test-auth-token=shared',
    });
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(
      authRequestHeaders
    );
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.getUserConfig.mockResolvedValueOnce({ value: 'true' });
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValueOnce({
      id: 'workspace-1',
      personal: false,
    });
    const request = new NextRequest(
      'https://tasks.tuturuuu.com/?settingsDialog=open'
    );

    const response = await proxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://tasks.tuturuuu.com/workspace-1/tasks?settingsDialog=open'
    );
  });
});
