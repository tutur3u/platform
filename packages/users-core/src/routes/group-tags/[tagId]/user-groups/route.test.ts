import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSupabaseMock, type TableResults } from '../../test-utils';

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
  return { params: Promise.resolve({ tagId: TAG_ID, wsId: WS_ID }) };
}

function request(method: 'GET' | 'POST', body?: unknown) {
  return new Request(
    `http://localhost/api/v1/workspaces/${WS_ID}/group-tags/${TAG_ID}/user-groups`,
    {
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      headers: { authorization: 'Bearer app-session' },
      method,
    }
  );
}

describe('group tag user groups route', () => {
  let results: TableResults;
  let admin: ReturnType<typeof createAdminSupabaseMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    results = {
      workspace_user_group_tag_groups: {
        insert: { data: null, error: null },
        select: {
          count: 1,
          data: [{ id: GROUP_A, name: 'Group A' }],
          error: null,
        },
      },
      workspace_user_group_tags: {
        select: { data: { id: TAG_ID }, error: null },
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
      permissionSet('update_user_groups', 'view_user_groups')
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
    ['POST', 'update_user_groups'],
  ] as const)(
    'requires %s permission %s before admin access',
    async (method, required) => {
      const permissions = permissionSet();
      mocks.getPermissions.mockResolvedValueOnce(permissions);
      const handlers = await import('./route');
      const body = method === 'POST' ? { groupIds: [GROUP_A] } : undefined;

      const response = await handlers[method](request(method, body), params());

      expect(response.status).toBe(403);
      expect(permissions.withoutPermission).toHaveBeenCalledWith(required);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('allows an app-session actor with view_user_groups to list linked groups', async () => {
    const { GET } = await import('./route');
    const appRequest = request('GET');

    const response = await GET(appRequest, params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      data: [{ id: GROUP_A }],
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith(WS_ID, appRequest);
  });

  it('returns 404 when listing relationships for a foreign tag', async () => {
    results.workspace_user_group_tags = {
      select: { data: null, error: null },
    };
    const { GET } = await import('./route');

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(404);
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });

  it.each([
    ['malformed JSON', '{not-json'],
    ['unknown fields', { groupIds: [GROUP_A], unexpected: true }],
    ['duplicate group IDs', { groupIds: [GROUP_A, GROUP_A] }],
  ])('rejects POST %s before admin access', async (_label, body) => {
    const { POST } = await import('./route');

    const response = await POST(request('POST', body), params());

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('validates the tag even for an empty relationship request', async () => {
    results.workspace_user_group_tags = {
      select: { data: null, error: null },
    };
    const { POST } = await import('./route');

    const response = await POST(request('POST', { groupIds: [] }), params());

    expect(response.status).toBe(404);
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });

  it('rejects a mixed valid and foreign group set before inserting links', async () => {
    results.workspace_user_groups = {
      select: { data: [{ id: GROUP_A }], error: null },
    };
    const { POST } = await import('./route');

    const response = await POST(
      request('POST', { groupIds: [GROUP_A, GROUP_B] }),
      params()
    );

    expect(response.status).toBe(404);
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });

  it('does not insert links when group validation fails', async () => {
    results.workspace_user_groups = {
      select: { data: null, error: { code: 'database-error' } },
    };
    const { POST } = await import('./route');

    const response = await POST(
      request('POST', { groupIds: [GROUP_A] }),
      params()
    );

    expect(response.status).toBe(500);
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });

  it('links groups only after the tag and complete group set validate', async () => {
    results.workspace_user_groups = {
      select: {
        data: [{ id: GROUP_A }, { id: GROUP_B }],
        error: null,
      },
    };
    const { POST } = await import('./route');

    const response = await POST(
      request('POST', { groupIds: [GROUP_A, GROUP_B] }),
      params()
    );

    expect(response.status).toBe(200);
    const insert = admin.queries.get('workspace_user_group_tag_groups')?.[0]
      ?.insert;
    expect(insert).toHaveBeenCalledWith([
      { group_id: GROUP_A, tag_id: TAG_ID },
      { group_id: GROUP_B, tag_id: TAG_ID },
    ]);
  });

  it('returns 409 for an existing tag/group relationship', async () => {
    results.workspace_user_group_tag_groups = {
      insert: { data: null, error: { code: '23505' } },
    };
    const { POST } = await import('./route');

    const response = await POST(
      request('POST', { groupIds: [GROUP_A] }),
      params()
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: 'One or more user groups are already linked to this tag',
    });
  });

  it('returns a sanitized 500 for other relationship insert failures', async () => {
    results.workspace_user_group_tag_groups = {
      insert: { data: null, error: { code: 'database-error', secret: true } },
    };
    const { POST } = await import('./route');

    const response = await POST(
      request('POST', { groupIds: [GROUP_A] }),
      params()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error adding new groups to tag',
    });
  });
});
