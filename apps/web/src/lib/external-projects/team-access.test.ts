import { describe, expect, it, vi } from 'vitest';
import {
  addExternalProjectRoleMembers,
  removeExternalProjectRoleMember,
  updateExternalProjectTeamRole,
} from './team-access';

vi.mock('./access', () => ({
  hasRootExternalProjectsAdminPermission: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

type QueryResult<T> = {
  data: T | null;
  error: { code: string } | null;
};

function createAccess({ roleExists }: { roleExists: boolean }) {
  const calls = {
    deletedRoleMemberFilters: [] as Array<[string, string]>,
    insertedRoleMembers: null as unknown,
    roleFilters: [] as Array<[string, string]>,
    roleUpdates: [] as unknown[],
    upsertedRolePermissions: null as unknown,
  };

  const roleResult = (): QueryResult<{ id: string }> => ({
    data: roleExists ? { id: 'role-1' } : null,
    error: roleExists ? null : { code: 'PGRST116' },
  });
  const createMutationFilterChain = (filters: Array<[string, string]>) => {
    let filterCount = 0;

    return {
      eq(column: string, value: string): unknown {
        filters.push([column, value]);
        filterCount += 1;

        if (filterCount >= 2) {
          return Promise.resolve({ error: null });
        }

        return this;
      },
    };
  };

  const admin = {
    from(table: string) {
      if (table === 'workspace_roles') {
        return {
          select() {
            return {
              eq(column: string, value: string) {
                calls.roleFilters.push([column, value]);
                return this;
              },
              single() {
                return Promise.resolve(roleResult());
              },
            };
          },
          update(row: unknown) {
            calls.roleUpdates.push(row);
            return createMutationFilterChain(calls.roleFilters);
          },
        };
      }

      if (table === 'workspace_role_members') {
        return {
          delete() {
            return createMutationFilterChain(calls.deletedRoleMemberFilters);
          },
          insert(rows: unknown) {
            calls.insertedRoleMembers = rows;
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'workspace_role_permissions') {
        return {
          upsert(rows: unknown) {
            calls.upsertedRolePermissions = rows;
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return {
    access: {
      admin,
      normalizedWorkspaceId: 'workspace-1',
    },
    calls,
  };
}

describe('external project role workspace binding', () => {
  it('does not add members when the role is outside the authorized workspace', async () => {
    const { access, calls } = createAccess({ roleExists: false });

    const response = await addExternalProjectRoleMembers({
      access: access as never,
      request: new Request('http://localhost', {
        body: JSON.stringify({ memberIds: ['user-1'] }),
        method: 'POST',
      }),
      roleId: 'victim-role',
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Access level not found',
    });
    expect(calls.roleFilters).toEqual([
      ['id', 'victim-role'],
      ['ws_id', 'workspace-1'],
    ]);
    expect(calls.insertedRoleMembers).toBeNull();
  });

  it('does not remove members when the role is outside the authorized workspace', async () => {
    const { access, calls } = createAccess({ roleExists: false });

    const response = await removeExternalProjectRoleMember({
      access: access as never,
      roleId: 'victim-role',
      userId: 'user-1',
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Access level not found',
    });
    expect(calls.roleFilters).toEqual([
      ['id', 'victim-role'],
      ['ws_id', 'workspace-1'],
    ]);
    expect(calls.deletedRoleMemberFilters).toEqual([]);
  });

  it('does not update permissions when the role is outside the authorized workspace', async () => {
    const { access, calls } = createAccess({ roleExists: false });

    const response = await updateExternalProjectTeamRole({
      access: access as never,
      payload: {
        name: 'Publisher',
        permissions: [{ enabled: true, id: 'manage_workspace_roles' }],
      },
      roleId: 'victim-role',
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Access level not found',
    });
    expect(calls.roleFilters).toEqual([
      ['id', 'victim-role'],
      ['ws_id', 'workspace-1'],
    ]);
    expect(calls.roleUpdates).toEqual([]);
    expect(calls.upsertedRolePermissions).toBeNull();
  });

  it('adds members after binding the role to the authorized workspace', async () => {
    const { access, calls } = createAccess({ roleExists: true });

    const response = await addExternalProjectRoleMembers({
      access: access as never,
      request: new Request('http://localhost', {
        body: JSON.stringify({ memberIds: ['user-1', 'user-2'] }),
        method: 'POST',
      }),
      roleId: 'role-1',
    });

    expect(response.status).toBe(200);
    expect(calls.roleFilters).toEqual([
      ['id', 'role-1'],
      ['ws_id', 'workspace-1'],
    ]);
    expect(calls.insertedRoleMembers).toEqual([
      { role_id: 'role-1', user_id: 'user-1' },
      { role_id: 'role-1', user_id: 'user-2' },
    ]);
  });

  it('updates permissions after binding the role to the authorized workspace', async () => {
    const { access, calls } = createAccess({ roleExists: true });

    const response = await updateExternalProjectTeamRole({
      access: access as never,
      payload: {
        name: 'Publisher',
        permissions: [{ enabled: true, id: 'manage_workspace_roles' }],
      },
      roleId: 'role-1',
    });

    expect(response.status).toBe(200);
    expect(calls.roleFilters).toEqual([
      ['id', 'role-1'],
      ['ws_id', 'workspace-1'],
      ['id', 'role-1'],
      ['ws_id', 'workspace-1'],
    ]);
    expect(calls.roleUpdates).toEqual([{ name: 'Publisher' }]);
    expect(calls.upsertedRolePermissions).toEqual([
      {
        enabled: true,
        permission: 'manage_workspace_roles',
        role_id: 'role-1',
        ws_id: 'workspace-1',
      },
    ]);
  });
});
