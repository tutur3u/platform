import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  canManageCreatorGrantRole: vi.fn(),
  privateRpc: vi.fn(),
  resolveWorkspaceRouteAccess: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
  permissionError: null as unknown,
  roleLookup: { data: null as unknown, error: null as unknown },
  workspaceLookup: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

vi.mock(
  '@/lib/workspace-creator-grant-permissions',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/lib/workspace-creator-grant-permissions')
    >()),
    canManageCreatorGrantRole: mocks.canManageCreatorGrantRole,
  })
);

function createQuery(table: string) {
  const result = () =>
    table === 'workspace_roles'
      ? mocks.roleLookup
      : table === 'workspaces'
        ? mocks.workspaceLookup
        : { data: null, error: mocks.permissionError };
  const query: Record<string, unknown> = {};
  for (const op of ['select', 'update', 'upsert', 'delete', 'eq']) {
    query[op] = vi.fn((...args: unknown[]) => {
      mocks.calls.push({ table, op, args });
      return query;
    });
  }
  query.maybeSingle = vi.fn(async () => result());
  query.single = vi.fn(async () => result());
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve);
  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: vi.fn((table: string) => createQuery(table)),
    rpc: mocks.rpc,
    schema: mocks.schema.mockImplementation(() => ({ rpc: mocks.privateRpc })),
  })),
}));

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { DELETE, PUT } from './route';

function putRole(
  roleId: string,
  permissions: Array<{ enabled: boolean; id: string }> = [
    { enabled: true, id: 'admin' },
  ]
) {
  return PUT(
    new Request('http://localhost/roles', {
      body: JSON.stringify({
        name: 'Role',
        permissions,
      }),
      method: 'PUT',
    }),
    { params: Promise.resolve({ roleId, wsId: 'personal' }) }
  );
}

describe('workspace role update route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'caller-workspace-id' },
      user: { id: 'admin-user' },
    });
    mocks.privateRpc.mockResolvedValue({ data: 'updated', error: null });
  });

  function expectNoDirectWrites() {
    expect(
      mocks.calls.some((call) =>
        ['delete', 'update', 'upsert'].includes(call.op)
      )
    ).toBe(false);
  }

  it('rejects a caller without manage_workspace_roles before the edit', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const response = await putRole('own-role-id');

    expect(response.status).toBe(403);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      expect.any(Request),
      'personal',
      ['manage_workspace_roles']
    );
    expect(mocks.privateRpc).not.toHaveBeenCalled();
    expectNoDirectWrites();
  });

  it('edits the role through the guarded function as the session actor', async () => {
    const response = await putRole('own-role-id', [
      { enabled: true, id: 'manage_workspace_members' },
      { enabled: false, id: 'manage_subscription' },
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'success' });
    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.privateRpc).toHaveBeenCalledExactlyOnceWith(
      'update_workspace_role_guarded',
      {
        p_actor_id: 'admin-user',
        p_mode: 'workspace',
        p_name: 'Role',
        p_permissions: [
          { enabled: true, id: 'manage_workspace_members' },
          { enabled: false, id: 'manage_subscription' },
        ],
        p_role_id: 'own-role-id',
        p_ws_id: 'caller-workspace-id',
      }
    );
    expectNoDirectWrites();
  });

  it('refuses switching off the last member manager with 409', async () => {
    mocks.privateRpc.mockResolvedValue({ data: 'last_manager', error: null });

    const response = await putRole('own-role-id', [
      { enabled: false, id: 'manage_workspace_members' },
    ]);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'WORKSPACE_LAST_MANAGER',
      message: 'At least one member must be able to manage members',
    });
    expectNoDirectWrites();
  });

  it.each([
    ['not_found', 404, 'Role not found'],
    ['forbidden', 403, 'Workspace permission denied'],
    [
      'creator_protected',
      403,
      'Only the workspace creator can rename this role',
    ],
    ['role_protected', 403, 'This role cannot be renamed'],
    ['unexpected', 500, 'Error updating workspace role'],
  ])('maps the guarded answer %s', async (data, status, message) => {
    mocks.privateRpc.mockResolvedValue({ data, error: null });

    const response = await putRole('own-role-id');

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message });
  });

  it('fails closed when the guarded function errors', async () => {
    mocks.privateRpc.mockResolvedValue({
      data: 'updated',
      error: { code: '55P03', message: 'lock timeout' },
    });

    const response = await putRole('own-role-id');

    expect(response.status).toBe(500);
    expectNoDirectWrites();
  });

  it('rejects a body without permissions before the edit', async () => {
    const response = await PUT(
      new Request('http://localhost/roles', {
        body: JSON.stringify({ name: 'Role' }),
        method: 'PUT',
      }),
      { params: Promise.resolve({ roleId: 'own-role-id', wsId: 'personal' }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.privateRpc).not.toHaveBeenCalled();
  });
});

describe('workspace role delete route', () => {
  function deleteRole() {
    return DELETE(
      new Request('http://localhost/roles', {
        method: 'DELETE',
        body: JSON.stringify({ actorId: 'untrusted-actor' }),
      }),
      { params: Promise.resolve({ roleId: 'role-id', wsId: 'personal' }) }
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'resolved-ws' },
      user: { id: 'actor-id' },
    });
  });

  it.each([401, 403])(
    'returns the access denial %i before creating an admin client',
    async (status) => {
      const denial = NextResponse.json({ message: 'Denied' }, { status });
      mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
        ok: false,
        response: denial,
      });

      expect(await deleteRole()).toBe(denial);
      expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
        expect.any(Request),
        'personal',
        ['manage_workspace_roles']
      );
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.calls).toEqual([]);
    }
  );

  it.each([
    ['removed', 200, { message: 'success' }],
    ['not_found', 200, { message: 'success' }],
    ['forbidden', 403, { message: 'Workspace permission denied' }],
    [
      'last_manager',
      409,
      {
        code: 'WORKSPACE_LAST_MANAGER',
        message: 'At least one member must be able to manage members',
      },
    ],
    ['role_protected', 500, { message: 'Error deleting workspace role' }],
    ['creator_protected', 500, { message: 'Error deleting workspace role' }],
    ['self_protected', 500, { message: 'Error deleting workspace role' }],
    ['last_admin', 500, { message: 'Error deleting workspace role' }],
    [
      'default_admin_enabled',
      500,
      { message: 'Error deleting workspace role' },
    ],
    ['unexpected', 500, { message: 'Error deleting workspace role' }],
    [null, 500, { message: 'Error deleting workspace role' }],
  ])(
    'maps guarded result %s without a direct table write',
    async (data, status, body) => {
      mocks.rpc.mockResolvedValue({ data, error: null });

      const response = await deleteRole();

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
      expect(createAdminClient).toHaveBeenCalledWith({ noCookie: true });
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
        'delete_workspace_role_guarded',
        {
          p_actor_id: 'actor-id',
          p_mode: 'workspace',
          p_role_id: 'role-id',
          p_ws_id: 'resolved-ws',
        }
      );
      expect(mocks.calls).toEqual([]);
    }
  );

  it('uses the existing failure response if the RPC errors', async () => {
    const error = new Error('RPC unavailable');
    mocks.rpc.mockResolvedValue({ data: 'removed', error });

    const response = await deleteRole();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error deleting workspace role',
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.calls).toEqual([]);
  });
});
