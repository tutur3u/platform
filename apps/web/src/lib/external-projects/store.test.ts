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

function createOrderedSelectResult<T>(result: T) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
  };

  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: T) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });

  return query as typeof query & PromiseLike<T>;
}

describe('external project store cleanup', () => {
  beforeEach(() => {
    mocks.deleteWorkspaceStorageObjectByPath.mockReset();
    mocks.deleteWorkspaceStorageObjectByPath.mockResolvedValue(undefined);
  });

  it('excludes private delivery collections and entries from public delivery payloads', async () => {
    const collections = [
      {
        collection_type: 'brands',
        config: {},
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
        description: null,
        id: 'collection-brands',
        is_enabled: true,
        slug: 'brands',
        title: 'Brands',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
        ws_id: 'workspace-1',
      },
      {
        collection_type: 'contact-submissions',
        config: { privateDelivery: true },
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
        description: null,
        id: 'collection-contact-submissions',
        is_enabled: true,
        slug: 'contact-submissions',
        title: 'Contact Inbox',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
        ws_id: 'workspace-1',
      },
      {
        collection_type: 'private-inbox',
        config: { privateDelivery: true },
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
        description: null,
        id: 'collection-private-inbox',
        is_enabled: true,
        slug: 'private-inbox',
        title: 'Private Inbox',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
        ws_id: 'workspace-1',
      },
    ];
    const entries = [
      {
        collection_id: 'collection-brands',
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
        id: 'entry-brand',
        metadata: {},
        profile_data: {},
        published_at: null,
        scheduled_for: null,
        slug: 'brand',
        sort_order: 0,
        source_adapter: null,
        stable_source_id: null,
        status: 'published',
        subtitle: null,
        summary: 'Visible brand',
        title: 'Visible Brand',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
        ws_id: 'workspace-1',
      },
      {
        collection_id: 'collection-contact-submissions',
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
        id: 'entry-submission',
        metadata: { privateDelivery: true },
        profile_data: { email: 'visitor@example.com' },
        published_at: null,
        scheduled_for: null,
        slug: 'private-message',
        sort_order: 0,
        source_adapter: null,
        stable_source_id: null,
        status: 'published',
        subtitle: 'visitor@example.com',
        summary: 'Private message',
        title: 'Private Visitor',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
        ws_id: 'workspace-1',
      },
      {
        collection_id: 'collection-brands',
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
        id: 'entry-private-brand',
        metadata: { privateDelivery: true },
        profile_data: {},
        published_at: null,
        scheduled_for: null,
        slug: 'private-brand',
        sort_order: 1,
        source_adapter: null,
        stable_source_id: null,
        status: 'published',
        subtitle: null,
        summary: 'Private brand',
        title: 'Private Brand',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
        ws_id: 'workspace-1',
      },
      {
        collection_id: 'collection-private-inbox',
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
        id: 'entry-private-inbox',
        metadata: {},
        profile_data: {},
        published_at: null,
        scheduled_for: null,
        slug: 'private-inbox-message',
        sort_order: 0,
        source_adapter: null,
        stable_source_id: null,
        status: 'published',
        subtitle: null,
        summary: 'Private inbox message',
        title: 'Private Inbox Message',
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
        ws_id: 'workspace-1',
      },
    ];

    const db = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_external_project_collections') {
          return {
            select: vi.fn(() =>
              createOrderedSelectResult({ data: collections, error: null })
            ),
          };
        }

        if (table === 'workspace_external_project_entries') {
          return {
            select: vi.fn(() =>
              createOrderedSelectResult({ data: entries, error: null })
            ),
          };
        }

        if (
          table === 'workspace_external_project_blocks' ||
          table === 'workspace_external_project_assets'
        ) {
          return {
            select: vi.fn(() =>
              createOrderedSelectResult({ data: [], error: null })
            ),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const { buildWorkspaceExternalProjectDeliveryPayload } = await import(
      './store'
    );

    const payload = await buildWorkspaceExternalProjectDeliveryPayload(
      {
        binding: {
          adapter: 'richfield',
          canonical_id: 'richfield-main',
          canonical_project: {
            allowed_collections: [],
            allowed_features: [],
            adapter: 'richfield',
            created_at: '2026-01-01T00:00:00Z',
            created_by: null,
            delivery_profile: {},
            display_name: 'Richfield',
            id: 'richfield-main',
            is_active: true,
            metadata: {},
            updated_at: '2026-01-01T00:00:00Z',
            updated_by: null,
          },
          enabled: true,
          workspace_id: 'workspace-1',
        },
        includeDrafts: false,
        workspaceId: 'workspace-1',
      },
      db as never
    );

    expect(payload.collections.map((collection) => collection.slug)).toEqual([
      'brands',
    ]);
    expect(
      payload.collections.flatMap((collection) =>
        collection.entries.map((entry) => entry.slug)
      )
    ).toEqual(['brand']);
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
