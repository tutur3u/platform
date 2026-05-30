import type {
  CmsEditorCapabilities,
  CmsEditorCollectionView,
  CmsEditorTaxonomyConfig,
  ExternalProjectCollection,
  ExternalProjectFieldDefinition,
  ExternalProjectStudioData,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { getCmsEditorBlueprintViews } from './cms-editor-blueprints';
import { isGameLikeCollection } from './cms-games-shared';

type ResolveInput = {
  binding: WorkspaceExternalProjectBinding;
  collections: ExternalProjectCollection[];
  fieldDefinitions: ExternalProjectFieldDefinition[];
  studio?: ExternalProjectStudioData | null;
};

function slugToLabel(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function collectionMatchesSelector(
  collection: ExternalProjectCollection,
  selector: {
    collectionSlugs?: string[];
    collectionTypes?: string[];
  }
) {
  const slug = collection.slug.toLowerCase();
  const type = collection.collection_type.toLowerCase();
  const slugMatch = selector.collectionSlugs?.some(
    (candidate) => candidate.toLowerCase() === slug
  );
  const typeMatch = selector.collectionTypes?.some(
    (candidate) => candidate.toLowerCase() === type
  );

  return Boolean(slugMatch || typeMatch);
}

export function resolveCmsEditorCapabilities({
  binding,
  collections,
  studio,
}: ResolveInput): CmsEditorCapabilities {
  if (studio?.cmsCapabilities) {
    return studio.cmsCapabilities;
  }

  const blueprintViews = getCmsEditorBlueprintViews(binding.adapter);
  const collectionViews: CmsEditorCollectionView[] = [
    {
      id: 'all',
      includeAll: true,
      label: 'All content',
      navigationLabel: 'Library',
    },
    ...blueprintViews,
    ...collections.map((collection) => ({
      id: `collection:${collection.slug}`,
      collectionSlugs: [collection.slug],
      collectionTypes: [collection.collection_type],
      description: collection.description,
      label: collection.title || slugToLabel(collection.slug),
      navigationLabel: collection.title || slugToLabel(collection.slug),
    })),
  ];

  if (collections.some(isGameLikeCollection)) {
    collectionViews.splice(1 + blueprintViews.length, 0, {
      id: 'games',
      collectionSlugs: collections
        .filter(isGameLikeCollection)
        .map((collection) => collection.slug),
      collectionTypes: ['game', 'games'],
      createCollection: {
        collectionType: 'game',
        description: 'Playable projects and game pages.',
        emptyHint:
          'Create a games collection and start adding playable project entries.',
        entryTitle: 'Untitled game',
        slug: 'games',
        title: 'Games',
      },
      label: 'Games',
      navigationLabel: 'Games',
    });
  }

  return {
    adapter: binding.adapter,
    appLabel:
      binding.canonical_project?.display_name ??
      binding.adapter ??
      'External project',
    collectionViews,
    contentModel: {
      enabled: true,
      fieldDefinitionsEnabled: true,
    },
    defaultViewId: 'all',
    featuredEntryRules: [],
    media: {
      assetTypes: ['image', 'video', 'audio', 'file'],
      enabled: true,
      supportsAltText: true,
      supportsCoverSelection: true,
      supportsUploads: true,
    },
    navigationLabel:
      binding.canonical_project?.display_name ??
      binding.adapter ??
      'External project',
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
  };
}

export function getCmsEditorCollectionView(
  capabilities: CmsEditorCapabilities,
  viewId: string | undefined
) {
  const requestedViewId = viewId || capabilities.defaultViewId;
  return (
    capabilities.collectionViews.find((view) => view.id === requestedViewId) ??
    capabilities.collectionViews.find((view) => view.id === 'all') ??
    capabilities.collectionViews[0] ??
    null
  );
}

export function collectionMatchesCmsEditorView(
  collection: ExternalProjectCollection,
  view: CmsEditorCollectionView | null
) {
  if (!view || view.includeAll) {
    return true;
  }

  if (view.id === 'games') {
    return (
      isGameLikeCollection(collection) ||
      collectionMatchesSelector(collection, view)
    );
  }

  return collectionMatchesSelector(collection, view);
}

export function getCmsTaxonomyConfigForCollection(
  capabilities: CmsEditorCapabilities,
  collection: ExternalProjectCollection | null
): CmsEditorTaxonomyConfig | null {
  if (!collection) {
    return null;
  }

  return (
    capabilities.taxonomies.find((taxonomy) =>
      collectionMatchesSelector(collection, taxonomy)
    ) ?? null
  );
}

export function getCmsTaxonomySectionCollection(
  collections: ExternalProjectCollection[],
  taxonomy: CmsEditorTaxonomyConfig | null
) {
  if (!taxonomy) {
    return null;
  }

  return (
    collections.find((collection) =>
      collectionMatchesSelector(collection, {
        collectionSlugs: taxonomy.sectionCollectionSlugs,
        collectionTypes: taxonomy.sectionCollectionTypes,
      })
    ) ?? null
  );
}
