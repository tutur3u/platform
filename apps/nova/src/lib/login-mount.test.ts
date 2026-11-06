import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { beforeEach, expect, it, vi } from 'vitest';
import Login from '../app/[locale]/login/page';

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://nova.tuturuuu.com',
  TTR_URL: 'https://tuturuuu.com',
}));

beforeEach(() => vi.clearAllMocks());

it.each([
  [
    'https://nova.tuturuuu.com/login',
    '',
    'https://nova.tuturuuu.com/verify-token',
  ],
  [
    'https://tuturuuu.com/nova/login',
    '/nova',
    'https://tuturuuu.com/nova/verify-token',
  ],
])(
  'keeps the login callback on the opened mount %s',
  async (url, appBase, expected) => {
    await withBridgeRequest({ request: new Request(url), appBase }, () =>
      Login({
        searchParams: Promise.resolve({ next: '/challenges?tag=1&tag=2' }),
      })
    );
    const login = new URL(mocks.redirect.mock.calls[0]?.[0]);
    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    expect(login.searchParams.get('provider')).toBe('nova');
    const callback = new URL(login.searchParams.get('returnUrl') ?? '');
    expect(callback.origin + callback.pathname).toBe(expected);
    expect(callback.searchParams.get('nextUrl')).toBe(
      '/challenges?tag=1&tag=2'
    );
  }
);

it('preserves the configured Next callback outside bridge requests', async () => {
  await Login({
    searchParams: Promise.resolve({ next: '//untrusted.invalid' }),
  });
  const login = new URL(mocks.redirect.mock.calls[0]?.[0]);
  const callback = new URL(login.searchParams.get('returnUrl') ?? '');
  expect(callback.origin + callback.pathname).toBe(
    'https://nova.tuturuuu.com/verify-token'
  );
  expect(callback.searchParams.get('nextUrl')).toBe('/home');
});
