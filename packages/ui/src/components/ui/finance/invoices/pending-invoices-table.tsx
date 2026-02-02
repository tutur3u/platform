'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspaceConfig } from '../../../../hooks/use-workspace-config';
import ExportDialogContent from './export-dialog-content';
import { usePendingInvoices } from './hooks';
import { pendingInvoiceColumns } from './pending-columns';
import { UserFilterWrapper } from './user-filter-wrapper';

interface Props {
  wsId: string;
  canExport?: boolean;
  currency?: string;
}

export function PendingInvoicesTable({
  wsId,
  canExport = false,
  currency = 'USD',
}: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 300,
    })
  );

  const [userIds, setUserIds] = useQueryState(
    'userIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
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

  const { data: groupByUserConfig, isLoading: isConfigLoading } =
    useWorkspaceConfig<string>(
      wsId,
      'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
      'false'
    );

  const { data: useAttendanceBasedConfig } = useWorkspaceConfig<string>(
    wsId,
    'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
    'true'
  );

  const groupByUser = groupByUserConfig === 'true';
  const useAttendanceBased = useAttendanceBasedConfig === 'true';

  const handleResetParams = useCallback(() => {
    setQ(null);
    setUserIds(null);
    setPage(null);
    setPageSize(null);
  }, [setQ, setUserIds, setPage, setPageSize]);

  const { data, isLoading, isFetching, error } = usePendingInvoices(wsId, {
    page,
    pageSize,
    q,
    userIds,
    groupByUser,
    enabled: !isConfigLoading,
  });

  const columns = useMemo(
    () =>
      pendingInvoiceColumns(
        t,
        'pending-invoice-data-table',
        useAttendanceBased,
        currency
      ),
    [t, useAttendanceBased, currency]
  );

  const [allUsers, setAllUsers] = useState<
    { id: string; display_name: string; avatar_url?: string }[]
  >([]);

  const currentUsers = useMemo(() => {
    if (!data?.data) return [];

    return Array.from(
      new Map(
        data.data.map((invoice) => [
          invoice.user_id,
          {
            id: invoice.user_id,
            display_name: invoice.user_name,
            avatar_url: invoice.user_avatar_url || undefined,
          },
        ])
      ).values()
    );
  }, [data?.data]);

  const isUnfiltered = q === '' && userIds.length === 0;

  useEffect(() => {
    if (!isUnfiltered || currentUsers.length === 0) return;

    setAllUsers((prev) => {
      const merged = new Map(prev.map((user) => [user.id, user]));
      for (const user of currentUsers) {
        merged.set(user.id, user);
      }
      return Array.from(merged.values());
    });
  }, [currentUsers, isUnfiltered]);

  const availableUsers = allUsers.length > 0 ? allUsers : currentUsers;

  // Compute pageIndex from 1-based page
  const pageIndex = page > 0 ? page - 1 : 0;

  // Handler for pagination params
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

  const handleSearch = useCallback(
    (query: string) => {
      setQ(query || null);
      setPage(1); // Reset to first page on search
    },
    [setQ, setPage]
  );

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-destructive text-sm">
          {t('ws-invoices.error_loading')}
        </p>
      </div>
    );
  }

  const invoices = data?.data
    ? data.data.map((item) => ({
        ...item,
        ws_id: wsId,
      }))
    : isLoading
      ? undefined
      : [];

  // Show loading overlay when fetching new data (but not on initial load)
  const showLoadingOverlay = isFetching && !isLoading;

  return (
    <div className="relative">
      {/* Loading overlay on table when fetching */}
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

      <DataTable
        t={t}
        data={invoices}
        columns={columns}
        namespace="pending-invoice-data-table"
        count={data?.count || 0}
        pageIndex={pageIndex}
        pageSize={pageSize}
        defaultQuery={q}
        setParams={handleSetParams}
        resetParams={handleResetParams}
        onSearch={handleSearch}
        isFiltered={q !== '' || userIds.length > 0}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <UserFilterWrapper
                wsId={wsId}
                invoiceType="pending"
                availableUsers={availableUsers}
              />
            </Suspense>
          </div>
        }
        toolbarExportContent={
          canExport ? (
            <ExportDialogContent
              wsId={wsId}
              exportType="invoices"
              invoiceType="pending"
              searchParams={{
                q: q || undefined,
                page: page?.toString() || undefined,
                pageSize: pageSize?.toString() || undefined,
                userIds,
              }}
            />
          ) : undefined
        }
        onRefresh={() => {
          queryClient.invalidateQueries({
            queryKey: ['pending-invoices', wsId],
          });
        }}
        defaultVisibility={{
          user_id: false,
          group_id: false,
        }}
      />
    </div>
  );
}
