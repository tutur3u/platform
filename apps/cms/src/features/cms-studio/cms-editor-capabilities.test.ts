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
      'library',
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

  it('keeps landing sections out of the default library surface', () => {
    const capabilities = resolveCmsEditorCapabilities({
      binding,
      collections: [
        collection('site-config'),
        collection('panel-content'),
        collection('experience'),
        collection('games', 'game'),
      ],
      fieldDefinitions: [],
      studio: null,
    });
    const landingView = getCmsEditorCollectionView(capabilities, 'landing');
    const libraryView = getCmsEditorCollectionView(capabilities, 'library');

    expect(
      collectionMatchesCmsEditorView(collection('panel-content'), landingView)
    ).toBe(true);
    expect(
      collectionMatchesCmsEditorView(collection('panel-content'), libraryView)
    ).toBe(false);
    expect(
      collectionMatchesCmsEditorView(collection('games', 'game'), libraryView)
    ).toBe(false);
    expect(
      collectionMatchesCmsEditorView(collection('experience'), libraryView)
    ).toBe(true);
  });

  it('groups Exocorpse content into task-based CMS surfaces', () => {
    const capabilities = resolveCmsEditorCapabilities({
      binding: {
        ...binding,
        adapter: 'exocorpse',
      },
      collections: [
        collection('about'),
        collection('about-faqs'),
        collection('stories'),
        collection('characters'),
        collection('portfolio-art'),
        collection('commission-services'),
        collection('heaven-space-scenes'),
        collection('cofi-samples'),
      ],
      fieldDefinitions: [],
      studio: null,
    });

    expect(capabilities.collectionViews.map((view) => view.id)).toEqual([
      'all',
      'landing',
      'library',
      'wiki',
      'portfolio',
      'writing',
      'commissions',
      'heaven-space',
      'reference',
      'collection:about',
      'collection:about-faqs',
      'collection:stories',
      'collection:characters',
      'collection:portfolio-art',
      'collection:commission-services',
      'collection:heaven-space-scenes',
      'collection:cofi-samples',
    ]);

    const landingView = getCmsEditorCollectionView(capabilities, 'landing');
    const wikiView = getCmsEditorCollectionView(capabilities, 'wiki');
    const commissionView = getCmsEditorCollectionView(
      capabilities,
      'commissions'
    );

    expect(
      collectionMatchesCmsEditorView(collection('about'), landingView)
    ).toBe(true);
    expect(
      collectionMatchesCmsEditorView(collection('characters'), wikiView)
    ).toBe(true);
    expect(
      collectionMatchesCmsEditorView(
        collection('commission-services'),
        commissionView
      )
    ).toBe(true);
  });

  it('adds route-specific views when the platform payload does not provide them yet', () => {
    const capabilities = resolveCmsEditorCapabilities({
      binding,
      collections: [collection('site-config'), collection('experience')],
      fieldDefinitions: [],
      studio: {
        assets: [],
        blocks: [],
        cmsCapabilities: {
          adapter: 'theguyser',
          appLabel: 'TheGuyser',
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
          navigationLabel: 'TheGuyser',
          preview: {
            enabled: true,
            entryPreviewEnabled: true,
          },
          taxonomies: [],
          version: 1,
          workflow: {
            enabled: true,
            scheduledPublishingEnabled: true,
            statuses: ['draft', 'scheduled', 'published', 'archived'],
          },
        },
        collections: [],
        entries: [],
        fieldDefinitions: [],
        importJobs: [],
        loadingData: null,
        publishEvents: [],
      },
    });

    expect(capabilities.collectionViews.map((view) => view.id)).toContain(
      'landing'
    );
    expect(capabilities.collectionViews.map((view) => view.id)).toContain(
      'library'
    );
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
