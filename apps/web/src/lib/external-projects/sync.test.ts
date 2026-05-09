import type { ExternalProjectSyncSnapshot } from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import {
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
});
