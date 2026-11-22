import { describe, expect, it, vi } from 'vitest';
import { moveWorkspaceStorageEntries } from './storage-move';

describe('Drive move client', () => {
  it('posts both folders of the same workspace and returns per-entry results', async () => {
    const results = [
      {
        name: 'logo.png',
        status: 'moved',
        totalFiles: 1,
        movedFiles: 1,
        movedMarkers: 0,
      },
    ];
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: results }), { status: 200 })
      );

    await expect(
      moveWorkspaceStorageEntries(
        'workspace 1',
        {
          sourcePath: 'marketing',
          destinationPath: '',
          entries: [{ name: 'logo.png', isFolder: false }],
        },
        { baseUrl: 'https://web.example.test', fetch }
      )
    ).resolves.toEqual(results);
    expect(fetch).toHaveBeenCalledWith(
      'https://web.example.test/api/v1/workspaces/workspace%201/storage/move',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        body: JSON.stringify({
          source: { workspaceId: 'workspace 1', path: 'marketing' },
          destination: { workspaceId: 'workspace 1', path: '' },
          entries: [{ name: 'logo.png', isFolder: false }],
        }),
      })
    );
  });

  it('surfaces a conflict', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Conflict', code: 'DRIVE_MOVE_CONFLICT' }),
          { status: 409 }
        )
      );

    await expect(
      moveWorkspaceStorageEntries(
        'workspace-1',
        {
          sourcePath: '',
          destinationPath: 'archive',
          entries: [{ name: 'reports', isFolder: true }],
        },
        { baseUrl: 'https://web.example.test', fetch }
      )
    ).rejects.toMatchObject({ status: 409 });
  });
});
