import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppSessionClaimsFromRequest: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
  headers: vi.fn(),
  normalizeAuthRedirectPath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionClaimsFromRequest: mocks.getAppSessionClaimsFromRequest,
  hasWebAppSessionTokenFromRequest: mocks.hasWebAppSessionTokenFromRequest,
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
  BASE_URL: 'https://meet.tuturuuu.com',
  TTR_URL: 'https://tuturuuu.com',
}));

describe('Meet login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.normalizeAuthRedirectPath.mockReturnValue('/');
  });

  it('skips the central handoff when Meet and Web app-session cookies exist', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue(
      '/workspace/personal/plans'
    );

    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '/workspace/personal/plans' }),
      })
    ).rejects.toThrow('redirect:/workspace/personal/plans');
  });

  it('starts the central web login handoff when the local app-session is missing', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
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
    expect(returnUrl.origin).toBe('https://meet.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe('/');
  });
});
