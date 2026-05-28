import { createAdminClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  getInventoryCatalogProducts,
  getInventoryProductFormOptions,
} from '@/lib/inventory/product-rpc';
import { getWorkspaceConfig } from '@/lib/workspace-helper';
import { ProductForm } from './form';

export const metadata: Metadata = {
  title: 'Product Details',
  description:
    'Manage Product Details in the Products area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

export default async function WorkspaceProductsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const { productId } = await params;

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;

        if (!containsPermission('view_inventory')) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_products_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = containsPermission('create_inventory');
        const canUpdateInventory = containsPermission('update_inventory');
        const canViewStockQuantity = containsPermission('view_stock_quantity');
        const canUpdateStockQuantity = containsPermission(
          'update_stock_quantity'
        );
        const [currencyConfig, data, options] = await Promise.all([
          getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
          productId === 'new'
            ? Promise.resolve(undefined)
            : getData(wsId, productId, {
                canViewStockQuantity,
              }),
          getProductFormOptions(wsId),
        ]);
        const currency = currencyConfig || 'USD';

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-products.plural')}
              singularTitle={t('ws-inventory-products.singular')}
              description={t('ws-inventory-products.description')}
              createTitle={t('ws-inventory-products.create')}
              createDescription={t('ws-inventory-products.create_description')}
            />
            <Separator className="my-4" />
            <ProductForm
              wsId={wsId}
              data={data}
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
              currency={currency}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData(
  wsId: string,
  productId: string,
  {
    canViewStockQuantity,
  }: {
    canViewStockQuantity: boolean;
  }
) {
  const supabase = await createAdminClient();
  const { data } = await getInventoryCatalogProducts({
    includeStock: canViewStockQuantity,
    limit: 1,
    productId,
    sbAdmin: supabase,
    status: 'all',
    wsId,
  });
  const rawProduct = data[0] ?? null;

  if (!rawProduct) return undefined;

  return {
    id: rawProduct.id,
    name: rawProduct.name ?? '',
    manufacturer_id: rawProduct.manufacturer_id ?? undefined,
    description: rawProduct.description ?? undefined,
    usage: rawProduct.usage ?? undefined,
    category_id: rawProduct.category_id ?? '',
    owner_id: rawProduct.owner_id,
    finance_category_id: rawProduct.finance_category_id ?? undefined,
    inventory: canViewStockQuantity
      ? (rawProduct.inventory_products || []).map((inv) => ({
          unit_id: inv.unit_id,
          warehouse_id: inv.warehouse_id,
          amount: inv.amount,
          min_amount: inv.min_amount,
          price: inv.price,
        }))
      : [],
  };
}

async function getProductFormOptions(wsId: string) {
  const supabase = await createAdminClient();
  return getInventoryProductFormOptions({ sbAdmin: supabase, wsId });
}
