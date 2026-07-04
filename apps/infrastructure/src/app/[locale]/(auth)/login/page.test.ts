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
  BASE_URL: 'https://infrastructure.tuturuuu.com',
  TTR_URL: 'https://tuturuuu.com',
}));

describe('Infrastructure login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSession.mockResolvedValue(null);
    mocks.headers.mockResolvedValue(new Headers());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/internal');
  });

  it('starts the central web login handoff with the internal workspace fallback', async () => {
    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/^redirect:https:\/\/tuturuuu\.com\/login\?/u);

    expect(mocks.normalizeAuthRedirectPath).toHaveBeenCalledWith(
      undefined,
      'https://infrastructure.tuturuuu.com',
      '/internal'
    );

    const redirectedTo = mocks.redirect.mock.calls[0]?.[0];
    if (!redirectedTo) throw new Error('Missing redirect URL');

    const redirectUrl = new URL(redirectedTo);
    expect(redirectUrl.pathname).toBe('/login');

    const returnUrl = new URL(redirectUrl.searchParams.get('returnUrl') ?? '');
    expect(returnUrl.origin).toBe('https://infrastructure.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe('/internal');
  });

  it('redirects stale personal workspace next paths to internal when already authenticated', async () => {
    mocks.getSatelliteAppSession.mockResolvedValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/personal?tab=overview');

    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '/personal?tab=overview' }),
      })
    ).rejects.toThrow('redirect:/internal?tab=overview');
  });

  it('preserves stale personal workspace child paths under internal', async () => {
    mocks.getSatelliteAppSession.mockResolvedValue({ sub: 'user-id' });
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue(
      '/personal/monitoring/logs?status=error'
    );

    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({
          next: '/personal/monitoring/logs?status=error',
        }),
      })
    ).rejects.toThrow('redirect:/internal/monitoring/logs?status=error');
  });
});
