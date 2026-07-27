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
  BASE_URL: 'https://ai.tuturuuu.com',
  WEB_APP_URL: 'https://tuturuuu.com',
}));

describe('AI Studio login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSession.mockResolvedValue(null);
    mocks.headers.mockResolvedValue(new Headers());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/personal');
  });

  it('uses an existing AI Studio session without another central handoff', async () => {
    mocks.getSatelliteAppSession.mockResolvedValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/internal?tab=playground');

    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({
          nextUrl: '/internal?tab=playground',
        }),
      })
    ).rejects.toThrow('redirect:/internal?tab=playground');

    expect(mocks.normalizeAuthRedirectPath).toHaveBeenCalledWith(
      '/internal?tab=playground',
      'https://ai.tuturuuu.com',
      '/personal'
    );
  });

  it('starts the central handoff at the stable AI workspace fallback', async () => {
    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/^redirect:https:\/\/tuturuuu\.com\/login\?/u);

    const redirectedTo = mocks.redirect.mock.calls[0]?.[0];
    if (!redirectedTo) throw new Error('Missing redirect URL');

    const redirectUrl = new URL(redirectedTo);
    const returnUrl = new URL(redirectUrl.searchParams.get('returnUrl') ?? '');

    expect(returnUrl.origin).toBe('https://ai.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe('/personal');
  });
});
