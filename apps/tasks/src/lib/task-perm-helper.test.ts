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

import { verifyTaskShareAccess } from './task-perm-helper';

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
