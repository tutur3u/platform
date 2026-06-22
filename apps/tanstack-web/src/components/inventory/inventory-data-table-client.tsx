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
  listInventorySuppliers,
  listInventoryWarehouses,
} from '@tuturuuu/internal-api/inventory';
import {
  DataTable,
  type DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import { useCallback } from 'react';
import { useTranslations } from 'use-intl';

export type InventoryTableResource = 'batches' | 'suppliers' | 'warehouses';

export type InventoryTableSearch = {
  page: number;
  pageSize: number;
  q: string;
};

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
  onSearchChange: (search: Partial<InventoryTableSearch>) => void;
  resource: InventoryTableResource;
  search: InventoryTableSearch;
  wsId: string;
};

const resourceLoaders = {
  batches: listInventoryBatches,
  suppliers: listInventorySuppliers,
  warehouses: listInventoryWarehouses,
} satisfies Record<
  InventoryTableResource,
  (
    wsId: string,
    query?: InventoryNamedListQuery
  ) => Promise<InventoryListResponse<unknown>>
>;

export function InventoryDataTableClient<TData, TValue>({
  onSearchChange,
  resource,
  search,
  wsId,
  ...props
}: InventoryDataTableClientProps<TData, TValue>) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { page, pageSize, q } = search;

  const dataQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () =>
      resourceLoaders[resource](wsId, {
        page,
        pageSize,
        q,
      }) as Promise<InventoryListResponse<TData>>,
    queryKey: ['inventory-table', resource, wsId, { page, pageSize, q }],
    staleTime: 30 * 1000,
  });

  const handleSearch = useCallback(
    (query: string) => {
      onSearchChange({
        page: 1,
        q: query,
      });
    },
    [onSearchChange]
  );

  const handleSetParams = useCallback(
    (params: { page?: number; pageSize?: string }) => {
      onSearchChange({
        page: params.page,
        pageSize:
          params.pageSize === undefined ? undefined : Number(params.pageSize),
      });
    },
    [onSearchChange]
  );

  const handleResetParams = useCallback(() => {
    onSearchChange({
      page: 1,
      pageSize: 10,
      q: '',
    });
  }, [onSearchChange]);

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
