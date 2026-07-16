import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type SquareCatalogSyncDirection,
  squareAmountToInventoryPrice,
} from './catalog-sync-contract';
import { getPrivateAdmin, type SupabaseErrorLike } from './settings-store';
import type { SquareCatalogObject, SquareEnvironment } from './types';

export type SquareCatalogLinkRow = {
  environment: SquareEnvironment;
  last_error: string | null;
  last_synced_at: string | null;
  local_hash: string | null;
  product_id: string;
  square_hash: string | null;
  square_item_id: string;
  square_item_name: string | null;
  square_item_version: number | null;
  square_sku: string | null;
  square_variation_id: string;
  square_variation_name: string | null;
  square_variation_version: number | null;
  status: 'active' | 'conflict' | 'error' | 'remote_deleted';
  sync_origin: 'square' | 'tuturuuu';
  unit_id: string;
  warehouse_id: string;
  ws_id: string;
};

export type LocalProductRow = {
  archived: boolean | null;
  description: string | null;
  id: string;
  name: string;
};

export type LocalStockRow = {
  amount: number | null;
  price: number;
  product_id: string;
  unit_id: string;
  warehouse_id: string;
};

export type LocalUnitRow = { id: string; name: string };
export type LocalWarehouseRow = { id: string; name: string };

export async function loadLinks(wsId: string, environment: SquareEnvironment) {
  const privateAdmin = await getPrivateAdmin();
  const { data, error } = (await privateAdmin
    .from('inventory_square_catalog_links' as never)
    .select(
      'ws_id, environment, product_id, unit_id, warehouse_id, square_item_id, square_variation_id, square_item_version, square_variation_version, square_item_name, square_variation_name, square_sku, local_hash, square_hash, status, sync_origin, last_error, last_synced_at'
    )
    .eq('ws_id', wsId)
    .eq('environment', environment)) as {
    data: SquareCatalogLinkRow[] | null;
    error: SupabaseErrorLike;
  };
  if (error) throw new Error(error.message ?? 'Failed to load Square links');
  return data ?? [];
}

export async function upsertLink(
  value: Omit<SquareCatalogLinkRow, 'last_error' | 'last_synced_at'> & {
    last_error?: string | null;
  }
) {
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_catalog_links' as never)
    .upsert(
      {
        ...value,
        last_error: value.last_error ?? null,
        last_synced_at: new Date().toISOString(),
      } as never,
      { onConflict: 'ws_id,environment,square_variation_id' }
    )) as { error: SupabaseErrorLike };
  if (error) throw new Error(error.message ?? 'Failed to save Square link');
}

export async function updateLinksForRemoteDeletion({
  environment,
  squareItemId,
  squareVariationId,
  wsId,
}: {
  environment: SquareEnvironment;
  squareItemId: string;
  squareVariationId?: string;
  wsId: string;
}) {
  const privateAdmin = await getPrivateAdmin();
  let query = privateAdmin
    .from('inventory_square_catalog_links' as never)
    .update({
      last_error:
        'Square reports this catalog object as deleted; local data was preserved.',
      last_synced_at: new Date().toISOString(),
      status: 'remote_deleted',
    } as never)
    .eq('ws_id', wsId)
    .eq('environment', environment)
    .eq('square_item_id', squareItemId);
  if (squareVariationId) {
    query = query.eq('square_variation_id', squareVariationId);
  }
  const { error } = (await query) as { error: SupabaseErrorLike };
  if (error) {
    throw new Error(error.message ?? 'Failed to preserve deleted Square link');
  }
}

export async function markSyncState({
  direction,
  environment,
  errorMessage,
  latestTime,
  status,
  summary,
  userId,
  wsId,
}: {
  direction: SquareCatalogSyncDirection;
  environment: SquareEnvironment;
  errorMessage?: string | null;
  latestTime?: string | null;
  status: 'error' | 'partial' | 'running' | 'success';
  summary: unknown;
  userId?: string | null;
  wsId: string;
}) {
  const privateAdmin = await getPrivateAdmin();
  const now = new Date().toISOString();
  const { error } = (await privateAdmin
    .from('inventory_square_sync_state' as never)
    .upsert(
      {
        environment,
        last_catalog_cursor_at: latestTime ?? undefined,
        last_direction: direction,
        last_error: errorMessage ?? null,
        last_inventory_sync_at: now,
        last_status: status,
        last_summary: summary,
        updated_at: now,
        updated_by: userId ?? null,
        ws_id: wsId,
      } as never,
      { onConflict: 'ws_id,environment' }
    )) as { error: SupabaseErrorLike };
  if (error) {
    throw new Error(error.message ?? 'Failed to save Square sync state');
  }
}

export async function findOrCreateImportCategory(wsId: string) {
  const sbAdmin = await createAdminClient();
  const { data: existing, error: findError } = await sbAdmin
    .from('product_categories')
    .select('id')
    .eq('ws_id', wsId)
    .eq('name', 'Square')
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing?.id) return existing.id;
  const { data, error } = await sbAdmin
    .from('product_categories')
    .insert({ name: 'Square', ws_id: wsId })
    .select('id')
    .single();
  if (error || !data?.id) {
    throw error ?? new Error('Failed to create Square category');
  }
  return data.id;
}

