import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
}));

import { hasBoardShareWorkspaceAccess } from './board-share-access';

describe('board-share workspace choice validation', () => {
  const actor = 'actor-A';
  const ws = 'workspace-A';
  const owner = { from: vi.fn() };
  let share: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    vi.clearAllMocks();
    const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    q.select.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    q.maybeSingle.mockResolvedValue({
      data: { email: ' A@EXAMPLE.TEST ' },
      error: null,
    });
    owner.from.mockReturnValue(q);
    share = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
    };
    for (const method of ['select', 'eq', 'is', 'in'])
      share[method]!.mockReturnValue(share);
    share.limit!.mockResolvedValue({ data: [], error: null });
    f.admin.mockResolvedValue({ from: vi.fn().mockReturnValue(share) });
  });
  it.each(['user', 'email'])(
    'accepts a live %s share scoped to actor and workspace',
    async (recipient) => {
      if (recipient === 'email')
        share.limit!.mockResolvedValueOnce({ data: [], error: null });
      share.limit!.mockResolvedValueOnce({
        data: [{ board_id: 'board-A' }],
        error: null,
      });
      expect(
        await hasBoardShareWorkspaceAccess(owner as never, actor, ws)
      ).toBe(true);
      expect(share.eq).toHaveBeenCalledWith('shared_with_user_id', actor);
      if (recipient === 'email')
        expect(share.eq).toHaveBeenCalledWith(
          'shared_with_email',
          'a@example.test'
        );
      expect(share.eq).toHaveBeenCalledWith('workspace_boards.ws_id', ws);
      expect(share.is).toHaveBeenCalledWith(
        'workspace_boards.deleted_at',
        null
      );
      expect(share.in).toHaveBeenCalledWith('permission', ['view', 'edit']);
    }
  );
  it('denies absent, revoked, deleted or other-workspace shares', async () => {
    expect(await hasBoardShareWorkspaceAccess(owner as never, actor, ws)).toBe(
      false
    );
    expect(share.limit).toHaveBeenCalledTimes(2);
  });
  it('fails closed when canonical share discovery fails', async () => {
    share.limit!.mockResolvedValue({
      data: null,
      error: { message: 'offline' },
    });
    await expect(
      hasBoardShareWorkspaceAccess(owner as never, actor, ws)
    ).rejects.toThrow();
  });
});
