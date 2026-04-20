import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
}));

vi.mock('../workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: (
    ...args: Parameters<typeof mocks.deleteWorkspaceStorageObjectByPath>
  ) => mocks.deleteWorkspaceStorageObjectByPath(...args),
}));

function createEqChain<T>(result: T) {
  return {
    eq: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve(result)),
      in: vi.fn(() => Promise.resolve(result)),
    })),
    in: vi.fn(() => Promise.resolve(result)),
  };
}

describe('external project store cleanup', () => {
  beforeEach(() => {
    mocks.deleteWorkspaceStorageObjectByPath.mockReset();
    mocks.deleteWorkspaceStorageObjectByPath.mockResolvedValue(undefined);
  });

  it('deletes referenced storage files when removing an entry', async () => {
    const assetsSelectResult = {
      data: [
        { storage_path: 'external-projects/yoola/about/hero.webp' },
        { storage_path: 'external-projects/yoola/about/hero.webp' },
        { storage_path: 'external-projects/yoola/about/detail.webp' },
      ],
      error: null,
    };
    const deleteResult = { error: null };

    const db = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_external_project_assets') {
          return {
            select: vi.fn(() => createEqChain(assetsSelectResult)),
            delete: vi.fn(() => createEqChain(deleteResult)),
          };
        }

        if (
          table === 'workspace_external_project_blocks' ||
          table === 'workspace_external_project_entries'
        ) {
          return {
            delete: vi.fn(() => createEqChain(deleteResult)),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const { deleteWorkspaceExternalProjectEntry } = await import('./store');

    await expect(
      deleteWorkspaceExternalProjectEntry(
        'entry-1',
        {
          workspaceId: 'ws-1',
        },
        db as never
      )
    ).resolves.toEqual({
      id: 'entry-1',
    });

    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledTimes(2);
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      'external-projects/yoola/about/hero.webp'
    );
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      'external-projects/yoola/about/detail.webp'
    );
  });

  it('deletes referenced storage files for every entry when removing a collection', async () => {
    const entrySelectResult = {
      data: [{ id: 'entry-1' }, { id: 'entry-2' }],
      error: null,
    };
    const assetsSelectResult = {
      data: [
        { storage_path: 'external-projects/yoola/artworks/cover-1.webp' },
        { storage_path: 'external-projects/yoola/artworks/cover-2.webp' },
      ],
      error: null,
    };
    const deleteResult = { error: null };

    const db = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_external_project_entries') {
          return {
            select: vi.fn(() => createEqChain(entrySelectResult)),
            delete: vi.fn(() => createEqChain(deleteResult)),
          };
        }

        if (table === 'workspace_external_project_assets') {
          return {
            select: vi.fn(() => createEqChain(assetsSelectResult)),
            delete: vi.fn(() => createEqChain(deleteResult)),
          };
        }

        if (
          table === 'workspace_external_project_blocks' ||
          table === 'workspace_external_project_collections'
        ) {
          return {
            delete: vi.fn(() => createEqChain(deleteResult)),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const { deleteWorkspaceExternalProjectCollection } = await import(
      './store'
    );

    await expect(
      deleteWorkspaceExternalProjectCollection(
        'collection-1',
        {
          workspaceId: 'ws-1',
        },
        db as never
      )
    ).resolves.toEqual({
      id: 'collection-1',
    });

    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledTimes(2);
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      'external-projects/yoola/artworks/cover-1.webp'
    );
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      'external-projects/yoola/artworks/cover-2.webp'
    );
  });
});
