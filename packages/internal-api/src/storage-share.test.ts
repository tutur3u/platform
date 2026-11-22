import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceStorageShareLink } from './storage-share';

const respond = (body: unknown) =>
  vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

const options = (fetch: typeof globalThis.fetch) => ({
  baseUrl: 'https://web.example.test',
  fetch,
});

describe('createWorkspaceStorageShareLink', () => {
  it('returns the effective lifetime the server reports', async () => {
    const fetch = respond({ signedUrl: 'https://r2.test/a', expiresIn: 600 });

    await expect(
      createWorkspaceStorageShareLink(
        'ws 1',
        'docs/a.pdf',
        undefined,
        options(fetch)
      )
    ).resolves.toEqual({ url: 'https://r2.test/a', expiresIn: 600 });
    expect(fetch).toHaveBeenCalledWith(
      'https://web.example.test/api/v1/workspaces/ws%201/storage/share',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'docs/a.pdf' }),
      })
    );
  });

  it('derives the lifetime from an expiry time and allows its absence', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-23T00:00:00Z') });
    try {
      await expect(
        createWorkspaceStorageShareLink(
          'ws',
          'a.png',
          undefined,
          options(
            respond({
              signedUrl: 'https://r2.test/b',
              expiresAt: '2026-11-23T00:05:00Z',
            })
          )
        )
      ).resolves.toEqual({ url: 'https://r2.test/b', expiresIn: 300 });
    } finally {
      vi.useRealTimers();
    }

    await expect(
      createWorkspaceStorageShareLink(
        'ws',
        'a.png',
        undefined,
        options(respond({ signedUrl: 'https://r2.test/c' }))
      )
    ).resolves.toEqual({ url: 'https://r2.test/c', expiresIn: null });
  });

  it('rejects a response without a link', async () => {
    await expect(
      createWorkspaceStorageShareLink(
        'ws',
        'a.png',
        undefined,
        options(respond({}))
      )
    ).rejects.toThrow('Missing signed URL');
  });
});
