import 'server-only';

import type {
  InventoryCommerceSummary,
  InventorySaleSource,
  InventorySaleSummary,
  InventorySalesPeriod,
  InventorySalesPeriodProductScope,
} from '@tuturuuu/internal-api/inventory';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { summarizeInventorySales } from './commerce/summary';

type SalesPeriodRow = Omit<InventorySalesPeriod, 'product_ids' | 'sale_count'>;
type SalesPeriodAssignmentRow = {
  period_id: string;
  sale_id: string;
  sale_source: InventorySaleSource;
};
type SalesPeriodProductRow = { period_id: string; product_id: string };
type PeriodSalesRpcRow = {
  sale: InventorySaleSummary | null;
  total_count: number | null;
};

type InventorySaleReference = {
  id: string;
  source: InventorySaleSource;
};

const SALES_PERIOD_SELECT =
  'id, ws_id, name, description, starts_at, ends_at, status, product_scope, created_at, updated_at';

export class InventorySalesPeriodProductRuleError extends Error {
  constructor() {
    super('Sale does not match the sales period product rules');
    this.name = 'InventorySalesPeriodProductRuleError';
  }
}

function privateInventory(sbAdmin: TypedSupabaseClient) {
  return sbAdmin.schema('private');
}

function attachPeriodProducts(
  periods: SalesPeriodRow[],
  productRows: SalesPeriodProductRow[]
) {
  const productIdsByPeriod = new Map<string, string[]>();
  for (const row of productRows) {
    const ids = productIdsByPeriod.get(row.period_id) ?? [];
    ids.push(row.product_id);
    productIdsByPeriod.set(row.period_id, ids);
  }
  return periods.map((period) => ({
    ...period,
    product_ids: productIdsByPeriod.get(period.id) ?? [],
    product_scope: period.product_scope ?? ('all' as const),
  }));
}

async function getPeriodProducts({
  periodIds,
  sbAdmin,
  wsId,
}: {
  periodIds: string[];
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  if (periodIds.length === 0) return [];
  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_period_products' as never)
    .select('period_id, product_id')
    .eq('ws_id', wsId)
    .in('period_id', periodIds);
  if (error) throw error;
  return (data ?? []) as unknown as SalesPeriodProductRow[];
}

async function validatePeriodProducts({
  productIds,
  sbAdmin,
  wsId,
}: {
  productIds: string[];
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) return uniqueIds;
  const { data, error } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('ws_id', wsId)
    .in('id', uniqueIds);
  if (error) throw error;
  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error('One or more sales period products were not found');
  }
  return uniqueIds;
}

