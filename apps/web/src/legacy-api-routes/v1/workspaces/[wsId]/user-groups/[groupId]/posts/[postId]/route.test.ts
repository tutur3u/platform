import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  getPermissionsMock,
  hasUserGroupPostInWorkspaceMock,
  normalizeWorkspaceIdMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  hasUserGroupPostInWorkspaceMock: vi.fn(),
  normalizeWorkspaceIdMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
  normalizeWorkspaceId: normalizeWorkspaceIdMock,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  hasUserGroupPostInWorkspace: hasUserGroupPostInWorkspaceMock,
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';

function createMutationClient(result = { data: { id: POST_ID }, error: null }) {
  const eqCalls: Array<[string, unknown]> = [];
  const query = {
    delete: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return query;
    }),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
    update: vi.fn(() => query),
  };
  const from = vi.fn(() => query);
  const schema = vi.fn(() => ({ from }));

  return {
    client: { schema },
    eqCalls,
    from,
    query,
    schema,
  };
}

describe('group post item route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getPermissionsMock.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    hasUserGroupPostInWorkspaceMock.mockResolvedValue(true);
    normalizeWorkspaceIdMock.mockResolvedValue(WORKSPACE_ID);
  });

  it('rejects cross-workspace post updates before mutating private posts', async () => {
    hasUserGroupPostInWorkspaceMock.mockResolvedValue(false);
    createAdminClientMock.mockResolvedValue({ id: 'admin-client' });

    const { PUT } = await import('./route');
    const response = await PUT(
      new Request(
        `http://localhost/api/v1/workspaces/personal/user-groups/${GROUP_ID}/posts/${POST_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({ title: 'Updated title' }),
        }
      ),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          postId: POST_ID,
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

  it('rejects attempts to update server-owned post fields', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      new Request(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/posts/${POST_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: 'Updated title',
            group_id: 'victim-group',
          }),
        }
      ),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          postId: POST_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(hasUserGroupPostInWorkspaceMock).not.toHaveBeenCalled();
  });

  it('scopes successful post updates to the requested group', async () => {
    const mocks = createMutationClient();
    createAdminClientMock.mockResolvedValue(mocks.client);

    const { PUT } = await import('./route');
    const response = await PUT(
      new Request(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/posts/${POST_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({ title: 'Updated title' }),
        }
      ),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          postId: POST_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.query.update).toHaveBeenCalledWith({
      title: 'Updated title',
    });
    expect(mocks.eqCalls).toEqual([
      ['id', POST_ID],
      ['group_id', GROUP_ID],
    ]);
  });
});
