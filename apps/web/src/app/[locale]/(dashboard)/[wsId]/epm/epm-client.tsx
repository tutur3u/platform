'use client';

import { useMutation } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  Clock,
  Copy,
  FolderSync,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
} from '@tuturuuu/icons';
import {
  bulkUpdateWorkspaceExternalProjectEntries,
  createWorkspaceExternalProjectEntry,
  duplicateWorkspaceExternalProjectEntry,
  importWorkspaceExternalProjectContent,
  publishWorkspaceExternalProjectEntry,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectDeliveryEntry,
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
  ExternalProjectStudioData,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import {
  type ComponentProps,
  startTransition,
  useDeferredValue,
  useState,
} from 'react';
import { useExternalProjectLivePreview } from '../external-projects/use-external-project-live-preview';
import type { EpmStrings } from './epm-strings';
import { ResilientMediaImage } from './resilient-media-image';

type WorkflowFilter = 'all' | ExternalProjectEntry['status'];
type EpmMode = 'edit' | 'preview';
type EditSection = 'entries' | 'settings' | 'workflow';

function formatStatus(
  status: ExternalProjectEntry['status'],
  strings: EpmStrings
) {
  switch (status) {
    case 'archived':
      return strings.statusArchived;
    case 'published':
      return strings.statusPublished;
    case 'scheduled':
      return strings.statusScheduled;
    default:
      return strings.statusDraft;
  }
}

function statusTone(status: ExternalProjectEntry['status']) {
  switch (status) {
    case 'published':
      return 'bg-emerald-500/10 text-emerald-600';
    case 'scheduled':
      return 'bg-amber-500/10 text-amber-600';
    case 'archived':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-sky-500/10 text-sky-600';
  }
}

function formatDateLabel(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Date(value).toLocaleString();
}

function getEntryVisual(
  assets: ExternalProjectStudioAsset[],
  entryId: string | null | undefined
) {
  if (!entryId) {
    return null;
  }

  return (
    assets.find(
      (asset) => asset.entry_id === entryId && asset.asset_type === 'image'
    ) ?? null
  );
}

function getDeliveryEntryVisual(entry: ExternalProjectDeliveryEntry | null) {
  if (!entry) {
    return null;
  }

  return (
    entry.assets.find(
      (asset) => asset.asset_type === 'image' && asset.assetUrl
    ) ?? null
  );
}

function extractMarkdown(entry: ExternalProjectDeliveryEntry | null) {
  if (!entry) {
    return [];
  }

  return entry.blocks
    .filter((block) => block.block_type === 'markdown')
    .map((block) => {
      const content =
        typeof block.content === 'object' &&
        block.content !== null &&
        'markdown' in block.content &&
        typeof block.content.markdown === 'string'
          ? block.content.markdown
          : '';

      return {
        id: block.id,
        markdown: content.trim(),
        title: block.title,
      };
    })
    .filter((block) => block.markdown.length > 0);
}

function getProjectBrand(
  binding: WorkspaceExternalProjectBinding,
  profileData: Record<string, unknown> | null | undefined
) {
  const brand =
    typeof profileData?.brand === 'string' ? profileData.brand : null;

  return brand ?? binding.canonical_project?.display_name ?? 'EPM';
}

function ActionButton({
  children,
  tooltip,
  ...props
}: ComponentProps<typeof Button> & { tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function PreviewModeSkeleton() {
  return (
    <div className="space-y-5" data-testid="epm-preview-skeleton">
      <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)_auto]">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 w-28 rounded-xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={`preview-card-skeleton-${index}`}
            className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/80"
          >
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="space-y-3 p-4">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[86%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EpmClient({
  binding,
  initialEditSection = 'entries',
  initialMode = 'preview',
  initialStudio,
  strings,
  workspaceId,
}: {
  binding: WorkspaceExternalProjectBinding;
  initialEditSection?: EditSection;
  initialMode?: EpmMode;
  initialStudio: ExternalProjectStudioData;
  strings: EpmStrings;
  workspaceId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<EpmMode>(initialMode);
  const [editSection, setEditSection] =
    useState<EditSection>(initialEditSection);
  const [entries, setEntries] = useState(initialStudio.entries);
  const [collections] = useState(initialStudio.collections);
  const [assets] = useState(initialStudio.assets);
  const [publishEvents] = useState(initialStudio.publishEvents);
  const [selectedCollectionId, setSelectedCollectionId] = useState(
    initialStudio.collections[0]?.id ?? ''
  );
  const [selectedEntryId, setSelectedEntryId] = useState(
    initialStudio.entries[0]?.id ?? ''
  );
  const [search, setSearch] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>('all');
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [scheduleValue, setScheduleValue] = useState('');
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const deferredSearch = useDeferredValue(search);

  const previewQuery = useExternalProjectLivePreview({
    enabled: mode === 'preview',
    refreshToken: previewRefreshToken,
    selectedEntryId,
    workspaceId,
  });

  const visibleEntries = entries.filter((entry) => {
    if (selectedCollectionId && entry.collection_id !== selectedCollectionId) {
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

  const activeCollection =
    collections.find((collection) => collection.id === selectedCollectionId) ??
    collections[0] ??
    null;
  const activeEditEntry =
    visibleEntries.find((entry) => entry.id === selectedEntryId) ??
    visibleEntries[0] ??
    null;
  const activeEditEntryVisual = getEntryVisual(assets, activeEditEntry?.id);
  const activeEditEntryAssets = assets.filter(
    (asset) => asset.entry_id === activeEditEntry?.id
  );

  const deliveryCollections = previewQuery.data?.collections ?? [];
  const activePreviewCollection =
    deliveryCollections.find(
      (collection) => collection.id === selectedCollectionId
    ) ??
    deliveryCollections[0] ??
    null;
  const previewEntries = activePreviewCollection?.entries ?? [];
  const previewPrimaryEntry = previewEntries[0] ?? null;
  const previewGalleryEntries = previewEntries.slice(0, 18);
  const previewProjectLabel = getProjectBrand(
    binding,
    previewQuery.data?.profileData
  );

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
      entries: entries.filter((entry) => entry.status === 'draft').slice(0, 4),
      status: 'draft' as const,
      title: strings.draftQueue,
    },
    {
      entries: entries
        .filter((entry) => entry.status === 'scheduled')
        .slice(0, 4),
      status: 'scheduled' as const,
      title: strings.scheduledQueue,
    },
    {
      entries: entries
        .filter((entry) => entry.status === 'published')
        .slice(0, 4),
      status: 'published' as const,
      title: strings.publishedQueue,
    },
    {
      entries: entries
        .filter((entry) => entry.status === 'archived')
        .slice(0, 4),
      status: 'archived' as const,
      title: strings.archivedQueue,
    },
  ];

  const currentEntryId =
    (mode === 'preview' ? previewPrimaryEntry?.id : activeEditEntry?.id) ??
    null;
  const currentManagedEntry =
    entries.find((entry) => entry.id === currentEntryId) ?? activeEditEntry;

  const mergeEntry = (nextEntry: ExternalProjectEntry) => {
    setEntries((current) => {
      const index = current.findIndex((entry) => entry.id === nextEntry.id);
      if (index === -1) {
        return [nextEntry, ...current];
      }

      const next = [...current];
      next[index] = nextEntry;
      return next;
    });
  };

  const refreshPage = () => {
    startTransition(() => router.refresh());
  };

  const openEntryDetails = (entryId: string) => {
    router.push(`${pathname.replace(/\/$/, '')}/entries/${entryId}`);
  };

  const openCollectionDetails = (collectionId: string) => {
    router.push(`${pathname.replace(/\/$/, '')}/collections/${collectionId}`);
  };

  const createEntryMutation = useMutation({
    mutationFn: async () => {
      const collectionId = activeCollection?.id ?? selectedCollectionId;
      if (!collectionId) {
        throw new Error('Collection is required');
      }

      return createWorkspaceExternalProjectEntry(workspaceId, {
        collection_id: collectionId,
        metadata: {},
        profile_data: {},
        scheduled_for: null,
        slug: `draft-${Date.now()}`,
        status: 'draft',
        subtitle: null,
        summary: null,
        title: 'Untitled entry',
      });
    },
    onError: () => toast.error(strings.editEntryDescription),
    onSuccess: (entry) => {
      mergeEntry(entry);
      setSelectedCollectionId(entry.collection_id);
      setSelectedEntryId(entry.id);
      setPreviewRefreshToken((value) => value + 1);
      toast.success(strings.createEntryAction);
      openEntryDetails(entry.id);
      refreshPage();
    },
  });

  const duplicateEntryMutation = useMutation({
    mutationFn: async () => {
      if (!currentManagedEntry) {
        throw new Error('Entry is required');
      }

      return duplicateWorkspaceExternalProjectEntry(
        workspaceId,
        currentManagedEntry.id
      );
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      setSelectedCollectionId(entry.collection_id);
      setSelectedEntryId(entry.id);
      setPreviewRefreshToken((value) => value + 1);
      toast.success(strings.duplicateAction);
      openEntryDetails(entry.id);
      refreshPage();
    },
  });

  const publishEntryMutation = useMutation({
    mutationFn: async (eventKind: 'publish' | 'unpublish') => {
      if (!currentManagedEntry) {
        throw new Error('Entry is required');
      }

      return publishWorkspaceExternalProjectEntry(
        workspaceId,
        currentManagedEntry.id,
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
      refreshPage();
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => importWorkspaceExternalProjectContent(workspaceId),
    onSuccess: () => {
      toast.success(strings.importAction);
      setPreviewRefreshToken((value) => value + 1);
      refreshPage();
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
      setEntries((current) =>
        current.map(
          (entry) =>
            updatedEntries.find((updated) => updated.id === entry.id) ?? entry
        )
      );
      setSelectedBulkIds([]);
      setPreviewRefreshToken((value) => value + 1);
      refreshPage();
    },
  });

  return (
    <div className="min-h-[calc(100svh-5rem)] space-y-5 pb-8">
      <section className="rounded-[2rem] border border-border/70 bg-card/95 shadow-none">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
              <Sparkles className="h-3.5 w-3.5" />
              EPM
            </div>
            <div className="space-y-2">
              <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
                {strings.title}
              </h1>
              <p className="max-w-3xl text-muted-foreground text-sm leading-6">
                {mode === 'preview'
                  ? strings.previewModeDescription
                  : strings.editModeDescription}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div
              data-testid="epm-mode-switch"
              className="inline-flex rounded-2xl border border-border/70 bg-background/70 p-1"
            >
              <Button
                size="sm"
                variant={mode === 'preview' ? 'default' : 'ghost'}
                onClick={() => setMode('preview')}
              >
                {strings.previewModeLabel}
              </Button>
              <Button
                size="sm"
                variant={mode === 'edit' ? 'default' : 'ghost'}
                onClick={() => setMode('edit')}
              >
                {strings.editModeLabel}
              </Button>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton
                tooltip={strings.quickCreateHint}
                onClick={() => createEntryMutation.mutate()}
              >
                <Plus className="mr-2 h-4 w-4" />
                {strings.createEntryAction}
              </ActionButton>
              <ActionButton
                tooltip={strings.importHint}
                variant="outline"
                disabled={importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                <FolderSync className="mr-2 h-4 w-4" />
                {strings.importAction}
              </ActionButton>
              {currentEntryId ? (
                <ActionButton
                  tooltip={strings.editEntryDescription}
                  variant="outline"
                  onClick={() => openEntryDetails(currentEntryId)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {strings.openDetailsAction}
                </ActionButton>
              ) : null}
              <ActionButton
                tooltip={strings.refreshAction}
                variant="ghost"
                onClick={() => {
                  setPreviewRefreshToken((value) => value + 1);
                  refreshPage();
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </ActionButton>
            </div>
          </div>
        </div>
      </section>

      {mode === 'preview' ? (
        <div className="space-y-5">
          <Card className="overflow-hidden border-border/70 bg-card/95 shadow-none">
            <CardContent className="space-y-5 p-5 lg:p-6">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px_160px]">
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                    {strings.previewProjectLabel}
                  </div>
                  <div className="font-semibold text-2xl tracking-tight">
                    {previewProjectLabel}
                  </div>
                  <p className="max-w-3xl text-muted-foreground text-sm leading-6">
                    {activePreviewCollection?.description ??
                      strings.previewModeDescription}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                    {strings.collectionsLabel}
                  </div>
                  <Select
                    value={activePreviewCollection?.id}
                    onValueChange={(value) => {
                      setSelectedCollectionId(value);
                      setSelectedEntryId(
                        deliveryCollections.find(
                          (collection) => collection.id === value
                        )?.entries[0]?.id ?? ''
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={strings.emptyCollection} />
                    </SelectTrigger>
                    <SelectContent>
                      {deliveryCollections.map((collection) => (
                        <SelectItem key={collection.id} value={collection.id}>
                          {collection.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-end gap-2 xl:justify-end">
                  <Badge variant="outline">
                    {binding.adapter ?? strings.noAdapterLabel}
                  </Badge>
                  <Badge variant="outline">
                    {previewEntries.length} {strings.entriesMetricLabel}
                  </Badge>
                </div>
              </div>

              {previewQuery.isPending ? (
                <PreviewModeSkeleton />
              ) : activePreviewCollection ? (
                <div
                  className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                  data-testid="epm-preview-gallery"
                >
                  {previewGalleryEntries.map((entry) => {
                    const visualAsset = getDeliveryEntryVisual(entry);
                    const managedPreviewEntry =
                      entries.find((managed) => managed.id === entry.id) ??
                      null;
                    const previewCopy =
                      entry.summary ||
                      extractMarkdown(entry)[0]?.markdown ||
                      strings.previewEmptyDescription;

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className="group w-full overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/70 text-left transition-all hover:-translate-y-1 hover:bg-background hover:shadow-xl"
                        onClick={() => openEntryDetails(entry.id)}
                      >
                        <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.12),transparent_26%),linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
                          <ResilientMediaImage
                            alt={visualAsset?.alt_text ?? entry.title}
                            assetUrl={visualAsset?.assetUrl}
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            fill
                            previewUrl={visualAsset?.assetUrl}
                            sizes="(max-width: 1024px) 100vw, (max-width: 1536px) 33vw, 24vw"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/18 to-transparent" />
                          <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 p-4">
                            <Badge
                              variant="outline"
                              className="bg-background/85"
                            >
                              {activePreviewCollection.title}
                            </Badge>
                            <Badge
                              className={cn(
                                'border-0 shadow-none',
                                statusTone(
                                  managedPreviewEntry?.status ?? 'draft'
                                )
                              )}
                            >
                              {formatStatus(
                                managedPreviewEntry?.status ?? 'draft',
                                strings
                              )}
                            </Badge>
                          </div>
                          <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
                            <div className="line-clamp-2 font-semibold text-xl tracking-tight">
                              {entry.title}
                            </div>
                            <div className="line-clamp-1 text-muted-foreground text-sm">
                              {entry.subtitle || entry.slug}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4 p-4">
                          <p className="line-clamp-3 min-h-[4.5rem] text-muted-foreground text-sm leading-6">
                            {previewCopy}
                          </p>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">
                              {entry.slug}
                            </span>
                            <span className="font-medium">
                              {strings.openDetailsAction}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-border/70 border-dashed bg-background/70 p-6">
                  <div className="font-medium">{strings.previewEmptyTitle}</div>
                  <p className="mt-2 text-muted-foreground text-sm leading-6">
                    {strings.previewEmptyDescription}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-[1.6rem] border border-border/70 bg-card/95 p-4">
            <div className="grid gap-3 xl:grid-cols-[180px_240px_240px_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                  {strings.editModeLabel}
                </div>
                <Select
                  value={editSection}
                  onValueChange={(value) =>
                    setEditSection(value as EditSection)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={strings.contentTab} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entries">
                      {strings.contentTab}
                    </SelectItem>
                    <SelectItem value="workflow">
                      {strings.workflowTab}
                    </SelectItem>
                    <SelectItem value="settings">
                      {strings.settingsTab}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                  {strings.collectionsLabel}
                </div>
                <Select
                  value={activeCollection?.id}
                  onValueChange={(value) => {
                    setSelectedCollectionId(value);
                    setSelectedEntryId(
                      entries.find((entry) => entry.collection_id === value)
                        ?.id ?? ''
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={strings.emptyCollection} />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                  {editSection === 'workflow'
                    ? strings.workflowTab
                    : strings.entrySummaryTitle}
                </div>
                {editSection === 'workflow' ? (
                  <Select
                    value={workflowFilter}
                    onValueChange={(value) =>
                      setWorkflowFilter(value as WorkflowFilter)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={strings.filterAll} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{strings.filterAll}</SelectItem>
                      <SelectItem value="draft">
                        {strings.draftQueue}
                      </SelectItem>
                      <SelectItem value="scheduled">
                        {strings.scheduledQueue}
                      </SelectItem>
                      <SelectItem value="published">
                        {strings.publishedQueue}
                      </SelectItem>
                      <SelectItem value="archived">
                        {strings.archivedQueue}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={activeEditEntry?.id}
                    onValueChange={(value) => setSelectedEntryId(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={strings.emptyEntries} />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleEntries.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                  {strings.searchPlaceholder}
                </div>
                <Input
                  placeholder={strings.searchPlaceholder}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-end justify-end gap-2">
                {activeCollection ? (
                  <ActionButton
                    tooltip={strings.manageCollectionAction}
                    size="sm"
                    variant="outline"
                    onClick={() => openCollectionDetails(activeCollection.id)}
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    {strings.editCollectionAction}
                  </ActionButton>
                ) : null}
                {activeEditEntry ? (
                  <ActionButton
                    tooltip={strings.editEntryDescription}
                    size="sm"
                    variant="outline"
                    onClick={() => openEntryDetails(activeEditEntry.id)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {strings.openDetailsAction}
                  </ActionButton>
                ) : null}
              </div>
            </div>
          </section>

          {editSection === 'entries' ? (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                <Card className="border-border/70 bg-card/95 shadow-none">
                  <CardHeader>
                    <CardTitle>{strings.entrySummaryTitle}</CardTitle>
                    <CardDescription>
                      {strings.editEntriesDescription}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!activeEditEntry ? (
                      <div className="rounded-[1.2rem] border border-border/70 border-dashed p-5 text-muted-foreground text-sm">
                        {strings.emptyEntries}
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="relative min-h-[280px] overflow-hidden rounded-[1.4rem] border border-border/70 bg-background/80">
                          <ResilientMediaImage
                            alt={
                              activeEditEntryVisual?.alt_text ??
                              activeEditEntry.title
                            }
                            assetUrl={activeEditEntryVisual?.asset_url}
                            className="object-cover"
                            fill
                            previewUrl={activeEditEntryVisual?.preview_url}
                            sizes="220px"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/15 to-transparent" />
                        </div>
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              className={statusTone(activeEditEntry.status)}
                            >
                              {formatStatus(activeEditEntry.status, strings)}
                            </Badge>
                            <Badge variant="outline">
                              {activeCollection?.title ??
                                strings.collectionFallbackLabel}
                            </Badge>
                          </div>
                          <div>
                            <h2 className="font-semibold text-2xl tracking-tight">
                              {activeEditEntry.title}
                            </h2>
                            <p className="mt-2 text-muted-foreground text-sm">
                              {activeEditEntry.subtitle || activeEditEntry.slug}
                            </p>
                          </div>
                          <p className="text-muted-foreground text-sm leading-7">
                            {activeEditEntry.summary ||
                              strings.previewEmptyDescription}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[1rem] border border-border/70 bg-background/75 p-3">
                              <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                                {strings.scheduledForLabel}
                              </div>
                              <div className="mt-2 text-sm">
                                {formatDateLabel(
                                  activeEditEntry.scheduled_for,
                                  strings.notScheduledLabel
                                )}
                              </div>
                            </div>
                            <div className="rounded-[1rem] border border-border/70 bg-background/75 p-3">
                              <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                                {strings.assetsLabel}
                              </div>
                              <div className="mt-2 text-sm">
                                {activeEditEntryAssets.length}
                              </div>
                            </div>
                            <div className="rounded-[1rem] border border-border/70 bg-background/75 p-3">
                              <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                                {strings.workspaceBindingLabel}
                              </div>
                              <div className="mt-2 text-sm">
                                {binding.canonical_project?.display_name ??
                                  strings.unboundLabel}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <ActionButton
                              tooltip={strings.editEntryDescription}
                              onClick={() =>
                                openEntryDetails(activeEditEntry.id)
                              }
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              {strings.openDetailsAction}
                            </ActionButton>
                            <ActionButton
                              tooltip={strings.duplicateAction}
                              variant="outline"
                              disabled={duplicateEntryMutation.isPending}
                              onClick={() => duplicateEntryMutation.mutate()}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              {strings.duplicateAction}
                            </ActionButton>
                            <ActionButton
                              tooltip={
                                activeEditEntry.status === 'published'
                                  ? strings.unpublishAction
                                  : strings.publishAction
                              }
                              variant="outline"
                              disabled={publishEntryMutation.isPending}
                              onClick={() =>
                                publishEntryMutation.mutate(
                                  activeEditEntry.status === 'published'
                                    ? 'unpublish'
                                    : 'publish'
                                )
                              }
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              {activeEditEntry.status === 'published'
                                ? strings.unpublishAction
                                : strings.publishAction}
                            </ActionButton>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/95 shadow-none">
                  <CardHeader>
                    <CardTitle>{strings.editCollectionAction}</CardTitle>
                    <CardDescription>
                      {strings.manageCollectionDescription}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-[1.2rem] border border-border/70 bg-background/75 p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {strings.collectionsLabel}
                      </div>
                      <div className="mt-2 font-medium">
                        {activeCollection?.title ?? strings.emptyCollection}
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {activeCollection?.description ??
                          activeCollection?.slug}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1rem] border border-border/70 bg-background/75 p-3">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                          {strings.entriesMetricLabel}
                        </div>
                        <div className="mt-2 font-semibold text-2xl">
                          {visibleEntries.length}
                        </div>
                      </div>
                      <div className="rounded-[1rem] border border-border/70 bg-background/75 p-3">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                          {strings.collectionsMetricLabel}
                        </div>
                        <div className="mt-2 font-semibold text-2xl">
                          {counts.collections}
                        </div>
                      </div>
                    </div>
                    {activeCollection ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() =>
                          openCollectionDetails(activeCollection.id)
                        }
                      >
                        {strings.openCollectionAction}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              {visibleEntries.length === 0 ? (
                <Card className="border-border/70 bg-card/95 shadow-none">
                  <CardContent className="p-6 text-muted-foreground text-sm">
                    {strings.emptyEntries}
                  </CardContent>
                </Card>
              ) : (
                <div
                  className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                  data-testid="epm-edit-gallery"
                >
                  {visibleEntries.map((entry) => {
                    const visual = getEntryVisual(assets, entry.id);

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={cn(
                          'group w-full overflow-hidden rounded-[1.4rem] border text-left transition-all hover:-translate-y-1 hover:shadow-xl',
                          entry.id === activeEditEntry?.id
                            ? 'border-foreground/20 bg-background shadow-sm'
                            : 'border-border/70 bg-background/70 hover:bg-background'
                        )}
                        onClick={() => setSelectedEntryId(entry.id)}
                      >
                        <div className="relative aspect-[4/5] overflow-hidden bg-background/80">
                          <ResilientMediaImage
                            alt={visual?.alt_text ?? entry.title}
                            assetUrl={visual?.asset_url}
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            fill
                            previewUrl={visual?.preview_url}
                            sizes="(max-width: 1024px) 100vw, (max-width: 1536px) 33vw, 24vw"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/15 to-transparent" />
                          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
                            <Badge
                              className={cn(
                                'border-0 shadow-none',
                                statusTone(entry.status)
                              )}
                            >
                              {formatStatus(entry.status, strings)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="bg-background/85"
                            >
                              {entry.slug}
                            </Badge>
                          </div>
                          <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
                            <div className="line-clamp-2 font-semibold text-xl tracking-tight">
                              {entry.title}
                            </div>
                            <div className="line-clamp-1 text-muted-foreground text-sm">
                              {entry.subtitle || activeCollection?.title}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 p-4">
                          <p className="line-clamp-3 min-h-[4.5rem] text-muted-foreground text-sm leading-6">
                            {entry.summary || strings.previewEmptyDescription}
                          </p>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">
                              {formatDateLabel(
                                entry.scheduled_for,
                                strings.notScheduledLabel
                              )}
                            </span>
                            <span className="font-medium">
                              {entry.id === activeEditEntry?.id
                                ? strings.openDetailsAction
                                : strings.editEntryAction}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {editSection === 'workflow' ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {workflowLanes.map((lane) => (
                  <Card
                    key={lane.status}
                    className="border-border/70 bg-card/95 shadow-none"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-base">
                          {lane.title}
                        </CardTitle>
                        <Badge className={statusTone(lane.status)}>
                          {lane.entries.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {lane.entries.length === 0 ? (
                        <div className="rounded-[1rem] border border-border/70 border-dashed p-3 text-muted-foreground text-sm">
                          {strings.emptyEntries}
                        </div>
                      ) : (
                        lane.entries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className="w-full rounded-[1rem] border border-border/70 bg-background/75 px-3 py-3 text-left transition-colors hover:bg-background"
                            onClick={() => {
                              setSelectedCollectionId(entry.collection_id);
                              setSelectedEntryId(entry.id);
                              setEditSection('entries');
                            }}
                          >
                            <div className="truncate font-medium text-sm">
                              {entry.title}
                            </div>
                            <div className="mt-1 truncate text-muted-foreground text-xs">
                              {entry.slug}
                            </div>
                          </button>
                        ))
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="border-border/70 bg-card/95 shadow-none">
                <CardHeader>
                  <CardTitle>{strings.bulkActionsTitle}</CardTitle>
                  <CardDescription>{strings.bulkSelectionHint}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 rounded-[1.2rem] border border-border/70 bg-background/70 p-3">
                    <Input
                      className="w-[240px]"
                      type="datetime-local"
                      value={scheduleValue}
                      onChange={(event) => setScheduleValue(event.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={
                        selectedBulkIds.length === 0 || bulkMutation.isPending
                      }
                      onClick={() =>
                        bulkMutation.mutate({
                          action: 'schedule',
                          scheduledFor: scheduleValue
                            ? new Date(scheduleValue).toISOString()
                            : null,
                        })
                      }
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      {strings.scheduleAction}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        selectedBulkIds.length === 0 || bulkMutation.isPending
                      }
                      onClick={() => bulkMutation.mutate({ action: 'publish' })}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {strings.publishAction}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        selectedBulkIds.length === 0 || bulkMutation.isPending
                      }
                      onClick={() =>
                        bulkMutation.mutate({
                          action: 'set-status',
                          status: 'draft',
                        })
                      }
                    >
                      {strings.statusDraft}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        selectedBulkIds.length === 0 || bulkMutation.isPending
                      }
                      onClick={() => bulkMutation.mutate({ action: 'archive' })}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      {strings.archiveAction}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {workflowEntries.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex items-center gap-3 rounded-[1.1rem] border border-border/70 bg-background/75 px-3 py-3"
                      >
                        <Checkbox
                          checked={selectedBulkIds.includes(entry.id)}
                          onCheckedChange={(checked) =>
                            setSelectedBulkIds((current) =>
                              checked
                                ? [...current, entry.id]
                                : current.filter((value) => value !== entry.id)
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate font-medium text-sm">
                              {entry.title}
                            </div>
                            <Badge className={statusTone(entry.status)}>
                              {formatStatus(entry.status, strings)}
                            </Badge>
                          </div>
                          <div className="mt-1 text-muted-foreground text-xs">
                            {entry.slug} ·{' '}
                            {formatDateLabel(
                              entry.scheduled_for,
                              strings.notScheduledLabel
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {editSection === 'settings' ? (
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="border-border/70 bg-card/95 shadow-none">
                <CardHeader>
                  <CardTitle>{strings.settingsTab}</CardTitle>
                  <CardDescription>
                    {strings.editSettingsDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-[1.2rem] border border-border/70 bg-background/75 p-4">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                      {strings.workspaceBindingLabel}
                    </div>
                    <div className="mt-2 font-medium">
                      {binding.canonical_project?.display_name ??
                        strings.unboundLabel}
                    </div>
                    <div className="mt-1 text-muted-foreground text-sm">
                      {binding.canonical_id ?? strings.noCanonicalIdLabel}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/70 bg-background/75 p-4">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                      {strings.importAction}
                    </div>
                    <p className="mt-2 text-muted-foreground text-sm leading-6">
                      {strings.importHint}
                    </p>
                    <div className="mt-4">
                      <Button
                        disabled={importMutation.isPending}
                        onClick={() => importMutation.mutate()}
                      >
                        <FolderSync className="mr-2 h-4 w-4" />
                        {strings.importAction}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.15rem] border border-border/70 bg-background/75 p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {strings.entriesMetricLabel}
                      </div>
                      <div className="mt-2 font-semibold text-2xl">
                        {counts.entries}
                      </div>
                    </div>
                    <div className="rounded-[1.15rem] border border-border/70 bg-background/75 p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {strings.collectionsMetricLabel}
                      </div>
                      <div className="mt-2 font-semibold text-2xl">
                        {counts.collections}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/95 shadow-none">
                <CardHeader>
                  <CardTitle>{strings.editCollectionAction}</CardTitle>
                  <CardDescription>
                    {strings.manageCollectionDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {collections.map((collection) => {
                    const collectionEntries = entries.filter(
                      (entry) => entry.collection_id === collection.id
                    );

                    return (
                      <div
                        key={collection.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-border/70 bg-background/75 p-4"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">{collection.title}</div>
                          <div className="text-muted-foreground text-sm">
                            {collection.description || collection.slug}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {collectionEntries.length}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openCollectionDetails(collection.id)}
                          >
                            {strings.openCollectionAction}
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {publishEvents.length > 0 ? (
                    <div className="rounded-[1.2rem] border border-border/70 bg-background/75 p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {strings.activityFeedTitle}
                      </div>
                      <div className="mt-3 space-y-2">
                        {publishEvents.slice(0, 4).map((event) => (
                          <div
                            key={event.id}
                            className="rounded-xl border border-border/70 bg-background px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-sm">
                                {event.event_kind}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {formatDateLabel(
                                  event.created_at,
                                  strings.notScheduledLabel
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
