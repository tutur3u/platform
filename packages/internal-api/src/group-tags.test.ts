import { describe, expect, it, vi } from 'vitest';
import {
  addWorkspaceGroupTagUserGroups,
  createWorkspaceGroupTag,
  deleteWorkspaceGroupTag,
  getWorkspaceGroupTag,
  listWorkspaceGroupTags,
  listWorkspaceGroupTagUserGroups,
  removeWorkspaceGroupTagUserGroup,
  updateWorkspaceGroupTag,
} from './group-tags';

function createJsonResponse(payload: unknown) {
  return {
    headers: new Headers(),
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

const options = (fetchMock: ReturnType<typeof vi.fn>) => ({
  baseUrl: 'https://internal.example.com',
  fetch: fetchMock as unknown as typeof fetch,
});

describe('workspace group tag internal API helpers', () => {
  it('lists workspace group tags with paginated query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        count: 1,
        data: [],
        page: 2,
        pageSize: 25,
      })
    );

    await listWorkspaceGroupTags(
      'workspace 1',
      { page: 2, pageSize: 25, q: 'vip groups' },
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/group-tags?page=2&pageSize=25&q=vip+groups',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads workspace group tag detail', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ data: { id: 'tag/1' } }));

    await getWorkspaceGroupTag('workspace 1', 'tag/1', options(fetchMock));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/group-tags/tag%2F1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'GET',
      })
    );
  });

  it('lists user groups linked to a workspace group tag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        count: 0,
        data: [],
      })
    );

    await listWorkspaceGroupTagUserGroups(
      'ws-1',
      'tag 1',
      { page: 3, pageSize: 20, q: 'students' },
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/group-tags/tag%201/user-groups?page=3&pageSize=20&q=students',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('creates, updates, and deletes workspace group tags', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }))
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }))
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }));

    const payload = {
      color: '#000000',
      group_ids: ['group-1'],
      name: 'VIP',
    };

    await createWorkspaceGroupTag('ws-1', payload, options(fetchMock));
    await updateWorkspaceGroupTag('ws-1', 'tag-1', payload, options(fetchMock));
    await deleteWorkspaceGroupTag('ws-1', 'tag-1', options(fetchMock));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/group-tags',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/group-tags/tag-1',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/group-tags/tag-1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });

  it('adds and removes user groups linked to a workspace group tag', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }))
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }));

    await addWorkspaceGroupTagUserGroups(
      'ws-1',
      'tag-1',
      { groupIds: ['group-1', 'group-2'] },
      options(fetchMock)
    );
    await removeWorkspaceGroupTagUserGroup(
      'ws-1',
      'tag-1',
      'group/1',
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/group-tags/tag-1/user-groups',
      expect.objectContaining({
        body: JSON.stringify({ groupIds: ['group-1', 'group-2'] }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/group-tags/tag-1/user-groups/group%2F1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });
});
