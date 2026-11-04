import { describe, expect, it, vi } from 'vitest';
import { revokeWorkspaceStorageExportLinks } from './storage-export-links';

describe('Drive export revocation client', () => {
  it('sends an authenticated DELETE through the shared client', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ revoked: true }), { status: 200 })
      );
    await expect(
      revokeWorkspaceStorageExportLinks(
        'workspace 1',
        { path: 'exports/site' },
        { baseUrl: 'https://web.example.test', fetch }
      )
    ).resolves.toEqual({ revoked: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://web.example.test/api/v1/workspaces/workspace%201/storage/export-links',
      expect.objectContaining({
        method: 'DELETE',
        cache: 'no-store',
        body: JSON.stringify({ path: 'exports/site' }),
      })
    );
  });
  it('surfaces a failed revocation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Insufficient permissions' }), {
        status: 403,
      })
    );
    await expect(
      revokeWorkspaceStorageExportLinks(
        'workspace-1',
        { path: 'exports/site' },
        { baseUrl: 'https://web.example.test', fetch }
      )
    ).rejects.toThrow();
  });
});
