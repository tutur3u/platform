import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  boardWsId: 'workspace-a' as string | null,
  membership: vi.fn(),
  permission: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: m.boardWsId ? { ws_id: m.boardWsId } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  resolveTaskBoardAccess: m.resolve,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (id: string) => id,
  verifyWorkspaceMembershipType: m.membership,
  getPermissions: async () => ({ containsPermission: m.permission }),
}));

import { requireCapacityAccess } from './_lib';

const resolved = (wsId: string, mode: 'member' | 'guest' = 'member') => ({
  access: { mode, permission: 'edit' },
  boardId: 'board',
  wsId,
});

const status = (result: Awaited<ReturnType<typeof requireCapacityAccess>>) =>
  'error' in result ? result.error.status : null;

describe('capacity access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.boardWsId = 'workspace-a';
    m.membership.mockResolvedValue({ ok: true });
    m.permission.mockReturnValue(true);
  });
  const input = () => ({
    boardId: 'board',
    rawWsId: 'workspace-a',
    supabase: {} as never,
    user: { id: 'actor' } as never,
  });

  it('404s a foreign board on write before any permission lookup', async () => {
    m.boardWsId = 'workspace-b';
    const result = await requireCapacityAccess({ ...input(), write: true });
    expect(status(result)).toBe(404);
    expect(m.membership).not.toHaveBeenCalled();
    expect(m.resolve).not.toHaveBeenCalled();
  });

  it('404s a foreign board on read', async () => {
    m.boardWsId = 'workspace-b';
    const result = await requireCapacityAccess(input());
    expect(status(result)).toBe(404);
    expect(m.resolve).not.toHaveBeenCalled();
  });

  it('404s when access resolves to another workspace than the route', async () => {
    m.resolve.mockResolvedValue(resolved('workspace-b'));
    expect(status(await requireCapacityAccess(input()))).toBe(404);
    expect(
      status(await requireCapacityAccess({ ...input(), write: true }))
    ).toBe(404);
  });

  it('denies writes without manage_projects', async () => {
    m.permission.mockReturnValue(false);
    const result = await requireCapacityAccess({ ...input(), write: true });
    expect(status(result)).toBe(403);
    expect(m.permission).toHaveBeenCalledWith('manage_projects');
    expect(m.resolve).not.toHaveBeenCalled();
  });

  it('denies writes from non-members', async () => {
    m.membership.mockResolvedValue({ ok: false });
    const result = await requireCapacityAccess({ ...input(), write: true });
    expect(status(result)).toBe(403);
    expect(m.resolve).not.toHaveBeenCalled();
  });

  it('requires edit board access for writes', async () => {
    m.resolve.mockResolvedValue(resolved('workspace-a'));
    const result = await requireCapacityAccess({ ...input(), write: true });
    expect(result).toMatchObject({ boardId: 'board', wsId: 'workspace-a' });
    expect(m.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: 'edit' })
    );
  });

  it('preserves view-only reads', async () => {
    m.resolve.mockResolvedValue(resolved('workspace-a', 'guest'));
    expect(await requireCapacityAccess(input())).toMatchObject({
      boardId: 'board',
    });
    expect(m.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: 'view' })
    );
    expect(m.permission).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    '404s a missing board before any lookup (write=%s), like a foreign board',
    async (write) => {
      m.boardWsId = null;
      expect(status(await requireCapacityAccess({ ...input(), write }))).toBe(
        404
      );
      expect(m.membership).not.toHaveBeenCalled();
      expect(m.resolve).not.toHaveBeenCalled();
    }
  );
});
