'use client';

import type { Product } from '@tuturuuu/types/primitives/Product';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import { useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { productColumns } from './columns';
import { ProductQuickDialog } from './quick-dialog';

interface Props {
  data: Product[];
  count: number;
  categories: ProductCategory[];
  warehouses: ProductWarehouse[];
  units: ProductUnit[];
  wsId: string;
  canCreateInventory: boolean;
  canUpdateInventory: boolean;
  canDeleteInventory: boolean;
}

export function ProductsPageClient({
  data,
  count,
  categories,
  warehouses,
  units,
  wsId,
  canUpdateInventory,
  canDeleteInventory,
}: Props) {
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  return (
    <>
      <CustomDataTable
        data={data}
        columnGenerator={productColumns}
        namespace="product-data-table"
        count={count}
        onRowClick={handleRowClick}
        enableServerSideSorting={true}
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
    </>
  );
}
