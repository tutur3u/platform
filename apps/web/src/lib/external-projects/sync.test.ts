import type { ExternalProjectSyncSnapshot } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
}));

import {
  buildExternalProjectSyncDiff,
  buildExternalProjectSyncSnapshot,
  normalizeExternalProjectSyncManifest,
} from './sync';

describe('external project sync diff', () => {
  it('treats stored schema ordering and expanded field defaults as equivalent', () => {
    const snapshot: ExternalProjectSyncSnapshot = {
      adapter: 'exocorpse',
      canonicalProjectId: 'exocorpse-main',
      content: { entries: [] },
      generatedAt: '2026-07-13T00:00:00.000Z',
      schema: {
        collections: [
          {
            collection_type: 'worlds',
            slug: 'worlds',
            title: 'Worlds',
          },
          {
            collection_type: 'characters',
            slug: 'characters',
            title: 'Characters',
          },
        ],
        profileFields: [
          {
            description: null,
            key: 'brand',
            label: 'Brand',
            options: [],
            required: false,
            type: 'string',
          },
        ],
      },
      version: 1,
      workspaceId: 'ws-1',
    };
    const manifest = normalizeExternalProjectSyncManifest({
      adapter: 'exocorpse',
      content: { entries: [] },
      schema: {
        collections: [...snapshot.schema.collections].reverse(),
        profileFields: [
          {
            key: 'brand',
            label: 'Brand',
            type: 'string',
          },
        ],
      },
      version: 1,
    });

    expect(buildExternalProjectSyncDiff(snapshot, manifest).summary).toEqual({
      archive: 0,
      create: 0,
      delete: 0,
      noop: 0,
      update: 0,
    });
  });

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

  it('rejects multiple manifest identities claiming one collection slug', () => {
    const snapshot: ExternalProjectSyncSnapshot = {
      adapter: 'exocorpse',
      canonicalProjectId: 'exocorpse-main',
      content: {
        entries: [
          {
            collectionSlug: 'characters',
            id: 'entry-existing',
            slug: 'shared-slug',
            stableSourceId: 'legacy:character:shared-slug',
            status: 'published',
            title: 'Legacy Character',
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
            slug: 'shared-slug',
            stableSourceId: 'exocorpse:character:first',
            title: 'First Character',
          },
          {
            collectionSlug: 'characters',
            slug: 'shared-slug',
            stableSourceId: 'exocorpse:character:second',
            title: 'Second Character',
          },
        ],
      },
      schema: snapshot.schema,
      version: 1,
    });

    expect(() => buildExternalProjectSyncDiff(snapshot, manifest)).toThrow(
      'Multiple manifest entries resolve to characters/shared-slug'
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
