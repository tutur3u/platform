import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type InventorySalesRpcRow<TSale> = {
  sale: TSale | null;
  total_count: number | null;
};

export async function getInventorySales<TSale>({
  limit = 50,
  offset = 0,
  sbAdmin,
  wsId,
}: {
  limit?: number;
  offset?: number;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_inventory_sales', {
      p_limit: limit,
      p_offset: offset,
      p_ws_id: wsId,
    });

  if (error) throw error;

  const rows = (data ?? []) as InventorySalesRpcRow<TSale>[];
  const sales = rows
    .map((row) => row.sale)
    .filter((sale): sale is TSale => Boolean(sale));

  return {
    count: Number(rows[0]?.total_count ?? 0),
    data: sales,
  };
}

export async function getInventorySale<TSale>({
  saleId,
  sbAdmin,
  wsId,
}: {
  saleId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_inventory_sale', {
      p_sale_id: saleId,
      p_ws_id: wsId,
    });

  if (error) throw error;

  return (data ?? null) as TSale | null;
}
