'use client';

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
  Settings2,
  Trash2,
} from '@tuturuuu/icons';
import type {
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectPublishEvent,
  ExternalProjectStudioAsset,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { EditModeSkeleton } from './epm-client-skeletons';
import type { EditSection, WorkflowFilter } from './epm-client-utils';
import {
  formatDateLabel,
  formatStatus,
  getEntryVisual,
  statusTone,
} from './epm-client-utils';
import type { EpmStrings } from './epm-strings';
import { ResilientMediaImage } from './resilient-media-image';

type WorkflowLane = {
  entries: ExternalProjectEntry[];
  status: ExternalProjectEntry['status'];
  title: string;
};

type PublishMutationPayload = {
  entryId?: string;
  eventKind: 'publish' | 'unpublish';
};

export function EpmEditSection({
  activeCollection,
  assets,
  binding,
  collections,
  counts,
  editSection,
  entries,
  importPending,
  onChangeEditSection,
  onCreateCollection,
  onCreateEntry,
  onDeleteCollection,
  onDeleteEntry,
  onDuplicateEntry,
  onImport,
  onOpenCollection,
  onOpenEntry,
  onPublishEntry,
  onSearchChange,
  onSelectBulkEntry,
  onSelectCollection,
  onSetWorkflowFilter,
  onSetWorkflowScheduleValue,
  onWorkflowAction,
  publishEvents,
  queryPending,
  scheduleValue,
  search,
  selectedBulkIds,
  selectedEntryId,
  strings,
  workflowEntries,
  workflowFilter,
  workflowLanes,
}: {
  activeCollection: ExternalProjectCollection | null;
  assets: ExternalProjectStudioAsset[];
  binding: WorkspaceExternalProjectBinding;
  collections: ExternalProjectCollection[];
  counts: {
    archived: number;
    collections: number;
    drafts: number;
    entries: number;
    published: number;
    scheduled: number;
  };
  editSection: EditSection;
  entries: ExternalProjectEntry[];
  importPending: boolean;
  onChangeEditSection: (section: EditSection) => void;
  onCreateCollection: () => void;
  onCreateEntry: () => void;
  onDeleteCollection: (collectionId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onImport: () => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onPublishEntry: (payload: PublishMutationPayload) => void;
  onSearchChange: (value: string) => void;
  onSelectBulkEntry: (entryId: string, checked: boolean) => void;
  onSelectCollection: (collectionId: string) => void;
  onSetWorkflowFilter: (filter: WorkflowFilter) => void;
  onSetWorkflowScheduleValue: (value: string) => void;
  onWorkflowAction: (payload: {
    action:
      | 'archive'
      | 'publish'
      | 'restore-draft'
      | 'schedule'
      | 'set-status'
      | 'unpublish';
    scheduledFor?: string | null;
    status?: ExternalProjectEntry['status'];
  }) => void;
  publishEvents: ExternalProjectPublishEvent[];
  queryPending: boolean;
  scheduleValue: string;
  search: string;
  selectedBulkIds: string[];
  selectedEntryId: string;
  strings: EpmStrings;
  workflowEntries: ExternalProjectEntry[];
  workflowFilter: WorkflowFilter;
  workflowLanes: WorkflowLane[];
}) {
  if (queryPending) {
    return <EditModeSkeleton />;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-[1.35rem] border border-border/70 bg-card/95 p-3 md:grid-cols-[160px_220px_minmax(0,1fr)_auto]">
        <Select
          value={editSection}
          onValueChange={(value) => onChangeEditSection(value as EditSection)}
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
          onValueChange={onSelectCollection}
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
          onChange={(event) => onSearchChange(event.target.value)}
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
            <DropdownMenuItem onClick={onCreateEntry}>
              <Plus className="mr-2 h-4 w-4" />
              {strings.createEntryAction}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateCollection}>
              <Layers2 className="mr-2 h-4 w-4" />
              {strings.createCollectionAction}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChangeEditSection('workflow')}>
              <Archive className="mr-2 h-4 w-4" />
              {strings.workflowTab}
            </DropdownMenuItem>
            {activeCollection ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onOpenCollection(activeCollection.id)}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {strings.editCollectionAction}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDeleteCollection(activeCollection.id)}
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
        <EpmEntriesGallery
          activeCollection={activeCollection}
          assets={assets}
          entries={entries}
          onCreateEntry={onCreateEntry}
          onDeleteEntry={onDeleteEntry}
          onDuplicateEntry={onDuplicateEntry}
          onOpenEntry={onOpenEntry}
          onPublishEntry={onPublishEntry}
          selectedEntryId={selectedEntryId}
          strings={strings}
        />
      ) : null}

      {editSection === 'workflow' ? (
        <EpmWorkflowSection
          onOpenEntry={onOpenEntry}
          onSelectBulkEntry={onSelectBulkEntry}
          onSetWorkflowFilter={onSetWorkflowFilter}
          onSetWorkflowScheduleValue={onSetWorkflowScheduleValue}
          onWorkflowAction={onWorkflowAction}
          scheduleValue={scheduleValue}
          selectedBulkIds={selectedBulkIds}
          strings={strings}
          workflowEntries={workflowEntries}
          workflowFilter={workflowFilter}
          workflowLanes={workflowLanes}
        />
      ) : null}

      {editSection === 'settings' ? (
        <EpmSettingsSection
          binding={binding}
          collections={collections}
          counts={counts}
          entries={entries}
          importPending={importPending}
          onCreateCollection={onCreateCollection}
          onDeleteCollection={onDeleteCollection}
          onImport={onImport}
          onOpenCollection={onOpenCollection}
          onSelectCollection={onSelectCollection}
          onShowEntries={() => onChangeEditSection('entries')}
          publishEvents={publishEvents}
          strings={strings}
        />
      ) : null}
    </div>
  );
}

