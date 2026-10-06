import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  db: vi.fn(),
  permissions: vi.fn(),
  membership: vi.fn(),
  query: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mock.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mock.db,
}));
vi.mock('@tuturuuu/utils/constants', () => ({
  ROOT_WORKSPACE_ID: '00000000-0000-0000-0000-000000000000',
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mock.permissions,
}));

import {
  authorizeDesktopAdmin,
  DESKTOP_ADMIN_ACTION_HEADER,
  validateDesktopMutation,
} from './access';

const request = () =>
  new Request('https://infra.example/api/v1/desktop-deployment');
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ id: 'actor' });
  mock.db.mockResolvedValue({ from: mock.membership });
  mock.membership.mockReturnValue(mock.query);
  mock.query.select.mockReturnValue(mock.query);
  mock.query.eq.mockReturnValue(mock.query);
  mock.query.maybeSingle.mockResolvedValue({
    data: { user_id: 'actor' },
    error: null,
  });
  mock.permissions.mockResolvedValue({ withoutPermission: () => false });
});

describe('desktop private operator boundary', () => {
  it('never reads the database for an anonymous actor', async () => {
    mock.user.mockResolvedValue(null);
    const result = await authorizeDesktopAdmin(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mock.db).not.toHaveBeenCalled();
  });
  it('requires explicit MEMBER membership before permission shortcuts', async () => {
    mock.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await authorizeDesktopAdmin(request());
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mock.query.eq).toHaveBeenCalledWith('type', 'MEMBER');
    expect(mock.permissions).not.toHaveBeenCalled();
  });
  it('distinguishes a membership query failure from a denial', async () => {
    mock.query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'private detail' },
    });
    const result = await authorizeDesktopAdmin(request());
    if (!result.ok) {
      expect(result.response.status).toBe(500);
      expect(await result.response.text()).not.toContain('private detail');
    }
    expect(mock.permissions).not.toHaveBeenCalled();
  });
  it('requires the desktop permission and passes the original actor/request', async () => {
    mock.permissions.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission === 'manage_desktop_deployment_vault',
    });
    const req = request();
    const result = await authorizeDesktopAdmin(req);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mock.permissions).toHaveBeenCalledWith({
      request: req,
      user: { id: 'actor' },
      wsId: '00000000-0000-0000-0000-000000000000',
    });
  });
  it('uses the registered satellite session and admits the authorized actor', async () => {
    expect(await authorizeDesktopAdmin(request())).toMatchObject({
      ok: true,
      userId: 'actor',
    });
    expect(mock.user).toHaveBeenCalledWith('infra');
    expect(mock.db).toHaveBeenCalledWith({ noCookie: true });
  });
  it('sanitizes session and permission exceptions', async () => {
    mock.permissions.mockRejectedValue(new Error('private cookie detail'));
    const result = await authorizeDesktopAdmin(request());
    if (!result.ok) {
      expect(result.response.status).toBe(500);
      expect(await result.response.text()).not.toContain('private cookie');
    }
  });
});

describe('desktop mutation CSRF', () => {
  const mutation = (origin?: string, extra?: Record<string, string>) =>
    new Request(request().url, {
      method: 'POST',
      headers: {
        [DESKTOP_ADMIN_ACTION_HEADER]: '1',
        ...(origin ? { origin } : {}),
        ...extra,
      },
    });
  it('admits only the exact local app origin', () =>
    expect(
      validateDesktopMutation(mutation('https://infra.example'))
    ).toBeNull());
  it.each([
    undefined,
    'null',
    'https://other.example',
    'https://infra.example/path',
    'https://infra.example?query=1',
    'https://infra.example/#fragment',
  ])('rejects origin %s', (origin) =>
    expect(validateDesktopMutation(mutation(origin))?.status).toBe(403)
  );
  it('rejects a cross-site fetch even with a same-origin header', () =>
    expect(
      validateDesktopMutation(
        mutation('https://infra.example', { 'sec-fetch-site': 'cross-site' })
      )?.status
    ).toBe(403));
  it('does not trust forwarded origins or the mobile action header', () => {
    expect(
      validateDesktopMutation(
        mutation('https://other.example', {
          'x-forwarded-host': 'other.example',
        })
      )?.status
    ).toBe(403);
    expect(
      validateDesktopMutation(
        mutation('https://infra.example', {
          [DESKTOP_ADMIN_ACTION_HEADER]: '',
          'x-tuturuuu-mobile-deployment-action': '1',
        })
      )?.status
    ).toBe(403);
  });
});
