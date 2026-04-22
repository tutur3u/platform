'use client';

import type {
  ExternalProjectDeliveryCollection,
  ExternalProjectEntry,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { CmsFeaturedCarousel } from './cms-featured-carousel';
import type { CmsStrings } from './cms-strings';
import { PreviewModeSkeleton } from './cms-studio-skeletons';
import {
  extractMarkdown,
  formatStatus,
  getDeliveryEntryVisual,
  statusTone,
  useInfiniteVisibleCount,
} from './cms-studio-utils';
import { getEntryDescriptionMarkdown } from './entries/[entryId]/entry-detail-shared';
import { ResilientMediaImage } from './resilient-media-image';

function asProfileDataRecord(value: unknown) {
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

export function CmsPreviewSection({
  activePreviewCollection,
  deliveryCollections,
  entries,
  onOpenEntry,
  onSelectCollection,
  previewEntries,
  previewProjectLabel,
  previewQueryPending,
  strings,
}: {
  activePreviewCollection: ExternalProjectDeliveryCollection | null;
  deliveryCollections: ExternalProjectDeliveryCollection[];
  entries: ExternalProjectEntry[];
  onOpenEntry: (entryId: string) => void;
  onSelectCollection: (collectionId: string) => void;
  previewEntries: ExternalProjectDeliveryCollection['entries'];
  previewProjectLabel: string;
  previewQueryPending: boolean;
  strings: CmsStrings;
}) {
  const previewEntryCount = activePreviewCollection?.entries.length ?? 0;
  const { hasMore, sentinelRef, visibleCount } = useInfiniteVisibleCount({
    pageSize: 18,
    resetKey: activePreviewCollection?.id ?? '',
    totalCount: previewEntryCount,
  });
  const visiblePreviewEntries = previewEntries.slice(0, visibleCount);
  const featuredPreviewEntries = (() => {
    if (!activePreviewCollection) {
      return [];
    }

    const collectionSlug = [
      activePreviewCollection.slug,
      activePreviewCollection.title,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const sectionEntry =
      collectionSlug.includes('artwork') || collectionSlug.includes('archive')
        ? entries.find((entry) => entry.slug === 'gallery')
        : collectionSlug.includes('lore') || collectionSlug.includes('writing')
          ? entries.find((entry) => entry.slug === 'writing')
          : null;

    if (!sectionEntry) {
      return [];
    }

    const profileData = asProfileDataRecord(sectionEntry.profile_data);
    const configuredSlugs =
      sectionEntry.slug === 'gallery'
        ? [
            ...asStringArray(profileData.featuredArtworkSlugs),
            ...asStringArray(profileData.carouselArtworkSlugs),
            ...asStringArray(profileData.featuredSlugs),
          ]
        : [
            ...asStringArray(profileData.featuredEntrySlugs),
            ...asStringArray(profileData.featuredLoreSlugs),
            ...asStringArray(profileData.carouselEntrySlugs),
            ...asStringArray(profileData.carouselLoreSlugs),
            ...asStringArray(profileData.featuredSlugs),
          ];

    if (configuredSlugs.length === 0) {
      return [];
    }

    return configuredSlugs
      .map(
        (slug) => previewEntries.find((entry) => entry.slug === slug) ?? null
      )
      .filter(
        (
          entry
        ): entry is ExternalProjectDeliveryCollection['entries'][number] =>
          Boolean(entry)
      );
  })();

  return (
    <div className="space-y-4">
      {featuredPreviewEntries.length > 0 ? (
        <CmsFeaturedCarousel
          entries={featuredPreviewEntries}
          managedEntries={entries}
          onOpenEntry={onOpenEntry}
          strings={strings}
        />
      ) : null}

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
            onValueChange={onSelectCollection}
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

      {previewQueryPending ? (
        <PreviewModeSkeleton />
      ) : activePreviewCollection ? (
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
          data-testid="cms-preview-gallery"
        >
          {visiblePreviewEntries.map((entry) => {
            const visualAsset = getDeliveryEntryVisual(entry);
            const hasVisual = Boolean(visualAsset?.assetUrl);
            const managedPreviewEntry =
              entries.find((managed) => managed.id === entry.id) ?? null;
            const previewCopy =
              getEntryDescriptionMarkdown(entry.summary, '') ||
              extractMarkdown(entry)[0]?.markdown ||
              strings.previewEmptyDescription;

            return (
              <button
                key={entry.id}
                type="button"
                className="group flex h-full flex-col overflow-hidden rounded-[1.2rem] border border-border/70 bg-card/95 text-left transition-colors hover:border-foreground/15 hover:bg-background"
                onClick={() => onOpenEntry(entry.id)}
              >
                {hasVisual ? (
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
                ) : (
                  <div className="min-h-12 border-border/60 border-b bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.10),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.10),transparent_32%),linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3">
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
                )}
                <div
                  className={cn(
                    'flex flex-1 flex-col justify-end space-y-2 p-3',
                    !hasVisual && 'min-h-[152px]'
                  )}
                >
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
          {hasMore ? (
            <div
              ref={sentinelRef}
              aria-hidden="true"
              className="min-h-24 rounded-[1.2rem] border border-border/70 border-dashed bg-card/60"
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-[1.35rem] border border-border/70 border-dashed bg-card/95 p-5 text-muted-foreground text-sm">
          {strings.previewEmptyDescription}
        </div>
      )}
    </div>
  );
}
