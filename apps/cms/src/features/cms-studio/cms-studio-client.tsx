'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bulkUpdateWorkspaceExternalProjectEntries,
  createWorkspaceExternalProjectCollection,
  createWorkspaceExternalProjectEntry,
  createWorkspaceExternalProjectFieldDefinition,
  deleteWorkspaceExternalProjectCollection,
  deleteWorkspaceExternalProjectEntry,
  deleteWorkspaceExternalProjectFieldDefinition,
  duplicateWorkspaceExternalProjectEntry,
  importWorkspaceExternalProjectContent,
  publishWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectCollection,
  updateWorkspaceExternalProjectEntry,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectStudioData,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';
import {
  buildCollectionConfigFromTemplate,
  buildDefaultFieldValues,
  type CmsContentModelTemplate,
  getCollectionFieldDefinitions,
} from './cms-content-model';
import {
  collectionMatchesCmsEditorView,
  getCmsEditorCollectionView,
  getCmsTaxonomyConfigForCollection,
  getCmsTaxonomySectionCollection,
  resolveCmsEditorCapabilities,
} from './cms-editor-capabilities';
import { CmsLibrarySection } from './cms-library-section';
import type { CmsLibrarySectionProps } from './cms-library-section-shared';
import { CmsLibraryTaxonomyDialog } from './cms-library-taxonomy-dialog';
import {
  getCmsCollectionPath,
  getCmsEntryPath,
  getCmsLibraryPath,
} from './cms-paths';
import { CmsPreviewSection } from './cms-preview-section';
import type { CmsStrings } from './cms-strings';
import {
  CmsCreateCollectionDialog,
  CmsDeleteCollectionDialog,
  CmsDeleteEntryDialog,
} from './cms-studio-dialogs';
import { CmsStudioHeader } from './cms-studio-header';
import {
  type CmsStudioMode,
  type EditSection,
  getProjectBrand,
  slugifyLabel,
  type WorkflowFilter,
} from './cms-studio-utils';
import { EntryDetailClient } from './entries/[entryId]/entry-detail-client';
import { useCmsLivePreview } from './use-cms-live-preview';
import { getCmsStudioQueryKey, useCmsStudio } from './use-cms-studio';

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

