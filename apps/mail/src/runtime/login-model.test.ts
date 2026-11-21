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
  it.each([
    [{ next: 'https://attacker.example' }, '/mail/personal'],
    [{ next: '/vi/personal/sent?q=a+b' }, '/mail/vi/personal/sent?q=a+b'],
    [{}, '/mail/personal'],
    [{ next: '/verify-token?nextUrl=%2Fvi%2Fpersonal' }, '/mail/vi/personal'],
    [{ next: '/vi/login' }, '/mail/personal'],
    [{ next: '/mail/vi/login' }, '/mail/personal'],
  ])(
    'returns mounted central sign-in %j straight to the mounted destination',
    async (params, destination) => {
      const target = new URL('/login', 'https://tuturuuu.com');
      target.searchParams.set(
        'returnUrl',
        new URL(destination, 'https://tuturuuu.com').toString()
      );
      await expect(
        login(params, 'https://tuturuuu.com/mail/login', '/mail')
      ).rejects.toMatchObject({ options: { href: target.toString() } });
    }
  );
  it('never routes the mounted return through verify-token', async () => {
    const error = await login(
      { next: '/personal/inbox' },
      'https://tuturuuu.com/mail/login',
      '/mail'
    ).catch((thrown: unknown) => thrown);
    const href = (error as { options: { href: string } }).options.href;
    const returnUrl = new URL(href).searchParams.get('returnUrl') ?? '';
    expect(new URL(returnUrl).origin).toBe('https://tuturuuu.com');
    expect(returnUrl).toBe('https://tuturuuu.com/mail/personal/inbox');
    expect(returnUrl).not.toContain('verify-token');
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
  it('retains the mounted path for an already verified actor', async () => {
    mocks.supabase.mockResolvedValue({ id: 'actor' });
    await expect(
      login(
        { next: '/vi/personal/drafts?compose=1' },
        'https://tuturuuu.com/mail/login',
        '/mail'
      )
    ).rejects.toMatchObject({
      options: { href: '/mail/vi/personal/drafts?compose=1' },
    });
  });
});
