import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
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
    range: vi.fn(() => query),
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

  it('loads entry relationships in bounded batches for large projects', async () => {
    const entryIds = Array.from(
      { length: 205 },
      (_, index) => `entry-${index}`
    );
    const relationshipBatches: Record<string, string[][]> = {
      workspace_external_project_assets: [],
      workspace_external_project_blocks: [],
    };
    const collections = [
      {
        collection_type: 'characters',
        config: {},
        id: 'collection-1',
        slug: 'characters',
        title: 'Characters',
      },
    ];
    const entries = entryIds.map((id, index) => ({
      collection_id: 'collection-1',
      created_at: '2026-01-01T00:00:00Z',
      id,
      metadata: {},
      profile_data: {},
      slug: `character-${index}`,
      sort_order: index,
      source_adapter: 'exocorpse',
      stable_source_id: id,
      status: 'published',
      subtitle: null,
      summary: null,
      title: `Character ${index}`,
    }));

    const db = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => {
          let selectedIds: string[] | null = null;
          const query = {
            eq: vi.fn(() => query),
            in: vi.fn((_column: string, ids: string[]) => {
              selectedIds = ids;
              relationshipBatches[table]?.push(ids);
              return query;
            }),
            limit: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn(() => query),
          };

          Object.defineProperty(query, 'then', {
            value: (
              resolve: (value: { data: unknown[]; error: null }) => unknown,
              reject?: (reason: unknown) => unknown
            ) => {
              let data: unknown[] = [];

              if (table === 'workspace_external_project_collections') {
                data = collections;
              } else if (table === 'workspace_external_project_entries') {
                data = entries;
              } else if (
                table === 'workspace_external_project_blocks' &&
                selectedIds
              ) {
                data = selectedIds.map((entryId, index) => ({
                  block_type: 'markdown',
                  content: {},
                  entry_id: entryId,
                  id: `block-${entryId}`,
                  sort_order: index,
                }));
              }

              return Promise.resolve({ data, error: null }).then(
                resolve,
                reject
              );
            },
          });

          return query;
        }),
      })),
    };

    const { getWorkspaceExternalProjectStudioData } = await import('./store');
    const studio = await getWorkspaceExternalProjectStudioData(
      'workspace-1',
      db as never
    );

    expect(studio.entries).toHaveLength(205);
    expect(studio.blocks).toHaveLength(205);
    expect(relationshipBatches.workspace_external_project_blocks).toEqual([
      entryIds.slice(0, 100),
      entryIds.slice(100, 200),
      entryIds.slice(200),
    ]);
    expect(relationshipBatches.workspace_external_project_assets).toEqual([
      entryIds.slice(0, 100),
      entryIds.slice(100, 200),
      entryIds.slice(200),
    ]);
  });

  it('loads every entry page when a workspace exceeds the row limit', async () => {
    const entries = Array.from({ length: 1185 }, (_, index) => ({
      id: `entry-${index}`,
      slug: `entry-${index}`,
    }));
    const ranges: Array<[number, number]> = [];
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(() => {
          let selectedRange: [number, number] = [0, 999];
          const query = {
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn((from: number, to: number) => {
              selectedRange = [from, to];
              ranges.push(selectedRange);
              return query;
            }),
          };

          Object.defineProperty(query, 'then', {
            value: (
              resolve: (value: { data: unknown[]; error: null }) => unknown,
              reject?: (reason: unknown) => unknown
            ) =>
              Promise.resolve({
                data: entries.slice(selectedRange[0], selectedRange[1] + 1),
                error: null,
              }).then(resolve, reject),
          });

          return query;
        }),
      })),
    };

    const { listWorkspaceExternalProjectEntries } = await import('./store');
    const result = await listWorkspaceExternalProjectEntries(
      'workspace-1',
      { includeDrafts: true },
      db as never
    );

    expect(result).toHaveLength(1185);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
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
          table === 'workspace_external_project_assets' ||
          table === 'workspace_external_project_relation_definitions' ||
          table === 'workspace_external_project_relation_definition_targets' ||
          table === 'workspace_external_project_entry_relations'
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
