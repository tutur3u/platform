import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSession: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
  headers: vi.fn(),
  normalizeAuthRedirectPath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: mocks.hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest: mocks.hasWebAppSessionTokenFromRequest,
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  normalizeAuthRedirectPath: mocks.normalizeAuthRedirectPath,
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSession: mocks.getSatelliteAppSession,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://git.tuturuuu.com',
  WEB_APP_URL: 'https://tuturuuu.com',
}));

describe('Git login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
    mocks.getSatelliteAppSession.mockResolvedValue(null);
    mocks.headers.mockResolvedValue(new Headers());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/-/internal/repositories');
  });

  it('starts the central handoff at the stable Git workspace fallback', async () => {
    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({ searchParams: Promise.resolve({}) })
    ).rejects.toHaveProperty(
      'message',
      expect.stringMatching(/^redirect:https:\/\/tuturuuu\.com\/login\?/u)
    );

    const redirectedTo = mocks.redirect.mock.calls[0]?.[0];
    if (!redirectedTo) throw new Error('Missing redirect URL');

    const redirectUrl = new URL(redirectedTo);
    const returnUrl = new URL(redirectUrl.searchParams.get('returnUrl') ?? '');

    expect(returnUrl.origin).toBe('https://git.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe(
      '/-/internal/repositories'
    );
  });
  it('keeps the central login return under the apex mount', async () => {
    const LoginPage = (await import('./page')).default;
    await expect(
      withBridgeRequest(
        {
          request: new Request('https://tuturuuu.com/git/login'),
          appBase: '/git',
        },
        () => LoginPage({ searchParams: Promise.resolve({}) })
      )
    ).rejects.toHaveProperty(
      'message',
      expect.stringMatching(/^redirect:https:\/\/tuturuuu\.com\/login\?/u)
    );
    const target = new URL(mocks.redirect.mock.calls[0]![0]);
    const returnUrl = new URL(target.searchParams.get('returnUrl')!);
    expect(returnUrl.origin).toBe('https://tuturuuu.com');
    expect(returnUrl.pathname).toBe('/git/verify-token');
  });
});
