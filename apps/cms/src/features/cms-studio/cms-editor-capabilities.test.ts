import type {
  CmsEditorCapabilities,
  ExternalProjectCollection,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import {
  collectionMatchesCmsEditorView,
  getCmsEditorCollectionView,
  getCmsTaxonomyConfigForCollection,
  getCmsTaxonomySectionCollection,
  resolveCmsEditorCapabilities,
} from './cms-editor-capabilities';

function collection(
  slug: string,
  collectionType = slug,
  title = slug
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

const binding: WorkspaceExternalProjectBinding = {
  adapter: 'theguyser',
  canonical_id: 'canonical-1',
  canonical_project: null,
  enabled: true,
  workspace_id: 'ws-1',
};

describe('CMS editor capabilities', () => {
  it('resolves a local fallback contract when the platform payload is old', () => {
    const capabilities = resolveCmsEditorCapabilities({
      binding,
      collections: [collection('games', 'game'), collection('gallery')],
      fieldDefinitions: [],
      studio: null,
    });

    expect(capabilities.collectionViews.map((view) => view.id)).toEqual([
      'all',
      'landing',
      'portfolio',
      'games',
      'collection:games',
      'collection:gallery',
    ]);
  });

  it('groups proof-site landing page collections behind one editor view', () => {
    const capabilities = resolveCmsEditorCapabilities({
      binding: {
        ...binding,
        adapter: 'yoola',
      },
      collections: [
        collection('singleton-sections', 'singleton'),
        collection('artworks'),
        collection('lore-capsules'),
      ],
      fieldDefinitions: [],
      studio: null,
    });
    const landingView = getCmsEditorCollectionView(capabilities, 'landing');

    expect(
      collectionMatchesCmsEditorView(
        collection('singleton-sections', 'singleton'),
        landingView
      )
    ).toBe(true);
    expect(
      collectionMatchesCmsEditorView(collection('artworks'), landingView)
    ).toBe(false);
  });

  it('filters collections by the selected capability view', () => {
    const capabilities = resolveCmsEditorCapabilities({
      binding,
      collections: [collection('games', 'game'), collection('gallery')],
      fieldDefinitions: [],
      studio: null,
    });
    const gamesView = getCmsEditorCollectionView(capabilities, 'games');

    expect(
      collectionMatchesCmsEditorView(collection('games', 'game'), gamesView)
    ).toBe(true);
    expect(
      collectionMatchesCmsEditorView(collection('gallery'), gamesView)
    ).toBe(false);
  });

  it('uses taxonomy capability selectors instead of adapter-specific branches', () => {
    const capabilities: CmsEditorCapabilities = {
      adapter: 'yoola',
      appLabel: 'Yoola',
      collectionViews: [
        {
          id: 'all',
          includeAll: true,
          label: 'All content',
        },
      ],
      contentModel: {
        enabled: true,
        fieldDefinitionsEnabled: true,
      },
      defaultViewId: 'all',
      featuredEntryRules: [],
      media: {
        assetTypes: ['image'],
        enabled: true,
        supportsAltText: true,
        supportsCoverSelection: true,
        supportsUploads: true,
      },
      navigationLabel: 'Yoola',
      preview: {
        enabled: true,
        entryPreviewEnabled: true,
      },
      taxonomies: [
        {
          collectionSlugs: ['artworks'],
          id: 'gallery-taxonomy',
          label: 'Gallery taxonomy',
          sectionCollectionSlugs: ['singleton-sections'],
          sectionSlug: 'gallery',
          sectionTitle: 'Gallery',
        },
      ],
      version: 1,
      workflow: {
        enabled: true,
        scheduledPublishingEnabled: true,
        statuses: ['draft', 'scheduled', 'published', 'archived'],
      },
    };

    const artwork = collection('artworks');
    const singleton = collection('singleton-sections', 'singleton');
    const taxonomy = getCmsTaxonomyConfigForCollection(capabilities, artwork);

    expect(taxonomy?.sectionSlug).toBe('gallery');
    expect(
      getCmsTaxonomySectionCollection([artwork, singleton], taxonomy)
    ).toEqual(singleton);
  });
});
