import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminSupabaseMock,
  type TableResults,
} from '../../../test-utils';

const WS_ID = 'workspace-1';
const TAG_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';

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

function params(groupId = GROUP_ID) {
  return { params: Promise.resolve({ groupId, tagId: TAG_ID, wsId: WS_ID }) };
}

function request() {
  return new Request(
    `http://localhost/api/v1/workspaces/${WS_ID}/group-tags/${TAG_ID}/user-groups/${GROUP_ID}`,
    {
      headers: { authorization: 'Bearer app-session' },
      method: 'DELETE',
    }
  );
}

describe('group tag user group item route', () => {
  let results: TableResults;
  let admin: ReturnType<typeof createAdminSupabaseMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    results = {
      workspace_user_group_tag_groups: {
        delete: { data: null, error: null },
      },
      workspace_user_group_tags: {
        select: { data: { id: TAG_ID }, error: null },
      },
      workspace_user_groups: {
        select: { data: [{ id: GROUP_ID }], error: null },
      },
    };
    admin = createAdminSupabaseMock(results);
    mocks.createAdminClient.mockResolvedValue(admin.client);
    mocks.getPermissions.mockResolvedValue(permissionSet('update_user_groups'));
  });

  it('returns 404 for an unresolved actor without admin access', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);
    const { DELETE } = await import('./route');

    const response = await DELETE(request(), params());

    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('requires update_user_groups before admin access', async () => {
    const permissions = permissionSet();
    mocks.getPermissions.mockResolvedValueOnce(permissions);
    const { DELETE } = await import('./route');

    const response = await DELETE(request(), params());

    expect(response.status).toBe(403);
    expect(permissions.withoutPermission).toHaveBeenCalledWith(
      'update_user_groups'
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects malformed group IDs before authorization or admin access', async () => {
    const { DELETE } = await import('./route');

    const response = await DELETE(request(), params('not-a-uuid'));

    expect(response.status).toBe(400);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('allows an app-session actor to unlink workspace-owned objects', async () => {
    const { DELETE } = await import('./route');
    const appRequest = request();

    const response = await DELETE(appRequest, params());

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).toHaveBeenCalledWith(WS_ID, appRequest);
    const linkDelete = admin.queries.get('workspace_user_group_tag_groups')?.[0]
      ?.delete;
    expect(linkDelete).toHaveBeenCalledOnce();
  });

  it('does not delete a relationship for a foreign tag', async () => {
    results.workspace_user_group_tags = {
      select: { data: null, error: null },
    };
    const { DELETE } = await import('./route');

    const response = await DELETE(request(), params());

    expect(response.status).toBe(404);
    expect(admin.queries.get('workspace_user_groups')).toBeUndefined();
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });

  it('does not delete a relationship for a foreign group', async () => {
    results.workspace_user_groups = {
      select: { data: [], error: null },
    };
    const { DELETE } = await import('./route');

    const response = await DELETE(request(), params());

    expect(response.status).toBe(404);
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });

  it('returns a sanitized 500 when tag validation fails', async () => {
    results.workspace_user_group_tags = {
      select: { data: null, error: { secret: 'not returned' } },
    };
    const { DELETE } = await import('./route');

    const response = await DELETE(request(), params());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error removing user group',
    });
    expect(
      admin.queries.get('workspace_user_group_tag_groups')
    ).toBeUndefined();
  });

  it('returns a sanitized 500 when relationship deletion fails', async () => {
    results.workspace_user_group_tag_groups = {
      delete: { data: null, error: { secret: 'not returned' } },
    };
    const { DELETE } = await import('./route');

    const response = await DELETE(request(), params());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error removing user group',
    });
  });
});
