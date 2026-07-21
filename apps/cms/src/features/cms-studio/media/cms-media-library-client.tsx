'use client';

import { ImageIcon, Loader2, RefreshCw } from '@tuturuuu/icons';
import type {
  WorkspaceExternalProjectMediaAttachment,
  WorkspaceExternalProjectMediaType,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { CmsMediaCard } from './cms-media-card';
import { CmsMediaLibraryToolbar } from './cms-media-library-toolbar';
import {
  useCmsMediaLibrary,
  useInfiniteLoadTrigger,
} from './use-cms-media-library';

function MediaGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="aspect-[4/3] rounded-xl" />
      ))}
    </div>
  );
}

export function CmsMediaLibraryClient({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const t = useTranslations('external-projects');
  const [type, setType] = useState<WorkspaceExternalProjectMediaType>('all');
  const [attachment, setAttachment] =
    useState<WorkspaceExternalProjectMediaAttachment>('all');
  const [search, setSearch] = useState('');
  const mediaQuery = useCmsMediaLibrary({
    attachment,
    query: search,
    type,
    workspaceId,
  });
  const items = useMemo(
    () => mediaQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [mediaQuery.data?.pages]
  );
  const firstPage = mediaQuery.data?.pages[0];
  const total = firstPage?.pageInfo.total ?? 0;
  const totals = firstPage?.totals ?? {
    all: 0,
    audio: 0,
    image: 0,
    other: 0,
  };
  const loadMore = useCallback(() => {
    void mediaQuery.fetchNextPage();
  }, [mediaQuery.fetchNextPage]);
  const loadMoreRef = useInfiniteLoadTrigger({
    enabled: Boolean(mediaQuery.hasNextPage && !mediaQuery.isFetchingNextPage),
    loadMore,
  });
  const filtered = Boolean(
    search.trim() || type !== 'all' || attachment !== 'all'
  );

  return (
    <main className="space-y-5 pb-10">
      <CmsMediaLibraryToolbar
        attachment={attachment}
        matchingTotal={total}
        search={search}
        setAttachment={setAttachment}
        setSearch={setSearch}
        setType={setType}
        totals={totals}
        type={type}
      />

      {mediaQuery.isPending ? (
        <MediaGridSkeleton />
      ) : mediaQuery.isError ? (
        <section className="flex flex-col items-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center">
          <RefreshCw className="size-8 text-destructive" />
          <h2 className="mt-3 font-semibold">
            {t('epm.media_library_error_title')}
          </h2>
          <p className="mt-1 max-w-md text-muted-foreground text-sm leading-6">
            {t('epm.media_library_error_description')}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => void mediaQuery.refetch()}
          >
            <RefreshCw className="size-4" />
            {t('epm.media_library_retry')}
          </Button>
        </section>
      ) : items.length === 0 ? (
        <section className="flex flex-col items-center rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center">
          <ImageIcon className="size-9 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">
            {t(
              filtered
                ? 'epm.media_library_no_results_title'
                : 'epm.media_library_empty_title'
            )}
          </h2>
          <p className="mt-1 max-w-md text-muted-foreground text-sm leading-6">
            {t(
              filtered
                ? 'epm.media_library_no_results_description'
                : 'epm.media_library_empty_description'
            )}
          </p>
          {filtered && (
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setAttachment('all');
                setSearch('');
                setType('all');
              }}
            >
              {t('epm.media_library_clear_filters')}
            </Button>
          )}
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {items.map((asset) => (
              <CmsMediaCard
                key={asset.id}
                asset={asset}
                workspaceId={workspaceId}
              />
            ))}
          </section>
          <div ref={loadMoreRef} className="flex min-h-16 justify-center py-2">
            {mediaQuery.isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                {t('epm.media_library_loading_more')}
              </div>
            ) : mediaQuery.hasNextPage ? (
              <Button variant="outline" onClick={loadMore}>
                {t('epm.media_library_load_more')}
              </Button>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t('epm.media_library_end', { count: items.length })}
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
