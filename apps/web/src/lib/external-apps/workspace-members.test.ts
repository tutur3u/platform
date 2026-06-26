import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadExternalAppWorkspaceMembers,
  updateExternalAppWorkspaceMemberRole,
} from './workspace-members';

const mocks = vi.hoisted(() => ({
  getWorkspaceMembers: vi.fn(),
}));

vi.mock('@/lib/workspace-members', () => ({
  getWorkspaceMembers: mocks.getWorkspaceMembers,
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
    targetApp: 'cybershield35',
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
});
