import 'server-only';

import type {
  InventorySaleSource,
  InventorySaleSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type SalesPeriodRow = Omit<InventorySalesPeriod, 'sale_count'>;
type SalesPeriodAssignmentRow = {
  period_id: string;
  sale_id: string;
  sale_source: InventorySaleSource;
};
type PeriodSalesRpcRow = {
  sale: InventorySaleSummary | null;
  total_count: number | null;
};

function privateInventory(sbAdmin: TypedSupabaseClient) {
  return sbAdmin.schema('private');
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
    .select(
      'id, ws_id, name, description, starts_at, ends_at, status, created_at, updated_at'
    )
    .eq('ws_id', wsId)
    .order('starts_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (!includeArchived) {
    periodsQuery = periodsQuery.eq('status', 'active');
  }

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

  const counts = new Map<string, number>();
  for (const assignment of (assignmentsResult.data ?? []) as Array<{
    period_id: string;
  }>) {
    counts.set(
      assignment.period_id,
      (counts.get(assignment.period_id) ?? 0) + 1
    );
  }

  return ((periods ?? []) as unknown as SalesPeriodRow[]).map((period) => ({
    ...period,
    sale_count: counts.get(period.id) ?? 0,
  }));
}

export async function getInventorySalesPeriod({
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
    .select(
      'id, ws_id, name, description, starts_at, ends_at, status, created_at, updated_at'
    )
    .eq('id', periodId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { count, error: countError } = await privateInventory(sbAdmin)
    .from('inventory_sales_period_assignments' as never)
    .select('sale_id', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('period_id', periodId);

  if (countError) throw countError;
  return { ...(data as unknown as SalesPeriodRow), sale_count: count ?? 0 };
}

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
    starts_at?: string | null;
  };
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_periods' as never)
    .insert({
      ...payload,
      created_by: actorId,
      name: payload.name.trim(),
      ws_id: wsId,
    } as never)
    .select(
      'id, ws_id, name, description, starts_at, ends_at, status, created_at, updated_at'
    )
    .single();

  if (error) throw error;
  return { ...(data as unknown as SalesPeriodRow), sale_count: 0 };
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
    starts_at: string | null;
    status: 'active' | 'archived';
  }>;
  periodId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const nextPayload = {
    ...payload,
    ...(payload.name === undefined ? {} : { name: payload.name.trim() }),
  };
  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_periods' as never)
    .update(nextPayload as never)
    .eq('id', periodId)
    .eq('ws_id', wsId)
    .select(
      'id, ws_id, name, description, starts_at, ends_at, status, created_at, updated_at'
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const current = await getInventorySalesPeriod({ periodId, sbAdmin, wsId });
  return current;
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

  const saleIds = [...new Set(sales.map((sale) => sale.id))];
  const { data, error } = await privateInventory(sbAdmin)
    .from('inventory_sales_period_assignments' as never)
    .select('period_id, sale_id, sale_source')
    .eq('ws_id', wsId)
    .in('sale_id', saleIds);

  if (error) throw error;
  const assignments = (data ?? []) as unknown as SalesPeriodAssignmentRow[];
  const periodIds = [...new Set(assignments.map((row) => row.period_id))];
  if (periodIds.length === 0) return new Map<string, InventorySalesPeriod>();

  const { data: periods, error: periodsError } = await privateInventory(sbAdmin)
    .from('inventory_sales_periods' as never)
    .select(
      'id, ws_id, name, description, starts_at, ends_at, status, created_at, updated_at'
    )
    .eq('ws_id', wsId)
    .in('id', periodIds);

  if (periodsError) throw periodsError;
  const periodsById = new Map(
    ((periods ?? []) as unknown as SalesPeriodRow[]).map((period) => [
      period.id,
      { ...period, sale_count: 0 },
    ])
  );
  const result = new Map<string, InventorySalesPeriod>();
  for (const assignment of assignments) {
    const period = periodsById.get(assignment.period_id);
    if (period) {
      result.set(`${assignment.sale_source}:${assignment.sale_id}`, period);
    }
  }
  return result;
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

  const period = await getInventorySalesPeriod({ periodId, sbAdmin, wsId });
  if (!period) return null;

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
