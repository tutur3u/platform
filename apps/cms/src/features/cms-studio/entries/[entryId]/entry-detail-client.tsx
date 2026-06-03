'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import {
  createWorkspaceExternalProjectAsset,
  createWorkspaceExternalProjectBlock,
  createWorkspaceExternalProjectEntry,
  deleteWorkspaceExternalProjectAsset,
  deleteWorkspaceExternalProjectEntry,
  duplicateWorkspaceExternalProjectEntry,
  publishWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectAsset,
  updateWorkspaceExternalProjectBlock,
  updateWorkspaceExternalProjectEntry,
  uploadWorkspaceExternalProjectAssetFile,
  uploadWorkspaceExternalProjectWebglPackageFile,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
  ExternalProjectStudioData,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CmsSupportedEntryAssetType,
  getCollectionFieldDefinitions,
  getSupportedAssetTypesFromSchema,
  supportsMarkdownBodyFromSchema,
} from '../../cms-content-model';
import { isGameLikeCollection } from '../../cms-games-shared';
import {
  optimizeCmsMediaUpload,
  readCmsAudioUploadMetadata,
} from '../../cms-media-upload';
import {
  getCmsEntryPath,
  getCmsLibraryPath,
  getCmsWorkspaceBasePath,
} from '../../cms-paths';
import type { CmsStrings } from '../../cms-strings';
import { useCmsLivePreview } from '../../use-cms-live-preview';
import { getCmsStudioQueryKey, useCmsStudio } from '../../use-cms-studio';
import { EntryDetailConfirmDialogs } from './entry-detail-confirm-dialogs';
import { EntryDetailHeader } from './entry-detail-header';
import { EntryDetailLoadingState } from './entry-detail-loading-state';
import { EntryDetailMainColumn } from './entry-detail-main-column';
import { EntryDetailPreviewSheet } from './entry-detail-preview-sheet';
import { EntryDetailSchemaFieldsCard } from './entry-detail-schema-fields-card';
import {
  buildEntryFormState,
  type FeaturedEntryEditorConfig,
  type FeaturedPlacementConfig,
  fromDateTimeLocalValue,
  getEntryDescriptionEditorContent,
  getMarkdownBlockContent,
  parseEntryDescriptionContent,
  serializeEntryDescriptionContent,
  sortEntryAssetsByType,
  sortImageAssets,
  toStudioAsset,
} from './entry-detail-shared';
import { EntryDetailSidebar } from './entry-detail-sidebar';
import { EntryDetailUploadInputs } from './entry-detail-upload-inputs';
import type { EntryDetailUploadProgressItem } from './entry-detail-upload-progress';

function getUploadProgressId(
  scope: EntryDetailUploadProgressItem['scope'],
  file: File,
  index = 0
) {
  return `${scope}:${file.name}:${file.size}:${file.lastModified}:${index}`;
}

function clampUploadPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const AUDIO_UPLOAD_MIME_TYPES = [
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
];

const AUDIO_UPLOAD_EXTENSIONS = [
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.mp4',
  '.oga',
  '.ogg',
  '.wav',
  '.webm',
];

function getFilenameExtension(filename: string) {
  const normalized = filename.toLowerCase();
  const index = normalized.lastIndexOf('.');
  return index === -1 ? '' : normalized.slice(index);
}

function getMediaInputAccept(assetTypes: CmsSupportedEntryAssetType[]) {
  const accept = new Set<string>();

  if (assetTypes.includes('image')) {
    accept.add('image/*');
  }

  if (assetTypes.includes('audio')) {
    AUDIO_UPLOAD_MIME_TYPES.forEach((type) => {
      accept.add(type);
    });
    AUDIO_UPLOAD_EXTENSIONS.forEach((extension) => {
      accept.add(extension);
    });
  }

  return [...accept].join(',');
}

function resolveUploadAssetType(
  file: File,
  supportedAssetTypes: CmsSupportedEntryAssetType[]
): CmsSupportedEntryAssetType | null {
  const extension = getFilenameExtension(file.name);

  if (
    supportedAssetTypes.includes('image') &&
    (file.type.startsWith('image/') ||
      ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'].includes(
        extension
      ))
  ) {
    return 'image';
  }

  if (
    supportedAssetTypes.includes('audio') &&
    (file.type.startsWith('audio/') ||
      AUDIO_UPLOAD_EXTENSIONS.includes(extension))
  ) {
    return 'audio';
  }

  return supportedAssetTypes.length === 1
    ? (supportedAssetTypes[0] ?? null)
    : null;
}

function getCmsPublicWebglPlayerPath(
  pathname: string,
  input: {
    assetId: string;
    workspaceId: string;
  }
) {
  const [firstSegment] = pathname.split('/').filter(Boolean);
  const localePrefix =
    firstSegment === 'en' || firstSegment === 'vi' ? `/${firstSegment}` : '';

  return `${localePrefix}/play/${input.workspaceId}/webgl/${input.assetId}`;
}

function mergeAssetCaptionMetadata(
  asset: ExternalProjectStudioAsset,
  caption: string
): Json {
  const nextMetadata =
    asset.metadata &&
    typeof asset.metadata === 'object' &&
    !Array.isArray(asset.metadata)
      ? { ...(asset.metadata as Record<string, unknown>) }
      : {};

  if (caption.trim()) {
    nextMetadata.caption = caption.trim();
  } else {
    delete nextMetadata.caption;
  }

  return nextMetadata as Json;
}

