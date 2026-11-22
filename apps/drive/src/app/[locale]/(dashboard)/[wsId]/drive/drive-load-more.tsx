'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Loads the next page when the sentinel scrolls into view, with a button for
 * keyboard users and browsers without IntersectionObserver.
 */
export function DriveLoadMore({
  isLoading,
  loaded,
  onLoadMore,
  total,
}: {
  isLoading: boolean;
  loaded: number;
  onLoadMore: () => void;
  total: number;
}) {
  const t = useTranslations('drive');
  const sentinel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) onLoadMore();
        },
        { rootMargin: '400px' }
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [onLoadMore]
  );

  return (
    <div className="flex flex-col items-center gap-2 py-4" ref={sentinel}>
      <span className="text-muted-foreground text-xs">
        {t('paging.loaded', { loaded, total })}
      </span>
      <Button
        disabled={isLoading}
        onClick={onLoadMore}
        size="sm"
        type="button"
        variant="outline"
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
        {isLoading ? t('paging.loading') : t('paging.load_more')}
      </Button>
    </div>
  );
}
