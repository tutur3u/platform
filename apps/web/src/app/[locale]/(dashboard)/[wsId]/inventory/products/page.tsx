import { Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
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
    q: string;
    page: string;
    pageSize: string;
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
    q,
    page = '1',
    pageSize = '10',
    sortBy,
    sortOrder,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
  {
    canViewStockQuantity,
  }: {
    canViewStockQuantity: boolean;
  }
) {
  const supabase = await createClient();

  const parsedPage = parseInt(page || '1', 10);
  const parsedSize = parseInt(pageSize || '10', 10);
  const start = (parsedPage - 1) * parsedSize;
  const end = parsedPage * parsedSize - 1;

  let rawData: RawInventoryProductWithChanges[] | null = null;
  let count: number | null = null;

  if (canViewStockQuantity) {
    let query = supabase
      .from('workspace_products')
      .select(
        '*, product_categories(name), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, unit_id, warehouse_id, inventory_warehouses!inventory_products_warehouse_id_fkey(name), inventory_units!inventory_products_unit_id_fkey(name)), product_stock_changes!product_stock_changes_product_id_fkey(amount, created_at, beneficiary:workspace_users!product_stock_changes_beneficiary_id_fkey(full_name, email), creator:workspace_users!product_stock_changes_creator_id_fkey(full_name, email))',
        {
          count: 'exact',
        }
      )
      .eq('ws_id', wsId);

    if (q) query = query.ilike('name', `%${q}%`);
    query = query.range(start, end).limit(parsedSize);

    if (sortBy && sortOrder) {
      query = query.order(sortBy as keyof RawInventoryProductWithChanges, {
        ascending: sortOrder === 'asc',
      });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const {
      data,
      error,
      count: fetchedCount,
    } = await query.overrideTypes<RawInventoryProductWithChanges[]>();
    if (error) throw error;
    rawData = data;
    count = fetchedCount;
  } else {
    let query = supabase
      .from('workspace_products')
      .select('*, product_categories(name)', {
        count: 'exact',
      })
      .eq('ws_id', wsId);

    if (q) query = query.ilike('name', `%${q}%`);
    query = query.range(start, end).limit(parsedSize);

    if (sortBy && sortOrder) {
      query = query.order(sortBy as keyof RawInventoryProductWithChanges, {
        ascending: sortOrder === 'asc',
      });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const {
      data,
      error,
      count: fetchedCount,
    } = await query.overrideTypes<RawInventoryProductWithChanges[]>();
    if (error) throw error;
    rawData = data;
    count = fetchedCount;
  }

  const data = (rawData || []).map((item: RawInventoryProductWithChanges) => ({
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    description: item.description,
    usage: item.usage,
    unit: canViewStockQuantity
      ? item.inventory_products?.[0]?.inventory_units?.name
      : null,
    stock: canViewStockQuantity
      ? (item.inventory_products || []).map((inventory: InventoryProduct) => ({
          amount: inventory.amount,
          min_amount: inventory.min_amount,
          unit: inventory.inventory_units?.name,
          warehouse: inventory.inventory_warehouses?.name,
          price: inventory.price,
        }))
      : [],
    // Inventory with ids for editing
    inventory: canViewStockQuantity
      ? (item.inventory_products || []).map((inventory: InventoryProduct) => ({
          unit_id: inventory.unit_id,
          warehouse_id: inventory.warehouse_id,
          amount: inventory.amount,
          min_amount: inventory.min_amount,
          price: inventory.price,
        }))
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
  }));

  return { data, count } as { data: Product[]; count: number };
}
