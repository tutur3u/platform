import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceApiKey,
  deleteWorkspaceApiKey,
  getWorkspaceApiKey,
  listWorkspaceApiKeyRoles,
  listWorkspaceApiKeys,
  listWorkspaceApiKeyUsageLogs,
  rotateWorkspaceApiKey,
  updateWorkspaceApiKey,
} from './api-keys';

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

describe('workspace API key internal API helpers', () => {
  it('lists workspace API keys with paginated query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        count: 1,
        data: [],
      })
    );

    await listWorkspaceApiKeys(
      {
        page: 2,
        pageSize: 25,
        q: 'server key',
        workspaceId: 'workspace 1',
      },
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/api-keys?page=2&pageSize=25&q=server+key',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('reads workspace API key detail and roles', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ data: { id: 'key-1' } }))
      .mockResolvedValueOnce(createJsonResponse({ data: [] }));

    await getWorkspaceApiKey('workspace 1', 'key/1', options(fetchMock));
    await listWorkspaceApiKeyRoles('workspace 1', options(fetchMock));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%201/api-keys/key%2F1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%201/api-keys/roles',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('creates, updates, rotates, and deletes workspace API keys', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          key: 'ttr_secret',
          message: 'API key created successfully',
          prefix: 'ttr_1234',
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }))
      .mockResolvedValueOnce(
        createJsonResponse({
          key: 'ttr_rotated',
          message: 'API key rotated successfully',
          prefix: 'ttr_5678',
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }));

    const payload = {
      description: 'SDK key',
      expires_at: null,
      name: 'SDK',
      role_id: null,
    };

    await createWorkspaceApiKey('ws-1', payload, options(fetchMock));
    await updateWorkspaceApiKey(
      'ws-1',
      'key-1',
      { name: 'Updated SDK' },
      options(fetchMock)
    );
    await rotateWorkspaceApiKey('ws-1', 'key-1', options(fetchMock));
    await deleteWorkspaceApiKey('ws-1', 'key-1', options(fetchMock));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/api-keys',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/api-keys/key-1',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Updated SDK' }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/api-keys/key-1/rotate',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws-1/api-keys/key-1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });

  it('lists workspace API key usage logs with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        count: 0,
        data: [],
        stats: {
          avgResponseTime: 0,
          successRate: 0,
          totalRequests: 0,
        },
      })
    );

    await listWorkspaceApiKeyUsageLogs(
      {
        endpoint: '/api/documents',
        from: '2026-06-01T00:00:00.000Z',
        keyId: 'key-1',
        method: 'POST',
        page: 3,
        pageSize: 50,
        status: '2xx',
        to: '2026-06-30T00:00:00.000Z',
        workspaceId: 'ws-1',
      },
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/api-keys/key-1/usage-logs?endpoint=%2Fapi%2Fdocuments&from=2026-06-01T00%3A00%3A00.000Z&method=POST&page=3&pageSize=50&status=2xx&to=2026-06-30T00%3A00%3A00.000Z',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });
});
