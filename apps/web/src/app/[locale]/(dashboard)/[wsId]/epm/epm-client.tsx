'use client';

import { useMutation } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FolderSync,
  ImagePlus,
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
  updateWorkspaceExternalProjectCollection,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectAttentionItem,
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectImportJob,
  ExternalProjectStudioAsset,
  ExternalProjectStudioData,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import {
  type ComponentProps,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react';
import { useExternalProjectLivePreview } from '../external-projects/use-external-project-live-preview';
import type { EpmStrings } from './epm-strings';
import { ResilientMediaImage } from './resilient-media-image';

type WorkflowFilter = 'all' | ExternalProjectEntry['status'];
type EpmTab = 'activity' | 'content' | 'overview' | 'settings' | 'workflow';
type DashboardFocus = 'operator' | 'visual' | 'workflow';
type DashboardDensity = 'compact' | 'comfortable';
type DashboardPreferences = {
  density: DashboardDensity;
  focus: DashboardFocus;
  showActivity: boolean;
  showCollections: boolean;
  showVisuals: boolean;
};
type DashboardPreferenceToggleKey = keyof Pick<
  DashboardPreferences,
  'showActivity' | 'showCollections' | 'showVisuals'
>;

type CollectionFormState = {
  description: string;
  is_enabled: boolean;
  title: string;
};

const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  density: 'comfortable',
  focus: 'operator',
  showActivity: true,
  showCollections: true,
  showVisuals: true,
};

function buildCollectionFormState(
  collection?: ExternalProjectCollection | null
): CollectionFormState {
  return {
    description: collection?.description ?? '',
    is_enabled: collection?.is_enabled ?? true,
    title: collection?.title ?? '',
  };
}

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

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return null;
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

function buildAttentionQueues(
  collections: ExternalProjectCollection[],
  entries: ExternalProjectEntry[],
  assets: ExternalProjectStudioAsset[],
  importJobs: ExternalProjectImportJob[]
) {
  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection])
  );
  const importCutoff = importJobs[0]?.created_at
    ? new Date(importJobs[0].created_at)
    : null;
  const scheduledSoon = entries
    .filter((entry) => entry.status === 'scheduled' && entry.scheduled_for)
    .sort((a, b) =>
      (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? '')
    )
    .slice(0, 4)
    .map(
      (entry) =>
        ({
          collectionId: entry.collection_id,
          collectionTitle: collectionById.get(entry.collection_id)?.title ?? '',
          detail: `Scheduled for ${formatDateLabel(entry.scheduled_for)}`,
          entryId: entry.id,
          kind: 'scheduled_soon',
          scheduledFor: entry.scheduled_for ?? null,
          slug: entry.slug,
          status: entry.status,
          summary: entry.summary,
          title: entry.title,
        }) satisfies ExternalProjectAttentionItem
    );

  const draftsMissingMedia = entries
    .filter((entry) => entry.status !== 'archived')
    .filter(
      (entry) =>
        !assets.some(
          (asset) => asset.entry_id === entry.id && asset.asset_type === 'image'
        )
    )
    .slice(0, 4)
    .map(
      (entry) =>
        ({
          collectionId: entry.collection_id,
          collectionTitle: collectionById.get(entry.collection_id)?.title ?? '',
          detail: '',
          entryId: entry.id,
          kind: 'missing_media',
          scheduledFor: entry.scheduled_for ?? null,
          slug: entry.slug,
          status: entry.status,
          summary: entry.summary,
          title: entry.title,
        }) satisfies ExternalProjectAttentionItem
    );

  const recentlyImportedUnpublished = importCutoff
    ? entries
        .filter((entry) => entry.status !== 'published')
        .filter((entry) => new Date(entry.created_at) >= importCutoff)
        .slice(0, 4)
        .map(
          (entry) =>
            ({
              collectionId: entry.collection_id,
              collectionTitle:
                collectionById.get(entry.collection_id)?.title ?? '',
              detail: '',
              entryId: entry.id,
              kind: 'recently_imported_unpublished',
              scheduledFor: entry.scheduled_for ?? null,
              slug: entry.slug,
              status: entry.status,
              summary: entry.summary,
              title: entry.title,
            }) satisfies ExternalProjectAttentionItem
        )
    : [];

  const archivedBacklog = entries
    .filter((entry) => entry.status === 'archived')
    .slice(0, 4)
    .map(
      (entry) =>
        ({
          collectionId: entry.collection_id,
          collectionTitle: collectionById.get(entry.collection_id)?.title ?? '',
          detail: '',
          entryId: entry.id,
          kind: 'archived_backlog',
          scheduledFor: entry.scheduled_for ?? null,
          slug: entry.slug,
          status: entry.status,
          summary: entry.summary,
          title: entry.title,
        }) satisfies ExternalProjectAttentionItem
    );

  return {
    archivedBacklog,
    draftsMissingMedia,
    recentlyImportedUnpublished,
    scheduledSoon,
  };
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

