import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

import {
  verifyTaskShareAccess,
  verifyTaskSharingEnabled,
} from './task-perm-helper';

describe('verifyTaskShareAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks membership with the resolved app-session client', async () => {
    const sessionClient = { name: 'app-session-client' };
    const taskId = '00000000-0000-4000-8000-000000000001';
    const wsId = '00000000-0000-4000-8000-000000000002';
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      supabase: sessionClient,
      user: { id: 'user-1' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(wsId);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });

    const result = await verifyTaskShareAccess('personal', taskId);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.response.status).toBe(403);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      wsId,
      userId: 'user-1',
      supabase: sessionClient,
    });
  });
});

describe('task share creation policy', () => {
  it.each([true, false, null])(
    'enforces sharing-enabled policy (%s) after member/task binding',
    async (enabled) => {
      const wsId = '00000000-0000-4000-8000-000000000002';
      const taskId = '00000000-0000-4000-8000-000000000001';
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: taskId,
            task_lists: { workspace_boards: { ws_id: wsId } },
          },
          error: null,
        }),
      };
      const rpc = vi.fn().mockResolvedValue({ data: enabled, error: null });
      mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
        authError: null,
        supabase: { from: () => query, rpc },
        user: { id: 'member-a' },
      });
      mocks.normalizeWorkspaceId.mockResolvedValue(wsId);
      mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
      expect(await verifyTaskSharingEnabled({ rpc } as never, taskId)).toEqual(
        enabled === true ? null : expect.objectContaining({ status: 403 })
      );
      expect(rpc).toHaveBeenCalledWith('is_task_sharing_enabled', {
        p_task_id: taskId,
      });
      // Existing member read/update/delete workflows do not require sharing enabled.
      expect((await verifyTaskShareAccess(wsId, taskId)).success).toBe(true);
    }
  );
});

describe('task sharing lookup errors', () => {
  it('returns 500 rather than a disabled-policy response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: {} });
    const result = await verifyTaskSharingEnabled({ rpc } as never, 'task-a');
    expect(result?.status).toBe(500);
    await expect(result?.json()).resolves.toEqual({
      error: 'Failed to verify task sharing',
    });
  });
});
