'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { transactionCategoryColumns } from '@tuturuuu/ui/finance/transactions/categories/columns';
import { TransactionCategoryForm } from '@tuturuuu/ui/finance/transactions/categories/form';
import {
  type TransactionCategoriesResponse,
  useTransactionCategories,
} from '@tuturuuu/ui/finance/transactions/categories/hooks';
import { useTranslations } from 'next-intl';
import {
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

const PAGE_SIZE_STORAGE_KEY = 'transaction-categories-pageSize';

interface CategoriesDataTableProps {
  wsId: string;
  initialData?: TransactionCategoriesResponse;
  filters?: ReactNode[];
  currency?: string;
}

export function CategoriesDataTable({
  wsId,
  initialData,
  filters,
  currency = 'USD',
}: CategoriesDataTableProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  // Read persisted pageSize from localStorage
  const [storedPageSize, setStoredPageSize] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          setStoredPageSize(parsed);
        }
      } else {
        setStoredPageSize(10); // Default
      }
    }
  }, []);

  // URL state management with nuqs (client-side, no server refresh)
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

  const [pageSize, setPageSizeUrl] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(storedPageSize ?? 10).withOptions({
      shallow: true,
    })
  );

  // Wrapper to persist pageSize to localStorage
  const setPageSize = useCallback(
    (size: number | null) => {
      if (size !== null && typeof window !== 'undefined') {
        localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
      }
      setPageSizeUrl(size);
    },
    [setPageSizeUrl]
  );

  const [type, setType] = useQueryState(
    'type',
    parseAsString.withDefault('all').withOptions({
      shallow: true,
    })
  );

  const [minAmount, setMinAmount] = useQueryState(
    'minAmount',
    parseAsFloat.withOptions({
      shallow: true,
    })
  );

  const [maxAmount, setMaxAmount] = useQueryState(
    'maxAmount',
    parseAsFloat.withOptions({
      shallow: true,
    })
  );

  // Compute pageIndex from 1-based page
  const pageIndex = page > 0 ? page - 1 : 0;

  // Check if we should use initial data (first render with default params)
  const useInitialData =
    !q &&
    page === 1 &&
    pageSize === 10 &&
    type === 'all' &&
    minAmount === null &&
    maxAmount === null;

  // Fetch data with TanStack Query
  const { data, isLoading, isFetching, error } = useTransactionCategories(
    wsId,
    {
      q,
      page,
      pageSize,
      type: type as 'income' | 'expense' | 'all',
      minAmount: minAmount ?? undefined,
      maxAmount: maxAmount ?? undefined,
    },
    {
      initialData: useInitialData ? initialData : undefined,
    }
  );

  // Add href and ws_id for navigation
  const categories = data?.data
    ? data.data.map((cat) => ({
        ...cat,
        href: `/${wsId}/finance/transactions/categories/${cat.id}`,
        ws_id: wsId,
      }))
    : isLoading
      ? undefined
      : [];

  // State for edit dialog
  const [selectedCategory, setSelectedCategory] =
    useState<TransactionCategoryWithStats | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const handleRowClick = useCallback((row: TransactionCategoryWithStats) => {
    setSelectedCategory(row);
    setShowEditDialog(true);
  }, []);

  // Handler for search
  const handleSearch = useCallback(
    (query: string) => {
      setQ(query || null);
      setPage(1);
    },
    [setQ, setPage]
  );

  // Handler for pagination
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

  // Handler for reset - preserves pageSize preference
  const handleResetParams = useCallback(() => {
    setQ(null);
    setPage(null);
    // Don't reset pageSize - keep user's preference
    setPageSizeUrl(null);
    setType(null);
    setMinAmount(null);
    setMaxAmount(null);
  }, [setQ, setPage, setPageSizeUrl, setType, setMinAmount, setMaxAmount]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-destructive">{t('common.error_loading_data')}</p>
      </div>
    );
  }

  // Show loading overlay when fetching new data (but not on initial load)
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

      <DataTable
        t={t}
        data={categories}
        columnGenerator={transactionCategoryColumns}
        extraData={{ currency }}
        filters={filters}
        namespace="transaction-category-data-table"
        count={data?.count ?? 0}
        pageIndex={pageIndex}
        pageSize={pageSize}
        defaultQuery={q}
        onSearch={handleSearch}
        setParams={handleSetParams}
        resetParams={handleResetParams}
        isFiltered={
          !!q || type !== 'all' || minAmount !== null || maxAmount !== null
        }
        onRefresh={() => {
          queryClient.invalidateQueries({
            queryKey: ['transaction-categories', wsId],
          });
        }}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
        onRowClick={handleRowClick}
      />

      {/* Edit Dialog */}
      {selectedCategory && (
        <ModifiableDialogTrigger
          data={selectedCategory}
          open={showEditDialog}
          title={t('ws-transaction-categories.edit')}
          editDescription={t('ws-transaction-categories.edit_description')}
          setOpen={setShowEditDialog}
          form={
            <TransactionCategoryForm
              wsId={wsId}
              data={{ ...selectedCategory, ws_id: wsId }}
              onFinish={() => {
                setShowEditDialog(false);
                queryClient.invalidateQueries({
                  queryKey: ['transaction-categories', wsId],
                });
              }}
            />
          }
        />
      )}
    </div>
  );
}
