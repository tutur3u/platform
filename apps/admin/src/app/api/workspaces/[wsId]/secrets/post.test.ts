import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
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

async function post(
  authorization?: string,
  body = JSON.stringify({ name: ' ENABLE_AI ', value: '42' })
) {
  const { POST } = await import('./route');
  return POST(
    new Request('https://infra.tuturuuu.com/api/workspaces/tenant/secrets', {
      method: 'POST',
      body,
      headers: {
        cookie: 'fixture=session',
        ...(authorization === undefined ? {} : { authorization }),
      },
    }),
    { params: Promise.resolve({ wsId: 'tenant' }) }
  );
}

describe('workspace secret POST admission', () => {
  const user = { id: 'fixture-admin' };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue(user);
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.permissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_secrets',
    });
    mocks.admin.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockResolvedValue({ error: null });
  });
  it.each(['Bearer rejected', 'Bearer', 'Basic rejected', ''])(
    'rejects invalid authorization %s despite valid cookie',
    async (authorization) => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: { status: 401 },
      });
      expect((await post(authorization)).status).toBe(401);
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.permissions).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
  it('rejects signed-out actors', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(['GUEST', null])('rejects nonmembers %s', async (membershipType) => {
    mocks.permissions.mockResolvedValue({
      membershipType,
      containsPermission: () => true,
    });
    expect((await post()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects actors lacking management permission', async () => {
    mocks.permissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: () => false,
    });
    expect((await post()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  for (const permission of [
    'manage_workspace_secrets',
    'manage_workspace_roles',
  ]) {
    it.each([undefined, 'Bearer fixture-token'])(
      `allows root ${permission} actor %s`,
      async (authorization) => {
        mocks.permissions.mockResolvedValue({
          membershipType: 'MEMBER',
          containsPermission: (candidate: string) => candidate === permission,
        });
        expect((await post(authorization)).status).toBe(200);
        expect(mocks.permissions).toHaveBeenCalledWith({
          user,
          wsId: ROOT_WORKSPACE_ID,
        });
        expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
          ws_id: 'tenant',
          name: 'ENABLE_AI',
          value: '42',
        });
        if (authorization) {
          expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(
            'fixture-token'
          );
          expect(mocks.session).not.toHaveBeenCalled();
        }
      }
    );
  }
  it.each(['{', '{}', JSON.stringify({ name: '', value: '42' })])(
    'retains body validation %s',
    async (body) => {
      expect((await post(undefined, body)).status).toBe(400);
      expect(mocks.insert).not.toHaveBeenCalled();
    }
  );
  it('retains managed name denial', async () => {
    expect(
      (
        await post(
          undefined,
          JSON.stringify({ name: ' managed_cron_enabled ', value: 'true' })
        )
      ).status
    ).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
