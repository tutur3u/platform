'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, RefreshCw, SearchX, UsersRound } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { type ReactNode, useCallback, useRef } from 'react';
import { getUserGroupColumns } from './columns';
import Filters from './filters';
import UserGroupForm from './form';
import {
  type UserGroupStatusFilter,
  type UserGroupsResponse,
  useInfiniteUserGroups,
} from './hooks';
import { shouldRefreshUserGroups } from './refresh-utils';
import { resolveUserGroupsViewState } from './view-state';

interface Props {
  wsId: string;
  initialData?: UserGroupsResponse;
  isLimitedScope: boolean;
  permissions: {
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  };
}

export function UserGroupsTable({
  wsId,
  initialData,
  isLimitedScope,
  permissions,
}: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const lastRefreshAtRef = useRef<number | null>(null);

  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 300,
    })
  );
  const [status, setStatus] = useQueryState(
    'status',
    parseAsString.withDefault('active').withOptions({
      clearOnDefault: true,
      shallow: true,
    })
  );

  const statusFilter: UserGroupStatusFilter =
    status === 'all' || status === 'archived' ? status : 'active';

  const [, setIncludeArchived] = useQueryState(
    'includeArchived',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const setStatusFilter = useCallback(
    (value: UserGroupStatusFilter) => {
      setStatus(value === 'active' ? null : value);
      setIncludeArchived(null);
    },
    [setIncludeArchived, setStatus]
  );

  const {
    groups: fetchedGroups,
    count,
    isLoading,
    isFetching,
    isPlaceholderData,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteUserGroups(
    wsId,
    {
      q,
      status: statusFilter,
    },
    {
      initialData: !q && statusFilter === 'active' ? initialData : undefined,
    }
  );

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
    setStatus(null);
    setIncludeArchived(null);
  }, [setIncludeArchived, setQ, setStatus]);

  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (!shouldRefreshUserGroups(now, lastRefreshAtRef.current)) {
      return;
    }

    lastRefreshAtRef.current = now;
    queryClient.invalidateQueries({
      queryKey: ['workspace-user-groups', wsId],
    });
    queryClient.invalidateQueries({
      queryKey: ['workspace-user-groups-infinite', wsId],
    });
  }, [queryClient, wsId]);

  const hasError = Boolean(error);
  const isFiltered = Boolean(q) || statusFilter !== 'active';
  const viewState = resolveUserGroupsViewState({
    hasError,
    isFiltered,
    isLimitedScope,
    isLoading,
    itemCount: fetchedGroups.length,
  });

  const scopeNotice = isLimitedScope ? (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-dynamic-blue/25 bg-dynamic-blue/5 p-4">
      <Info
        className="mt-0.5 size-5 shrink-0 text-dynamic-blue"
        aria-hidden="true"
      />
      <div>
        <p className="font-medium text-sm">
          {t('user-group-data-table.limited_scope_title')}
        </p>
        <p className="mt-1 text-muted-foreground text-sm leading-5">
          {t('user-group-data-table.limited_scope_description')}
        </p>
      </div>
    </div>
  ) : null;

  if (viewState === 'error') {
    return (
      <div>
        {scopeNotice}
        <div className="flex flex-col items-center justify-center rounded-xl border border-dynamic-red/25 bg-dynamic-red/5 px-6 py-14 text-center">
          <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-dynamic-red/10 text-dynamic-red">
            <RefreshCw className="size-5" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-lg">
            {t('user-group-data-table.load_error_title')}
          </h3>
          <p className="mt-2 max-w-md text-muted-foreground text-sm leading-6">
            {t('user-group-data-table.load_error_description')}
          </p>
          <Button
            className="mt-5"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label={t('user-group-data-table.retry_loading')}
          >
            {isFetching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                {t('common.retry')}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (viewState === 'loading') {
    return (
      <div>
        {scopeNotice}
        <GroupTableSkeleton />
      </div>
    );
  }

  const showLoadingOverlay =
    (isFetching || isPlaceholderData) && !isLoading && !isFetchingNextPage;

  const emptyState =
    viewState === 'filtered-empty' ? (
      <GroupEmptyState
        icon={<SearchX className="size-6" aria-hidden="true" />}
        title={t('user-group-data-table.filtered_empty_title')}
        description={t('user-group-data-table.filtered_empty_description')}
        action={
          <Button variant="outline" onClick={handleResetParams}>
            {t('user-group-data-table.clear_filters')}
          </Button>
        }
      />
    ) : viewState === 'restricted-empty' ? (
      <GroupEmptyState
        icon={<UsersRound className="size-6" aria-hidden="true" />}
        title={t('user-group-data-table.limited_empty_title')}
        description={t('user-group-data-table.limited_empty_description')}
      />
    ) : (
      <GroupEmptyState
        icon={<UsersRound className="size-6" aria-hidden="true" />}
        title={t('user-group-data-table.empty_title')}
        description={t('user-group-data-table.empty_description')}
        action={
          permissions.canCreate ? (
            <UserGroupForm
              wsId={wsId}
              canCreate={permissions.canCreate}
              canUpdate={permissions.canUpdate}
            />
          ) : undefined
        }
      />
    );

  return (
    <div>
      {scopeNotice}
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
          emptyState={emptyState}
          columnGenerator={getUserGroupColumns}
          namespace="user-group-data-table"
          count={count}
          filters={
            <Filters
              wsId={wsId}
              status={statusFilter}
              onStatusChange={setStatusFilter}
            />
          }
          onSearch={handleSearch}
          resetParams={handleResetParams}
          isFiltered={isFiltered}
          hidePagination
          extraData={{
            canCreateUserGroups: permissions.canCreate,
            canUpdateUserGroups: permissions.canUpdate,
            canDeleteUserGroups: permissions.canDelete,
            wsId,
          }}
          onRefresh={handleRefresh}
          defaultVisibility={{
            id: false,
            is_guest: false,
            locked: false,
            created_at: false,
          }}
        />
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
    </div>
  );
}

function GroupEmptyState({
  action,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground">
        {icon}
      </div>
      <h3 className="font-semibold text-base">{title}</h3>
      <p className="mt-2 max-w-md text-muted-foreground text-sm leading-6">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function GroupTableSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 min-w-64 flex-1" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-10" />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-4 gap-4 bg-foreground/5 p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-4" key={`header-${index}`} />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, row) => (
          <div
            className="grid grid-cols-4 gap-4 border-t p-4"
            key={`row-${row}`}
          >
            {Array.from({ length: 4 }, (_, column) => (
              <Skeleton className="h-5" key={`cell-${row}-${column}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
