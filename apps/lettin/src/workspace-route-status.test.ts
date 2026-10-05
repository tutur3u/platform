import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { InternalApiError } from '../../../packages/internal-api/src/internal-api-error';

const mocks = vi.hoisted(() => ({ status: vi.fn(), auth: vi.fn() }));
vi.mock('@tuturuuu/internal-api/client', async () => ({
  ...(await vi.importActual(
    '../../../packages/internal-api/src/internal-api-error'
  )),
  withForwardedInternalApiAuth: mocks.auth,
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  getWorkspaceInviteStatus: mocks.status,
}));

import { getWorkspaceRouteStatus } from './workspace-route-status';

const headers = new Headers({ cookie: 'verified=1' });
async function resolve(path: string, locale = 'en') {
  const request = new NextRequest(`https://lettin.tuturuuu.com${path}`);
  return getWorkspaceRouteStatus(
    request,
    request.nextUrl.pathname,
    headers,
    locale
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ defaultHeaders: headers });
  mocks.status.mockResolvedValue({ status: 'member' });
});
it.each(['/', '/dashboard', '/login', '/spaces', '/worlds/id', '/creators/id'])(
  'does not query workspace membership for %s',
  async (path) => {
    expect(await resolve(path)).toBeNull();
    expect(mocks.status).not.toHaveBeenCalled();
  }
);
it.each(['workspace', 'personal', 'internal'])(
  'admits joined workspace alias %s',
  async (id) => {
    expect(await resolve(`/${id}/wiki`)).toBeNull();
    expect(mocks.status).toHaveBeenCalledWith(id, { defaultHeaders: headers });
  }
);
it('waits for pending membership before returning an HTTP redirect', async () => {
  let finish!: (value: { status: string }) => void;
  mocks.status.mockReturnValue(
    new Promise((done) => {
      finish = done;
    })
  );
  const result = resolve('/missing/wiki');
  finish({ status: 'none' });
  const response = await result;
  expect(response?.status).toBe(307);
  expect(response?.headers.get('location')).toBe(
    'https://lettin.tuturuuu.com/dashboard'
  );
  expect(await response?.text()).toBe('');
});
it.each([403, 404])(
  'redirects definitive missing or unjoined status %s',
  async (status) => {
    mocks.status.mockRejectedValue(new InternalApiError('Denied', status));
    expect((await resolve('/workspace/wiki'))?.status).toBe(307);
  }
);
it.each([
  ['Unauthorized', 401, undefined],
  ['MFA', 403, 'MFA_REQUIRED'],
])(
  'redirects auth failure %s preserving destination',
  async (message, status, code) => {
    mocks.status.mockRejectedValue(
      new InternalApiError(message as string, status as number, code)
    );
    const response = await resolve('/workspace/wiki?entry=one');
    const location = new URL(response!.headers.get('location')!);
    expect(response?.status).toBe(307);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/workspace/wiki?entry=one');
    expect(location.searchParams.get('refresh')).toBe(code ? '1' : null);
  }
);
it('preserves invitation layout even when child world ID is invalid', async () => {
  mocks.status.mockResolvedValue({ status: 'pending_invite' });
  expect(await resolve('/workspace/worlds/invalid')).toBeNull();
});
it.each(['en', 'vi'])(
  'returns real private 404 HTML before streaming (%s)',
  async (locale) => {
    const response = await resolve('/workspace/worlds/invalid', locale);
    expect(response?.status).toBe(404);
    expect(response?.headers.get('cache-control')).toBe('private, no-store');
    expect(response?.headers.get('content-type')).toContain('text/html');
    const html = await response!.text();
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain(
      locale === 'vi'
        ? 'Không tìm thấy trang này.'
        : 'This page could not be found.'
    );
    expect(html).not.toContain('invalid');
  }
);
it.each([
  '/workspace/worlds/13c20381-54cd-4563-9c47-c9b499397daf',
  '/worlds/invalid',
  '/workspace/wiki/invalid/entries',
  '/workspace/worlds/invalid/extra',
])('keeps unaffected route %s', async (path) => {
  expect(await resolve(path)).toBeNull();
});
it('does not mask transport or server failures as membership denial', async () => {
  mocks.status.mockRejectedValue(new InternalApiError('Unavailable', 503));
  await expect(resolve('/workspace/wiki')).rejects.toThrow('Unavailable');
});
