import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  resolve: vi.fn(),
  permission: vi.fn(),
  admin: {},
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => m.admin,
}));
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  resolveTaskBoardAccess: m.resolve,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (id: string) => id,
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getPermissions: async () => ({ containsPermission: m.permission }),
}));

import { requireCapacityAccess } from './_lib';

describe('capacity access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.permission.mockReturnValue(true);
  });
  const input = () => ({
    boardId: 'board',
    rawWsId: 'workspace-a',
    supabase: m.admin as never,
    user: { id: 'actor' } as never,
  });
  it('rejects a board from another workspace before returning a write manager', async () => {
    m.resolve.mockResolvedValue({
      boardId: 'board',
      wsId: 'workspace-b',
      mode: 'member',
    });
    const result = await requireCapacityAccess({ ...input(), write: true });
    expect('error' in result && result.error.status).toBe(404);
  });
  it('requires edit board access for writes', async () => {
    m.resolve.mockResolvedValue({
      boardId: 'board',
      wsId: 'workspace-a',
      mode: 'member',
    });
    const result = await requireCapacityAccess({ ...input(), write: true });
    expect(result).toMatchObject({ boardId: 'board', wsId: 'workspace-a' });
    expect(m.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: 'edit' })
    );
  });
  it('preserves view-only reads', async () => {
    m.resolve.mockResolvedValue({
      boardId: 'board',
      wsId: 'workspace-a',
      mode: 'guest',
    });
    expect(await requireCapacityAccess(input())).toMatchObject({
      boardId: 'board',
    });
    expect(m.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: 'view' })
    );
  });
});
