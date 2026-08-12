import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  listWorkspaceDefaultIncludedGroupIds: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

vi.mock('@tuturuuu/users-core/lib/workspace-default-included-groups', () => ({
  listWorkspaceDefaultIncludedGroupIds:
    mocks.listWorkspaceDefaultIncludedGroupIds,
}));

import { GET } from './route';

const CONFIG_ID = 'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS';

describe('Contacts workspace configs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_settings',
    });
    mocks.resolveWorkspaceId.mockResolvedValue('workspace-1');

    const query = {
      eq: vi.fn(() => query),
      in: vi.fn().mockResolvedValue({
        data: [{ id: CONFIG_ID, value: 'group-1' }],
        error: null,
      }),
      select: vi.fn(() => query),
    };
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => query),
    });
  });

  it('resolves a personal alias with the authenticated request before reading configs', async () => {
    const request = new Request(
      `https://contacts.tuturuuu.com/api/v1/workspaces/personal/settings/configs?ids=${CONFIG_ID}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ [CONFIG_ID]: 'group-1' });
    expect(mocks.getPermissions).toHaveBeenCalledWith('personal', request);
    expect(mocks.resolveWorkspaceId).toHaveBeenCalledWith('personal', request);
  });
});
