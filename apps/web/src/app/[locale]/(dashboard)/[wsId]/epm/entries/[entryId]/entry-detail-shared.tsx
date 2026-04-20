'use client';

import type {
  ExternalProjectAsset,
  ExternalProjectBlock,
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import type { ComponentProps } from 'react';
import type { EpmStrings } from '../../epm-strings';

export type EntryFormState = {
  description: string;
  scheduledFor: string;
  slug: string;
  status: ExternalProjectEntry['status'];
  subtitle: string;
  title: string;
};

export function buildEntryFormState(
  entry: ExternalProjectEntry
): EntryFormState {
  return {
    description: entry.summary ?? '',
    scheduledFor: toDateTimeLocalValue(entry.scheduled_for),
    slug: entry.slug,
    status: entry.status,
    subtitle: entry.subtitle ?? '',
    title: entry.title,
  };
}

export function getMarkdownBlockContent(
  block: ExternalProjectBlock | null | undefined
) {
  if (!block?.content || typeof block.content !== 'object') {
    return '';
  }

  const markdown = (block.content as Record<string, unknown>).markdown;
  return typeof markdown === 'string' ? markdown : '';
}

export function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function fromDateTimeLocalValue(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function formatStatus(
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

export function statusTone(status: ExternalProjectEntry['status']) {
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

export function ActionButton({
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

export function formatDateLabel(
  value: string | null | undefined,
  strings: EpmStrings
) {
  if (!value) {
    return strings.notScheduledLabel;
  }

  return new Date(value).toLocaleString();
}

export function sortImageAssets(
  assets: ExternalProjectStudioAsset[],
  entryId: string
) {
  return assets
    .filter(
      (asset) => asset.entry_id === entryId && asset.asset_type === 'image'
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function toStudioAsset(
  asset: ExternalProjectAsset,
  previous?: ExternalProjectStudioAsset | null
): ExternalProjectStudioAsset {
  return {
    ...asset,
    asset_url: previous?.asset_url ?? null,
    preview_url: previous?.preview_url ?? null,
  };
}
