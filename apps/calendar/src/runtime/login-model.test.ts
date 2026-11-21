import { beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  appSession: vi.fn(),
  sharedUser: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSession: auth.appSession,
  getSatelliteSupabaseSessionUser: auth.sharedUser,
}));
vi.mock('../constants/common', () => ({
  BASE_URL: 'https://calendar.tuturuuu.com',
  TTR_URL: 'https://tuturuuu.com',
}));
vi.mock('next/headers', () => import('@tuturuuu/start-bridge/next/headers'));
vi.mock(
  'next/navigation',
  () => import('@tuturuuu/start-bridge/next/navigation')
);

import LoginPage from '../app/[locale]/(auth)/login/page';
import { withCalendarRequest } from './request-context';

function login(next: string, mounted: boolean) {
  return withCalendarRequest(
    {
      request: new Request(
        mounted
          ? 'https://tuturuuu.com/calendar/login'
          : 'https://calendar.tuturuuu.com/login'
      ),
      appBase: mounted ? '/calendar' : '',
      responseHeaders: new Headers(),
      waitUntil: () => {},
    },
    () => LoginPage({ searchParams: Promise.resolve({ next }) })
  );
}

beforeEach(() => {
  auth.appSession.mockResolvedValue(null);
  auth.sharedUser.mockResolvedValue(null);
});

it('returns a signed-out apex visitor directly to their Calendar path and query', async () => {
  const next = '/vi/personal?date=2026-11-21&q=a%2Bb&tag=1&tag=2';
  const web = new URL('https://tuturuuu.com/login');
  web.searchParams.set('returnUrl', 'https://tuturuuu.com/calendar' + next);
  await expect(login(next, true)).rejects.toMatchObject({
    options: { href: web.href },
  });
});

it('returns an already verified visitor within the Calendar mount', async () => {
  auth.sharedUser.mockResolvedValue({ id: 'verified-actor' });
  await expect(login('/personal?date=2026-11-21', true)).rejects.toMatchObject({
    options: { href: '/calendar/personal?date=2026-11-21' },
  });
});

it('keeps the existing subdomain verifier handoff', async () => {
  const verifier = new URL('https://calendar.tuturuuu.com/verify-token');
  verifier.searchParams.set('nextUrl', '/personal');
  const web = new URL('https://tuturuuu.com/login');
  web.searchParams.set('returnUrl', verifier.href);
  await expect(login('/personal', false)).rejects.toMatchObject({
    options: { href: web.href },
  });
});
