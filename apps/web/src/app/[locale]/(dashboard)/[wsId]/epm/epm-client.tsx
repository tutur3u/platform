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
  Search,
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
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
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
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton
            key={`collection-pill-${index}`}
            className="h-9 w-28 rounded-full"
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-border/70 bg-background/75 shadow-none">
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-52" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`preview-card-skeleton-${index}`}
                  className="overflow-hidden rounded-[1.25rem] border border-border/70 bg-background/80"
                >
                  <Skeleton className="aspect-[4/5] w-full rounded-none" />
                  <div className="space-y-3 p-4">
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-5 w-4/5" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <div className="relative min-h-[360px] overflow-hidden rounded-[1.7rem] border border-border/70 bg-background/75 lg:min-h-[520px]">
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="absolute inset-x-0 bottom-0 space-y-4 p-5 lg:p-6">
              <div className="flex gap-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>

          <Card className="border-border/70 bg-background/75 shadow-none">
            <CardHeader>
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-6">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={`preview-copy-skeleton-${index}`}
                  className="space-y-3"
                >
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-[92%]" />
                  <Skeleton className="h-4 w-[86%]" />
                </div>
              ))}

              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton
                    key={`preview-image-skeleton-${index}`}
                    className="min-h-[180px] rounded-[1.2rem]"
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function EpmClient({
  binding,
  initialMode = 'preview',
  initialStudio,
  strings,
  workspaceId,
}: {
  binding: WorkspaceExternalProjectBinding;
  initialMode?: EpmMode;
  initialStudio: ExternalProjectStudioData;
  strings: EpmStrings;
  workspaceId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<EpmMode>(initialMode);
  const [editSection, setEditSection] = useState<EditSection>('entries');
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
  const activePreviewEntry =
    previewEntries.find((entry) => entry.id === selectedEntryId) ??
    previewEntries[0] ??
    null;
  const previewMarkdownBlocks = extractMarkdown(activePreviewEntry);
  const activePreviewVisual = getDeliveryEntryVisual(activePreviewEntry);
  const previewGalleryEntries = previewEntries.slice(0, 12);
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
    (mode === 'preview' ? activePreviewEntry?.id : activeEditEntry?.id) ?? null;
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                    {strings.previewProjectLabel}
                  </div>
                  <div className="mt-2 font-semibold text-2xl tracking-tight">
                    {previewProjectLabel}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {binding.adapter ?? strings.noAdapterLabel}
                  </Badge>
                  <Badge variant="outline">
                    {binding.canonical_id ?? strings.noCanonicalIdLabel}
                  </Badge>
                </div>
              </div>

              {previewQuery.isPending ? (
                <PreviewModeSkeleton />
              ) : activePreviewCollection ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {deliveryCollections.map((collection) => (
                      <Button
                        key={collection.id}
                        size="sm"
                        variant={
                          collection.id === activePreviewCollection.id
                            ? 'default'
                            : 'outline'
                        }
                        onClick={() => {
                          setSelectedCollectionId(collection.id);
                          setSelectedEntryId(collection.entries[0]?.id ?? '');
                        }}
                      >
                        {collection.title}
                      </Button>
                    ))}
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <Card className="border-border/70 bg-background/75 shadow-none">
                      <CardHeader>
                        <CardTitle>{strings.previewEntriesTitle}</CardTitle>
                        <CardDescription>
                          {activePreviewCollection.description ??
                            activePreviewCollection.slug}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[34rem] pr-3">
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                            {previewGalleryEntries.map((entry) => {
                              const visualAsset = getDeliveryEntryVisual(entry);
                              const managedPreviewEntry =
                                entries.find(
                                  (managed) => managed.id === entry.id
                                ) ?? null;

                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className={cn(
                                    'w-full overflow-hidden rounded-[1.25rem] border text-left transition-all',
                                    entry.id === activePreviewEntry?.id
                                      ? 'border-foreground/20 bg-background shadow-sm'
                                      : 'border-border/70 bg-background/70 hover:bg-background'
                                  )}
                                  onClick={() => setSelectedEntryId(entry.id)}
                                >
                                  <div className="relative aspect-[4/5] overflow-hidden border-border/70 bg-background/80">
                                    <ResilientMediaImage
                                      alt={visualAsset?.alt_text ?? entry.title}
                                      assetUrl={visualAsset?.assetUrl}
                                      className="object-cover"
                                      fill
                                      previewUrl={visualAsset?.assetUrl}
                                      sizes="(max-width: 1280px) 40vw, 22vw"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/15 to-transparent" />
                                    <div className="absolute inset-x-0 bottom-0 p-4">
                                      <div className="flex flex-wrap gap-2">
                                        <Badge
                                          className={cn(
                                            'border-0 shadow-none',
                                            entry.id === activePreviewEntry?.id
                                              ? statusTone(
                                                  managedPreviewEntry?.status ??
                                                    'draft'
                                                )
                                              : 'bg-background/90 text-foreground'
                                          )}
                                        >
                                          {formatStatus(
                                            managedPreviewEntry?.status ??
                                              'draft',
                                            strings
                                          )}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-2 p-4">
                                    <div className="line-clamp-1 font-medium text-sm">
                                      {entry.title}
                                    </div>
                                    <div className="line-clamp-1 text-muted-foreground text-xs">
                                      {entry.subtitle || entry.slug}
                                    </div>
                                    <div className="line-clamp-2 text-muted-foreground text-xs leading-5">
                                      {entry.summary ||
                                        strings.previewEmptyDescription}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <div className="space-y-5">
                      <div className="relative min-h-[360px] overflow-hidden rounded-[1.7rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.12),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.12),transparent_24%),linear-gradient(150deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] lg:min-h-[520px]">
                        {activePreviewVisual ? (
                          <ResilientMediaImage
                            alt={
                              activePreviewVisual.alt_text ??
                              activePreviewEntry?.title ??
                              strings.previewEmptyTitle
                            }
                            assetUrl={activePreviewVisual.assetUrl}
                            className="object-cover"
                            fill
                            previewUrl={activePreviewVisual.assetUrl}
                            sizes="(max-width: 1280px) 100vw, 62vw"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-5 lg:p-6">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {activePreviewCollection.title}
                            </Badge>
                            {currentManagedEntry ? (
                              <Badge
                                className={statusTone(
                                  currentManagedEntry.status
                                )}
                              >
                                {formatStatus(
                                  currentManagedEntry.status,
                                  strings
                                )}
                              </Badge>
                            ) : null}
                          </div>
                          <h2 className="mt-4 max-w-3xl font-semibold text-3xl tracking-tight">
                            {activePreviewEntry?.title ??
                              strings.previewEmptyTitle}
                          </h2>
                          {activePreviewEntry?.subtitle ? (
                            <p className="mt-2 text-base text-muted-foreground">
                              {activePreviewEntry.subtitle}
                            </p>
                          ) : null}
                          <p className="mt-4 max-w-2xl text-muted-foreground text-sm leading-7">
                            {activePreviewEntry?.summary ??
                              strings.previewEmptyDescription}
                          </p>
                        </div>
                      </div>

                      {activePreviewEntry ? (
                        <Card className="border-border/70 bg-background/75 shadow-none">
                          <CardHeader>
                            <CardTitle>
                              {strings.previewCollectionTitle}
                            </CardTitle>
                            <CardDescription>
                              {activePreviewCollection.title}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            {previewMarkdownBlocks.length > 0 ? (
                              previewMarkdownBlocks.map((block) => (
                                <section key={block.id} className="space-y-3">
                                  {block.title ? (
                                    <h3 className="font-semibold text-lg tracking-tight">
                                      {block.title}
                                    </h3>
                                  ) : null}
                                  <div className="whitespace-pre-wrap text-foreground/90 text-sm leading-8">
                                    {block.markdown}
                                  </div>
                                </section>
                              ))
                            ) : (
                              <div className="rounded-[1.2rem] border border-border/70 border-dashed p-5 text-muted-foreground text-sm">
                                {strings.previewEmptyDescription}
                              </div>
                            )}

                            {activePreviewEntry.assets.length > 1 ? (
                              <div className="grid gap-3 md:grid-cols-2">
                                {activePreviewEntry.assets
                                  .filter(
                                    (asset) =>
                                      asset.id !== activePreviewVisual?.id
                                  )
                                  .slice(0, 4)
                                  .map((asset) => (
                                    <div
                                      key={asset.id}
                                      className="relative min-h-[180px] overflow-hidden rounded-[1.2rem] border border-border/70 bg-background/80"
                                    >
                                      <ResilientMediaImage
                                        alt={
                                          asset.alt_text ??
                                          activePreviewEntry.title
                                        }
                                        assetUrl={asset.assetUrl}
                                        className="object-cover"
                                        fill
                                        previewUrl={asset.assetUrl}
                                        sizes="(max-width: 1280px) 100vw, 30vw"
                                      />
                                    </div>
                                  ))}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>
                  </div>
                </>
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
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-[1.6rem] border border-border/70 bg-card/95 p-4">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                {strings.editModeLabel}
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {strings.editModeDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={editSection === 'entries' ? 'default' : 'outline'}
                onClick={() => setEditSection('entries')}
              >
                {strings.contentTab}
              </Button>
              <Button
                size="sm"
                variant={editSection === 'workflow' ? 'default' : 'outline'}
                onClick={() => setEditSection('workflow')}
              >
                {strings.workflowTab}
              </Button>
              <Button
                size="sm"
                variant={editSection === 'settings' ? 'default' : 'outline'}
                onClick={() => setEditSection('settings')}
              >
                {strings.settingsTab}
              </Button>
            </div>
          </section>

          {editSection === 'entries' ? (
            <div className="grid gap-4 xl:grid-cols-[280px_360px_minmax(0,1fr)]">
              <Card className="border-border/70 bg-card/95 shadow-none">
                <CardHeader>
                  <CardTitle>{strings.collectionsLabel}</CardTitle>
                  <CardDescription>
                    {strings.editEntriesDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      className={cn(
                        'w-full rounded-[1.15rem] border px-4 py-3 text-left transition-colors',
                        collection.id === selectedCollectionId
                          ? 'border-foreground/20 bg-background'
                          : 'border-border/70 bg-background/70 hover:bg-background'
                      )}
                      onClick={() => {
                        setSelectedCollectionId(collection.id);
                        setSelectedEntryId(
                          entries.find(
                            (entry) => entry.collection_id === collection.id
                          )?.id ?? ''
                        );
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-sm">
                            {collection.title}
                          </div>
                          <div className="truncate text-muted-foreground text-xs">
                            {collection.slug}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {
                            entries.filter(
                              (entry) => entry.collection_id === collection.id
                            ).length
                          }
                        </Badge>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/95 shadow-none">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>{strings.contentTab}</CardTitle>
                      <CardDescription>
                        {activeCollection?.title ?? strings.emptyCollection}
                      </CardDescription>
                    </div>
                    {activeCollection ? (
                      <ActionButton
                        tooltip={strings.manageCollectionAction}
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openCollectionDetails(activeCollection.id)
                        }
                      >
                        <Settings2 className="mr-2 h-4 w-4" />
                        {strings.editCollectionAction}
                      </ActionButton>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder={strings.searchPlaceholder}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[30rem] pr-3">
                    <div className="space-y-2">
                      {visibleEntries.length === 0 ? (
                        <div className="rounded-[1.2rem] border border-border/70 border-dashed p-4 text-muted-foreground text-sm">
                          {strings.emptyEntries}
                        </div>
                      ) : (
                        visibleEntries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className={cn(
                              'w-full rounded-[1.15rem] border px-4 py-3 text-left transition-colors',
                              entry.id === activeEditEntry?.id
                                ? 'border-foreground/20 bg-background'
                                : 'border-border/70 bg-background/70 hover:bg-background'
                            )}
                            onClick={() => setSelectedEntryId(entry.id)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-sm">
                                  {entry.title}
                                </div>
                                <div className="truncate text-muted-foreground text-xs">
                                  {entry.slug}
                                </div>
                              </div>
                              <Badge className={statusTone(entry.status)}>
                                {formatStatus(entry.status, strings)}
                              </Badge>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

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
                      {strings.emptyCollection}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="relative min-h-[260px] overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/80">
                        <ResilientMediaImage
                          alt={
                            activeEditEntryVisual?.alt_text ??
                            activeEditEntry.title
                          }
                          assetUrl={activeEditEntryVisual?.asset_url}
                          className="object-cover"
                          fill
                          previewUrl={activeEditEntryVisual?.preview_url}
                          sizes="(max-width: 1280px) 100vw, 34vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/15 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-5">
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
                          <h2 className="mt-4 font-semibold text-2xl tracking-tight">
                            {activeEditEntry.title}
                          </h2>
                          {activeEditEntry.subtitle ? (
                            <p className="mt-2 text-muted-foreground text-sm">
                              {activeEditEntry.subtitle}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-[1.2rem] border border-border/70 bg-background/75 p-4">
                        <div className="text-sm leading-7">
                          {activeEditEntry.summary || strings.emptyEntries}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[1.15rem] border border-border/70 bg-background/75 p-4">
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
                        <div className="rounded-[1.15rem] border border-border/70 bg-background/75 p-4">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                            {strings.assetsLabel}
                          </div>
                          <div className="mt-2 text-sm">
                            {activeEditEntryAssets.length}
                          </div>
                        </div>
                        <div className="rounded-[1.15rem] border border-border/70 bg-background/75 p-4">
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
                          onClick={() => openEntryDetails(activeEditEntry.id)}
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
                  )}
                </CardContent>
              </Card>
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
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', strings.filterAll],
                      ['draft', strings.draftQueue],
                      ['scheduled', strings.scheduledQueue],
                      ['published', strings.publishedQueue],
                      ['archived', strings.archivedQueue],
                    ].map(([value, label]) => (
                      <Button
                        key={value}
                        size="sm"
                        variant={
                          workflowFilter === value ? 'default' : 'outline'
                        }
                        onClick={() =>
                          setWorkflowFilter(value as WorkflowFilter)
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

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
