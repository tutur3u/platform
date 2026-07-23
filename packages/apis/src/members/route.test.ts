import { describe, expect, it, vi } from 'vitest';
import {
  revokeDirectBoardGuestAccess,
  revokeWorkspaceMemberAccessRecords,
} from './route';

describe('revokeWorkspaceMemberAccessRecords', () => {
  it('revokes a pending email invitation case-insensitively with the authorized admin client', async () => {
    const lookupIlike = vi.fn().mockResolvedValue({
      data: [{ id: 'invited-user-1' }],
      error: null,
    });
    const pendingEq = vi.fn(() => ({ ilike: lookupIlike }));
    const inviteIn = vi.fn().mockResolvedValue({ error: null });
    const emailIlike = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === 'workspace_members_and_invites') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: pendingEq })),
          })),
        };
      }
      if (table === 'workspace_invites') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({ in: inviteIn })),
          })),
        };
      }
      if (table === 'workspace_email_invites') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({ ilike: emailIlike })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await revokeWorkspaceMemberAccessRecords({
      sbAdmin: { from } as never,
      userEmail: 'invite@example.com',
      userId: null,
      wsId: 'workspace-1',
    });

    expect(lookupIlike).toHaveBeenCalledWith('email', 'invite@example.com');
    expect(pendingEq).toHaveBeenCalledWith('pending', true);
    expect(inviteIn).toHaveBeenCalledWith('user_id', ['invited-user-1']);
    expect(emailIlike).toHaveBeenCalledWith('email', 'invite@example.com');
  });

  it('removes joined membership and direct invitations by user id', async () => {
    const inviteUserEq = vi.fn().mockResolvedValue({ error: null });
    const memberUserEq = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: table === 'workspace_members' ? memberUserEq : inviteUserEq,
        })),
      })),
    }));

    await revokeWorkspaceMemberAccessRecords({
      sbAdmin: { from } as never,
      userEmail: null,
      userId: 'user-1',
      wsId: 'workspace-1',
    });

    expect(inviteUserEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(memberUserEq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('revokeDirectBoardGuestAccess', () => {
  it('removes user and email shares only from boards in the workspace', async () => {
    const userEq = vi.fn().mockResolvedValue({ error: null });
    const emailEq = vi.fn().mockResolvedValue({ error: null });
    const shareIn = vi
      .fn()
      .mockReturnValueOnce({ eq: userEq })
      .mockReturnValueOnce({ eq: emailEq });
    const boardEq = vi.fn().mockResolvedValue({
      data: [{ id: 'board-1' }, { id: 'board-2' }],
      error: null,
    });
    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_boards') {
          return { select: vi.fn(() => ({ eq: boardEq })) };
        }
        if (table === 'task_board_shares') {
          return { delete: vi.fn(() => ({ in: shareIn })) };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await revokeDirectBoardGuestAccess({
      sbAdmin: sbAdmin as never,
      wsId: 'workspace-1',
      userId: 'user-1',
      userEmail: 'member@example.com',
    });

    expect(boardEq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(shareIn).toHaveBeenNthCalledWith(1, 'board_id', [
      'board-1',
      'board-2',
    ]);
    expect(shareIn).toHaveBeenNthCalledWith(2, 'board_id', [
      'board-1',
      'board-2',
    ]);
    expect(userEq).toHaveBeenCalledWith('shared_with_user_id', 'user-1');
    expect(emailEq).toHaveBeenCalledWith(
      'shared_with_email',
      'member@example.com'
    );
  });

  it('does not issue share deletes when the workspace has no boards', async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    }));

    await revokeDirectBoardGuestAccess({
      sbAdmin: { from } as never,
      wsId: 'workspace-1',
      userId: 'user-1',
      userEmail: null,
    });

    expect(from).toHaveBeenCalledTimes(1);
  });
});
