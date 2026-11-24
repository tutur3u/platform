import { describe, expect, it, vi } from 'vitest';
import {
  updateExternalProjectTeamDefaultPermissions,
  updateExternalProjectTeamRole,
} from './team-access';

vi.mock('./access', () => ({
  hasRootExternalProjectsAdminPermission: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  requireWorkspaceExternalProjectMemberBootstrapAccess: vi.fn(),
}));

const LAST_MANAGER_BODY = {
  code: 'WORKSPACE_LAST_MANAGER',
  message: 'At least one member must be able to manage members',
};

function createAdmin(result: { data: unknown; error: unknown }) {
  const writes: string[] = [];
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn(() => ({ rpc }));
  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {
      eq: () => query,
      single: async () => ({
        data: { id: 'role-1', name: 'Publisher' },
        error: null,
      }),
    };
    query.select = () => query;
    for (const op of ['insert', 'update', 'upsert', 'delete']) {
      query[op] = () => {
        writes.push(`${op}:${table}`);
        return query;
      };
    }
    return query;
  });
  return { admin: { from, rpc: vi.fn(), schema }, rpc, schema, writes };
}

function teamAccess(admin: unknown) {
  return {
    admin,
    normalizedWorkspaceId: 'workspace-1',
    user: { id: 'actor-1' },
  } as never;
}

const permissions = [
  { enabled: true, id: 'manage_workspace_roles' },
  { enabled: false, id: 'manage_workspace_members' },
];

describe('guarded CMS access-level update', () => {
  it.each([
    ['updated', 200, { message: 'success' }],
    ['forbidden', 403, { error: 'Forbidden' }],
    ['not_found', 404, { message: 'Access level not found' }],
    [
      'role_protected',
      403,
      {
        message:
          'Mastermind manages this access level, so it cannot be renamed',
      },
    ],
    [
      'creator_protected',
      403,
      { message: 'Only the workspace creator can rename this role' },
    ],
    ['last_manager', 409, LAST_MANAGER_BODY],
  ])('maps %s', async (data, status, body) => {
    const { admin, rpc, schema, writes } = createAdmin({ data, error: null });
    const response = await updateExternalProjectTeamRole({
      access: teamAccess(admin),
      payload: { name: 'Publisher', permissions },
      roleId: 'role-1',
    });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(schema).toHaveBeenCalledExactlyOnceWith('private');
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'update_workspace_role_guarded',
      {
        p_actor_id: 'actor-1',
        p_mode: 'cms',
        p_name: 'Publisher',
        p_permissions: permissions,
        p_role_id: 'role-1',
        p_ws_id: 'workspace-1',
      }
    );
    expect(writes).toEqual([]);
  });

  it.each([
    [{ data: null, error: { code: '42501' } }],
    [{ data: 'removed', error: null }],
  ])('logs and fails on %j', async (result) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { admin, writes } = createAdmin(result);
    const response = await updateExternalProjectTeamRole({
      access: teamAccess(admin),
      payload: { name: 'Publisher', permissions },
      roleId: 'role-1',
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error updating access level',
    });
    expect(log).toHaveBeenCalledOnce();
    expect(writes).toEqual([]);
    log.mockRestore();
  });
});

describe('guarded CMS default access update', () => {
  it.each([
    ['updated', 200, { message: 'success' }],
    ['forbidden', 403, { error: 'Forbidden' }],
    ['not_found', 404, { message: 'Workspace not found' }],
    ['last_manager', 409, LAST_MANAGER_BODY],
  ])('maps %s', async (data, status, body) => {
    const { admin, rpc, schema, writes } = createAdmin({ data, error: null });
    const response = await updateExternalProjectTeamDefaultPermissions({
      access: teamAccess(admin),
      memberType: 'GUEST',
      payload: { permissions: permissions as never },
    });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(schema).toHaveBeenCalledExactlyOnceWith('private');
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'update_workspace_default_permissions_guarded',
      {
        p_actor_id: 'actor-1',
        p_member_type: 'GUEST',
        p_mode: 'cms',
        p_permissions: permissions,
        p_ws_id: 'workspace-1',
      }
    );
    expect(writes).toEqual([]);
  });

  it.each([
    [{ data: null, error: { code: '42501' } }],
    [{ data: 'role_protected', error: null }],
  ])('logs and fails on %j', async (result) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { admin, writes } = createAdmin(result);
    const response = await updateExternalProjectTeamDefaultPermissions({
      access: teamAccess(admin),
      memberType: 'MEMBER',
      payload: { permissions: permissions as never },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error updating default access',
    });
    expect(log).toHaveBeenCalledOnce();
    expect(writes).toEqual([]);
    log.mockRestore();
  });
});
