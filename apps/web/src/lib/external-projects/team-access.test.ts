import { describe, expect, it, vi } from 'vitest';
import { requireWorkspaceExternalProjectAccess } from './access';
import {
  addExternalProjectRoleMembers,
  createExternalProjectTeamRole,
  deleteExternalProjectTeamRole,
  removeExternalProjectRoleMember,
  requireExternalProjectTeamAccess,
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

const ROLE_MEMBER = '44444444-4444-4444-8444-444444444444';

type QueryResult<T> = {
  data: T | null;
  error: { code: string } | null;
};

function createAccess({
  roleExists,
  rpcResult = { data: 'removed', error: null },
}: {
  roleExists: boolean;
  rpcResult?: { data: unknown; error: unknown };
}) {
  const calls = {
    deletedRoleMemberFilters: [] as Array<[string, string]>,
    insertedRoleMembers: null as unknown,
    roleFilters: [] as Array<[string, string]>,
    roleUpdates: [] as unknown[],
    rpcCalls: [] as Array<{ args: Record<string, unknown>; fn: string }>,
    upsertedRolePermissions: null as unknown,
  };

  const roleResult = (): QueryResult<{
    id: string;
    name: string;
    ws_id: string;
  }> => ({
    data: roleExists
      ? { id: 'role-1', name: 'Publisher', ws_id: 'workspace-1' }
      : null,
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
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.rpcCalls.push({ args, fn });
      return rpcResult;
    },
    from(table: string) {
      if (table === 'workspace_roles') {
        return {
          select() {
            return {
              eq(column: string, value: string) {
                calls.roleFilters.push([column, value]);
                return this;
              },
              in() {
                return this;
              },
              single() {
                return Promise.resolve(roleResult());
              },
              then(resolve: (value: unknown) => unknown) {
                return Promise.resolve({
                  data: roleExists
                    ? [{ id: 'role-1', ws_id: 'workspace-1' }]
                    : [],
                  error: null,
                }).then(resolve);
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
    expect(calls.rpcCalls).toEqual([]);
  });

  it('removes an access level person only through the guarded function', async () => {
    for (const data of ['removed', 'not_found']) {
      const { access, calls } = createAccess({
        roleExists: true,
        rpcResult: { data, error: null },
      });

      const response = await removeExternalProjectRoleMember({
        access: access as never,
        roleId: 'role-1',
        userId: ROLE_MEMBER,
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ message: 'success' });
      expect(calls.rpcCalls).toEqual([
        {
          args: {
            p_actor_id: 'actor-1',
            p_role_id: 'role-1',
            p_user_id: ROLE_MEMBER,
            p_ws_id: 'workspace-1',
          },
          fn: 'remove_workspace_role_member_guarded',
        },
      ]);
      expect(calls.deletedRoleMemberFilters).toEqual([]);
    }
  });

  it('answers each refusal of the guarded role removal', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = { message: 'Error removing access level person' };
    const cases = [
      {
        body: {
          code: 'WORKSPACE_LAST_MANAGER',
          message: 'At least one member must be able to manage members',
        },
        result: { data: 'last_manager', error: null },
        status: 409,
      },
      {
        body: { error: 'Forbidden' },
        result: { data: 'forbidden', error: null },
        status: 403,
      },
      {
        body: failure,
        result: { data: null, error: { code: '42501' } },
        status: 500,
      },
      { body: failure, result: { data: 'deleted', error: null }, status: 500 },
      // The role function never answers creator_protected.
      {
        body: failure,
        result: { data: 'creator_protected', error: null },
        status: 500,
      },
    ];

    for (const { body, result, status } of cases) {
      const { access, calls } = createAccess({
        roleExists: true,
        rpcResult: result,
      });
      const response = await removeExternalProjectRoleMember({
        access: access as never,
        roleId: 'role-1',
        userId: ROLE_MEMBER,
      });

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual(body);
      expect(calls.rpcCalls).toHaveLength(1);
      expect(calls.deletedRoleMemberFilters).toEqual([]);
    }

    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });

  it('refuses a user id that is not a canonical uuid without calling the function', async () => {
    for (const userId of [
      'not-a-uuid',
      ROLE_MEMBER.replaceAll('-', ''),
      `{${ROLE_MEMBER}}`,
    ]) {
      const { access, calls } = createAccess({ roleExists: true });
      const response = await removeExternalProjectRoleMember({
        access: access as never,
        roleId: 'role-1',
        userId,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        message: 'Invalid member identifier',
      });
      expect(calls.rpcCalls).toEqual([]);
    }
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

describe('CMS access-level removal', () => {
  const failure = { message: 'Error deleting access level' };

  it.each([
    ['removed', 200, { message: 'success' }],
    ['not_found', 200, { message: 'success' }],
    ['forbidden', 403, { error: 'Forbidden' }],
    [
      'last_manager',
      409,
      {
        code: 'WORKSPACE_LAST_MANAGER',
        message: 'At least one member must be able to manage members',
      },
    ],
    ['role_protected', 500, failure],
    ['creator_protected', 500, failure],
    ['unexpected', 500, failure],
  ])('maps %s without a direct delete', async (data, status, body) => {
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data, error: null }),
    };
    const response = await deleteExternalProjectTeamRole({
      access: {
        admin,
        normalizedWorkspaceId: 'workspace-1',
        user: { id: 'actor-1' },
      } as never,
      roleId: 'role-1',
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(admin.rpc).toHaveBeenCalledExactlyOnceWith(
      'delete_workspace_role_guarded',
      {
        p_actor_id: 'actor-1',
        p_mode: 'cms',
        p_role_id: 'role-1',
        p_ws_id: 'workspace-1',
      }
    );
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('returns the existing failure when the RPC reports an error', async () => {
    const error = new Error('unavailable');
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: 'removed', error }),
    };
    const response = await deleteExternalProjectTeamRole({
      access: {
        admin,
        normalizedWorkspaceId: 'workspace-1',
        user: { id: 'actor-1' },
      } as never,
      roleId: 'role-1',
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(failure);
    expect(admin.from).not.toHaveBeenCalled();
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

it('requires management access before reading team member/email data', async () => {
  vi.mocked(requireWorkspaceExternalProjectAccess).mockResolvedValueOnce({
    ok: false,
    response: new Response(null, { status: 403 }),
  } as never);
  const result = await requireExternalProjectTeamAccess({
    request: new Request('https://example.com/members'),
    wsId: 'workspace',
  });
  expect(result.ok).toBe(false);
  expect(requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith(
    expect.objectContaining({ mode: 'manage' })
  );
});
