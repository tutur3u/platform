import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppSessionClaimsFromRequest: vi.fn(),
  getSatelliteSupabaseSessionUser: vi.fn(),
  getTranslations: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionClaimsFromRequest: mocks.getAppSessionClaimsFromRequest,
  getSupabaseSessionUser: mocks.getSatelliteSupabaseSessionUser,
  hasWebAppSessionTokenFromRequest: mocks.hasWebAppSessionTokenFromRequest,
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteSupabaseSessionUser: mocks.getSatelliteSupabaseSessionUser,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}));

vi.mock('@/constants/common', () => ({
  HIVE_APP_URL: 'https://hive.tuturuuu.com',
  WEB_APP_URL: 'https://tuturuuu.com',
}));

function findHref(
  node: unknown,
  predicate: (href: string) => boolean
): string | null {
  if (!isValidElement(node)) {
    return null;
  }

  const props = node.props as { children?: ReactNode; href?: unknown };

  if (typeof props.href === 'string' && predicate(props.href)) {
    return props.href;
  }

  for (const child of Children.toArray(props.children)) {
    const href = findHref(child, predicate);

    if (href) {
      return href;
    }
  }

  return null;
}

describe('Hive login page redirect targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getSatelliteSupabaseSessionUser.mockResolvedValue(null);
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.headers.mockResolvedValue(new Headers());
  });

  it('redirects existing app and Web sessions to a safe single-slash next path', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-1' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '/dashboard' }),
      })
    ).rejects.toThrow('redirect:/dashboard');
  });

  it('falls back for protocol-relative next paths when a session already exists', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-1' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '//evil.test/phish' }),
      })
    ).rejects.toThrow('redirect:/');
  });

  it('redirects existing Supabase sessions to the local next path', async () => {
    mocks.getSatelliteSupabaseSessionUser.mockResolvedValue({ id: 'user-1' });
    const LoginPage = (await import('./page')).default;

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: '/dashboard' }),
      })
    ).rejects.toThrow('redirect:/dashboard');
  });

  it('encodes unsafe unauthenticated handoffs with a local verifier fallback', async () => {
    const LoginPage = (await import('./page')).default;

    const result = await LoginPage({
      searchParams: Promise.resolve({ next: '//evil.test/phish' }),
    });
    const href = findHref(result, (value) =>
      value.startsWith('https://tuturuuu.com/login?')
    );

    expect(href).toBeTruthy();

    const loginUrl = new URL(href ?? '');
    const returnUrl = new URL(loginUrl.searchParams.get('returnUrl') ?? '');

    expect(returnUrl.origin).toBe('https://hive.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe('/');
  });
});
