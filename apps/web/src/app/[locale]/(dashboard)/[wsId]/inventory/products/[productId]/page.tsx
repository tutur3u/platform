import { ProductForm } from './form';
import { createClient } from '@tutur3u/supabase/next/server';
import { Product2 } from '@repo/types/primitives/Product';
import { ProductCategory } from '@repo/types/primitives/ProductCategory';
import { ProductInventory } from '@repo/types/primitives/ProductInventory';
import { ProductUnit } from '@repo/types/primitives/ProductUnit';
import { ProductWarehouse } from '@repo/types/primitives/ProductWarehouse';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

export default async function WorkspaceProductsPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId, productId } = await params;

  const data = productId === 'new' ? undefined : await getData(wsId, productId);
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
      />
    </>
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
