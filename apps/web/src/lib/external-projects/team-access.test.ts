import { describe, expect, it, vi } from 'vitest';
import {
  addExternalProjectRoleMembers,
  createExternalProjectTeamRole,
  removeExternalProjectRoleMember,
  updateExternalProjectTeamDefaultPermissions,
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
          insert() {
            return {
              select() {
                return { single: async () => roleResult() };
              },
            };
          },
          update(row: unknown) {
            calls.roleUpdates.push(row);
            return createMutationFilterChain(calls.roleFilters);
          },
        };
      }

      if (table === 'workspace_members') {
        return {
          select() {
            return {
              eq(column: string, value: string) {
                expect([column, value]).toEqual(['ws_id', 'workspace-1']);
                return {
                  eq(typeColumn: string, typeValue: string) {
                    expect([typeColumn, typeValue]).toEqual(['type', 'MEMBER']);
                    return {
                      in: async (_key: string, ids: string[]) => ({
                        data: ids.map((user_id) => ({ user_id })),
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
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

      if (
        table === 'workspace_role_permissions' ||
        table === 'workspace_default_permissions'
      ) {
        return {
          insert(rows: unknown) {
            calls.upsertedRolePermissions = rows;
            return Promise.resolve({ error: null });
          },
          select() {
            const query: Record<string, unknown> = {};
            for (const op of ['eq', 'in']) query[op] = () => query;
            // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable query builder.
            query.then = (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(resolve);
            return query;
          },
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
      user: { id: 'actor-1' },
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
        body: JSON.stringify({
          memberIds: ['11111111-1111-4111-8111-111111111111'],
        }),
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
      userId: '11111111-1111-4111-8111-111111111111',
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
        body: JSON.stringify({
          memberIds: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
        }),
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
      { role_id: 'role-1', user_id: '11111111-1111-4111-8111-111111111111' },
      { role_id: 'role-1', user_id: '22222222-2222-4222-8222-222222222222' },
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

describe('CMS explicit grant writes', () => {
  it.each([true, false])(
    'filters explicit grants set to %s in all writers',
    async (enabled) => {
      const payload = {
        name: 'Role',
        permissions: [
          { id: 'admin' as const, enabled: true },
          { id: 'manage_mastermind' as const, enabled },
        ],
      };
      const writers = [
        (access: unknown) =>
          createExternalProjectTeamRole({ access: access as never, payload }),
        (access: unknown) =>
          updateExternalProjectTeamRole({
            access: access as never,
            payload,
            roleId: 'role-1',
          }),
        (access: unknown) =>
          updateExternalProjectTeamDefaultPermissions({
            access: access as never,
            // @ts-expect-error Exercise a forged payload outside the catalog.
            payload,
            memberType: 'MEMBER',
          }),
      ];
      for (const write of writers) {
        const { access, calls } = createAccess({ roleExists: true });
        const response = await write(access);
        expect(response.status).toBe(200);
        expect(calls.upsertedRolePermissions).toEqual([
          expect.objectContaining({ permission: 'admin', enabled: true }),
        ]);
      }
    }
  );

  it('writes nothing for a payload holding only an explicit grant', async () => {
    const { access, calls } = createAccess({ roleExists: true });
    const response = await updateExternalProjectTeamRole({
      access: access as never,
      payload: {
        name: 'Role',
        permissions: [{ id: 'manage_mastermind', enabled: true }],
      },
      roleId: 'role-1',
    });
    expect(response.status).toBe(200);
    expect(calls.upsertedRolePermissions).toEqual([]);
  });
});
