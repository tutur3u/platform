import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  createClientMock,
  getPermissionsMock,
  getWorkspaceUserMock,
  hasUserGroupInWorkspaceMock,
  normalizeWorkspaceIdMock,
  resolveAuthenticatedSessionUserMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  getWorkspaceUserMock: vi.fn(),
  hasUserGroupInWorkspaceMock: vi.fn(),
  normalizeWorkspaceIdMock: vi.fn(),
  resolveAuthenticatedSessionUserMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: resolveAuthenticatedSessionUserMock,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
  getWorkspaceUser: getWorkspaceUserMock,
  normalizeWorkspaceId: normalizeWorkspaceIdMock,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/user-groups/route-helpers', () => ({
  hasUserGroupInWorkspace: hasUserGroupInWorkspaceMock,
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';

describe('group posts collection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createAdminClientMock.mockResolvedValue({ id: 'admin-client' });
    getPermissionsMock.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    hasUserGroupInWorkspaceMock.mockResolvedValue(true);
    normalizeWorkspaceIdMock.mockResolvedValue(WORKSPACE_ID);
  });

  it('rejects cross-workspace group reads before querying private posts', async () => {
    hasUserGroupInWorkspaceMock.mockResolvedValue(false);

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        `http://localhost/api/v1/workspaces/personal/user-groups/${GROUP_ID}/posts`
      ),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'User group not found',
    });
    expect(hasUserGroupInWorkspaceMock).toHaveBeenCalledWith({
      sbAdmin: { id: 'admin-client' },
      wsId: WORKSPACE_ID,
      groupId: GROUP_ID,
    });
  });

  it('validates group IDs before checking permissions', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/user-groups/not-a-uuid/posts'
      ),
      {
        params: Promise.resolve({
          groupId: 'not-a-uuid',
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(getPermissionsMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});
