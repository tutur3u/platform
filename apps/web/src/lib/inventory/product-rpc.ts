import 'server-only';

import type { InventoryManufacturer } from '@tuturuuu/internal-api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { InventoryOwner } from '@tuturuuu/types/primitives/InventoryOwner';
import type { RawInventoryProductWithChanges } from '@tuturuuu/types/primitives/InventoryProductRelations';
import type { ProductBatch } from '@tuturuuu/types/primitives/ProductBatch';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';

type InventoryCatalogStatus = 'active' | 'archived' | 'all';
type InventoryCatalogSortOrder = 'asc' | 'desc';

type InventoryCatalogRpcProduct = RawInventoryProductWithChanges & {
  archived?: boolean;
};

type InventoryCatalogRpcRow = {
  product: InventoryCatalogRpcProduct | null;
  total_count: number | null;
};

type LowStockProduct = {
  amount: number | null;
  category_name: string | null;
  min_amount: number | null;
  owner_name: string | null;
  price: number | null;
  product_id: string | null;
  product_name: string | null;
  unit_name: string | null;
  warehouse_name: string | null;
};

type InventoryBatchRpcRow = {
  batch: ProductBatch | null;
  total_count: number | null;
};

type InventoryProductFormOptions = {
  categories: ProductCategory[];
  financeCategories: TransactionCategory[];
  manufacturers: InventoryManufacturer[];
  owners: InventoryOwner[];
  units: ProductUnit[];
  warehouses: ProductWarehouse[];
};

type InventoryOverviewMetrics = {
  category_breakdown: Array<Record<string, unknown>>;
  inventory_sales_revenue: number;
  owner_breakdown: Array<Record<string, unknown>>;
  recent_sales: Array<Record<string, unknown>>;
  total_expense: number;
  total_income: number;
  wallets_count: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value?: string | null) {
  if (!value) return null;
  return UUID_PATTERN.test(value) ? value : null;
}

export async function getInventoryCatalogProducts({
  categoryId,
  includeStock = false,
  limit = 10,
  manufacturerId,
  offset = 0,
  productId,
  sbAdmin,
  search,
  sortBy = 'created_at',
  sortOrder = 'desc',
  status = 'active',
  wsId,
}: {
  categoryId?: string | null;
  includeStock?: boolean;
  limit?: number;
  manufacturerId?: string | null;
  offset?: number;
  productId?: string | null;
  sbAdmin: TypedSupabaseClient;
  search?: string | null;
  sortBy?: string | null;
  sortOrder?: InventoryCatalogSortOrder | null;
  status?: InventoryCatalogStatus;
  wsId: string;
}) {
  const normalizedProductId = normalizeUuid(productId);
  if (productId && !normalizedProductId) {
    return { count: 0, data: [] as InventoryCatalogRpcProduct[] };
  }

  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_inventory_catalog_products', {
      p_category_id: normalizeUuid(categoryId) ?? undefined,
      p_include_stock: includeStock,
      p_limit: limit,
      p_manufacturer_id: normalizeUuid(manufacturerId) ?? undefined,
      p_offset: offset,
      p_product_id: normalizedProductId ?? undefined,
      p_search: search?.trim() || undefined,
      p_sort_by: sortBy || 'created_at',
      p_sort_order: sortOrder || 'desc',
      p_status: status,
      p_ws_id: wsId,
    });

  if (error) throw error;

  const rows = (data ?? []) as InventoryCatalogRpcRow[];
  const products = rows
    .map((row) => row.product)
    .filter((product): product is InventoryCatalogRpcProduct =>
      Boolean(product)
    );

  return {
    count: Number(rows[0]?.total_count ?? 0),
    data: products,
  };
}

export async function getInventoryBatches({
  limit = 10,
  offset = 0,
  sbAdmin,
  search,
  wsId,
}: {
  limit?: number;
  offset?: number;
  sbAdmin: TypedSupabaseClient;
  search?: string | null;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_inventory_batches', {
      p_limit: limit,
      p_offset: offset,
      p_search: search?.trim() || undefined,
      p_ws_id: wsId,
    });

  if (error) throw error;

  const rows = (data ?? []) as InventoryBatchRpcRow[];
  const batches = rows
    .map((row) => row.batch)
    .filter((batch): batch is ProductBatch => Boolean(batch));

  return {
    count: Number(rows[0]?.total_count ?? 0),
    data: batches,
  };
}

export async function getInventoryLowStockProducts({
  sbAdmin,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_inventory_low_stock_products', {
      p_ws_id: wsId,
    });

  if (error) throw error;

  return ((data ?? []) as Array<{ product: LowStockProduct | null }>)
    .map((row) => row.product)
    .filter((product): product is LowStockProduct => Boolean(product));
}

export async function getInventoryOverviewMetrics({
  sbAdmin,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}): Promise<InventoryOverviewMetrics> {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_inventory_overview_metrics', {
      p_ws_id: wsId,
    });

  if (error) throw error;

  const metrics = (data ?? {}) as Partial<InventoryOverviewMetrics>;

  return {
    category_breakdown: metrics.category_breakdown ?? [],
    inventory_sales_revenue: Number(metrics.inventory_sales_revenue ?? 0),
    owner_breakdown: metrics.owner_breakdown ?? [],
    recent_sales: metrics.recent_sales ?? [],
    total_expense: Number(metrics.total_expense ?? 0),
    total_income: Number(metrics.total_income ?? 0),
    wallets_count: Number(metrics.wallets_count ?? 0),
  };
}

export async function getInventoryProductFormOptions({
  sbAdmin,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}): Promise<InventoryProductFormOptions> {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_inventory_product_form_options', {
      p_ws_id: wsId,
    });

  if (error) throw error;

  const options = (data ?? {}) as Partial<InventoryProductFormOptions>;

  return {
    categories: options.categories ?? [],
    financeCategories: options.financeCategories ?? [],
    manufacturers: options.manufacturers ?? [],
    owners: options.owners ?? [],
    units: options.units ?? [],
    warehouses: options.warehouses ?? [],
  };
}
