'use client';

import { FolderSync, Plus, Settings2, Trash2 } from '@tuturuuu/icons';
import type {
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectPublishEvent,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import type { CmsLibraryCounts } from './cms-library-section-shared';
import type { CmsStrings } from './cms-strings';
import { formatDateLabel, useInfiniteVisibleCount } from './cms-studio-utils';

export function CmsSettingsSection({
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
  counts: CmsLibraryCounts;
  entries: ExternalProjectEntry[];
  importPending: boolean;
  onCreateCollection: () => void;
  onDeleteCollection: (collectionId: string) => void;
  onImport: () => void;
  onOpenCollection: (collectionId: string) => void;
  onSelectCollection: (collectionId: string) => void;
  onShowEntries: () => void;
  publishEvents: ExternalProjectPublishEvent[];
  strings: CmsStrings;
}) {
  const { hasMore, sentinelRef, visibleCount } = useInfiniteVisibleCount({
    pageSize: 10,
    resetKey: `${collections.length}:${entries.length}`,
    totalCount: collections.length,
  });
  const visibleCollections = collections.slice(0, visibleCount);

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

        {visibleCollections.map((collection) => {
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
        {hasMore ? (
          <div
            ref={sentinelRef}
            aria-hidden="true"
            className="h-16 rounded-[1rem] border border-border/70 border-dashed bg-card/60"
          />
        ) : null}

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
