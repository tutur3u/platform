import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  getPostsPageData: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('../../lib/posts/data', () => ({
  getWorkspacePostsPageData: mocks.getPostsPageData,
}));
vi.mock('../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));
vi.mock('../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { GET } from './route';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('Contacts-compatible workspace Posts list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.getPermissions.mockResolvedValue({ containsPermission: vi.fn() });
    mocks.getPostsPageData.mockResolvedValue({
      postsData: { count: 1, data: [{ id: 'post-row', stage: 'sent' }] },
      postsStatus: { total: 1 },
    });
  });

  it('uses request-aware permissions and returns the Posts review payload', async () => {
    const request = new Request(
      `https://contacts.tuturuuu.com/api/v1/workspaces/${WORKSPACE_ID}/posts?page=2&pageSize=25&stage=sent`,
      { headers: { authorization: 'Bearer ttr_app_test' } }
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [{ id: 'post-row', stage: 'sent' }],
      summary: { total: 1 },
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith(WORKSPACE_ID, request);
    expect(mocks.getPostsPageData).toHaveBeenCalledWith(WORKSPACE_ID, {
      approvalStatus: undefined,
      cursor: undefined,
      end: undefined,
      excludedGroups: [],
      includedGroups: [],
      page: 2,
      pageSize: 25,
      queueStatus: undefined,
      showAll: undefined,
      stage: 'sent',
      start: undefined,
      userId: undefined,
    });
  });

  it('does not query customer data when the request is unauthorized', async () => {
    mocks.getPermissions.mockResolvedValue(null);

    const response = await GET(
      new Request(
        `https://contacts.tuturuuu.com/api/v1/workspaces/${WORKSPACE_ID}/posts`
      ),
      { params: Promise.resolve({ wsId: WORKSPACE_ID }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.getPostsPageData).not.toHaveBeenCalled();
  });
});
