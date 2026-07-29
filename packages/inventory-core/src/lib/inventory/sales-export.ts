import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type InventorySalesExportRpcRow = {
  category_name: string | null;
  checkout_provider: string | null;
  completed_at: string | null;
  created_at: string | null;
  creator_name: string | null;
  currency: string | null;
  customer_email: string | null;
  customer_name: string | null;
  finance_invoice_id: string | null;
  line_id: string | null;
  line_total: number | null;
  monetary_unit: 'major' | 'minor';
  note: string | null;
  notice: string | null;
  owner_id: string | null;
  owner_name: string | null;
  period_id: string;
  period_name: string;
  polar_order_id: string | null;
  product_id: string | null;
  product_name: string | null;
  public_token: string | null;
  quantity: number | null;
  sale_amount: number;
  sale_id: string;
  sale_source: 'checkout_session' | 'finance_invoice';
  square_order_id: string | null;
  transaction_id: string | null;
  unit_id: string | null;
  unit_name: string | null;
  unit_price: number | null;
  wallet_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
};

export async function listInventorySalesExportRows({
  periodId,
  sbAdmin,
  wsId,
}: {
  periodId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin.schema('private').rpc(
    'list_inventory_sales_export_rows' as never,
    {
      p_period_id: periodId,
      p_ws_id: wsId,
    } as never
  );

  if (error) throw error;
  return (data ?? []) as unknown as InventorySalesExportRpcRow[];
}
