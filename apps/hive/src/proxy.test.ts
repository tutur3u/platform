import { clearSupabaseAuthCookies } from '@tuturuuu/auth/app-session';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('next-intl/routing', () => ({
  defineRouting: (config: unknown) => config,
}));

vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: 'a',
    redirect: () => undefined,
    usePathname: () => '/',
    useRouter: () => ({}),
  }),
}));

describe('Hive proxy auth cookie cleanup', () => {
  beforeEach(() => {
    vi.mocked(guardApiProxyRequest).mockReset();
  });

  it('clears stale Supabase auth cookies without touching unrelated cookies', () => {
    const request = new NextRequest('https://hive.tuturuuu.com/dashboard', {
      headers: {
        cookie:
          'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=stale; sb-resolved-kingfish-21146-auth-token.0=chunk; theme=dark',
      },
    });
    const response = clearSupabaseAuthCookies(request, NextResponse.next());

    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token')?.value
    ).toBe('');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.0')?.value
    ).toBe('');
    expect(response.cookies.get('tuturuuu_app_session')).toBeUndefined();
    expect(response.cookies.get('theme')).toBeUndefined();
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('lets local logout skip the generic API guard and clear stale cookies', async () => {
    const request = new NextRequest(
      'https://hive.tuturuuu.com/api/auth/logout',
      {
        headers: {
          cookie:
            'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=stale',
        },
        method: 'POST',
      }
    );

    const response = await proxy(request);

    expect(guardApiProxyRequest).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toContain(
      'sb-resolved-kingfish-21146-auth-token=;'
    );
  });

  it('does not redirect unauthenticated users to the internal listener origin', async () => {
    const response = await proxy(
      new NextRequest('http://0.0.0.0:7814/dashboard')
    );

    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.localhost/login?next=%2Fdashboard'
    );
  });

  it('keeps generic API guard coverage for Hive product APIs', async () => {
    vi.mocked(guardApiProxyRequest).mockResolvedValue(null);

    await proxy(
      new NextRequest('https://hive.tuturuuu.com/api/v1/hive/servers')
    );

    expect(guardApiProxyRequest).toHaveBeenCalledTimes(1);
  });
});
