import { describe, expect, it, vi } from 'vitest';
import { getPendingWorkspaceInvitationRoleIds } from './get-pending-role-ids';

describe('getPendingWorkspaceInvitationRoleIds', () => {
  it('returns every unique role assigned to an email invitation', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: ['role-editor', 'role-reviewer', 'role-editor'],
      error: null,
    });
    const admin = {
      schema: vi.fn(() => ({ rpc })),
    } as never;

    await expect(
      getPendingWorkspaceInvitationRoleIds({
        admin,
        email: 'Pending@Example.COM',
        userId: null,
        workspaceId: 'workspace-1',
      })
    ).resolves.toEqual(['role-editor', 'role-reviewer']);
    expect(rpc).toHaveBeenCalledWith('get_workspace_invitation_role_ids', {
      p_email: 'pending@example.com',
      p_user_id: null,
      p_ws_id: 'workspace-1',
    });
  });

  it('fails closed when pending roles cannot be read', async () => {
    const admin = {
      schema: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'lookup failed' },
        }),
      })),
    } as never;

    await expect(
      getPendingWorkspaceInvitationRoleIds({
        admin,
        email: null,
        userId: 'user-1',
        workspaceId: 'workspace-1',
      })
    ).rejects.toThrow('lookup failed');
  });
});
