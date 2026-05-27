import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  clearSupabaseAuthCookies: vi.fn(
    (_request: NextRequest, response: NextResponse) => response
  ),
  consumeVerifyTokenRequest: vi.fn(),
  createCentralizedAuthProxy: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (
    ...args: Parameters<typeof mocks.clearSupabaseAuthCookies>
  ) => mocks.clearSupabaseAuthCookies(...args),
  getAppSessionClaimsFromRequest: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: (
    ...args: Parameters<typeof mocks.createCentralizedAuthProxy>
  ) => mocks.createCentralizedAuthProxy(...args),
  getRequestHeadersWithResponseCookies: (_request: NextRequest) =>
    new Headers(),
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
  getCurrentUserDefaultWorkspace: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

describe('Calendar proxy verify-token handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.createCentralizedAuthProxy.mockReturnValue(() => NextResponse.next());
  });

  it('consumes verify-token requests before centralized auth and locale rendering', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://calendar.tuturuuu.com/personal'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValue(verifyResponse);
    const request = new NextRequest(
      'https://calendar.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fpersonal'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(mocks.consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });
});
