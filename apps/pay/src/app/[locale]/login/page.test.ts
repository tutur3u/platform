import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { beforeEach, expect, it, vi } from 'vitest';
import LoginPage from './page';

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
  BASE_URL: 'https://pay.tuturuuu.com',
  WEB_APP_URL: 'https://tuturuuu.com',
}));

beforeEach(() => vi.clearAllMocks());

it.each([
  [
    'https://pay.tuturuuu.com/login',
    '',
    'https://pay.tuturuuu.com/verify-token',
  ],
  [
    'https://tuturuuu.com/pay/login',
    '/pay',
    'https://tuturuuu.com/pay/verify-token',
  ],
])(
  'keeps the login callback on the opened mount %s',
  async (url, appBase, expected) => {
    await withBridgeRequest({ request: new Request(url), appBase }, () =>
      LoginPage({
        searchParams: Promise.resolve({
          next: '/personal?tag=1&tag=2',
        }),
      })
    );
    const login = new URL(mocks.redirect.mock.calls[0]?.[0]);
    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    const callback = new URL(login.searchParams.get('returnUrl') ?? '');
    expect(callback.origin + callback.pathname).toBe(expected);
    expect(callback.searchParams.get('nextUrl')).toBe('/personal?tag=1&tag=2');
  }
);
