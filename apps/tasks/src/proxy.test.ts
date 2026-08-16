import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TTR_URL } from './constants/common';
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
    resolveTaskBoardEntrypoint: vi.fn(),
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

vi.mock('@/lib/tasks/task-board-entrypoint', () => ({
  resolveTaskBoardEntrypoint: (
    ...args: Parameters<typeof mocks.resolveTaskBoardEntrypoint>
  ) => mocks.resolveTaskBoardEntrypoint(...args),
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
    mocks.resolveTaskBoardEntrypoint.mockResolvedValue('board-default');
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

  it('redirects non-owned time tracker pages to the web app', async () => {
    const request = new NextRequest(
      'https://tasks.tuturuuu.com/personal/time-tracker/timer?taskSelect=task-1'
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      new URL(
        '/personal/time-tracker/timer?taskSelect=task-1',
        TTR_URL
      ).toString()
    );
    expect(mocks.propagateAuthCookies).toHaveBeenCalledWith(
      expect.any(NextResponse),
      response
    );
  });

  it('preserves locale and query when redirecting non-owned pages', async () => {
    const request = new NextRequest(
      'https://tasks.tuturuuu.com/vi/workspace-1/time-tracker/history?period=week'
    );

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      new URL(
        '/vi/workspace-1/time-tracker/history?period=week',
        TTR_URL
      ).toString()
    );
  });

  it.each([
    '/personal/tasks',
    '/workspace-1/boards/board-1',
    '/workspace-1/analytics',
    '/vi/workspace-1/progress/overview',
    '/shared/task/share-code',
  ])('keeps owned Tasks route %s in the satellite', async (path) => {
    const response = await proxy(
      new NextRequest(`https://tasks.tuturuuu.com${path}`)
    );

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([
    ['/personal/boards/board-1?task=task-1', 'en'],
    ['/vi/workspace-1/tasks/task-1', 'vi'],
    ['/shared/task/share-code', 'en'],
  ])(
    'serves branded metadata on task links for social crawler %s',
    async (path, locale) => {
      const response = await proxy(
        new NextRequest(`https://tasks.tuturuuu.com${path}`, {
          headers: { 'user-agent': 'facebookexternalhit/1.1' },
        })
      );

      expect(response.headers.get('x-middleware-rewrite')).toBe(
        `https://tasks.tuturuuu.com/${locale}/task-link-preview`
      );
      expect(response.headers.get('cache-control')).toBe(
        'private, no-store, max-age=0'
      );
      expect(response.headers.get('vary')).toContain('User-Agent');
      expect(mocks.authProxy).not.toHaveBeenCalled();
    }
  );

  it('keeps ordinary task-link navigation behind authentication', async () => {
    const response = await proxy(
      new NextRequest(
        'https://tasks.tuturuuu.com/personal/boards/board-1?task=task-1',
        { headers: { 'user-agent': 'Mozilla/5.0' } }
      )
    );

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(mocks.authProxy).toHaveBeenCalled();
  });

  it('redirects auth-approved root requests to the personal default board', async () => {
    const authRequestHeaders = new Headers({
      cookie: 'sb-test-auth-token=shared',
    });
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(
      authRequestHeaders
    );
    const request = new NextRequest('https://tasks.tuturuuu.com/');

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://tasks.tuturuuu.com/personal/boards/board-default'
    );
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    );
    expect(mocks.resolveTaskBoardEntrypoint).toHaveBeenCalledWith(
      'personal',
      {
        defaultHeaders: { authorization: 'Bearer satellite-session' },
      },
      { locale: 'en' }
    );
    expect(mocks.propagateAuthCookies).toHaveBeenCalledWith(
      expect.any(NextResponse),
      response
    );
  });

  it('uses the personal board when preferred workspace lookup fails', async () => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.getUserConfig.mockRejectedValueOnce(
      new Error('Forwarded session unavailable')
    );
    const request = new NextRequest('https://tasks.tuturuuu.com/');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://tasks.tuturuuu.com/personal/boards/board-default'
    );
  });

  it('redirects root requests to the configured default workspace board', async () => {
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

    expect(response.headers.get('location')).toBe(
      'https://tasks.tuturuuu.com/workspace-1/boards/board-default?settingsDialog=open'
    );
    expect(mocks.resolveTaskBoardEntrypoint).toHaveBeenCalledWith(
      'workspace-1',
      expect.any(Object),
      { locale: 'en' }
    );
  });

  it('normalizes the configured root workspace to the internal board URL', async () => {
    mocks.getUserConfig.mockResolvedValueOnce({ value: 'true' });
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-000000000000',
      personal: false,
    });

    const response = await proxy(
      new NextRequest('https://tasks.tuturuuu.com/')
    );

    expect(response.headers.get('location')).toBe(
      'https://tasks.tuturuuu.com/internal/boards/board-default'
    );
    expect(mocks.resolveTaskBoardEntrypoint).toHaveBeenCalledWith(
      'internal',
      expect.any(Object),
      { locale: 'en' }
    );
  });

  it('preserves an explicit locale and query parameters in the board redirect', async () => {
    mocks.resolveTaskBoardEntrypoint.mockResolvedValueOnce('board-new');

    const response = await proxy(
      new NextRequest(
        'https://tasks.tuturuuu.com/vi?settingsDialog=open&tab=tasks'
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://tasks.tuturuuu.com/vi/personal/boards/board-new?settingsDialog=open&tab=tasks'
    );
    expect(mocks.resolveTaskBoardEntrypoint).toHaveBeenCalledWith(
      'personal',
      expect.any(Object),
      { locale: 'vi' }
    );
  });

  it('rewrites to the localized task entrypoint when board resolution fails', async () => {
    mocks.resolveTaskBoardEntrypoint.mockResolvedValueOnce(null);

    const response = await proxy(
      new NextRequest('https://tasks.tuturuuu.com/vi?retry=1')
    );

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://tasks.tuturuuu.com/vi/personal/tasks?retry=1'
    );
  });

  it('rewrites to the task entrypoint when board resolution throws', async () => {
    mocks.resolveTaskBoardEntrypoint.mockRejectedValueOnce(
      new Error('Board API unavailable')
    );

    const response = await proxy(
      new NextRequest('https://tasks.tuturuuu.com/?retry=1')
    );

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://tasks.tuturuuu.com/en/personal/tasks?retry=1'
    );
  });

  it.each(['no-redirect=1', 'hash-nav=1', 'multiAccount=1'])(
    'keeps root redirect exclusions for %s',
    async (query) => {
      const response = await proxy(
        new NextRequest(`https://tasks.tuturuuu.com/?${query}`)
      );

      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.resolveTaskBoardEntrypoint).not.toHaveBeenCalled();
    }
  );
});
