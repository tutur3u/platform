import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  getWorkspaceExternalProjectStudioData: vi.fn(),
  upsertWorkspaceExternalProjectFieldDefinitionsFromSchema: vi.fn(),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
}));

vi.mock('./store', () => ({
  getWorkspaceExternalProjectStudioData: (
    ...args: Parameters<typeof storeMocks.getWorkspaceExternalProjectStudioData>
  ) => storeMocks.getWorkspaceExternalProjectStudioData(...args),
  upsertWorkspaceExternalProjectFieldDefinitionsFromSchema: (
    ...args: Parameters<
      typeof storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema
    >
  ) =>
    storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema(
      ...args
    ),
}));

import {
  applyWorkspaceExternalProjectSyncManifest,
  normalizeExternalProjectSyncManifest,
} from './sync';

describe('external project sync apply', () => {
  beforeEach(() => {
    storeMocks.getWorkspaceExternalProjectStudioData.mockReset();
    storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema.mockReset();
    storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema.mockResolvedValue(
      undefined
    );
  });

  it('keeps workspace sync apply from updating the canonical registry schema', async () => {
    const emptyStudio = {
      assets: [],
      binding: null,
      blocks: [],
      collections: [],
      entries: [],
      fieldDefinitions: [],
      importJobs: [],
      loadingData: null,
      publishEvents: [],
    };
    storeMocks.getWorkspaceExternalProjectStudioData.mockResolvedValue(
      emptyStudio
    );
    const collectionEq = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const collectionSelect = vi.fn(() => ({
      eq: collectionEq,
    }));
    const from = vi.fn((table: string) => {
      if (table === 'canonical_external_projects') {
        throw new Error(
          'workspace sync apply must not update canonical schema'
        );
      }

      if (table === 'workspace_external_project_collections') {
        return {
          select: collectionSelect,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const db = { from };
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'yoola',
      canonicalProjectId: 'shared-canonical',
      content: {
        entries: [],
      },
      schema: {
        collections: [],
        metadataFields: [
          {
            key: 'tenant-local-field',
            type: 'string',
          },
        ],
      },
      version: 1,
    });

    await expect(
      applyWorkspaceExternalProjectSyncManifest(
        {
          actorId: 'user-1',
          binding: {
            adapter: 'yoola',
            canonical_id: 'shared-canonical',
            canonical_project: {
              delivery_profile: {
                schema: {
                  collections: [],
                },
              },
            },
            enabled: true,
            workspace_id: 'ws-1',
          } as never,
          manifest,
          workspaceId: 'ws-1',
        },
        db as never
      )
    ).resolves.toMatchObject({
      applied: true,
    });

    expect(from).not.toHaveBeenCalledWith('canonical_external_projects');
    expect(collectionSelect).toHaveBeenCalled();
    expect(
      storeMocks.upsertWorkspaceExternalProjectFieldDefinitionsFromSchema
    ).toHaveBeenCalledWith(
      {
        actorId: 'user-1',
        collectionBySlug: expect.any(Map),
        deleteMissing: false,
        schema: manifest.schema,
        workspaceId: 'ws-1',
      },
      db
    );
  });

  it('claims a matching collection slug without archiving the updated entry', async () => {
    const collection = {
      collection_type: 'characters',
      config: {},
      description: null,
      id: 'collection-1',
      is_enabled: true,
      slug: 'characters',
      title: 'Characters',
    };
    const existingEntry = {
      collection_id: collection.id,
      id: 'entry-existing',
      metadata: {},
      profile_data: {},
      published_at: null,
      scheduled_for: null,
      slug: 'verdant-goose-loxwood',
      stable_source_id: 'legacy:character:verdant-goose-loxwood',
      status: 'published',
      subtitle: null,
      summary: null,
      title: 'Verdant Goose Loxwood',
    };
    const studio = {
      assets: [],
      binding: null,
      blocks: [],
      collections: [collection],
      entries: [existingEntry],
      fieldDefinitions: [],
      importJobs: [],
      loadingData: null,
      publishEvents: [],
    };
    storeMocks.getWorkspaceExternalProjectStudioData.mockResolvedValue(studio);

    const entryUpdate = vi.fn();
    const createUpdateQuery = (
      table: string,
      values: Record<string, unknown>
    ) => {
      const query = {
        eq: vi.fn(() => query),
        select: vi.fn(() => query),
        single: vi.fn(async () => ({
          data:
            table === 'workspace_external_project_collections'
              ? collection
              : { ...existingEntry, ...values },
          error: null,
        })),
      };

      Object.defineProperty(query, 'then', {
        value: (
          resolve: (value: { data: null; error: null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
      });

      return query;
    };
    const from = vi.fn((table: string) => {
      if (table === 'workspace_external_project_collections') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [collection],
              error: null,
            }),
          })),
          update: vi.fn((values: Record<string, unknown>) =>
            createUpdateQuery(table, values)
          ),
        };
      }

      if (table === 'workspace_external_project_entries') {
        return {
          update: entryUpdate.mockImplementation(
            (values: Record<string, unknown>) =>
              createUpdateQuery(table, values)
          ),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'exocorpse',
      content: {
        entries: [
          {
            collectionSlug: 'characters',
            slug: existingEntry.slug,
            stableSourceId: 'exocorpse:character:verdant-goose-loxwood',
            status: 'published',
            title: 'Verdant “Goose” Loxwood',
          },
        ],
      },
      schema: {
        collections: [
          {
            collection_type: 'characters',
            slug: 'characters',
            title: 'Characters',
          },
        ],
      },
      version: 1,
    });

    await expect(
      applyWorkspaceExternalProjectSyncManifest(
        {
          actorId: 'user-1',
          binding: {
            adapter: 'exocorpse',
            canonical_id: 'exocorpse-main',
            canonical_project: {
              delivery_profile: { schema: manifest.schema },
            },
            enabled: true,
            workspace_id: 'ws-1',
          } as never,
          manifest,
          workspaceId: 'ws-1',
        },
        { from } as never
      )
    ).resolves.toMatchObject({ applied: true });

    expect(entryUpdate).toHaveBeenCalledTimes(1);
    expect(entryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stable_source_id: 'exocorpse:character:verdant-goose-loxwood',
      })
    );
  });
});
