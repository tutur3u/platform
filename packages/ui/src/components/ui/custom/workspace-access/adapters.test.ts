import { describe, expect, it, vi } from 'vitest';
import {
  createStandardWorkspaceAccessAdapter,
  normalizeWorkspaceAccessRole,
} from './adapters';

const mocks = vi.hoisted(() => ({
  inviteWorkspaceMember: vi.fn().mockResolvedValue({ message: 'success' }),
}));

vi.mock('@tuturuuu/internal-api/workspaces', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/internal-api/workspaces')
  >()),
  inviteWorkspaceMember: mocks.inviteWorkspaceMember,
}));

describe('workspace access adapters', () => {
  it('normalizes role permissions into the shared access role shape', () => {
    expect(
      normalizeWorkspaceAccessRole({
        created_at: '2026-06-01T00:00:00.000Z',
        id: 'role-editor',
        name: 'Editor',
        permissions: [
          { enabled: true, id: 'manage_workspace_members' },
          { enabled: false, id: 'manage_workspace_roles' },
        ],
        user_count: 2,
        ws_id: 'ws_123',
      })
    ).toEqual({
      created_at: '2026-06-01T00:00:00.000Z',
      id: 'role-editor',
      members: undefined,
      name: 'Editor',
      permissions: [
        { enabled: true, id: 'manage_workspace_members' },
        { enabled: false, id: 'manage_workspace_roles' },
      ],
      user_count: 2,
      ws_id: 'ws_123',
    });
  });

  it('exposes linked workspace profile updates to every standard satellite app', () => {
    expect(
      createStandardWorkspaceAccessAdapter().updateMemberProfile
    ).toBeTypeOf('function');
  });

  it('forwards an optional role assignment with every standard invite', async () => {
    const adapter = createStandardWorkspaceAccessAdapter();

    await adapter.inviteMembers('ws-1', {
      accessPreset: 'member',
      emails: ['editor@example.com'],
      memberType: 'MEMBER',
      roleId: 'role-editor',
    } as Parameters<typeof adapter.inviteMembers>[1] & { roleId: string });

    expect(mocks.inviteWorkspaceMember).toHaveBeenCalledWith('ws-1', {
      accessPreset: 'member',
      confirmDefaultAdminMigration: undefined,
      email: 'editor@example.com',
      memberType: 'MEMBER',
      roleId: 'role-editor',
    });
  });
});