export function EpmClient({
  binding,
  initialTab = 'overview',
  initialStudio,
  strings,
  workspaceId,
}: {
  binding: WorkspaceExternalProjectBinding;
  initialTab?: EpmTab;
  initialStudio: ExternalProjectStudioData;
  strings: EpmStrings;
  workspaceId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collections, setCollections] = useState(initialStudio.collections);
  const [entries, setEntries] = useState(initialStudio.entries);
  const [assets] = useState(initialStudio.assets);
  const [importJobs] = useState(initialStudio.importJobs);
  const [publishEvents] = useState(initialStudio.publishEvents);
  const [tab, setTab] = useState<EpmTab>(initialTab);
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [collectionForm, setCollectionForm] = useState<CollectionFormState>(
    buildCollectionFormState()
  );
  const [dashboardPreferences, setDashboardPreferences] =
    useState<DashboardPreferences>(DEFAULT_DASHBOARD_PREFERENCES);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        `epm-dashboard:${workspaceId}`
      );
      if (!stored) {
        return;
      }

      setDashboardPreferences({
        ...DEFAULT_DASHBOARD_PREFERENCES,
        ...(JSON.parse(stored) as Partial<DashboardPreferences>),
      });
    } catch {
      // Ignore malformed local dashboard preferences.
    }
  }, [workspaceId]);

  useEffect(() => {
    window.localStorage.setItem(
      `epm-dashboard:${workspaceId}`,
      JSON.stringify(dashboardPreferences)
    );
  }, [dashboardPreferences, workspaceId]);

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

  const activeEntry =
    visibleEntries.find((entry) => entry.id === selectedEntryId) ??
    visibleEntries[0] ??
    null;
  const activeCollection =
    collections.find((collection) => collection.id === selectedCollectionId) ??
    collections[0] ??
    null;
  const activeEntryAssets = assets.filter(
    (asset) => asset.entry_id === activeEntry?.id
  );
  const activeEntryVisual = getEntryVisual(assets, activeEntry?.id);
  const workflowEntries = entries.filter(
    (entry) => workflowFilter === 'all' || entry.status === workflowFilter
  );
  const visualEntries = visibleEntries.slice(0, 6);
  const queues = buildAttentionQueues(collections, entries, assets, importJobs);
  const counts = {
    archived: entries.filter((entry) => entry.status === 'archived').length,
    collections: collections.length,
    drafts: entries.filter((entry) => entry.status === 'draft').length,
    entries: entries.length,
    published: entries.filter((entry) => entry.status === 'published').length,
    scheduled: entries.filter((entry) => entry.status === 'scheduled').length,
  };
  const metricCards: Array<[string, number]> = [
    [strings.collectionsMetricLabel, counts.collections],
    [strings.entriesMetricLabel, counts.entries],
    [strings.statusDraft, counts.drafts],
    [strings.statusPublished, counts.published],
  ];
  const priorityAttentionItems = [
    ...queues.draftsMissingMedia,
    ...queues.scheduledSoon,
    ...queues.recentlyImportedUnpublished,
    ...queues.archivedBacklog,
  ].slice(0, 5);
  const workflowLanes: Array<{
    entries: ExternalProjectEntry[];
    status: ExternalProjectEntry['status'];
    title: string;
  }> = [
    {
      entries: entries.filter((entry) => entry.status === 'draft').slice(0, 4),
      status: 'draft',
      title: strings.draftQueue,
    },
    {
      entries: entries
        .filter((entry) => entry.status === 'scheduled')
        .slice(0, 4),
      status: 'scheduled',
      title: strings.scheduledQueue,
    },
    {
      entries: entries
        .filter((entry) => entry.status === 'published')
        .slice(0, 4),
      status: 'published',
      title: strings.publishedQueue,
    },
    {
      entries: entries
        .filter((entry) => entry.status === 'archived')
        .slice(0, 4),
      status: 'archived',
      title: strings.archivedQueue,
    },
  ];

  const previewQuery = useExternalProjectLivePreview({
    enabled: previewOpen,
    refreshToken: previewRefreshToken,
    selectedEntryId: activeEntry?.id ?? null,
    workspaceId,
  });

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

  const saveCollectionMutation = useMutation({
    mutationFn: async () => {
      if (!activeCollection) {
        throw new Error('Collection is required');
      }

      return updateWorkspaceExternalProjectCollection(
        workspaceId,
        activeCollection.id,
        {
          description: collectionForm.description || null,
          is_enabled: collectionForm.is_enabled,
          title: collectionForm.title,
        }
      );
    },
    onSuccess: (collection) => {
      setCollections((current) =>
        current.map((item) => (item.id === collection.id ? collection : item))
      );
      setCollectionDialogOpen(false);
      toast.success(strings.saveAction);
      refreshPage();
    },
  });

  const duplicateEntryMutation = useMutation({
    mutationFn: async () => {
      if (!activeEntry) {
        throw new Error('Entry is required');
      }

      return duplicateWorkspaceExternalProjectEntry(
        workspaceId,
        activeEntry.id
      );
    },
    onSuccess: (entry) => {
      mergeEntry(entry);
      setSelectedCollectionId(entry.collection_id);
      setSelectedEntryId(entry.id);
      toast.success(strings.duplicateAction);
      openEntryDetails(entry.id);
      refreshPage();
    },
  });

  const publishEntryMutation = useMutation({
    mutationFn: async (eventKind: 'publish' | 'unpublish') => {
      if (!activeEntry) {
        throw new Error('Entry is required');
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

  const renderedPreviewEntry =
    previewQuery.data?.collections
      .flatMap((collection) => collection.entries)
      .find((entry) => entry.id === activeEntry?.id) ?? null;

  return (
    <div className="min-h-[calc(100svh-5rem)] space-y-5 pb-8">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_360px]">
        <Card className="relative overflow-hidden border-border/70 bg-card/95 shadow-none">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.10),transparent_26%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_42%)]" />
          <CardContent className="relative p-5 lg:p-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                    <Sparkles className="h-3.5 w-3.5" />
                    EPM
                  </div>
                  <div className="max-w-3xl space-y-2">
                    <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
                      {strings.title}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground text-sm leading-6">
                      {strings.tabsDescription}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {binding.canonical_project?.display_name ??
                        strings.unboundLabel}
                    </Badge>
                    <Badge variant="outline">
                      {binding.adapter ?? strings.noAdapterLabel}
                    </Badge>
                    <Badge variant="outline">
                      {dashboardPreferences.focus === 'visual'
                        ? strings.focusVisual
                        : dashboardPreferences.focus === 'workflow'
                          ? strings.focusWorkflow
                          : strings.focusOperator}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
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
                  <ActionButton
                    tooltip={strings.openPreviewAction}
                    variant="outline"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    {strings.openPreviewAction}
                  </ActionButton>
                  {activeEntry ? (
                    <ActionButton
                      tooltip={strings.editEntryDescription}
                      variant="outline"
                      onClick={() => openEntryDetails(activeEntry.id)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {strings.openDetailsAction}
                    </ActionButton>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {metricCards.map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-[1.1rem] border border-border/70 bg-background/80 p-4"
                    >
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {label}
                      </div>
                      <div className="mt-2 font-semibold text-2xl">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_280px]">
                  <div className="relative min-h-[320px] overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/85 lg:min-h-[420px]">
                    {dashboardPreferences.showVisuals &&
                    (activeEntryVisual?.preview_url ||
                      activeEntryVisual?.asset_url) ? (
                      <ResilientMediaImage
                        alt={
                          activeEntryVisual.alt_text ??
                          activeEntry?.title ??
                          strings.title
                        }
                        assetUrl={activeEntryVisual.asset_url}
                        className="object-cover"
                        fill
                        previewUrl={activeEntryVisual.preview_url}
                        sizes="(max-width: 1280px) 100vw, 54vw"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.14),transparent_24%),linear-gradient(140deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/28 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.32em]">
                        {strings.featuredEntryTitle}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge
                          className={statusTone(activeEntry?.status ?? 'draft')}
                        >
                          {formatStatus(
                            activeEntry?.status ?? 'draft',
                            strings
                          )}
                        </Badge>
                        <Badge variant="outline">
                          {activeCollection?.title ??
                            strings.collectionFallbackLabel}
                        </Badge>
                        {activeEntryVisual ? (
                          <Badge variant="outline">{strings.coverBadge}</Badge>
                        ) : null}
                      </div>
                      <h2 className="mt-4 font-semibold text-2xl tracking-tight">
                        {activeEntry?.title ?? strings.emptyCollection}
                      </h2>
                      <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
                        {activeEntry?.summary ||
                          (activeEntry
                            ? strings.noCoverDescription
                            : strings.emptyCollection)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                        {strings.workspaceStatusTitle}
                      </div>
                      <div className="mt-3 font-medium text-lg">
                        {binding.canonical_project?.display_name ??
                          strings.workspaceBindingLabel}
                      </div>
                      <div className="mt-4 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2">
                          <span className="text-muted-foreground">
                            {strings.workspaceBindingLabel}
                          </span>
                          <span>
                            {binding.canonical_id ?? strings.noCanonicalIdLabel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2">
                          <span className="text-muted-foreground">
                            {strings.dashboardModeLabel}
                          </span>
                          <span>
                            {dashboardPreferences.focus === 'visual'
                              ? strings.focusVisual
                              : dashboardPreferences.focus === 'workflow'
                                ? strings.focusWorkflow
                                : strings.focusOperator}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2">
                          <span className="text-muted-foreground">
                            {strings.densityLabel}
                          </span>
                          <span>
                            {dashboardPreferences.density === 'compact'
                              ? strings.densityCompact
                              : strings.densityComfortable}
                          </span>
                        </div>
                      </div>
                    </div>

                    {activeEntry ? (
                      <div className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                          {strings.detailsTitle}
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="font-medium">{activeEntry.title}</div>
                          <p className="text-muted-foreground text-sm leading-6">
                            {strings.detailsDescription}
                          </p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <ActionButton
                            tooltip={strings.editEntryDescription}
                            size="sm"
                            onClick={() => openEntryDetails(activeEntry.id)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {strings.openDetailsAction}
                          </ActionButton>
                          <ActionButton
                            tooltip={strings.duplicateAction}
                            size="sm"
                            variant="outline"
                            disabled={duplicateEntryMutation.isPending}
                            onClick={() => duplicateEntryMutation.mutate()}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            {strings.duplicateAction}
                          </ActionButton>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[1.35rem] border border-border/70 border-dashed bg-background/70 p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl border border-border/70 bg-background p-2">
                            <ImagePlus className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium">
                              {strings.noCoverTitle}
                            </div>
                            <p className="mt-1 text-muted-foreground text-sm leading-6">
                              {strings.noCoverDescription}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                      {strings.attentionTitle}
                    </div>
                    <Badge variant="outline">
                      {priorityAttentionItems.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {priorityAttentionItems.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {strings.emptyEntries}
                      </p>
                    ) : (
                      priorityAttentionItems.map((item) => (
                        <button
                          key={`${item.kind}-${item.entryId}`}
                          type="button"
                          className="w-full rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-left transition-colors hover:bg-background"
                          onClick={() => {
                            setSelectedCollectionId(item.collectionId);
                            setSelectedEntryId(item.entryId);
                            setTab('content');
                          }}
                        >
                          <div className="truncate font-medium text-sm">
                            {item.title}
                          </div>
                          <div className="mt-1 truncate text-muted-foreground text-xs">
                            {item.slug}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid gap-3">
                  {workflowLanes.slice(0, 3).map((lane) => (
                    <div
                      key={lane.status}
                      className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                          {lane.title}
                        </div>
                        <Badge
                          className={cn('border-0', statusTone(lane.status))}
                        >
                          {lane.entries.length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {lane.entries.length === 0 ? (
                          <p className="text-muted-foreground text-sm">
                            {strings.emptyEntries}
                          </p>
                        ) : (
                          lane.entries.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              className="w-full rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-left transition-colors hover:bg-background"
                              onClick={() => {
                                setSelectedCollectionId(entry.collection_id);
                                setSelectedEntryId(entry.id);
                                setTab('content');
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardHeader>
            <CardTitle>{strings.collectionHealthTitle}</CardTitle>
            <CardDescription>{strings.archiveBacklogHint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {collections.length === 0 ? (
              <div className="rounded-[1.2rem] border border-border/70 border-dashed p-4 text-muted-foreground text-sm">
                {strings.emptyCollection}
              </div>
            ) : (
              collections.slice(0, 5).map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className={cn(
                    'w-full rounded-[1.2rem] border px-4 py-3 text-left transition-colors',
                    collection.id === selectedCollectionId
                      ? 'border-foreground/20 bg-background'
                      : 'border-border/70 bg-background/70 hover:bg-background'
                  )}
                  onClick={() => {
                    setSelectedCollectionId(collection.id);
                    setTab('content');
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
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <div
        data-testid="epm-action-bar"
        className="sticky top-20 z-20 rounded-[1.5rem] border border-border/70 bg-background/88 p-2 shadow-sm backdrop-blur"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] bg-background/60 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {strings.visualBoardTitle}
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {strings.quickCreateHint}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              tooltip={strings.quickCreateHint}
              variant="secondary"
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
            <ActionButton
              tooltip={strings.previewDescription}
              variant="outline"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="mr-2 h-4 w-4" />
              {strings.openPreviewAction}
            </ActionButton>
            <ActionButton
              tooltip={strings.refreshAction}
              variant="ghost"
              onClick={refreshPage}
            >
              <RefreshCw className="h-4 w-4" />
            </ActionButton>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as EpmTab)}>
        <TabsList className="h-auto flex-wrap justify-start rounded-2xl border border-border/70 bg-background/70 p-1">
          <TabsTrigger value="overview">{strings.overviewTab}</TabsTrigger>
          <TabsTrigger value="content">{strings.contentTab}</TabsTrigger>
          <TabsTrigger value="workflow">{strings.workflowTab}</TabsTrigger>
          <TabsTrigger value="activity">{strings.activityTab}</TabsTrigger>
          <TabsTrigger value="settings">{strings.settingsTab}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div
            className={cn(
              'grid gap-4',
              dashboardPreferences.showCollections
                ? 'xl:grid-cols-[1.15fr_0.85fr]'
                : 'xl:grid-cols-1'
            )}
          >
            <Card className="border-border/70 bg-card/90 shadow-none">
              <CardHeader>
                <CardTitle>{strings.attentionTitle}</CardTitle>
                <CardDescription>{strings.archiveBacklogHint}</CardDescription>
              </CardHeader>
              <CardContent
                className={cn(
                  'grid gap-3',
                  dashboardPreferences.density === 'compact'
                    ? 'md:grid-cols-4'
                    : 'md:grid-cols-2'
                )}
              >
                {[
                  queues.scheduledSoon,
                  queues.draftsMissingMedia,
                  queues.recentlyImportedUnpublished,
                  queues.archivedBacklog,
                ].map((items, index) => {
                  const title = [
                    strings.scheduledQueue,
                    strings.draftQueue,
                    strings.publishedQueue,
                    strings.archivedQueue,
                  ][index];

                  return (
                    <div
                      key={title}
                      className="rounded-[1.35rem] border border-border/70 bg-background/65 p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-medium text-sm">{title}</div>
                        <Badge variant="outline">{items.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {items.length === 0 ? (
                          <p className="text-muted-foreground text-sm">
                            {strings.emptyEntries}
                          </p>
                        ) : (
                          items.map((item) => (
                            <button
                              key={item.entryId}
                              type="button"
                              className="w-full rounded-xl border border-border/70 bg-background/80 p-3 text-left transition-colors hover:bg-background"
                              onClick={() => {
                                setSelectedCollectionId(item.collectionId);
                                setSelectedEntryId(item.entryId);
                                setTab('content');
                              }}
                            >
                              <div className="font-medium text-sm">
                                {item.title}
                              </div>
                              <div className="mt-1 text-muted-foreground text-xs">
                                {item.kind === 'missing_media'
                                  ? strings.missingLeadImageLabel
                                  : item.kind ===
                                      'recently_imported_unpublished'
                                    ? strings.recentUnpublishedHint
                                    : item.kind === 'archived_backlog'
                                      ? strings.recoveryHint
                                      : `${strings.scheduledForLabel} ${
                                          formatDateLabel(item.scheduledFor) ??
                                          strings.notScheduledLabel
                                        }`}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {dashboardPreferences.showCollections ? (
              <Card className="border-border/70 bg-card/90 shadow-none">
                <CardHeader>
                  <CardTitle>{strings.collectionHealthTitle}</CardTitle>
                  <CardDescription>
                    {binding.canonical_project?.display_name ??
                      strings.workspaceBindingLabel}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {collections.map((collection) => {
                    const collectionEntries = entries.filter(
                      (entry) => entry.collection_id === collection.id
                    );
                    const publishedEntries = collectionEntries.filter(
                      (entry) => entry.status === 'published'
                    );

                    return (
                      <button
                        key={collection.id}
                        type="button"
                        className="w-full rounded-[1.35rem] border border-border/70 bg-background/70 p-4 text-left transition-colors hover:bg-background"
                        onClick={() => {
                          setSelectedCollectionId(collection.id);
                          setTab('content');
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">
                              {collection.title}
                            </div>
                            <div className="text-muted-foreground text-sm">
                              {collection.description || collection.slug}
                            </div>
                          </div>
                          <Badge variant="outline">
                            {collectionEntries.length}
                          </Badge>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#f472b6,#60a5fa)]"
                            style={{
                              width: `${collectionEntries.length === 0 ? 0 : (publishedEntries.length / collectionEntries.length) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-muted-foreground text-xs">
                          <span>
                            {publishedEntries.length}{' '}
                            {strings.statusPublished.toLowerCase()}
                          </span>
                          <span>
                            {collection.is_enabled
                              ? strings.enabledLabel
                              : strings.statusArchived}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {dashboardPreferences.showVisuals ? (
            <Card className="border-border/70 bg-card/90 shadow-none">
              <CardHeader>
                <CardTitle>{strings.visualBoardTitle}</CardTitle>
                <CardDescription>{strings.previewDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {visualEntries.length === 0 ? (
                  <div className="rounded-[1.35rem] border border-border/70 border-dashed p-4 text-muted-foreground text-sm md:col-span-3">
                    {strings.emptyEntries}
                  </div>
                ) : (
                  visualEntries.map((entry) => {
                    const visualAsset = getEntryVisual(assets, entry.id);

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className="group overflow-hidden rounded-[1.35rem] border border-border/70 bg-background/80 text-left transition-all hover:-translate-y-1 hover:bg-background"
                        onClick={() => {
                          setSelectedCollectionId(entry.collection_id);
                          setSelectedEntryId(entry.id);
                          setTab('content');
                        }}
                      >
                        <div className="relative h-40 overflow-hidden border-border/70 border-b bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.16),transparent_30%),linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]">
                          <ResilientMediaImage
                            alt={visualAsset?.alt_text ?? entry.title}
                            assetUrl={visualAsset?.asset_url}
                            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                            fill
                            previewUrl={visualAsset?.preview_url}
                            sizes="(max-width: 1280px) 100vw, 33vw"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                          <div className="absolute right-3 bottom-3">
                            <Badge className={statusTone(entry.status)}>
                              {formatStatus(entry.status, strings)}
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-3 p-4">
                          <div>
                            <div className="font-medium text-sm">
                              {entry.title}
                            </div>
                            <div className="mt-1 truncate text-muted-foreground text-xs">
                              {entry.slug}
                            </div>
                          </div>
                          <p className="line-clamp-2 text-muted-foreground text-sm leading-6">
                            {entry.summary || strings.emptyEntries}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="border-border/70 bg-card/90 shadow-none">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{strings.collectionsLabel}</CardTitle>
                  <ActionButton
                    tooltip={strings.quickCreateHint}
                    size="sm"
                    variant="ghost"
                    onClick={() => createEntryMutation.mutate()}
                  >
                    <Plus className="h-4 w-4" />
                  </ActionButton>
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
              <CardContent className="space-y-3">
                <ScrollArea className="h-[26rem] pr-3">
                  <div className="space-y-2">
                    {collections.map((collection) => (
                      <button
                        key={collection.id}
                        type="button"
                        className={cn(
                          'w-full rounded-[1.1rem] border px-3 py-3 text-left transition-colors',
                          collection.id === selectedCollectionId
                            ? 'border-foreground/20 bg-background'
                            : 'border-border/70 bg-background/60 hover:bg-background/90'
                        )}
                        onClick={() => setSelectedCollectionId(collection.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm">
                              {collection.title}
                            </div>
                            <div className="text-muted-foreground text-xs">
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
                  </div>
                  <div className="mt-4 space-y-2">
                    {visibleEntries.length === 0 ? (
                      <div className="rounded-xl border border-border/70 border-dashed p-4 text-muted-foreground text-sm">
                        {strings.emptyEntries}
                      </div>
                    ) : (
                      visibleEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={cn(
                            'w-full rounded-[1.1rem] border px-3 py-3 text-left transition-colors',
                            entry.id === activeEntry?.id
                              ? 'border-foreground/20 bg-background'
                              : 'border-border/70 bg-background/55 hover:bg-background/90'
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
                              {entry.summary ? (
                                <p className="mt-2 line-clamp-2 text-muted-foreground text-xs">
                                  {entry.summary}
                                </p>
                              ) : null}
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

            <div className="space-y-4">
              {dashboardPreferences.showVisuals ? (
                <Card className="border-border/70 bg-card/90 shadow-none">
                  <CardHeader>
                    <CardTitle>{strings.entryDeckTitle}</CardTitle>
                    <CardDescription>
                      {strings.openPreviewAction}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    {visualEntries.length === 0 ? (
                      <div className="rounded-[1.2rem] border border-border/70 border-dashed p-4 text-muted-foreground text-sm md:col-span-3">
                        {strings.emptyEntries}
                      </div>
                    ) : (
                      visualEntries.map((entry) => {
                        const visualAsset = getEntryVisual(assets, entry.id);

                        return (
                          <button
                            key={entry.id}
                            type="button"
                            className={cn(
                              'group overflow-hidden rounded-[1.2rem] border text-left transition-all hover:-translate-y-1',
                              entry.id === activeEntry?.id
                                ? 'border-foreground/20 bg-background'
                                : 'border-border/70 bg-background/75 hover:bg-background'
                            )}
                            onClick={() => setSelectedEntryId(entry.id)}
                          >
                            <div className="relative h-32 overflow-hidden border-border/70 border-b bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.16),transparent_32%),linear-gradient(150deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]">
                              <ResilientMediaImage
                                alt={visualAsset?.alt_text ?? entry.title}
                                assetUrl={visualAsset?.asset_url}
                                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                fill
                                previewUrl={visualAsset?.preview_url}
                                sizes="(max-width: 1280px) 100vw, 24vw"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                            </div>
                            <div className="space-y-2 p-3">
                              <div className="truncate font-medium text-sm">
                                {entry.title}
                              </div>
                              <Badge className={statusTone(entry.status)}>
                                {formatStatus(entry.status, strings)}
                              </Badge>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              ) : null}

              <Card className="border-border/70 bg-card/90 shadow-none">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{strings.entrySummaryTitle}</CardTitle>
                      <CardDescription>
                        {activeEntry
                          ? activeEntry.slug
                          : strings.emptyCollection}
                      </CardDescription>
                    </div>
                    {activeEntry ? (
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          tooltip={strings.editEntryDescription}
                          size="sm"
                          variant="outline"
                          onClick={() => openEntryDetails(activeEntry.id)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {strings.openDetailsAction}
                        </ActionButton>
                        <ActionButton
                          tooltip={strings.duplicateAction}
                          size="sm"
                          variant="outline"
                          disabled={duplicateEntryMutation.isPending}
                          onClick={() => duplicateEntryMutation.mutate()}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          {strings.duplicateAction}
                        </ActionButton>
                        <ActionButton
                          tooltip={strings.openPreviewAction}
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewOpen(true)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {strings.openPreviewAction}
                        </ActionButton>
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  {!activeEntry ? (
                    <div className="rounded-[1.2rem] border border-border/70 border-dashed p-5 text-muted-foreground text-sm">
                      {strings.emptyCollection}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusTone(activeEntry.status)}>
                          {formatStatus(activeEntry.status, strings)}
                        </Badge>
                        <Badge variant="outline">
                          {activeCollection?.title ??
                            strings.collectionFallbackLabel}
                        </Badge>
                        <Badge variant="outline">
                          {activeEntryAssets.length} {strings.assetsLabel}
                        </Badge>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_260px]">
                        <div className="space-y-3 rounded-[1.35rem] border border-border/70 bg-background/75 p-4">
                          <div>
                            <h2 className="font-semibold text-2xl tracking-tight">
                              {activeEntry.title}
                            </h2>
                            {activeEntry.subtitle ? (
                              <p className="mt-1 text-muted-foreground text-sm">
                                {activeEntry.subtitle}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-sm leading-6">
                            {activeEntry.summary || strings.emptyEntries}
                          </p>
                        </div>
                        <div className="space-y-3">
                          <div className="rounded-[1.35rem] border border-border/70 bg-background/75 p-3">
                            <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              {strings.scheduledForLabel}
                            </div>
                            <div className="mt-2 font-medium text-sm">
                              {formatDateLabel(activeEntry.scheduled_for) ??
                                strings.notScheduledLabel}
                            </div>
                          </div>
                          <div className="rounded-[1.35rem] border border-border/70 bg-background/75 p-3">
                            <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              {strings.workspaceBindingLabel}
                            </div>
                            <div className="mt-2 font-medium text-sm">
                              {binding.canonical_project?.display_name ??
                                strings.unboundLabel}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Accordion
                        type="multiple"
                        className="rounded-2xl border border-border/70 px-4"
                      >
                        <AccordionItem value="summary">
                          <AccordionTrigger>
                            {strings.summaryLabel}
                          </AccordionTrigger>
                          <AccordionContent>
                            <dl className="grid gap-3 md:grid-cols-2">
                              <div>
                                <dt className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                  {strings.titleLabel}
                                </dt>
                                <dd className="mt-1 text-sm">
                                  {activeEntry.title}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                                  {strings.subtitleLabel}
                                </dt>
                                <dd className="mt-1 text-sm">
                                  {activeEntry.subtitle || strings.noneLabel}
                                </dd>
                              </div>
                            </dl>
                          </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="metadata">
                          <AccordionTrigger>
                            {strings.metadataLabel}
                          </AccordionTrigger>
                          <AccordionContent>
                            <pre className="overflow-x-auto rounded-xl bg-background/60 p-3 text-xs">
                              {JSON.stringify(activeEntry.metadata, null, 2)}
                            </pre>
                          </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="profile">
                          <AccordionTrigger>
                            {strings.profileDataLabel}
                          </AccordionTrigger>
                          <AccordionContent>
                            <pre className="overflow-x-auto rounded-xl bg-background/60 p-3 text-xs">
                              {JSON.stringify(
                                activeEntry.profile_data,
                                null,
                                2
                              )}
                            </pre>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={publishEntryMutation.isPending}
                          onClick={() =>
                            publishEntryMutation.mutate(
                              activeEntry.status === 'published'
                                ? 'unpublish'
                                : 'publish'
                            )
                          }
                        >
                          {activeEntry.status === 'published'
                            ? strings.unpublishAction
                            : strings.publishAction}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workflow" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_0.8fr]">
            <Card className="border-border/70 bg-card/90 shadow-none">
              <CardHeader>
                <CardTitle>{strings.visualBoardTitle}</CardTitle>
                <CardDescription>{strings.bulkSelectionHint}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {workflowLanes.map((lane) => (
                  <div
                    key={lane.status}
                    className="rounded-[1.35rem] border border-border/70 bg-background/75 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-medium text-sm">{lane.title}</div>
                      <Badge className={statusTone(lane.status)}>
                        {lane.entries.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {lane.entries.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          {strings.emptyEntries}
                        </p>
                      ) : (
                        lane.entries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className="w-full rounded-xl border border-border/70 bg-background px-3 py-3 text-left transition-colors hover:bg-background/80"
                            onClick={() => {
                              setSelectedCollectionId(entry.collection_id);
                              setSelectedEntryId(entry.id);
                              setTab('content');
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
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90 shadow-none">
              <CardHeader>
                <CardTitle>{strings.workspaceStatusTitle}</CardTitle>
                <CardDescription>{strings.importHint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-[1.35rem] border border-border/70 bg-background/75 p-4">
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    {strings.scheduledQueue}
                  </div>
                  <div className="mt-2 font-semibold text-3xl">
                    {counts.scheduled}
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-border/70 bg-background/75 p-4">
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    {strings.publishedQueue}
                  </div>
                  <div className="mt-2 font-semibold text-3xl">
                    {counts.published}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card/90 shadow-none">
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
                    variant={workflowFilter === value ? 'default' : 'outline'}
                    onClick={() => setWorkflowFilter(value as WorkflowFilter)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background/55 p-3">
                <Input
                  className="w-[220px]"
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
                    className="flex items-center gap-3 rounded-[1.1rem] border border-border/70 bg-background/70 px-3 py-3"
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
                        {formatDateLabel(entry.scheduled_for) ??
                          strings.notScheduledLabel}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <div
            className={cn(
              'grid gap-4',
              dashboardPreferences.showActivity
                ? 'xl:grid-cols-2'
                : 'xl:grid-cols-1'
            )}
          >
            <Card className="border-border/70 bg-card/90 shadow-none">
              <CardHeader>
                <CardTitle>{strings.importAction}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {importJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-border/70 bg-background/55 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-sm">{job.status}</div>
                      <div className="text-muted-foreground text-xs">
                        {formatDateLabel(job.created_at)}
                      </div>
                    </div>
                    <div className="mt-1 text-muted-foreground text-sm">
                      {job.source_reference}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {dashboardPreferences.showActivity ? (
              <Card className="border-border/70 bg-card/90 shadow-none">
                <CardHeader>
                  <CardTitle>{strings.activityFeedTitle}</CardTitle>
                  <CardDescription>{strings.activityTab}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {publishEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-sm">
                          {event.event_kind}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatDateLabel(event.created_at)}
                        </div>
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {event.visibility_scope}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="border-border/70 bg-card/90 shadow-none">
              <CardHeader>
                <CardTitle>{strings.dashboardPreferencesTitle}</CardTitle>
                <CardDescription>{strings.settingsTab}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{strings.dashboardModeLabel}</Label>
                  <Select
                    value={dashboardPreferences.focus}
                    onValueChange={(value) =>
                      setDashboardPreferences((current) => ({
                        ...current,
                        focus: value as DashboardFocus,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operator">
                        {strings.focusOperator}
                      </SelectItem>
                      <SelectItem value="visual">
                        {strings.focusVisual}
                      </SelectItem>
                      <SelectItem value="workflow">
                        {strings.focusWorkflow}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{strings.densityLabel}</Label>
                  <Select
                    value={dashboardPreferences.density}
                    onValueChange={(value) =>
                      setDashboardPreferences((current) => ({
                        ...current,
                        density: value as DashboardDensity,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">
                        {strings.densityCompact}
                      </SelectItem>
                      <SelectItem value="comfortable">
                        {strings.densityComfortable}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 rounded-[1.35rem] border border-border/70 bg-background/75 p-4">
                  {(
                    [
                      ['showVisuals', strings.showVisualsLabel],
                      ['showCollections', strings.showCollectionsLabel],
                      ['showActivity', strings.showActivityLabel],
                    ] as const satisfies ReadonlyArray<
                      readonly [DashboardPreferenceToggleKey, string]
                    >
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-sm">{label}</span>
                      <Switch
                        checked={dashboardPreferences[key]}
                        onCheckedChange={(checked) =>
                          setDashboardPreferences((current) => ({
                            ...current,
                            [key]: checked,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/90 shadow-none">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{strings.settingsTab}</CardTitle>
                    <CardDescription>
                      {binding.adapter ?? strings.noAdapterLabel}
                    </CardDescription>
                  </div>
                  <ActionButton
                    tooltip={strings.editCollectionAction}
                    variant="outline"
                    onClick={() => {
                      setCollectionForm(
                        buildCollectionFormState(activeCollection)
                      );
                      setCollectionDialogOpen(true);
                    }}
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    {strings.editCollectionAction}
                  </ActionButton>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion
                  type="multiple"
                  className="rounded-2xl border border-border/70 px-4"
                >
                  <AccordionItem value="binding">
                    <AccordionTrigger>
                      {strings.workspaceBindingLabel}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 text-sm">
                        <div>
                          {binding.canonical_project?.display_name ??
                            strings.unboundLabel}
                        </div>
                        <div className="text-muted-foreground">
                          {binding.canonical_id ?? strings.noCanonicalIdLabel}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="collections">
                    <AccordionTrigger>
                      {strings.collectionsLabel}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        {collections.map((collection) => (
                          <div
                            key={collection.id}
                            className="rounded-xl border border-border/70 bg-background/55 p-3 text-sm"
                          >
                            <div className="font-medium">
                              {collection.title}
                            </div>
                            <div className="text-muted-foreground">
                              {collection.description || collection.slug}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={collectionDialogOpen}
        onOpenChange={setCollectionDialogOpen}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{strings.editCollectionAction}</DialogTitle>
            <DialogDescription>{activeCollection?.slug}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{strings.titleLabel}</Label>
              <Input
                value={collectionForm.title}
                onChange={(event) =>
                  setCollectionForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{strings.summaryLabel}</Label>
              <Textarea
                rows={4}
                value={collectionForm.description}
                onChange={(event) =>
                  setCollectionForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
              <Checkbox
                checked={collectionForm.is_enabled}
                onCheckedChange={(checked) =>
                  setCollectionForm((current) => ({
                    ...current,
                    is_enabled: checked === true,
                  }))
                }
              />
              <span className="text-sm">{strings.enabledLabel}</span>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setCollectionDialogOpen(false)}
            >
              {strings.cancelAction}
            </Button>
            <Button
              disabled={saveCollectionMutation.isPending}
              onClick={() => saveCollectionMutation.mutate()}
            >
              {strings.saveAction}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>{strings.previewTitle}</SheetTitle>
            <SheetDescription>{strings.previewDescription}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-4 pb-8">
            <Tabs defaultValue="rendered">
              <TabsList>
                <TabsTrigger value="rendered">
                  {strings.renderedLabel}
                </TabsTrigger>
                <TabsTrigger value="payload">
                  {strings.payloadLabel}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="rendered" className="space-y-4">
                {renderedPreviewEntry ? (
                  <Card className="border-border/70 bg-card/80">
                    <CardContent className="space-y-4 p-4">
                      {renderedPreviewEntry.assets[0]?.assetUrl ? (
                        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/70">
                          <ResilientMediaImage
                            alt={
                              renderedPreviewEntry.assets[0].alt_text ??
                              renderedPreviewEntry.title
                            }
                            assetUrl={renderedPreviewEntry.assets[0].assetUrl}
                            className="h-auto w-full object-cover"
                            height={900}
                            width={1200}
                          />
                        </div>
                      ) : null}
                      <div>
                        <h3 className="font-semibold text-2xl">
                          {renderedPreviewEntry.title}
                        </h3>
                        {renderedPreviewEntry.summary ? (
                          <p className="mt-2 text-muted-foreground text-sm leading-6">
                            {renderedPreviewEntry.summary}
                          </p>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="rounded-2xl border border-border/70 border-dashed p-5 text-muted-foreground text-sm">
                    {strings.emptyEntries}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="payload">
                <pre className="overflow-x-auto rounded-2xl border border-border/70 bg-background/60 p-4 text-xs">
                  {previewQuery.isLoading
                    ? strings.loadingPreviewLabel
                    : JSON.stringify(previewQuery.data, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
