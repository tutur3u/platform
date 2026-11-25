import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  centralizedAuthOptions: [] as unknown[],
  resolveMountedSharedSession: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: NextRequest, response: NextResponse) =>
    response,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: () => false,
  hasWebAppSessionTokenFromRequest: () => false,
}));

vi.mock('@tuturuuu/auth/proxy', async (actual) => ({
  ...(await actual<typeof import('@tuturuuu/auth/proxy')>()),
  consumeVerifyTokenRequest: vi.fn(async () => null),
  createCentralizedAuthProxy: (options: unknown) => {
    mocks.centralizedAuthOptions.push(options);
    return mocks.authProxy;
  },
  getRequestHeadersWithResponseCookies: () => new Headers(),
  // Mounted auth runs for real; only the shared session is stubbed.
  resolveMountedSharedSession: (
    ...args: Parameters<typeof mocks.resolveMountedSharedSession>
  ) => mocks.resolveMountedSharedSession(...args),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  withForwardedInternalApiAuth: () => ({}),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(async () => null),
  hasAuthenticatedBearerToken: () => false,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

import { isPublicTasksPage, isPublicTasksPathname } from './public-pages';
import { proxy } from './proxy';

const CODE = 'a'.repeat(36);

describe('public Tasks pages', () => {
  beforeEach(() => {
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.resolveMountedSharedSession.mockResolvedValue({
      ok: false,
      error: 'Shared session unavailable',
    });
  });

  it.each([
    `/shared/task-boards/${CODE}`,
    `/shared/task-boards/${'0f'.repeat(12)}`,
    `/shared/task-boards/${'A'.repeat(64)}`,
  ])('admits %s', (path) => {
    expect(isPublicTasksPage(path)).toBe(true);
  });

  it.each([
    '/shared/task-boards',
    '/shared/task-boards/',
    `/shared/task-boards/${CODE}/`,
    `/shared/task-boards/${CODE}/edit`,
    `/shared/task-boards/${'a'.repeat(23)}`,
    `/shared/task-boards/${'a'.repeat(65)}`,
    `/shared/task-boards/${'g'.repeat(36)}`,
    `/shared/task-boards/${CODE}%2F..`,
    `/shared/task/${CODE}`,
    `/x/shared/task-boards/${CODE}`,
    `/en/shared/task-boards/${CODE}`,
  ])('keeps the neighbour %s behind the session', (path) => {
    expect(isPublicTasksPage(path)).toBe(false);
  });

  it('strips only a supported locale on the subdomain', () => {
    expect(isPublicTasksPathname(`/en/shared/task-boards/${CODE}`)).toBe(true);
    expect(isPublicTasksPathname(`/vi/shared/task-boards/${CODE}`)).toBe(true);
    expect(isPublicTasksPathname(`/shared/task-boards/${CODE}`)).toBe(true);
    expect(isPublicTasksPathname(`/fr/shared/task-boards/${CODE}`)).toBe(false);
    expect(isPublicTasksPathname(`/en/en/shared/task-boards/${CODE}`)).toBe(
      false
    );
  });

  it('gives the subdomain auth proxy the exact predicate', () => {
    const options = mocks.centralizedAuthOptions[0] as {
      isPublicPath?: (pathname: string) => boolean;
    };
    expect(options.isPublicPath).toBe(isPublicTasksPathname);
  });

  it('serves a public board signed out on the tuturuuu.com/tasks mount', async () => {
    const response = await proxy(
      new NextRequest(
        `https://tuturuuu.com/tasks/en/shared/task-boards/${CODE}`,
        {
          nextConfig: { basePath: '/tasks' },
        }
      )
    );
    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it.each([
    `/en/shared/task/${CODE}`,
    `/en/shared/task-boards/${CODE}/edit`,
    '/en/personal/tasks',
  ])('still sends the mounted neighbour %s to Web login', async (path) => {
    const response = await proxy(
      new NextRequest(`https://tuturuuu.com/tasks${path}`, {
        nextConfig: { basePath: '/tasks' },
      })
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe(
      '/login'
    );
  });
});
