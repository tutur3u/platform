import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  containsPermission: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

vi.mock('./_utils', () => ({
  taskProgressErrorResponse: (message: string, status = 500) =>
    Response.json({ error: message }, { status }),
}));

import { requireTaskProgressRowAccess } from './_ownership';

const OWNER = 'user-owner';
const MEMBER = 'user-member';

function authFor(userId: string, row: Record<string, unknown> | null) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    select: vi.fn(() => query),
  };
  return {
    sbAdmin: { from: vi.fn(() => query) },
    supabase: {},
    user: { id: userId },
    wsId: 'ws-1',
  } as any;
}

describe('requireTaskProgressRowAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPermissions.mockResolvedValue({
      containsPermission: mocks.containsPermission,
    });
    mocks.containsPermission.mockReturnValue(false);
  });

  it('lets the owner write and keeps the owner filter on the write', async () => {
    const access = await requireTaskProgressRowAccess(
      authFor(OWNER, { id: 'goal-1', owner_id: OWNER }),
      'task_progress_goals',
      'goal-1',
      'Goal not found'
    );

    expect(access).toEqual({ ok: true, ownerFilter: { owner_id: OWNER } });
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('refuses another member with 403', async () => {
    const access = await requireTaskProgressRowAccess(
      authFor(MEMBER, { id: 'leaderboard-1', created_by: OWNER }),
      'task_leaderboards',
      'leaderboard-1',
      'Leaderboard not found'
    );

    expect(access.ok).toBe(false);
    if (access.ok) return;
    expect(access.response.status).toBe(403);
    expect(mocks.containsPermission).toHaveBeenCalledWith('manage_projects');
  });

  it('lets a Tasks manager write any row without an owner filter', async () => {
    mocks.containsPermission.mockReturnValue(true);

    const access = await requireTaskProgressRowAccess(
      authFor(MEMBER, { id: 'metric-1', created_by: OWNER }),
      'task_progress_metrics',
      'metric-1',
      'Metric not found'
    );

    expect(access).toEqual({ ok: true, ownerFilter: {} });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { id: MEMBER },
      wsId: 'ws-1',
    });
  });

  it('answers 404 for a row outside the workspace', async () => {
    const auth = authFor(OWNER, null);
    const access = await requireTaskProgressRowAccess(
      auth,
      'task_progress_entries',
      'entry-1',
      'Progress entry not found'
    );

    expect(access.ok).toBe(false);
    if (access.ok) return;
    expect(access.response.status).toBe(404);
    expect(auth.sbAdmin.from).toHaveBeenCalledWith('task_progress_entries');
  });
});
