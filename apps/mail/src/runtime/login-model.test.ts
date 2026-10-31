import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  web: vi.fn(),
  supabase: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionClaimsFromRequest: mocks.claims,
  hasWebAppSessionTokenFromRequest: mocks.web,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteSupabaseSessionUser: mocks.supabase,
}));
vi.mock('../constants/common', () => ({
  BASE_URL: 'https://mail.tuturuuu.com',
  TTR_URL: 'https://tuturuuu.com',
}));

import LoginPage from '../app/[locale]/(auth)/login/page';
import { withMailRequest } from './request-context';

function login(
  params: Record<string, string>,
  url = 'https://mail.tuturuuu.com/login',
  appBase = ''
) {
  return withMailRequest(
    {
      request: new Request(url),
      appBase,
      responseHeaders: new Headers(),
      waitUntil: () => {},
    },
    () => LoginPage({ searchParams: Promise.resolve(params) })
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockReturnValue(null);
  mocks.web.mockReturnValue(false);
  mocks.supabase.mockResolvedValue(null);
});
describe('native canonical Mail SSO model', () => {
  it('keeps external next redirects inside the local default before central SSO', async () => {
    const returnUrl = new URL('/verify-token', 'https://mail.tuturuuu.com');
    returnUrl.searchParams.set('nextUrl', '/personal');
    const destination = new URL('/login', 'https://tuturuuu.com');
    destination.searchParams.set('returnUrl', returnUrl.toString());
    await expect(
      login({ next: 'https://attacker.example' })
    ).rejects.toMatchObject({ options: { href: destination.toString() } });
  });
  it('keeps mounted central sign-in returns on the serving host and rejects foreign next URLs', async () => {
    const target = new URL('/login', 'https://tuturuuu.com');
    const back = new URL('/mail/verify-token', 'https://tuturuuu.com');
    back.searchParams.set('nextUrl', '/personal');
    target.searchParams.set('returnUrl', back.toString());
    await expect(
      login(
        { next: 'https://attacker.example' },
        'https://tuturuuu.com/mail/login',
        '/mail'
      )
    ).rejects.toMatchObject({ options: { href: target.toString() } });
  });
  it('requires web-session proof with an app claim and honors forced refresh', async () => {
    mocks.claims.mockReturnValue({ sub: 'actor' });
    await expect(login({ next: '/personal/sent' })).rejects.toMatchObject({
      options: { href: expect.stringContaining('https://tuturuuu.com/login?') },
    });
    mocks.web.mockReturnValue(true);
    await expect(login({ next: '/personal/sent' })).rejects.toMatchObject({
      options: { href: '/personal/sent' },
    });
    await expect(
      login({ next: '/personal/sent', refresh: '1' })
    ).rejects.toMatchObject({
      options: { href: expect.stringContaining('https://tuturuuu.com/login?') },
    });
  });
  it('retains Supabase-first signed-in return paths', async () => {
    mocks.supabase.mockResolvedValue({ id: 'actor' });
    await expect(
      login({ nextUrl: '/personal/drafts?compose=1' })
    ).rejects.toMatchObject({
      options: { href: '/personal/drafts?compose=1' },
    });
  });
});
