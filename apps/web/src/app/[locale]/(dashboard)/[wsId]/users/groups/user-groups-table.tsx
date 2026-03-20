'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useRef } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { getUserGroupColumns } from './columns';
import Filters from './filters';
import { type UserGroupsResponse, useInfiniteUserGroups } from './hooks';

interface Props {
  wsId: string;
  initialData: UserGroupsResponse;
  permissions: {
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  };
}

export function UserGroupsTable({ wsId, initialData, permissions }: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 300,
    })
  );

  const {
    groups: fetchedGroups,
    count,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteUserGroups(
    wsId,
    {
      q,
    },
    {
      initialData: !q ? initialData : undefined,
    }
  );

  useEffect(() => {
    const node = loadMoreRef.current;

    if (!node || !hasNextPage || isFetchingNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || isFetchingNextPage || !hasNextPage) {
          return;
        }

        void fetchNextPage();
      },
      {
        rootMargin: '200px 0px',
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const groups = fetchedGroups.length
    ? fetchedGroups.map((g) => ({
        ...g,
        ws_id: wsId,
        href: `/${wsId}/users/groups/${g.id}`,
      }))
    : isLoading
      ? undefined
      : [];

  const handleSearch = useCallback(
    (query: string) => {
      setQ(query || null);
    },
    [setQ]
  );

  const handleResetParams = useCallback(() => {
    setQ(null);
  }, [setQ]);

  const hasError = Boolean(error);
  const errorMessage = error instanceof Error ? error.message : undefined;

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-destructive">
          {errorMessage || 'Error loading user groups. Please try again.'}
        </p>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Retry loading user groups"
        >
          {isFetching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('common.loading')}
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('common.retry')}
            </>
          )}
        </Button>
      </div>
    );
  }

  const showLoadingOverlay = isFetching && !isLoading && !isFetchingNextPage;

  return (
    <div className="relative">
      {showLoadingOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm">
              {t('common.loading')}
            </span>
          </div>
        </div>
      )}

      <CustomDataTable
        data={groups}
        columnGenerator={getUserGroupColumns}
        namespace="user-group-data-table"
        count={count}
        filters={<Filters wsId={wsId} />}
        onSearch={handleSearch}
        resetParams={handleResetParams}
        isFiltered={!!q}
        hidePagination
        extraData={{
          canCreateUserGroups: permissions.canCreate,
          canUpdateUserGroups: permissions.canUpdate,
          canDeleteUserGroups: permissions.canDelete,
        }}
        onRefresh={() => {
          queryClient.invalidateQueries({
            queryKey: ['workspace-user-groups', wsId],
          });
          queryClient.invalidateQueries({
            queryKey: ['workspace-user-groups-infinite', wsId],
          });
        }}
        defaultVisibility={{
          id: false,
          locked: false,
          created_at: false,
        }}
      />

      <div ref={loadMoreRef} className="h-1" />

      {(hasNextPage || isFetchingNextPage) && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('common.load_more')
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
