import type {
  ExternalProjectCollection,
  ExternalProjectFieldDefinition,
  ExternalProjectFieldScope,
  ExternalProjectFieldType,
  ExternalProjectSyncCollectionSchema,
  Json,
} from '@tuturuuu/types';
import type { CmsStrings } from './cms-strings';

export type CmsTemplateField = {
  default_value?: Json | null;
  description?: string | null;
  field_scope: ExternalProjectFieldScope;
  field_type: ExternalProjectFieldType;
  is_required?: boolean;
  key: string;
  label: string;
  options?: string[];
};

export type CmsContentModelTemplate = {
  assetTypes: string[];
  blockTypes: string[];
  collection_type: string;
  description: string;
  fields: CmsTemplateField[];
  id: string;
  slug: string;
  title: string;
};

export const CMS_SUPPORTED_ENTRY_ASSET_TYPES = ['image', 'audio'] as const;

export type CmsSupportedEntryAssetType =
  (typeof CMS_SUPPORTED_ENTRY_ASSET_TYPES)[number];

const CMS_SUPPORTED_ENTRY_ASSET_TYPE_SET = new Set<string>(
  CMS_SUPPORTED_ENTRY_ASSET_TYPES
);

export function buildCmsContentModelTemplates(
  strings: CmsStrings
): CmsContentModelTemplate[] {
  return [
    {
      assetTypes: [],
      blockTypes: ['markdown'],
      collection_type: 'profile',
      description: strings.templateProfileDescription,
      fields: [
        {
          field_scope: 'profile_data',
          field_type: 'string',
          is_required: true,
          key: 'displayName',
          label: strings.fieldDisplayNameLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'tagline',
          label: strings.fieldTaglineLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'location',
          label: strings.fieldLocationLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string-array',
          key: 'featuredGallerySlugs',
          label: strings.fieldFeaturedGallerySlugsLabel,
        },
      ],
      id: 'profile',
      slug: 'profile',
      title: strings.templateProfileTitle,
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'blog-posts',
      description: strings.templateBlogDescription,
      fields: [
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'author',
          label: strings.fieldAuthorLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'date',
          key: 'publishedOn',
          label: strings.fieldPublishedOnLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string-array',
          key: 'tags',
          label: strings.tagsLabel,
        },
        {
          field_scope: 'metadata',
          field_type: 'markdown',
          key: 'seoDescription',
          label: strings.fieldSeoDescriptionLabel,
        },
      ],
      id: 'blog-posts',
      slug: 'blog-posts',
      title: strings.templateBlogTitle,
    },
    {
      assetTypes: ['audio'],
      blockTypes: ['markdown'],
      collection_type: 'voice-reels',
      description: strings.templateAudioReelsDescription,
      fields: [
        {
          default_value: 'Voice reel',
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'category',
          label: strings.categoryLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'duration',
          label: strings.fieldDurationLabel,
        },
        {
          default_value: false,
          field_scope: 'profile_data',
          field_type: 'boolean',
          key: 'featured',
          label: strings.fieldFeaturedLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'style',
          label: strings.fieldStyleLabel,
        },
        {
          default_value: 'Download',
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'downloadLabel',
          label: strings.fieldDownloadLabel,
        },
      ],
      id: 'voice-reels',
      slug: 'voice-reels',
      title: strings.templateAudioReelsTitle,
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'gallery',
      description: strings.templateGalleryDescription,
      fields: [
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'medium',
          label: strings.fieldMediumLabel,
          options: ['digital', 'tattoo', 'flash', 'commission'],
        },
        {
          field_scope: 'profile_data',
          field_type: 'string-array',
          key: 'style',
          label: strings.fieldStyleLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'date',
          key: 'completedOn',
          label: strings.fieldCompletedOnLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'boolean',
          key: 'featured',
          label: strings.fieldFeaturedLabel,
        },
      ],
      id: 'gallery',
      slug: 'gallery',
      title: strings.templateGalleryTitle,
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'shop-products',
      description: strings.templateShopDescription,
      fields: [
        {
          field_scope: 'profile_data',
          field_type: 'number',
          key: 'price',
          label: strings.fieldPriceLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'currency',
          label: strings.fieldCurrencyLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'boolean',
          key: 'available',
          label: strings.fieldAvailableLabel,
        },
        {
          field_scope: 'metadata',
          field_type: 'string',
          key: 'sku',
          label: strings.fieldSkuLabel,
        },
      ],
      id: 'shop-products',
      slug: 'shop-products',
      title: strings.templateShopTitle,
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'writing-worlds',
      description: strings.templateWritingDescription,
      fields: [
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'genre',
          label: strings.fieldGenreLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'status',
          label: strings.fieldWritingStatusLabel,
          options: ['drafting', 'revising', 'published'],
        },
        {
          field_scope: 'profile_data',
          field_type: 'string-array',
          key: 'contentWarnings',
          label: strings.fieldContentWarningsLabel,
        },
      ],
      id: 'writing-worlds',
      slug: 'writing-worlds',
      title: strings.templateWritingTitle,
    },
    {
      assetTypes: [],
      blockTypes: [],
      collection_type: 'social-links',
      description: strings.templateSocialDescription,
      fields: [
        {
          field_scope: 'profile_data',
          field_type: 'string',
          is_required: true,
          key: 'url',
          label: strings.fieldUrlLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'platform',
          label: strings.fieldPlatformLabel,
        },
        {
          field_scope: 'profile_data',
          field_type: 'boolean',
          key: 'isPrimary',
          label: strings.fieldPrimaryLinkLabel,
        },
      ],
      id: 'social-links',
      slug: 'social-links',
      title: strings.templateSocialTitle,
    },
  ];
}

