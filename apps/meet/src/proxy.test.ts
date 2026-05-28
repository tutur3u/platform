import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => {
  const authProxy = vi.fn();

  return {
    authProxy,
    clearSupabaseAuthCookies: vi.fn(
      (_request: NextRequest, response: NextResponse) => response
    ),
    consumeVerifyTokenRequest: vi.fn(),
    createCentralizedAuthProxy: vi.fn(() => authProxy),
    guardApiProxyRequest: vi.fn(),
    propagateAuthCookies: vi.fn(),
    refreshAppSessionForRequest: vi.fn(),
  };
});

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (
    ...args: Parameters<typeof mocks.clearSupabaseAuthCookies>
  ) => mocks.clearSupabaseAuthCookies(...args),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: (
    ...args: Parameters<typeof mocks.createCentralizedAuthProxy>
  ) => mocks.createCentralizedAuthProxy(...args),
  propagateAuthCookies: (
    ...args: Parameters<typeof mocks.propagateAuthCookies>
  ) => mocks.propagateAuthCookies(...args),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
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

vi.mock('@/i18n/routing', () => ({
  supportedLocales: ['en', 'vi'],
}));

describe('Meet proxy auth handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
  });

  it('consumes verify-token requests before centralized auth redirects', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://meet.tuturuuu.localhost/'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValueOnce(verifyResponse);
    const request = new NextRequest(
      'https://meet.tuturuuu.localhost/verify-token?token=copy-token&nextUrl=%2F'
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
});
