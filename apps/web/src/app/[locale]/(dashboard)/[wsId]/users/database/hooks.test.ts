import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWorkspaceUsers } from './hooks';

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
});
