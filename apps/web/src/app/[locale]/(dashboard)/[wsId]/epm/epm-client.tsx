'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  Clock,
  Copy,
  Ellipsis,
  FolderSync,
  Layers2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from '@tuturuuu/icons';
import {
  bulkUpdateWorkspaceExternalProjectEntries,
  createWorkspaceExternalProjectCollection,
  createWorkspaceExternalProjectEntry,
  deleteWorkspaceExternalProjectCollection,
  deleteWorkspaceExternalProjectEntry,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';
import { useExternalProjectLivePreview } from '../external-projects/use-external-project-live-preview';
import { EntryDetailClient } from './entries/[entryId]/entry-detail-client';
import type { EpmStrings } from './epm-strings';
import { ResilientMediaImage } from './resilient-media-image';
import { getEpmStudioQueryKey, useEpmStudio } from './use-epm-studio';

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

function slugifyLabel(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return normalized || fallback;
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

function EditModeSkeleton() {
  return (
    <div className="space-y-5" data-testid="epm-edit-skeleton">
      <section className="rounded-[1.6rem] border border-border/70 bg-card/95 p-4">
        <div className="grid gap-3 xl:grid-cols-[180px_240px_240px_minmax(0,1fr)_auto]">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardContent className="grid gap-4 p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <Skeleton className="aspect-[4/5] w-full rounded-[1.4rem]" />
            <div className="space-y-4">
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-9 w-3/4 rounded-xl" />
              <Skeleton className="h-4 w-full rounded-lg" />
              <Skeleton className="h-4 w-[88%] rounded-lg" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-20 rounded-[1rem]" />
                <Skeleton className="h-20 rounded-[1rem]" />
                <Skeleton className="h-20 rounded-[1rem]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-24 w-full rounded-[1.2rem]" />
            <Skeleton className="h-24 w-full rounded-[1.2rem]" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </CardContent>
        </Card>
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
  initialStudio?: ExternalProjectStudioData;
  strings: EpmStrings;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const studioQuery = useEpmStudio({
    initialData: initialStudio ? { ...initialStudio, binding } : undefined,
    workspaceId,
  });
  const studio = studioQuery.data;
  const [mode, setMode] = useState<EpmMode>(initialMode);
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
  const [editorEntryId, setEditorEntryId] = useState<string | null>(null);
  const [entryDeleteTarget, setEntryDeleteTarget] = useState<string | null>(
    null
  );
  const [collectionDeleteTarget, setCollectionDeleteTarget] = useState<
    string | null
  >(null);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const deferredSearch = useDeferredValue(search);
  const entries = studio?.entries ?? initialStudio?.entries ?? [];
  const collections = studio?.collections ?? initialStudio?.collections ?? [];
  const assets = studio?.assets ?? initialStudio?.assets ?? [];
  const publishEvents =
    studio?.publishEvents ?? initialStudio?.publishEvents ?? [];

  useEffect(() => {
    const firstCollectionId = collections[0]?.id;
    if (!selectedCollectionId && firstCollectionId) {
      setSelectedCollectionId(firstCollectionId);
    }
  }, [collections, selectedCollectionId]);

  useEffect(() => {
    const firstEntryId = entries[0]?.id;
    if (!selectedEntryId && firstEntryId) {
      setSelectedEntryId(firstEntryId);
    }
  }, [entries, selectedEntryId]);

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
  const editorEntry =
    entries.find((entry) => entry.id === editorEntryId) ?? null;
  const collectionDeleteCandidate =
    collections.find(
      (collection) => collection.id === collectionDeleteTarget
    ) ?? null;
  const entryDeleteCandidate =
    entries.find((entry) => entry.id === entryDeleteTarget) ?? null;

  const updateStudioCache = (
    updater: (current: NonNullable<typeof studio>) => NonNullable<typeof studio>
  ) => {
    queryClient.setQueryData(
      getEpmStudioQueryKey(workspaceId),
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

  const openEntryEditor = (entryId: string) => {
    setSelectedEntryId(entryId);
    setEditorEntryId(entryId);
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
      openEntryEditor(entry.id);
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: async () => {
      const collectionType =
        binding.canonical_project?.allowed_collections[0] ??
        activeCollection?.collection_type ??
        'collection';
      const title = newCollectionTitle.trim() || 'Untitled collection';
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

  const duplicateEntryMutation = useMutation({
    mutationFn: async (entryId?: string) => {
      const targetEntryId = entryId ?? currentManagedEntry?.id;
      if (!targetEntryId) {
        throw new Error('Entry is required');
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
        throw new Error('Entry is required');
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

  const importMutation = useMutation({
    mutationFn: async () => importWorkspaceExternalProjectContent(workspaceId),
    onSuccess: () => {
      toast.success(strings.importAction);
      setPreviewRefreshToken((value) => value + 1);
      queryClient.invalidateQueries({
        queryKey: getEpmStudioQueryKey(workspaceId),
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

  return (
    <div className="min-h-[calc(100svh-5rem)] space-y-4 pb-6">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-[1.5rem] border border-border/70 bg-card/95 px-4 py-4 shadow-none sm:px-5">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">
            {strings.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {binding.canonical_project?.display_name ?? previewProjectLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            data-testid="epm-mode-switch"
            className="inline-flex rounded-xl border border-border/70 bg-background/70 p-1"
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

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={strings.manageCollectionAction}
              >
                <Ellipsis className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => createEntryMutation.mutate()}>
                <Plus className="mr-2 h-4 w-4" />
                {strings.createEntryAction}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateCollectionOpen(true)}>
                <Layers2 className="mr-2 h-4 w-4" />
                {strings.createCollectionAction}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                <FolderSync className="mr-2 h-4 w-4" />
                {strings.importAction}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setPreviewRefreshToken((value) => value + 1);
                  queryClient.invalidateQueries({
                    queryKey: getEpmStudioQueryKey(workspaceId),
                  });
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {strings.refreshAction}
              </DropdownMenuItem>
              {activeCollection ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => openCollectionDetails(activeCollection.id)}
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    {strings.editCollectionAction}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      setCollectionDeleteTarget(activeCollection.id)
                    }
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {strings.deleteCollectionAction}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <Dialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{strings.createCollectionAction}</DialogTitle>
            <DialogDescription>
              {strings.manageCollectionDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="epm-new-collection-title">
                {strings.titleLabel}
              </Label>
              <Input
                id="epm-new-collection-title"
                value={newCollectionTitle}
                onChange={(event) => setNewCollectionTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="epm-new-collection-description">
                {strings.descriptionLabel}
              </Label>
              <Input
                id="epm-new-collection-description"
                value={newCollectionDescription}
                onChange={(event) =>
                  setNewCollectionDescription(event.target.value)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateCollectionOpen(false)}
            >
              {strings.cancelAction}
            </Button>
            <Button
              disabled={createCollectionMutation.isPending}
              onClick={() => createCollectionMutation.mutate()}
            >
              {strings.createCollectionAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(entryDeleteCandidate)}
        onOpenChange={(open) => {
          if (!open) {
            setEntryDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.deleteEntryAction}</AlertDialogTitle>
            <AlertDialogDescription>
              {entryDeleteCandidate?.title ?? strings.emptyEntries}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (entryDeleteCandidate) {
                  deleteEntryMutation.mutate(entryDeleteCandidate.id);
                }
              }}
            >
              {strings.deleteEntryAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(collectionDeleteCandidate)}
        onOpenChange={(open) => {
          if (!open) {
            setCollectionDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {strings.deleteCollectionAction}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {collectionDeleteCandidate?.title ?? strings.emptyCollection}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancelAction}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (collectionDeleteCandidate) {
                  deleteCollectionMutation.mutate(collectionDeleteCandidate.id);
                }
              }}
            >
              {strings.deleteCollectionAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {mode === 'preview' ? (
        <div className="space-y-4">
          <section className="flex flex-wrap items-end justify-between gap-3 rounded-[1.35rem] border border-border/70 bg-card/95 p-3">
            <div className="min-w-0 space-y-1">
              <div className="truncate font-medium text-sm">
                {previewProjectLabel}
              </div>
              <div className="text-muted-foreground text-xs">
                {previewEntries.length} {strings.entriesMetricLabel}
              </div>
            </div>
            <div className="flex min-w-[220px] items-center gap-2">
              <Select
                value={activePreviewCollection?.id ?? ''}
                onValueChange={(value) => {
                  setSelectedCollectionId(value);
                  setSelectedEntryId(
                    deliveryCollections.find(
                      (collection) => collection.id === value
                    )?.entries[0]?.id ?? ''
                  );
                }}
              >
                <SelectTrigger className="h-9">
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
          </section>

          {previewQuery.isPending ? (
            <PreviewModeSkeleton />
          ) : activePreviewCollection ? (
            <div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
              data-testid="epm-preview-gallery"
            >
              {previewGalleryEntries.map((entry) => {
                const visualAsset = getDeliveryEntryVisual(entry);
                const managedPreviewEntry =
                  entries.find((managed) => managed.id === entry.id) ?? null;
                const previewCopy =
                  entry.summary ||
                  extractMarkdown(entry)[0]?.markdown ||
                  strings.previewEmptyDescription;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="group overflow-hidden rounded-[1.2rem] border border-border/70 bg-card/95 text-left transition-colors hover:border-foreground/15 hover:bg-background"
                    onClick={() => openEntryEditor(entry.id)}
                  >
                    <div className="relative aspect-[5/6] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.12),transparent_28%),linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
                      <ResilientMediaImage
                        alt={visualAsset?.alt_text ?? entry.title}
                        assetUrl={visualAsset?.assetUrl}
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        fill
                        previewUrl={visualAsset?.assetUrl}
                        sizes="(max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 18vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/18 to-transparent" />
                      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
                        <Badge
                          className={cn(
                            'border-0 px-2 py-0.5 text-[11px] shadow-none',
                            statusTone(managedPreviewEntry?.status ?? 'draft')
                          )}
                        >
                          {formatStatus(
                            managedPreviewEntry?.status ?? 'draft',
                            strings
                          )}
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="line-clamp-1 font-medium text-sm">
                        {entry.title}
                      </div>
                      <div className="line-clamp-1 text-muted-foreground text-xs">
                        {entry.slug}
                      </div>
                      <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
                        {previewCopy}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[1.35rem] border border-border/70 border-dashed bg-card/95 p-5 text-muted-foreground text-sm">
              {strings.previewEmptyDescription}
            </div>
          )}
        </div>
      ) : studioQuery.isPending && !studio ? (
        <EditModeSkeleton />
      ) : (
        <div className="space-y-4">
          <section className="grid gap-3 rounded-[1.35rem] border border-border/70 bg-card/95 p-3 md:grid-cols-[160px_220px_minmax(0,1fr)_auto]">
            <Select
              value={editSection}
              onValueChange={(value) => setEditSection(value as EditSection)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={strings.contentTab} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entries">{strings.contentTab}</SelectItem>
                <SelectItem value="workflow">{strings.workflowTab}</SelectItem>
                <SelectItem value="settings">{strings.settingsTab}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={activeCollection?.id ?? ''}
              onValueChange={(value) => {
                setSelectedCollectionId(value);
                setSelectedEntryId(
                  entries.find((entry) => entry.collection_id === value)?.id ??
                    ''
                );
              }}
            >
              <SelectTrigger className="h-9">
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

            <Input
              className="h-9"
              placeholder={strings.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={strings.manageCollectionAction}
                >
                  <Ellipsis className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => createEntryMutation.mutate()}>
                  <Plus className="mr-2 h-4 w-4" />
                  {strings.createEntryAction}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateCollectionOpen(true)}>
                  <Layers2 className="mr-2 h-4 w-4" />
                  {strings.createCollectionAction}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditSection('workflow')}>
                  <Archive className="mr-2 h-4 w-4" />
                  {strings.workflowTab}
                </DropdownMenuItem>
                {activeCollection ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => openCollectionDetails(activeCollection.id)}
                    >
                      <Settings2 className="mr-2 h-4 w-4" />
                      {strings.editCollectionAction}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        setCollectionDeleteTarget(activeCollection.id)
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {strings.deleteCollectionAction}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </section>

          {editSection === 'entries' ? (
            <div
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
              data-testid="epm-edit-gallery"
            >
              <button
                type="button"
                className="flex aspect-[5/6] flex-col items-center justify-center rounded-[1.2rem] border border-border/70 border-dashed bg-card/95 p-4 text-center transition-colors hover:bg-background"
                onClick={() => createEntryMutation.mutate()}
              >
                <Plus className="mb-3 h-5 w-5" />
                <div className="font-medium text-sm">
                  {strings.createEntryAction}
                </div>
                <div className="mt-1 text-muted-foreground text-xs">
                  {activeCollection?.title ?? strings.emptyCollection}
                </div>
              </button>

              {visibleEntries.map((entry) => {
                const visual = getEntryVisual(assets, entry.id);

                return (
                  <article
                    key={entry.id}
                    className={cn(
                      'group overflow-hidden rounded-[1.2rem] border bg-card/95 transition-colors',
                      entry.id === selectedEntryId
                        ? 'border-foreground/15'
                        : 'border-border/70 hover:border-foreground/15'
                    )}
                  >
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => openEntryEditor(entry.id)}
                    >
                      <div className="relative aspect-[5/6] overflow-hidden bg-background/80">
                        <ResilientMediaImage
                          alt={visual?.alt_text ?? entry.title}
                          assetUrl={visual?.asset_url}
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          fill
                          previewUrl={visual?.preview_url}
                          sizes="(max-width: 1024px) 50vw, (max-width: 1536px) 25vw, 18vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/12 to-transparent" />
                        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
                          <Badge
                            className={cn(
                              'border-0 px-2 py-0.5 text-[11px] shadow-none',
                              statusTone(entry.status)
                            )}
                          >
                            {formatStatus(entry.status, strings)}
                          </Badge>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-7 w-7 rounded-full bg-background/80"
                                aria-label={`${entry.title} ${strings.manageCollectionAction}`}
                              >
                                <Ellipsis className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => openEntryEditor(entry.id)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                {strings.editEntryAction}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  duplicateEntryMutation.mutate(entry.id);
                                }}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                {strings.duplicateAction}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  publishEntryMutation.mutate({
                                    entryId: entry.id,
                                    eventKind:
                                      entry.status === 'published'
                                        ? 'unpublish'
                                        : 'publish',
                                  });
                                }}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                {entry.status === 'published'
                                  ? strings.unpublishAction
                                  : strings.publishAction}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setEntryDeleteTarget(entry.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {strings.deleteEntryAction}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="line-clamp-1 font-medium text-sm">
                          {entry.title}
                        </div>
                        <div className="line-clamp-1 text-muted-foreground text-xs">
                          {entry.slug}
                        </div>
                        <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
                          {entry.summary || strings.previewEmptyDescription}
                        </p>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}

          {editSection === 'workflow' ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {workflowLanes.map((lane) => (
                  <Card
                    key={lane.status}
                    className="border-border/70 bg-card/95 shadow-none"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-sm">{lane.title}</CardTitle>
                        <Badge className={statusTone(lane.status)}>
                          {lane.entries.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {lane.entries.length === 0 ? (
                        <div className="rounded-[1rem] border border-border/70 border-dashed p-3 text-muted-foreground text-xs">
                          {strings.emptyEntries}
                        </div>
                      ) : (
                        lane.entries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className="w-full rounded-[1rem] border border-border/70 bg-background/75 px-3 py-2 text-left transition-colors hover:bg-background"
                            onClick={() => openEntryEditor(entry.id)}
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
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={workflowFilter}
                      onValueChange={(value) =>
                        setWorkflowFilter(value as WorkflowFilter)
                      }
                    >
                      <SelectTrigger className="h-9 w-[180px]">
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
                    <Input
                      className="h-9 w-[220px]"
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
                      {strings.publishAction}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        selectedBulkIds.length === 0 || bulkMutation.isPending
                      }
                      onClick={() => bulkMutation.mutate({ action: 'archive' })}
                    >
                      {strings.archiveAction}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {workflowEntries.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-background/75 px-3 py-2"
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
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => openEntryEditor(entry.id)}
                        >
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
                        </button>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {editSection === 'settings' ? (
            <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
              <Card className="border-border/70 bg-card/95 shadow-none">
                <CardContent className="space-y-4 p-4">
                  <div>
                    <div className="font-medium text-sm">
                      {binding.canonical_project?.display_name ??
                        strings.unboundLabel}
                    </div>
                    <div className="mt-1 text-muted-foreground text-xs">
                      {binding.canonical_id ?? strings.noCanonicalIdLabel}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[1rem] border border-border/70 bg-background/75 p-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                        {strings.entriesMetricLabel}
                      </div>
                      <div className="mt-2 font-semibold text-xl">
                        {counts.entries}
                      </div>
                    </div>
                    <div className="rounded-[1rem] border border-border/70 bg-background/75 p-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                        {strings.collectionsMetricLabel}
                      </div>
                      <div className="mt-2 font-semibold text-xl">
                        {counts.collections}
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={importMutation.isPending}
                    onClick={() => importMutation.mutate()}
                  >
                    <FolderSync className="mr-2 h-4 w-4" />
                    {strings.importAction}
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-[1rem] border border-border/70 border-dashed bg-card/95 px-4 py-3 text-left transition-colors hover:bg-background"
                  onClick={() => setCreateCollectionOpen(true)}
                >
                  <div>
                    <div className="font-medium text-sm">
                      {strings.createCollectionAction}
                    </div>
                    <div className="mt-1 text-muted-foreground text-xs">
                      {strings.manageCollectionDescription}
                    </div>
                  </div>
                  <Plus className="h-4 w-4" />
                </button>

                {collections.map((collection) => {
                  const collectionEntries = entries.filter(
                    (entry) => entry.collection_id === collection.id
                  );

                  return (
                    <div
                      key={collection.id}
                      className="flex items-center justify-between gap-3 rounded-[1rem] border border-border/70 bg-card/95 px-4 py-3"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setSelectedCollectionId(collection.id);
                          setEditSection('entries');
                        }}
                      >
                        <div className="truncate font-medium text-sm">
                          {collection.title}
                        </div>
                        <div className="mt-1 truncate text-muted-foreground text-xs">
                          {collectionEntries.length}{' '}
                          {strings.entriesMetricLabel}
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={strings.openCollectionAction}
                          onClick={() => openCollectionDetails(collection.id)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={strings.deleteCollectionAction}
                          onClick={() =>
                            setCollectionDeleteTarget(collection.id)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {publishEvents.length > 0 ? (
                  <Card className="border-border/70 bg-card/95 shadow-none">
                    <CardContent className="space-y-2 p-4">
                      <div className="font-medium text-sm">
                        {strings.activityFeedTitle}
                      </div>
                      {publishEvents.slice(0, 4).map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center justify-between gap-3 rounded-[0.9rem] border border-border/70 bg-background/75 px-3 py-2"
                        >
                          <div className="text-sm">{event.event_kind}</div>
                          <div className="text-muted-foreground text-xs">
                            {formatDateLabel(
                              event.created_at,
                              strings.notScheduledLabel
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {editorEntry ? (
        <EntryDetailClient
          binding={binding}
          entryId={editorEntry.id}
          onDeleted={() => setEditorEntryId(null)}
          onEntryChange={(nextEntryId) => {
            setSelectedEntryId(nextEntryId);
            setEditorEntryId(nextEntryId);
          }}
          onOpenChange={(open) => {
            if (!open) {
              setEditorEntryId(null);
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
