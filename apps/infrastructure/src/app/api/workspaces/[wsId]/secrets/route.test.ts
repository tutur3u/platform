import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.session,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

async function get(authorization?: string) {
  const { GET } = await import('./route');
  const request = new Request(
    'https://infra.tuturuuu.com/api/workspaces/workspace-alias/secrets',
    {
      headers:
        authorization === undefined
          ? {}
          : { authorization, cookie: 'fixture=session' },
    }
  );
  // Reflect invokes the actual route with the framework request argument.
  return GET(request, { params: Promise.resolve({ wsId: 'workspace-alias' }) });
}

describe('workspace secrets ADMIN boundary', () => {
  const user = { id: 'fixture-admin' };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue(user);
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.permissions.mockResolvedValue({
      wsId: 'resolved-workspace',
      membershipType: 'MEMBER',
      containsPermission: (permission: string) =>
        ['view_infrastructure', 'manage_workspace_secrets'].includes(
          permission
        ),
    });
    mocks.admin.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({
      data: [{ name: 'fixture-secret', value: 'fixture-value' }],
      error: null,
    });
  });
  it('rejects signed-out requests before data access', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(['GUEST', 'NONE'])(
    'rejects root %s even with permission',
    async (membershipType) => {
      mocks.permissions.mockResolvedValue({
        membershipType,
        containsPermission: () => true,
      });
      expect((await get()).status).toBe(403);
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
  it('rejects role managers lacking view_infrastructure', async () => {
    mocks.permissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_roles',
    });
    expect((await get()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([undefined, 'Bearer fixture-token'])(
    'lists workspaces for verified root viewer %s',
    async (authorization) => {
      const response = await get(authorization);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { name: 'fixture-secret', value: 'fixture-value' },
      ]);
      expect(mocks.permissions).toHaveBeenCalledWith({
        user,
        wsId: ROOT_WORKSPACE_ID,
      });
      expect(mocks.from).toHaveBeenCalledWith('workspace_secrets');
      expect(mocks.select).toHaveBeenCalledWith('*');
      expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'workspace-alias');
      if (authorization) {
        expect(mocks.getUser).toHaveBeenCalledWith('fixture-token');
        expect(mocks.getUser).toHaveBeenCalledTimes(1);
      }
    }
  );
  it.each(['Bearer rejected', 'Bearer', 'Basic rejected', ''])(
    'rejects invalid authorization %s without cookie fallback',
    async (authorization) => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: { status: 401 },
      });
      expect((await get(authorization)).status).toBe(401);
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.permissions).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
  it('rejects mixed bearer view and cookie secret identities', async () => {
    mocks.session.mockResolvedValue({ id: 'cookie-b' });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'bearer-a' } },
      error: null,
    });
    mocks.permissions.mockImplementation(
      async ({ user }: { user: { id: string } }) => ({
        membershipType: 'MEMBER',
        containsPermission: (permission: string) =>
          user.id === 'bearer-a'
            ? permission === 'view_infrastructure'
            : permission === 'manage_workspace_secrets',
      })
    );
    expect((await get('Bearer actor-a')).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('admits a bearer with both permissions without consulting cookie identity', async () => {
    mocks.session.mockResolvedValue({ id: 'cookie-b' });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'bearer-a' } },
      error: null,
    });
    mocks.permissions.mockImplementation(
      async ({ user }: { user: { id: string } }) => ({
        membershipType: 'MEMBER',
        containsPermission: (permission: string) =>
          user.id === 'bearer-a'
            ? ['view_infrastructure', 'manage_workspace_secrets'].includes(
                permission
              )
            : permission === 'view_infrastructure',
      })
    );
    expect((await get('Bearer actor-a')).status).toBe(200);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('preserves the secret management permission requirement', async () => {
    mocks.permissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: (permission: string) =>
        permission === 'view_infrastructure',
    });
    expect((await get()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('returns 500 for an authorized query failure', async () => {
    mocks.order.mockResolvedValue({
      data: null,
      error: { message: 'fixture failure' },
    });
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error fetching workspace API configs',
    });
  });
});