function asProfileDataRecord(
  value: ExternalProjectEntry['profile_data'] | null | undefined
) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeEntryCategory(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEntryTags(value: unknown) {
  return dedupeStrings(asStringArray(value));
}

function normalizeTaxonomyOptions(value: unknown) {
  return dedupeStrings(
    asStringArray(value)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function mergeTaxonomyOptions(current: string[], additions: string[]) {
  return dedupeStrings([
    ...current,
    ...additions.map((value) => value.trim()).filter(Boolean),
  ]);
}

function parseTaxonomyDraft(value: string) {
  return dedupeStrings(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function mergeSchemaFieldValues(
  base: Record<string, unknown>,
  schemaValues: Record<string, unknown>,
  definitions: ReturnType<typeof getCollectionFieldDefinitions>,
  scope: 'metadata' | 'profile_data'
) {
  const next = { ...base };

  for (const definition of definitions) {
    if (definition.field_scope !== scope) {
      continue;
    }

    if (Object.hasOwn(schemaValues, definition.key)) {
      next[definition.key] = schemaValues[definition.key];
    } else {
      delete next[definition.key];
    }
  }

  return next;
}

function getFeaturedProfileSlugs(
  profileData: Record<string, unknown>,
  keys: string[]
) {
  return dedupeStrings(keys.flatMap((key) => asStringArray(profileData[key])));
}

function mergeFeaturedProfileData({
  featuredKey,
  nextSlugs,
  profileData,
  resetKeys,
}: {
  featuredKey: string;
  nextSlugs: string[];
  profileData: Record<string, unknown>;
  resetKeys: string[];
}) {
  const nextProfileData = { ...profileData };

  for (const key of resetKeys) {
    delete nextProfileData[key];
  }

  if (nextSlugs.length > 0) {
    nextProfileData[featuredKey] = nextSlugs;
  }

  return nextProfileData;
}

export function EntryDetailClient({
  binding,
  cmsGamesEnabled = false,
  entryId,
  initialStudio,
  onDeleted,
  onEntryChange,
  onOpenChange,
  open,
  strings,
  variant = 'page',
  workspaceId,
}: {
  binding: WorkspaceExternalProjectBinding;
  cmsGamesEnabled?: boolean;
  entryId: string;
  initialStudio?: ExternalProjectStudioData;
  onDeleted?: () => void;
  onEntryChange?: (entryId: string) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  strings: CmsStrings;
  variant?: 'dialog' | 'page';
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const webglInputRef = useRef<HTMLInputElement | null>(null);
  const studioQuery = useCmsStudio({
    initialData: initialStudio ? { ...initialStudio, binding } : undefined,
    workspaceId,
  });
  const studio = studioQuery.data;
  const entries = studio?.entries ?? initialStudio?.entries ?? [];
  const assets = studio?.assets ?? initialStudio?.assets ?? [];
  const blocks = studio?.blocks ?? initialStudio?.blocks ?? [];
  const collections = studio?.collections ?? initialStudio?.collections ?? [];
  const fieldDefinitions =
    studio?.fieldDefinitions ?? initialStudio?.fieldDefinitions ?? [];
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [deleteEntryDialogOpen, setDeleteEntryDialogOpen] = useState(false);
  const [deleteMediaDialogOpen, setDeleteMediaDialogOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [uploadProgressById, setUploadProgressById] = useState<
    Record<string, EntryDetailUploadProgressItem>
  >({});
  const [assetCaptions, setAssetCaptions] = useState<Record<string, string>>(
    {}
  );
  const activeEntry = entries.find((entry) => entry.id === entryId) ?? null;
  const activeCollection =
    collections.find(
      (collection) => collection.id === activeEntry?.collection_id
    ) ?? null;
  const activeFieldDefinitions = useMemo(
    () =>
      getCollectionFieldDefinitions({
        collection: activeCollection,
        fieldDefinitions,
      }),
    [activeCollection, fieldDefinitions]
  );
  const supportedAssetTypes = useMemo(
    () => getSupportedAssetTypesFromSchema(activeCollection),
    [activeCollection]
  );
  const mediaInputAccept = useMemo(
    () => getMediaInputAccept(supportedAssetTypes),
    [supportedAssetTypes]
  );
  const imageAssets = useMemo(
    () => sortImageAssets(assets, entryId),
    [assets, entryId]
  );
  const audioAssets = useMemo(
    () => sortEntryAssetsByType(assets, entryId, 'audio'),
    [assets, entryId]
  );
  const mediaAssets = useMemo(
    () => [...imageAssets, ...audioAssets],
    [audioAssets, imageAssets]
  );
  const webglPackageAsset = useMemo(
    () =>
      assets.find(
        (asset) =>
          asset.entry_id === entryId && asset.asset_type === 'webgl-package'
      ) ?? null,
    [assets, entryId]
  );
  const markdownBlock = useMemo(
    () =>
      blocks
        .filter(
          (block) =>
            block.entry_id === entryId && block.block_type === 'markdown'
        )
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null,
    [blocks, entryId]
  );
  const coverAsset = imageAssets[0] ?? null;
  const supportsWebglPackage = Boolean(
    cmsGamesEnabled &&
      activeCollection &&
      isGameLikeCollection(activeCollection)
  );
  const webglPackagePlayerPath = webglPackageAsset
    ? `${getCmsWorkspaceBasePath(pathname)}/library/entries/${entryId}/webgl/${webglPackageAsset.id}`
    : null;
  const webglPackagePublicPlayerPath =
    webglPackageAsset && activeEntry?.status === 'published'
      ? getCmsPublicWebglPlayerPath(pathname, {
          assetId: webglPackageAsset.id,
          workspaceId,
        })
      : null;
  const artworkCollection =
    collections.find((collection) => collection.slug === 'artworks') ?? null;
  const loreCollection =
    collections.find((collection) =>
      /lore|writing/.test(
        [collection.slug, collection.collection_type, collection.title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      )
    ) ?? null;
  const artworkOptions = useMemo(
    () =>
      artworkCollection
        ? entries.filter(
            (entry) => entry.collection_id === artworkCollection.id
          )
        : [],
    [artworkCollection, entries]
  );
  const loreOptions = useMemo(
    () =>
      loreCollection
        ? entries.filter((entry) => entry.collection_id === loreCollection.id)
        : [],
    [entries, loreCollection]
  );
  const singletonSectionCollection =
    collections.find((collection) =>
      /singleton|section/.test(
        [collection.slug, collection.collection_type, collection.title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      )
    ) ?? null;
  const singletonSectionEntries = useMemo(
    () =>
      singletonSectionCollection
        ? entries.filter(
            (entry) => entry.collection_id === singletonSectionCollection.id
          )
        : [],
    [entries, singletonSectionCollection]
  );
  const singletonSectionEntryBySlug = useMemo(
    () =>
      new Map(
        singletonSectionEntries.map((entry) => [entry.slug, entry] as const)
      ),
    [singletonSectionEntries]
  );
  const [entryForm, setEntryForm] = useState(() =>
    activeEntry ? buildEntryFormState(activeEntry) : null
  );
  const [schemaProfileData, setSchemaProfileData] = useState<
    Record<string, unknown>
  >(() => asProfileDataRecord(activeEntry?.profile_data));
  const [schemaMetadata, setSchemaMetadata] = useState<Record<string, unknown>>(
    () => asProfileDataRecord(activeEntry?.metadata)
  );
  const [categoryDraft, setCategoryDraft] = useState('');
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagCreateOpen, setTagCreateOpen] = useState(false);
  const [descriptionContent, setDescriptionContent] =
    useState<JSONContent | null>(() =>
      getEntryDescriptionEditorContent(activeEntry?.summary)
    );
  const [coverAltText, setCoverAltText] = useState(
    coverAsset?.alt_text ?? activeEntry?.title ?? ''
  );
  const [bodyMarkdown, setBodyMarkdown] = useState(() =>
    getMarkdownBlockContent(markdownBlock)
  );
  const [pairedArtworkSlug, setPairedArtworkSlug] = useState(() => {
    const profileData = asProfileDataRecord(activeEntry?.profile_data);

    return typeof profileData.artworkSlug === 'string'
      ? profileData.artworkSlug
      : '__none__';
  });
  const isSingletonSectionEntry = /singleton|section/.test(
    [activeCollection?.slug, activeCollection?.collection_type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  );
  const taxonomySectionConfig = useMemo(() => {
    if (!activeEntry) {
      return null;
    }

    if (isSingletonSectionEntry && activeEntry.slug === 'gallery') {
      return {
        isConfigEditor: true,
        sectionEntry: activeEntry,
        sectionSlug: 'gallery',
        sectionTitle: 'Gallery',
      };
    }

    if (isSingletonSectionEntry && activeEntry.slug === 'writing') {
      return {
        isConfigEditor: true,
        sectionEntry: activeEntry,
        sectionSlug: 'writing',
        sectionTitle: 'Writing',
      };
    }

    if (
      activeCollection?.id === artworkCollection?.id &&
      singletonSectionCollection
    ) {
      return {
        isConfigEditor: false,
        sectionEntry: singletonSectionEntryBySlug.get('gallery') ?? null,
        sectionSlug: 'gallery',
        sectionTitle: 'Gallery',
      };
    }

    if (
      activeCollection?.id === loreCollection?.id &&
      singletonSectionCollection
    ) {
      return {
        isConfigEditor: false,
        sectionEntry: singletonSectionEntryBySlug.get('writing') ?? null,
        sectionSlug: 'writing',
        sectionTitle: 'Writing',
      };
    }

    return null;
  }, [
    activeCollection?.id,
    activeEntry,
    artworkCollection?.id,
    isSingletonSectionEntry,
    loreCollection?.id,
    singletonSectionCollection,
    singletonSectionEntryBySlug,
  ]);
  const isTaxonomyConfigEditor = taxonomySectionConfig?.isConfigEditor ?? false;
  const initialConfiguredCategories = useMemo(
    () =>
      normalizeTaxonomyOptions(
        asProfileDataRecord(taxonomySectionConfig?.sectionEntry?.profile_data)
          .categoryOptions
      ),
    [taxonomySectionConfig?.sectionEntry?.profile_data]
  );
  const initialConfiguredTags = useMemo(
    () =>
      normalizeTaxonomyOptions(
        asProfileDataRecord(taxonomySectionConfig?.sectionEntry?.profile_data)
          .tagOptions
      ),
    [taxonomySectionConfig?.sectionEntry?.profile_data]
  );
  const [configuredCategoryOptions, setConfiguredCategoryOptions] = useState<
    string[]
  >([]);
  const [configuredTagOptions, setConfiguredTagOptions] = useState<string[]>(
    []
  );
  const featuredEntryConfig = useMemo<FeaturedEntryEditorConfig | null>(() => {
    if (!isSingletonSectionEntry || !activeEntry) {
      return null;
    }

    if (activeEntry.slug === 'gallery' && artworkOptions.length > 0) {
      return {
        cleanupKeys: [
          'featuredArtworkSlugs',
          'carouselArtworkSlugs',
          'featuredSlugs',
        ],
        description: strings.featuredGalleryEntriesDescription,
        key: 'featuredArtworkSlugs',
        options: artworkOptions,
        title: strings.featuredGalleryEntriesLabel,
      };
    }

    if (activeEntry.slug === 'writing' && loreOptions.length > 0) {
      return {
        cleanupKeys: [
          'featuredEntrySlugs',
          'featuredLoreSlugs',
          'carouselEntrySlugs',
          'carouselLoreSlugs',
          'featuredSlugs',
        ],
        description: strings.featuredWritingEntriesDescription,
        key: 'featuredEntrySlugs',
        options: loreOptions,
        title: strings.featuredWritingEntriesLabel,
      };
    }

    return null;
  }, [
    activeEntry,
    artworkOptions,
    isSingletonSectionEntry,
    loreOptions,
    strings.featuredGalleryEntriesDescription,
    strings.featuredGalleryEntriesLabel,
    strings.featuredWritingEntriesDescription,
    strings.featuredWritingEntriesLabel,
  ]);
  const initialFeaturedEntrySlugs = useMemo(() => {
    if (!featuredEntryConfig) {
      return [];
    }

    const optionSlugs = new Set(
      featuredEntryConfig.options.map((entry) => entry.slug)
    );

    return getFeaturedProfileSlugs(
      asProfileDataRecord(activeEntry?.profile_data),
      featuredEntryConfig.cleanupKeys
    ).filter((slug) => optionSlugs.has(slug));
  }, [activeEntry?.profile_data, featuredEntryConfig]);
  const [featuredEntrySlugs, setFeaturedEntrySlugs] = useState<string[]>([]);
  const featuredPlacementConfig =
    useMemo<FeaturedPlacementConfig | null>(() => {
      if (!activeEntry || !activeCollection || !singletonSectionCollection) {
        return null;
      }

      if (activeCollection.id === artworkCollection?.id) {
        return {
          cleanupKeys: [
            'featuredArtworkSlugs',
            'carouselArtworkSlugs',
            'featuredSlugs',
          ],
          description: strings.featuredPlacementArtworkDescription,
          emptyState: strings.featuredPlacementSectionMissing,
          featuredKey: 'featuredArtworkSlugs',
          featuredLabel: strings.featuredPlacementGalleryLabel,
          sectionSlug: 'gallery',
          sectionTitle: 'Gallery',
          sectionEntry: singletonSectionEntryBySlug.get('gallery') ?? null,
        };
      }

      if (activeCollection.id === loreCollection?.id) {
        return {
          cleanupKeys: [
            'featuredEntrySlugs',
            'featuredLoreSlugs',
            'carouselEntrySlugs',
            'carouselLoreSlugs',
            'featuredSlugs',
          ],
          description: strings.featuredPlacementWritingDescription,
          emptyState: strings.featuredPlacementSectionMissing,
          featuredKey: 'featuredEntrySlugs',
          featuredLabel: strings.featuredPlacementWritingLabel,
          sectionSlug: 'writing',
          sectionTitle: 'Writing',
          sectionEntry: singletonSectionEntryBySlug.get('writing') ?? null,
        };
      }

      return null;
    }, [
      activeCollection,
      activeEntry,
      artworkCollection?.id,
      loreCollection?.id,
      singletonSectionCollection,
      singletonSectionEntryBySlug,
      strings.featuredPlacementArtworkDescription,
      strings.featuredPlacementGalleryLabel,
      strings.featuredPlacementSectionMissing,
      strings.featuredPlacementWritingDescription,
      strings.featuredPlacementWritingLabel,
    ]);
  const featuredPlacementSlugs = useMemo(() => {
    if (!featuredPlacementConfig?.sectionEntry) {
      return [];
    }

    const profileData = asProfileDataRecord(
      featuredPlacementConfig.sectionEntry.profile_data
    );

    return getFeaturedProfileSlugs(
      profileData,
      featuredPlacementConfig.cleanupKeys
    );
  }, [featuredPlacementConfig]);
  const featuredPlacementIndex = activeEntry
    ? featuredPlacementSlugs.indexOf(activeEntry.slug)
    : -1;
  const isFeaturedPlacementActive = featuredPlacementIndex >= 0;
  const categoryOptions = useMemo(
    () =>
      (isTaxonomyConfigEditor
        ? configuredCategoryOptions
        : mergeTaxonomyOptions(
            configuredCategoryOptions,
            entryForm?.category ? [entryForm.category] : []
          )
      ).map((category) => ({
        description: strings.categoryExistingDescription,
        label: category,
        value: category,
      })),
    [
      configuredCategoryOptions,
      entryForm?.category,
      isTaxonomyConfigEditor,
      strings.categoryExistingDescription,
    ]
  );
  const tagOptions = useMemo(
    () =>
      (isTaxonomyConfigEditor
        ? configuredTagOptions
        : mergeTaxonomyOptions(configuredTagOptions, entryForm?.tags ?? [])
      ).map((tag) => ({
        description: strings.tagsExistingDescription,
        label: tag,
        value: tag,
      })),
    [
      configuredTagOptions,
      entryForm?.tags,
      isTaxonomyConfigEditor,
      strings.tagsExistingDescription,
    ]
  );

  const previewQuery = useCmsLivePreview({
    enabled: previewOpen,
    refreshToken: previewRefreshToken,
    selectedEntryId: activeEntry?.id ?? null,
    workspaceId,
  });

  const previewEntry =
    previewQuery.data?.collections
      .flatMap((collection) => collection.entries)
      .find((entry) => entry.id === activeEntry?.id) ?? null;

  const dashboardPath = getCmsLibraryPath(pathname);
  const normalizedDescription =
    serializeEntryDescriptionContent(descriptionContent);
  const supportsMarkdownBody =
    !!markdownBlock ||
    supportsMarkdownBodyFromSchema(activeCollection) ||
    /lore|writing|singleton|section/.test(
      [activeCollection?.slug, activeCollection?.collection_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    );
  const supportsPairedVisual =
    Boolean(supportsMarkdownBody) && artworkOptions.length > 0;
  const taxonomyConfigDirty =
    Boolean(taxonomySectionConfig) &&
    (!areStringArraysEqual(
      configuredCategoryOptions,
      initialConfiguredCategories
    ) ||
      !areStringArraysEqual(configuredTagOptions, initialConfiguredTags));
  const schemaProfileDataDirty =
    activeFieldDefinitions.length > 0 &&
    stableStringify(schemaProfileData) !==
      stableStringify(asProfileDataRecord(activeEntry?.profile_data));
  const schemaMetadataDirty =
    activeFieldDefinitions.length > 0 &&
    stableStringify(schemaMetadata) !==
      stableStringify(asProfileDataRecord(activeEntry?.metadata));

  const entryDirty =
    !!activeEntry &&
    !!entryForm &&
    (entryForm.title !== activeEntry.title ||
      entryForm.slug !== activeEntry.slug ||
      entryForm.subtitle !== (activeEntry.subtitle ?? '') ||
      normalizedDescription !==
        serializeEntryDescriptionContent(
          parseEntryDescriptionContent(activeEntry.summary)
        ) ||
      (!isTaxonomyConfigEditor &&
        entryForm.category !==
          normalizeEntryCategory(
            asProfileDataRecord(activeEntry.profile_data).category
          )) ||
      (!isTaxonomyConfigEditor &&
        !areStringArraysEqual(
          entryForm.tags,
          normalizeEntryTags(asProfileDataRecord(activeEntry.profile_data).tags)
        )) ||
      taxonomyConfigDirty ||
      (supportsPairedVisual
        ? pairedArtworkSlug !==
          ((asProfileDataRecord(activeEntry.profile_data).artworkSlug as
            | string
            | undefined) ?? '__none__')
        : false) ||
      (featuredEntryConfig
        ? !areStringArraysEqual(featuredEntrySlugs, initialFeaturedEntrySlugs)
        : false) ||
      schemaProfileDataDirty ||
      schemaMetadataDirty ||
      entryForm.status !== activeEntry.status ||
      fromDateTimeLocalValue(entryForm.scheduledFor) !==
        (activeEntry.scheduled_for ?? null));
  const coverDirty =
    !!activeEntry &&
    coverAltText !== (coverAsset?.alt_text ?? activeEntry.title);
  const activeEntryTitle = activeEntry?.title ?? strings.title;
  const bodyMarkdownDirty =
    bodyMarkdown.trim() !== getMarkdownBlockContent(markdownBlock).trim();

  const updateStudioCache = (
    updater: (current: NonNullable<typeof studio>) => NonNullable<typeof studio>
  ) => {
    queryClient.setQueryData(
      getCmsStudioQueryKey(workspaceId),
      (current: typeof studio | undefined) =>
        current ? updater(current) : current
    );
  };

  const refreshStudioFromBackend = async () => {
    await queryClient.invalidateQueries({
      queryKey: getCmsStudioQueryKey(workspaceId),
    });
  };

  const setUploadProgressItem = (
    id: string,
    item: Omit<EntryDetailUploadProgressItem, 'id'>
  ) => {
    setUploadProgressById((current) => ({
      ...current,
      [id]: {
        ...item,
        id,
        percent: clampUploadPercent(item.percent),
      },
    }));
  };

  const removeUploadProgressItems = (ids: string[]) => {
    window.setTimeout(() => {
      setUploadProgressById((current) => {
        const next = { ...current };
        for (const id of ids) {
          delete next[id];
        }
        return next;
      });
    }, 1200);
  };

  useEffect(() => {
    if (!activeEntry) {
      setEntryForm(null);
      return;
    }

    setEntryForm(buildEntryFormState(activeEntry));
    setCategoryDraft('');
    setCategoryCreateOpen(false);
    setTagDraft('');
    setTagCreateOpen(false);
    setSchemaProfileData(asProfileDataRecord(activeEntry.profile_data));
    setSchemaMetadata(asProfileDataRecord(activeEntry.metadata));
  }, [activeEntry]);

  useEffect(() => {
    setConfiguredCategoryOptions(initialConfiguredCategories);
  }, [initialConfiguredCategories]);

  useEffect(() => {
    setConfiguredTagOptions(initialConfiguredTags);
  }, [initialConfiguredTags]);

  useEffect(() => {
    setDescriptionContent(
      getEntryDescriptionEditorContent(activeEntry?.summary)
    );
  }, [activeEntry?.summary]);

  useEffect(() => {
    if (!activeEntry) {
      setCoverAltText('');
      return;
    }

    setCoverAltText(coverAsset?.alt_text ?? activeEntry.title);
  }, [activeEntry, coverAsset?.alt_text]);

  useEffect(() => {
    setBodyMarkdown(getMarkdownBlockContent(markdownBlock));
  }, [markdownBlock]);

  useEffect(() => {
    const profileData = asProfileDataRecord(activeEntry?.profile_data);

    setPairedArtworkSlug(
      typeof profileData.artworkSlug === 'string'
        ? profileData.artworkSlug
        : '__none__'
    );
  }, [activeEntry?.profile_data]);

  useEffect(() => {
    setFeaturedEntrySlugs(initialFeaturedEntrySlugs);
  }, [initialFeaturedEntrySlugs]);

  useEffect(() => {
    setSelectedAssetIds((current) =>
      current.filter((assetId) =>
        mediaAssets.some((asset) => asset.id === assetId)
      )
    );
  }, [mediaAssets]);

  useEffect(() => {
    setAssetCaptions((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([assetId]) =>
          mediaAssets.some((asset) => asset.id === assetId)
        )
      );
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key])
      ) {
        return current;
      }

      return next;
    });
  }, [mediaAssets]);

  const mergeEntry = (nextEntry: ExternalProjectEntry) => {
    updateStudioCache((current) => ({
      ...current,
      entries: current.entries.some((entry) => entry.id === nextEntry.id)
        ? current.entries.map((entry) =>
            entry.id === nextEntry.id ? nextEntry : entry
          )
        : [nextEntry, ...current.entries],
    }));
    if (nextEntry.id === activeEntry?.id) {
      setEntryForm(buildEntryFormState(nextEntry));
    }
  };

  const mergeAsset = (nextAsset: ExternalProjectStudioAsset) => {
    updateStudioCache((current) => {
      const index = current.assets.findIndex(
        (asset) => asset.id === nextAsset.id
      );
      const nextAssets =
        index === -1
          ? [...current.assets, nextAsset]
          : current.assets.map((asset) =>
              asset.id === nextAsset.id ? nextAsset : asset
            );

      return {
        ...current,
        assets: nextAssets,
      };
    });
    if (nextAsset.asset_type === 'image') {
      setCoverAltText(nextAsset.alt_text ?? activeEntryTitle);
    }
  };

  const mergeBlock = (nextBlock: (typeof blocks)[number]) => {
    updateStudioCache((current) => {
      const blockIndex = current.blocks.findIndex(
        (block) => block.id === nextBlock.id
      );
      const nextBlocks =
        blockIndex === -1
          ? [...current.blocks, nextBlock]
          : current.blocks.map((block) =>
              block.id === nextBlock.id ? nextBlock : block
            );

      return {
        ...current,
        blocks: nextBlocks,
      };
    });
  };

  const saveEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry || !entryForm) {
        throw new Error(strings.emptyEntries);
      }

      let currentProfileData = {
        ...asProfileDataRecord(activeEntry.profile_data),
      };
      const taxonomyProfileData = {
        ...asProfileDataRecord(
          taxonomySectionConfig?.sectionEntry?.profile_data
        ),
      };

      if (configuredCategoryOptions.length > 0) {
        taxonomyProfileData.categoryOptions = configuredCategoryOptions;
      } else {
        delete taxonomyProfileData.categoryOptions;
      }

      if (configuredTagOptions.length > 0) {
        taxonomyProfileData.tagOptions = configuredTagOptions;
      } else {
        delete taxonomyProfileData.tagOptions;
      }

      if (supportsPairedVisual && pairedArtworkSlug !== '__none__') {
        currentProfileData.artworkSlug = pairedArtworkSlug;
      } else {
        delete currentProfileData.artworkSlug;
      }

      if (!isTaxonomyConfigEditor && entryForm.category.trim()) {
        currentProfileData.category = entryForm.category.trim();
      } else {
        delete currentProfileData.category;
      }

      if (!isTaxonomyConfigEditor && entryForm.tags.length > 0) {
        currentProfileData.tags = dedupeStrings(
          entryForm.tags.map((tag) => tag.trim()).filter(Boolean)
        );
      } else {
        delete currentProfileData.tags;
      }

      if (featuredEntryConfig) {
        const validSlugs = new Set(
          featuredEntryConfig.options.map((entry) => entry.slug)
        );
        const nextFeaturedSlugs = dedupeStrings(
          featuredEntrySlugs.filter((slug) => validSlugs.has(slug))
        );
        currentProfileData = mergeFeaturedProfileData({
          featuredKey: featuredEntryConfig.key,
          nextSlugs: nextFeaturedSlugs,
          profileData: currentProfileData,
          resetKeys: featuredEntryConfig.cleanupKeys,
        });
      }

      if (isTaxonomyConfigEditor) {
        currentProfileData = {
          ...currentProfileData,
          ...taxonomyProfileData,
        };
      }

      currentProfileData = mergeSchemaFieldValues(
        currentProfileData,
        schemaProfileData,
        activeFieldDefinitions,
        'profile_data'
      );
      const currentMetadata = mergeSchemaFieldValues(
        asProfileDataRecord(activeEntry.metadata),
        schemaMetadata,
        activeFieldDefinitions,
        'metadata'
      );

      const nextEntries = [
        await updateWorkspaceExternalProjectEntry(workspaceId, activeEntry.id, {
          metadata: currentMetadata as Json,
          profile_data: currentProfileData as Json,
          scheduled_for: fromDateTimeLocalValue(entryForm.scheduledFor),
          slug: entryForm.slug.trim(),
          status: entryForm.status,
          subtitle: entryForm.subtitle.trim() || null,
          summary: normalizedDescription,
          title: entryForm.title.trim(),
        }),
      ];

      if (
        !isTaxonomyConfigEditor &&
        taxonomyConfigDirty &&
        taxonomySectionConfig
      ) {
        if (taxonomySectionConfig.sectionEntry) {
          nextEntries.push(
            await updateWorkspaceExternalProjectEntry(
              workspaceId,
              taxonomySectionConfig.sectionEntry.id,
              {
                profile_data: taxonomyProfileData as Json,
              }
            )
          );
        } else if (singletonSectionCollection) {
          nextEntries.push(
            await createWorkspaceExternalProjectEntry(workspaceId, {
              collection_id: singletonSectionCollection.id,
              metadata: {},
              profile_data: taxonomyProfileData as Json,
              slug: taxonomySectionConfig.sectionSlug,
              status: 'draft',
              subtitle: null,
              summary: null,
              title: taxonomySectionConfig.sectionTitle,
            })
          );
        }
      }

      return nextEntries;
    },
    onSuccess: (updatedEntries) => {
      updatedEntries.forEach((entry) => {
        mergeEntry(entry);
      });
      toast.success(strings.saveAction);
    },
  });

  const saveMarkdownMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry) {
        throw new Error(strings.emptyEntries);
      }

      const normalizedMarkdown = bodyMarkdown.trim();

      if (markdownBlock) {
        return updateWorkspaceExternalProjectBlock(
          workspaceId,
          markdownBlock.id,
          {
            content: { markdown: normalizedMarkdown },
            title: markdownBlock.title,
          }
        );
      }

      return createWorkspaceExternalProjectBlock(workspaceId, {
        block_type: 'markdown',
        content: { markdown: normalizedMarkdown },
        entry_id: activeEntry.id,
        sort_order: 0,
        title: strings.bodyMarkdownLabel,
      });
    },
    onSuccess: (block) => {
      mergeBlock(block);
      setBodyMarkdown(getMarkdownBlockContent(block));
      toast.success(strings.saveAction);
    },
  });

  const updateFeaturedPlacementMutation = useMutation({
    mutationFn: async (updater: (current: string[]) => string[]) => {
      const sectionEntry = featuredPlacementConfig?.sectionEntry;
      if (!sectionEntry || !activeEntry || !featuredPlacementConfig) {
        throw new Error(strings.featuredPlacementSectionMissing);
      }

      const validSlugs = new Set(
        (featuredPlacementConfig.featuredKey === 'featuredArtworkSlugs'
          ? artworkOptions
          : loreOptions
        ).map((entry) => entry.slug)
      );
      const nextSlugs = dedupeStrings(
        updater(featuredPlacementSlugs).filter((slug) => validSlugs.has(slug))
      );
      const nextProfileData = mergeFeaturedProfileData({
        featuredKey: featuredPlacementConfig.featuredKey,
        nextSlugs,
        profileData: asProfileDataRecord(sectionEntry.profile_data),
        resetKeys: featuredPlacementConfig.cleanupKeys,
      });

      return updateWorkspaceExternalProjectEntry(workspaceId, sectionEntry.id, {
        profile_data: nextProfileData as Json,
      });
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      toast.success(strings.saveAction);
    },
  });

  const createFeaturedPlacementConfigMutation = useMutation({
    mutationFn: async () => {
      if (
        !activeEntry ||
        !featuredPlacementConfig ||
        !singletonSectionCollection
      ) {
        throw new Error(strings.featuredPlacementSectionMissing);
      }

      return createWorkspaceExternalProjectEntry(workspaceId, {
        collection_id: singletonSectionCollection.id,
        metadata: {},
        profile_data: {
          [featuredPlacementConfig.featuredKey]: [activeEntry.slug],
        } as Json,
        slug: featuredPlacementConfig.sectionSlug,
        status: 'draft',
        subtitle: null,
        summary: null,
        title: featuredPlacementConfig.sectionTitle,
      });
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      toast.success(strings.featuredPlacementCreateSuccessToast);
    },
  });

  const publishEntryMutation = useMutation({
    mutationFn: async (eventKind: 'publish' | 'unpublish') => {
      if (!activeEntry) {
        throw new Error(strings.emptyEntries);
      }

      return publishWorkspaceExternalProjectEntry(
        workspaceId,
        activeEntry.id,
        eventKind
      );
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      setPreviewRefreshToken((value) => value + 1);
      toast.success(
        entry.status === 'published'
          ? strings.publishAction
          : strings.unpublishAction
      );
    },
  });

  const duplicateEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry) {
        throw new Error(strings.emptyEntries);
      }

      return duplicateWorkspaceExternalProjectEntry(
        workspaceId,
        activeEntry.id
      );
    },
    onSuccess: (entry) => {
      updateStudioCache((current) => ({
        ...current,
        entries: [entry, ...current.entries],
      }));
      toast.success(strings.duplicateAction);
      if (variant === 'dialog') {
        onEntryChange?.(entry.id);
        return;
      }

      router.push(getCmsEntryPath(pathname, entry.id));
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry) {
        throw new Error(strings.emptyEntries);
      }

      return deleteWorkspaceExternalProjectEntry(workspaceId, activeEntry.id);
    },
    onSuccess: () => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.filter((asset) => asset.entry_id !== entryId),
        entries: current.entries.filter((entry) => entry.id !== entryId),
      }));
      setDeleteEntryDialogOpen(false);
      toast.success(strings.deleteEntryAction);
      onDeleted?.();

      if (variant === 'dialog') {
        onOpenChange?.(false);
        return;
      }

      router.push(dashboardPath);
    },
  });

  const saveCoverMutation = useMutation({
    mutationFn: async () => {
      if (!coverAsset) {
        throw new Error(strings.noCoverTitle);
      }

      return updateWorkspaceExternalProjectAsset(workspaceId, coverAsset.id, {
        alt_text: coverAltText.trim() || activeEntryTitle,
      });
    },
    onSuccess: (asset) => {
      mergeAsset(toStudioAsset(asset, coverAsset));
      toast.success(strings.coverSaveSuccessToast);
    },
  });

  const uploadCoverMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeCollection) {
        throw new Error(strings.emptyCollection);
      }

      const progressId = getUploadProgressId('cover', file);
      setUploadProgressItem(progressId, {
        loaded: 0,
        name: file.name,
        percent: 0,
        scope: 'cover',
        total: file.size,
      });
      const optimizedFile = await optimizeCmsMediaUpload(file);

      const upload = await uploadWorkspaceExternalProjectAssetFile(
        workspaceId,
        optimizedFile,
        {
          adapter: binding.adapter,
          collectionType: activeCollection.collection_type,
          entrySlug: entryForm?.slug.trim() || activeEntry?.slug || 'entry',
          upsert: true,
        },
        {
          onUploadProgress: (progress) =>
            setUploadProgressItem(progressId, {
              loaded: progress.loaded,
              name: file.name,
              percent: progress.percent,
              scope: 'cover',
              total: progress.total,
            }),
        }
      );

      setUploadProgressItem(progressId, {
        loaded: optimizedFile.size,
        name: file.name,
        percent: 100,
        scope: 'cover',
        total: optimizedFile.size,
      });

      if (coverAsset) {
        return updateWorkspaceExternalProjectAsset(workspaceId, coverAsset.id, {
          alt_text: coverAltText.trim() || file.name,
          asset_type: 'image',
          sort_order: 0,
          source_url: null,
          storage_path: upload.path,
        });
      }

      return createWorkspaceExternalProjectAsset(workspaceId, {
        alt_text: coverAltText.trim() || file.name,
        asset_type: 'image',
        entry_id: activeEntry?.id ?? entryId,
        metadata: {},
        sort_order: 0,
        source_url: null,
        storage_path: upload.path,
      });
    },
    onSuccess: async (asset) => {
      mergeAsset(toStudioAsset(asset, coverAsset));
      setPreviewRefreshToken((value) => value + 1);
      await refreshStudioFromBackend();
      toast.success(strings.coverUploadSuccessToast);
    },
    onSettled: (_data, _error, file) => {
      removeUploadProgressItems([getUploadProgressId('cover', file)]);
    },
  });

  const uploadMediaMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!activeCollection) {
        throw new Error(strings.emptyCollection);
      }

      return Promise.all(
        files.map(async (file, index) => {
          const assetType = resolveUploadAssetType(file, supportedAssetTypes);
          if (!assetType) {
            throw new Error(strings.unsupportedMediaTypeToast);
          }

          const progressId = getUploadProgressId('media', file, index);
          setUploadProgressItem(progressId, {
            loaded: 0,
            name: file.name,
            percent: 0,
            scope: 'media',
            total: file.size,
          });
          const audioMetadata =
            assetType === 'audio'
              ? await readCmsAudioUploadMetadata(file)
              : null;

          if (audioMetadata?.duration) {
            setSchemaProfileData((current) => {
              if (
                typeof current.duration === 'string' &&
                current.duration.trim()
              ) {
                return current;
              }

              return {
                ...current,
                duration: audioMetadata.duration,
              };
            });
          }

          const optimizedFile =
            assetType === 'image' ? await optimizeCmsMediaUpload(file) : file;
          const upload = await uploadWorkspaceExternalProjectAssetFile(
            workspaceId,
            optimizedFile,
            {
              adapter: binding.adapter,
              collectionType: activeCollection.collection_type,
              entrySlug: entryForm?.slug.trim() || activeEntry?.slug || 'entry',
            },
            {
              onUploadProgress: (progress) =>
                setUploadProgressItem(progressId, {
                  loaded: progress.loaded,
                  name: file.name,
                  percent: progress.percent,
                  scope: 'media',
                  total: progress.total,
                }),
            }
          );

          setUploadProgressItem(progressId, {
            loaded: optimizedFile.size,
            name: file.name,
            percent: 100,
            scope: 'media',
            total: optimizedFile.size,
          });

          const siblingAssets = mediaAssets.filter(
            (asset) => asset.asset_type === assetType
          );
          const nextSortOrder =
            Math.max(
              -1,
              ...siblingAssets.map((asset) => asset.sort_order ?? 0)
            ) +
            index +
            1;

          return createWorkspaceExternalProjectAsset(workspaceId, {
            alt_text: file.name,
            asset_type: assetType,
            entry_id: activeEntry?.id ?? entryId,
            metadata: audioMetadata
              ? ({
                  contentType: audioMetadata.contentType,
                  duration: audioMetadata.duration,
                  durationSeconds: audioMetadata.durationSeconds,
                  filename: audioMetadata.filename,
                  size: audioMetadata.size,
                } as Json)
              : {},
            sort_order: nextSortOrder,
            source_url: null,
            storage_path: upload.path,
          });
        })
      );
    },
    onSuccess: async (createdAssets) => {
      updateStudioCache((current) => ({
        ...current,
        assets: [
          ...current.assets,
          ...createdAssets.map((asset) => toStudioAsset(asset, null)),
        ],
      }));
      await refreshStudioFromBackend();
      toast.success(strings.coverUploadSuccessToast);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : strings.unsupportedMediaTypeToast
      );
    },
    onSettled: (_data, _error, files) => {
      removeUploadProgressItems(
        files.map((file, index) => getUploadProgressId('media', file, index))
      );
    },
  });

  const uploadWebglPackageMutation = useMutation({
    mutationFn: async (file: File) => {
      const progressId = getUploadProgressId('webgl', file);
      setUploadProgressItem(progressId, {
        loaded: 0,
        name: file.name,
        percent: 0,
        scope: 'webgl',
        total: file.size,
      });

      const result = await uploadWorkspaceExternalProjectWebglPackageFile(
        workspaceId,
        file,
        {
          entryId: activeEntry?.id ?? entryId,
        },
        {
          fetch,
          onUploadProgress: (progress) =>
            setUploadProgressItem(progressId, {
              loaded: progress.loaded,
              name: file.name,
              percent: progress.percent,
              scope: 'webgl',
              total: progress.total,
            }),
        }
      );

      setUploadProgressItem(progressId, {
        loaded: file.size,
        name: file.name,
        percent: 100,
        scope: 'webgl',
        total: file.size,
      });

      return result;
    },
    onSuccess: async (result) => {
      mergeAsset(toStudioAsset(result.asset, webglPackageAsset));
      setPreviewRefreshToken((value) => value + 1);
      await refreshStudioFromBackend();
      toast.success(strings.webglUploadSuccessToast);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : strings.webglUploadFailedToast
      );
    },
    onSettled: (_data, _error, file) => {
      removeUploadProgressItems([getUploadProgressId('webgl', file)]);
    },
  });

  const deleteAssetsMutation = useMutation({
    mutationFn: async (assetIds: string[]) =>
      Promise.all(
        assetIds.map((assetId) =>
          deleteWorkspaceExternalProjectAsset(workspaceId, assetId)
        )
      ),
    onSuccess: async (_, assetIds) => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.filter((asset) => !assetIds.includes(asset.id)),
      }));
      setSelectedAssetIds([]);
      setDeleteMediaDialogOpen(false);
      await refreshStudioFromBackend();
      toast.success(strings.deleteAssetAction);
    },
  });

  const saveAssetCaptionMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const asset = mediaAssets.find((item) => item.id === assetId);
      if (!asset) {
        throw new Error(strings.emptyEntries);
      }

      return updateWorkspaceExternalProjectAsset(workspaceId, assetId, {
        metadata: mergeAssetCaptionMetadata(
          asset,
          assetCaptions[assetId] ?? ''
        ),
      });
    },
    onSuccess: async (asset) => {
      mergeAsset(
        toStudioAsset(
          asset,
          mediaAssets.find((item) => item.id === asset.id) ?? null
        )
      );
      setAssetCaptions((current) => {
        if (!(asset.id in current)) {
          return current;
        }

        const next = { ...current };
        delete next[asset.id];
        return next;
      });
      await refreshStudioFromBackend();
      toast.success(strings.saveMediaDetailsAction);
    },
  });

  const setAsCoverMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const nextOrder = [
        imageAssets.find((asset) => asset.id === assetId)!,
        ...imageAssets.filter((asset) => asset.id !== assetId),
      ];

      return Promise.all(
        nextOrder.map((asset, index) =>
          updateWorkspaceExternalProjectAsset(workspaceId, asset.id, {
            sort_order: index,
          })
        )
      );
    },
    onSuccess: async (updatedAssets) => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.map((asset) =>
          toStudioAsset(
            updatedAssets.find((updated) => updated.id === asset.id) ?? asset,
            asset
          )
        ),
      }));
      setCoverAltText(updatedAssets[0]?.alt_text ?? activeEntryTitle);
      await refreshStudioFromBackend();
      toast.success(strings.coverSaveSuccessToast);
    },
  });

  const moveMediaAssetMutation = useMutation({
    mutationFn: async ({
      assetId,
      direction,
    }: {
      assetId: string;
      direction: -1 | 1;
    }) => {
      const target = mediaAssets.find((asset) => asset.id === assetId);
      if (!target) {
        throw new Error(strings.emptyEntries);
      }

      const siblingAssets = mediaAssets.filter(
        (asset) => asset.asset_type === target.asset_type
      );
      const currentIndex = siblingAssets.findIndex(
        (asset) => asset.id === assetId
      );
      const nextIndex = currentIndex + direction;

      if (
        currentIndex === -1 ||
        nextIndex < 0 ||
        nextIndex >= siblingAssets.length
      ) {
        return [];
      }

      const nextOrder = [...siblingAssets];
      [nextOrder[currentIndex], nextOrder[nextIndex]] = [
        nextOrder[nextIndex]!,
        nextOrder[currentIndex]!,
      ];

      return Promise.all(
        nextOrder.map((asset, index) =>
          updateWorkspaceExternalProjectAsset(workspaceId, asset.id, {
            sort_order: index,
          })
        )
      );
    },
    onSuccess: async (updatedAssets) => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.map((asset) =>
          toStudioAsset(
            updatedAssets.find((updated) => updated.id === asset.id) ?? asset,
            asset
          )
        ),
      }));
      setCoverAltText(
        updatedAssets.find((asset) => asset.asset_type === 'image')?.alt_text ??
          imageAssets[0]?.alt_text ??
          activeEntryTitle
      );
      await refreshStudioFromBackend();
      toast.success(strings.saveMediaDetailsAction);
    },
  });

  const handleCoverInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    uploadCoverMutation.mutate(file);
  };

  const handleMediaFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    uploadMediaMutation.mutate(files);
  };

  const handleMediaInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    handleMediaFiles(files);
  };

  const handleWebglInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) {
      return;
    }

    uploadWebglPackageMutation.mutate(file);
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId]
    );
  };

  const toggleFeaturedEntrySelection = (slug: string) => {
    setFeaturedEntrySlugs((current) =>
      current.includes(slug)
        ? current.filter((value) => value !== slug)
        : [...current, slug]
    );
  };

  const removeEntryTag = (tag: string) => {
    setEntryForm((current) =>
      current
        ? {
            ...current,
            tags: current.tags.filter((value) => value !== tag),
          }
        : current
    );
  };

  const clearEntryTags = () => {
    setEntryForm((current) =>
      current
        ? {
            ...current,
            tags: [],
          }
        : current
    );
  };

  const applyEntryCategory = (value: string) => {
    const nextCategory = value.trim();
    if (!nextCategory) {
      setCategoryDraft('');
      return;
    }

    setConfiguredCategoryOptions((current) =>
      mergeTaxonomyOptions(current, [nextCategory])
    );
    if (!isTaxonomyConfigEditor) {
      setEntryForm((current) =>
        current
          ? {
              ...current,
              category: nextCategory,
            }
          : current
      );
    }
    setCategoryDraft('');
    setCategoryCreateOpen(false);
  };

  const addEntryTags = (value: string) => {
    const nextTags = parseTaxonomyDraft(value);

    if (nextTags.length === 0) return;

    setConfiguredTagOptions((current) =>
      mergeTaxonomyOptions(current, nextTags)
    );
    if (!isTaxonomyConfigEditor) {
      setEntryForm((current) =>
        current
          ? {
              ...current,
              tags: dedupeStrings([...current.tags, ...nextTags]),
            }
          : current
      );
    }
    setTagDraft('');
    setTagCreateOpen(false);
  };

  const removeConfiguredCategory = (category: string) => {
    setConfiguredCategoryOptions((current) =>
      current.filter((value) => value !== category)
    );
    if (!isTaxonomyConfigEditor) {
      setEntryForm((current) =>
        current && current.category === category
          ? {
              ...current,
              category: '',
            }
          : current
      );
    }
  };

  const clearConfiguredCategories = () => {
    setConfiguredCategoryOptions([]);
    if (!isTaxonomyConfigEditor) {
      setEntryForm((current) =>
        current
          ? {
              ...current,
              category: '',
            }
          : current
      );
    }
  };

  const removeConfiguredTag = (tag: string) => {
    setConfiguredTagOptions((current) =>
      current.filter((value) => value !== tag)
    );
    if (!isTaxonomyConfigEditor) {
      setEntryForm((current) =>
        current
          ? {
              ...current,
              tags: current.tags.filter((value) => value !== tag),
            }
          : current
      );
    }
  };

  const clearConfiguredTags = () => {
    setConfiguredTagOptions([]);
    if (!isTaxonomyConfigEditor) {
      setEntryForm((current) =>
        current
          ? {
              ...current,
              tags: [],
            }
          : current
      );
    }
  };

  const moveFeaturedEntry = (slug: string, direction: -1 | 1) => {
    setFeaturedEntrySlugs((current) => {
      const index = current.indexOf(slug);
      const nextIndex = index + direction;

      if (index === -1 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const toggleFeaturedPlacement = () => {
    if (!activeEntry) {
      return;
    }

    updateFeaturedPlacementMutation.mutate((current) =>
      current.includes(activeEntry.slug)
        ? current.filter((slug) => slug !== activeEntry.slug)
        : [...current, activeEntry.slug]
    );
  };

  const moveFeaturedPlacement = (direction: -1 | 1) => {
    if (!activeEntry) {
      return;
    }

    updateFeaturedPlacementMutation.mutate((current) => {
      const index = current.indexOf(activeEntry.slug);
      const nextIndex = index + direction;

      if (index === -1 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const deleteSingleAsset = (assetId: string) => {
    setSelectedAssetIds([assetId]);
    setDeleteMediaDialogOpen(true);
  };

  if (studioQuery.isPending && !studio) {
    return variant === 'dialog' ? (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="inset-0 top-0 left-0 h-screen max-h-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 p-0 sm:max-w-none">
          <EntryDetailLoadingState />
        </DialogContent>
      </Dialog>
    ) : (
      <EntryDetailLoadingState />
    );
  }

  if (!activeEntry || !entryForm) {
    return null;
  }

  const selectedAssetCount = selectedAssetIds.length;
  const uploadProgressItems = Object.values(uploadProgressById);
  const mediaProcessing =
    uploadCoverMutation.isPending ||
    uploadMediaMutation.isPending ||
    uploadWebglPackageMutation.isPending ||
    saveCoverMutation.isPending ||
    saveAssetCaptionMutation.isPending ||
    deleteAssetsMutation.isPending ||
    setAsCoverMutation.isPending ||
    moveMediaAssetMutation.isPending;
  const saveProcessing =
    saveEntryMutation.isPending ||
    saveMarkdownMutation.isPending ||
    saveCoverMutation.isPending;
  const featuredPlacementProcessing =
    updateFeaturedPlacementMutation.isPending ||
    createFeaturedPlacementConfigMutation.isPending;
  const dirty = entryDirty || coverDirty || bodyMarkdownDirty;
  const collectionTitle =
    activeCollection?.title ?? strings.collectionFallbackLabel;
  const featuredPlacementLabel = featuredPlacementConfig?.sectionEntry
    ? featuredPlacementConfig.featuredLabel
    : null;

  const refreshWorkspace = () => {
    setPreviewRefreshToken((value) => value + 1);
    queryClient.invalidateQueries({
      queryKey: getCmsStudioQueryKey(workspaceId),
    });
  };

  const saveCurrentEntry = () => {
    if (entryDirty) {
      saveEntryMutation.mutate();
    }

    if (bodyMarkdownDirty) {
      saveMarkdownMutation.mutate();
    }

    if (coverDirty && coverAsset) {
      saveCoverMutation.mutate();
    }
  };

  const content = (
    <div className="mx-auto min-h-[calc(100svh-5rem)] max-w-[1580px] space-y-6 pb-10">
      <EntryDetailUploadInputs
        coverInputRef={coverInputRef}
        mediaInputAccept={mediaInputAccept}
        mediaInputRef={mediaInputRef}
        onCoverChange={handleCoverInputChange}
        onMediaChange={handleMediaInputChange}
        onWebglChange={handleWebglInputChange}
        webglInputRef={webglInputRef}
      />

      <EntryDetailHeader
        activeEntry={activeEntry}
        activeEntryTitle={activeEntryTitle}
        collectionTitle={collectionTitle}
        coverVisible={Boolean(coverAsset)}
        dashboardPath={dashboardPath}
        dirty={dirty}
        featuredPlacementActive={isFeaturedPlacementActive}
        featuredPlacementIndex={featuredPlacementIndex}
        featuredPlacementLabel={featuredPlacementLabel}
        featuredPlacementProcessing={featuredPlacementProcessing}
        mediaProcessing={mediaProcessing}
        onBack={(path) => router.push(path)}
        onDelete={() => setDeleteEntryDialogOpen(true)}
        onDuplicate={() => duplicateEntryMutation.mutate()}
        onOpenPreview={() => setPreviewOpen(true)}
        onPublishToggle={() =>
          publishEntryMutation.mutate(
            activeEntry.status === 'published' ? 'unpublish' : 'publish'
          )
        }
        onRefresh={refreshWorkspace}
        onSave={saveCurrentEntry}
        onToggleFeaturedPlacement={toggleFeaturedPlacement}
        publishPending={publishEntryMutation.isPending}
        saveDisabled={!dirty || saveProcessing}
        saveProcessing={saveProcessing}
        strings={strings}
        variant={variant}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <EntryDetailMainColumn
            activeEntry={activeEntry}
            assetCaptions={assetCaptions}
            bodyMarkdown={bodyMarkdown}
            bodyMarkdownLabel={strings.bodyMarkdownLabel}
            bodyMarkdownPlaceholder={strings.previewEmptyDescription}
            bodyMarkdownWriteLabel={strings.markdownWriteLabel}
            coverAltText={coverAltText}
            coverAsset={coverAsset}
            coverDirty={coverDirty}
            deleteAssetsPending={deleteAssetsMutation.isPending}
            descriptionContent={descriptionContent}
            mediaAssetTypes={supportedAssetTypes}
            mediaAssets={mediaAssets}
            mediaProcessing={mediaProcessing}
            onBodyMarkdownChange={setBodyMarkdown}
            onCaptionChange={(assetId, value) =>
              setAssetCaptions((current) => ({
                ...current,
                [assetId]: value,
              }))
            }
            onCoverAltTextChange={setCoverAltText}
            onCoverInputClick={() => coverInputRef.current?.click()}
            onDeleteSelectedMedia={() => setDeleteMediaDialogOpen(true)}
            onDeleteSingleAsset={deleteSingleAsset}
            onDescriptionChange={setDescriptionContent}
            onMediaDrop={handleMediaFiles}
            onMoveMediaAsset={(assetId, direction) =>
              moveMediaAssetMutation.mutate({ assetId, direction })
            }
            onOpenPreview={() => setPreviewOpen(true)}
            onSaveAssetCaption={(assetId) =>
              saveAssetCaptionMutation.mutate(assetId)
            }
            onSaveCover={() => saveCoverMutation.mutate()}
            onSelectAllMedia={() =>
              setSelectedAssetIds((current) =>
                current.length === mediaAssets.length
                  ? []
                  : mediaAssets.map((asset) => asset.id)
              )
            }
            onSetAsCover={(assetId) => setAsCoverMutation.mutate(assetId)}
            onSubtitleChange={(value) =>
              setEntryForm((current) =>
                current ? { ...current, subtitle: value } : current
              )
            }
            onToggleAssetSelection={toggleAssetSelection}
            onUploadMediaClick={() => mediaInputRef.current?.click()}
            onUploadWebglClick={() => webglInputRef.current?.click()}
            saveAssetCaptionPending={saveAssetCaptionMutation.isPending}
            saveCoverPending={saveCoverMutation.isPending}
            selectedAssetCount={selectedAssetCount}
            selectedAssetIds={selectedAssetIds}
            setAsCoverPending={setAsCoverMutation.isPending}
            moveMediaPending={moveMediaAssetMutation.isPending}
            strings={strings}
            subtitle={entryForm.subtitle}
            supportsMarkdownBody={supportsMarkdownBody}
            supportsWebglPackage={supportsWebglPackage}
            uploadCoverPending={uploadCoverMutation.isPending}
            uploadMediaPending={uploadMediaMutation.isPending}
            uploadProgressItems={uploadProgressItems}
            uploadWebglPending={uploadWebglPackageMutation.isPending}
            webglPackageAsset={webglPackageAsset}
            webglPackagePlayerPath={webglPackagePlayerPath}
            webglPackagePublicPlayerPath={webglPackagePublicPlayerPath}
          />
          <EntryDetailSchemaFieldsCard
            fieldDefinitions={activeFieldDefinitions}
            metadata={schemaMetadata}
            onMetadataChange={setSchemaMetadata}
            onProfileDataChange={setSchemaProfileData}
            profileData={schemaProfileData}
            strings={strings}
          />
        </div>

        <EntryDetailSidebar
          activeCollectionDescription={activeCollection?.description}
          activeCollectionSlug={activeCollection?.slug}
          activeCollectionTitle={collectionTitle}
          activeEntry={activeEntry}
          artworkOptions={artworkOptions}
          binding={binding}
          categoryCreateOpen={categoryCreateOpen}
          categoryDraft={categoryDraft}
          categoryOptions={categoryOptions}
          configuredCategoryOptions={configuredCategoryOptions}
          configuredTagOptions={configuredTagOptions}
          createFeaturedPlacementConfigPending={
            createFeaturedPlacementConfigMutation.isPending
          }
          entryForm={entryForm}
          featuredEntryConfig={featuredEntryConfig}
          featuredEntrySlugs={featuredEntrySlugs}
          featuredPlacementActive={isFeaturedPlacementActive}
          featuredPlacementConfig={featuredPlacementConfig}
          featuredPlacementIndex={featuredPlacementIndex}
          featuredPlacementProcessing={featuredPlacementProcessing}
          featuredPlacementSlugsLength={featuredPlacementSlugs.length}
          isTaxonomyConfigEditor={isTaxonomyConfigEditor}
          onAddTags={addEntryTags}
          onApplyCategory={applyEntryCategory}
          onCategoryCreateOpenChange={setCategoryCreateOpen}
          onCategoryDraftChange={setCategoryDraft}
          onCategorySelectionChange={(value) => {
            if (isTaxonomyConfigEditor) {
              if (Array.isArray(value)) {
                setConfiguredCategoryOptions(normalizeTaxonomyOptions(value));
              }
              return;
            }

            setEntryForm((current) =>
              current && typeof value === 'string'
                ? { ...current, category: value }
                : current
            );
          }}
          onClearCategories={
            isTaxonomyConfigEditor
              ? clearConfiguredCategories
              : () =>
                  setEntryForm((current) =>
                    current ? { ...current, category: '' } : current
                  )
          }
          onClearTags={
            isTaxonomyConfigEditor ? clearConfiguredTags : clearEntryTags
          }
          onCreateFeaturedPlacementConfig={() =>
            createFeaturedPlacementConfigMutation.mutate()
          }
          onFeaturedEntryMove={moveFeaturedEntry}
          onFeaturedEntryToggle={toggleFeaturedEntrySelection}
          onFeaturedPlacementMove={moveFeaturedPlacement}
          onFeaturedPlacementToggle={toggleFeaturedPlacement}
          onPairedArtworkChange={setPairedArtworkSlug}
          onRemoveCategory={removeConfiguredCategory}
          onRemoveTag={(tag) =>
            isTaxonomyConfigEditor
              ? removeConfiguredTag(tag)
              : removeEntryTag(tag)
          }
          onScheduledForChange={(value) =>
            setEntryForm((current) =>
              current ? { ...current, scheduledFor: value } : current
            )
          }
          onSlugChange={(value) =>
            setEntryForm((current) =>
              current ? { ...current, slug: value } : current
            )
          }
          onStatusChange={(status) =>
            setEntryForm((current) =>
              current ? { ...current, status } : current
            )
          }
          onTagCreateOpenChange={setTagCreateOpen}
          onTagDraftChange={setTagDraft}
          onTagSelectionChange={(value) =>
            isTaxonomyConfigEditor
              ? setConfiguredTagOptions(normalizeTaxonomyOptions(value))
              : setEntryForm((current) =>
                  current ? { ...current, tags: value } : current
                )
          }
          onTitleChange={(value) =>
            setEntryForm((current) =>
              current ? { ...current, title: value } : current
            )
          }
          pairedArtworkSlug={pairedArtworkSlug}
          strings={strings}
          supportsPairedVisual={supportsPairedVisual}
          tagCreateOpen={tagCreateOpen}
          tagDraft={tagDraft}
          tagOptions={tagOptions}
          taxonomyConfigDirty={taxonomyConfigDirty}
          taxonomyScopeLabel={taxonomySectionConfig?.sectionTitle ?? null}
        />
      </div>

      <EntryDetailConfirmDialogs
        deleteEntryOpen={deleteEntryDialogOpen}
        deleteEntryPending={deleteEntryMutation.isPending}
        deleteMediaOpen={deleteMediaDialogOpen}
        deleteMediaPending={deleteAssetsMutation.isPending}
        onDeleteEntry={() => deleteEntryMutation.mutate()}
        onDeleteEntryOpenChange={setDeleteEntryDialogOpen}
        onDeleteMedia={() => deleteAssetsMutation.mutate(selectedAssetIds)}
        onDeleteMediaOpenChange={setDeleteMediaDialogOpen}
        selectedAssetCount={selectedAssetCount}
        strings={strings}
      />

      <EntryDetailPreviewSheet
        coverAsset={coverAsset}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        previewEntry={previewEntry}
        previewPending={previewQuery.isPending}
        strings={strings}
      />
    </div>
  );

  if (variant === 'dialog') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="inset-0 top-0 left-0 flex h-screen max-h-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{activeEntry.title}</DialogTitle>
            <DialogDescription>
              {strings.editEntryDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 lg:px-8">
            {content}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return content;
}
