'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useState } from 'react';
import { productColumns } from './columns';
import { useWorkspaceProducts } from './hooks';
import { ProductQuickDialog } from './quick-dialog';

interface Props {
  initialData: {
    data: Product[];
    count: number;
  };
  categories: ProductCategory[];
  warehouses: ProductWarehouse[];
  units: ProductUnit[];
  wsId: string;
  canCreateInventory: boolean;
  canUpdateInventory: boolean;
  canDeleteInventory: boolean;
}

export function ProductsPageClient({
  initialData,
  categories,
  warehouses,
  units,
  wsId,
  canUpdateInventory,
  canDeleteInventory,
}: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  const [sortBy, setSortBy] = useQueryState(
    'sortBy',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const [sortOrder, setSortOrder] = useQueryState(
    'sortOrder',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const { data, isLoading, isFetching } = useWorkspaceProducts(
    wsId,
    {
      q,
      page,
      pageSize,
      sortBy: sortBy || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
    },
    {
      initialData:
        !q && page === 1 && pageSize === 10 && !sortBy && !sortOrder
          ? initialData
          : undefined,
    }
  );

  const handleRowClick = (product: Product) => {
    setSelectedProduct(product);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setSelectedProduct(undefined);
    }
  };

  const handleSearch = useCallback(
    (query: string) => {
      setQ(query || null);
      setPage(1);
    },
    [setQ, setPage]
  );

  const handleSetParams = useCallback(
    (params: {
      page?: number;
      pageSize?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => {
      if (params.page !== undefined) setPage(params.page);
      if (params.pageSize !== undefined) setPageSize(Number(params.pageSize));
      if (params.sortBy !== undefined) setSortBy(params.sortBy || null);
      if (params.sortOrder !== undefined)
        setSortOrder(params.sortOrder || null);
    },
    [setPage, setPageSize, setSortBy, setSortOrder]
  );

  const handleResetParams = useCallback(() => {
    setQ(null);
    setPage(null);
    setPageSize(null);
    setSortBy(null);
    setSortOrder(null);
  }, [setQ, setPage, setPageSize, setSortBy, setSortOrder]);

  const showLoadingOverlay = isFetching && !isLoading;

  return (
    <div className="relative">
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
        data={data?.data}
        count={data?.count}
        namespace="product-data-table"
        columnGenerator={productColumns}
        pageIndex={page - 1}
        pageSize={pageSize}
        onSearch={handleSearch}
        setParams={handleSetParams}
        resetParams={handleResetParams}
        onRowClick={handleRowClick}
        enableServerSideSorting={true}
        currentSortBy={sortBy || undefined}
        currentSortOrder={(sortOrder as 'asc' | 'desc') || undefined}
        extraData={{
          canUpdateInventory,
          canDeleteInventory,
        }}
        defaultVisibility={{
          id: false,
          manufacturer: false,
          usage: false,
          created_at: false,
        }}
        onRefresh={() => {
          queryClient.invalidateQueries({
            queryKey: ['workspace-products', wsId],
          });
        }}
      />

      <ProductQuickDialog
        product={selectedProduct}
        isOpen={isDialogOpen}
        onOpenChange={handleDialogClose}
        wsId={wsId}
        categories={categories}
        warehouses={warehouses}
        units={units}
        canUpdateInventory={canUpdateInventory}
        canDeleteInventory={canDeleteInventory}
      />
    </div>
  );
}
