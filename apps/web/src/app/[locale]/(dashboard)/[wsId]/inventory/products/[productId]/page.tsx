import { createClient } from '@tuturuuu/supabase/next/server';
import type { Product2 } from '@tuturuuu/types/primitives/Product';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductInventory } from '@tuturuuu/types/primitives/ProductInventory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
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

        const { permissions } = await getPermissions({
          wsId,
        });

        if (!permissions.includes('view_inventory')) {
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

        const canCreateInventory = permissions.includes('create_inventory');
        const canUpdateInventory = permissions.includes('update_inventory');

        const data =
          productId === 'new' ? undefined : await getData(wsId, productId);
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
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData(wsId: string, productId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_products')
    .select('*, inventory:inventory_products(*)')
    .eq('ws_id', wsId)
    .eq('id', productId)
    .single();

  const { data, error } = await queryBuilder;
  if (error) throw error;

  return data as Product2 & { inventory: ProductInventory[] };
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
