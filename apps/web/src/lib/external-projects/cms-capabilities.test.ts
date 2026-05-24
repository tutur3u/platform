import type {
  ExternalProjectCollection,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import { getExternalProjectCmsEditorCapabilities } from './cms-capabilities';

function makeBinding(
  overrides: Partial<WorkspaceExternalProjectBinding> = {}
): WorkspaceExternalProjectBinding {
  return {
    adapter: 'theguyser',
    canonical_id: 'canonical-1',
    canonical_project: {
      allowed_collections: [],
      allowed_features: [],
      adapter: 'theguyser',
      created_at: '2026-01-01T00:00:00Z',
      created_by: null,
      delivery_profile: {},
      display_name: 'TheGuyser',
      id: 'canonical-1',
      is_active: true,
      metadata: {},
      updated_at: '2026-01-01T00:00:00Z',
      updated_by: null,
    },
    enabled: true,
    workspace_id: 'ws-1',
    ...overrides,
  };
}

function makeCollection(
  slug: string,
  title = slug,
  collectionType = slug
): ExternalProjectCollection {
  return {
    collection_type: collectionType,
    config: {},
    created_at: '2026-01-01T00:00:00Z',
    created_by: null,
    description: null,
    id: `collection-${slug}`,
    is_enabled: true,
    slug,
    title,
    updated_at: '2026-01-01T00:00:00Z',
    updated_by: null,
    ws_id: 'ws-1',
  };
}

describe('getExternalProjectCmsEditorCapabilities', () => {
  it('builds a general editor contract from the adapter and collections', () => {
    const capabilities = getExternalProjectCmsEditorCapabilities({
      binding: makeBinding(),
      collections: [
        makeCollection('panel-content', 'Panel content'),
        makeCollection('gallery', 'Gallery'),
      ],
      fieldDefinitions: [],
    });

    expect(capabilities.appLabel).toBe('TheGuyser');
    expect(capabilities.media.supportsUploads).toBe(true);
    expect(capabilities.collectionViews.map((view) => view.id)).toEqual([
      'all',
      'collection:panel-content',
      'collection:gallery',
    ]);
  });

  it('preserves game-specific navigation without hard-coding a CMS page', () => {
    const capabilities = getExternalProjectCmsEditorCapabilities({
      binding: makeBinding({
        adapter: 'junly',
        canonical_project: {
          ...makeBinding().canonical_project!,
          adapter: 'junly',
          display_name: 'Junly',
        },
      }),
      collections: [makeCollection('game-projects', 'Game projects', 'game')],
      fieldDefinitions: [],
    });

    expect(capabilities.collectionViews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionTypes: ['game', 'games'],
          createCollection: expect.objectContaining({
            collectionType: 'game',
          }),
          id: 'games',
          label: 'Games',
        }),
      ])
    );
  });

  it('seeds Yoola taxonomy and featured-entry rules as capabilities', () => {
    const capabilities = getExternalProjectCmsEditorCapabilities({
      binding: makeBinding({
        adapter: 'yoola',
        canonical_project: {
          ...makeBinding().canonical_project!,
          adapter: 'yoola',
          display_name: 'Yoola',
        },
      }),
      collections: [makeCollection('artworks', 'Artworks')],
      fieldDefinitions: [],
    });

    expect(capabilities.taxonomies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionSlugs: ['artworks'],
          sectionSlug: 'gallery',
        }),
      ])
    );
    expect(capabilities.featuredEntryRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadataKey: 'featured',
        }),
      ])
    );
  });

  it('allows canonical metadata to override editor capabilities', () => {
    const capabilities = getExternalProjectCmsEditorCapabilities({
      binding: makeBinding({
        canonical_project: {
          ...makeBinding().canonical_project!,
          metadata: {
            cmsEditor: {
              defaultViewId: 'pages',
              navigationLabel: 'Site admin',
            },
          },
        },
      }),
      collections: [],
      fieldDefinitions: [],
    });

    expect(capabilities.defaultViewId).toBe('pages');
    expect(capabilities.navigationLabel).toBe('Site admin');
    expect(capabilities.version).toBe(1);
  });
});
