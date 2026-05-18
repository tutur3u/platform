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

function createMaybeSingleEqChain<T>(result: T) {
  return {
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve(result)),
      })),
    })),
  };
}

function createScopedUpdateDb(row: Record<string, unknown>) {
  const eqCalls: Array<[column: string, value: string]> = [];
  const query = {
    eq: vi.fn((column: string, value: string) => {
      eqCalls.push([column, value]);
      return query;
    }),
    select: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
  const updateMock = vi.fn(() => query);
  const fromMock = vi.fn(() => ({
    update: updateMock,
  }));

  return {
    db: {
      from: fromMock,
    },
    eqCalls,
    fromMock,
    updateMock,
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
        { storage_path: 'finance/private-payroll.csv' },
        { storage_path: 'external-projects/yoola/about/detail.webp' },
      ],
      error: null,
    };
    const blocksSelectResult = { data: [], error: null };
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
            select: vi.fn(() => createEqChain(blocksSelectResult)),
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
    const blocksSelectResult = { data: [], error: null };
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
            select: vi.fn(() => createEqChain(blocksSelectResult)),
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

  it('deletes referenced storage files when removing a single asset', async () => {
    const assetSelectResult = {
      data: {
        storage_path: 'external-projects/yoola/artworks/audio.wav',
      },
      error: null,
    };
    const deleteResult = { error: null };
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_external_project_assets') {
          return {
            select: vi.fn(() => createMaybeSingleEqChain(assetSelectResult)),
            delete: vi.fn(() => createEqChain(deleteResult)),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const { deleteWorkspaceExternalProjectAsset } = await import('./store');

    await expect(
      deleteWorkspaceExternalProjectAsset(
        'asset-1',
        {
          workspaceId: 'ws-1',
        },
        db as never
      )
    ).resolves.toEqual({
      id: 'asset-1',
    });

    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'ws-1',
      'external-projects/yoola/artworks/audio.wav'
    );
  });

  it('does not delete non-external-project storage when removing a single asset', async () => {
    const assetSelectResult = {
      data: {
        storage_path: 'finance/private-payroll.csv',
      },
      error: null,
    };
    const deleteResult = { error: null };
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_external_project_assets') {
          return {
            select: vi.fn(() => createMaybeSingleEqChain(assetSelectResult)),
            delete: vi.fn(() => createEqChain(deleteResult)),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const { deleteWorkspaceExternalProjectAsset } = await import('./store');

    await expect(
      deleteWorkspaceExternalProjectAsset(
        'asset-1',
        {
          workspaceId: 'ws-1',
        },
        db as never
      )
    ).resolves.toEqual({
      id: 'asset-1',
    });

    expect(mocks.deleteWorkspaceStorageObjectByPath).not.toHaveBeenCalled();
  });
});

describe('external project store update scoping', () => {
  const workspaceId = 'ws-authorized';
  const actorId = 'user-1';

  it.each([
    {
      id: 'collection-1',
      run: async (db: ReturnType<typeof createScopedUpdateDb>['db']) => {
        const { updateWorkspaceExternalProjectCollection } = await import(
          './store'
        );

        return updateWorkspaceExternalProjectCollection(
          'collection-1',
          {
            actorId,
            title: 'Updated collection',
            workspaceId,
          },
          db as never
        );
      },
      table: 'workspace_external_project_collections',
    },
    {
      id: 'block-1',
      run: async (db: ReturnType<typeof createScopedUpdateDb>['db']) => {
        const { updateWorkspaceExternalProjectBlock } = await import('./store');

        return updateWorkspaceExternalProjectBlock(
          'block-1',
          {
            actorId,
            title: 'Updated block',
            workspaceId,
          },
          db as never
        );
      },
      table: 'workspace_external_project_blocks',
    },
    {
      id: 'entry-1',
      run: async (db: ReturnType<typeof createScopedUpdateDb>['db']) => {
        const { updateWorkspaceExternalProjectEntry } = await import('./store');

        return updateWorkspaceExternalProjectEntry(
          'entry-1',
          {
            actorId,
            title: 'Updated entry',
            workspaceId,
          },
          db as never
        );
      },
      table: 'workspace_external_project_entries',
    },
    {
      id: 'asset-1',
      run: async (db: ReturnType<typeof createScopedUpdateDb>['db']) => {
        const { updateWorkspaceExternalProjectAsset } = await import('./store');

        return updateWorkspaceExternalProjectAsset(
          'asset-1',
          {
            actorId,
            alt_text: 'Updated asset',
            workspaceId,
          },
          db as never
        );
      },
      table: 'workspace_external_project_assets',
    },
  ])('scopes $table updates by workspace before id', async (testCase) => {
    const { db, eqCalls, fromMock, updateMock } = createScopedUpdateDb({
      id: testCase.id,
      ws_id: workspaceId,
    });

    await testCase.run(db);

    expect(fromMock).toHaveBeenCalledWith(testCase.table);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        updated_by: actorId,
      })
    );
    expect(eqCalls).toEqual([
      ['ws_id', workspaceId],
      ['id', testCase.id],
    ]);
  });
});
