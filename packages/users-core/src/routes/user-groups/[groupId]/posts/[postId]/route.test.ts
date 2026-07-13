import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  hasPost: vi.fn(),
  revalidateUserGroupCache: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('../../../../../lib/user-groups/revalidate', () => ({
  revalidateUserGroupCache: mocks.revalidateUserGroupCache,
}));
vi.mock('../../../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));
vi.mock('../../../../../lib/user-groups/route-helpers', () => ({
  hasUserGroupPostInWorkspace: mocks.hasPost,
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { DELETE, PUT } from './route';

const WS_ID = '10000000-0000-4000-8000-000000000001';
const GROUP_ID = '20000000-0000-4000-8000-000000000002';
const POST_ID = '30000000-0000-4000-8000-000000000003';
const routeParams = {
  params: Promise.resolve({ groupId: GROUP_ID, postId: POST_ID, wsId: WS_ID }),
};

function adminClient() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: POST_ID },
    error: null,
  });
  const select = vi.fn(() => ({ maybeSingle }));
  const secondEq = vi.fn(() => ({ select }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  const deletePost = vi.fn(() => ({ eq: firstEq }));
  const client = {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({ delete: deletePost, update })),
    })),
  };
  return { client, deletePost, update };
}

describe('Contacts-compatible user group post mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceId.mockResolvedValue(WS_ID);
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.hasPost.mockResolvedValue(true);
  });

  it('updates a workspace-scoped post', async () => {
    const { client, update } = adminClient();
    mocks.createAdminClient.mockResolvedValue(client);

    const response = await PUT(
      new Request('https://contacts.tuturuuu.com/api/posts', {
        body: JSON.stringify({ notes: 'Updated note' }),
        method: 'PUT',
      }),
      routeParams
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ notes: 'Updated note' });
    expect(mocks.hasPost).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: GROUP_ID,
        postId: POST_ID,
        wsId: WS_ID,
      })
    );
    expect(mocks.revalidateUserGroupCache).toHaveBeenCalledWith(GROUP_ID);
  });

  it('deletes a workspace-scoped post', async () => {
    const { client, deletePost } = adminClient();
    mocks.createAdminClient.mockResolvedValue(client);

    const response = await DELETE(
      new Request('https://contacts.tuturuuu.com/api/posts', {
        method: 'DELETE',
      }),
      routeParams
    );

    expect(response.status).toBe(200);
    expect(deletePost).toHaveBeenCalledOnce();
    expect(mocks.revalidateUserGroupCache).toHaveBeenCalledWith(GROUP_ID);
  });

  it('does not mutate a post outside the workspace and group', async () => {
    mocks.hasPost.mockResolvedValue(false);
    const { client, update } = adminClient();
    mocks.createAdminClient.mockResolvedValue(client);

    const response = await PUT(
      new Request('https://contacts.tuturuuu.com/api/posts', {
        body: JSON.stringify({ title: 'Blocked' }),
        method: 'PUT',
      }),
      routeParams
    );

    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('checks the method-specific permission before mutation', async () => {
    const withoutPermission = vi.fn().mockReturnValue(true);
    mocks.getPermissions.mockResolvedValue({ withoutPermission });

    const response = await DELETE(
      new Request('https://contacts.tuturuuu.com/api/posts', {
        method: 'DELETE',
      }),
      routeParams
    );

    expect(response.status).toBe(403);
    expect(withoutPermission).toHaveBeenCalledWith('delete_user_groups_posts');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
