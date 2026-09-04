import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSupabaseMock, type TableResults } from '../test-utils';

const WS_ID = 'workspace-1';
const TAG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TAG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

function params(tagId = TAG_ID) {
  return { params: Promise.resolve({ tagId, wsId: WS_ID }) };
}

function request(method: 'DELETE' | 'GET' | 'PUT', body?: unknown) {
  return new Request(
    `http://localhost/api/v1/workspaces/${WS_ID}/group-tags/${TAG_ID}`,
    {
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      headers: { authorization: 'Bearer app-session' },
      method,
    }
  );
}

describe('group tag item route', () => {
  let results: TableResults;
  let admin: ReturnType<typeof createAdminSupabaseMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    results = {
      workspace_user_group_tags: {
        delete: { data: { id: TAG_ID }, error: null },
        select: {
          data: {
            color: '#000000',
            group_ids: [{ group_id: GROUP_A }],
            id: TAG_ID,
            name: 'Priority',
            ws_id: WS_ID,
          },
          error: null,
        },
        update: { data: { id: TAG_ID }, error: null },
      },
      workspace_user_groups: {
        select: {
          data: [{ id: GROUP_A }, { id: GROUP_B }],
          error: null,
        },
      },
    };
    admin = createAdminSupabaseMock(results);
    mocks.createAdminClient.mockResolvedValue(admin.client);
    mocks.getPermissions.mockResolvedValue(
      permissionSet(
        'delete_user_groups',
        'update_user_groups',
        'view_user_groups'
      )
    );
  });

  it('returns 404 for an unresolved actor without admin access', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);
    const { GET } = await import('./route');

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', 'view_user_groups'],
    ['PUT', 'update_user_groups'],
    ['DELETE', 'delete_user_groups'],
  ] as const)(
    'requires %s permission %s before admin access',
    async (method, required) => {
      const permissions = permissionSet();
      mocks.getPermissions.mockResolvedValueOnce(permissions);
      const handlers = await import('./route');
      const body =
        method === 'PUT'
          ? { color: '#000000', group_ids: [], name: 'Priority' }
          : undefined;

      const response = await handlers[method](request(method, body), params());

      expect(response.status).toBe(403);
      expect(permissions.withoutPermission).toHaveBeenCalledWith(required);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('allows an app-session actor with view_user_groups to read a workspace tag', async () => {
    const { GET } = await import('./route');
    const appRequest = request('GET');

    const response = await GET(appRequest, params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { group_ids: [GROUP_A], id: TAG_ID },
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith(WS_ID, appRequest);
  });

  it('returns 404 when the requested tag is foreign or missing', async () => {
    results.workspace_user_group_tags = {
      select: { data: null, error: null },
    };
    const { GET } = await import('./route');

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(404);
  });

  it.each([
    ['malformed JSON', '{not-json'],
    [
      'unknown fields',
      { color: '#000000', name: 'Priority', unexpected: true },
    ],
    [
      'duplicate group IDs',
      { color: '#000000', group_ids: [GROUP_A, GROUP_A], name: 'Priority' },
    ],
  ])('rejects PUT %s before admin access', async (_label, body) => {
    const { PUT } = await import('./route');

    const response = await PUT(request('PUT', body), params());

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a body tag ID that differs from the route target', async () => {
    const { PUT } = await import('./route');

    const response = await PUT(
      request('PUT', {
        color: '#000000',
        id: OTHER_TAG_ID,
        name: 'Priority',
      }),
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a foreign tag before validating groups or updating', async () => {
    results.workspace_user_group_tags = {
      select: { data: null, error: null },
      update: { data: { id: TAG_ID }, error: null },
    };
    const { PUT } = await import('./route');

    const response = await PUT(
      request('PUT', {
        color: '#000000',
        group_ids: [GROUP_A],
        name: 'Priority',
      }),
      params()
    );

    expect(response.status).toBe(404);
    expect(admin.queries.get('workspace_user_groups')).toBeUndefined();
    expect(admin.queries.get('workspace_user_group_tags')).toHaveLength(1);
  });

  it('rejects a mixed valid and foreign group set before updating', async () => {
    results.workspace_user_groups = {
      select: { data: [{ id: GROUP_A }], error: null },
    };
    const { PUT } = await import('./route');

    const response = await PUT(
      request('PUT', {
        color: '#000000',
        group_ids: [GROUP_A, GROUP_B],
        name: 'Priority',
      }),
      params()
    );

    expect(response.status).toBe(404);
    expect(admin.queries.get('workspace_user_group_tags')).toHaveLength(1);
  });

  it('updates a workspace-owned tag after validating all supplied groups', async () => {
    const { PUT } = await import('./route');

    const response = await PUT(
      request('PUT', {
        color: '#123456',
        group_ids: [GROUP_A, GROUP_B],
        id: TAG_ID,
        name: 'Priority',
      }),
      params()
    );

    expect(response.status).toBe(200);
    const updateQuery = admin.queries.get('workspace_user_group_tags')?.[1];
    expect(updateQuery?.update).toHaveBeenCalledWith({
      color: '#123456',
      name: 'Priority',
    });
  });

  it('returns a sanitized 500 when updating the validated tag fails', async () => {
    results.workspace_user_group_tags = {
      select: { data: { id: TAG_ID }, error: null },
      update: { data: null, error: { secret: 'not returned' } },
    };
    const { PUT } = await import('./route');

    const response = await PUT(
      request('PUT', { color: '#000000', name: 'Priority' }),
      params()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error updating workspace user group tag',
    });
  });

  it('deletes a workspace-owned tag with delete_user_groups', async () => {
    const { DELETE } = await import('./route');

    const response = await DELETE(request('DELETE'), params());

    expect(response.status).toBe(200);
    const deleteQuery = admin.queries.get('workspace_user_group_tags')?.[1];
    expect(deleteQuery?.delete).toHaveBeenCalledOnce();
  });

  it('does not delete a foreign tag', async () => {
    results.workspace_user_group_tags = {
      delete: { data: { id: TAG_ID }, error: null },
      select: { data: null, error: null },
    };
    const { DELETE } = await import('./route');

    const response = await DELETE(request('DELETE'), params());

    expect(response.status).toBe(404);
    expect(admin.queries.get('workspace_user_group_tags')).toHaveLength(1);
  });
});
