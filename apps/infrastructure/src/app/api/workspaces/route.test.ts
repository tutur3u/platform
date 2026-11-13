import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
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
  const request = new Request('https://infra.tuturuuu.com/api/workspaces', {
    headers:
      authorization === undefined
        ? {}
        : { authorization, cookie: 'fixture=session' },
  });
  // Reflect invokes the actual route with the framework request argument.
  return Reflect.apply(GET, undefined, [request]);
}

describe('workspace listing ADMIN boundary', () => {
  const user = { id: 'fixture-admin' };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue(user);
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.permissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: (permission: string) =>
        permission === 'view_infrastructure',
    });
    mocks.admin.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({
      data: [{ id: 'workspace-1', name: 'Workspace' }],
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
        { id: 'workspace-1', name: 'Workspace', color: 'bg-blue-500' },
      ]);
      expect(mocks.permissions).toHaveBeenCalledWith({
        user,
        wsId: ROOT_WORKSPACE_ID,
      });
      expect(mocks.from).toHaveBeenCalledWith('workspaces');
      expect(mocks.select).toHaveBeenCalledWith('id,name');
      expect(mocks.order).toHaveBeenCalledWith('name', { ascending: true });
      if (authorization) {
        expect(mocks.getUser).toHaveBeenCalledWith('fixture-token');
        expect(mocks.session).not.toHaveBeenCalled();
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
  it('returns 500 for an authorized query failure', async () => {
    mocks.order.mockResolvedValue({
      data: null,
      error: { message: 'fixture failure' },
    });
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error fetching workspaces',
    });
  });
});