export function CmsStudioClient({
  availableEditSections = ['entries', 'content-model', 'workflow', 'settings'],
  binding,
  cmsGamesEnabled = false,
  collectionScope = 'all',
  headerDescription,
  headerTitle,
  initialEditSection = 'entries',
  initialEditorEntryId = null,
  initialMode = 'preview',
  initialStudio,
  showModeSwitch = true,
  strings,
  workspaceId,
}: {
  availableEditSections?: EditSection[];
  binding: WorkspaceExternalProjectBinding;
  cmsGamesEnabled?: boolean;
  collectionScope?: string;
  headerDescription?: string;
  headerTitle?: string;
  initialEditSection?: EditSection;
  initialEditorEntryId?: string | null;
  initialMode?: CmsStudioMode;
  initialStudio?: ExternalProjectStudioData;
  showModeSwitch?: boolean;
  strings: CmsStrings;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const studioQuery = useCmsStudio({
    initialData: initialStudio ? { ...initialStudio, binding } : undefined,
    workspaceId,
  });
  const studio = studioQuery.data;
  const [mode, setMode] = useState<CmsStudioMode>(initialMode);
  const [editSection, setEditSection] =
    useState<EditSection>(initialEditSection);
  const [selectedCollectionId, setSelectedCollectionId] = useState(
    initialStudio?.collections[0]?.id ?? ''
  );
  const [selectedEntryId, setSelectedEntryId] = useState(
    initialStudio?.entries[0]?.id ?? ''
  );
  const [search, setSearch] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>('all');
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [scheduleValue, setScheduleValue] = useState('');
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [editorEntryId, setEditorEntryId] = useState<string | null>(
    initialEditorEntryId
  );
  const [entryDeleteTarget, setEntryDeleteTarget] = useState<string | null>(
    null
  );
  const [quickTaxonomyEntryId, setQuickTaxonomyEntryId] = useState<
    string | null
  >(null);
  const [collectionDeleteTarget, setCollectionDeleteTarget] = useState<
    string | null
  >(null);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const deferredSearch = useDeferredValue(search);
  const allEntries = studio?.entries ?? initialStudio?.entries ?? [];
  const allCollections =
    studio?.collections ?? initialStudio?.collections ?? [];
  const fieldDefinitions =
    studio?.fieldDefinitions ?? initialStudio?.fieldDefinitions ?? [];
  const cmsCapabilities = resolveCmsEditorCapabilities({
    binding,
    collections: allCollections,
    fieldDefinitions,
    studio: studio ?? initialStudio,
  });
  const activeCollectionView = getCmsEditorCollectionView(
    cmsCapabilities,
    collectionScope
  );
  const collections = allCollections.filter((collection) =>
    collectionMatchesCmsEditorView(collection, activeCollectionView)
  );
  const scopedCollectionIds = new Set(
    collections.map((collection) => collection.id)
  );
  const scopedToCollectionView = !activeCollectionView?.includeAll;
  const entries = scopedToCollectionView
    ? allEntries.filter((entry) => scopedCollectionIds.has(entry.collection_id))
    : allEntries;
  const scopedEntryIds = new Set(entries.map((entry) => entry.id));
  const assets = (studio?.assets ?? initialStudio?.assets ?? []).filter(
    (asset) =>
      !scopedToCollectionView ||
      !asset.entry_id ||
      scopedEntryIds.has(asset.entry_id)
  );
  const publishEvents =
    studio?.publishEvents ?? initialStudio?.publishEvents ?? [];
  const activeViewCreateDefaults = activeCollectionView?.createCollection;
  const activeViewIsGames = activeCollectionView?.id === 'games';
  const activeViewEmptyHint = activeViewCreateDefaults?.emptyHint ?? undefined;

  const previewQuery = useCmsLivePreview({
    enabled: mode === 'preview',
    refreshToken: previewRefreshToken,
    selectedEntryId,
    workspaceId,
  });

  const deliveryCollections = previewQuery.data?.collections ?? [];
  const selectedPreviewCollection = deliveryCollections.find(
    (collection) => collection.id === selectedCollectionId
  );
  const matchedStudioCollection =
    collections.find((collection) => collection.id === selectedCollectionId) ??
    (selectedPreviewCollection
      ? collections.find(
          (collection) =>
            collection.slug === selectedPreviewCollection.slug ||
            collection.title === selectedPreviewCollection.title
        )
      : undefined);
  const activeCollection = matchedStudioCollection ?? collections[0] ?? null;
  const effectiveCollectionId = activeCollection?.id ?? '';
  const activePreviewCollection =
    selectedPreviewCollection ||
    (activeCollection
      ? deliveryCollections.find(
          (collection) =>
            collection.slug === activeCollection.slug ||
            collection.title === activeCollection.title
        )
      : undefined) ||
    deliveryCollections[0] ||
    null;
  const visibleEntries = entries.filter((entry) => {
    if (
      effectiveCollectionId &&
      entry.collection_id !== effectiveCollectionId
    ) {
      return false;
    }

    if (!deferredSearch.trim()) {
      return true;
    }

    const query = deferredSearch.toLowerCase();
    return [entry.title, entry.slug, entry.summary, entry.subtitle]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query));
  });
  const activeEditEntry =
    visibleEntries.find((entry) => entry.id === selectedEntryId) ??
    visibleEntries[0] ??
    null;
  const previewEntries = activePreviewCollection?.entries ?? [];
  const previewPrimaryEntry = previewEntries[0] ?? null;
  const previewProjectLabel = getProjectBrand(
    binding,
    previewQuery.data?.profileData
  );

  useEffect(() => {
    const firstCollectionId = collections[0]?.id;
    const nextCollectionId = matchedStudioCollection?.id ?? firstCollectionId;

    if (nextCollectionId && selectedCollectionId !== nextCollectionId) {
      if (
        !selectedCollectionId ||
        !collections.some(
          (collection) => collection.id === selectedCollectionId
        )
      ) {
        setSelectedCollectionId(nextCollectionId);
      }
    }
  }, [collections, matchedStudioCollection?.id, selectedCollectionId]);

  useEffect(() => {
    const firstEntryId =
      entries.find((entry) =>
        effectiveCollectionId
          ? entry.collection_id === effectiveCollectionId
          : true
      )?.id ?? '';
    const selectedEntryStillVisible = entries.some(
      (entry) =>
        entry.id === selectedEntryId &&
        (!effectiveCollectionId ||
          entry.collection_id === effectiveCollectionId)
    );

    if (!selectedEntryStillVisible && firstEntryId) {
      setSelectedEntryId(firstEntryId);
    } else if (!firstEntryId && selectedEntryId) {
      setSelectedEntryId('');
    }
  }, [effectiveCollectionId, entries, selectedEntryId]);

  useEffect(() => {
    if (initialEditorEntryId) {
      setEditorEntryId(initialEditorEntryId);
      setSelectedEntryId(initialEditorEntryId);
    }
  }, [initialEditorEntryId]);

  useEffect(() => {
    if (!editorEntryId) {
      return;
    }

    const entryStillExists = entries.some(
      (entry) => entry.id === editorEntryId
    );
    if (!entryStillExists) {
      setEditorEntryId(null);
      router.replace(getCmsLibraryPath(pathname));
    }
  }, [editorEntryId, entries, pathname, router]);

  useEffect(() => {
    if (
      mode === 'preview' &&
      !previewQuery.isPending &&
      activeCollection &&
      (!activePreviewCollection || activePreviewCollection.entries.length === 0)
    ) {
      setMode('edit');
      setEditSection('entries');
    }
  }, [activeCollection, activePreviewCollection, mode, previewQuery.isPending]);

  const counts = {
    archived: entries.filter((entry) => entry.status === 'archived').length,
    collections: collections.length,
    drafts: entries.filter((entry) => entry.status === 'draft').length,
    entries: entries.length,
    published: entries.filter((entry) => entry.status === 'published').length,
    scheduled: entries.filter((entry) => entry.status === 'scheduled').length,
  };

  const workflowEntries = entries.filter(
    (entry) => workflowFilter === 'all' || entry.status === workflowFilter
  );
  const workflowLanes = [
    {
      entries: entries.filter((entry) => entry.status === 'draft'),
      status: 'draft' as const,
      title: strings.draftQueue,
    },
    {
      entries: entries.filter((entry) => entry.status === 'scheduled'),
      status: 'scheduled' as const,
      title: strings.scheduledQueue,
    },
    {
      entries: entries.filter((entry) => entry.status === 'published'),
      status: 'published' as const,
      title: strings.publishedQueue,
    },
    {
      entries: entries.filter((entry) => entry.status === 'archived'),
      status: 'archived' as const,
      title: strings.archivedQueue,
    },
  ];

  const currentEntryId =
    (mode === 'preview' ? previewPrimaryEntry?.id : activeEditEntry?.id) ??
    null;
  const currentManagedEntry =
    entries.find((entry) => entry.id === currentEntryId) ?? activeEditEntry;
  const editorEntry =
    entries.find((entry) => entry.id === editorEntryId) ?? null;
  const quickTaxonomyEntry =
    entries.find((entry) => entry.id === quickTaxonomyEntryId) ?? null;
  const collectionDeleteCandidate: ExternalProjectCollection | null =
    collections.find(
      (collection) => collection.id === collectionDeleteTarget
    ) ?? null;
  const entryDeleteCandidate =
    entries.find((entry) => entry.id === entryDeleteTarget) ?? null;
  const taxonomyConfig = getCmsTaxonomyConfigForCollection(
    cmsCapabilities,
    activeCollection
  );
  const taxonomySectionCollection = getCmsTaxonomySectionCollection(
    allCollections,
    taxonomyConfig
  );
  const taxonomySectionEntry = taxonomyConfig
    ? (allEntries.find(
        (entry) =>
          entry.collection_id === taxonomySectionCollection?.id &&
          entry.slug === taxonomyConfig.sectionSlug
      ) ?? null)
    : null;
  const taxonomySectionConfig =
    taxonomyConfig && taxonomySectionCollection
      ? {
          sectionEntry: taxonomySectionEntry,
          sectionSlug: taxonomyConfig.sectionSlug,
          sectionTitle: taxonomyConfig.sectionTitle,
        }
      : null;
  const taxonomyAvailable = Boolean(taxonomySectionConfig);
  const taxonomyCategoryOptions = normalizeTaxonomyOptions(
    asProfileDataRecord(taxonomySectionConfig?.sectionEntry?.profile_data)[
      taxonomyConfig?.categoryField ?? 'categoryOptions'
    ]
  );
  const taxonomyTagOptions = normalizeTaxonomyOptions(
    asProfileDataRecord(taxonomySectionConfig?.sectionEntry?.profile_data)[
      taxonomyConfig?.tagField ?? 'tagOptions'
    ]
  );

  const updateStudioCache = (
    updater: (current: NonNullable<typeof studio>) => NonNullable<typeof studio>
  ) => {
    queryClient.setQueryData(
      getCmsStudioQueryKey(workspaceId),
      (current: typeof studio | undefined) =>
        current ? updater(current) : current
    );
  };

  const mergeEntry = (nextEntry: ExternalProjectEntry) => {
    updateStudioCache((current) => {
      const index = current.entries.findIndex(
        (entry) => entry.id === nextEntry.id
      );
      const nextEntries =
        index === -1
          ? [nextEntry, ...current.entries]
          : current.entries.map((entry) =>
              entry.id === nextEntry.id ? nextEntry : entry
            );

      return {
        ...current,
        entries: nextEntries,
      };
    });
  };

  const mergeCollection = (nextCollection: ExternalProjectCollection) => {
    updateStudioCache((current) => {
      const exists = current.collections.some(
        (collection) => collection.id === nextCollection.id
      );

      return {
        ...current,
        collections: exists
          ? current.collections.map((collection) =>
              collection.id === nextCollection.id ? nextCollection : collection
            )
          : [nextCollection, ...current.collections],
      };
    });
  };

  const openEntryEditor = (entryId: string) => {
    setSelectedEntryId(entryId);
    setEditorEntryId(entryId);
    router.replace(getCmsEntryPath(pathname, entryId));
  };

  const closeEntryEditor = () => {
    setEditorEntryId(null);
    router.replace(getCmsLibraryPath(pathname));
  };

  const openQuickTaxonomy = (entryId: string) => {
    setSelectedEntryId(entryId);
    setQuickTaxonomyEntryId(entryId);
  };

  const selectCollection = (value: string) => {
    const previewCollection = deliveryCollections.find(
      (collection) => collection.id === value
    );
    const studioCollection =
      collections.find((collection) => collection.id === value) ??
      (previewCollection
        ? collections.find(
            (collection) =>
              collection.slug === previewCollection.slug ||
              collection.title === previewCollection.title
          )
        : undefined) ??
      collections[0] ??
      null;

    if (!studioCollection) {
      return;
    }

    setSelectedCollectionId(studioCollection.id);
    setSelectedEntryId(
      entries.find((entry) => entry.collection_id === studioCollection.id)
        ?.id ?? ''
    );
  };

  const openCollectionDetails = (collectionId: string) => {
    router.push(getCmsCollectionPath(pathname, collectionId));
  };

  const handleSelectBulkEntry = (entryId: string, checked: boolean) => {
    setSelectedBulkIds((current) =>
      checked
        ? [...current, entryId]
        : current.filter((value) => value !== entryId)
    );
  };

  const createEntryMutation = useMutation({
    mutationFn: async () => {
      let createdCollection: ExternalProjectCollection | null = null;
      let collectionId = activeCollection?.id ?? collections[0]?.id ?? null;

      if (!collectionId && activeViewCreateDefaults) {
        createdCollection = await createWorkspaceExternalProjectCollection(
          workspaceId,
          {
            collection_type: activeViewCreateDefaults.collectionType,
            config: {},
            description:
              activeViewCreateDefaults.description ??
              strings.gamesCollectionDescription,
            slug:
              activeViewCreateDefaults.slug ??
              slugifyLabel(
                activeViewCreateDefaults.title,
                `collection-${Date.now()}`
              ),
            title: activeViewCreateDefaults.title,
          }
        );
        collectionId = createdCollection.id;
      }

      if (!collectionId) {
        throw new Error(strings.emptyCollection);
      }

      const targetCollection =
        createdCollection ??
        collections.find((collection) => collection.id === collectionId) ??
        null;
      const targetFieldDefinitions = getCollectionFieldDefinitions({
        collection: targetCollection,
        fieldDefinitions,
      });
      const defaultProfileData = buildDefaultFieldValues(
        targetFieldDefinitions.filter(
          (definition) => definition.field_scope === 'profile_data'
        )
      );
      const defaultMetadata = buildDefaultFieldValues(
        targetFieldDefinitions.filter(
          (definition) => definition.field_scope === 'metadata'
        )
      );

      const entry = await createWorkspaceExternalProjectEntry(workspaceId, {
        collection_id: collectionId,
        metadata: defaultMetadata as Json,
        profile_data: defaultProfileData as Json,
        scheduled_for: null,
        slug: `draft-${Date.now()}`,
        status: 'draft',
        subtitle: null,
        summary: null,
        title:
          activeViewCreateDefaults?.entryTitle ??
          (activeViewIsGames
            ? strings.gamesUntitledEntryTitle
            : strings.untitledContentTitle),
      });

      return {
        collection: createdCollection,
        entry,
      };
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : strings.createEntryAction
      ),
    onSuccess: ({ collection, entry }) => {
      if (collection) {
        mergeCollection(collection);
      }
      mergeEntry(entry);
      setSelectedCollectionId(entry.collection_id);
      setSelectedEntryId(entry.id);
      setMode('edit');
      setEditSection('entries');
      setPreviewRefreshToken((value) => value + 1);
      toast.success(strings.createEntryAction);
      openEntryEditor(entry.id);
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: async () => {
      const collectionType =
        activeViewCreateDefaults?.collectionType ??
        binding.canonical_project?.allowed_collections[0] ??
        activeCollection?.collection_type ??
        'collection';
      const title =
        newCollectionTitle.trim() ||
        activeViewCreateDefaults?.title ||
        (activeViewIsGames
          ? strings.gamesCollectionTitle
          : strings.untitledSectionTitle);
      const slug = slugifyLabel(title, `collection-${Date.now()}`);

      return createWorkspaceExternalProjectCollection(workspaceId, {
        collection_type: collectionType,
        config: {},
        description: newCollectionDescription.trim() || '',
        slug,
        title,
      });
    },
    onSuccess: (collection) => {
      updateStudioCache((current) => ({
        ...current,
        collections: [collection, ...current.collections],
      }));
      setSelectedCollectionId(collection.id);
      setCreateCollectionOpen(false);
      setNewCollectionTitle('');
      setNewCollectionDescription('');
      toast.success(strings.createCollectionAction);
    },
  });

  const applyContentModelTemplateMutation = useMutation({
    mutationFn: async (template: CmsContentModelTemplate) => {
      const existingCollection =
        collections.find((collection) => collection.slug === template.slug) ??
        null;
      const collection = existingCollection
        ? await updateWorkspaceExternalProjectCollection(
            workspaceId,
            existingCollection.id,
            {
              collection_type: template.collection_type,
              config: buildCollectionConfigFromTemplate(
                template,
                existingCollection.config
              ),
              description:
                existingCollection.description ?? template.description,
              title: existingCollection.title || template.title,
            }
          )
        : await createWorkspaceExternalProjectCollection(workspaceId, {
            collection_type: template.collection_type,
            config: buildCollectionConfigFromTemplate(template),
            description: template.description,
            slug: template.slug,
            title: template.title,
          });
      const existingKeys = new Set(
        fieldDefinitions
          .filter((definition) => definition.collection_id === collection.id)
          .map((definition) => `${definition.field_scope}:${definition.key}`)
      );
      const createdFieldDefinitions = await Promise.all(
        template.fields
          .filter(
            (field) => !existingKeys.has(`${field.field_scope}:${field.key}`)
          )
          .map((field, index) =>
            createWorkspaceExternalProjectFieldDefinition(workspaceId, {
              collection_id: collection.id,
              default_value: field.default_value,
              description: field.description,
              field_scope: field.field_scope,
              field_type: field.field_type,
              is_required: field.is_required,
              key: field.key,
              label: field.label,
              options: field.options,
              sort_order: index,
            })
          )
      );

      return {
        collection,
        createdFieldDefinitions,
      };
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : strings.contentModelTitle
      ),
    onSuccess: ({ collection, createdFieldDefinitions }) => {
      updateStudioCache((current) => ({
        ...current,
        collections: current.collections.some(
          (candidate) => candidate.id === collection.id
        )
          ? current.collections.map((candidate) =>
              candidate.id === collection.id ? collection : candidate
            )
          : [collection, ...current.collections],
        fieldDefinitions: [
          ...createdFieldDefinitions,
          ...(current.fieldDefinitions ?? []),
        ],
      }));
      setSelectedCollectionId(collection.id);
      setEditSection('content-model');
      toast.success(strings.templateAppliedToast);
    },
  });

  const deleteFieldDefinitionMutation = useMutation({
    mutationFn: async (fieldDefinitionId: string) =>
      deleteWorkspaceExternalProjectFieldDefinition(
        workspaceId,
        fieldDefinitionId
      ),
    onSuccess: (_, fieldDefinitionId) => {
      updateStudioCache((current) => ({
        ...current,
        fieldDefinitions: (current.fieldDefinitions ?? []).filter(
          (definition) => definition.id !== fieldDefinitionId
        ),
      }));
      toast.success(strings.deleteFieldDefinitionAction);
    },
  });

  const duplicateEntryMutation = useMutation({
    mutationFn: async (entryId?: string) => {
      const targetEntryId = entryId ?? currentManagedEntry?.id;
      if (!targetEntryId) {
        throw new Error(strings.emptyEntries);
      }

      return duplicateWorkspaceExternalProjectEntry(workspaceId, targetEntryId);
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      setSelectedCollectionId(entry.collection_id);
      setSelectedEntryId(entry.id);
      setPreviewRefreshToken((value) => value + 1);
      toast.success(strings.duplicateAction);
      openEntryEditor(entry.id);
    },
  });

  const publishEntryMutation = useMutation({
    mutationFn: async (payload: {
      entryId?: string;
      eventKind: 'publish' | 'unpublish';
    }) => {
      const targetEntryId = payload.entryId ?? currentManagedEntry?.id;
      if (!targetEntryId) {
        throw new Error(strings.emptyEntries);
      }

      return publishWorkspaceExternalProjectEntry(
        workspaceId,
        targetEntryId,
        payload.eventKind
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

  const quickTaxonomyMutation = useMutation({
    mutationFn: async (payload: {
      category?: string | null;
      entryId: string;
      removeCategoryOption?: string;
      removeTagOption?: string;
      tags?: string[];
    }) => {
      const entry = entries.find(
        (candidate) => candidate.id === payload.entryId
      );
      if (!entry) {
        throw new Error(strings.emptyEntries);
      }

      if (!taxonomySectionConfig || !taxonomySectionCollection) {
        throw new Error(strings.quickTaxonomyDescription);
      }
      const categoryOptionsField =
        taxonomyConfig?.categoryField ?? 'categoryOptions';
      const tagOptionsField = taxonomyConfig?.tagField ?? 'tagOptions';

      const nextProfileData = {
        ...asProfileDataRecord(entry.profile_data),
      };
      const taxonomyProfileData = {
        ...asProfileDataRecord(
          taxonomySectionConfig.sectionEntry?.profile_data
        ),
      };

      if (typeof payload.category !== 'undefined') {
        const normalizedCategory = payload.category?.trim() ?? '';
        if (normalizedCategory) {
          nextProfileData.category = normalizedCategory;
          taxonomyProfileData[categoryOptionsField] = mergeTaxonomyOptions(
            taxonomyCategoryOptions,
            [normalizedCategory]
          );
        } else {
          delete nextProfileData.category;
        }
      }

      if (payload.removeCategoryOption) {
        const removedCategory = payload.removeCategoryOption.trim();
        taxonomyProfileData[categoryOptionsField] =
          taxonomyCategoryOptions.filter((value) => value !== removedCategory);
        if (nextProfileData.category === removedCategory) {
          delete nextProfileData.category;
        }
      }

      if (typeof payload.tags !== 'undefined') {
        const normalizedTags = dedupeStrings(
          payload.tags.map((tag) => tag.trim()).filter(Boolean)
        );
        if (normalizedTags.length > 0) {
          nextProfileData.tags = normalizedTags;
          taxonomyProfileData[tagOptionsField] = mergeTaxonomyOptions(
            taxonomyTagOptions,
            normalizedTags
          );
        } else {
          delete nextProfileData.tags;
        }
      }

      if (payload.removeTagOption) {
        const removedTag = payload.removeTagOption.trim();
        taxonomyProfileData[tagOptionsField] = taxonomyTagOptions.filter(
          (value) => value !== removedTag
        );
        const nextTags = asStringArray(nextProfileData.tags).filter(
          (value) => value !== removedTag
        );
        if (nextTags.length > 0) {
          nextProfileData.tags = nextTags;
        } else {
          delete nextProfileData.tags;
        }
      }

      if (
        !Array.isArray(taxonomyProfileData[categoryOptionsField]) ||
        taxonomyProfileData[categoryOptionsField].length === 0
      ) {
        delete taxonomyProfileData[categoryOptionsField];
      }

      if (
        !Array.isArray(taxonomyProfileData[tagOptionsField]) ||
        taxonomyProfileData[tagOptionsField].length === 0
      ) {
        delete taxonomyProfileData[tagOptionsField];
      }

      const updatedEntries: ExternalProjectEntry[] = [
        await updateWorkspaceExternalProjectEntry(workspaceId, entry.id, {
          profile_data: nextProfileData as Json,
        }),
      ];

      if (taxonomySectionConfig.sectionEntry) {
        updatedEntries.push(
          await updateWorkspaceExternalProjectEntry(
            workspaceId,
            taxonomySectionConfig.sectionEntry.id,
            {
              profile_data: taxonomyProfileData as Json,
            }
          )
        );
      } else {
        updatedEntries.push(
          await createWorkspaceExternalProjectEntry(workspaceId, {
            collection_id: taxonomySectionCollection.id,
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

      return updatedEntries;
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : strings.quickTaxonomyAction
      ),
    onSuccess: (updatedEntries) => {
      updatedEntries.forEach((entry) => {
        mergeEntry(entry);
      });
      toast.success(strings.saveAction);
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => importWorkspaceExternalProjectContent(workspaceId),
    onSuccess: () => {
      toast.success(strings.importAction);
      setPreviewRefreshToken((value) => value + 1);
      queryClient.invalidateQueries({
        queryKey: getCmsStudioQueryKey(workspaceId),
      });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) =>
      deleteWorkspaceExternalProjectEntry(workspaceId, entryId),
    onSuccess: (_, entryId) => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.filter((asset) => asset.entry_id !== entryId),
        entries: current.entries.filter((entry) => entry.id !== entryId),
      }));
      setEntryDeleteTarget(null);
      if (selectedEntryId === entryId) {
        setSelectedEntryId('');
      }
      if (editorEntryId === entryId) {
        setEditorEntryId(null);
      }
      toast.success(strings.deleteEntryAction);
    },
  });

  const deleteCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) =>
      deleteWorkspaceExternalProjectCollection(workspaceId, collectionId),
    onSuccess: (_, collectionId) => {
      updateStudioCache((current) => ({
        ...current,
        assets: current.assets.filter((asset) => {
          const assetEntry = current.entries.find(
            (entry) => entry.id === asset.entry_id
          );
          return assetEntry?.collection_id !== collectionId;
        }),
        collections: current.collections.filter(
          (collection) => collection.id !== collectionId
        ),
        entries: current.entries.filter(
          (entry) => entry.collection_id !== collectionId
        ),
      }));
      if (selectedCollectionId === collectionId) {
        setSelectedCollectionId('');
        setSelectedEntryId('');
      }
      setCollectionDeleteTarget(null);
      toast.success(strings.deleteCollectionAction);
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (payload: {
      action:
        | 'archive'
        | 'publish'
        | 'restore-draft'
        | 'schedule'
        | 'set-status'
        | 'unpublish';
      scheduledFor?: string | null;
      status?: ExternalProjectEntry['status'];
    }) =>
      bulkUpdateWorkspaceExternalProjectEntries(workspaceId, {
        action: payload.action,
        entryIds: selectedBulkIds,
        scheduledFor: payload.scheduledFor,
        status: payload.status,
      }),
    onSuccess: (updatedEntries) => {
      updateStudioCache((current) => ({
        ...current,
        entries: current.entries.map(
          (entry) =>
            updatedEntries.find((updated) => updated.id === entry.id) ?? entry
        ),
      }));
      setSelectedBulkIds([]);
      setPreviewRefreshToken((value) => value + 1);
    },
  });

  const librarySectionProps: CmsLibrarySectionProps = {
    activeCollection,
    availableEditSections,
    assets,
    binding,
    collections,
    counts,
    createEntryHint:
      !activeCollection && activeViewIsGames
        ? strings.gamesAutoCreateCollectionHint
        : !activeCollection
          ? activeViewEmptyHint
          : undefined,
    createEntryPending: createEntryMutation.isPending,
    deleteFieldDefinitionPending: deleteFieldDefinitionMutation.isPending,
    editSection,
    entries: visibleEntries,
    fieldDefinitions,
    importPending: importMutation.isPending,
    onApplyContentModelTemplate: (template) =>
      applyContentModelTemplateMutation.mutate(template),
    onChangeEditSection: setEditSection,
    onCreateCollection: () => setCreateCollectionOpen(true),
    onCreateEntry: () => createEntryMutation.mutate(),
    onDeleteCollection: setCollectionDeleteTarget,
    onDeleteEntry: setEntryDeleteTarget,
    onDeleteFieldDefinition: (fieldDefinitionId) =>
      deleteFieldDefinitionMutation.mutate(fieldDefinitionId),
    onDuplicateEntry: (entryId) => duplicateEntryMutation.mutate(entryId),
    onImport: () => importMutation.mutate(),
    onOpenCollection: openCollectionDetails,
    onOpenEntry: openEntryEditor,
    onOpenQuickTaxonomy: openQuickTaxonomy,
    onPublishEntry: (payload) => publishEntryMutation.mutate(payload),
    onSearchChange: setSearch,
    onSelectBulkEntry: handleSelectBulkEntry,
    onSelectCollection: selectCollection,
    onSetWorkflowFilter: setWorkflowFilter,
    onSetWorkflowScheduleValue: setScheduleValue,
    onWorkflowAction: (payload) => bulkMutation.mutate(payload),
    publishEvents,
    queryPending: studioQuery.isPending && !studio,
    quickTaxonomyPending: quickTaxonomyMutation.isPending,
    scheduleValue,
    search,
    selectedBulkIds,
    selectedEntryId,
    strings,
    surface:
      activeCollectionView?.id === 'landing'
        ? 'landing'
        : activeCollectionView?.id === 'games'
          ? 'games'
          : 'library',
    taxonomyAvailable,
    templatePending: applyContentModelTemplateMutation.isPending,
    workflowEntries,
    workflowFilter,
    workflowLanes,
  };

  return (
    <div className="min-h-[calc(100svh-5rem)] space-y-4 pb-6">
      <CmsStudioHeader
        activeCollection={activeCollection}
        description={
          headerDescription ??
          binding.canonical_project?.display_name ??
          previewProjectLabel
        }
        importPending={importMutation.isPending}
        mode={mode}
        onCreateCollection={() => setCreateCollectionOpen(true)}
        onCreateEntry={() => createEntryMutation.mutate()}
        onDeleteCollection={setCollectionDeleteTarget}
        onEditCollection={openCollectionDetails}
        onImport={() => importMutation.mutate()}
        onModeChange={setMode}
        title={headerTitle}
        onRefresh={() => {
          setPreviewRefreshToken((value) => value + 1);
          queryClient.invalidateQueries({
            queryKey: getCmsStudioQueryKey(workspaceId),
          });
        }}
        showModeSwitch={showModeSwitch}
        strings={strings}
      />

      <CmsCreateCollectionDialog
        description={newCollectionDescription}
        onConfirm={() => createCollectionMutation.mutate()}
        onDescriptionChange={setNewCollectionDescription}
        onOpenChange={setCreateCollectionOpen}
        onTitleChange={setNewCollectionTitle}
        open={createCollectionOpen}
        pending={createCollectionMutation.isPending}
        title={newCollectionTitle}
        strings={strings}
      />

      <CmsDeleteEntryDialog
        candidate={entryDeleteCandidate}
        onConfirm={() => {
          if (entryDeleteCandidate) {
            deleteEntryMutation.mutate(entryDeleteCandidate.id);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setEntryDeleteTarget(null);
          }
        }}
        open={Boolean(entryDeleteCandidate)}
        strings={strings}
      />

      <CmsDeleteCollectionDialog
        candidate={collectionDeleteCandidate}
        onConfirm={() => {
          if (collectionDeleteCandidate) {
            deleteCollectionMutation.mutate(collectionDeleteCandidate.id);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setCollectionDeleteTarget(null);
          }
        }}
        open={Boolean(collectionDeleteCandidate)}
        strings={strings}
      />

      {mode === 'preview' ? (
        <CmsPreviewSection
          activePreviewCollection={activePreviewCollection}
          deliveryCollections={deliveryCollections}
          entries={entries}
          onOpenEntry={openEntryEditor}
          onSelectCollection={selectCollection}
          previewEntries={previewEntries}
          previewProjectLabel={previewProjectLabel}
          previewQueryPending={previewQuery.isPending}
          strings={strings}
        />
      ) : (
        <CmsLibrarySection {...librarySectionProps} />
      )}

      <CmsLibraryTaxonomyDialog
        categoryOptions={taxonomyCategoryOptions}
        entry={quickTaxonomyEntry ?? activeEditEntry}
        onCreateCategory={(value) => {
          const targetEntryId = quickTaxonomyEntry?.id ?? activeEditEntry?.id;
          if (!targetEntryId) {
            return;
          }
          quickTaxonomyMutation.mutate({
            category: value.trim(),
            entryId: targetEntryId,
          });
        }}
        onCreateTags={(value) => {
          const targetEntry = quickTaxonomyEntry ?? activeEditEntry;
          if (!targetEntry) {
            return;
          }
          const currentTags = dedupeStrings(
            asStringArray(asProfileDataRecord(targetEntry.profile_data).tags)
          );
          quickTaxonomyMutation.mutate({
            entryId: targetEntry.id,
            tags: dedupeStrings([...currentTags, ...parseTaxonomyDraft(value)]),
          });
        }}
        onDeleteCategoryOption={(value) => {
          const targetEntryId = quickTaxonomyEntry?.id ?? activeEditEntry?.id;
          if (!targetEntryId) {
            return;
          }
          quickTaxonomyMutation.mutate({
            entryId: targetEntryId,
            removeCategoryOption: value,
          });
        }}
        onDeleteTagOption={(value) => {
          const targetEntryId = quickTaxonomyEntry?.id ?? activeEditEntry?.id;
          if (!targetEntryId) {
            return;
          }
          quickTaxonomyMutation.mutate({
            entryId: targetEntryId,
            removeTagOption: value,
          });
        }}
        onOpenChange={(open) => {
          if (!open) {
            setQuickTaxonomyEntryId(null);
          }
        }}
        onSetCategory={(value) => {
          const targetEntryId = quickTaxonomyEntry?.id ?? activeEditEntry?.id;
          if (!targetEntryId) {
            return;
          }
          quickTaxonomyMutation.mutate({
            category: value.trim() ? value : null,
            entryId: targetEntryId,
          });
        }}
        onSetTags={(value) => {
          const targetEntryId = quickTaxonomyEntry?.id ?? activeEditEntry?.id;
          if (!targetEntryId) {
            return;
          }
          quickTaxonomyMutation.mutate({
            entryId: targetEntryId,
            tags: value,
          });
        }}
        open={Boolean(quickTaxonomyEntryId)}
        pending={quickTaxonomyMutation.isPending}
        strings={strings}
        tagOptions={taxonomyTagOptions}
      />

      {editorEntry ? (
        <EntryDetailClient
          binding={binding}
          cmsGamesEnabled={cmsGamesEnabled}
          entryId={editorEntry.id}
          onDeleted={closeEntryEditor}
          onEntryChange={(nextEntryId) => {
            setSelectedEntryId(nextEntryId);
            setEditorEntryId(nextEntryId);
            router.replace(getCmsEntryPath(pathname, nextEntryId));
          }}
          onOpenChange={(open) => {
            if (!open) {
              closeEntryEditor();
            }
          }}
          open={Boolean(editorEntryId)}
          strings={strings}
          variant="dialog"
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  );
}
