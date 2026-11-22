import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadExternalAppWorkspaceMembers,
  updateExternalAppWorkspaceDefaultAdmin,
  updateExternalAppWorkspaceMemberRole,
} from './workspace-members';

const mocks = vi.hoisted(() => ({
  getWorkspaceMembers: vi.fn(),
  roleHasCreatorGrantPermission: vi.fn(),
}));

vi.mock('@/lib/workspace-members', () => ({
  getWorkspaceMembers: mocks.getWorkspaceMembers,
}));

vi.mock('@/lib/workspace-creator-grant-permissions', () => ({
  roleHasCreatorGrantPermission: mocks.roleHasCreatorGrantPermission,
}));

const splitRoleMember = {
  avatar_url: null,
  default_permissions: [],
  display_name: 'Split Role',
  email: 'split@example.com',
  id: 'user-2',
  is_creator: false,
  pending: false,
  roles: [
    {
      id: 'role-members',
      permissions: [{ enabled: true, permission: 'manage_workspace_members' }],
    },
    {
      id: 'role-roles',
      permissions: [{ enabled: true, permission: 'manage_workspace_roles' }],
    },
  ],
};

const existingAdmin = {
  avatar_url: null,
  default_permissions: [],
  display_name: 'Existing Admin',
  email: 'admin@example.com',
  id: 'user-3',
  is_creator: false,
  pending: false,
  roles: [
    {
      id: 'role-admin',
      permissions: [
        { enabled: true, permission: 'manage_workspace_members' },
        { enabled: true, permission: 'manage_workspace_roles' },
      ],
    },
  ],
};

function access(overrides: Record<string, unknown> = {}) {
  return {
    admin: {},
    canManageMembers: true,
    canManageRoles: true,
    normalizedWorkspaceId: 'workspace-1',
    permissions: {},
    targetApp: 'external-app',
    user: { email: 'actor@example.com', id: 'user-1' },
    ...overrides,
  } as never;
}

