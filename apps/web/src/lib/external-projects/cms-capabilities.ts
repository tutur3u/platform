import type {
  CmsEditorCapabilities,
  CmsEditorCollectionView,
  CmsEditorTaxonomyConfig,
  ExternalProjectCollection,
  ExternalProjectFieldDefinition,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS,
  EXTERNAL_PROJECT_DISPLAY_NAMES,
} from './constants';

type CapabilityInput = {
  binding: WorkspaceExternalProjectBinding;
  collections: ExternalProjectCollection[];
  fieldDefinitions: ExternalProjectFieldDefinition[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function slugToLabel(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function getConfiguredCollectionSlugs(
  binding: WorkspaceExternalProjectBinding
) {
  const adapter = binding.adapter;
  const defaultSlugs = adapter
    ? DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[adapter]
    : [];
  return dedupeStrings([
    ...defaultSlugs,
    ...(binding.canonical_project?.allowed_collections ?? []),
  ]);
}

function getViewSlugCandidates(
  collections: ExternalProjectCollection[],
  configuredSlugs: string[]
) {
  const actualSlugs = collections.map((collection) => collection.slug);
  return dedupeStrings([...configuredSlugs, ...actualSlugs]);
}

function hasGameLikeCollections(
  collections: ExternalProjectCollection[],
  configuredSlugs: string[]
) {
  return [
    ...configuredSlugs,
    ...collections.map((collection) => collection.slug),
  ]
    .join(' ')
    .toLowerCase()
    .includes('game');
}

function buildCollectionViews({
  binding,
  collections,
}: Pick<
  CapabilityInput,
  'binding' | 'collections'
>): CmsEditorCollectionView[] {
  const configuredSlugs = getConfiguredCollectionSlugs(binding);
  const slugCandidates = getViewSlugCandidates(collections, configuredSlugs);
  const views: CmsEditorCollectionView[] = [
    {
      id: 'all',
      includeAll: true,
      label: 'All content',
      navigationLabel: 'Library',
    },
  ];

  if (hasGameLikeCollections(collections, configuredSlugs)) {
    views.push({
      id: 'games',
      collectionSlugs: slugCandidates.filter((slug) =>
        slug.toLowerCase().includes('game')
      ),
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

  for (const collection of collections) {
    views.push({
      id: `collection:${collection.slug}`,
      collectionSlugs: [collection.slug],
      collectionTypes: [collection.collection_type].filter(Boolean),
      description: collection.description,
      label: collection.title || slugToLabel(collection.slug),
      navigationLabel: collection.title || slugToLabel(collection.slug),
    });
  }

  return views;
}

function buildTaxonomies(
  binding: WorkspaceExternalProjectBinding
): CmsEditorTaxonomyConfig[] {
  if (binding.adapter !== 'yoola') {
    return [];
  }

  return [
    {
      categoryField: 'categoryOptions',
      collectionSlugs: ['artworks'],
      id: 'yoola-gallery-taxonomy',
      label: 'Gallery taxonomy',
      sectionCollectionSlugs: ['singleton-sections'],
      sectionSlug: 'gallery',
      sectionTitle: 'Gallery',
      tagField: 'tagOptions',
    },
    {
      categoryField: 'categoryOptions',
      collectionSlugs: ['lore-capsules', 'writing'],
      collectionTypes: ['lore', 'writing'],
      id: 'yoola-writing-taxonomy',
      label: 'Writing taxonomy',
      sectionCollectionSlugs: ['singleton-sections'],
      sectionSlug: 'writing',
      sectionTitle: 'Writing',
      tagField: 'tagOptions',
    },
  ];
}

function getMetadataCapabilityOverride(
  binding: WorkspaceExternalProjectBinding
): Partial<CmsEditorCapabilities> {
  const metadata = asRecord(binding.canonical_project?.metadata);
  const direct = asRecord(metadata.cmsEditorCapabilities);
  const legacy = asRecord(metadata.cmsEditor);
  return {
    ...legacy,
    ...direct,
  } as Partial<CmsEditorCapabilities>;
}

function mergeCapabilities(
  base: CmsEditorCapabilities,
  override: Partial<CmsEditorCapabilities>
): CmsEditorCapabilities {
  return {
    ...base,
    ...override,
    collectionViews: Array.isArray(override.collectionViews)
      ? override.collectionViews
      : base.collectionViews,
    contentModel: {
      ...base.contentModel,
      ...asRecord(override.contentModel),
    },
    featuredEntryRules: Array.isArray(override.featuredEntryRules)
      ? override.featuredEntryRules
      : base.featuredEntryRules,
    media: {
      ...base.media,
      ...asRecord(override.media),
      assetTypes: dedupeStrings([
        ...base.media.assetTypes,
        ...asStringArray(asRecord(override.media).assetTypes),
      ]),
    },
    preview: {
      ...base.preview,
      ...asRecord(override.preview),
    },
    taxonomies: Array.isArray(override.taxonomies)
      ? override.taxonomies
      : base.taxonomies,
    version: 1,
    workflow: {
      ...base.workflow,
      ...asRecord(override.workflow),
      statuses: Array.isArray(asRecord(override.workflow).statuses)
        ? (asRecord(override.workflow)
            .statuses as CmsEditorCapabilities['workflow']['statuses'])
        : base.workflow.statuses,
    },
  };
}

export function getExternalProjectCmsEditorCapabilities({
  binding,
  collections,
}: CapabilityInput): CmsEditorCapabilities {
  const adapter = binding.adapter;
  const appLabel =
    binding.canonical_project?.display_name ||
    (adapter ? EXTERNAL_PROJECT_DISPLAY_NAMES[adapter] : 'External project');
  const base: CmsEditorCapabilities = {
    adapter,
    appLabel,
    collectionViews: buildCollectionViews({ binding, collections }),
    contentModel: {
      enabled: true,
      fieldDefinitionsEnabled: true,
    },
    defaultViewId: 'all',
    featuredEntryRules:
      adapter === 'yoola'
        ? [
            {
              collectionSlugs: ['artworks'],
              id: 'yoola-featured-artwork',
              label: 'Featured artwork',
              maxItems: 1,
              metadataKey: 'featured',
            },
          ]
        : [],
    media: {
      assetTypes: ['image', 'video', 'audio', 'file'],
      enabled: true,
      supportsAltText: true,
      supportsCoverSelection: true,
      supportsUploads: true,
    },
    navigationLabel: appLabel,
    preview: {
      enabled: true,
      entryPreviewEnabled: true,
    },
    taxonomies: buildTaxonomies(binding),
    version: 1,
    workflow: {
      enabled: true,
      scheduledPublishingEnabled: true,
      statuses: ['draft', 'scheduled', 'published', 'archived'],
    },
  };

  return mergeCapabilities(base, getMetadataCapabilityOverride(binding));
}
