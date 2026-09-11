'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { type RefObject, useEffect, useRef } from 'react';

/** Automatic pagination with a keyboard-accessible fallback and loading feedback. */
export function TaskListLoadMore({
  onLoadMore,
  isLoading,
  scrollRootRef,
}: {
  onLoadMore: () => void;
  isLoading: boolean;
  scrollRootRef?: RefObject<Element | null>;
}) {
  const t = useTranslations('common');
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || isLoading || typeof IntersectionObserver === 'undefined') return;
    let active = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (active && entry?.isIntersecting) {
          active = false;
          observer.disconnect();
          onLoadMore();
        }
      },
      { root: scrollRootRef?.current ?? null, rootMargin: '200px 0px' }
    );
    observer.observe(el);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [onLoadMore, isLoading, scrollRootRef]);

  return (
    <div
      ref={sentinelRef}
      className="flex justify-center py-2"
      aria-live="polite"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        disabled={isLoading}
        aria-busy={isLoading}
        onClick={onLoadMore}
      >
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {t(isLoading ? 'loading_more_tasks' : 'load_more')}
      </Button>
    </div>
  );
}