describe('external app workspace member helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('projects admin when permissions are split across workspace roles', async () => {
    mocks.getWorkspaceMembers.mockResolvedValue([splitRoleMember]);

    const response = await loadExternalAppWorkspaceMembers(access());

    expect(response.members).toEqual([
      expect.objectContaining({
        id: 'user-2',
        role: 'admin',
        roleSources: ['role'],
      }),
    ]);
  });

  it.each([false, true])(
    'demotes through one atomic RPC (disable defaults %s)',
    async (disableDefaultAdmin) => {
      const admin = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({ data: 'removed', error: null }),
      };
      mocks.getWorkspaceMembers.mockResolvedValue([
        splitRoleMember,
        existingAdmin,
      ]);

      const response = await updateExternalAppWorkspaceMemberRole({
        access: access({ admin }),
        request: new Request('http://localhost', {
          body: JSON.stringify({
            role: 'member',
            confirmDefaultAdminDisable: disableDefaultAdmin,
          }),
          method: 'PATCH',
        }),
        userId: 'user-2',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ message: 'success' });
      expect(admin.rpc).toHaveBeenCalledExactlyOnceWith(
        'reduce_external_app_workspace_admin_guarded',
        {
          p_actor_id: 'user-1',
          p_disable_default_admin: disableDefaultAdmin,
          p_user_id: 'user-2',
          p_ws_id: 'workspace-1',
        }
      );
      expect(admin.from).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['not_found', 404, { message: 'Member not found' }],
    [
      'creator_protected',
      403,
      { message: 'Workspace creator access cannot be changed here' },
    ],
    ['self_protected', 403, { message: 'Cannot change your own access' }],
    [
      'last_admin',
      403,
      { message: 'At least one workspace admin is required' },
    ],
    [
      'last_manager',
      409,
      {
        code: 'WORKSPACE_LAST_MANAGER',
        message: 'At least one member must be able to manage members',
      },
    ],
    [
      'default_admin_enabled',
      409,
      {
        code: 'DEFAULT_ADMIN_ENABLED',
        message: 'Default member admin access must be disabled before demotion',
      },
    ],
    ['forbidden', 403, { error: 'Forbidden' }],
    ['unexpected', 500, { message: 'Error updating workspace role' }],
  ])(
    'maps demotion result %s without direct writes',
    async (data, status, body) => {
      const admin = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({ data, error: null }),
      };
      mocks.getWorkspaceMembers.mockResolvedValue([
        splitRoleMember,
        existingAdmin,
      ]);
      const response = await updateExternalAppWorkspaceMemberRole({
        access: access({ admin }),
        request: new Request('http://localhost', {
          body: JSON.stringify({ role: 'member' }),
          method: 'PATCH',
        }),
        userId: 'user-2',
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
      expect(admin.from).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['removed', 200, { message: 'success' }],
    [
      'last_admin',
      403,
      { message: 'At least one workspace admin is required' },
    ],
    [
      'last_manager',
      409,
      {
        code: 'WORKSPACE_LAST_MANAGER',
        message: 'At least one member must be able to manage members',
      },
    ],
    ['forbidden', 403, { error: 'Forbidden' }],
    ['not_found', 500, { message: 'Error updating default admin access' }],
    ['unexpected', 500, { message: 'Error updating default admin access' }],
  ])(
    'maps default-admin reduction %s without a direct upsert',
    async (data, status, body) => {
      const admin = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({ data, error: null }),
      };
      const response = await updateExternalAppWorkspaceDefaultAdmin({
        access: access({ admin }),
        request: new Request('http://localhost', {
          body: JSON.stringify({ enabled: false }),
          method: 'PATCH',
        }),
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
      expect(admin.rpc).toHaveBeenCalledExactlyOnceWith(
        'reduce_external_app_workspace_admin_guarded',
        {
          p_actor_id: 'user-1',
          p_disable_default_admin: true,
          p_ws_id: 'workspace-1',
        }
      );
      expect(admin.from).not.toHaveBeenCalled();
    }
  );

  it('uses the role failure envelope when an admin reduction RPC fails', async () => {
    const error = new Error('unavailable');
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: 'removed', error }),
    };
    mocks.getWorkspaceMembers.mockResolvedValue([
      splitRoleMember,
      existingAdmin,
    ]);
    const response = await updateExternalAppWorkspaceMemberRole({
      access: access({ admin }),
      request: new Request('http://localhost', {
        body: JSON.stringify({
          role: 'member',
          confirmDefaultAdminDisable: true,
        }),
        method: 'PATCH',
      }),
      userId: 'user-2',
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error updating workspace role',
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('keeps enabling member admin defaults as a scoped permission grant', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: vi.fn(() => ({ upsert })), rpc: vi.fn() };
    const response = await updateExternalAppWorkspaceDefaultAdmin({
      access: access({ admin }),
      request: new Request('http://localhost', {
        body: JSON.stringify({ enabled: true }),
        method: 'PATCH',
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'success' });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).toHaveBeenCalledExactlyOnceWith(
      'workspace_default_permissions'
    );
    expect(upsert).toHaveBeenCalledExactlyOnceWith(
      [
        {
          enabled: true,
          member_type: 'MEMBER',
          permission: 'manage_workspace_members',
          ws_id: 'workspace-1',
        },
        {
          enabled: true,
          member_type: 'MEMBER',
          permission: 'manage_workspace_roles',
          ws_id: 'workspace-1',
        },
      ],
      { onConflict: 'ws_id,permission,member_type' }
    );
  });

  it('refuses to promote through a name-selected creator-granted role, even for its creator', async () => {
    const memberRoleUpsert = vi.fn().mockResolvedValue({ error: null });
    const query: Record<string, unknown> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => ({
      data: { id: 'role-external-admin', ws_id: 'workspace-1' },
      error: null,
    }));
    query.upsert = memberRoleUpsert;
    const admin = { from: vi.fn(() => query) };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getWorkspaceMembers.mockResolvedValue([
      {
        ...splitRoleMember,
        roles: [],
      },
    ]);
    mocks.roleHasCreatorGrantPermission.mockResolvedValue(true);

    const response = await updateExternalAppWorkspaceMemberRole({
      access: access({
        admin,
        user: { email: 'creator@example.com', id: 'creator-1' },
      }),
      request: new Request('http://localhost', {
        body: JSON.stringify({ role: 'admin' }),
        method: 'PATCH',
      }),
      userId: 'user-2',
    });

    expect(response.status).toBe(500);
    expect(mocks.roleHasCreatorGrantPermission).toHaveBeenCalledWith(admin, {
      includeDisabled: true,
      roleId: 'role-external-admin',
      wsId: 'workspace-1',
    });
    expect(memberRoleUpsert).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('refuses to promote through an admin role holding a disabled billing row', async () => {
    const actual = await vi.importActual<
      typeof import('@/lib/workspace-creator-grant-permissions')
    >('@/lib/workspace-creator-grant-permissions');
    mocks.roleHasCreatorGrantPermission.mockImplementation(
      actual.roleHasCreatorGrantPermission
    );
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        const query: Record<string, unknown> = {};
        let enabledOnly = false;
        query.select = vi.fn(() => query);
        query.in = vi.fn(() => query);
        query.eq = vi.fn((column: string, value: unknown) => {
          if (column === 'enabled') enabledOnly = value === true;
          return query;
        });
        query.maybeSingle = vi.fn(async () => ({
          data: { id: 'role-external-admin', ws_id: 'workspace-1' },
          error: null,
        }));
        query.upsert = upsert;
        // The disabled billing row is hidden only by an enabled-only filter.
        const rows = () =>
          table === 'workspace_roles'
            ? [{ id: 'role-external-admin', ws_id: 'workspace-1' }]
            : table === 'workspace_role_permissions' && !enabledOnly
              ? [{ role_id: 'role-external-admin', ws_id: 'workspace-1' }]
              : [];
        query.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve);
        return query;
      }),
    };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getWorkspaceMembers.mockResolvedValue([
      { ...splitRoleMember, roles: [] },
    ]);

    const response = await updateExternalAppWorkspaceMemberRole({
      access: access({ admin }),
      request: new Request('http://localhost', {
        body: JSON.stringify({ role: 'admin' }),
        method: 'PATCH',
      }),
      userId: 'user-2',
    });

    expect(response.status).toBe(500);
    expect(errorLog).toHaveBeenCalledWith(
      'Error updating external app workspace member role',
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'creator_grant_role_requires_creator',
        }),
      })
    );
    expect(upsert).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('answers 403 when the database refuses a role for a guest', async () => {
    mocks.roleHasCreatorGrantPermission.mockResolvedValue(false);
    const roleMemberUpsert = vi.fn().mockResolvedValue({
      error: {
        code: '42501',
        message:
          "workspace roles can only be held by members of the role's workspace",
      },
    });
    const admin = {
      from: vi.fn((table: string) => {
        const query: Record<string, unknown> = {};
        query.select = vi.fn(() => query);
        query.in = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.maybeSingle = vi.fn(async () => ({
          data: { id: 'role-external-admin', ws_id: 'workspace-1' },
          error: null,
        }));
        query.upsert =
          table === 'workspace_role_members'
            ? roleMemberUpsert
            : vi.fn().mockResolvedValue({ error: null });
        query.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve);
        return query;
      }),
    };
    mocks.getWorkspaceMembers.mockResolvedValue([
      { ...splitRoleMember, roles: [] },
    ]);

    const response = await updateExternalAppWorkspaceMemberRole({
      access: access({ admin }),
      request: new Request('http://localhost', {
        body: JSON.stringify({ role: 'admin' }),
        method: 'PATCH',
      }),
      userId: 'user-2',
    });

    expect(response.status).toBe(403);
    expect(roleMemberUpsert).toHaveBeenCalled();
  });
});
