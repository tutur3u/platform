import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSession: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
  headers: vi.fn(),
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

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://chat.tuturuuu.com',
  WEB_APP_URL: 'https://tuturuuu.com',
}));

describe('Chat login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSession.mockResolvedValue(null);
    mocks.headers.mockResolvedValue(new Headers());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
  });

  it('starts the Web login handoff with a Chat verifier return URL', async () => {
    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({
          next: '/personal?scope=workspaces',
        }),
      })
    ).rejects.toThrow(/^redirect:https:\/\/tuturuuu\.com\/login\?/u);

    const redirectedTo = mocks.redirect.mock.calls[0]?.[0];
    if (!redirectedTo) throw new Error('Missing redirect URL');

    const redirectUrl = new URL(redirectedTo);
    expect(redirectUrl.origin).toBe('https://tuturuuu.com');
    expect(redirectUrl.pathname).toBe('/login');

    const returnUrl = new URL(redirectUrl.searchParams.get('returnUrl') ?? '');
    expect(returnUrl.origin).toBe('https://chat.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe(
      '/personal?scope=workspaces'
    );
  });

  it('skips the Web login handoff when Chat and Web app-session cookies exist', async () => {
    mocks.getSatelliteAppSession.mockResolvedValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);

    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '/personal' }),
      })
    ).rejects.toThrow('redirect:/personal');
  });
});
