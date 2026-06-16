import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  getPermissionsMock,
  hasUserGroupPostInWorkspaceMock,
  normalizeWorkspaceIdMock,
  verifySecretMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  hasUserGroupPostInWorkspaceMock: vi.fn(),
  normalizeWorkspaceIdMock: vi.fn(),
  verifySecretMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
  normalizeWorkspaceId: normalizeWorkspaceIdMock,
  verifySecret: verifySecretMock,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/post-email-queue', () => ({
  enqueueApprovedPostEmails: vi.fn(),
}));

vi.mock('@/lib/user-groups/route-helpers', () => ({
  hasUserGroupPostInWorkspace: hasUserGroupPostInWorkspaceMock,
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';

describe('group checks collection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createAdminClientMock.mockResolvedValue({ id: 'admin-client' });
    getPermissionsMock.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    hasUserGroupPostInWorkspaceMock.mockResolvedValue(true);
    normalizeWorkspaceIdMock.mockResolvedValue(WORKSPACE_ID);
    verifySecretMock.mockResolvedValue(true);
  });

  it('rejects cross-workspace check reads before querying private checks', async () => {
    hasUserGroupPostInWorkspaceMock.mockResolvedValue(false);

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        `http://localhost/api/v1/workspaces/personal/user-groups/${GROUP_ID}/group-checks?postId=${POST_ID}`
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
      message: 'Post not found',
    });
    expect(hasUserGroupPostInWorkspaceMock).toHaveBeenCalledWith({
      sbAdmin: { id: 'admin-client' },
      wsId: WORKSPACE_ID,
      groupId: GROUP_ID,
      postId: POST_ID,
    });
  });
});
