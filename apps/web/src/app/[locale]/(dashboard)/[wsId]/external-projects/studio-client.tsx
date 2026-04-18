'use client';

import { useMutation } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  FolderSync,
  Sparkles,
} from '@tuturuuu/icons';
import {
  createWorkspaceExternalProjectAsset,
  createWorkspaceExternalProjectBlock,
  createWorkspaceExternalProjectEntry,
  getWorkspaceExternalProjectStudio,
  importWorkspaceExternalProjectContent,
  publishWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectAsset,
  updateWorkspaceExternalProjectBlock,
  updateWorkspaceExternalProjectCollection,
  updateWorkspaceExternalProjectEntry,
  uploadWorkspaceExternalProjectAssetFile,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectBlock,
  ExternalProjectCollection,
  ExternalProjectDeliveryPayload,
  ExternalProjectEntry,
  ExternalProjectImportJob,
  ExternalProjectLoadingData,
  ExternalProjectPublishEvent,
  ExternalProjectStudioAsset,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityPanel,
  ContentRail,
  EditorPanel,
  EmptyPanel,
  EntryCard,
  EntryList,
  MetricCard,
  PreviewPanel,
  RailCollectionButton,
  RailSection,
  StatusBadge,
  StudioActionBar,
  StudioHero,
  StudioShell,
} from './studio-shell';
import { useExternalProjectLivePreview } from './use-external-project-live-preview';

type Strings = {
  actionFailedToast: string;
  activityDescription: string;
  activityTab: string;
  adapterBlueprintLabel: string;
  assetMetadataLabel: string;
  addArtwork: string;
  addEntry: string;
  addLoreCapsule: string;
  addSection: string;
  allItemsLabel: string;
  assetPathLabel: string;
  artworkLinkLabel: string;
  artworksTab: string;
  bodyLabel: string;
  categoryLabel: string;
  channelLabel: string;
  collectionDisabledLabel: string;
  collectionEmptyDescription: string;
  collectionEmptyTitle: string;
  collectionEnabledLabel: string;
  collectionsMetricLabel: string;
  collectionsTitle: string;
  collectionSelectLabel: string;
  collectionSettingsDescription: string;
  collectionSettingsTitle: string;
  contentTab: string;
  contentRailDescription: string;
  contentRailTitle: string;
  dateLabel: string;
  dirtyChangesLabel: string;
  deliveryPreviewDescription: string;
  deliveryPreviewTitle: string;
  descriptionLabel: string;
  detailPanelDescription: string;
  detailPanelTitle: string;
  draftBadge: string;
  draftsMetricLabel: string;
  emptyPreviewDescription: string;
  emptyPreviewTitle: string;
  entriesMetricLabel: string;
  entryFormDescription: string;
  entryMetadataLabel: string;
  excerptLabel: string;
  featuredArtworkLabel: string;
  heightLabel: string;
  imageAltLabel: string;
  importAction: string;
  importCompleteToast: string;
  importJobsEmpty: string;
  importJobsTitle: string;
  invalidJsonLabel: string;
  labelLabel: string;
  linkedArtworkMissingDescription: string;
  loreQueueLabel: string;
  loreTab: string;
  mediaDescription: string;
  mediaSectionTitle: string;
  noAdapterEditorDescription: string;
  noAdapterEditorTitle: string;
  noImageDescription: string;
  noImageTitle: string;
  noItemsDescription: string;
  noItemsTitle: string;
  noSearchResultsDescription: string;
  noSearchResultsTitle: string;
  noteLabel: string;
  notAvailableLabel: string;
  openEditorAction: string;
  openPreviewAction: string;
  operationsDescription: string;
  orientationLabel: string;
  payloadSectionsLabel: string;
  payloadTabLabel: string;
  pendingLabel: string;
  previewErrorDescription: string;
  previewErrorTitle: string;
  previewLoadingLabel: string;
  profileDataLabel: string;
  profileLabel: string;
  publish: string;
  publishEventsEmpty: string;
  publishEventsTitle: string;
  publishedBadge: string;
  publishedMetricLabel: string;
  rarityLabel: string;
  refreshHint: string;
  remoteSourceLabel: string;
  renderedTabLabel: string;
  saveChanges: string;
  saveSuccessToast: string;
  savingLabel: string;
  searchPlaceholder: string;
  sectionBodyLabel: string;
  sectionsLabel: string;
  sectionsTab: string;
  slugLabel: string;
  statusLabel: string;
  studioActionDescription: string;
  studioTitle: string;
  subtitleLabel: string;
  summaryDescription: string;
  summaryLabel: string;
  tagsLabel: string;
  teaserLabel: string;
  titleLabel: string;
  typeLabel: string;
  unpublish: string;
  uploadAction: string;
  uploadCompleteToast: string;
  widthLabel: string;
  yearLabel: string;
};

type StudioTab = 'artworks' | 'lore-capsules' | 'singleton-sections';

