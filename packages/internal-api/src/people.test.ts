import { describe, expect, it, vi } from 'vitest';
import { searchWorkspacePeople, type WorkspacePerson } from './people';

describe('workspace people search', () => {
  it('encodes workspace and query without turning search text into parameters', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [] }));

    await searchWorkspacePeople(
      'workspace/one',
      { query: 'An & Bình+@example.com', limit: 20 },
      { baseUrl: 'https://internal.example.com', fetch: fetchMock }
    );

    const expected = new URL(
      'https://internal.example.com/api/v1/workspaces/workspace%2Fone/people'
    );
    expected.searchParams.set('q', 'An & Bình+@example.com');
    expected.searchParams.set('limit', '20');
    expect(fetchMock).toHaveBeenCalledWith(
      expected.toString(),
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('preserves contact and member identities and masked null fields', async () => {
    const data: WorkspacePerson[] = [
      {
        kind: 'contact',
        id: 'contact-1',
        linkedUserId: 'member-1',
        displayName: 'Bình',
        email: null,
        avatarUrl: null,
      },
      {
        kind: 'member',
        id: 'member-1',
        displayName: null,
        email: null,
        avatarUrl: null,
      },
    ];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data }));

    const result = await searchWorkspacePeople(
      'workspace-1',
      { query: 'Bình' },
      { baseUrl: 'https://internal.example.com', fetch: fetchMock }
    );

    expect(result).toEqual({ data });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace-1/people?q=B%C3%ACnh',
      expect.anything()
    );
  });

  it('propagates permission failures instead of returning an empty success', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ message: 'Forbidden' }, { status: 403 })
      );

    await expect(
      searchWorkspacePeople(
        'workspace-1',
        { query: 'An' },
        { baseUrl: 'https://internal.example.com', fetch: fetchMock }
      )
    ).rejects.toMatchObject({ status: 403 });
  });
});
