import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSupabaseMock, type TableResults } from './test-utils';

const WS_ID = 'workspace-1';
const TAG_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_A = '22222222-2222-4222-8222-222222222222';
const GROUP_B = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));

function permissionSet(...allowed: string[]) {
  return {
    withoutPermission: vi.fn(
      (permission: string) => !allowed.includes(permission)
    ),
  };
}

function params() {
  return { params: Promise.resolve({ wsId: WS_ID }) };
}

function postRequest(body: unknown) {
  return new Request(`http://localhost/api/v1/workspaces/${WS_ID}/group-tags`, {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { authorization: 'Bearer app-session' },
    method: 'POST',
  });
}

describe('group tag collection route', () => {
  let results: TableResults;
  let admin: ReturnType<typeof createAdminSupabaseMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    results = {
      workspace_user_group_tag_groups: {
        insert: { data: null, error: null },
      },
      workspace_user_group_tags: {
        insert: { data: { id: TAG_ID }, error: null },
        select: {
          count: 1,
          data: [
            {
              color: '#000000',
              group_ids: [{ group_id: GROUP_A }],
              id: TAG_ID,
              name: 'Priority',
              ws_id: WS_ID,
            },
          ],
          error: null,
        },
      },
      workspace_user_groups: {
        select: {
          data: [{ id: GROUP_A }],
          error: null,
        },
      },
    };
    admin = createAdminSupabaseMock(results);
    mocks.createAdminClient.mockResolvedValue(admin.client);
    mocks.getPermissions.mockResolvedValue(
      permissionSet('create_user_groups', 'view_user_groups')
    );
  });

  it('returns 404 for an unresolved actor without creating an admin client', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);
    const { GET } = await import('./route');
    const request = new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/group-tags`
    );

    const response = await GET(request, params());

    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('requires view_user_groups for collection reads', async () => {
    const permissions = permissionSet('create_user_groups');
    mocks.getPermissions.mockResolvedValueOnce(permissions);
    const { GET } = await import('./route');

    const response = await GET(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/group-tags`),
      params()
    );

    expect(response.status).toBe(403);
    expect(permissions.withoutPermission).toHaveBeenCalledWith(
      'view_user_groups'
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('allows an app-session actor with view_user_groups', async () => {
    const { GET } = await import('./route');
    const request = new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/group-tags`,
      { headers: { authorization: 'Bearer app-session' } }
    );

    const response = await GET(request, params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      data: [{ group_ids: [GROUP_A], id: TAG_ID }],
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith(WS_ID, request);
  });

  it('requires create_user_groups before parsing or admin access', async () => {
    const permissions = permissionSet('view_user_groups');
    mocks.getPermissions.mockResolvedValueOnce(permissions);
    const { POST } = await import('./route');
    const request = postRequest('{not-json');
    const parseBody = vi.spyOn(request, 'json');

    const response = await POST(request, params());

    expect(response.status).toBe(403);
    expect(permissions.withoutPermission).toHaveBeenCalledWith(
      'create_user_groups'
    );
    expect(parseBody).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{not-json'],
    [
      'unknown fields',
      { color: '#000000', group_ids: [], name: 'Priority', unexpected: true },
    ],
    [
      'duplicate group IDs',
      { color: '#000000', group_ids: [GROUP_A, GROUP_A], name: 'Priority' },
    ],
  ])('rejects %s before admin access', async (_label, body) => {
    const { POST } = await import('./route');

    const response = await POST(postRequest(body), params());

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a mixed valid and foreign group set before inserting the tag', async () => {
    results.workspace_user_groups = {
      select: { data: [{ id: GROUP_A }], error: null },
    };
    const { POST } = await import('./route');

    const response = await POST(
      postRequest({
        color: '#000000',
        group_ids: [GROUP_A, GROUP_B],
        name: 'Priority',
      }),
      params()
    );

    expect(response.status).toBe(404);
    expect(admin.queries.get('workspace_user_group_tags')).toBeUndefined();
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });

  it('does not mutate when workspace group validation fails', async () => {
    results.workspace_user_groups = {
      select: { data: null, error: { code: 'database-error' } },
    };
    const { POST } = await import('./route');

    const response = await POST(
      postRequest({ color: '#000000', group_ids: [GROUP_A], name: 'Priority' }),
      params()
    );

    expect(response.status).toBe(500);
    expect(admin.queries.get('workspace_user_group_tags')).toBeUndefined();
  });

  it('creates a tag only after every supplied group is workspace-owned', async () => {
    results.workspace_user_groups = {
      select: {
        data: [{ id: GROUP_A }, { id: GROUP_B }],
        error: null,
      },
    };
    const { POST } = await import('./route');

    const response = await POST(
      postRequest({
        color: '#123456',
        group_ids: [GROUP_A, GROUP_B],
        name: 'Priority',
      }),
      params()
    );

    expect(response.status).toBe(200);
    const tagInsert = admin.queries.get('workspace_user_group_tags')?.[0]
      ?.insert;
    expect(tagInsert).toHaveBeenCalledWith({
      color: '#123456',
      name: 'Priority',
      ws_id: WS_ID,
    });
    const linkInsert = admin.queries.get('workspace_user_group_tag_groups')?.[0]
      ?.insert;
    expect(linkInsert).toHaveBeenCalledWith([
      { group_id: GROUP_A, tag_id: TAG_ID },
      { group_id: GROUP_B, tag_id: TAG_ID },
    ]);
  });

  it('sanitizes tag insert failures and never attempts relationship writes', async () => {
    results.workspace_user_group_tags = {
      insert: { data: null, error: { secret: 'not returned' } },
    };
    const { POST } = await import('./route');

    const response = await POST(
      postRequest({ color: '#000000', group_ids: [GROUP_A], name: 'Priority' }),
      params()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error creating workspace user group tag',
    });
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });
});
