'use client';

import { ChevronDown, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCallback, useRef } from 'react';

export function InfiniteLoadTrigger({
  endLabel,
  errorLabel,
  hasError = false,
  hasNextPage,
  isFetchingNextPage,
  loadedLabel,
  loadingLabel,
  loadMoreLabel,
  onLoadMore,
  retryLabel,
}: {
  endLabel: string;
  errorLabel?: string;
  hasError?: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadedLabel: string;
  loadingLabel: string;
  loadMoreLabel: string;
  onLoadMore: () => void;
  retryLabel?: string;
}) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const requestedRef = useRef(false);
  const triggerRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      requestedRef.current = false;

      if (
        !node ||
        hasError ||
        !hasNextPage ||
        isFetchingNextPage ||
        typeof IntersectionObserver === 'undefined'
      ) {
        return;
      }

      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting && !requestedRef.current) {
            requestedRef.current = true;
            onLoadMore();
          }
        },
        { rootMargin: '320px 0px' }
      );
      observerRef.current.observe(node);
    },
    [hasError, hasNextPage, isFetchingNextPage, onLoadMore]
  );

  return (
    <div
      aria-live="polite"
      className="flex min-h-16 flex-col items-center justify-center gap-2 border-t bg-muted/10 px-4 py-3 text-center"
      ref={triggerRef}
    >
      <p className="text-muted-foreground text-xs">{loadedLabel}</p>
      {hasError ? (
        <div className="flex flex-col items-center gap-2">
          {errorLabel ? (
            <p className="text-dynamic-red text-sm">{errorLabel}</p>
          ) : null}
          <Button
            onClick={onLoadMore}
            size="sm"
            type="button"
            variant="outline"
          >
            {retryLabel ?? loadMoreLabel}
          </Button>
        </div>
      ) : isFetchingNextPage ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          {loadingLabel}
        </div>
      ) : hasNextPage ? (
        <Button onClick={onLoadMore} size="sm" type="button" variant="outline">
          <ChevronDown className="mr-2 size-4" />
          {loadMoreLabel}
        </Button>
      ) : (
        <p className="font-medium text-muted-foreground text-xs">{endLabel}</p>
      )}
    </div>
  );
}
