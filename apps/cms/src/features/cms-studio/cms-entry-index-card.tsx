'use client';

import { Image as ImageIcon, ListOrdered, Music, Tags } from '@tuturuuu/icons';
import type {
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { CmsEntryActionsMenu } from './cms-entry-actions-menu';
import type { PublishMutationPayload } from './cms-library-section-shared';
import type { CmsStrings } from './cms-strings';
import { formatStatus, statusTone } from './cms-studio-utils';
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

function getEntryDuration(entry: ExternalProjectEntry) {
  const duration = asProfileDataRecord(entry.profile_data).duration;
  return typeof duration === 'string' ? duration.trim() : '';
}

export function CmsEntryIndexCard({
  entry,
  onDeleteEntry,
  onDuplicateEntry,
  onOpenEntry,
  onOpenQuickTaxonomy,
  onPublishEntry,
  quickTaxonomyPending,
  selected,
  strings,
  taxonomyAvailable,
  visual,
}: {
  entry: ExternalProjectEntry;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onOpenQuickTaxonomy: (entryId: string) => void;
  onPublishEntry: (payload: PublishMutationPayload) => void;
  quickTaxonomyPending: boolean;
  selected: boolean;
  strings: CmsStrings;
  taxonomyAvailable: boolean;
  visual: ExternalProjectStudioAsset | undefined;
}) {
  const hasVisual = Boolean(visual?.preview_url || visual?.asset_url);
  const isAudio = visual?.asset_type === 'audio';
  const category = getEntryCategory(entry);
  const duration = getEntryDuration(entry);
  const tags = getEntryTags(entry);

  return (
    <article
      className={cn(
        'group grid gap-3 rounded-lg border bg-card/80 p-3 transition-colors md:grid-cols-[104px_minmax(0,1fr)_auto]',
        selected
          ? 'border-foreground/25 ring-1 ring-foreground/10'
          : 'border-border/70 hover:border-foreground/20 hover:bg-card'
      )}
    >
      <button
        type="button"
        className="relative h-28 overflow-hidden rounded-md border border-border/70 bg-background/80 md:h-full"
        aria-label={entry.title}
        onClick={() => onOpenEntry(entry.id)}
      >
        {hasVisual && !isAudio ? (
          <ResilientMediaImage
            alt={visual?.alt_text ?? entry.title}
            assetUrl={visual?.asset_url}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            fill
            previewUrl={visual?.preview_url}
            sizes="(max-width: 768px) 100vw, 104px"
          />
        ) : isAudio ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-dynamic-blue">
            <Music className="h-6 w-6" />
            <span className="text-muted-foreground text-xs">
              {duration || strings.audioAssetLabel}
            </span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </button>

      <button
        type="button"
        className="min-w-0 text-left"
        onClick={() => onOpenEntry(entry.id)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn('rounded-md border-0', statusTone(entry.status))}
          >
            {formatStatus(entry.status, strings)}
          </Badge>
          <span className="truncate text-muted-foreground text-xs">
            {strings.slugLabel}: {entry.slug}
          </span>
        </div>

        <h3 className="mt-2 line-clamp-1 font-semibold text-base">
          {entry.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-sm leading-6">
          {getEntryDescriptionMarkdown(
            entry.summary,
            strings.previewEmptyDescription
          )}
        </p>

        {taxonomyAvailable ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {category ? (
              <Badge
                variant="outline"
                className="max-w-full truncate rounded-md"
              >
                <ListOrdered className="mr-1 h-3 w-3" />
                {category}
              </Badge>
            ) : null}
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="rounded-md">
                #{tag}
              </Badge>
            ))}
            {tags.length > 3 ? (
              <Badge variant="secondary" className="rounded-md">
                +{tags.length - 3}
              </Badge>
            ) : null}
            {!category && tags.length === 0 ? (
              <span className="text-muted-foreground text-xs">
                {strings.noneLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </button>

      <div className="flex items-center justify-between gap-2 md:flex-col md:items-end">
        {taxonomyAvailable ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={quickTaxonomyPending}
            className="h-8 rounded-md"
            onClick={() => onOpenQuickTaxonomy(entry.id)}
          >
            <Tags className="mr-2 h-3.5 w-3.5" />
            {strings.quickTaxonomyAction}
          </Button>
        ) : (
          <span />
        )}

        <CmsEntryActionsMenu
          entry={entry}
          onDeleteEntry={onDeleteEntry}
          onDuplicateEntry={onDuplicateEntry}
          onOpenEntry={onOpenEntry}
          onPublishEntry={onPublishEntry}
          strings={strings}
        />
      </div>
    </article>
  );
}