function EpmEntriesGallery({
  activeCollection,
  assets,
  entries,
  onCreateEntry,
  onDeleteEntry,
  onDuplicateEntry,
  onOpenEntry,
  onPublishEntry,
  selectedEntryId,
  strings,
}: {
  activeCollection: ExternalProjectCollection | null;
  assets: ExternalProjectStudioAsset[];
  entries: ExternalProjectEntry[];
  onCreateEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onPublishEntry: (payload: PublishMutationPayload) => void;
  selectedEntryId: string;
  strings: EpmStrings;
}) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
      data-testid="epm-edit-gallery"
    >
      <button
        type="button"
        className="flex aspect-[5/6] flex-col items-center justify-center rounded-[1.2rem] border border-border/70 border-dashed bg-card/95 p-4 text-center transition-colors hover:bg-background"
        onClick={onCreateEntry}
      >
        <Plus className="mb-3 h-5 w-5" />
        <div className="font-medium text-sm">{strings.createEntryAction}</div>
        <div className="mt-1 text-muted-foreground text-xs">
          {activeCollection?.title ?? strings.emptyCollection}
        </div>
      </button>

      {entries.map((entry) => {
        const visual = getEntryVisual(assets, entry.id);
        const hasVisual = Boolean(visual?.preview_url || visual?.asset_url);

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
              onClick={() => onOpenEntry(entry.id)}
            >
              <div
                className={cn(
                  'relative overflow-hidden bg-background/80',
                  hasVisual
                    ? 'aspect-[5/6]'
                    : 'border-border/60 border-b bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.10),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.10),transparent_32%),linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3'
                )}
              >
                {hasVisual ? (
                  <>
                    <ResilientMediaImage
                      alt={visual?.alt_text ?? entry.title}
                      assetUrl={visual?.asset_url}
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      fill
                      previewUrl={visual?.preview_url}
                      sizes="(max-width: 1024px) 50vw, (max-width: 1536px) 25vw, 18vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/12 to-transparent" />
                  </>
                ) : null}
                <div
                  className={cn(
                    'flex items-center justify-between gap-2',
                    hasVisual ? 'absolute inset-x-0 top-0 p-3' : ''
                  )}
                >
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
                      <DropdownMenuItem onClick={() => onOpenEntry(entry.id)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {strings.editEntryAction}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDuplicateEntry(entry.id)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {strings.duplicateAction}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          onPublishEntry({
                            entryId: entry.id,
                            eventKind:
                              entry.status === 'published'
                                ? 'unpublish'
                                : 'publish',
                          })
                        }
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {entry.status === 'published'
                          ? strings.unpublishAction
                          : strings.publishAction}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDeleteEntry(entry.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {strings.deleteEntryAction}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div
                className={cn('space-y-2 p-3', !hasVisual && 'min-h-[152px]')}
              >
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
  );
}

function EpmWorkflowSection({
  onOpenEntry,
  onSelectBulkEntry,
  onSetWorkflowFilter,
  onSetWorkflowScheduleValue,
  onWorkflowAction,
  scheduleValue,
  selectedBulkIds,
  strings,
  workflowEntries,
  workflowFilter,
  workflowLanes,
}: {
  onOpenEntry: (entryId: string) => void;
  onSelectBulkEntry: (entryId: string, checked: boolean) => void;
  onSetWorkflowFilter: (filter: WorkflowFilter) => void;
  onSetWorkflowScheduleValue: (value: string) => void;
  onWorkflowAction: (payload: {
    action:
      | 'archive'
      | 'publish'
      | 'restore-draft'
      | 'schedule'
      | 'set-status'
      | 'unpublish';
    scheduledFor?: string | null;
    status?: ExternalProjectEntry['status'];
  }) => void;
  scheduleValue: string;
  selectedBulkIds: string[];
  strings: EpmStrings;
  workflowEntries: ExternalProjectEntry[];
  workflowFilter: WorkflowFilter;
  workflowLanes: WorkflowLane[];
}) {
  return (
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
                    onClick={() => onOpenEntry(entry.id)}
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
                onSetWorkflowFilter(value as WorkflowFilter)
              }
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder={strings.filterAll} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{strings.filterAll}</SelectItem>
                <SelectItem value="draft">{strings.draftQueue}</SelectItem>
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
              onChange={(event) =>
                onSetWorkflowScheduleValue(event.target.value)
              }
            />
            <Button
              size="sm"
              disabled={selectedBulkIds.length === 0}
              onClick={() =>
                onWorkflowAction({
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
              disabled={selectedBulkIds.length === 0}
              onClick={() => onWorkflowAction({ action: 'publish' })}
            >
              {strings.publishAction}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedBulkIds.length === 0}
              onClick={() => onWorkflowAction({ action: 'archive' })}
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
                    onSelectBulkEntry(entry.id, Boolean(checked))
                  }
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpenEntry(entry.id)}
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
  );
}

function EpmSettingsSection({
  binding,
  collections,
  counts,
  entries,
  importPending,
  onCreateCollection,
  onDeleteCollection,
  onImport,
  onOpenCollection,
  onSelectCollection,
  onShowEntries,
  publishEvents,
  strings,
}: {
  binding: WorkspaceExternalProjectBinding;
  collections: ExternalProjectCollection[];
  counts: {
    archived: number;
    collections: number;
    drafts: number;
    entries: number;
    published: number;
    scheduled: number;
  };
  entries: ExternalProjectEntry[];
  importPending: boolean;
  onCreateCollection: () => void;
  onDeleteCollection: (collectionId: string) => void;
  onImport: () => void;
  onOpenCollection: (collectionId: string) => void;
  onSelectCollection: (collectionId: string) => void;
  onShowEntries: () => void;
  publishEvents: ExternalProjectPublishEvent[];
  strings: EpmStrings;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="font-medium text-sm">
              {binding.canonical_project?.display_name ?? strings.unboundLabel}
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
              <div className="mt-2 font-semibold text-xl">{counts.entries}</div>
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
            disabled={importPending}
            onClick={onImport}
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
          onClick={onCreateCollection}
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
                  onSelectCollection(collection.id);
                  onShowEntries();
                }}
              >
                <div className="truncate font-medium text-sm">
                  {collection.title}
                </div>
                <div className="mt-1 truncate text-muted-foreground text-xs">
                  {collectionEntries.length} {strings.entriesMetricLabel}
                </div>
              </button>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={strings.openCollectionAction}
                  onClick={() => onOpenCollection(collection.id)}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={strings.deleteCollectionAction}
                  onClick={() => onDeleteCollection(collection.id)}
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
  );
}
