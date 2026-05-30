'use client';

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  type InventoryListResponse,
  type InventoryNamedListQuery,
  listInventoryBatches,
  listInventoryManufacturersPage,
  listInventoryProductCategories,
  listInventorySuppliers,
  listInventoryUnitsPage,
  listInventoryWarehouses,
} from '@tuturuuu/internal-api/inventory';
import {
  DataTable,
  type DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';

export type InventoryTableResource =
  | 'batches'
  | 'categories'
  | 'manufacturers'
  | 'suppliers'
  | 'units'
  | 'warehouses';

type InventoryDataTableClientProps<TData, TValue> = Omit<
  DataTableProps<TData, TValue>,
  | 'count'
  | 'data'
  | 'defaultQuery'
  | 'isFiltered'
  | 'onRefresh'
  | 'onSearch'
  | 'pageIndex'
  | 'pageSize'
  | 'resetParams'
  | 'setParams'
  | 't'
> & {
  resource: InventoryTableResource;
  wsId: string;
};

const resourceLoaders = {
  batches: listInventoryBatches,
  categories: listInventoryProductCategories,
  manufacturers: listInventoryManufacturersPage,
  suppliers: listInventorySuppliers,
  units: listInventoryUnitsPage,
  warehouses: listInventoryWarehouses,
} satisfies Record<
  InventoryTableResource,
  (
    wsId: string,
    query?: InventoryNamedListQuery
  ) => Promise<InventoryListResponse<unknown>>
>;

export function InventoryDataTableClient<TData, TValue>({
  resource,
  wsId,
  ...props
}: InventoryDataTableClientProps<TData, TValue>) {
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

  const dataQuery = useQuery({
    queryKey: ['inventory-table', resource, wsId, { page, pageSize, q }],
    queryFn: () =>
      resourceLoaders[resource](wsId, {
        page,
        pageSize,
        q,
      }) as Promise<InventoryListResponse<TData>>,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  const handleSearch = useCallback(
    (query: string) => {
      setQ(query || null);
      setPage(1);
    },
    [setPage, setQ]
  );

  const handleSetParams = useCallback(
    (params: { page?: number; pageSize?: string }) => {
      if (params.page !== undefined) setPage(params.page);
      if (params.pageSize !== undefined) setPageSize(Number(params.pageSize));
    },
    [setPage, setPageSize]
  );

  const handleResetParams = useCallback(() => {
    setQ(null);
    setPage(null);
    setPageSize(null);
  }, [setPage, setPageSize, setQ]);

  if (dataQuery.isError) {
    return (
      <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
        {t('common.error')}
      </div>
    );
  }

  const showLoadingOverlay = dataQuery.isFetching && !dataQuery.isLoading;

  return (
    <div className="relative">
      {dataQuery.isLoading ? (
        <div className="flex min-h-40 items-center justify-center rounded-lg border border-border bg-foreground/5 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('common.loading')}...
        </div>
      ) : null}
      {!dataQuery.isLoading ? (
        <>
          {showLoadingOverlay ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-muted-foreground text-sm">
                  {t('common.loading')}...
                </span>
              </div>
            </div>
          ) : null}
          <DataTable
            {...props}
            count={dataQuery.data?.count ?? 0}
            data={dataQuery.data?.data ?? []}
            defaultQuery={q}
            isFiltered={Boolean(q)}
            onRefresh={() => {
              queryClient.invalidateQueries({
                queryKey: ['inventory-table', resource, wsId],
              });
            }}
            onSearch={handleSearch}
            pageIndex={page - 1}
            pageSize={pageSize}
            resetParams={handleResetParams}
            setParams={handleSetParams}
            t={t}
          />
        </>
      ) : null}
    </div>
  );
}
