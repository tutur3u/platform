import { getInventoryApiListRange } from '@tuturuuu/inventory-core/api-list-query';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

interface ListOptions {
  q: string;
  page: number;
  pageSize: number;
  paginate: boolean;
  orderByName: boolean;
}

function isLegacyOptions(data: unknown, wsId: string): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if ('inventoryMergeSchema' in data) return false;
  if (!('warehouses' in data) || !Array.isArray(data.warehouses)) return false;
  return data.warehouses.every(
    (row: unknown) =>
      row !== null &&
      typeof row === 'object' &&
      'id' in row &&
      typeof row.id === 'string' &&
      row.id.length > 0 &&
      'ws_id' in row &&
      typeof row.ws_id === 'string' &&
      row.ws_id.toLowerCase() === wsId.toLowerCase() &&
      'name' in row &&
      (row.name === null || typeof row.name === 'string')
  );
}

/** The baseline RPC's current SQL body is marked atomically with alias creation.
 * Cache misses cannot attest legacy: only a valid unmarked baseline result can.
 */
export async function fetchInventoryWarehouseList(
  admin: TypedSupabaseClient,
  wsId: string,
  options: ListOptions
) {
  const inventory = admin.schema('private');
  const load = (
    table: 'inventory_active_warehouses' | 'inventory_warehouses'
  ) => {
    // Tables and views have distinct .from overloads. Keep each relation literal
    // so generated row/column inference remains intact before common filters.
    const selectOptions = {
      count: options.paginate ? ('exact' as const) : undefined,
    };
    const query =
      table === 'inventory_active_warehouses'
        ? inventory
            .from('inventory_active_warehouses')
            .select('*', selectOptions)
            .eq('ws_id', wsId)
        : inventory
            .from('inventory_warehouses')
            .select('*', selectOptions)
            .eq('ws_id', wsId);
    if (options.q) query.ilike('name', `%${options.q}%`);
    if (options.paginate) {
      const { start, end } = getInventoryApiListRange(options);
      query.range(start, end);
    }
    if (options.orderByName) query.order('name');
    return query;
  };
  const result = await load('inventory_active_warehouses');
  if (!result.error || !['42P01', 'PGRST205'].includes(result.error.code))
    return result;

  const baseline = await inventory.rpc('get_inventory_product_form_options', {
    p_ws_id: wsId,
  });
  if (baseline.error || !isLegacyOptions(baseline.data, wsId)) return result;
  // New merges are disabled until their separate schema-readiness gate passes.
  const legacy = await load('inventory_warehouses');
  if (legacy.error) return legacy;
  // Migration may commit between requests. Discard the raw result if the current
  // function body became marked while this legacy read was in flight.
  const confirmed = await inventory.rpc('get_inventory_product_form_options', {
    p_ws_id: wsId,
  });
  return !confirmed.error && isLegacyOptions(confirmed.data, wsId)
    ? legacy
    : result;
}