export function buildCollectionSchemaFromTemplate(
  template: CmsContentModelTemplate
): ExternalProjectSyncCollectionSchema {
  return {
    assetTypes: template.assetTypes,
    blockTypes: template.blockTypes,
    collection_type: template.collection_type,
    description: template.description,
    metadataFields: template.fields
      .filter((field) => field.field_scope === 'metadata')
      .map(templateFieldToSyncField),
    profileFields: template.fields
      .filter((field) => field.field_scope === 'profile_data')
      .map(templateFieldToSyncField),
    slug: template.slug,
    title: template.title,
  };
}

export function buildCollectionConfigFromTemplate(
  template: CmsContentModelTemplate,
  currentConfig?: Json | null
): Json {
  const baseConfig =
    currentConfig &&
    typeof currentConfig === 'object' &&
    !Array.isArray(currentConfig)
      ? currentConfig
      : {};

  return {
    ...baseConfig,
    schema: buildCollectionSchemaFromTemplate(template),
  } as Json;
}

export function templateFieldToSyncField(field: CmsTemplateField) {
  return {
    defaultValue: field.default_value ?? undefined,
    key: field.key,
    label: field.label,
    options: field.options,
    required: field.is_required,
    type: field.field_type,
  };
}

export function getCollectionSchema(
  collection: ExternalProjectCollection | null | undefined
) {
  const config = collection?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return null;
  }

  const schema = (config as Record<string, unknown>).schema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return null;
  }

  return schema as ExternalProjectSyncCollectionSchema;
}

export function getCollectionFieldDefinitions({
  collection,
  fieldDefinitions,
  includeGlobal = true,
}: {
  collection: ExternalProjectCollection | null | undefined;
  fieldDefinitions: ExternalProjectFieldDefinition[];
  includeGlobal?: boolean;
}) {
  if (!collection) {
    return [];
  }

  return fieldDefinitions
    .filter(
      (definition) =>
        definition.is_enabled &&
        (definition.collection_id === collection.id ||
          (includeGlobal && definition.collection_id === null))
    )
    .sort((left, right) => {
      if (left.collection_id === null && right.collection_id !== null) {
        return -1;
      }
      if (left.collection_id !== null && right.collection_id === null) {
        return 1;
      }

      const orderDiff = left.sort_order - right.sort_order;
      return orderDiff === 0
        ? left.created_at.localeCompare(right.created_at)
        : orderDiff;
    });
}

export function getContentModelTemplateStatus({
  collections,
  fieldDefinitions,
  template,
}: {
  collections: ExternalProjectCollection[];
  fieldDefinitions: ExternalProjectFieldDefinition[];
  template: CmsContentModelTemplate;
}) {
  const collection =
    collections.find((candidate) => candidate.slug === template.slug) ?? null;
  const existingKeys = new Set(
    fieldDefinitions
      .filter((definition) => definition.collection_id === collection?.id)
      .map((definition) => `${definition.field_scope}:${definition.key}`)
  );
  const missingFields = collection
    ? template.fields.filter(
        (field) => !existingKeys.has(`${field.field_scope}:${field.key}`)
      )
    : template.fields;

  return {
    collection,
    installed: Boolean(collection && missingFields.length === 0),
    missingFields,
  };
}

export function supportsMarkdownBodyFromSchema(
  collection: ExternalProjectCollection | null | undefined
) {
  return (
    getCollectionSchema(collection)?.blockTypes?.includes('markdown') ?? false
  );
}

export function getSupportedAssetTypesFromSchema(
  collection: ExternalProjectCollection | null | undefined
) {
  const schema = getCollectionSchema(collection);
  if (!schema || !('assetTypes' in schema)) {
    return ['image'] satisfies CmsSupportedEntryAssetType[];
  }

  return (schema.assetTypes ?? []).filter(
    (assetType): assetType is CmsSupportedEntryAssetType =>
      CMS_SUPPORTED_ENTRY_ASSET_TYPE_SET.has(assetType)
  );
}

export function supportsAssetTypeFromSchema(
  collection: ExternalProjectCollection | null | undefined,
  assetType: CmsSupportedEntryAssetType
) {
  return getSupportedAssetTypesFromSchema(collection).includes(assetType);
}

export function supportsImageAssetsFromSchema(
  collection: ExternalProjectCollection | null | undefined
) {
  return supportsAssetTypeFromSchema(collection, 'image');
}

export function supportsAudioAssetsFromSchema(
  collection: ExternalProjectCollection | null | undefined
) {
  return supportsAssetTypeFromSchema(collection, 'audio');
}

export function buildDefaultFieldValues(
  fieldDefinitions: ExternalProjectFieldDefinition[]
) {
  return Object.fromEntries(
    fieldDefinitions
      .filter((definition) => definition.default_value !== null)
      .map((definition) => [definition.key, definition.default_value])
  );
}
