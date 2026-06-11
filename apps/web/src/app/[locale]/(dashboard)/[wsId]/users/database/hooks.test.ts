import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchFeaturedGroupCounts,
  fetchPossibleExcludedGroupsPage,
  fetchWorkspaceUsers,
} from './hooks';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
  } as Response;
}

describe('fetchWorkspaceUsers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts large group filter payloads without putting them in the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        count: 0,
        data: [],
      })
    );
    const includedGroups = Array.from(
      { length: 70 },
      (_, index) => `included-group-${index + 1}`
    );
    const excludedGroups = ['excluded-group-1', 'excluded-group-2'];

    vi.stubGlobal('fetch', fetchMock);

    await fetchWorkspaceUsers('workspace-1', {
      q: '',
      page: 1,
      pageSize: 10,
      includedGroups,
      excludedGroups,
      status: 'active',
      linkStatus: 'virtual',
      requireAttention: 'all',
      groupMembership: 'all',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/workspace-1/users/database',
      expect.objectContaining({
        body: JSON.stringify({
          q: '',
          page: 1,
          pageSize: 10,
          includedGroups,
          excludedGroups,
          status: 'active',
          linkStatus: 'virtual',
          requireAttention: 'all',
          groupMembership: 'all',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('posts large possible-excluded group payloads without putting them in the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        count: 0,
        data: [],
        pageSize: 50,
      })
    );
    const includedGroups = Array.from(
      { length: 70 },
      (_, index) => `included-group-${index + 1}`
    );

    vi.stubGlobal('fetch', fetchMock);

    await fetchPossibleExcludedGroupsPage('workspace-1', {
      includedGroups,
      page: 2,
      pageSize: 50,
      paginated: true,
      q: 'alice',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/workspace-1/users/groups/possible-excluded',
      expect.objectContaining({
        body: JSON.stringify({
          includedGroups,
          page: 2,
          pageSize: 50,
          paginated: true,
          q: 'alice',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('posts featured group count filters without serializing group arrays into the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));
    const featuredGroupIds = Array.from(
      { length: 20 },
      (_, index) => `featured-group-${index + 1}`
    );
    const excludedGroups = Array.from(
      { length: 30 },
      (_, index) => `excluded-group-${index + 1}`
    );

    vi.stubGlobal('fetch', fetchMock);

    await fetchFeaturedGroupCounts('workspace-1', {
      excludedGroups,
      featuredGroupIds,
      linkStatus: 'linked',
      searchQuery: 'alice',
      status: 'active',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/workspace-1/users/groups/featured-counts',
      expect.objectContaining({
        body: JSON.stringify({
          excludedGroups,
          featuredGroupIds,
          linkStatus: 'linked',
          q: 'alice',
          status: 'active',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });
});
