import { describe, expect, it, vi } from 'vitest';
import {
  createAIWhitelistDomain,
  deleteAIWhitelistDomain,
  listAIWhitelistDomains,
  updateAIWhitelistDomain,
} from './infrastructure';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('AI whitelist domain internal API helpers', () => {
  it('lists domains through the apps/web API with pagination filters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ count: 0, data: [] }));

    await listAIWhitelistDomains(
      { page: 2, pageSize: 20, q: 'example.com' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domains?page=2&pageSize=20&q=example.com',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('creates domains through the apps/web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: {
          created_at: '2026-05-19T00:00:00Z',
          description: null,
          domain: 'example.com',
          enabled: true,
        },
      })
    );

    await createAIWhitelistDomain(
      {
        description: null,
        domain: 'example.com',
        enabled: true,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domains',
      expect.objectContaining({
        body: JSON.stringify({
          description: null,
          domain: 'example.com',
          enabled: true,
        }),
        method: 'POST',
      })
    );
  });

  it('updates and deletes domains through encoded apps/web API routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ success: true }));

    await updateAIWhitelistDomain(
      'example.com',
      { enabled: false },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteAIWhitelistDomain('example.com', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domain/example.com',
      expect.objectContaining({
        body: JSON.stringify({ enabled: false }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domain/example.com',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});
