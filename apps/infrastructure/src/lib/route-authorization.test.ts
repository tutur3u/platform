import { beforeEach, expect, it, vi } from 'vitest';
import { classifyInfrastructureRoute } from './route-classification';

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  admin: vi.fn(),
  permissions: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.cookie,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));

beforeEach(() => vi.resetAllMocks());

it('default ADMIN paths retain the same signed-out and root-membership boundary', async () => {
  const { authorizeInfrastructureAdminRequest } =
    await import('./infrastructure-admin-access');
  for (const path of [
    '/api/new-handler',
    '/api/build-info',
    '/api/auth/logout',
    '/api/cron/new-job',
  ]) {
    expect(classifyInfrastructureRoute(path, 'GET')).toBe('ADMIN');
    const request = new Request(`https://example.test${path}`);
    mocks.cookie.mockResolvedValue(null);
    const signedOut = await authorizeInfrastructureAdminRequest(
      'view_infrastructure',
      true,
      request
    );
    expect(signedOut.ok).toBe(false);
    if (!signedOut.ok) expect(signedOut.response.status).toBe(401);
    mocks.cookie.mockResolvedValue({ id: 'fixture' });
    mocks.permissions.mockResolvedValue({
      membershipType: 'GUEST',
      containsPermission: () => true,
    });
    const guest = await authorizeInfrastructureAdminRequest(
      'view_infrastructure',
      true,
      request
    );
    expect(guest.ok).toBe(false);
    if (!guest.ok) expect(guest.response.status).toBe(403);
  }
  expect(mocks.admin).not.toHaveBeenCalled();
});

it.each(['Basic invalid', 'Bearer invalid', 'Bearer'])(
  'rejects %s even when an eligible cookie exists',
  async (authorization) => {
    mocks.cookie.mockResolvedValue({ id: 'cookie-admin' });
    mocks.admin.mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    });
    const { authorizeInfrastructureAdminRequest } =
      await import('./infrastructure-admin-access');
    const result = await authorizeInfrastructureAdminRequest(
      'view_infrastructure',
      true,
      new Request('https://example.test/api/new-handler', {
        headers: { authorization },
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.cookie).not.toHaveBeenCalled();
    expect(mocks.permissions).not.toHaveBeenCalled();
  }
);
