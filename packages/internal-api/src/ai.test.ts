import { describe, expect, it, vi } from 'vitest';
import { getAiChatSignedReadUrls, getCurrentUserAIWhitelistStatus } from './ai';

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

  it('signs AI chat and Mira image paths on read through apps/web', async () => {
    const path = 'ws/mira/images/a.png';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({ urls: [{ path, signedUrl: 'https://signed/a' }] })
      );

    await expect(
      getAiChatSignedReadUrls([path], {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).resolves.toEqual([{ path, signedUrl: 'https://signed/a' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/ai/chat/signed-read-url',
      expect.objectContaining({
        body: JSON.stringify({ paths: [path] }),
        method: 'POST',
      })
    );
  });
});
