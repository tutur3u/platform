import { randomBytes } from 'node:crypto';
import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import { expect, test, vi } from 'vitest';
import type { MastermindEnvironment } from './auth';
import { legacyDefaultLocalePath } from './locale-path';
import { pathLocale } from './notice';
import { mastermindRequest } from './request';

const secret = randomBytes(48).toString('hex');
const env: MastermindEnvironment = {
  MASTERMIND_OWNER_EMAIL: 'owner@example.invalid',
  OWNER_IDS: 'owner',
  TUTURUUU_APP_COORDINATION_SECRET: secret,
};
const now = Date.now();
const render = vi.fn(() => new Response('page'));
const call = (path: string, init: RequestInit = {}) =>
  mastermindRequest(
    new Request(`https://mastermind.tuturuuu.com${path}`, init),
    env,
    render,
    now
  );

test.each([
  ['/en', '/'],
  ['/en/', '/'],
  ['/en/ship', '/ship'],
  ['/en/fleet-access', '/fleet-access'],
  ['/en//evil.example', '/'],
  ['/english', null],
  ['/vi/ship', null],
  ['/ship', null],
])('legacy %s maps to %s', (path, expected) => {
  expect(legacyDefaultLocalePath(path)).toBe(expected);
});

test('old /en links move permanently to the unprefixed path before any session work', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const [path, location] of [
    ['/en', '/'],
    ['/en/ship?fresh=1', '/ship?fresh=1'],
    ['/en/projects?thread=t', '/projects?thread=t'],
    ['/en//evil.example', '/'],
  ] as const) {
    const response = await call(path, {
      headers: { 'Sec-Fetch-Mode': 'navigate' },
    });
    expect(response.status, path).toBe(308);
    expect(response.headers.get('Location'), path).toBe(location);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  }
  expect((await call('/en/ship', { method: 'HEAD' })).status).toBe(308);
  // Only reads move; a write to a legacy path is refused as before.
  expect((await call('/en/ship', { method: 'POST' })).status).not.toBe(308);
  expect(fetcher).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test('a sign-in callback that cannot finish explains itself and offers another sign-in', async () => {
  const response = await call(
    `/verify-token?token=${'a'.repeat(64)}&nextUrl=${encodeURIComponent('/vi/ship?mm_state=x')}`,
    { headers: { 'Sec-Fetch-Mode': 'navigate' } }
  );
  expect(response.status).toBe(403);
  expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  expect(response.headers.getSetCookie()[0]).toMatch(
    /^__Host-mastermind_login_state=; Path=\/; Max-Age=0;/
  );
  const page = await response.text();
  expect(page).toContain('lang="vi"');
  expect(page).toContain('Đăng nhập chưa hoàn tất');
  // The retry drops the spent login state and keeps the page.
  expect(page).toContain('href="/login?nextUrl=%2Fvi%2Fship"');
  expect(page).not.toContain('<script');
});

test('another account on an owner page gets the account choice, not a bare Forbidden', async () => {
  const token = createAppSessionToken(
    {
      targetApp: 'mastermind',
      userId: 'someone',
      email: 'x@example.invalid',
      expiresInSeconds: 300,
    },
    { secret, now: new Date(now - 1000) }
  ).token;
  const navigation = await call('/ship', {
    headers: {
      cookie: `__Host-mastermind_session=${token}`,
      'Sec-Fetch-Mode': 'navigate',
    },
  });
  expect(navigation.status).toBe(403);
  const page = await navigation.text();
  expect(page).toContain('This account cannot open Mastermind');
  expect(page).toContain('href="/login?account=choose&amp;nextUrl=%2Fship"');
  const fetchCall = await call('/ship', {
    headers: { cookie: `__Host-mastermind_session=${token}` },
  });
  expect(fetchCall.status).toBe(403);
  expect(await fetchCall.text()).toBe('Forbidden');
  expect(render).not.toHaveBeenCalled();
});

test('choosing another account keeps the destination for a signed-in grantee', async () => {
  const token = createAppSessionToken(
    {
      targetApp: 'mastermind',
      userId: 'grantee',
      email: 'ops@example.invalid',
      expiresInSeconds: 300,
    },
    { secret, now: new Date(now - 1000) }
  ).token;
  const nextOf = async (query: string) => {
    const response = await call(`/login?${query}`, {
      headers: { cookie: `__Host-mastermind_session=${token}` },
    });
    const login = new URL(response.headers.get('Location') ?? '');
    const back = new URL(login.searchParams.get('returnUrl') ?? '');
    return new URL(
      back.searchParams.get('nextUrl') ?? '',
      'https://mastermind.tuturuuu.com'
    ).pathname;
  };
  expect(await nextOf('nextUrl=%2Fship')).toBe('/fleet-access');
  expect(await nextOf('account=choose&nextUrl=%2Fship')).toBe('/ship');
});

test('the Worker /login can ask Web for the account picker', async () => {
  const response = await call('/login?account=choose&nextUrl=%2Fship');
  const login = new URL(response.headers.get('Location') ?? '');
  expect(login.searchParams.get('confirmAccount')).toBe('1');
  const plain = await call('/login?nextUrl=%2Fship');
  expect(
    new URL(plain.headers.get('Location') ?? '').searchParams.has(
      'confirmAccount'
    )
  ).toBe(false);
});

test.each([
  ['/vi', 'vi'],
  ['/vi/ship', 'vi'],
  ['/vi?x=1', 'vi'],
  ['/video', 'en'],
  ['/ship', 'en'],
])('notice locale for %s is %s', (path, locale) => {
  expect(pathLocale(path)).toBe(locale);
});

test('a browser with a central session goes to Web signed-in continue, not the sign-in page', async () => {
  const target = async (path: string, cookie?: string) => {
    const response = await call(path, {
      headers: {
        'Sec-Fetch-Mode': 'navigate',
        ...(cookie ? { cookie } : {}),
      },
    });
    const location = new URL(response.headers.get('Location') ?? '');
    return location.origin + location.pathname;
  };
  const central = 'sb-abcdefgh-auth-token.0=x';
  expect(await target('/ship', central)).toBe(
    'https://tuturuuu.com/api/v1/auth/cross-app-return'
  );
  expect(await target('/login?nextUrl=%2Fship', central)).toBe(
    'https://tuturuuu.com/api/v1/auth/cross-app-return'
  );
  expect(await target('/ship')).toBe('https://tuturuuu.com/login');
  expect(await target('/ship', 'other=1')).toBe('https://tuturuuu.com/login');
  // A step-up or an account choice needs the sign-in page itself.
  expect(await target('/login?account=choose&nextUrl=%2Fship', central)).toBe(
    'https://tuturuuu.com/login'
  );
  expect(await target('/login?mfa=fresh&nextUrl=%2Fship', central)).toBe(
    'https://tuturuuu.com/login'
  );
});
