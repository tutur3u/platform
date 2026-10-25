import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  getCurrentUserDefaultWorkspace: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_req: NextRequest, response: NextResponse) =>
    response,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: () => mocks.hasSupportedSupabaseAuthCookie(),
  hasWebAppSessionTokenFromRequest: () => false,
}));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: async () => null,
  createCentralizedAuthProxy: () => mocks.authProxy,
  getRequestHeadersWithResponseCookies: () => new Headers(),
  propagateAuthCookies: () => {},
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: () => mocks.getCurrentUserDefaultWorkspace(),
  withForwardedInternalApiAuth: () => ({}),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: async () => null,
  hasAuthenticatedBearerToken: () => false,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: () => mocks.isPersonalWorkspace(),
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

/** Track mounted at `tuturuuu.com/track` (Next basePath). */
const mounted = (path: string) =>
  new NextRequest(`https://tuturuuu.com/track${path}`, {
    nextConfig: { basePath: '/track' },
  });

describe('Track proxy redirects under a basePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.isPersonalWorkspace.mockResolvedValue(false);
  });

  it('keeps the root workspace normalization inside the base', async () => {
    const response = await proxy(
      mounted('/en/00000000-0000-0000-0000-000000000000/history?range=7d')
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/track/en/internal/history?range=7d'
    );
  });

  it('keeps the personal workspace redirect inside the base', async () => {
    mocks.isPersonalWorkspace.mockResolvedValue(true);

    const response = await proxy(
      mounted('/11111111-1111-4111-8111-111111111111/history')
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/track/personal/history'
    );
  });

  it('sends the app root to the default workspace inside the base', async () => {
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: 'workspace-1',
      personal: false,
    });

    const response = await proxy(mounted('/'));

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/track/workspace-1'
    );
  });

  it('falls back to the personal workspace inside the base', async () => {
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);

    const response = await proxy(mounted('/'));

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/track/personal'
    );
  });

  it('is unchanged at the subdomain root', async () => {
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest('https://track.tuturuuu.com/')
    );

    expect(response.headers.get('location')).toBe(
      'https://track.tuturuuu.com/personal'
    );
  });
});
