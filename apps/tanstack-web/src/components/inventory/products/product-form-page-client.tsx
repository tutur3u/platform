'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
import { useTranslations } from 'next-intl';
import { ProductForm } from './form';
import {
  useInventoryProductFormOptions,
  useWorkspaceCurrency,
  useWorkspaceProduct,
} from './hooks';

type ProductFormPageClientProps = {
  canCreateInventory: boolean;
  canUpdateInventory: boolean;
  canUpdateStockQuantity: boolean;
  canViewStockQuantity: boolean;
  productId: string;
  wsId: string;
};

function toProductFormData(product?: Product) {
  if (!product) return undefined;

  return {
    id: product.id,
    name: product.name ?? '',
    manufacturer_id: product.manufacturer_id ?? undefined,
    description: product.description ?? undefined,
    usage: product.usage ?? undefined,
    category_id: product.category_id ?? '',
    owner_id: product.owner_id ?? '',
    finance_category_id: product.finance_category_id ?? undefined,
    inventory: (product.inventory ?? []).map((item) => ({
      unit_id: item.unit_id,
      warehouse_id: item.warehouse_id,
      amount: item.amount,
      min_amount: item.min_amount,
      price: item.price,
    })),
  };
}

export function ProductFormPageClient({
  canCreateInventory,
  canUpdateInventory,
  canUpdateStockQuantity,
  canViewStockQuantity,
  productId,
  wsId,
}: ProductFormPageClientProps) {
  const t = useTranslations();
  const isNewProduct = productId === 'new';
  const productQuery = useWorkspaceProduct(wsId, productId, {
    enabled: !isNewProduct,
  });
  const optionsQuery = useInventoryProductFormOptions(wsId);
  const currencyQuery = useWorkspaceCurrency(wsId);

  if (
    optionsQuery.isLoading ||
    currencyQuery.isLoading ||
    (!isNewProduct && productQuery.isLoading)
  ) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-border bg-foreground/5 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('common.loading')}...
      </div>
    );
  }

  if (
    optionsQuery.isError ||
    currencyQuery.isError ||
    (!isNewProduct && productQuery.isError)
  ) {
    return (
      <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
        {t('common.error')}
      </div>
    );
  }

  const options = optionsQuery.data;

  if (!options) {
    return null;
  }

  return (
    <ProductForm
      wsId={wsId}
      data={isNewProduct ? undefined : toProductFormData(productQuery.data)}
      categories={options.categories}
      manufacturers={options.manufacturers}
      owners={options.owners}
      financeCategories={options.financeCategories}
      warehouses={options.warehouses}
      units={options.units}
      canCreateInventory={canCreateInventory}
      canUpdateInventory={canUpdateInventory}
      canViewStockQuantity={canViewStockQuantity}
      canUpdateStockQuantity={canUpdateStockQuantity}
      currency={currencyQuery.data || 'USD'}
    />
  );
}
