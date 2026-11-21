import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumeMountedSharedSession: vi.fn(),
  resolveMountedSharedSession: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
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

import { isMountedTeach, mountedTeachAuth } from './mounted-auth';

const mounted = (path: string) =>
  new NextRequest(`https://tuturuuu.com/teach${path}`, {
    nextConfig: { basePath: '/teach' },
  });

describe('mountedTeachAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recognizes only the tuturuuu.com/teach mount', () => {
    expect(isMountedTeach(mounted('/en'))).toBe(true);
    expect(
      isMountedTeach(new NextRequest('https://teach.tuturuuu.com/en'))
    ).toBe(false);
  });

  it('rejects a matching base on another origin or an unmounted apex', () => {
    expect(
      isMountedTeach(
        new NextRequest('https://example.com/teach/en', {
          nextConfig: { basePath: '/teach' },
        })
      )
    ).toBe(false);
    expect(isMountedTeach(new NextRequest('https://tuturuuu.com/en'))).toBe(
      false
    );
  });

  it('fails closed when account assurance is unavailable', async () => {
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: false,
      error: 'Account assurance unavailable',
    });
    const response = await mountedTeachAuth(mounted('/personal/teach'));
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

    expect(await mountedTeachAuth(mounted('/en/personal/teach'))).toBe(next);
  });

  it('sends an expired session to Web login with an in-mount return', async () => {
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: false,
      error: 'Shared session unavailable',
    });

    const response = await mountedTeachAuth(
      mounted('/en/personal/boards/b1?view=list')
    );
    const login = new URL(response.headers.get('location') ?? '');
    const callback = new URL(login.searchParams.get('returnUrl') ?? '');

    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    expect(callback.origin + callback.pathname).toBe(
      'https://tuturuuu.com/teach/verify-token'
    );
    expect(callback.searchParams.get('nextUrl')).toBe(
      '/en/personal/boards/b1?view=list'
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('asks Web for MFA when assurance is missing', async () => {
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: false,
      error: 'MFA required',
    });

    const response = await mountedTeachAuth(mounted('/en'));

    expect(
      new URL(response.headers.get('location') ?? '').searchParams.get('mfa')
    ).toBe('required');
  });

  it('completes verify-token through the shared session', async () => {
    const done = NextResponse.redirect('https://tuturuuu.com/teach/en');
    mocks.consumeMountedSharedSession.mockResolvedValue(done);

    expect(
      await mountedTeachAuth(mounted('/en/verify-token?nextUrl=%2F'))
    ).toBe(done);
    expect(mocks.consumeMountedSharedSession.mock.calls[0]?.[1]).toMatchObject({
      mode: 'supabase-only',
      nextUrlScope: 'app-relative',
      targetApp: 'teach',
      webAppUrl: 'https://tuturuuu.com',
    });
  });
});
