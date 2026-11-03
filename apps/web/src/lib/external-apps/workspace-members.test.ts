import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadExternalAppWorkspaceMembers,
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

  it('force-demotion removes every role that grants either admin permission', async () => {
    const inMock = vi.fn().mockResolvedValue({ error: null });
    const eqMock = vi.fn(() => ({ in: inMock }));
    const deleteMock = vi.fn(() => ({ eq: eqMock }));
    const admin = {
      from: vi.fn((table: string) => {
        if (table !== 'workspace_role_members') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return { delete: deleteMock };
      }),
    };
    mocks.getWorkspaceMembers
      .mockResolvedValueOnce([splitRoleMember, existingAdmin])
      .mockResolvedValueOnce([splitRoleMember]);

    const response = await updateExternalAppWorkspaceMemberRole({
      access: access({ admin }),
      request: new Request('http://localhost', {
        body: JSON.stringify({ role: 'member' }),
        method: 'PATCH',
      }),
      userId: 'user-2',
    });

    expect(response.status).toBe(200);
    expect(inMock).toHaveBeenCalledWith('role_id', [
      'role-members',
      'role-roles',
    ]);
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
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
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
});
