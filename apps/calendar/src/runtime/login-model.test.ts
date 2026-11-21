import { beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ appSession: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSession: auth.appSession,
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

beforeEach(() => {
  auth.appSession.mockResolvedValue(null);
});

it('keeps the existing subdomain verifier handoff', async () => {
  const verifier = new URL('https://calendar.tuturuuu.com/verify-token');
  verifier.searchParams.set('nextUrl', '/personal');
  const web = new URL('https://tuturuuu.com/login');
  web.searchParams.set('returnUrl', verifier.href);
  await expect(
    withCalendarRequest(
      {
        request: new Request('https://calendar.tuturuuu.com/login'),
        appBase: '',
        responseHeaders: new Headers(),
        waitUntil: () => {},
      },
      () => LoginPage({ searchParams: Promise.resolve({ next: '/personal' }) })
    )
  ).rejects.toMatchObject({ options: { href: web.href } });
});
