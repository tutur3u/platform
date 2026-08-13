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
        roleIds: ['role-editor', 'role-reviewer'],
        userId: 'user-1',
        workspaceId: 'workspace-1',
      })
    ).resolves.toEqual({ created: true });
    expect(rpc).toHaveBeenCalledWith(
      'finalize_workspace_invitation_membership_v2',
      {
        p_member_type: 'MEMBER',
        p_role_ids: ['role-editor', 'role-reviewer'],
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
        roleIds: [],
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
        roleIds: ['missing-role'],
        userId: 'user-1',
        workspaceId: 'workspace-1',
      })
    ).rejects.toThrow('role unavailable');
  });
});
