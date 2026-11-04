import { describe, expect, it, vi } from 'vitest';
import { InternalApiError } from './client';
import { deleteWorkspace } from './workspaces';

describe('deleteWorkspace', () => {
  it.each([200, 204])(
    'sends one encoded DELETE and accepts HTTP %s',
    async (status) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(
          new Response(
            status === 204 ? null : JSON.stringify({ message: 'success' }),
            { status }
          )
        );
      await deleteWorkspace('workspace/id', {
        baseUrl: 'https://fixture.example',
        fetch,
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledWith(
        'https://fixture.example/api/workspaces/workspace%2Fid',
        expect.objectContaining({ method: 'DELETE', cache: 'no-store' })
      );
    }
  );

  it('retains the HTTP failure message and status without retrying', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Error deleting workspace' }), {
        status: 500,
      })
    );
    await expect(
      deleteWorkspace('workspace', {
        baseUrl: 'https://fixture.example',
        fetch,
      })
    ).rejects.toMatchObject({
      message: 'Error deleting workspace',
      status: 500,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports a non-JSON gateway failure as an HTTP error', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('Gateway timeout', { status: 504 }));
    await expect(
      deleteWorkspace('workspace', {
        baseUrl: 'https://fixture.example',
        fetch,
      })
    ).rejects.toBeInstanceOf(InternalApiError);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