export async function findOrCreatePrivateNamedRow({
  name,
  table,
  wsId,
}: {
  name: string;
  table: 'inventory_owners' | 'inventory_units' | 'inventory_warehouses';
  wsId: string;
}) {
  const privateAdmin = await getPrivateAdmin();
  const { data: existing, error: findError } = (await privateAdmin
    .from(table as never)
    .select('id')
    .eq('ws_id', wsId)
    .eq('name', name)
    .limit(1)
    .maybeSingle()) as {
    data: { id: string } | null;
    error: SupabaseErrorLike;
  };
  if (findError) {
    throw new Error(findError.message ?? `Failed to find ${table}`);
  }
  if (existing?.id) return existing.id;
  const { data, error } = (await privateAdmin
    .from(table as never)
    .insert({ name, ws_id: wsId } as never)
    .select('id')
    .single()) as {
    data: { id: string } | null;
    error: SupabaseErrorLike;
  };
  if (error || !data?.id) {
    throw new Error(error?.message ?? `Failed to create ${table}`);
  }
  return data.id;
}

export async function loadLocalSnapshot(link: SquareCatalogLinkRow) {
  const sbAdmin = await createAdminClient();
  const privateAdmin = sbAdmin.schema('private');
  const [productResult, stockResult, unitResult] = await Promise.all([
    sbAdmin
      .from('workspace_products')
      .select('id, name, description, archived')
      .eq('id', link.product_id)
      .eq('ws_id', link.ws_id)
      .maybeSingle(),
    privateAdmin
      .from('inventory_products')
      .select('product_id, unit_id, warehouse_id, amount, price')
      .eq('product_id', link.product_id)
      .eq('unit_id', link.unit_id)
      .eq('warehouse_id', link.warehouse_id)
      .maybeSingle(),
    privateAdmin
      .from('inventory_units')
      .select('id, name')
      .eq('id', link.unit_id)
      .maybeSingle(),
  ]);
  if (productResult.error) throw productResult.error;
  if (stockResult.error) throw stockResult.error;
  if (unitResult.error) throw unitResult.error;
  if (!productResult.data || !stockResult.data || !unitResult.data) return null;
  return {
    product: productResult.data as LocalProductRow,
    stock: stockResult.data as LocalStockRow,
    unit: unitResult.data as LocalUnitRow,
  };
}

export async function applySquareVariationToLocal({
  amount,
  categoryId,
  currency,
  item,
  link,
  ownerId,
  productId: requestedProductId,
  unitId,
  variation,
  warehouseId,
  wsId,
}: {
  amount: number | null;
  categoryId: string;
  currency: string;
  item: SquareCatalogObject;
  link?: SquareCatalogLinkRow;
  ownerId: string;
  productId?: string;
  unitId: string;
  variation: SquareCatalogObject;
  warehouseId: string;
  wsId: string;
}): Promise<string> {
  const sbAdmin = await createAdminClient();
  const privateAdmin = sbAdmin.schema('private');
  let productId = link?.product_id ?? requestedProductId;
  if (!productId) {
    const { data, error } = await sbAdmin
      .from('workspace_products')
      .insert({
        category_id: categoryId,
        description: item.item_data?.description ?? null,
        name: item.item_data?.name || 'Square item',
        owner_id: ownerId,
        ws_id: wsId,
      })
      .select('id')
      .single();
    if (error || !data?.id) {
      throw error ?? new Error('Failed to import product');
    }
    productId = data.id;
  } else {
    const { error } = await sbAdmin
      .from('workspace_products')
      .update({
        description: item.item_data?.description ?? null,
        name: item.item_data?.name || 'Square item',
      })
      .eq('id', productId)
      .eq('ws_id', wsId);
    if (error) throw error;
  }

  const { error } = await privateAdmin.from('inventory_products').upsert(
    {
      amount,
      min_amount: 0,
      price: squareAmountToInventoryPrice(
        variation.item_variation_data?.price_money?.amount ?? 0,
        currency
      ),
      product_id: productId,
      unit_id: unitId,
      warehouse_id: warehouseId,
    },
    { onConflict: 'product_id,unit_id,warehouse_id' }
  );
  if (error) throw error;
  return productId;
}

export async function loadLocalCatalog(wsId: string) {
  const sbAdmin = await createAdminClient();
  const privateAdmin = sbAdmin.schema('private');
  const { data: products, error: productError } = await sbAdmin
    .from('workspace_products')
    .select('id, name, description, archived')
    .eq('ws_id', wsId)
    .or('archived.is.null,archived.eq.false');
  if (productError) throw productError;
  const productIds = (products ?? []).map((product) => product.id);
  if (productIds.length === 0) {
    return {
      products: [] as LocalProductRow[],
      stocks: [] as LocalStockRow[],
      units: [] as LocalUnitRow[],
      warehouses: [] as LocalWarehouseRow[],
    };
  }
  const [stockResult, unitResult, warehouseResult] = await Promise.all([
    privateAdmin
      .from('inventory_products')
      .select('product_id, unit_id, warehouse_id, amount, price')
      .in('product_id', productIds),
    privateAdmin.from('inventory_units').select('id, name').eq('ws_id', wsId),
    privateAdmin
      .from('inventory_warehouses')
      .select('id, name')
      .eq('ws_id', wsId),
  ]);
  if (stockResult.error) throw stockResult.error;
  if (unitResult.error) throw unitResult.error;
  if (warehouseResult.error) throw warehouseResult.error;
  return {
    products: (products ?? []) as LocalProductRow[],
    stocks: (stockResult.data ?? []) as LocalStockRow[],
    units: (unitResult.data ?? []) as LocalUnitRow[],
    warehouses: (warehouseResult.data ?? []) as LocalWarehouseRow[],
  };
}
