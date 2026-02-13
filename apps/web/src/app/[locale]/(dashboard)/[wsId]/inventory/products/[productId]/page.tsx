import { createClient } from '@tuturuuu/supabase/next/server';
import type { RawInventoryProduct } from '@tuturuuu/types/primitives/InventoryProductRelations';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { ProductForm } from './form';
import { notFound } from 'next/navigation';

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

        const data =
          productId === 'new'
            ? undefined
            : await getData(wsId, productId, {
                canViewStockQuantity,
              });
        const categories = await getCategories(wsId);
        const warehouses = await getWarehouses(wsId);
        const units = await getUnits(wsId);

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
              categories={categories}
              warehouses={warehouses}
              units={units}
              canCreateInventory={canCreateInventory}
              canUpdateInventory={canUpdateInventory}
              canViewStockQuantity={canViewStockQuantity}
              canUpdateStockQuantity={canUpdateStockQuantity}
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
  const supabase = await createClient();

  let rawProduct: RawInventoryProduct | null = null;

  if (canViewStockQuantity) {
    const { data, error } = await supabase
      .from('workspace_products')
      .select('*, inventory_products(*)')
      .eq('ws_id', wsId)
      .eq('id', productId)
      .single()
      .returns<RawInventoryProduct>();

    if (error) throw error;
    rawProduct = data;
  } else {
    const { data, error } = await supabase
      .from('workspace_products')
      .select('*')
      .eq('ws_id', wsId)
      .eq('id', productId)
      .single()
      .returns<RawInventoryProduct>();

    if (error) throw error;
    rawProduct = data;
  }

  if (!rawProduct) return undefined;

  return {
    id: rawProduct.id,
    name: rawProduct.name ?? '',
    manufacturer: rawProduct.manufacturer ?? undefined,
    description: rawProduct.description ?? undefined,
    usage: rawProduct.usage ?? undefined,
    category_id: rawProduct.category_id ?? '',
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

async function getCategories(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('product_categories')
    .select('*')
    .eq('ws_id', wsId);

  const { data, error } = await queryBuilder;
  if (error) throw error;

  return data as ProductCategory[];
}

async function getWarehouses(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('inventory_warehouses')
    .select('*')
    .eq('ws_id', wsId);

  const { data, error } = await queryBuilder;
  if (error) throw error;

  return data as ProductWarehouse[];
}

async function getUnits(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('inventory_units')
    .select('*')
    .eq('ws_id', wsId);

  const { data, error } = await queryBuilder;
  if (error) throw error;

  return data as ProductUnit[];
}
