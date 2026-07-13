import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceUserGroup,
  deleteWorkspaceUserGroup,
  getNextWorkspaceUserGroupsPageParam,
  removeWorkspaceUserGroupMember,
  updateWorkspaceUserGroup,
  upsertWorkspaceUserGroupMembers,
} from './user-groups';

function createGroups(count: number): UserGroup[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `group-${index}`,
    is_guest: false,
    name: `Group ${index}`,
  }));
}

describe('workspace user groups pagination', () => {
  it('continues pagination after a full page when more rows remain', () => {
    expect(
      getNextWorkspaceUserGroupsPageParam(
        {
          count: 120,
          data: createGroups(50),
          page: 1,
          pageSize: 50,
        },
        [
          {
            count: 120,
            data: createGroups(50),
            page: 1,
            pageSize: 50,
          },
        ]
      )
    ).toBe(2);
  });

  it('stops pagination when the API returns an empty page even if count is stale', () => {
    expect(
      getNextWorkspaceUserGroupsPageParam(
        {
          count: 10,
          data: [],
          page: 2,
          pageSize: 50,
        },
        [
          {
            count: 10,
            data: [],
            page: 2,
            pageSize: 50,
          },
        ]
      )
    ).toBeUndefined();
  });

  it('stops pagination after a short final page', () => {
    expect(
      getNextWorkspaceUserGroupsPageParam(
        {
          count: 51,
          data: createGroups(1),
          page: 2,
          pageSize: 50,
        },
        [
          {
            count: 51,
            data: createGroups(50),
            page: 1,
            pageSize: 50,
          },
          {
            count: 51,
            data: createGroups(1),
            page: 2,
            pageSize: 50,
          },
        ]
      )
    ).toBeUndefined();
  });
});

describe('workspace user group mutations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createOptions() {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ message: 'success' }, { status: 200 }))
      );
    return {
      fetchMock,
      options: {
        baseUrl: 'https://contacts.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      },
    };
  }

  it('targets the Contacts-owned collection for group creation', async () => {
    const { fetchMock, options } = createOptions();

    await createWorkspaceUserGroup(
      'workspace/one',
      { name: 'Guest group', is_guest: true },
      options
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://contacts.example.com/api/v1/workspaces/workspace%2Fone/user-groups',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Guest group', is_guest: true }),
        method: 'POST',
      })
    );
  });

  it('uses encoded group routes for update and delete', async () => {
    const { fetchMock, options } = createOptions();

    await updateWorkspaceUserGroup(
      'workspace-1',
      'group/one',
      { archived: true },
      options
    );
    await deleteWorkspaceUserGroup('workspace-1', 'group/one', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://contacts.example.com/api/v1/workspaces/workspace-1/user-groups/group%2Fone',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://contacts.example.com/api/v1/workspaces/workspace-1/user-groups/group%2Fone',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('uses the group roster routes for member add and remove', async () => {
    const { fetchMock, options } = createOptions();

    await upsertWorkspaceUserGroupMembers(
      'workspace-1',
      'group-1',
      { memberIds: ['user-1'], role: 'TEACHER' },
      options
    );
    await removeWorkspaceUserGroupMember(
      'workspace-1',
      'group-1',
      'user/one',
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://contacts.example.com/api/v1/workspaces/workspace-1/user-groups/group-1/members',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://contacts.example.com/api/v1/workspaces/workspace-1/user-groups/group-1/members/user%2Fone',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
