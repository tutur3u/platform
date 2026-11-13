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
  maybeSingle: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
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

async function mutate(method: 'PUT' | 'DELETE', authorization?: string) {
  const route = await import('./route');
  const request = new Request(
    'https://infra.tuturuuu.com/api/workspaces/target/secrets/secret',
    {
      method,
      headers:
        authorization === undefined
          ? {}
          : { authorization, cookie: 'fixture=session' },
      ...(method === 'PUT'
        ? { body: JSON.stringify({ value: 'fixture-update' }) }
        : {}),
    }
  );
  return route[method](request, {
    params: Promise.resolve({ wsId: 'target', secretId: 'secret' }),
  });
}

describe.each(['PUT', 'DELETE'] as const)(
  '%s workspace secret admission',
  (method) => {
    const user = { id: 'fixture-user' };
    beforeEach(() => {
      vi.resetAllMocks();
      mocks.session.mockResolvedValue(user);
      mocks.getUser.mockResolvedValue({ data: { user }, error: null });
      mocks.permissions.mockResolvedValue({
        membershipType: 'MEMBER',
        containsPermission: (p: string) => p === 'manage_workspace_secrets',
      });
      mocks.admin.mockResolvedValue({
        auth: { getUser: mocks.getUser },
        from: mocks.from,
      });
      const query = {
        select: mocks.select,
        eq: mocks.eq,
        maybeSingle: mocks.maybeSingle,
        update: mocks.update,
        delete: mocks.delete,
      };
      for (const fn of [
        mocks.from,
        mocks.select,
        mocks.eq,
        mocks.update,
        mocks.delete,
      ])
        fn.mockReturnValue(query);
      mocks.maybeSingle
        .mockResolvedValueOnce({
          data: { name: 'fixture-secret' },
          error: null,
        })
        .mockResolvedValue({ data: { id: 'secret' }, error: null });
    });
    it('rejects signed-out requests before effects', async () => {
      mocks.session.mockResolvedValue(null);
      expect((await mutate(method)).status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each(['Bearer rejected', 'Bearer', 'Basic rejected', ''])(
      'rejects invalid authorization %s without cookie fallback',
      async (authorization) => {
        mocks.getUser.mockResolvedValue({
          data: { user: null },
          error: { status: 401 },
        });
        expect((await mutate(method, authorization)).status).toBe(401);
        expect(mocks.session).not.toHaveBeenCalled();
        expect(mocks.permissions).not.toHaveBeenCalled();
        expect(mocks.from).not.toHaveBeenCalled();
      }
    );
    it.each(['GUEST', 'NONE'])(
      'rejects root %s before effects',
      async (membershipType) => {
        mocks.permissions.mockResolvedValue({
          membershipType,
          containsPermission: () => true,
        });
        expect((await mutate(method)).status).toBe(403);
        expect(mocks.from).not.toHaveBeenCalled();
      }
    );
    it('rejects view-only root members', async () => {
      mocks.permissions.mockResolvedValue({
        membershipType: 'MEMBER',
        containsPermission: (p: string) => p === 'view_infrastructure',
      });
      expect((await mutate(method)).status).toBe(403);
      expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each(['manage_workspace_secrets', 'manage_workspace_roles'])(
      'accepts bearer root members with %s and preserves filters',
      async (permission) => {
        mocks.session.mockResolvedValue(null);
        mocks.permissions.mockResolvedValue({
          membershipType: 'MEMBER',
          containsPermission: (p: string) => p === permission,
        });
        const response = await mutate(method, 'Bearer fixture-token');
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: 'success' });
        expect(mocks.getUser).toHaveBeenCalledWith('fixture-token');
        expect(mocks.session).not.toHaveBeenCalled();
        expect(mocks.permissions).toHaveBeenCalledWith({
          user,
          wsId: ROOT_WORKSPACE_ID,
        });
        expect(mocks.from).toHaveBeenCalledWith('workspace_secrets');
        expect(mocks.eq.mock.calls).toEqual([
          ['id', 'secret'],
          ['ws_id', 'target'],
          ['id', 'secret'],
          ['ws_id', 'target'],
        ]);
        expect(
          method === 'PUT' ? mocks.update : mocks.delete
        ).toHaveBeenCalledTimes(1);
      }
    );
    it('preserves cookie member access', async () => {
      expect((await mutate(method)).status).toBe(200);
    });
  }
);
