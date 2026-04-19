'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ellipsis,
  FolderSync,
  Layers2,
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
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectStudioData,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';
import { useExternalProjectLivePreview } from '../external-projects/use-external-project-live-preview';
import { EntryDetailClient } from './entries/[entryId]/entry-detail-client';
import {
  type EditSection,
  type EpmMode,
  getProjectBrand,
  slugifyLabel,
  type WorkflowFilter,
} from './epm-client-utils';
import {
  EpmCreateCollectionDialog,
  EpmDeleteCollectionDialog,
  EpmDeleteEntryDialog,
} from './epm-dialogs';
import { EpmEditSection } from './epm-edit-section';
import { EpmPreviewSection } from './epm-preview-section';
import type { EpmStrings } from './epm-strings';
import { getEpmStudioQueryKey, useEpmStudio } from './use-epm-studio';

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
  const collectionDeleteCandidate: ExternalProjectCollection | null =
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

      <EpmCreateCollectionDialog
        createLabel={strings.createCollectionAction}
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

      <EpmDeleteEntryDialog
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

      <EpmDeleteCollectionDialog
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
        <EpmPreviewSection
          activePreviewCollection={activePreviewCollection}
          deliveryCollections={deliveryCollections}
          entries={entries}
          onOpenEntry={openEntryEditor}
          onSelectCollection={(value) => {
            setSelectedCollectionId(value);
            setSelectedEntryId(
              deliveryCollections.find((collection) => collection.id === value)
                ?.entries[0]?.id ?? ''
            );
          }}
          previewGalleryEntries={previewGalleryEntries}
          previewProjectLabel={previewProjectLabel}
          previewQueryPending={previewQuery.isPending}
          strings={strings}
        />
      ) : studioQuery.isPending && !studio ? (
        <EpmEditSection
          activeCollection={activeCollection}
          assets={assets}
          binding={binding}
          collections={collections}
          counts={counts}
          editSection={editSection}
          entries={visibleEntries}
          importPending={importMutation.isPending}
          onChangeEditSection={setEditSection}
          onCreateCollection={() => setCreateCollectionOpen(true)}
          onCreateEntry={() => createEntryMutation.mutate()}
          onDeleteCollection={setCollectionDeleteTarget}
          onDeleteEntry={setEntryDeleteTarget}
          onDuplicateEntry={(entryId) => duplicateEntryMutation.mutate(entryId)}
          onImport={() => importMutation.mutate()}
          onOpenCollection={openCollectionDetails}
          onOpenEntry={openEntryEditor}
          onPublishEntry={(payload) => publishEntryMutation.mutate(payload)}
          onSearchChange={setSearch}
          onSelectBulkEntry={(entryId, checked) =>
            setSelectedBulkIds((current) =>
              checked
                ? [...current, entryId]
                : current.filter((value) => value !== entryId)
            )
          }
          onSelectCollection={(value) => {
            setSelectedCollectionId(value);
            setSelectedEntryId(
              entries.find((entry) => entry.collection_id === value)?.id ?? ''
            );
          }}
          onSetWorkflowFilter={setWorkflowFilter}
          onSetWorkflowScheduleValue={setScheduleValue}
          onWorkflowAction={(payload) => bulkMutation.mutate(payload)}
          publishEvents={publishEvents}
          queryPending
          scheduleValue={scheduleValue}
          search={search}
          selectedBulkIds={selectedBulkIds}
          selectedEntryId={selectedEntryId}
          strings={strings}
          workflowEntries={workflowEntries}
          workflowFilter={workflowFilter}
          workflowLanes={workflowLanes}
        />
      ) : (
        <EpmEditSection
          activeCollection={activeCollection}
          assets={assets}
          binding={binding}
          collections={collections}
          counts={counts}
          editSection={editSection}
          entries={visibleEntries}
          importPending={importMutation.isPending}
          onChangeEditSection={setEditSection}
          onCreateCollection={() => setCreateCollectionOpen(true)}
          onCreateEntry={() => createEntryMutation.mutate()}
          onDeleteCollection={setCollectionDeleteTarget}
          onDeleteEntry={setEntryDeleteTarget}
          onDuplicateEntry={(entryId) => duplicateEntryMutation.mutate(entryId)}
          onImport={() => importMutation.mutate()}
          onOpenCollection={openCollectionDetails}
          onOpenEntry={openEntryEditor}
          onPublishEntry={(payload) => publishEntryMutation.mutate(payload)}
          onSearchChange={setSearch}
          onSelectBulkEntry={(entryId, checked) =>
            setSelectedBulkIds((current) =>
              checked
                ? [...current, entryId]
                : current.filter((value) => value !== entryId)
            )
          }
          onSelectCollection={(value) => {
            setSelectedCollectionId(value);
            setSelectedEntryId(
              entries.find((entry) => entry.collection_id === value)?.id ?? ''
            );
          }}
          onSetWorkflowFilter={setWorkflowFilter}
          onSetWorkflowScheduleValue={setScheduleValue}
          onWorkflowAction={(payload) => bulkMutation.mutate(payload)}
          publishEvents={publishEvents}
          queryPending={false}
          scheduleValue={scheduleValue}
          search={search}
          selectedBulkIds={selectedBulkIds}
          selectedEntryId={selectedEntryId}
          strings={strings}
          workflowEntries={workflowEntries}
          workflowFilter={workflowFilter}
          workflowLanes={workflowLanes}
        />
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
