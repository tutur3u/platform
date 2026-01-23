'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { getUserGroupColumns } from './columns';
import Filters from './filters';
import { type UserGroupsResponse, useUserGroups } from './hooks';

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

  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 300,
    })
  );

  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  const [pageSize, setPageSize] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(10).withOptions({
      shallow: true,
    })
  );

  const pageIndex = page > 0 ? page - 1 : 0;

  const { data, isLoading, isFetching, error, refetch } = useUserGroups(
    wsId,
    {
      q,
      page,
      pageSize,
    },
    {
      initialData:
        !q && page === 1 && pageSize === 10 ? initialData : undefined,
    }
  );

  const groups = data?.data
    ? data.data.map((g) => ({
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
      setPage(1);
    },
    [setQ, setPage]
  );

  const handleSetParams = useCallback(
    (params: { page?: number; pageSize?: string }) => {
      if (params.page !== undefined) {
        setPage(params.page);
      }
      if (params.pageSize !== undefined) {
        setPageSize(Number(params.pageSize));
      }
    },
    [setPage, setPageSize]
  );

  const handleResetParams = useCallback(() => {
    setQ(null);
    setPage(null);
    setPageSize(null);
  }, [setQ, setPage, setPageSize]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-destructive">
          Error loading user groups. Please try again.
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

  const showLoadingOverlay = isFetching && !isLoading;

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
        count={data?.count ?? 0}
        pageIndex={pageIndex}
        pageSize={pageSize}
        filters={<Filters wsId={wsId} />}
        onSearch={handleSearch}
        setParams={handleSetParams}
        resetParams={handleResetParams}
        isFiltered={!!q}
        extraData={{
          canCreateUserGroups: permissions.canCreate,
          canUpdateUserGroups: permissions.canUpdate,
          canDeleteUserGroups: permissions.canDelete,
        }}
        onRefresh={() => {
          queryClient.invalidateQueries({
            queryKey: ['workspace-user-groups', wsId],
          });
        }}
        defaultVisibility={{
          id: false,
          locked: false,
          created_at: false,
        }}
      />
    </div>
  );
}
