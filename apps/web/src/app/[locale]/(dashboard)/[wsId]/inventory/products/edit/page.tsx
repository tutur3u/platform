import { ProductForm } from './form';
import { Product2 } from '@/types/primitives/Product';
import { ProductCategory } from '@/types/primitives/ProductCategory';
import { ProductInventory } from '@/types/primitives/ProductInventory';
import { ProductUnit } from '@/types/primitives/ProductUnit';
import { ProductWarehouse } from '@/types/primitives/ProductWarehouse';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    id?: string;
    create?: string;
  }>;
}

export default async function WorkspaceProductsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;
  const { id, create } = await searchParams;

  if (!id && create !== '') {
    // only accepts:
    // 1. /edit?create (create new product)
    // 2. /edit?id={:id} (edit existing product)
    // else, redirect to products list. on both, prioritize editing (id > create)
    redirect('../products');
  }

  const data = await getData(wsId, id);
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

async function getData(wsId: string, id?: string) {
  if (!id) return undefined;

  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_products')
    .select('*, inventory:inventory_products(*)')
    .eq('ws_id', wsId)
    .eq('id', id)
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
