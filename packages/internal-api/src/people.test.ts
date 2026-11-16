import { describe, expect, it, vi } from 'vitest';
import {
  createSenderContact,
  getContactCreateCapability,
  getSenderContactOperation,
  searchWorkspacePeople,
  type WorkspacePerson,
} from './people';

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

describe('Mail sender contact operations', () => {
  it('sends only explicit contact input to the encoded workspace endpoint', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ state: 'unknown' }, { status: 202 }));
    const input = {
      operationId: 'operation',
      email: 'sender@example.com',
      displayName: 'Sender',
    };
    expect(
      await createSenderContact('workspace/one', input, {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock,
      })
    ).toEqual({ state: 'unknown' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%2Fone/people/contacts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        cache: 'no-store',
      })
    );
  });

  it('uses read-only requests for capability and UNKNOWN reconciliation', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ canCreate: true }))
      .mockResolvedValueOnce(Response.json({ state: 'unknown' }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock,
    };
    await getContactCreateCapability('workspace', options);
    await getSenderContactOperation('workspace', 'operation&one', options);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace/people/contacts?operationId=operation%26one',
      expect.objectContaining({ cache: 'no-store' })
    );
    for (const [, init] of fetchMock.mock.calls)
      expect(init?.method ?? 'GET').toBe('GET');
  });
});