function formatCanonicalToken(value: string) {
  return value
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatActivityTime(
  value: string | null | undefined,
  pendingLabel: string
) {
  if (!value) return pendingLabel;
  return new Date(value).toLocaleString();
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeSlugSeed(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function getMarkdownBlock(blocks: ExternalProjectBlock[]) {
  return (
    blocks.find(
      (block) =>
        block.block_type === 'markdown' &&
        typeof asRecord(block.content).markdown === 'string'
    ) ?? null
  );
}

function createDraftSlug(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function buildArtworkDraft(
  entry: ExternalProjectEntry,
  asset: ExternalProjectStudioAsset | null
) {
  const profile = asRecord(entry.profile_data);

  return {
    altText: asset?.alt_text ?? '',
    category: asString(profile.category),
    height: asString(profile.height),
    label: asString(profile.label),
    note: asString(profile.note),
    orientation: asString(profile.orientation),
    rarity: asString(profile.rarity),
    slug: entry.slug,
    sourceUrl: asset?.source_url ?? '',
    summary: entry.summary ?? '',
    title: entry.title,
    width: asString(profile.width),
    year: asString(profile.year),
  };
}

function buildLoreDraft(
  entry: ExternalProjectEntry,
  markdownBlock: ExternalProjectBlock | null
) {
  const profile = asRecord(entry.profile_data);

  return {
    artworkSlug: asString(profile.artworkSlug),
    body: asString(asRecord(markdownBlock?.content).markdown),
    channel: asString(profile.channel),
    date: asString(profile.date),
    slug: entry.slug,
    status: asString(profile.status),
    summary: entry.summary ?? '',
    tags: asStringArray(profile.tags).join(', '),
    teaser: asString(profile.teaser),
    title: entry.title,
  };
}

function buildSectionDraft(
  entry: ExternalProjectEntry,
  markdownBlock: ExternalProjectBlock | null
) {
  return {
    body: asString(asRecord(markdownBlock?.content).markdown),
    slug: entry.slug,
    summary: entry.summary ?? '',
    title: entry.title,
  };
}

function buildCollectionDraft(collection: ExternalProjectCollection | null) {
  return {
    description: collection?.description ?? '',
    isEnabled: collection?.is_enabled ?? true,
    title: collection?.title ?? '',
  };
}

function formatJsonDraft(value: unknown) {
  return JSON.stringify(asRecord(value), null, 2);
}

function parseJsonObjectDraft(value: string, invalidJsonLabel: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(invalidJsonLabel);
    }

    return parsed as Record<string, Json | undefined>;
  } catch {
    throw new Error(invalidJsonLabel);
  }
}

function buildGenericEntryDraft(
  entry: ExternalProjectEntry,
  markdownBlock: ExternalProjectBlock | null
) {
  return {
    body: asString(asRecord(markdownBlock?.content).markdown),
    metadataJson: formatJsonDraft(entry.metadata),
    profileDataJson: formatJsonDraft(entry.profile_data),
    slug: entry.slug,
    subtitle: entry.subtitle ?? '',
    summary: entry.summary ?? '',
    title: entry.title,
  };
}

function buildGenericAssetDraft(asset: ExternalProjectStudioAsset | null) {
  return {
    altText: asset?.alt_text ?? '',
    metadataJson: formatJsonDraft(asset?.metadata),
    sourceUrl: asset?.source_url ?? '',
  };
}

function inferAssetType(file: File) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

function includesQuery(value: string | null | undefined, query: string) {
  if (!query) return true;
  return value?.toLowerCase().includes(query) ?? false;
}

function findMarkdownForEntry(entryId: string, blocks: ExternalProjectBlock[]) {
  return asString(
    asRecord(
      getMarkdownBlock(blocks.filter((block) => block.entry_id === entryId))
        ?.content
    ).markdown
  );
}

function ActivityPanels({
  importJobs,
  publishEvents,
  strings,
}: {
  importJobs: ExternalProjectImportJob[];
  publishEvents: ExternalProjectPublishEvent[];
  strings: Pick<
    Strings,
    | 'importJobsEmpty'
    | 'importJobsTitle'
    | 'pendingLabel'
    | 'publishEventsEmpty'
    | 'publishEventsTitle'
  >;
}) {
  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-background/30 shadow-none">
        <CardHeader>
          <CardTitle>{strings.importJobsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {importJobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {strings.importJobsEmpty}
            </p>
          ) : (
            <div className="space-y-3">
              {importJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl border border-border/70 bg-card/70 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">
                      {formatCanonicalToken(job.adapter)}
                    </div>
                    <Badge variant="secondary">
                      {formatCanonicalToken(job.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 text-muted-foreground text-xs">
                    {formatActivityTime(
                      job.completed_at ?? job.started_at ?? job.created_at,
                      strings.pendingLabel
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-background/30 shadow-none">
        <CardHeader>
          <CardTitle>{strings.publishEventsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {publishEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {strings.publishEventsEmpty}
            </p>
          ) : (
            <div className="space-y-3">
              {publishEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-border/70 bg-card/70 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">
                      {formatCanonicalToken(event.event_kind)}
                    </div>
                    <Badge variant="outline">{event.visibility_scope}</Badge>
                  </div>
                  <div className="mt-2 text-muted-foreground text-xs">
                    {formatActivityTime(event.created_at, strings.pendingLabel)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ExternalProjectStudioClient({
  assets,
  binding,
  blocks,
  collections,
  entries,
  importJobs,
  loadingData,
  publishEvents,
  strings,
  workspaceId,
}: {
  assets: ExternalProjectStudioAsset[];
  binding: WorkspaceExternalProjectBinding;
  blocks: ExternalProjectBlock[];
  collections: ExternalProjectCollection[];
  entries: ExternalProjectEntry[];
  importJobs: ExternalProjectImportJob[];
  loadingData: ExternalProjectLoadingData | null;
  publishEvents: ExternalProjectPublishEvent[];
  strings: Strings;
  workspaceId: string;
}) {
  const router = useRouter();
  const assetUploadInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<StudioTab>('artworks');
  const [searchQuery, setSearchQuery] = useState('');
  const [artworkCategoryFilter, setArtworkCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'draft' | 'published'
  >('all');
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(collections[0]?.id ?? null);

  const artworksCollection =
    collections.find(
      (collection) => collection.collection_type === 'artworks'
    ) ?? null;
  const loreCollection =
    collections.find(
      (collection) => collection.collection_type === 'lore-capsules'
    ) ?? null;
  const singletonCollection =
    collections.find(
      (collection) => collection.collection_type === 'singleton-sections'
    ) ?? null;

  const artworkEntries = artworksCollection
    ? entries.filter((entry) => entry.collection_id === artworksCollection.id)
    : [];
  const loreEntries = loreCollection
    ? entries.filter((entry) => entry.collection_id === loreCollection.id)
    : [];
  const singletonEntries = singletonCollection
    ? entries.filter((entry) => entry.collection_id === singletonCollection.id)
    : [];
  const genericActiveCollection =
    collections.find((collection) => collection.id === selectedCollectionId) ??
    collections[0] ??
    null;
  const genericCollectionEntries = genericActiveCollection
    ? entries.filter(
        (entry) => entry.collection_id === genericActiveCollection.id
      )
    : [];

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const filterByStatus = (entry: ExternalProjectEntry) =>
    statusFilter === 'all' ? true : entry.status === statusFilter;

  const filteredArtworkEntries = artworkEntries.filter((entry) => {
    const profile = asRecord(entry.profile_data);
    const matchesCategory =
      artworkCategoryFilter === 'all' ||
      asString(profile.category) === artworkCategoryFilter;
    const matchesQuery =
      includesQuery(entry.title, normalizedQuery) ||
      includesQuery(entry.slug, normalizedQuery) ||
      includesQuery(entry.summary, normalizedQuery) ||
      includesQuery(asString(profile.label), normalizedQuery) ||
      includesQuery(asString(profile.note), normalizedQuery) ||
      includesQuery(asString(profile.category), normalizedQuery);

    return filterByStatus(entry) && matchesCategory && matchesQuery;
  });

  const filteredLoreEntries = loreEntries.filter((entry) => {
    const profile = asRecord(entry.profile_data);
    const markdown = findMarkdownForEntry(entry.id, blocks);
    const matchesQuery =
      includesQuery(entry.title, normalizedQuery) ||
      includesQuery(entry.slug, normalizedQuery) ||
      includesQuery(entry.summary, normalizedQuery) ||
      includesQuery(asString(profile.channel), normalizedQuery) ||
      includesQuery(asString(profile.status), normalizedQuery) ||
      includesQuery(asString(profile.teaser), normalizedQuery) ||
      includesQuery(markdown, normalizedQuery) ||
      asStringArray(profile.tags).some((tag) =>
        tag.toLowerCase().includes(normalizedQuery)
      );

    return filterByStatus(entry) && matchesQuery;
  });

  const filteredSingletonEntries = singletonEntries.filter((entry) => {
    const markdown = findMarkdownForEntry(entry.id, blocks);
    const matchesQuery =
      includesQuery(entry.title, normalizedQuery) ||
      includesQuery(entry.slug, normalizedQuery) ||
      includesQuery(entry.summary, normalizedQuery) ||
      includesQuery(markdown, normalizedQuery);

    return filterByStatus(entry) && matchesQuery;
  });

  const filteredGenericEntries = genericCollectionEntries.filter((entry) => {
    const markdown = findMarkdownForEntry(entry.id, blocks);
    const matchesQuery =
      includesQuery(entry.title, normalizedQuery) ||
      includesQuery(entry.subtitle, normalizedQuery) ||
      includesQuery(entry.slug, normalizedQuery) ||
      includesQuery(entry.summary, normalizedQuery) ||
      includesQuery(markdown, normalizedQuery);

    return filterByStatus(entry) && matchesQuery;
  });

  const currentTabEntries =
    activeTab === 'artworks'
      ? filteredArtworkEntries
      : activeTab === 'lore-capsules'
        ? filteredLoreEntries
        : filteredSingletonEntries;

  const initialEntryId =
    artworkEntries[0]?.id ??
    loreEntries[0]?.id ??
    singletonEntries[0]?.id ??
    genericCollectionEntries[0]?.id ??
    null;
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    initialEntryId
  );

  useEffect(() => {
    if (
      !selectedCollectionId ||
      !collections.some((collection) => collection.id === selectedCollectionId)
    ) {
      setSelectedCollectionId(collections[0]?.id ?? null);
    }
  }, [collections, selectedCollectionId]);

  useEffect(() => {
    if (!selectedEntryId && initialEntryId) {
      setSelectedEntryId(initialEntryId);
    }
  }, [initialEntryId, selectedEntryId]);

  useEffect(() => {
    if (binding.adapter !== 'yoola') {
      if (filteredGenericEntries.length === 0) {
        setSelectedEntryId(null);
        return;
      }

      if (
        !filteredGenericEntries.some((entry) => entry.id === selectedEntryId)
      ) {
        setSelectedEntryId(filteredGenericEntries[0]?.id ?? null);
      }

      return;
    }

    if (currentTabEntries.length === 0) {
      setSelectedEntryId(null);
      return;
    }

    if (!currentTabEntries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(currentTabEntries[0]?.id ?? null);
    }
  }, [
    binding.adapter,
    currentTabEntries,
    filteredGenericEntries,
    selectedEntryId,
  ]);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const selectedCollection =
    collections.find(
      (collection) => collection.id === selectedEntry?.collection_id
    ) ?? null;
  const activeCollection =
    binding.adapter === 'yoola'
      ? activeTab === 'artworks'
        ? artworksCollection
        : activeTab === 'lore-capsules'
          ? loreCollection
          : singletonCollection
      : genericActiveCollection;

  const selectedBlocks = selectedEntry
    ? blocks.filter((block) => block.entry_id === selectedEntry.id)
    : [];
  const selectedAssets = selectedEntry
    ? assets.filter((asset) => asset.entry_id === selectedEntry.id)
    : [];
  const markdownBlock = getMarkdownBlock(selectedBlocks);
  const leadAsset =
    selectedAssets.find((asset) => asset.asset_type === 'image') ??
    selectedAssets[0] ??
    null;
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(
    selectedAssets[0]?.id ?? null
  );
  const selectedAsset =
    selectedAssets.find((asset) => asset.id === selectedAssetId) ??
    selectedAssets[0] ??
    null;

  const [artworkDraft, setArtworkDraft] = useState(
    selectedEntry && selectedCollection?.collection_type === 'artworks'
      ? buildArtworkDraft(selectedEntry, leadAsset)
      : {
          altText: '',
          category: '',
          height: '',
          label: '',
          note: '',
          orientation: '',
          rarity: '',
          slug: '',
          sourceUrl: '',
          summary: '',
          title: '',
          width: '',
          year: '',
        }
  );
  const [loreDraft, setLoreDraft] = useState(
    selectedEntry && selectedCollection?.collection_type === 'lore-capsules'
      ? buildLoreDraft(selectedEntry, markdownBlock)
      : {
          artworkSlug: '',
          body: '',
          channel: '',
          date: '',
          slug: '',
          status: '',
          summary: '',
          tags: '',
          teaser: '',
          title: '',
        }
  );
  const [sectionDraft, setSectionDraft] = useState(
    selectedEntry &&
      selectedCollection?.collection_type === 'singleton-sections'
      ? buildSectionDraft(selectedEntry, markdownBlock)
      : {
          body: '',
          slug: '',
          summary: '',
          title: '',
        }
  );
  const [collectionDraft, setCollectionDraft] = useState(
    buildCollectionDraft(activeCollection)
  );
  const [genericEntryDraft, setGenericEntryDraft] = useState(
    selectedEntry && binding.adapter !== 'yoola'
      ? buildGenericEntryDraft(selectedEntry, markdownBlock)
      : {
          body: '',
          metadataJson: '{}',
          profileDataJson: '{}',
          slug: '',
          subtitle: '',
          summary: '',
          title: '',
        }
  );
  const [genericAssetDraft, setGenericAssetDraft] = useState(
    buildGenericAssetDraft(selectedAsset)
  );
  const [entryEditorOpen, setEntryEditorOpen] = useState(false);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);

  useEffect(() => {
    if (selectedEntry && selectedCollection?.collection_type === 'artworks') {
      setArtworkDraft(buildArtworkDraft(selectedEntry, leadAsset));
    }
  }, [leadAsset, selectedCollection?.collection_type, selectedEntry]);

  useEffect(() => {
    if (
      selectedEntry &&
      selectedCollection?.collection_type === 'lore-capsules'
    ) {
      setLoreDraft(buildLoreDraft(selectedEntry, markdownBlock));
    }
  }, [markdownBlock, selectedCollection?.collection_type, selectedEntry]);

  useEffect(() => {
    if (
      selectedEntry &&
      selectedCollection?.collection_type === 'singleton-sections'
    ) {
      setSectionDraft(buildSectionDraft(selectedEntry, markdownBlock));
    }
  }, [markdownBlock, selectedCollection?.collection_type, selectedEntry]);

  useEffect(() => {
    setCollectionDraft(buildCollectionDraft(activeCollection));
  }, [activeCollection]);

  useEffect(() => {
    if (binding.adapter !== 'yoola' && selectedEntry) {
      setGenericEntryDraft(
        buildGenericEntryDraft(selectedEntry, markdownBlock)
      );
      setSelectedCollectionId(selectedEntry.collection_id);
    }
  }, [binding.adapter, markdownBlock, selectedEntry]);

  useEffect(() => {
    if (binding.adapter === 'yoola') {
      return;
    }

    if (selectedAssets.length === 0) {
      setSelectedAssetId(null);
      return;
    }

    if (!selectedAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(selectedAssets[0]?.id ?? null);
    }
  }, [binding.adapter, selectedAssetId, selectedAssets]);

  useEffect(() => {
    if (binding.adapter !== 'yoola') {
      setGenericAssetDraft(buildGenericAssetDraft(selectedAsset));
    }
  }, [binding.adapter, selectedAsset]);

  useEffect(() => {
    if (!selectedEntry) {
      setEntryEditorOpen(false);
    }
  }, [selectedEntry]);

  const publishedCount = entries.filter(
    (entry) => entry.status === 'published'
  ).length;
  const draftCount = entries.filter(
    (entry) => entry.status !== 'published'
  ).length;
  const livePreviewQuery = useExternalProjectLivePreview({
    enabled: Boolean(selectedEntryId),
    refreshToken: previewRefreshToken,
    selectedEntryId,
    workspaceId,
  });

  const refreshStudio = async () => {
    await getWorkspaceExternalProjectStudio(workspaceId).catch(() => null);
    setPreviewRefreshToken((current) => current + 1);
    router.refresh();
  };

  const openEntryEditor = (entryId?: string | null) => {
    if (entryId) {
      setSelectedEntryId(entryId);
    }

    setEntryEditorOpen(true);
  };

  const handleMutationError = (error: unknown) => {
    toast.error(
      error instanceof Error && error.message
        ? error.message
        : strings.actionFailedToast
    );
  };

  const importMutation = useMutation({
    mutationFn: async () => importWorkspaceExternalProjectContent(workspaceId),
    onError: handleMutationError,
    onSuccess: async () => {
      toast.success(strings.importCompleteToast);
      await refreshStudio();
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: async (kind: StudioTab) => {
      const targetCollection =
        kind === 'artworks'
          ? artworksCollection
          : kind === 'lore-capsules'
            ? loreCollection
            : singletonCollection;

      if (!targetCollection) {
        throw new Error(strings.collectionEmptyDescription);
      }

      const nowSlug = createDraftSlug(
        kind === 'artworks'
          ? 'artwork'
          : kind === 'lore-capsules'
            ? 'capsule'
            : 'section'
      );

      const payload =
        kind === 'artworks'
          ? {
              collection_id: targetCollection.id,
              metadata: {},
              profile_data: {
                category: 'SPEED',
                rarity: 'R',
                year: new Date().getFullYear().toString(),
              },
              slug: nowSlug,
              status: 'draft' as const,
              subtitle: null,
              summary: '',
              title: 'Untitled Artwork',
            }
          : kind === 'lore-capsules'
            ? {
                collection_id: targetCollection.id,
                metadata: {},
                profile_data: {
                  artworkSlug: artworkEntries[0]?.slug ?? '',
                  channel: 'Draft Capsule',
                  date: '',
                  status: 'STAGING',
                  tags: [],
                  teaser: '',
                },
                slug: nowSlug,
                status: 'draft' as const,
                subtitle: null,
                summary: '',
                title: 'Untitled Capsule',
              }
            : {
                collection_id: targetCollection.id,
                metadata: {},
                profile_data: {},
                slug: nowSlug,
                status: 'draft' as const,
                subtitle: null,
                summary: '',
                title: 'Untitled Section',
              };

      return createWorkspaceExternalProjectEntry(workspaceId, payload);
    },
    onError: handleMutationError,
    onSuccess: async (entry) => {
      setSelectedEntryId(entry.id);
      setEntryEditorOpen(true);
      toast.success(strings.saveSuccessToast);
      await refreshStudio();
    },
  });

  const saveCollectionMutation = useMutation({
    mutationFn: async () => {
      if (!activeCollection) {
        throw new Error(strings.collectionEmptyDescription);
      }

      return updateWorkspaceExternalProjectCollection(
        workspaceId,
        activeCollection.id,
        {
          description: collectionDraft.description || null,
          is_enabled: collectionDraft.isEnabled,
          title: collectionDraft.title,
        }
      );
    },
    onError: handleMutationError,
    onSuccess: async () => {
      toast.success(strings.saveSuccessToast);
      await refreshStudio();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEntry || !selectedCollection) {
        throw new Error(strings.noItemsDescription);
      }

      if (selectedCollection.collection_type === 'artworks') {
        await updateWorkspaceExternalProjectEntry(
          workspaceId,
          selectedEntry.id,
          {
            profile_data: {
              category: artworkDraft.category,
              height: artworkDraft.height ? Number(artworkDraft.height) : null,
              label: artworkDraft.label,
              note: artworkDraft.note,
              orientation: artworkDraft.orientation,
              rarity: artworkDraft.rarity,
              width: artworkDraft.width ? Number(artworkDraft.width) : null,
              year: artworkDraft.year,
            },
            slug: normalizeSlugSeed(artworkDraft.slug) || selectedEntry.slug,
            summary: artworkDraft.summary || null,
            title: artworkDraft.title,
          }
        );

        if (leadAsset) {
          await updateWorkspaceExternalProjectAsset(workspaceId, leadAsset.id, {
            alt_text: artworkDraft.altText || null,
            source_url: artworkDraft.sourceUrl || null,
          });
        }

        return;
      }

      if (selectedCollection.collection_type === 'lore-capsules') {
        await updateWorkspaceExternalProjectEntry(
          workspaceId,
          selectedEntry.id,
          {
            profile_data: {
              artworkSlug: loreDraft.artworkSlug,
              channel: loreDraft.channel,
              date: loreDraft.date,
              status: loreDraft.status,
              tags: loreDraft.tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
              teaser: loreDraft.teaser,
            },
            slug: normalizeSlugSeed(loreDraft.slug) || selectedEntry.slug,
            summary: loreDraft.summary || null,
            title: loreDraft.title,
          }
        );

        if (markdownBlock) {
          await updateWorkspaceExternalProjectBlock(
            workspaceId,
            markdownBlock.id,
            {
              content: {
                markdown: loreDraft.body,
              },
              title: strings.excerptLabel,
            }
          );
        } else {
          await createWorkspaceExternalProjectBlock(workspaceId, {
            block_type: 'markdown',
            content: {
              markdown: loreDraft.body,
            },
            entry_id: selectedEntry.id,
            sort_order: 0,
            title: strings.excerptLabel,
          });
        }

        return;
      }

      await updateWorkspaceExternalProjectEntry(workspaceId, selectedEntry.id, {
        profile_data: {},
        slug: normalizeSlugSeed(sectionDraft.slug) || selectedEntry.slug,
        summary: sectionDraft.summary || null,
        title: sectionDraft.title,
      });

      if (markdownBlock) {
        await updateWorkspaceExternalProjectBlock(
          workspaceId,
          markdownBlock.id,
          {
            content: {
              markdown: sectionDraft.body,
            },
            title: strings.sectionBodyLabel,
          }
        );
      } else {
        await createWorkspaceExternalProjectBlock(workspaceId, {
          block_type: 'markdown',
          content: {
            markdown: sectionDraft.body,
          },
          entry_id: selectedEntry.id,
          sort_order: 0,
          title: strings.sectionBodyLabel,
        });
      }
    },
    onError: handleMutationError,
    onSuccess: async () => {
      toast.success(strings.saveSuccessToast);
      await refreshStudio();
    },
  });

  const createGenericEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeCollection) {
        throw new Error(strings.collectionEmptyDescription);
      }

      return createWorkspaceExternalProjectEntry(workspaceId, {
        collection_id: activeCollection.id,
        metadata: {},
        profile_data: {},
        slug: createDraftSlug(
          normalizeSlugSeed(activeCollection.collection_type) || 'entry'
        ),
        status: 'draft',
        subtitle: null,
        summary: '',
        title: `Untitled ${formatCanonicalToken(
          activeCollection.collection_type
        ).replace(/s$/, '')}`,
      });
    },
    onError: handleMutationError,
    onSuccess: async (entry) => {
      setSelectedCollectionId(entry.collection_id);
      setSelectedEntryId(entry.id);
      toast.success(strings.saveSuccessToast);
      await refreshStudio();
    },
  });

  const saveGenericMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEntry) {
        throw new Error(strings.noItemsDescription);
      }

      const profileData = parseJsonObjectDraft(
        genericEntryDraft.profileDataJson,
        strings.invalidJsonLabel
      );
      const metadata = parseJsonObjectDraft(
        genericEntryDraft.metadataJson,
        strings.invalidJsonLabel
      );

      await updateWorkspaceExternalProjectEntry(workspaceId, selectedEntry.id, {
        metadata,
        profile_data: profileData,
        slug: normalizeSlugSeed(genericEntryDraft.slug) || selectedEntry.slug,
        subtitle: genericEntryDraft.subtitle || null,
        summary: genericEntryDraft.summary || null,
        title: genericEntryDraft.title,
      });

      if (markdownBlock) {
        await updateWorkspaceExternalProjectBlock(
          workspaceId,
          markdownBlock.id,
          {
            content: {
              markdown: genericEntryDraft.body,
            },
            title: strings.bodyLabel,
          }
        );
      } else if (genericEntryDraft.body.trim()) {
        await createWorkspaceExternalProjectBlock(workspaceId, {
          block_type: 'markdown',
          content: {
            markdown: genericEntryDraft.body,
          },
          entry_id: selectedEntry.id,
          sort_order: 0,
          title: strings.bodyLabel,
        });
      }

      const assetMetadata = parseJsonObjectDraft(
        genericAssetDraft.metadataJson,
        strings.invalidJsonLabel
      );

      if (selectedAsset) {
        await updateWorkspaceExternalProjectAsset(
          workspaceId,
          selectedAsset.id,
          {
            alt_text: genericAssetDraft.altText || null,
            metadata: assetMetadata,
            source_url: genericAssetDraft.sourceUrl || null,
          }
        );
      } else if (genericAssetDraft.sourceUrl.trim()) {
        await createWorkspaceExternalProjectAsset(workspaceId, {
          alt_text: genericAssetDraft.altText || null,
          asset_type: 'image',
          entry_id: selectedEntry.id,
          metadata: assetMetadata,
          sort_order: 0,
          source_url: genericAssetDraft.sourceUrl || null,
          storage_path: null,
        });
      }
    },
    onError: handleMutationError,
    onSuccess: async () => {
      toast.success(strings.saveSuccessToast);
      await refreshStudio();
    },
  });

  const uploadArtworkMutation = useMutation({
    mutationFn: async (file: File) => {
      if (
        !selectedEntry ||
        selectedCollection?.collection_type !== 'artworks'
      ) {
        throw new Error(strings.noImageDescription);
      }

      const upload = await uploadWorkspaceExternalProjectAssetFile(
        workspaceId,
        file,
        {
          collectionType: selectedCollection.collection_type,
          entrySlug: selectedEntry.slug,
        }
      );

      if (leadAsset) {
        await updateWorkspaceExternalProjectAsset(workspaceId, leadAsset.id, {
          alt_text: artworkDraft.altText || file.name,
          asset_type: 'image',
          source_url: null,
          storage_path: upload.path,
        });
      } else {
        await createWorkspaceExternalProjectAsset(workspaceId, {
          alt_text: artworkDraft.altText || file.name,
          asset_type: 'image',
          entry_id: selectedEntry.id,
          metadata: {},
          sort_order: 0,
          source_url: null,
          storage_path: upload.path,
        });
      }
    },
    onError: handleMutationError,
    onSuccess: async () => {
      toast.success(strings.uploadCompleteToast);
      await refreshStudio();
    },
  });

  const uploadGenericAssetMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedEntry || !activeCollection) {
        throw new Error(strings.noItemsDescription);
      }

      const assetMetadata = parseJsonObjectDraft(
        genericAssetDraft.metadataJson,
        strings.invalidJsonLabel
      );
      const upload = await uploadWorkspaceExternalProjectAssetFile(
        workspaceId,
        file,
        {
          collectionType: activeCollection.collection_type,
          entrySlug:
            normalizeSlugSeed(genericEntryDraft.slug) || selectedEntry.slug,
        }
      );

      const payload = {
        alt_text: genericAssetDraft.altText || file.name,
        asset_type: inferAssetType(file),
        metadata: assetMetadata,
        source_url: null,
        storage_path: upload.path,
      };

      if (selectedAsset) {
        await updateWorkspaceExternalProjectAsset(
          workspaceId,
          selectedAsset.id,
          payload
        );
        return;
      }

      await createWorkspaceExternalProjectAsset(workspaceId, {
        ...payload,
        entry_id: selectedEntry.id,
        sort_order: selectedAssets.length,
      });
    },
    onError: handleMutationError,
    onSuccess: async () => {
      toast.success(strings.uploadCompleteToast);
      await refreshStudio();
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (eventKind: 'publish' | 'unpublish') => {
      if (!selectedEntry) {
        throw new Error(strings.noItemsDescription);
      }

      return publishWorkspaceExternalProjectEntry(
        workspaceId,
        selectedEntry.id,
        eventKind
      );
    },
    onError: handleMutationError,
    onSuccess: async () => {
      await refreshStudio();
    },
  });

  const handleArtworkUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (binding.adapter === 'yoola') {
      uploadArtworkMutation.mutate(file);
      return;
    }

    uploadGenericAssetMutation.mutate(file);
  };

  const yoolaLoading = loadingData?.adapter === 'yoola' ? loadingData : null;
  const leadImageUrl = leadAsset?.preview_url ?? leadAsset?.asset_url ?? null;
  const linkedArtworkLoadingItem = loreDraft.artworkSlug
    ? (yoolaLoading?.artworks.find(
        (artwork) => artwork.slug === loreDraft.artworkSlug
      ) ?? null)
    : null;
  const linkedArtworkAsset = linkedArtworkLoadingItem?.assetUrl ?? null;

  const collectionDirty =
    activeCollection !== null &&
    (collectionDraft.title !== (activeCollection.title ?? '') ||
      collectionDraft.description !== (activeCollection.description ?? '') ||
      collectionDraft.isEnabled !== activeCollection.is_enabled);
  const genericEntryDirty =
    selectedEntry !== null &&
    (genericEntryDraft.title !== selectedEntry.title ||
      genericEntryDraft.subtitle !== (selectedEntry.subtitle ?? '') ||
      genericEntryDraft.slug !== selectedEntry.slug ||
      genericEntryDraft.summary !== (selectedEntry.summary ?? '') ||
      genericEntryDraft.body !==
        asString(asRecord(markdownBlock?.content).markdown) ||
      genericEntryDraft.profileDataJson !==
        formatJsonDraft(selectedEntry.profile_data) ||
      genericEntryDraft.metadataJson !==
        formatJsonDraft(selectedEntry.metadata));
  const genericAssetDirty =
    selectedAsset !== null &&
    (genericAssetDraft.altText !== (selectedAsset.alt_text ?? '') ||
      genericAssetDraft.sourceUrl !== (selectedAsset.source_url ?? '') ||
      genericAssetDraft.metadataJson !==
        formatJsonDraft(selectedAsset.metadata));
  const artworkDirty =
    selectedEntry !== null &&
    selectedCollection?.collection_type === 'artworks' &&
    JSON.stringify(artworkDraft) !==
      JSON.stringify(buildArtworkDraft(selectedEntry, leadAsset));
  const loreDirty =
    selectedEntry !== null &&
    selectedCollection?.collection_type === 'lore-capsules' &&
    JSON.stringify(loreDraft) !==
      JSON.stringify(buildLoreDraft(selectedEntry, markdownBlock));
  const sectionDirty =
    selectedEntry !== null &&
    selectedCollection?.collection_type === 'singleton-sections' &&
    JSON.stringify(sectionDraft) !==
      JSON.stringify(buildSectionDraft(selectedEntry, markdownBlock));
  const currentEditorDirty =
    binding.adapter !== 'yoola'
      ? genericEntryDirty || genericAssetDirty
      : Boolean(artworkDirty || loreDirty || sectionDirty || collectionDirty);
  const previewPayload = livePreviewQuery.data as
    | ExternalProjectDeliveryPayload
    | undefined;
  const previewCollection = selectedCollection
    ? (previewPayload?.collections.find(
        (collection) =>
          collection.id === selectedCollection.id ||
          collection.slug === selectedCollection.slug
      ) ?? null)
    : null;
  const previewEntry = selectedEntry
    ? (previewCollection?.entries.find(
        (entry) =>
          entry.id === selectedEntry.id || entry.slug === selectedEntry.slug
      ) ?? null)
    : null;

  const payloadPreviewView = !selectedEntry ? (
    <EmptyPanel
      title={strings.emptyPreviewTitle}
      description={strings.emptyPreviewDescription}
    />
  ) : livePreviewQuery.isPending ? (
    <div className="rounded-2xl border border-border/70 bg-background/35 px-4 py-12 text-center text-muted-foreground text-sm">
      {strings.previewLoadingLabel}
    </div>
  ) : livePreviewQuery.isError ? (
    <EmptyPanel
      title={strings.previewErrorTitle}
      description={strings.previewErrorDescription}
    />
  ) : (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge className="rounded-full">
          {previewPayload?.adapter ??
            binding.adapter ??
            strings.notAvailableLabel}
        </Badge>
        <Badge variant="secondary" className="rounded-full">
          {previewCollection?.title ??
            previewCollection?.slug ??
            strings.notAvailableLabel}
        </Badge>
        <Badge variant="outline" className="rounded-full">
          {previewEntry?.slug ?? strings.notAvailableLabel}
        </Badge>
      </div>
      <ScrollArea className="h-[24rem] rounded-2xl border border-border/70 bg-background/35">
        <pre className="overflow-x-auto p-4 text-xs leading-6">
          {JSON.stringify(previewPayload, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );

  const activityPanel = (
    <ActivityPanel
      title={strings.activityTab}
      description={strings.activityDescription}
    >
      <ActivityPanels
        importJobs={importJobs}
        publishEvents={publishEvents}
        strings={strings}
      />
    </ActivityPanel>
  );

  const commonHero = (
    <StudioHero
      eyebrow={strings.studioTitle}
      title={binding.canonical_project?.display_name ?? strings.studioTitle}
      description={
        binding.adapter === 'yoola'
          ? strings.summaryDescription
          : strings.noAdapterEditorDescription
      }
      badges={
        <>
          {binding.canonical_id ? (
            <Badge className="rounded-full">{binding.canonical_id}</Badge>
          ) : null}
          <Badge variant="secondary" className="rounded-full">
            {formatCanonicalToken(binding.adapter ?? 'external-project')}
          </Badge>
          {binding.adapter === 'yoola' ? (
            <Badge variant="outline" className="rounded-full">
              {yoolaLoading?.artworkCategories.length ?? 0}{' '}
              {strings.adapterBlueprintLabel}
            </Badge>
          ) : null}
        </>
      }
      metrics={
        <>
          <MetricCard
            icon={<Sparkles className="h-4 w-4" />}
            label={strings.collectionsMetricLabel}
            value={String(collections.length)}
          />
          <MetricCard
            icon={<BriefcaseBusiness className="h-4 w-4" />}
            label={strings.entriesMetricLabel}
            value={String(entries.length)}
          />
          <MetricCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label={strings.publishedMetricLabel}
            value={String(publishedCount)}
          />
          <MetricCard
            icon={<Clock className="h-4 w-4" />}
            label={strings.draftsMetricLabel}
            value={String(draftCount)}
          />
        </>
      }
    />
  );

  const commonActionBar = (
    <StudioActionBar
      label={strings.openPreviewAction}
      description={strings.studioActionDescription}
      actions={
        <>
          {(currentEditorDirty || collectionDirty) && (
            <Badge variant="secondary" className="rounded-full">
              {strings.dirtyChangesLabel}
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
          >
            <FolderSync className="mr-2 h-4 w-4" />
            {strings.importAction}
          </Button>
          {selectedEntry ? (
            <Button variant="secondary" onClick={() => openEntryEditor()}>
              {strings.openEditorAction}
            </Button>
          ) : null}
        </>
      }
    />
  );

  const editorDialogActions = selectedEntry ? (
    <>
      {currentEditorDirty ? (
        <Badge variant="secondary" className="rounded-full">
          {strings.dirtyChangesLabel}
        </Badge>
      ) : null}
      <Button
        variant={selectedEntry.status === 'published' ? 'outline' : 'default'}
        onClick={() =>
          publishMutation.mutate(
            selectedEntry.status === 'published' ? 'unpublish' : 'publish'
          )
        }
        disabled={publishMutation.isPending}
      >
        {selectedEntry.status === 'published'
          ? strings.unpublish
          : strings.publish}
      </Button>
      <Button
        onClick={() =>
          binding.adapter === 'yoola'
            ? saveMutation.mutate()
            : saveGenericMutation.mutate()
        }
        disabled={
          !currentEditorDirty ||
          saveMutation.isPending ||
          saveGenericMutation.isPending ||
          publishMutation.isPending
        }
      >
        {strings.saveChanges}
      </Button>
    </>
  ) : null;

  const collectionSettingsPanel = (
    <EditorPanel
      title={strings.collectionSettingsTitle}
      description={strings.collectionSettingsDescription}
      headerAction={
        collectionDirty ? (
          <Badge variant="secondary" className="rounded-full">
            {strings.dirtyChangesLabel}
          </Badge>
        ) : null
      }
    >
      {activeCollection ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/35 p-4">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full">{activeCollection.slug}</Badge>
                <Badge variant="secondary" className="rounded-full">
                  {formatCanonicalToken(activeCollection.collection_type)}
                </Badge>
              </div>
              <div className="text-muted-foreground text-sm">
                {activeCollection.description ||
                  (activeCollection.is_enabled
                    ? strings.collectionEnabledLabel
                    : strings.collectionDisabledLabel)}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background/70 px-3 py-2">
              <Switch
                checked={collectionDraft.isEnabled}
                onCheckedChange={(checked) =>
                  setCollectionDraft((current) => ({
                    ...current,
                    isEnabled: checked,
                  }))
                }
              />
              <span className="text-sm">
                {collectionDraft.isEnabled
                  ? strings.collectionEnabledLabel
                  : strings.collectionDisabledLabel}
              </span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label={strings.titleLabel}>
              <Input
                value={collectionDraft.title}
                onChange={(event) =>
                  setCollectionDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label={strings.descriptionLabel}>
              <Textarea
                rows={4}
                value={collectionDraft.description}
                onChange={(event) =>
                  setCollectionDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => saveCollectionMutation.mutate()}
              disabled={!collectionDirty || saveCollectionMutation.isPending}
            >
              {strings.saveChanges}
            </Button>
          </div>
        </>
      ) : (
        <EmptyPanel
          title={strings.collectionEmptyTitle}
          description={strings.collectionEmptyDescription}
        />
      )}
    </EditorPanel>
  );

  if (binding.adapter !== 'yoola') {
    const genericRenderedPreview = !selectedEntry ? (
      <EmptyPanel
        title={strings.emptyPreviewTitle}
        description={strings.emptyPreviewDescription}
      />
    ) : (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge className="rounded-full">{genericEntryDraft.slug}</Badge>
          {genericEntryDraft.subtitle ? (
            <Badge variant="secondary" className="rounded-full">
              {genericEntryDraft.subtitle}
            </Badge>
          ) : null}
          <StatusBadge
            draftLabel={strings.draftBadge}
            isPublished={selectedEntry.status === 'published'}
            publishedLabel={strings.publishedBadge}
          />
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/35 p-5">
          <h3 className="font-semibold text-2xl">
            {genericEntryDraft.title || strings.notAvailableLabel}
          </h3>
          <p className="mt-3 text-sm leading-7">
            {genericEntryDraft.summary || strings.notAvailableLabel}
          </p>
          <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-border/70 bg-background/60 p-4 text-sm leading-7">
            {genericEntryDraft.body || strings.notAvailableLabel}
          </div>
          {selectedAsset?.preview_url ? (
            <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-2xl border border-border/70">
              <Image
                src={selectedAsset.preview_url}
                alt={selectedAsset.alt_text ?? genericEntryDraft.title}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : null}
        </div>
      </div>
    );

    const renderGenericPreviewPanel = () => (
      <PreviewPanel
        renderedTitle={strings.renderedTabLabel}
        renderedDescription={strings.deliveryPreviewDescription}
        renderedView={genericRenderedPreview}
        payloadTitle={strings.payloadTabLabel}
        payloadDescription={strings.deliveryPreviewDescription}
        payloadView={payloadPreviewView}
      />
    );

    const genericFocusedItemPanel = (
      <EditorPanel
        title={strings.detailPanelTitle}
        description={strings.detailPanelDescription}
        headerAction={
          selectedEntry ? (
            <Button onClick={() => openEntryEditor()}>
              {strings.openEditorAction}
            </Button>
          ) : null
        }
      >
        {!selectedEntry ? (
          <EmptyPanel
            title={strings.noItemsTitle}
            description={strings.noItemsDescription}
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full">{genericEntryDraft.slug}</Badge>
              {genericEntryDraft.subtitle ? (
                <Badge variant="secondary" className="rounded-full">
                  {genericEntryDraft.subtitle}
                </Badge>
              ) : null}
              <StatusBadge
                draftLabel={strings.draftBadge}
                isPublished={selectedEntry.status === 'published'}
                publishedLabel={strings.publishedBadge}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-3">
                <div>
                  <div className="font-semibold text-2xl">
                    {genericEntryDraft.title || strings.notAvailableLabel}
                  </div>
                  <p className="mt-2 text-muted-foreground text-sm leading-6">
                    {genericEntryDraft.summary || strings.noItemsDescription}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                    <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                      {strings.sectionsLabel}
                    </div>
                    <div className="mt-2 font-semibold text-2xl">
                      {selectedBlocks.length}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                    <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                      {strings.mediaSectionTitle}
                    </div>
                    <div className="mt-2 font-semibold text-2xl">
                      {selectedAssets.length}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/35 p-4 text-sm leading-7">
                  {genericEntryDraft.body || strings.noItemsDescription}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-border/70 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4">
                <div className="max-h-[26rem] overflow-y-auto pr-1">
                  {genericRenderedPreview}
                </div>
              </div>
            </div>
          </div>
        )}
      </EditorPanel>
    );

    const genericEditorWorkspace = !selectedEntry ? (
      <EmptyPanel
        title={strings.noItemsTitle}
        description={strings.noItemsDescription}
      />
    ) : (
      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <EditorPanel
            title={strings.detailPanelTitle}
            description={strings.detailPanelDescription}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label={strings.titleLabel}>
                <Input
                  value={genericEntryDraft.title}
                  onChange={(event) =>
                    setGenericEntryDraft((current) => ({
                      ...current,
                      title: event.target.value,
                      slug:
                        current.slug || normalizeSlugSeed(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label={strings.subtitleLabel}>
                <Input
                  value={genericEntryDraft.subtitle}
                  onChange={(event) =>
                    setGenericEntryDraft((current) => ({
                      ...current,
                      subtitle: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <Field label={strings.slugLabel}>
                <Input
                  value={genericEntryDraft.slug}
                  onChange={(event) =>
                    setGenericEntryDraft((current) => ({
                      ...current,
                      slug: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={strings.summaryLabel}>
                <Textarea
                  rows={3}
                  value={genericEntryDraft.summary}
                  onChange={(event) =>
                    setGenericEntryDraft((current) => ({
                      ...current,
                      summary: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <Field label={strings.bodyLabel}>
              <Textarea
                rows={10}
                value={genericEntryDraft.body}
                onChange={(event) =>
                  setGenericEntryDraft((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label={strings.profileDataLabel}>
                <Textarea
                  rows={10}
                  value={genericEntryDraft.profileDataJson}
                  onChange={(event) =>
                    setGenericEntryDraft((current) => ({
                      ...current,
                      profileDataJson: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={strings.entryMetadataLabel}>
                <Textarea
                  rows={10}
                  value={genericEntryDraft.metadataJson}
                  onChange={(event) =>
                    setGenericEntryDraft((current) => ({
                      ...current,
                      metadataJson: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
          </EditorPanel>

          <EditorPanel
            title={strings.mediaSectionTitle}
            description={strings.mediaDescription}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-muted-foreground text-sm">
                {selectedAssets.length} {strings.entriesMetricLabel}
              </div>
              <input
                ref={assetUploadInputRef}
                type="file"
                accept="image/*,audio/*,video/*"
                className="hidden"
                onChange={handleArtworkUpload}
              />
              <Button
                variant="outline"
                onClick={() => assetUploadInputRef.current?.click()}
                disabled={uploadGenericAssetMutation.isPending}
              >
                {strings.uploadAction}
              </Button>
            </div>

            {selectedAssets.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={`overflow-hidden rounded-2xl border text-left transition-colors ${
                      selectedAsset?.id === asset.id
                        ? 'border-foreground/30 bg-background'
                        : 'border-border/70 bg-background/35 hover:border-border'
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-background/50">
                      {asset.preview_url ? (
                        <Image
                          src={asset.preview_url}
                          alt={asset.alt_text ?? selectedEntry.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground text-sm">
                          {asset.storage_path ||
                            asset.source_url ||
                            strings.noImageDescription}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <Badge variant="secondary" className="rounded-full">
                        {formatCanonicalToken(asset.asset_type)}
                      </Badge>
                      <div className="text-muted-foreground text-sm">
                        {asset.alt_text || strings.notAvailableLabel}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyPanel
                title={strings.noImageTitle}
                description={strings.noImageDescription}
              />
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label={strings.imageAltLabel}>
                <Input
                  value={genericAssetDraft.altText}
                  onChange={(event) =>
                    setGenericAssetDraft((current) => ({
                      ...current,
                      altText: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={strings.remoteSourceLabel}>
                <Input
                  value={genericAssetDraft.sourceUrl}
                  onChange={(event) =>
                    setGenericAssetDraft((current) => ({
                      ...current,
                      sourceUrl: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <Field label={strings.assetMetadataLabel}>
              <Textarea
                rows={8}
                value={genericAssetDraft.metadataJson}
                onChange={(event) =>
                  setGenericAssetDraft((current) => ({
                    ...current,
                    metadataJson: event.target.value,
                  }))
                }
              />
            </Field>

            {selectedAsset?.storage_path ? (
              <Field label={strings.assetPathLabel}>
                <Input value={selectedAsset.storage_path} readOnly />
              </Field>
            ) : null}
          </EditorPanel>
        </div>

        <div className="xl:sticky xl:top-0 xl:self-start">
          {renderGenericPreviewPanel()}
        </div>
      </div>
    );

    return (
      <>
        <StudioShell
          hero={commonHero}
          actionBar={commonActionBar}
          previewDrawerTitle={strings.openPreviewAction}
          previewDrawerDescription={strings.deliveryPreviewDescription}
          activityPanel={activityPanel}
          previewPanel={renderGenericPreviewPanel()}
          contentRail={
            <ContentRail
              title={strings.contentRailTitle}
              description={strings.contentRailDescription}
              headerAction={
                <Button
                  size="sm"
                  onClick={() => createGenericEntryMutation.mutate()}
                  disabled={
                    createGenericEntryMutation.isPending || !activeCollection
                  }
                >
                  {strings.addEntry}
                </Button>
              }
            >
              <RailSection label={strings.collectionSelectLabel}>
                <div className="space-y-3">
                  {collections.map((collection) => {
                    const collectionEntryCount = entries.filter(
                      (entry) => entry.collection_id === collection.id
                    ).length;

                    return (
                      <RailCollectionButton
                        key={collection.id}
                        active={genericActiveCollection?.id === collection.id}
                        title={collection.title}
                        description={collection.description}
                        onClick={() => setSelectedCollectionId(collection.id)}
                        badge={
                          <div className="flex flex-col items-end gap-2">
                            <Badge
                              variant={
                                collection.is_enabled ? 'default' : 'secondary'
                              }
                              className="rounded-full"
                            >
                              {collection.is_enabled
                                ? strings.collectionEnabledLabel
                                : strings.collectionDisabledLabel}
                            </Badge>
                            <Badge variant="outline">
                              {collectionEntryCount}
                            </Badge>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </RailSection>

              <RailSection label={strings.searchPlaceholder}>
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={strings.searchPlaceholder}
                />
              </RailSection>

              <RailSection label={strings.statusLabel}>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['all', strings.allItemsLabel],
                      ['published', strings.publishedBadge],
                      ['draft', strings.draftBadge],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={statusFilter === value ? 'default' : 'outline'}
                      onClick={() => setStatusFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </RailSection>

              <RailSection label={strings.profileLabel}>
                {filteredGenericEntries.length === 0 ? (
                  <EmptyPanel
                    title={
                      normalizedQuery || statusFilter !== 'all'
                        ? strings.noSearchResultsTitle
                        : strings.noItemsTitle
                    }
                    description={
                      normalizedQuery || statusFilter !== 'all'
                        ? strings.noSearchResultsDescription
                        : strings.noItemsDescription
                    }
                  />
                ) : (
                  <EntryList isEmpty={false}>
                    {filteredGenericEntries.map((entry) => {
                      const entryAsset =
                        assets.find((asset) => asset.entry_id === entry.id) ??
                        null;

                      return (
                        <EntryCard
                          key={entry.id}
                          active={selectedEntryId === entry.id}
                          title={entry.title}
                          onClick={() => openEntryEditor(entry.id)}
                          accent={
                            <StatusBadge
                              draftLabel={strings.draftBadge}
                              isPublished={entry.status === 'published'}
                              publishedLabel={strings.publishedBadge}
                            />
                          }
                          eyebrow={
                            <div className="flex flex-wrap gap-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              <span>{entry.slug}</span>
                              {entry.subtitle ? (
                                <span>{entry.subtitle}</span>
                              ) : null}
                            </div>
                          }
                          body={
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">{entry.slug}</Badge>
                                {entryAsset ? (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full"
                                  >
                                    {formatCanonicalToken(
                                      entryAsset.asset_type
                                    )}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-muted-foreground text-sm leading-6">
                                {entry.summary ||
                                  findMarkdownForEntry(entry.id, blocks) ||
                                  strings.noItemsDescription}
                              </p>
                            </div>
                          }
                        />
                      );
                    })}
                  </EntryList>
                )}
              </RailSection>
            </ContentRail>
          }
          rightColumn={
            <>
              {collectionSettingsPanel}
              {genericFocusedItemPanel}
            </>
          }
        />

        <Dialog open={entryEditorOpen} onOpenChange={setEntryEditorOpen}>
          <DialogContent className="flex max-h-dvh max-w-[100vw] flex-col gap-0 overflow-hidden p-0 sm:max-h-[94vh] sm:max-w-[min(96vw,1400px)] sm:rounded-[2rem]">
            <DialogHeader className="border-border/60 border-b bg-background/95 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <DialogTitle className="text-2xl tracking-tight">
                    {selectedEntry?.title || strings.detailPanelTitle}
                  </DialogTitle>
                  <DialogDescription>
                    {selectedCollection?.title ||
                      strings.detailPanelDescription}
                  </DialogDescription>
                  {selectedEntry ? (
                    <div className="flex flex-wrap gap-2">
                      <Badge className="rounded-full">
                        {selectedEntry.slug}
                      </Badge>
                      <StatusBadge
                        draftLabel={strings.draftBadge}
                        isPublished={selectedEntry.status === 'published'}
                        publishedLabel={strings.publishedBadge}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {editorDialogActions}
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
              {genericEditorWorkspace}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const renderedYoolaPreview =
    !selectedEntry || !selectedCollection ? (
      <EmptyPanel
        title={strings.emptyPreviewTitle}
        description={strings.emptyPreviewDescription}
      />
    ) : selectedCollection.collection_type === 'artworks' ? (
      <div className="space-y-4">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border/70 bg-background/40">
          {leadImageUrl ? (
            <Image
              src={leadImageUrl}
              alt={leadAsset?.alt_text ?? artworkDraft.title}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
              {strings.noImageDescription}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="rounded-full">
            {artworkDraft.label || strings.notAvailableLabel}
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {artworkDraft.category || strings.notAvailableLabel}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {artworkDraft.rarity || strings.notAvailableLabel}
          </Badge>
        </div>
        <div>
          <div className="font-semibold text-2xl">
            {artworkDraft.title || strings.notAvailableLabel}
          </div>
          <div className="mt-1 text-muted-foreground text-sm">
            {artworkDraft.year || strings.notAvailableLabel} ·{' '}
            {artworkDraft.orientation || strings.notAvailableLabel}
          </div>
        </div>
        <p className="text-sm leading-7">
          {artworkDraft.summary ||
            artworkDraft.note ||
            strings.noImageDescription}
        </p>
      </div>
    ) : selectedCollection.collection_type === 'lore-capsules' ? (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border/70 bg-background/40">
            {linkedArtworkAsset ? (
              <Image
                src={linkedArtworkAsset}
                alt={
                  linkedArtworkLoadingItem?.altText ??
                  linkedArtworkLoadingItem?.title ??
                  loreDraft.title
                }
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
                {strings.linkedArtworkMissingDescription}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full">
                {loreDraft.channel || strings.notAvailableLabel}
              </Badge>
              <Badge variant="secondary" className="rounded-full">
                {loreDraft.status || strings.notAvailableLabel}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {loreDraft.date || strings.notAvailableLabel}
              </Badge>
            </div>
            <div>
              <div className="font-semibold text-2xl">
                {loreDraft.title || strings.notAvailableLabel}
              </div>
              <p className="mt-3 text-sm leading-7">
                {loreDraft.teaser ||
                  loreDraft.summary ||
                  strings.linkedArtworkMissingDescription}
              </p>
            </div>
            <div className="whitespace-pre-wrap rounded-2xl border border-border/70 bg-background/35 p-4 text-sm leading-7">
              {loreDraft.body || strings.notAvailableLabel}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {loreDraft.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
            .map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
        </div>
      </div>
    ) : (
      <div className="space-y-4 rounded-2xl border border-border/70 bg-background/35 p-5">
        <Badge className="rounded-full">{sectionDraft.slug}</Badge>
        <div className="font-semibold text-2xl">
          {sectionDraft.title || strings.notAvailableLabel}
        </div>
        <p className="text-sm leading-7">
          {sectionDraft.summary || strings.notAvailableLabel}
        </p>
        <div className="whitespace-pre-wrap rounded-2xl border border-border/70 bg-background/60 p-4 text-sm leading-7">
          {sectionDraft.body || strings.notAvailableLabel}
        </div>
      </div>
    );

  const renderYoolaPreviewPanel = () => (
    <PreviewPanel
      renderedTitle={strings.renderedTabLabel}
      renderedDescription={strings.deliveryPreviewDescription}
      renderedView={renderedYoolaPreview}
      payloadTitle={strings.payloadTabLabel}
      payloadDescription={strings.deliveryPreviewDescription}
      payloadView={payloadPreviewView}
    />
  );

  const yoolaFocusedItemPanel = (
    <EditorPanel
      title={strings.detailPanelTitle}
      description={strings.detailPanelDescription}
      headerAction={
        selectedEntry ? (
          <Button onClick={() => openEntryEditor()}>
            {strings.openEditorAction}
          </Button>
        ) : null
      }
    >
      {!selectedEntry || !selectedCollection ? (
        <EmptyPanel
          title={strings.noItemsTitle}
          description={strings.noItemsDescription}
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full">{selectedEntry.slug}</Badge>
            <StatusBadge
              draftLabel={strings.draftBadge}
              isPublished={selectedEntry.status === 'published'}
              publishedLabel={strings.publishedBadge}
            />
            <Badge variant="secondary" className="rounded-full">
              {formatCanonicalToken(selectedCollection.collection_type)}
            </Badge>
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3">
              <div>
                <div className="font-semibold text-2xl">
                  {selectedEntry.title || strings.notAvailableLabel}
                </div>
                <p className="mt-2 text-muted-foreground text-sm leading-6">
                  {selectedEntry.summary || strings.noItemsDescription}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                    {strings.sectionsLabel}
                  </div>
                  <div className="mt-2 font-semibold text-2xl">
                    {selectedBlocks.length}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                    {strings.mediaSectionTitle}
                  </div>
                  <div className="mt-2 font-semibold text-2xl">
                    {selectedAssets.length}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/35 p-4 text-sm leading-7">
                {selectedCollection.collection_type === 'artworks'
                  ? artworkDraft.note ||
                    artworkDraft.summary ||
                    strings.noItemsDescription
                  : selectedCollection.collection_type === 'lore-capsules'
                    ? loreDraft.teaser ||
                      loreDraft.summary ||
                      strings.noItemsDescription
                    : sectionDraft.body || strings.noItemsDescription}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-border/70 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4">
              <div className="max-h-[26rem] overflow-y-auto pr-1">
                {renderedYoolaPreview}
              </div>
            </div>
          </div>
        </div>
      )}
    </EditorPanel>
  );

  const yoolaEditorWorkspace =
    !selectedEntry || !selectedCollection ? (
      <EmptyPanel
        title={strings.noItemsTitle}
        description={strings.noItemsDescription}
      />
    ) : (
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <EditorPanel
            title={strings.detailPanelTitle}
            description={strings.detailPanelDescription}
          >
            {selectedCollection.collection_type === 'artworks' ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={strings.titleLabel}>
                    <Input
                      value={artworkDraft.title}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          title: event.target.value,
                          slug:
                            current.slug ||
                            normalizeSlugSeed(event.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label={strings.slugLabel}>
                    <Input
                      value={artworkDraft.slug}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          slug: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={strings.labelLabel}>
                    <Input
                      value={artworkDraft.label}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={strings.categoryLabel}>
                    <Input
                      value={artworkDraft.category}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={strings.rarityLabel}>
                    <Input
                      value={artworkDraft.rarity}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          rarity: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={strings.yearLabel}>
                    <Input
                      value={artworkDraft.year}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          year: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={strings.orientationLabel}>
                    <Input
                      value={artworkDraft.orientation}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          orientation: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={strings.imageAltLabel}>
                    <Input
                      value={artworkDraft.altText}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          altText: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={strings.widthLabel}>
                    <Input
                      value={artworkDraft.width}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          width: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={strings.heightLabel}>
                    <Input
                      value={artworkDraft.height}
                      onChange={(event) =>
                        setArtworkDraft((current) => ({
                          ...current,
                          height: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <Field label={strings.summaryLabel}>
                  <Textarea
                    rows={4}
                    value={artworkDraft.summary}
                    onChange={(event) =>
                      setArtworkDraft((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label={strings.noteLabel}>
                  <Textarea
                    rows={4}
                    value={artworkDraft.note}
                    onChange={(event) =>
                      setArtworkDraft((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label={strings.remoteSourceLabel}>
                  <Input
                    value={artworkDraft.sourceUrl}
                    onChange={(event) =>
                      setArtworkDraft((current) => ({
                        ...current,
                        sourceUrl: event.target.value,
                      }))
                    }
                  />
                </Field>

                <input
                  ref={assetUploadInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleArtworkUpload}
                />
                <div className="flex justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={() => assetUploadInputRef.current?.click()}
                    disabled={uploadArtworkMutation.isPending}
                  >
                    {strings.uploadAction}
                  </Button>
                  <div className="text-muted-foreground text-sm">
                    {leadAsset?.storage_path || strings.refreshHint}
                  </div>
                </div>
              </div>
            ) : selectedCollection.collection_type === 'lore-capsules' ? (
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={strings.titleLabel}>
                    <Input
                      value={loreDraft.title}
                      onChange={(event) =>
                        setLoreDraft((current) => ({
                          ...current,
                          title: event.target.value,
                          slug:
                            current.slug ||
                            normalizeSlugSeed(event.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label={strings.slugLabel}>
                    <Input
                      value={loreDraft.slug}
                      onChange={(event) =>
                        setLoreDraft((current) => ({
                          ...current,
                          slug: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={strings.dateLabel}>
                    <Input
                      value={loreDraft.date}
                      onChange={(event) =>
                        setLoreDraft((current) => ({
                          ...current,
                          date: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={strings.channelLabel}>
                    <Input
                      value={loreDraft.channel}
                      onChange={(event) =>
                        setLoreDraft((current) => ({
                          ...current,
                          channel: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={strings.statusLabel}>
                    <Input
                      value={loreDraft.status}
                      onChange={(event) =>
                        setLoreDraft((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={strings.artworkLinkLabel}>
                    <Select
                      value={loreDraft.artworkSlug || '__none__'}
                      onValueChange={(value) =>
                        setLoreDraft((current) => ({
                          ...current,
                          artworkSlug: value === '__none__' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {strings.notAvailableLabel}
                        </SelectItem>
                        {artworkEntries.map((entry) => (
                          <SelectItem key={entry.id} value={entry.slug}>
                            {entry.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label={strings.summaryLabel}>
                  <Textarea
                    rows={4}
                    value={loreDraft.summary}
                    onChange={(event) =>
                      setLoreDraft((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label={strings.teaserLabel}>
                  <Textarea
                    rows={4}
                    value={loreDraft.teaser}
                    onChange={(event) =>
                      setLoreDraft((current) => ({
                        ...current,
                        teaser: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label={strings.tagsLabel}>
                  <Input
                    value={loreDraft.tags}
                    onChange={(event) =>
                      setLoreDraft((current) => ({
                        ...current,
                        tags: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label={strings.excerptLabel}>
                  <Textarea
                    rows={8}
                    value={loreDraft.body}
                    onChange={(event) =>
                      setLoreDraft((current) => ({
                        ...current,
                        body: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4">
                <Field label={strings.titleLabel}>
                  <Input
                    value={sectionDraft.title}
                    onChange={(event) =>
                      setSectionDraft((current) => ({
                        ...current,
                        title: event.target.value,
                        slug:
                          current.slug || normalizeSlugSeed(event.target.value),
                      }))
                    }
                  />
                </Field>

                <Field label={strings.slugLabel}>
                  <Input
                    value={sectionDraft.slug}
                    onChange={(event) =>
                      setSectionDraft((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label={strings.summaryLabel}>
                  <Textarea
                    rows={4}
                    value={sectionDraft.summary}
                    onChange={(event) =>
                      setSectionDraft((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label={strings.sectionBodyLabel}>
                  <Textarea
                    rows={10}
                    value={sectionDraft.body}
                    onChange={(event) =>
                      setSectionDraft((current) => ({
                        ...current,
                        body: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
            )}
          </EditorPanel>
        </div>

        <div className="xl:sticky xl:top-0 xl:self-start">
          {renderYoolaPreviewPanel()}
        </div>
      </div>
    );

  return (
    <>
      <StudioShell
        hero={commonHero}
        actionBar={commonActionBar}
        previewDrawerTitle={strings.openPreviewAction}
        previewDrawerDescription={strings.deliveryPreviewDescription}
        activityPanel={activityPanel}
        previewPanel={renderYoolaPreviewPanel()}
        contentRail={
          <ContentRail
            title={strings.contentRailTitle}
            description={strings.contentRailDescription}
            headerAction={
              <Button
                size="sm"
                onClick={() => createEntryMutation.mutate(activeTab)}
                disabled={createEntryMutation.isPending}
              >
                {activeTab === 'artworks'
                  ? strings.addArtwork
                  : activeTab === 'lore-capsules'
                    ? strings.addLoreCapsule
                    : strings.addSection}
              </Button>
            }
          >
            <RailSection label={strings.collectionSelectLabel}>
              <div className="space-y-3">
                {[
                  {
                    description:
                      artworksCollection?.description ??
                      strings.contentRailDescription,
                    key: 'artworks' as const,
                    title: artworksCollection?.title ?? strings.artworksTab,
                    value: filteredArtworkEntries.length,
                  },
                  {
                    description:
                      loreCollection?.description ??
                      strings.contentRailDescription,
                    key: 'lore-capsules' as const,
                    title: loreCollection?.title ?? strings.loreTab,
                    value: filteredLoreEntries.length,
                  },
                  {
                    description:
                      singletonCollection?.description ??
                      strings.contentRailDescription,
                    key: 'singleton-sections' as const,
                    title: singletonCollection?.title ?? strings.sectionsTab,
                    value: filteredSingletonEntries.length,
                  },
                ].map((collection) => (
                  <RailCollectionButton
                    key={collection.key}
                    active={activeTab === collection.key}
                    title={collection.title}
                    description={collection.description}
                    onClick={() => setActiveTab(collection.key)}
                    badge={<Badge variant="outline">{collection.value}</Badge>}
                  />
                ))}
              </div>
            </RailSection>

            <RailSection label={strings.searchPlaceholder}>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={strings.searchPlaceholder}
              />
            </RailSection>

            <RailSection label={strings.statusLabel}>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['all', strings.allItemsLabel],
                    ['published', strings.publishedBadge],
                    ['draft', strings.draftBadge],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={statusFilter === value ? 'default' : 'outline'}
                    onClick={() => setStatusFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </RailSection>

            {activeTab === 'artworks' && yoolaLoading ? (
              <RailSection label={strings.categoryLabel}>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={
                      artworkCategoryFilter === 'all' ? 'default' : 'outline'
                    }
                    onClick={() => setArtworkCategoryFilter('all')}
                  >
                    {strings.allItemsLabel}
                  </Button>
                  {yoolaLoading.artworkCategories.map((category) => (
                    <Button
                      key={category}
                      size="sm"
                      variant={
                        artworkCategoryFilter === category
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() => setArtworkCategoryFilter(category)}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </RailSection>
            ) : null}

            <RailSection label={strings.profileLabel}>
              {currentTabEntries.length === 0 ? (
                <EmptyPanel
                  title={
                    normalizedQuery || statusFilter !== 'all'
                      ? strings.noSearchResultsTitle
                      : strings.noItemsTitle
                  }
                  description={
                    normalizedQuery || statusFilter !== 'all'
                      ? strings.noSearchResultsDescription
                      : strings.noItemsDescription
                  }
                />
              ) : (
                <EntryList isEmpty={false}>
                  {currentTabEntries.map((entry) => {
                    const profile = asRecord(entry.profile_data);
                    const entryAsset =
                      assets.find(
                        (asset) =>
                          asset.entry_id === entry.id &&
                          asset.asset_type === 'image'
                      ) ?? null;

                    return (
                      <EntryCard
                        key={entry.id}
                        active={selectedEntryId === entry.id}
                        title={entry.title}
                        onClick={() => openEntryEditor(entry.id)}
                        accent={
                          <StatusBadge
                            draftLabel={strings.draftBadge}
                            isPublished={entry.status === 'published'}
                            publishedLabel={strings.publishedBadge}
                          />
                        }
                        eyebrow={
                          <div className="flex flex-wrap gap-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                            <span>{entry.slug}</span>
                            {activeTab === 'lore-capsules' ? (
                              <span>
                                {asString(profile.channel) ||
                                  strings.notAvailableLabel}
                              </span>
                            ) : null}
                          </div>
                        }
                        body={
                          activeTab === 'artworks' ? (
                            <div className="space-y-3">
                              {entryAsset?.preview_url ? (
                                <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border/70">
                                  <Image
                                    src={entryAsset.preview_url}
                                    alt={entryAsset.alt_text ?? entry.title}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                  />
                                </div>
                              ) : null}
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">
                                  {asString(profile.category) ||
                                    strings.notAvailableLabel}
                                </Badge>
                                <Badge variant="outline">
                                  {asString(profile.rarity) ||
                                    strings.notAvailableLabel}
                                </Badge>
                                <Badge variant="outline">
                                  {asString(profile.year) ||
                                    strings.notAvailableLabel}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground text-sm leading-6">
                                {entry.summary || strings.noItemsDescription}
                              </p>
                            </div>
                          ) : activeTab === 'lore-capsules' ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                <span>
                                  {asString(profile.channel) ||
                                    strings.notAvailableLabel}
                                </span>
                                <span>
                                  {asString(profile.date) ||
                                    strings.notAvailableLabel}
                                </span>
                              </div>
                              <p className="text-sm leading-6">
                                {asString(profile.teaser) ||
                                  entry.summary ||
                                  strings.noItemsDescription}
                              </p>
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm leading-6">
                              {entry.summary || strings.noItemsDescription}
                            </p>
                          )
                        }
                      />
                    );
                  })}
                </EntryList>
              )}
            </RailSection>
          </ContentRail>
        }
        rightColumn={
          <>
            {collectionSettingsPanel}
            {yoolaFocusedItemPanel}
          </>
        }
      />

      <Dialog open={entryEditorOpen} onOpenChange={setEntryEditorOpen}>
        <DialogContent className="flex max-h-dvh max-w-[100vw] flex-col gap-0 overflow-hidden p-0 sm:max-h-[94vh] sm:max-w-[min(96vw,1400px)] sm:rounded-[2rem]">
          <DialogHeader className="border-border/60 border-b bg-background/95 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <DialogTitle className="text-2xl tracking-tight">
                  {selectedEntry?.title || strings.detailPanelTitle}
                </DialogTitle>
                <DialogDescription>
                  {selectedCollection?.title || strings.detailPanelDescription}
                </DialogDescription>
                {selectedEntry ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge className="rounded-full">{selectedEntry.slug}</Badge>
                    <StatusBadge
                      draftLabel={strings.draftBadge}
                      isPublished={selectedEntry.status === 'published'}
                      publishedLabel={strings.publishedBadge}
                    />
                    <Badge variant="secondary" className="rounded-full">
                      {formatCanonicalToken(
                        selectedCollection?.collection_type ?? activeTab
                      )}
                    </Badge>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {editorDialogActions}
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            {yoolaEditorWorkspace}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
