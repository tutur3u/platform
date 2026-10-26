import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { beforeEach, expect, it, vi } from 'vitest';
import LoginPage from '../app/[locale]/(auth)/login/page';

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSession: async () => null,
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: () => false,
  hasWebAppSessionTokenFromRequest: () => false,
}));
vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://inventory.tuturuuu.com',
  WEB_APP_URL: 'https://tuturuuu.com',
}));

beforeEach(() => vi.clearAllMocks());

it.each([
  [
    'https://inventory.tuturuuu.com/login',
    '',
    'https://inventory.tuturuuu.com/verify-token',
  ],
  [
    'https://tuturuuu.com/inventory/login',
    '/inventory',
    'https://tuturuuu.com/inventory/verify-token',
  ],
])(
  'keeps the login callback on the opened mount %s',
  async (url, appBase, expected) => {
    await withBridgeRequest({ request: new Request(url), appBase }, () =>
      LoginPage({
        searchParams: Promise.resolve({
          next: '/personal/catalog?tag=1&tag=2',
        }),
      })
    );
    const login = new URL(mocks.redirect.mock.calls[0]?.[0]);
    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    const callback = new URL(login.searchParams.get('returnUrl') ?? '');
    expect(callback.origin + callback.pathname).toBe(expected);
    expect(callback.searchParams.get('nextUrl')).toBe(
      '/personal/catalog?tag=1&tag=2'
    );
  }
);

it('preserves the configured Next callback outside bridge requests', async () => {
  await LoginPage({
    searchParams: Promise.resolve({ next: '//untrusted.invalid' }),
  });
  const login = new URL(mocks.redirect.mock.calls[0]?.[0]);
  const callback = new URL(login.searchParams.get('returnUrl') ?? '');
  expect(callback.origin + callback.pathname).toBe(
    'https://inventory.tuturuuu.com/verify-token'
  );
  expect(callback.searchParams.get('nextUrl')).toBe('/dashboard');
});
