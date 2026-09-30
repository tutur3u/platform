import 'server-only';
import type { InventoryPrice } from '@tuturuuu/internal-api/inventory';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function listPeriodPrices(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  periodId: string
) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('inventory_product_prices' as never)
    .select('*')
    .eq('ws_id', wsId)
    .eq('period_id', periodId)
    .order('valid_from', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as InventoryPrice[];
}

export async function periodPricingRpc<T>(
  sbAdmin: TypedSupabaseClient,
  name: string,
  args: Record<string, unknown>
) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc(name as never, args as never);
  if (error) throw error;
  return data as unknown as T;
}

export function pricingErrorStatus(error: unknown) {
  if (typeof error !== 'object' || !error || !('code' in error)) return 500;
  if (['23514', '23P01', '23505'].includes(String(error.code))) return 409;
  // New controls fail closed until the additive migration is installed.
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(String(error.code)))
    return 503;
  return 500;
}

/** Legacy period edits remain available while the additive migration rolls out. */
export async function preparePeriodPricingPayload<
  T extends {
    pricing_mode?: 'legacy' | 'scheduled';
    time_zone?: string | null;
  },
>(sbAdmin: TypedSupabaseClient, payload: T) {
  if (payload.pricing_mode === undefined && payload.time_zone === undefined)
    return payload;
  const { error } = await sbAdmin
    .schema('private')
    .from('inventory_sales_periods' as never)
    .select('pricing_mode')
    .limit(0);
  if (!error) return payload;
  if (!['42703', 'PGRST204'].includes(error.code)) throw error;
  if (payload.pricing_mode === 'scheduled') {
    throw Object.assign(new Error('Season pricing is not available yet'), {
      code: 'PGRST202',
    });
  }
  const { pricing_mode: _mode, time_zone: _zone, ...legacy } = payload;
  return legacy;
}
