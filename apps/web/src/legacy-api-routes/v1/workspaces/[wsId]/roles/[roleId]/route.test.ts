import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  canManageCreatorGrantRole: vi.fn(),
  resolveWorkspaceRouteAccess: vi.fn(),
  rpc: vi.fn(),
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
    mocks.permissionError = null;
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'caller-workspace-id' },
      user: { id: 'admin-user' },
    });
    mocks.roleLookup = {
      data: { id: 'own-role-id', name: 'Role' },
      error: null,
    };
    mocks.workspaceLookup = { data: { creator_id: 'owner-user' }, error: null };
    mocks.canManageCreatorGrantRole.mockResolvedValue(true);
  });

  it('does not write permissions for a role outside the workspace', async () => {
    mocks.roleLookup = { data: null, error: null };

    const response = await putRole('foreign-role-id');

    expect(response.status).toBe(404);
    expect(
      mocks.calls.some(
        (call) =>
          call.table === 'workspace_role_permissions' &&
          (call.op === 'upsert' || call.op === 'update')
      )
    ).toBe(false);
  });

  it('leaves the role name unchanged when the permission save fails', async () => {
    mocks.permissionError = { code: '42501', message: 'Grant rejected' };

    const response = await putRole('own-role-id');

    expect(response.status).toBe(500);
    expect(mocks.calls.some((call) => call.op === 'upsert')).toBe(true);
    expect(
      mocks.calls.some(
        (call) => call.table === 'workspace_roles' && call.op === 'update'
      )
    ).toBe(false);
  });

  it('updates permissions for a role in the resolved workspace', async () => {
    const response = await putRole('own-role-id');

    expect(response.status).toBe(200);
    expect(mocks.calls).toContainEqual({
      args: ['ws_id', 'caller-workspace-id'],
      op: 'eq',
      table: 'workspace_roles',
    });
    expect(mocks.calls).toContainEqual({
      args: [
        [
          {
            enabled: true,
            permission: 'admin',
            role_id: 'own-role-id',
            ws_id: 'caller-workspace-id',
          },
        ],
      ],
      op: 'upsert',
      table: 'workspace_role_permissions',
    });
  });

  it('refuses a non-creator rename of a creator-granted role', async () => {
    mocks.roleLookup = {
      data: { id: 'own-role-id', name: 'Billing' },
      error: null,
    };
    mocks.canManageCreatorGrantRole.mockResolvedValue(false);

    const response = await putRole('own-role-id');

    expect(response.status).toBe(403);
    expect(mocks.canManageCreatorGrantRole).toHaveBeenCalledWith(
      expect.anything(),
      {
        roleId: 'own-role-id',
        userId: 'admin-user',
        wsId: 'caller-workspace-id',
      }
    );
    expect(mocks.calls.some((call) => call.op === 'update')).toBe(false);
  });

  it('drops manage_subscription from a non-creator admin payload', async () => {
    const response = await putRole('own-role-id', [
      { enabled: true, id: 'manage_subscription' },
      { enabled: true, id: 'manage_workspace_members' },
    ]);

    expect(response.status).toBe(200);
    expect(mocks.calls).toContainEqual({
      args: [
        [
          {
            enabled: true,
            permission: 'manage_workspace_members',
            role_id: 'own-role-id',
            ws_id: 'caller-workspace-id',
          },
        ],
      ],
      op: 'upsert',
      table: 'workspace_role_permissions',
    });
  });

  it('keeps manage_subscription when the workspace creator saves', async () => {
    mocks.workspaceLookup = { data: { creator_id: 'admin-user' }, error: null };

    const response = await putRole('own-role-id', [
      { enabled: true, id: 'manage_subscription' },
    ]);

    expect(response.status).toBe(200);
    expect(mocks.calls).toContainEqual({
      args: [
        [
          {
            enabled: true,
            permission: 'manage_subscription',
            role_id: 'own-role-id',
            ws_id: 'caller-workspace-id',
          },
        ],
      ],
      op: 'upsert',
      table: 'workspace_role_permissions',
    });
  });

  it('strips manage_mastermind even when the workspace creator saves', async () => {
    mocks.workspaceLookup = { data: { creator_id: 'admin-user' }, error: null };

    const response = await putRole('own-role-id', [
      { enabled: true, id: 'manage_mastermind' },
      { enabled: false, id: 'manage_mastermind' },
      { enabled: true, id: 'manage_workspace_members' },
    ]);

    expect(response.status).toBe(200);
    expect(mocks.calls).toContainEqual({
      args: [
        [
          {
            enabled: true,
            permission: 'manage_workspace_members',
            role_id: 'own-role-id',
            ws_id: 'caller-workspace-id',
          },
        ],
      ],
      op: 'upsert',
      table: 'workspace_role_permissions',
    });
    expect(JSON.stringify(mocks.calls)).not.toContain('manage_mastermind');
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
