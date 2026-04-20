'use client';

import type { JSONContent } from '@tiptap/react';
import type {
  ExternalProjectAsset,
  ExternalProjectBlock,
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import type { ComponentProps } from 'react';
import type { EpmStrings } from '../../epm-strings';

export type EntryFormState = {
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

const EMPTY_EDITOR_CONTENT: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
    },
  ],
};

export function parseEntryDescriptionContent(
  value: string | null | undefined
): JSONContent | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as JSONContent;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: value,
            },
          ],
        },
      ],
    };
  }

  return null;
}

export function serializeEntryDescriptionContent(
  content: JSONContent | null | undefined
) {
  if (!content) {
    return null;
  }

  const normalizedText = getDescriptionText(content).trim();
  if (!normalizedText) {
    return null;
  }

  const isPlainTextContent = (node: JSONContent | undefined): boolean => {
    if (!node) {
      return true;
    }

    if (node.marks && node.marks.length > 0) {
      return false;
    }

    switch (node.type) {
      case undefined:
      case 'doc':
      case 'paragraph':
        return (node.content ?? []).every((child) => isPlainTextContent(child));
      case 'text':
      case 'hardBreak':
        return true;
      default:
        return false;
    }
  };

  if (isPlainTextContent(content)) {
    return normalizedText;
  }

  return JSON.stringify(content);
}

export function getEntryDescriptionEditorContent(
  value: string | null | undefined
) {
  return parseEntryDescriptionContent(value) ?? EMPTY_EDITOR_CONTENT;
}

export function getEntryDescriptionMarkdown(
  value: string | null | undefined,
  fallback: string
) {
  const normalized = getDescriptionText(value ?? '').trim();
  return normalized || fallback;
}
