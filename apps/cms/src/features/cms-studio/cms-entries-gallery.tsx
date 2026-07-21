'use client';

import { Loader2, Plus, SearchX } from '@tuturuuu/icons';
import type {
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { useMemo } from 'react';
import { CmsEntryIndexCard } from './cms-entry-index-card';
import type { PublishMutationPayload } from './cms-library-section-shared';
import type { CmsStrings } from './cms-strings';
import { useInfiniteVisibleCount } from './cms-studio-utils';

export function CmsEntriesGallery({
  activeCollection,
  assets,
  createEntryHint,
  createEntryPending = false,
  entries,
  filterKey,
  filtersActive,
  onClearFilters,
  onCreateEntry,
  onDeleteEntry,
  onDuplicateEntry,
  onOpenEntry,
  onOpenQuickTaxonomy,
  onPublishEntry,
  quickTaxonomyPending,
  selectedEntryId,
  taxonomyAvailable,
  strings,
}: {
  activeCollection: ExternalProjectCollection | null;
  assets: ExternalProjectStudioAsset[];
  createEntryHint?: string;
  createEntryPending?: boolean;
  entries: ExternalProjectEntry[];
  filterKey: string;
  filtersActive: boolean;
  onClearFilters: () => void;
  onCreateEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onOpenQuickTaxonomy: (entryId: string) => void;
  onPublishEntry: (payload: PublishMutationPayload) => void;
  quickTaxonomyPending: boolean;
  selectedEntryId: string;
  taxonomyAvailable: boolean;
  strings: CmsStrings;
}) {
  const { hasMore, sentinelRef, visibleCount } = useInfiniteVisibleCount({
    pageSize: 18,
    resetKey: `${activeCollection?.id ?? ''}:${filterKey}`,
    totalCount: entries.length,
  });
  const visibleEntries = entries.slice(0, visibleCount);
  const visualByEntryId = useMemo(() => {
    const index = new Map<string, ExternalProjectStudioAsset>();
    for (const asset of assets) {
      if (asset.entry_id && !index.has(asset.entry_id)) {
        index.set(asset.entry_id, asset);
      }
    }
    return index;
  }, [assets]);

  return (
    <div className="space-y-3" data-testid="cms-edit-gallery">
      {entries.length === 0 && filtersActive ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-border/70 border-dashed bg-card/70 p-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
            <SearchX className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-semibold">{strings.filteredEmptyTitle}</h3>
          <p className="mt-1 max-w-md text-muted-foreground text-sm leading-6">
            {strings.filteredEmptyDescription}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={onClearFilters}
          >
            {strings.clearFiltersAction}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <button
          type="button"
          className="grid min-h-28 w-full gap-3 rounded-lg border border-border/70 border-dashed bg-card/70 p-4 text-left transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60 md:grid-cols-[104px_minmax(0,1fr)]"
          disabled={createEntryPending}
          onClick={onCreateEntry}
        >
          <span className="flex h-20 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground">
            <Plus className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-col justify-center">
            <span className="font-semibold">{strings.createEntryAction}</span>
            <span className="mt-1 text-muted-foreground text-sm leading-6">
              {createEntryHint ??
                activeCollection?.title ??
                strings.emptyCollection}
            </span>
          </span>
        </button>
      ) : null}

      {visibleEntries.map((entry) => (
        <CmsEntryIndexCard
          key={entry.id}
          entry={entry}
          onDeleteEntry={onDeleteEntry}
          onDuplicateEntry={onDuplicateEntry}
          onOpenEntry={onOpenEntry}
          onOpenQuickTaxonomy={onOpenQuickTaxonomy}
          onPublishEntry={onPublishEntry}
          quickTaxonomyPending={quickTaxonomyPending}
          selected={entry.id === selectedEntryId}
          strings={strings}
          taxonomyAvailable={taxonomyAvailable}
          visual={visualByEntryId.get(entry.id)}
        />
      ))}

      {hasMore ? (
        <div
          ref={sentinelRef}
          role="status"
          className="flex h-20 items-center justify-center gap-2 rounded-lg border border-border/70 border-dashed bg-card/50 text-muted-foreground text-sm"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {strings.loadingMoreLabel}
        </div>
      ) : null}
    </div>
  );
}
