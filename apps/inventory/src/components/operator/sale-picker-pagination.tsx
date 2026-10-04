'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

export function SalePickerPagination({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isError = false,
  loadVersion,
}: {
  fetchNextPage?: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError?: boolean;
  loadVersion: number;
}) {
  const t = useTranslations('inventory.operator.pagination');
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const mounted = useRef(false);
  const request = useCallback(
    async (manual = false) => {
      if (
        !mounted.current ||
        !fetchNextPage ||
        (!hasNextPage && !(manual && isError)) ||
        isFetchingNextPage ||
        pending.current ||
        (!manual && (failed || isError))
      )
        return;
      pending.current = true;
      if (manual) setFailed(false);
      try {
        const result = await fetchNextPage();
        // React Query's fetchNextPage can resolve an error result rather than throw.
        if (
          result &&
          typeof result === 'object' &&
          'isError' in result &&
          result.isError
        ) {
          if (mounted.current) setFailed(true);
        }
      } catch {
        if (mounted.current) setFailed(true);
      } finally {
        pending.current = false;
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage, failed, isError]
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-observe each loaded page even when filtering leaves the visible row count unchanged.
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      mounted.current = Boolean(node);
      if (
        !node ||
        !hasNextPage ||
        isFetchingNextPage ||
        failed ||
        isError ||
        !globalThis.IntersectionObserver
      )
        return;
      // The sentinel is a direct child of the actual scrolling list. Initial
      // intersection also fills a short viewport; new pages re-observe it.
      const activeObserver = new IntersectionObserver(
        (entries) => {
          if (observer.current !== activeObserver) return;
          if (entries.some((entry) => entry.isIntersecting)) void request();
        },
        { root: node.parentElement, rootMargin: '0px 0px 200px 0px' }
      );
      observer.current = activeObserver;
      activeObserver.observe(node);
    },
    [hasNextPage, isFetchingNextPage, failed, isError, request, loadVersion]
  );
  if (!hasNextPage && !isError) return null;
  return (
    <div ref={attach}>
      {failed || isError ? (
        <p role="status" className="mb-2 text-muted-foreground text-sm">
          {t('loadMoreError')}
        </p>
      ) : null}
      <Button
        className="w-full"
        disabled={isFetchingNextPage}
        onClick={() => void request(true)}
        type="button"
        variant="outline"
      >
        {isFetchingNextPage ? t('loadingMore') : t('loadMore')}
      </Button>
    </div>
  );
}
