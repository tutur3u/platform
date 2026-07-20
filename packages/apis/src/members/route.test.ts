import { describe, expect, it, vi } from 'vitest';
import { revokeDirectBoardGuestAccess } from './route';

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
