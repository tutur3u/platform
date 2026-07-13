import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspaceUserLinkForUser: vi.fn(),
  hasGroup: vi.fn(),
  revalidateUserGroupCache: vi.fn(),
  resolveRequestActorAuthUid: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: mocks.getWorkspaceUserLinkForUser,
}));
vi.mock('../../../../lib/user-groups/revalidate', () => ({
  revalidateUserGroupCache: mocks.revalidateUserGroupCache,
}));
vi.mock('../../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));
vi.mock('../../../../lib/user-groups/route-helpers', () => ({
  hasUserGroupInWorkspace: mocks.hasGroup,
  resolveRequestActorAuthUid: mocks.resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { GET, POST } from './route';

const WS_ID = '10000000-0000-4000-8000-000000000001';
const GROUP_ID = '20000000-0000-4000-8000-000000000002';
const ACTOR_ID = '30000000-0000-4000-8000-000000000003';
const VIRTUAL_USER_ID = '40000000-0000-4000-8000-000000000004';

function request(body: unknown) {
  return new Request(
    `https://contacts.tuturuuu.com/api/v1/workspaces/${WS_ID}/user-groups/${GROUP_ID}/posts`,
    {
      body: JSON.stringify(body),
      headers: { authorization: 'Bearer ttr_app_test' },
      method: 'POST',
    }
  );
}

function params(wsId = WS_ID) {
  return { params: Promise.resolve({ groupId: GROUP_ID, wsId }) };
}

function adminClient({ approvalEnabled = false } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const groupMaybeSingle = vi
    .fn()
    .mockResolvedValue({ data: { ws_id: WS_ID }, error: null });
  const configMaybeSingle = vi.fn().mockResolvedValue({
    data: { value: approvalEnabled ? 'true' : 'false' },
    error: null,
  });

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_user_groups') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: groupMaybeSingle })),
          })),
        };
      }
      if (table === 'workspace_configs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: configMaybeSingle })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    schema: vi.fn(() => ({ from: vi.fn(() => ({ insert })) })),
  };

  return { client, insert };
}

describe('Contacts-compatible user group post creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceId.mockResolvedValue(WS_ID);
    mocks.resolveRequestActorAuthUid.mockResolvedValue(ACTOR_ID);
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue({
      virtual_user_id: VIRTUAL_USER_ID,
    });
    mocks.hasGroup.mockResolvedValue(true);
  });

  it('loads posts locally with cursor pagination', async () => {
    const queryResult = {
      count: 2,
      data: [
        { created_at: '2026-07-13T01:00:00.000Z', id: 'post-1' },
        { created_at: '2026-07-12T01:00:00.000Z', id: 'post-2' },
      ],
      error: null,
    };
    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
      lt: vi.fn().mockResolvedValue(queryResult),
      order: vi.fn(),
      select: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    mocks.createAdminClient.mockResolvedValue({
      schema: () => ({ from: () => query }),
    });

    const response = await GET(
      new Request(
        `https://contacts.tuturuuu.com/api/v1/workspaces/${WS_ID}/user-groups/${GROUP_ID}/posts?limit=2&cursor=2026-07-14T00%3A00%3A00.000Z`
      ),
      params()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 2,
      data: queryResult.data,
      nextCursor: '2026-07-12T01:00:00.000Z',
    });
    expect(mocks.hasGroup).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID, wsId: WS_ID })
    );
    expect(query.lt).toHaveBeenCalledWith(
      'created_at',
      '2026-07-14T00:00:00.000Z'
    );
  });

  it('rejects a request that has no satellite or Supabase actor', async () => {
    mocks.resolveRequestActorAuthUid.mockResolvedValue(null);

    const response = await POST(request({ title: 'Daily report' }), params());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('creates a post with the linked virtual actor and auto-approval', async () => {
    const { client, insert } = adminClient();
    mocks.createAdminClient.mockResolvedValue(client);

    const response = await POST(
      request({ content: 'Lesson completed', title: 'Daily report' }),
      params()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.resolveRequestActorAuthUid).toHaveBeenCalledWith(
      expect.any(Request)
    );
    expect(mocks.getWorkspaceUserLinkForUser).toHaveBeenCalledWith(
      WS_ID,
      ACTOR_ID,
      { authorizationClient: client }
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        approved_by: VIRTUAL_USER_ID,
        content: 'Lesson completed',
        creator_id: VIRTUAL_USER_ID,
        group_id: GROUP_ID,
        post_approval_status: 'APPROVED',
        title: 'Daily report',
        updated_by: VIRTUAL_USER_ID,
      })
    );
    expect(mocks.revalidateUserGroupCache).toHaveBeenCalledWith(GROUP_ID);
  });

  it('keeps approval pending when the workspace requires approval', async () => {
    const { client, insert } = adminClient({ approvalEnabled: true });
    mocks.createAdminClient.mockResolvedValue(client);

    const response = await POST(request({ title: 'Daily report' }), params());

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.not.objectContaining({ post_approval_status: 'APPROVED' })
    );
  });

  it('blocks creation without the required permission', async () => {
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => true });

    const response = await POST(request({ title: 'Daily report' }), params());

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a group from another workspace', async () => {
    const { client } = adminClient();
    client.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { ws_id: '50000000-0000-4000-8000-000000000005' },
            error: null,
          }),
        })),
      })),
    })) as typeof client.from;
    mocks.createAdminClient.mockResolvedValue(client);

    const response = await POST(request({ title: 'Daily report' }), params());

    expect(response.status).toBe(400);
    expect(mocks.getWorkspaceUserLinkForUser).not.toHaveBeenCalled();
  });
});
