import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceUser, updateWorkspaceUser } from './users';

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

describe('workspace user mutations', () => {
  it('creates users through the Contacts-owned collection route', async () => {
    const { fetchMock, options } = createOptions();

    await createWorkspaceUser(
      'workspace/one',
      { full_name: 'Guest User', is_guest: true },
      options
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://contacts.example.com/api/v1/workspaces/workspace%2Fone/users',
      expect.objectContaining({
        body: JSON.stringify({ full_name: 'Guest User', is_guest: true }),
        method: 'POST',
      })
    );
  });

  it('updates users through an encoded Contacts-owned item route', async () => {
    const { fetchMock, options } = createOptions();

    await updateWorkspaceUser(
      'workspace-1',
      'user/one',
      { full_name: 'Updated User', is_guest: false },
      options
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://contacts.example.com/api/v1/workspaces/workspace-1/users/user%2Fone',
      expect.objectContaining({
        body: JSON.stringify({
          full_name: 'Updated User',
          is_guest: false,
        }),
        method: 'PUT',
      })
    );
  });
});
