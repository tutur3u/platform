import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceDocument,
  deleteWorkspaceDocument,
  listAllWorkspaceDocuments,
  listWorkspaceDocuments,
} from './documents';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('documents internal API helpers', () => {
  const options = (fetchMock: ReturnType<typeof vi.fn>) => ({
    baseUrl: 'https://internal.example.com',
    fetch: fetchMock as unknown as typeof fetch,
  });

  it('lists workspace documents through the centralized workspace API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [{ id: 'doc-1', name: 'Roadmap' }],
        pagination: { filteredTotal: 1, limit: 25, offset: 50 },
      })
    );

    await listWorkspaceDocuments(
      'workspace 1',
      { limit: 25, offset: 50, search: 'roadmap' },
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/documents?limit=25&offset=50&search=roadmap',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('loads every document page for legacy unpaginated list parity', async () => {
    const firstPageDocuments = Array.from({ length: 100 }, (_, index) => ({
      id: `doc-${index}`,
      name: `Document ${index}`,
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          data: firstPageDocuments,
          pagination: { filteredTotal: 101, limit: 100, offset: 0 },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: [{ id: 'doc-100', name: 'Document 100' }],
          pagination: { filteredTotal: 101, limit: 100, offset: 100 },
        })
      );

    const result = await listAllWorkspaceDocuments(
      'ws-1',
      {},
      options(fetchMock)
    );

    expect(result.data).toHaveLength(101);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/documents?limit=100&offset=0',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/documents?limit=100&offset=100',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('creates workspace documents with the expected JSON payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({ id: 'doc-1', message: 'success' })
      );

    await createWorkspaceDocument(
      'workspace 1',
      { name: 'Launch plan' },
      options(fetchMock)
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/documents',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Launch plan' }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('deletes workspace documents with encoded route params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'deleted' }));

    await deleteWorkspaceDocument(
      'workspace 1',
      'document / 1',
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/documents/document%20%2F%201',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });
});