async function replacePeriodProducts({
  periodId,
  productIds,
  sbAdmin,
  wsId,
}: {
  periodId: string;
  productIds: string[];
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const uniqueIds = await validatePeriodProducts({ productIds, sbAdmin, wsId });
  const table = privateInventory(sbAdmin).from(
    'inventory_sales_period_products' as never
  );
  const { error: deleteError } = await table
    .delete()
    .eq('ws_id', wsId)
    .eq('period_id', periodId);
  if (deleteError) throw deleteError;
  if (uniqueIds.length === 0) return;

  const { error } = await table.insert(
    uniqueIds.map((productId) => ({
      period_id: periodId,
      product_id: productId,
      ws_id: wsId,
    })) as never
  );
  if (error) throw error;
}

async function getPeriodWithCount({
  periodId,
  sbAdmin,
  wsId,
}: {
  periodId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_periods' as never)
    .select(SALES_PERIOD_SELECT)
    .eq('id', periodId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [{ count, error: countError }, productRows] = await Promise.all([
    privateInventory(sbAdmin)
      .from('inventory_sales_period_assignments' as never)
      .select('sale_id', { count: 'exact', head: true })
      .eq('ws_id', wsId)
      .eq('period_id', periodId),
    getPeriodProducts({ periodIds: [periodId], sbAdmin, wsId }),
  ]);
  if (countError) throw countError;
  const [period] = attachPeriodProducts(
    [data as unknown as SalesPeriodRow],
    productRows
  );
  return period ? { ...period, sale_count: count ?? 0 } : null;
}

export async function listInventorySalesPeriods({
  includeArchived = false,
  sbAdmin,
  wsId,
}: {
  includeArchived?: boolean;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  let periodsQuery = privateInventory(sbAdmin)
    .from('inventory_sales_periods' as never)
    .select(SALES_PERIOD_SELECT)
    .eq('ws_id', wsId)
    .order('starts_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (!includeArchived) periodsQuery = periodsQuery.eq('status', 'active');

  const [{ data: periods, error: periodsError }, assignmentsResult] =
    await Promise.all([
      periodsQuery,
      privateInventory(sbAdmin)
        .from('inventory_sales_period_assignments' as never)
        .select('period_id')
        .eq('ws_id', wsId),
    ]);
  if (periodsError) throw periodsError;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const rows = (periods ?? []) as unknown as SalesPeriodRow[];
  const productRows = await getPeriodProducts({
    periodIds: rows.map((period) => period.id),
    sbAdmin,
    wsId,
  });
  const counts = new Map<string, number>();
  for (const assignment of (assignmentsResult.data ?? []) as Array<{
    period_id: string;
  }>) {
    counts.set(
      assignment.period_id,
      (counts.get(assignment.period_id) ?? 0) + 1
    );
  }
  return attachPeriodProducts(rows, productRows).map((period) => ({
    ...period,
    sale_count: counts.get(period.id) ?? 0,
  }));
}

export const getInventorySalesPeriod = getPeriodWithCount;

export async function createInventorySalesPeriod({
  actorId,
  payload,
  sbAdmin,
  wsId,
}: {
  actorId: string;
  payload: {
    description?: string | null;
    ends_at?: string | null;
    name: string;
    product_ids?: string[];
    product_scope?: InventorySalesPeriodProductScope;
    starts_at?: string | null;
  };
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { product_ids: productIds = [], ...periodPayload } = payload;
  await validatePeriodProducts({ productIds, sbAdmin, wsId });
  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_periods' as never)
    .insert({
      ...periodPayload,
      created_by: actorId,
      name: payload.name.trim(),
      ws_id: wsId,
    } as never)
    .select(SALES_PERIOD_SELECT)
    .single();
  if (error) throw error;

  const periodId = (data as unknown as SalesPeriodRow).id;
  await replacePeriodProducts({ periodId, productIds, sbAdmin, wsId });
  const period = await getPeriodWithCount({ periodId, sbAdmin, wsId });
  if (!period) throw new Error('Created sales period could not be loaded');
  return period;
}

export async function updateInventorySalesPeriod({
  payload,
  periodId,
  sbAdmin,
  wsId,
}: {
  payload: Partial<{
    description: string | null;
    ends_at: string | null;
    name: string;
    product_ids: string[];
    product_scope: InventorySalesPeriodProductScope;
    starts_at: string | null;
    status: 'active' | 'archived';
  }>;
  periodId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { product_ids: productIds, ...periodPayload } = payload;
  if (productIds !== undefined) {
    await validatePeriodProducts({ productIds, sbAdmin, wsId });
  }
  const nextPayload = {
    ...periodPayload,
    ...(periodPayload.name === undefined
      ? {}
      : { name: periodPayload.name.trim() }),
  };
  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_periods' as never)
    .update(nextPayload as never)
    .eq('id', periodId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (productIds !== undefined) {
    await replacePeriodProducts({ periodId, productIds, sbAdmin, wsId });
  } else if (periodPayload.product_scope === 'all') {
    await replacePeriodProducts({ periodId, productIds: [], sbAdmin, wsId });
  }
  return getPeriodWithCount({ periodId, sbAdmin, wsId });
}

export async function deleteInventorySalesPeriod({
  periodId,
  sbAdmin,
  wsId,
}: {
  periodId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { count, error: countError } = await privateInventory(sbAdmin)
    .from('inventory_sales_period_assignments' as never)
    .select('sale_id', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('period_id', periodId);
  if (countError) throw countError;
  if ((count ?? 0) > 0) return { deleted: false, reason: 'in_use' as const };

  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_periods' as never)
    .delete()
    .eq('id', periodId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return {
    deleted: Boolean(data),
    reason: data ? null : ('not_found' as const),
  };
}

export async function getSalesPeriodAssignments({
  sales,
  sbAdmin,
  wsId,
}: {
  sales: Array<{ id: string; source: InventorySaleSource }>;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  if (sales.length === 0) return new Map<string, InventorySalesPeriod>();
  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_period_assignments' as never)
    .select('period_id, sale_id, sale_source')
    .eq('ws_id', wsId)
    .in('sale_id', [...new Set(sales.map((sale) => sale.id))]);
  if (error) throw error;

  const assignments = (data ?? []) as unknown as SalesPeriodAssignmentRow[];
  const periodIds = [...new Set(assignments.map((row) => row.period_id))];
  if (periodIds.length === 0) return new Map<string, InventorySalesPeriod>();
  const periods = await Promise.all(
    periodIds.map((periodId) => getPeriodWithCount({ periodId, sbAdmin, wsId }))
  );
  const periodsById = new Map(
    periods
      .filter((period): period is InventorySalesPeriod => Boolean(period))
      .map((period) => [period.id, period])
  );
  return new Map(
    assignments.flatMap((assignment) => {
      const period = periodsById.get(assignment.period_id);
      return period
        ? [[`${assignment.sale_source}:${assignment.sale_id}`, period] as const]
        : [];
    })
  );
}

async function getSaleProductIds({
  saleId,
  saleSource,
  sbAdmin,
}: {
  saleId: string;
  saleSource: InventorySaleSource;
  sbAdmin: TypedSupabaseClient;
}) {
  const query =
    saleSource === 'finance_invoice'
      ? sbAdmin
          .from('finance_invoice_products')
          .select('product_id')
          .eq('invoice_id', saleId)
      : privateInventory(sbAdmin)
          .from('inventory_checkout_lines')
          .select('product_id')
          .eq('checkout_session_id', saleId);
  const { data, error } = await query;
  if (error) throw error;
  return [
    ...new Set((data ?? []).map((row) => row.product_id).filter(Boolean)),
  ] as string[];
}

async function validateSalesExist({
  sales,
  sbAdmin,
  wsId,
}: {
  sales: InventorySaleReference[];
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const uniqueSales = [
    ...new Map(
      sales.map((sale) => [`${sale.source}:${sale.id}`, sale])
    ).values(),
  ];
  const sources = ['finance_invoice', 'checkout_session'] as const;
  const results = await Promise.all(
    sources.map(async (source) => {
      const ids = uniqueSales
        .filter((sale) => sale.source === source)
        .map((sale) => sale.id);
      if (ids.length === 0) return [];
      const query =
        source === 'finance_invoice'
          ? sbAdmin.from('finance_invoices')
          : privateInventory(sbAdmin).from('inventory_checkout_sessions');
      const { data, error } = await query
        .select('id')
        .eq('ws_id', wsId)
        .in('id', ids);
      if (error) throw error;
      return (data ?? []).map((row) => `${source}:${row.id}`);
    })
  );
  const found = new Set(results.flat());
  if (found.size !== uniqueSales.length) {
    throw new Error('One or more inventory sales were not found');
  }
  return uniqueSales;
}

async function validatePeriodEligibility({
  period,
  sales,
  sbAdmin,
}: {
  period: InventorySalesPeriod;
  sales: InventorySaleReference[];
  sbAdmin: TypedSupabaseClient;
}) {
  if (period.product_scope === 'all') return;
  const periodProductIds = new Set(period.product_ids);
  const productIdSets = await Promise.all(
    sales.map((sale) =>
      getSaleProductIds({
        saleId: sale.id,
        saleSource: sale.source,
        sbAdmin,
      })
    )
  );
  const eligible = productIdSets.every((saleProductIds) =>
    period.product_scope === 'allowlist'
      ? saleProductIds.length > 0 &&
        saleProductIds.every((productId) => periodProductIds.has(productId))
      : saleProductIds.every((productId) => !periodProductIds.has(productId))
  );
  if (!eligible) throw new InventorySalesPeriodProductRuleError();
}

export async function setInventorySalePeriod({
  actorId,
  periodId,
  saleId,
  saleSource,
  sbAdmin,
  wsId,
}: {
  actorId: string;
  periodId: string | null;
  saleId: string;
  saleSource: InventorySaleSource;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const assignments = privateInventory(sbAdmin).from(
    'inventory_sales_period_assignments' as never
  );
  if (periodId === null) {
    const { error } = await assignments
      .delete()
      .eq('ws_id', wsId)
      .eq('sale_source', saleSource)
      .eq('sale_id', saleId);
    if (error) throw error;
    return null;
  }

  const period = await getPeriodWithCount({ periodId, sbAdmin, wsId });
  if (!period) return null;
  if (period.product_scope !== 'all') {
    const saleProductIds = await getSaleProductIds({
      saleId,
      saleSource,
      sbAdmin,
    });
    const periodProductIds = new Set(period.product_ids);
    const eligible =
      period.product_scope === 'allowlist'
        ? saleProductIds.length > 0 &&
          saleProductIds.every((productId) => periodProductIds.has(productId))
        : saleProductIds.every((productId) => !periodProductIds.has(productId));
    if (!eligible) throw new InventorySalesPeriodProductRuleError();
  }

  const { error } = await assignments.upsert(
    {
      assigned_at: new Date().toISOString(),
      assigned_by: actorId,
      period_id: periodId,
      sale_id: saleId,
      sale_source: saleSource,
      ws_id: wsId,
    } as never,
    { onConflict: 'ws_id,sale_source,sale_id' }
  );
  if (error) throw error;
  return period;
}

export async function setInventorySalesPeriodBulk({
  actorId,
  periodId,
  sales,
  sbAdmin,
  wsId,
}: {
  actorId: string;
  periodId: string | null;
  sales: InventorySaleReference[];
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const uniqueSales = await validateSalesExist({ sales, sbAdmin, wsId });
  const assignments = privateInventory(sbAdmin).from(
    'inventory_sales_period_assignments' as never
  );

  if (periodId === null) {
    await Promise.all(
      (['finance_invoice', 'checkout_session'] as const).map(async (source) => {
        const ids = uniqueSales
          .filter((sale) => sale.source === source)
          .map((sale) => sale.id);
        if (ids.length === 0) return;
        const { error } = await assignments
          .delete()
          .eq('ws_id', wsId)
          .eq('sale_source', source)
          .in('sale_id', ids);
        if (error) throw error;
      })
    );
    return null;
  }

  const period = await getPeriodWithCount({ periodId, sbAdmin, wsId });
  if (!period) return null;
  await validatePeriodEligibility({ period, sales: uniqueSales, sbAdmin });

  const assignedAt = new Date().toISOString();
  const { error } = await assignments.upsert(
    uniqueSales.map((sale) => ({
      assigned_at: assignedAt,
      assigned_by: actorId,
      period_id: periodId,
      sale_id: sale.id,
      sale_source: sale.source,
      ws_id: wsId,
    })) as never,
    { onConflict: 'ws_id,sale_source,sale_id' }
  );
  if (error) throw error;
  return period;
}

export async function listInventoryCommerceSales({
  limit = 50,
  offset = 0,
  periodId = null,
  sbAdmin,
  unassignedOnly = false,
  wsId,
}: {
  limit?: number;
  offset?: number;
  periodId?: string | null;
  sbAdmin: TypedSupabaseClient;
  unassignedOnly?: boolean;
  wsId: string;
}) {
  const { data, error } = await privateInventory(sbAdmin).rpc(
    'list_inventory_commerce_sales' as never,
    {
      p_limit: limit,
      p_offset: offset,
      p_period_id: periodId,
      p_unassigned_only: unassignedOnly,
      p_ws_id: wsId,
    } as never
  );
  if (error) throw error;
  const rows = (data ?? []) as unknown as PeriodSalesRpcRow[];
  return {
    count: Number(rows[0]?.total_count ?? 0),
    data: rows
      .map((row) => row.sale)
      .filter((sale): sale is InventorySaleSummary => Boolean(sale)),
  };
}

export async function getInventoryCommerceSummary({
  currency,
  periodId = null,
  sbAdmin,
  unassignedOnly = false,
  wsId,
}: {
  currency: string;
  periodId?: string | null;
  sbAdmin: TypedSupabaseClient;
  unassignedOnly?: boolean;
  wsId: string;
}) {
  const pageSize = 100;
  const [{ data, error }, firstPage] = await Promise.all([
    privateInventory(sbAdmin).rpc(
      'get_inventory_commerce_summary' as never,
      {
        p_currency: currency,
        p_period_id: periodId,
        p_unassigned_only: unassignedOnly,
        p_ws_id: wsId,
      } as never
    ),
    listInventoryCommerceSales({
      limit: pageSize,
      offset: 0,
      periodId,
      sbAdmin,
      unassignedOnly,
      wsId,
    }),
  ]);
  if (error) throw error;

  const sales = [...firstPage.data];
  for (let offset = sales.length; offset < firstPage.count; ) {
    const page = await listInventoryCommerceSales({
      limit: pageSize,
      offset,
      periodId,
      sbAdmin,
      unassignedOnly,
      wsId,
    });
    if (page.data.length === 0) break;
    sales.push(...page.data);
    offset += page.data.length;
  }

  const rpcSummary = data as unknown as InventoryCommerceSummary;
  return summarizeInventorySales({
    currency,
    marginPercentage: Number(rpcSummary?.estimatedGrossMarginPercentage ?? 0),
    sales,
  });
}

export async function listInventorySalesForPeriod({
  limit = 50,
  offset = 0,
  periodId,
  sbAdmin,
  wsId,
}: {
  limit?: number;
  offset?: number;
  periodId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await privateInventory(sbAdmin).rpc(
    'list_inventory_sales_for_period' as never,
    {
      p_limit: limit,
      p_offset: offset,
      p_period_id: periodId,
      p_ws_id: wsId,
    } as never
  );
  if (error) throw error;
  const rows = (data ?? []) as unknown as PeriodSalesRpcRow[];
  return {
    count: Number(rows[0]?.total_count ?? 0),
    data: rows
      .map((row) => row.sale)
      .filter((sale): sale is InventorySaleSummary => Boolean(sale)),
  };
}
