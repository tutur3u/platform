'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { DateRangeFilterWrapper } from '@tuturuuu/ui/finance/shared/date-range-filter-wrapper';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { Suspense, useCallback } from 'react';
import { useFinanceHref } from '../finance-route-context';
import { invoiceColumns } from './columns';
import ExportDialogContent from './export-dialog-content';
import {
  type InvoicesParams,
  type InvoicesResponse,
  useWorkspaceInvoices,
} from './hooks';
import { UserFilterWrapper } from './user-filter-wrapper';
import { WalletFilterWrapper } from './wallet-filter-wrapper';

type DeleteInvoiceAction = (
  wsId: string,
  invoiceId: string
) => Promise<{ success: boolean; message?: string }>;

interface Props {
  wsId: string;
  canDeleteInvoices?: boolean;
  canExport?: boolean;
  invoiceType?: 'created' | 'pending';
  deleteInvoiceAction?: DeleteInvoiceAction;
  initialData: InvoicesResponse;
  currency?: string;
}

export function InvoicesTable({
  wsId,
  canDeleteInvoices = false,
  canExport = false,
  invoiceType = 'created',
  deleteInvoiceAction,
  initialData,
  currency = 'USD',
}: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const financeHref = useFinanceHref();

  // Use nuqs for URL state management (shallow: true for client-side only)
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

  const [start, setStart] = useQueryState(
    'start',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const [end, setEnd] = useQueryState(
    'end',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const [userIds, setUserIds] = useQueryState(
    'userIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [walletIds, setWalletIds] = useQueryState(
    'walletIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  // Compute pageIndex from 1-based page
  const pageIndex = page > 0 ? page - 1 : 0;

  // Build params for query
  const params: InvoicesParams = {
    q,
    page,
    pageSize,
    start: start || undefined,
    end: end || undefined,
    userIds,
    walletIds,
  };

  // Fetch data with React Query
  const { data, isLoading, isFetching, error } = useWorkspaceInvoices(
    wsId,
    params,
    {
      // Use initial data for first render (SSR hydration)
      initialData:
        !q &&
        page === 1 &&
        pageSize === 10 &&
        !start &&
        !end &&
        userIds.length === 0 &&
        walletIds.length === 0
          ? initialData
          : undefined,
    }
  );

  // Add href for navigation to each invoice
  const invoices = data?.data
    ? data.data.map((invoice) => ({
        ...invoice,
        href: `/${wsId}${financeHref(`/invoices/${invoice.id}`)}`,
        ws_id: wsId,
      }))
    : isLoading
      ? undefined
      : [];

  const extraData = {
    canDeleteInvoices,
    deleteInvoiceAction,
    currency,
  };

  // Handler for search - uses nuqs setQ
  const handleSearch = useCallback(
    (query: string) => {
      setQ(query || null);
      setPage(1); // Reset to first page on search
    },
    [setQ, setPage]
  );

  // Handler for pagination params - uses nuqs setters
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

  // Handler for reset - clears all nuqs state
  const handleResetParams = useCallback(() => {
    setQ(null);
    setPage(null);
    setPageSize(null);
    setStart(null);
    setEnd(null);
    setUserIds(null);
    setWalletIds(null);
  }, [setQ, setPage, setPageSize, setStart, setEnd, setUserIds, setWalletIds]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-destructive">{t('ws-invoices.error_loading')}</p>
      </div>
    );
  }

  // Show loading overlay when fetching new data (but not on initial load)
  const showLoadingOverlay = isFetching && !isLoading;

  return (
    <div className="relative">
      {/* Loading overlay on table when fetching */}
      {showLoadingOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        </div>
      )}

      <DataTable
        t={t}
        data={invoices}
        namespace="invoice-data-table"
        columnGenerator={invoiceColumns}
        extraData={extraData}
        count={data?.count ?? 0}
        pageIndex={pageIndex}
        pageSize={pageSize}
        defaultQuery={q}
        onSearch={handleSearch}
        setParams={handleSetParams}
        resetParams={handleResetParams}
        isFiltered={
          q !== '' ||
          page !== 1 ||
          pageSize !== 10 ||
          !!start ||
          !!end ||
          userIds.length > 0 ||
          walletIds.length > 0
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <UserFilterWrapper wsId={wsId} invoiceType={invoiceType} />
            </Suspense>
            {invoiceType === 'created' && (
              <>
                <Suspense fallback={<Skeleton className="h-8 w-32" />}>
                  <WalletFilterWrapper wsId={wsId} />
                </Suspense>
                <Suspense fallback={<Skeleton className="h-8 w-32" />}>
                  <DateRangeFilterWrapper />
                </Suspense>
              </>
            )}
          </div>
        }
        toolbarExportContent={
          canExport ? (
            <ExportDialogContent
              wsId={wsId}
              exportType="invoices"
              invoiceType={invoiceType}
              searchParams={{
                q: q || undefined,
                page: page?.toString() || undefined,
                pageSize: pageSize?.toString() || undefined,
                start: start || undefined,
                end: end || undefined,
                userIds,
                walletIds,
              }}
            />
          ) : undefined
        }
        onRefresh={() => {
          queryClient.invalidateQueries({
            queryKey: ['workspace-invoices', wsId],
          });
        }}
        defaultVisibility={{
          id: false,
          customer_id: false,
          price: false,
          total_diff: false,
          note: false,
        }}
      />
    </div>
  );
}
