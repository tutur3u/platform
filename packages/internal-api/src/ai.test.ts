import { describe, expect, it, vi } from 'vitest';
import { getCurrentUserAIWhitelistStatus } from './ai';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('AI internal API helpers', () => {
  it('checks the current user AI whitelist status through apps/web', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        email: 'person@example.com',
        enabled: true,
      })
    );

    await getCurrentUserAIWhitelistStatus({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/ai/whitelist/me',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });
});
