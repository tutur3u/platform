'use client';

import { PackageSearch, Plus, Tags } from '@tuturuuu/icons';
import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { InventoryCatalogTab } from './operator-types';
import {
  ProductCategoriesPanel,
  ProductCategoryDialog,
} from './product-categories-panel';
import { ProductCreateForm } from './product-management';
import { ProductsTable } from './products-table';

type PaginationProps = {
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  totalCount: number;
};

export function CatalogWorkspacePanel({
  categories,
  categoryPagination,
  costingProfiles,
  formOptions,
  onTabChange,
  productPagination,
  products,
  tab,
  wsId,
}: {
  categories: ProductCategory[];
  categoryPagination: PaginationProps;
  costingProfiles: InventoryCostProfile[];
  formOptions?: InventoryProductFormOptionsResponse;
  onTabChange: (tab: InventoryCatalogTab) => void;
  productPagination: PaginationProps;
  products: InventoryProductSummary[];
  tab: InventoryCatalogTab;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.catalogWorkspace');

  return (
    <Tabs
      className="grid min-w-0 gap-4"
      onValueChange={(value) => onTabChange(value as InventoryCatalogTab)}
      value={tab}
    >
      <div className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <TabsList className="grid h-auto w-full grid-cols-2 bg-muted/40 p-1 sm:w-fit sm:min-w-72">
          <TabsTrigger
            className="min-h-10 touch-manipulation gap-2 px-3 sm:min-h-9"
            value="products"
          >
            <PackageSearch className="h-4 w-4" />
            <span className="truncate">{t('tabs.products')}</span>
          </TabsTrigger>
          <TabsTrigger
            className="min-h-10 touch-manipulation gap-2 px-3 sm:min-h-9"
            value="categories"
          >
            <Tags className="h-4 w-4" />
            <span className="truncate">{t('tabs.categories')}</span>
          </TabsTrigger>
        </TabsList>
        {tab === 'products' ? (
          <ProductCreateForm
            options={formOptions}
            trigger={
              <Button
                className="min-h-10 w-full sm:min-h-9 sm:w-auto"
                type="button"
              >
                <PackageSearch className="h-4 w-4" />
                {t('newProduct')}
              </Button>
            }
            wsId={wsId}
          />
        ) : (
          <ProductCategoryDialog
            trigger={
              <Button
                className="min-h-10 w-full sm:min-h-9 sm:w-auto"
                type="button"
              >
                <Plus className="h-4 w-4" />
                {t('newCategory')}
              </Button>
            }
            wsId={wsId}
          />
        )}
      </div>
      <TabsContent className="mt-0" value="products">
        <ProductsTable
          costingProfiles={costingProfiles}
          formOptions={formOptions}
          pagination={productPagination}
          rows={products}
          view="catalog"
          wsId={wsId}
        />
      </TabsContent>
      <TabsContent className="mt-0" value="categories">
        <ProductCategoriesPanel
          pagination={categoryPagination}
          rows={categories}
          wsId={wsId}
        />
      </TabsContent>
    </Tabs>
  );
}
