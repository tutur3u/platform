'use client';

import {
  CheckCircle2,
  Copy,
  Ellipsis,
  ListOrdered,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from '@tuturuuu/icons';
import type {
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import type { PublishMutationPayload } from './cms-library-section-shared';
import type { CmsStrings } from './cms-strings';
import {
  formatStatus,
  getEntryVisual,
  statusTone,
  useInfiniteVisibleCount,
} from './cms-studio-utils';
import { getEntryDescriptionMarkdown } from './entries/[entryId]/entry-detail-shared';
import { ResilientMediaImage } from './resilient-media-image';

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

function getEntryCategory(entry: ExternalProjectEntry) {
  const category = asProfileDataRecord(entry.profile_data).category;
  return typeof category === 'string' ? category.trim() : '';
}

function getEntryTags(entry: ExternalProjectEntry) {
  return [
    ...new Set(asStringArray(asProfileDataRecord(entry.profile_data).tags)),
  ];
}

export function CmsEntriesGallery({
  activeCollection,
  assets,
  createEntryHint,
  createEntryPending = false,
  entries,
  onCreateEntry,
  onDeleteEntry,
  onDuplicateEntry,
  onOpenEntry,
  onOpenQuickTaxonomy,
  onPublishEntry,
  quickTaxonomyPending,
  search,
  selectedEntryId,
  taxonomyAvailable,
  strings,
}: {
  activeCollection: ExternalProjectCollection | null;
  assets: ExternalProjectStudioAsset[];
  createEntryHint?: string;
  createEntryPending?: boolean;
  entries: ExternalProjectEntry[];
  onCreateEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onOpenQuickTaxonomy: (entryId: string) => void;
  onPublishEntry: (payload: PublishMutationPayload) => void;
  quickTaxonomyPending: boolean;
  search: string;
  selectedEntryId: string;
  taxonomyAvailable: boolean;
  strings: CmsStrings;
}) {
  const { hasMore, sentinelRef, visibleCount } = useInfiniteVisibleCount({
    pageSize: 15,
    resetKey: `${activeCollection?.id ?? ''}:${search}`,
    totalCount: entries.length,
  });
  const visibleEntries = entries.slice(0, visibleCount);

  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
      data-testid="cms-edit-gallery"
    >
      <button
        type="button"
        className="flex aspect-[5/6] h-full min-h-[19rem] flex-col items-center justify-center rounded-[1.2rem] border border-border/70 border-dashed bg-card/95 p-4 text-center transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
        disabled={createEntryPending}
        onClick={onCreateEntry}
      >
        <Plus className="mb-3 h-5 w-5" />
        <div className="font-medium text-sm">{strings.createEntryAction}</div>
        <div className="mt-1 text-muted-foreground text-xs">
          {createEntryHint ??
            activeCollection?.title ??
            strings.emptyCollection}
        </div>
      </button>

      {visibleEntries.map((entry) => {
        const visual = getEntryVisual(assets, entry.id);
        const hasVisual = Boolean(visual?.preview_url || visual?.asset_url);
        const category = getEntryCategory(entry);
        const tags = getEntryTags(entry);

        return (
          <article
            key={entry.id}
            className={cn(
              'group flex h-full flex-col overflow-hidden rounded-[1.2rem] border bg-card/95 transition-colors',
              entry.id === selectedEntryId
                ? 'border-foreground/15'
                : 'border-border/70 hover:border-foreground/15'
            )}
          >
            <div
              className={cn(
                'relative overflow-hidden bg-background/80',
                hasVisual
                  ? 'aspect-[5/6]'
                  : 'min-h-12 border-border/60 border-b bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.10),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.10),transparent_32%),linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3'
              )}
            >
              {hasVisual ? (
                <button
                  type="button"
                  className="absolute inset-0"
                  aria-label={entry.title}
                  onClick={() => onOpenEntry(entry.id)}
                >
                  <ResilientMediaImage
                    alt={visual?.alt_text ?? entry.title}
                    assetUrl={visual?.asset_url}
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    fill
                    previewUrl={visual?.preview_url}
                    sizes="(max-width: 1024px) 50vw, (max-width: 1536px) 25vw, 18vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/12 to-transparent" />
                </button>
              ) : null}
              <div
                className={cn(
                  'relative z-10 flex items-start justify-between gap-2',
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
                  <DropdownMenuTrigger asChild>
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
                    {taxonomyAvailable ? (
                      <DropdownMenuItem
                        disabled={quickTaxonomyPending}
                        onClick={() => onOpenQuickTaxonomy(entry.id)}
                      >
                        <Tags className="mr-2 h-4 w-4" />
                        {strings.quickTaxonomyAction}
                      </DropdownMenuItem>
                    ) : null}
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
              className={cn(
                'flex flex-1 flex-col justify-between gap-3 p-3',
                !hasVisual && 'min-h-[152px]'
              )}
            >
              <button
                type="button"
                className="flex flex-1 flex-col justify-end space-y-2 text-left"
                onClick={() => onOpenEntry(entry.id)}
              >
                <div className="line-clamp-1 font-medium text-sm">
                  {entry.title}
                </div>
                <div className="line-clamp-1 text-muted-foreground text-xs">
                  {entry.slug}
                </div>
                <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
                  {getEntryDescriptionMarkdown(
                    entry.summary,
                    strings.previewEmptyDescription
                  )}
                </p>
              </button>

              {taxonomyAvailable ? (
                <div className="space-y-3 border-border/60 border-t pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {category ? (
                      <Badge variant="outline" className="max-w-full truncate">
                        <ListOrdered className="mr-1 h-3 w-3" />
                        {category}
                      </Badge>
                    ) : null}
                    {tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary">
                        #{tag}
                      </Badge>
                    ))}
                    {tags.length > 2 ? (
                      <Badge variant="secondary">+{tags.length - 2}</Badge>
                    ) : null}
                    {!category && tags.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                        {strings.noneLabel}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={quickTaxonomyPending}
                    className="w-full justify-center"
                    onClick={() => onOpenQuickTaxonomy(entry.id)}
                  >
                    <Tags className="mr-2 h-3.5 w-3.5" />
                    {strings.quickTaxonomyAction}
                  </Button>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
      {hasMore ? (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          className="min-h-[19rem] rounded-[1.2rem] border border-border/70 border-dashed bg-card/60"
        />
      ) : null}
    </div>
  );
}
