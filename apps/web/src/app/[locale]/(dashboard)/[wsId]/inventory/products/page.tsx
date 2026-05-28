import { Plus } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  InventoryProduct,
  ProductStockChange,
  RawInventoryProductWithChanges,
} from '@tuturuuu/types/primitives/InventoryProductRelations';
import type { Product } from '@tuturuuu/types/primitives/Product';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getInventoryCatalogProducts } from '@/lib/inventory/product-rpc';
import { getWorkspaceConfig } from '@/lib/workspace-helper';
import { ProductsPageClient } from './products-page-client';

export const metadata: Metadata = {
  title: 'Products',
  description:
    'Manage Products in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    categoryId?: string;
    manufacturerId?: string;
    q: string;
    page: string;
    pageSize: string;
    status?: 'active' | 'archived' | 'all';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }>;
}

export default async function WorkspaceProductsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

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
        const canDeleteInventory = containsPermission('delete_inventory');
        const canViewStockQuantity = containsPermission('view_stock_quantity');
        const canUpdateStockQuantity = containsPermission(
          'update_stock_quantity'
        );
        const currency =
          (await getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY')) || 'USD';

        const resolvedSearchParams = await searchParams;
        const initialData = await getInitialData(wsId, resolvedSearchParams, {
          canViewStockQuantity,
        });

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-products.plural')}
              singularTitle={t('ws-inventory-products.singular')}
              description={t('ws-inventory-products.description')}
              createTitle={t('ws-inventory-products.create')}
              createDescription={t('ws-inventory-products.create_description')}
              action={
                canCreateInventory ? (
                  <Link href={`/${wsId}/inventory/products/new`}>
                    <Button className="cursor-pointer">
                      <Plus className="mr-2 h-4 w-4" />
                      <span>{t('ws-inventory-products.create')}</span>
                    </Button>
                  </Link>
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <ProductsPageClient
              initialData={initialData}
              wsId={wsId}
              canUpdateInventory={canUpdateInventory}
              canDeleteInventory={canDeleteInventory}
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

async function getInitialData(
  wsId: string,
  {
    categoryId,
    manufacturerId,
    q,
    page = '1',
    pageSize = '10',
    status = 'active',
    sortBy,
    sortOrder,
  }: {
    categoryId?: string;
    manufacturerId?: string;
    q?: string;
    page?: string;
    pageSize?: string;
    status?: 'active' | 'archived' | 'all';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
  {
    canViewStockQuantity,
  }: {
    canViewStockQuantity: boolean;
  }
) {
  const supabase = await createAdminClient();

  const parsedPage = parseInt(page || '1', 10);
  const parsedSize = parseInt(pageSize || '10', 10);
  const start = (parsedPage - 1) * parsedSize;

  const { data: rawData, count } = await getInventoryCatalogProducts({
    categoryId,
    includeStock: canViewStockQuantity,
    limit: parsedSize,
    manufacturerId,
    offset: start,
    sbAdmin: supabase,
    search: q,
    sortBy,
    sortOrder,
    status,
    wsId,
  });

  const data = (rawData || []).map((item: RawInventoryProductWithChanges) => {
    const product = item as RawInventoryProductWithChanges & {
      archived?: boolean;
    };

    return {
      archived: product.archived ?? false,
      id: item.id,
      name: item.name,
      manufacturer_id: item.manufacturer_id,
      manufacturer: item.inventory_manufacturers?.name ?? null,
      description: item.description,
      usage: item.usage,
      unit: canViewStockQuantity
        ? item.inventory_products?.[0]?.inventory_units?.name
        : null,
      stock: canViewStockQuantity
        ? (item.inventory_products || []).map(
            (inventory: InventoryProduct) => ({
              amount: inventory.amount,
              min_amount: inventory.min_amount,
              unit: inventory.inventory_units?.name,
              warehouse: inventory.inventory_warehouses?.name,
              price: inventory.price,
            })
          )
        : [],
      // Inventory with ids for editing
      inventory: canViewStockQuantity
        ? (item.inventory_products || []).map(
            (inventory: InventoryProduct) => ({
              unit_id: inventory.unit_id,
              warehouse_id: inventory.warehouse_id,
              amount: inventory.amount,
              min_amount: inventory.min_amount,
              price: inventory.price,
            })
          )
        : [],
      min_amount: canViewStockQuantity
        ? item.inventory_products?.[0]?.min_amount || 0
        : 0,
      warehouse: canViewStockQuantity
        ? item.inventory_products?.[0]?.inventory_warehouses?.name
        : null,
      category: item.product_categories?.name,
      category_id: item.category_id,
      ws_id: item.ws_id,
      created_at: item.created_at,
      stock_changes: canViewStockQuantity
        ? item.product_stock_changes?.map((change: ProductStockChange) => ({
            amount: change.amount,
            creator: change.creator,
            beneficiary: change.beneficiary,
            created_at: change.created_at,
          })) || []
        : [],
    };
  });

  return { data, count } as { data: Product[]; count: number };
}
