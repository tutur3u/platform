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

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSession: mocks.getSatelliteAppSession,
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  normalizeAuthRedirectPath: mocks.normalizeAuthRedirectPath,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://calendar.tuturuuu.com',
  TTR_URL: 'https://tuturuuu.com',
}));

describe('Calendar login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSession.mockResolvedValue(null);
    mocks.headers.mockResolvedValue(new Headers());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/personal');
  });

  it('skips the central handoff when Calendar and Web app-session cookies exist', async () => {
    mocks.getSatelliteAppSession.mockResolvedValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/internal?view=week');

    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '/internal?view=week' }),
      })
    ).rejects.toThrow('redirect:/internal?view=week');
  });

  it('starts the central web login handoff when the local app-session is missing', async () => {
    mocks.getSatelliteAppSession.mockResolvedValue(null);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);

    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/^redirect:https:\/\/tuturuuu\.com\/login\?/u);

    const redirectedTo = mocks.redirect.mock.calls[0]?.[0];
    if (!redirectedTo) throw new Error('Missing redirect URL');

    const redirectUrl = new URL(redirectedTo);
    expect(redirectUrl.pathname).toBe('/login');

    const returnUrl = new URL(redirectUrl.searchParams.get('returnUrl') ?? '');
    expect(returnUrl.origin).toBe('https://calendar.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe('/personal');
  });
});
