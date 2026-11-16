import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeAuthRedirectPath } from '../../../../../../../packages/auth/src/proxy/redirect-path';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw new Error(`fixture-redirect:${target}`);
  }),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({ normalizeAuthRedirectPath }));
vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: () => true,
  hasWebAppSessionTokenFromRequest: () => true,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSession: mocks.session,
}));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://tuturuuu.com/mind',
  WEB_APP_URL: 'https://tuturuuu.com',
}));

import LoginPage from './page';

async function destination(next?: string, signedIn = true) {
  mocks.session.mockResolvedValue(signedIn ? { sub: 'fixture-user' } : null);
  await expect(
    LoginPage({ searchParams: Promise.resolve({ next }) })
  ).rejects.toThrow(/^fixture-redirect:/u);
  const target = mocks.redirect.mock.calls.at(-1)?.[0];
  if (!target) throw new Error('Missing login redirect');
  return new URL(target, 'https://tuturuuu.com');
}

describe('mounted Mind login redirect authority', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves a valid mounted destination and encoded query data', async () => {
    const path = '/mind/boards/one?label=one%26two';
    expect((await destination(path)).toString()).toBe(
      `https://tuturuuu.com${path}`
    );
  });

  it('adds the app base to a valid app-relative destination', async () => {
    expect((await destination('/boards/one')).pathname).toBe(
      '/mind/boards/one'
    );
  });

  it('keeps the central login outside Mind and the callback inside Mind', async () => {
    const login = await destination('/boards/one', false);
    expect(`${login.origin}${login.pathname}`).toBe(
      'https://tuturuuu.com/login'
    );
    const callback = new URL(login.searchParams.get('returnUrl') ?? '');
    expect(`${callback.origin}${callback.pathname}`).toBe(
      'https://tuturuuu.com/mind/verify-token'
    );
    expect(callback.searchParams.get('nextUrl')).toBe('/mind/boards/one');
  });

  it.each([
    '//outside.example',
    '/\\outside.example',
    'https://outside.example',
    '/%5coutside.example',
  ])('rejects a foreign destination %j', async (path) => {
    expect((await destination(path)).pathname).toBe('/mind');
  });

  it('unwraps a mounted authentication alias without looping', async () => {
    expect(
      (await destination('/mind/login?next=%2Fmind%2Fboards%2Fone')).pathname
    ).toBe('/mind/boards/one');
    expect((await destination('/mind/verify-token')).pathname).toBe('/mind');
  });
});
