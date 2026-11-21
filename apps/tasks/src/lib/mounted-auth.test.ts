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

import { isMountedTasks, mountedTasksAuth } from './mounted-auth';

const mounted = (path: string) =>
  new NextRequest(`https://tuturuuu.com/tasks${path}`, {
    nextConfig: { basePath: '/tasks' },
  });

describe('mountedTasksAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recognizes only the tuturuuu.com/tasks mount', () => {
    expect(isMountedTasks(mounted('/en'))).toBe(true);
    expect(
      isMountedTasks(new NextRequest('https://tasks.tuturuuu.com/en'))
    ).toBe(false);
  });

  it('continues with a valid shared session', async () => {
    const next = NextResponse.next();
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: true,
      response: next,
    });

    expect(await mountedTasksAuth(mounted('/en/personal/tasks'))).toBe(next);
  });

  it('sends an expired session to Web login with an in-mount return', async () => {
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: false,
      error: 'Shared session unavailable',
    });

    const response = await mountedTasksAuth(
      mounted('/en/personal/boards/b1?view=list')
    );
    const login = new URL(response.headers.get('location') ?? '');
    const callback = new URL(login.searchParams.get('returnUrl') ?? '');

    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    expect(callback.origin + callback.pathname).toBe(
      'https://tuturuuu.com/tasks/verify-token'
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

    const response = await mountedTasksAuth(mounted('/en'));

    expect(
      new URL(response.headers.get('location') ?? '').searchParams.get('mfa')
    ).toBe('required');
  });

  it('completes verify-token through the shared session', async () => {
    const done = NextResponse.redirect('https://tuturuuu.com/tasks/en');
    mocks.consumeMountedSharedSession.mockResolvedValue(done);

    expect(
      await mountedTasksAuth(mounted('/en/verify-token?nextUrl=%2F'))
    ).toBe(done);
    expect(mocks.consumeMountedSharedSession.mock.calls[0]?.[1]).toMatchObject({
      mode: 'supabase-only',
      targetApp: 'tasks',
      webAppUrl: 'https://tuturuuu.com',
    });
  });
});
