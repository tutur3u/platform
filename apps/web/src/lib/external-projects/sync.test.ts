import type { ExternalProjectSyncSnapshot } from '@tuturuuu/types';
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
  buildExternalProjectSyncDiff,
  buildExternalProjectSyncSnapshot,
  normalizeExternalProjectSyncManifest,
} from './sync';

describe('external project sync diff', () => {
  it('creates, updates, and archives content without hard deletes by default', () => {
    const snapshot: ExternalProjectSyncSnapshot = {
      adapter: 'yoola',
      canonicalProjectId: 'yoola-main',
      content: {
        entries: [
          {
            blocks: [],
            collectionSlug: 'artworks',
            id: 'entry-existing',
            metadata: {},
            profileData: {
              label: 'ARC-01',
            },
            slug: 'starter-signal',
            stableSourceId: 'yoola:art:starter-signal',
            status: 'published',
            title: 'Starter Signal',
          },
          {
            blocks: [],
            collectionSlug: 'artworks',
            id: 'entry-orphan',
            metadata: {},
            profileData: {},
            slug: 'old-frame',
            stableSourceId: 'yoola:art:old-frame',
            status: 'published',
            title: 'Old Frame',
          },
        ],
      },
      generatedAt: '2026-05-09T00:00:00.000Z',
      schema: {
        collections: [
          {
            collection_type: 'artworks',
            slug: 'artworks',
            title: 'Artworks',
          },
        ],
      },
      version: 1,
      workspaceId: 'ws-1',
    };
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'yoola',
      content: {
        entries: [
          {
            collectionSlug: 'artworks',
            profileData: {
              label: 'ARC-02',
            },
            slug: 'starter-signal',
            stableSourceId: 'yoola:art:starter-signal',
            status: 'published',
            title: 'Starter Signal Updated',
          },
          {
            collectionSlug: 'artworks',
            slug: 'new-frame',
            stableSourceId: 'yoola:art:new-frame',
            status: 'draft',
            title: 'New Frame',
          },
        ],
      },
      schema: snapshot.schema,
      version: 1,
    });

    const diff = buildExternalProjectSyncDiff(snapshot, manifest);

    expect(diff.hasDestructiveOperations).toBe(false);
    expect(diff.summary).toMatchObject({
      archive: 1,
      create: 1,
      update: 1,
    });
    expect(diff.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'update',
          entity: 'entry',
          manifestKey: 'yoola:art:starter-signal',
          platformId: 'entry-existing',
        }),
        expect.objectContaining({
          action: 'create',
          entity: 'entry',
          manifestKey: 'yoola:art:new-frame',
        }),
        expect.objectContaining({
          action: 'archive',
          entity: 'entry',
          manifestKey: 'yoola:art:old-frame',
          platformId: 'entry-orphan',
        }),
      ])
    );
  });

  it('matches an existing collection slug when the stable source id changes', () => {
    const snapshot: ExternalProjectSyncSnapshot = {
      adapter: 'exocorpse',
      canonicalProjectId: 'exocorpse-main',
      content: {
        entries: [
          {
            collectionSlug: 'characters',
            id: 'entry-existing',
            slug: 'verdant-goose-loxwood',
            stableSourceId: 'legacy:character:verdant-goose-loxwood',
            status: 'published',
            title: 'Verdant Goose Loxwood',
          },
        ],
      },
      generatedAt: '2026-07-13T00:00:00.000Z',
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
      workspaceId: 'ws-1',
    };
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'exocorpse',
      content: {
        entries: [
          {
            collectionSlug: 'characters',
            slug: 'verdant-goose-loxwood',
            stableSourceId: 'exocorpse:character:verdant-goose-loxwood',
            status: 'published',
            title: 'Verdant “Goose” Loxwood',
          },
        ],
      },
      schema: snapshot.schema,
      version: 1,
    });

    const diff = buildExternalProjectSyncDiff(snapshot, manifest);

    expect(diff.summary).toMatchObject({
      archive: 0,
      create: 0,
      update: 1,
    });
    expect(diff.operations).toEqual([
      expect.objectContaining({
        action: 'update',
        manifestKey: 'exocorpse:character:verdant-goose-loxwood',
        platformId: 'entry-existing',
      }),
    ]);
  });

  it('does not let a new stable id claim a row addressed elsewhere in the manifest', () => {
    const snapshot: ExternalProjectSyncSnapshot = {
      adapter: 'exocorpse',
      canonicalProjectId: 'exocorpse-main',
      content: {
        entries: [
          {
            collectionSlug: 'characters',
            id: 'entry-a',
            slug: 'old-slug',
            stableSourceId: 'exocorpse:character:a',
            status: 'published',
            title: 'Character A',
          },
        ],
      },
      generatedAt: '2026-07-13T00:00:00.000Z',
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
      workspaceId: 'ws-1',
    };
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'exocorpse',
      content: {
        entries: [
          {
            collectionSlug: 'characters',
            slug: 'new-slug',
            stableSourceId: 'exocorpse:character:a',
            status: 'published',
            title: 'Character A',
          },
          {
            collectionSlug: 'characters',
            slug: 'old-slug',
            stableSourceId: 'exocorpse:character:b',
            status: 'published',
            title: 'Character B',
          },
        ],
      },
      schema: snapshot.schema,
      version: 1,
    });

    const diff = buildExternalProjectSyncDiff(snapshot, manifest);

    expect(diff.summary).toMatchObject({
      archive: 0,
      create: 1,
      update: 1,
    });
    expect(diff.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'update',
          manifestKey: 'exocorpse:character:a',
          platformId: 'entry-a',
        }),
        expect.objectContaining({
          action: 'create',
          manifestKey: 'exocorpse:character:b',
        }),
      ])
    );
  });

  it('marks explicit delete operations as destructive and force-gated', () => {
    const snapshot: ExternalProjectSyncSnapshot = {
      adapter: 'yoola',
      canonicalProjectId: 'yoola-main',
      content: {
        entries: [
          {
            blocks: [],
            collectionSlug: 'artworks',
            id: 'entry-delete',
            metadata: {},
            profileData: {},
            slug: 'delete-me',
            stableSourceId: 'yoola:art:delete-me',
            status: 'published',
            title: 'Delete Me',
          },
        ],
      },
      generatedAt: '2026-05-09T00:00:00.000Z',
      schema: {
        collections: [
          {
            collection_type: 'artworks',
            slug: 'artworks',
            title: 'Artworks',
          },
        ],
      },
      version: 1,
      workspaceId: 'ws-1',
    };
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'yoola',
      content: {
        entries: [
          {
            collectionSlug: 'artworks',
            delete: true,
            slug: 'delete-me',
            stableSourceId: 'yoola:art:delete-me',
            title: 'Delete Me',
          },
        ],
      },
      schema: snapshot.schema,
      version: 1,
    });

    const diff = buildExternalProjectSyncDiff(snapshot, manifest);

    expect(diff.hasDestructiveOperations).toBe(true);
    expect(diff.operations).toEqual([
      expect.objectContaining({
        action: 'delete',
        destructive: true,
        entity: 'entry',
        manifestKey: 'yoola:art:delete-me',
      }),
    ]);
  });

  it('marks manifest asset removals as destructive entry updates', () => {
    const snapshot: ExternalProjectSyncSnapshot = {
      adapter: 'yoola',
      canonicalProjectId: 'yoola-main',
      content: {
        entries: [
          {
            assets: [
              {
                assetType: 'audio',
                sortOrder: 0,
                stableSourceId: 'kendra:voice:demo:audio',
                storagePath: 'external-projects/kendra/voice-reels/demo.mp3',
              },
            ],
            blocks: [],
            collectionSlug: 'voice-reels',
            id: 'entry-voice',
            metadata: {},
            profileData: {},
            slug: 'demo',
            stableSourceId: 'kendra:voice:demo',
            status: 'published',
            title: 'Demo',
          },
        ],
      },
      generatedAt: '2026-05-09T00:00:00.000Z',
      schema: {
        collections: [
          {
            assetTypes: ['audio'],
            collection_type: 'voice-reels',
            slug: 'voice-reels',
            title: 'Voice Reels',
          },
        ],
      },
      version: 1,
      workspaceId: 'ws-1',
    };
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'yoola',
      content: {
        entries: [
          {
            assets: [],
            collectionSlug: 'voice-reels',
            slug: 'demo',
            stableSourceId: 'kendra:voice:demo',
            status: 'published',
            title: 'Demo',
          },
        ],
      },
      schema: snapshot.schema,
      version: 1,
    });

    const diff = buildExternalProjectSyncDiff(snapshot, manifest);

    expect(diff.hasDestructiveOperations).toBe(true);
    expect(diff.operations).toEqual([
      expect.objectContaining({
        action: 'update',
        destructive: true,
        entity: 'entry',
        reason: 'Manifest removes entry assets',
      }),
    ]);
  });

  it('includes block-scoped assets in normalized snapshots', () => {
    const snapshot = buildExternalProjectSyncSnapshot({
      binding: {
        adapter: 'yoola',
        canonical_id: 'yoola-main',
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
      generatedAt: '2026-05-09T00:00:00.000Z',
      studio: {
        assets: [
          {
            alt_text: 'Hero frame',
            asset_type: 'image',
            block_id: 'block-1',
            entry_id: null,
            id: 'asset-1',
            metadata: {},
            preview_url: null,
            sort_order: 0,
            source_url: null,
            stable_source_id: 'asset-stable-1',
            storage_path: 'external-projects/yoola/hero.png',
          },
        ],
        binding: null,
        blocks: [
          {
            block_type: 'markdown',
            content: {},
            entry_id: 'entry-1',
            id: 'block-1',
            sort_order: 0,
            stable_source_id: 'block-stable-1',
            title: null,
          },
        ],
        collections: [
          {
            collection_type: 'artworks',
            config: {},
            description: null,
            id: 'collection-1',
            is_enabled: true,
            slug: 'artworks',
            title: 'Artworks',
          },
        ],
        entries: [
          {
            collection_id: 'collection-1',
            id: 'entry-1',
            metadata: {},
            profile_data: {},
            published_at: null,
            scheduled_for: null,
            slug: 'hero',
            stable_source_id: 'entry-stable-1',
            status: 'published',
            subtitle: null,
            summary: null,
            title: 'Hero',
          },
        ],
        importJobs: [],
        loadingData: null,
        publishEvents: [],
      } as never,
      workspaceId: 'ws-1',
    });

    expect(snapshot.content.entries[0]?.assets?.[0]).toMatchObject({
      blockStableSourceId: 'block-stable-1',
      stableSourceId: 'asset-stable-1',
      storagePath: 'external-projects/yoola/hero.png',
    });
  });

  it('builds schema snapshots from DB field definitions', () => {
    const snapshot = buildExternalProjectSyncSnapshot({
      binding: {
        adapter: 'yashie',
        canonical_id: 'yashie-main',
        canonical_project: {
          delivery_profile: {
            schema: {
              collections: [
                {
                  collection_type: 'gallery',
                  profileFields: [
                    {
                      key: 'legacy',
                      type: 'string',
                    },
                  ],
                  slug: 'gallery',
                  title: 'Gallery',
                },
              ],
            },
          },
        },
        enabled: true,
        workspace_id: 'ws-1',
      } as never,
      generatedAt: '2026-05-09T00:00:00.000Z',
      studio: {
        assets: [],
        blocks: [],
        collections: [
          {
            collection_type: 'gallery',
            config: {},
            description: null,
            id: 'collection-1',
            is_enabled: true,
            slug: 'gallery',
            title: 'Gallery',
          },
        ],
        entries: [],
        fieldDefinitions: [
          {
            collection_id: 'collection-1',
            created_at: '2026-05-09T00:00:00.000Z',
            default_value: null,
            description: 'Artwork medium',
            field_scope: 'profile_data',
            field_type: 'string',
            id: 'field-1',
            is_enabled: true,
            is_required: true,
            key: 'medium',
            label: 'Medium',
            options: ['digital', 'tattoo'],
            sort_order: 0,
          },
        ],
        importJobs: [],
        loadingData: null,
        publishEvents: [],
      } as never,
      workspaceId: 'ws-1',
    });

    expect(snapshot.schema.collections[0]?.profileFields).toEqual([
      {
        defaultValue: undefined,
        description: 'Artwork medium',
        key: 'medium',
        label: 'Medium',
        options: ['digital', 'tattoo'],
        required: true,
        type: 'string',
      },
    ]);
  });

  it('marks schema field removals as destructive', () => {
    const snapshot: ExternalProjectSyncSnapshot = {
      adapter: 'yashie',
      canonicalProjectId: 'yashie-main',
      content: {
        entries: [],
      },
      generatedAt: '2026-05-09T00:00:00.000Z',
      schema: {
        collections: [
          {
            collection_type: 'gallery',
            profileFields: [
              {
                key: 'medium',
                type: 'string',
              },
            ],
            slug: 'gallery',
            title: 'Gallery',
          },
        ],
      },
      version: 1,
      workspaceId: 'ws-1',
    };
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'yashie',
      content: {
        entries: [],
      },
      schema: {
        collections: [
          {
            collection_type: 'gallery',
            slug: 'gallery',
            title: 'Gallery',
          },
        ],
      },
      version: 1,
    });

    const diff = buildExternalProjectSyncDiff(snapshot, manifest);

    expect(diff.hasDestructiveOperations).toBe(true);
    expect(diff.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destructive: true,
          entity: 'schema',
          reason: 'Schema removes 1 field definition',
        }),
      ])
    );
  });
});

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
