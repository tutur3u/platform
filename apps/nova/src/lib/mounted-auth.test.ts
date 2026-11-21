import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumeMountedSharedSession: vi.fn(),
  resolveMountedSharedSession: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', async (actual) => ({
  ...(await actual<typeof import('@tuturuuu/auth/proxy')>()),
  consumeMountedSharedSession: (
    ...args: Parameters<typeof mocks.consumeMountedSharedSession>
  ) => mocks.consumeMountedSharedSession(...args),
  resolveMountedSharedSession: (
    ...args: Parameters<typeof mocks.resolveMountedSharedSession>
  ) => mocks.resolveMountedSharedSession(...args),
}));

vi.mock('@tuturuuu/auth/proxy/logout-fence', () => ({
  appLogoutFenceResponse: () => null,
  withAppLogoutFence: (_request: NextRequest, run: () => unknown) => run(),
}));

import {
  isMountedNova,
  mountedNovaAuth,
  NOVA_MOUNTED_PUBLIC_PAGES,
} from './mounted-auth';

const mounted = (path: string) =>
  new NextRequest(`https://tuturuuu.com/nova${path}`, {
    nextConfig: { basePath: '/nova' },
  });

describe('mountedNovaAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recognizes only the tuturuuu.com/nova mount', () => {
    expect(isMountedNova(mounted('/en'))).toBe(true);
    expect(isMountedNova(new NextRequest('https://nova.tuturuuu.com/en'))).toBe(
      false
    );
  });

  it('rejects a matching base on another origin or an unmounted apex', () => {
    expect(
      isMountedNova(
        new NextRequest('https://example.com/nova/en', {
          nextConfig: { basePath: '/nova' },
        })
      )
    ).toBe(false);
    expect(isMountedNova(new NextRequest('https://tuturuuu.com/en'))).toBe(
      false
    );
  });

  it('fails closed when account assurance is unavailable', async () => {
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: false,
      error: 'Account assurance unavailable',
    });
    const response = await mountedNovaAuth(mounted('/personal/nova'));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.has('location')).toBe(false);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('continues with a valid shared session', async () => {
    const next = NextResponse.next();
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: true,
      response: next,
    });

    expect(await mountedNovaAuth(mounted('/en/personal/nova'))).toBe(next);
  });

  it('sends an expired session to Web login with an in-mount return', async () => {
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: false,
      error: 'Shared session unavailable',
    });

    const response = await mountedNovaAuth(
      mounted('/en/personal/boards/b1?view=list')
    );
    const login = new URL(response.headers.get('location') ?? '');
    const callback = new URL(login.searchParams.get('returnUrl') ?? '');

    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    expect(callback.origin + callback.pathname).toBe(
      'https://tuturuuu.com/nova/verify-token'
    );
    expect(callback.searchParams.get('nextUrl')).toBe(
      '/en/personal/boards/b1?view=list'
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it.each(['', '/', '/en', '/vi'])(
    'serves the landing page %s signed out',
    async (path) => {
      mocks.resolveMountedSharedSession.mockResolvedValue({
        ok: false,
        error: 'Shared session unavailable',
      });

      const response = await mountedNovaAuth(mounted(path));

      expect(response.headers.get('location')).toBeNull();
    }
  );

  it('asks Web for MFA when assurance is missing', async () => {
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: false,
      error: 'MFA required',
    });

    const response = await mountedNovaAuth(mounted('/en/courses'));

    expect(
      new URL(response.headers.get('location') ?? '').searchParams.get('mfa')
    ).toBe('required');
  });

  it('completes verify-token through the shared session', async () => {
    const done = NextResponse.redirect('https://tuturuuu.com/nova/en');
    mocks.consumeMountedSharedSession.mockResolvedValue(done);

    expect(await mountedNovaAuth(mounted('/en/verify-token?nextUrl=%2F'))).toBe(
      done
    );
    expect(mocks.consumeMountedSharedSession.mock.calls[0]?.[1]).toMatchObject({
      mode: 'supabase-only',
      nextUrlScope: 'app-relative',
      targetApp: 'nova',
      webAppUrl: 'https://tuturuuu.com',
    });
  });
});

describe('NOVA_MOUNTED_PUBLIC_PAGES', () => {
  it('lists only pages Nova serves', () => {
    const app = resolve(process.cwd(), 'src/app/[locale]');
    for (const path of NOVA_MOUNTED_PUBLIC_PAGES) {
      const page =
        path === '/'
          ? join(app, 'page.tsx')
          : join(app, '(marketing)', path, 'page.tsx');
      const rootPage = [
        join(app, 'page.tsx'),
        join(app, '(marketing)', 'page.tsx'),
      ];
      expect(
        path === '/'
          ? rootPage.some((file) => existsSync(file))
          : existsSync(page),
        path
      ).toBe(true);
    }
  });
});
