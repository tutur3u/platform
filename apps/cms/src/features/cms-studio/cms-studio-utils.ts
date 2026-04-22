'use client';

import type {
  ExternalProjectDeliveryEntry,
  ExternalProjectEntry,
  ExternalProjectStudioAsset,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CmsStrings } from './cms-strings';

export type WorkflowFilter = 'all' | ExternalProjectEntry['status'];
export type CmsStudioMode = 'edit' | 'preview';
export type EditSection = 'entries' | 'settings' | 'workflow';

export function formatStatus(
  status: ExternalProjectEntry['status'],
  strings: CmsStrings
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

export function formatDateLabel(
  value: string | null | undefined,
  fallback: string
) {
  if (!value) {
    return fallback;
  }

  return new Date(value).toLocaleString();
}

export function getEntryVisual(
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

export function getDeliveryEntryVisual(
  entry: ExternalProjectDeliveryEntry | null
) {
  if (!entry) {
    return null;
  }

  return (
    entry.assets.find(
      (asset) => asset.asset_type === 'image' && asset.assetUrl
    ) ?? null
  );
}

export function extractMarkdown(entry: ExternalProjectDeliveryEntry | null) {
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

export function getProjectBrand(
  binding: WorkspaceExternalProjectBinding,
  profileData: Record<string, unknown> | null | undefined
) {
  const brand =
    typeof profileData?.brand === 'string' ? profileData.brand : null;

  return brand ?? binding.canonical_project?.display_name ?? 'CMS';
}

export function slugifyLabel(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return normalized || fallback;
}

export function useInfiniteVisibleCount({
  pageSize,
  resetKey,
  totalCount,
}: {
  pageSize: number;
  resetKey: string;
  totalCount: number;
}) {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(pageSize, totalCount)
  );
  const lastResetKeyRef = useRef(resetKey);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    lastResetKeyRef.current = resetKey;
    setVisibleCount(Math.min(pageSize, totalCount));
  }, [pageSize, resetKey, totalCount]);

  const loadMore = useCallback(() => {
    setVisibleCount((current) =>
      current >= totalCount ? current : Math.min(totalCount, current + pageSize)
    );
  }, [pageSize, totalCount]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || visibleCount >= totalCount) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      loadMore();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      {
        rootMargin: '320px 0px',
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [loadMore, totalCount, visibleCount]);

  return {
    hasMore: visibleCount < totalCount,
    loadMore,
    sentinelRef,
    visibleCount,
  };
}
