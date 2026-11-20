import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

const INVOICE_COLUMNS =
  'id, notice, note, price, total_diff, paid_amount, created_at, completed_at, valid_until, subscription_months, wallet_id, category_id, customer_id, customer:workspace_users!customer_id(display_name, full_name)';
const PRODUCT_COLUMNS =
  'product_id, product_name, product_unit, warehouse, amount, price, total_diff';
const PROMOTION_COLUMNS = 'promo_id, name, code, description, value, use_ratio';

type CustomerRow = {
  display_name: string | null;
  full_name: string | null;
} | null;

/**
 * One invoice of the workspace with its line items, applied promotions and
 * wallet name, for clients that render or share the invoice. Null when the
 * invoice is not in the workspace.
 */
export async function loadInvoiceDetail(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  invoiceId: string
) {
  const { data: invoice, error } = await sbAdmin
    .from('finance_invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  if (!invoice) return null;

  const [products, promotions, wallet] = await Promise.all([
    sbAdmin
      .from('finance_invoice_products')
      .select(PRODUCT_COLUMNS)
      .eq('invoice_id', invoiceId),
    sbAdmin
      .from('finance_invoice_promotions')
      .select(PROMOTION_COLUMNS)
      .eq('invoice_id', invoiceId),
    sbAdmin
      .schema('private')
      .from('workspace_wallets')
      .select('name, currency')
      .eq('id', invoice.wallet_id)
      .eq('ws_id', wsId)
      .maybeSingle(),
  ]);
  if (products.error) throw products.error;
  if (promotions.error) throw promotions.error;
  if (wallet.error) throw wallet.error;

  const { customer, ...rest } = invoice as typeof invoice & {
    customer: CustomerRow;
  };
  return {
    ...rest,
    customer_name: customer?.full_name ?? customer?.display_name ?? null,
    wallet_name: wallet.data?.name ?? null,
    wallet_currency: wallet.data?.currency ?? null,
    products: products.data ?? [],
    promotions: promotions.data ?? [],
  };
}
