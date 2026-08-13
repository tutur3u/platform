import { describe, expect, it, vi } from 'vitest';
import { finalizeInvitedWorkspaceMembership } from './finalize-membership';

describe('finalizeInvitedWorkspaceMembership', () => {
  it('passes membership and role intent to the transactional RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const admin = {
      schema: vi.fn(() => ({ rpc })),
    } as never;

    await expect(
      finalizeInvitedWorkspaceMembership({
        admin,
        invitationType: 'MEMBER',
        roleId: 'role-editor',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      })
    ).resolves.toEqual({ created: true });
    expect(rpc).toHaveBeenCalledWith(
      'finalize_workspace_invitation_membership',
      {
        p_member_type: 'MEMBER',
        p_role_id: 'role-editor',
        p_user_id: 'user-1',
        p_ws_id: 'workspace-1',
      }
    );
  });

  it('reports an existing concurrently finalized membership', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const admin = { schema: vi.fn(() => ({ rpc })) } as never;

    await expect(
      finalizeInvitedWorkspaceMembership({
        admin,
        invitationType: 'GUEST',
        roleId: null,
        userId: 'user-1',
        workspaceId: 'workspace-1',
      })
    ).resolves.toEqual({ created: false });
  });

  it('fails without exposing a partially finalized membership', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'role unavailable' },
    });
    const admin = { schema: vi.fn(() => ({ rpc })) } as never;

    await expect(
      finalizeInvitedWorkspaceMembership({
        admin,
        invitationType: 'MEMBER',
        roleId: 'missing-role',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      })
    ).rejects.toThrow('role unavailable');
  });
});
