import 'server-only';

import type { InventoryCheckoutStatus } from '@tuturuuu/internal-api/inventory';
import { getPlatformSql } from '@/lib/database/platform-sql';
import {
  type CheckoutLineRow,
  type CheckoutRow,
  type ListQuery,
  mapCheckout,
} from './mappers';

function normalizePagination(page?: number, pageSize?: number) {
  const limit = Math.max(1, Math.min(pageSize ?? 25, 100));
  const offset = (Math.max(1, page ?? 1) - 1) * limit;
  return { limit, offset };
}

function normalizeSearch(q?: string) {
  const value = q?.trim();
  return value ? `%${value}%` : null;
}

async function listCheckoutLines(checkoutIds: string[]) {
  if (checkoutIds.length === 0) {
    return new Map<string, CheckoutLineRow[]>();
  }

  const sql = getPlatformSql();
  const rows = await sql<CheckoutLineRow[]>`
    select
      id,
      checkout_session_id,
      listing_id,
      bundle_id,
      product_id,
      unit_id,
      warehouse_id,
      title,
      quantity::int as quantity,
      unit_price,
      subtotal_amount
    from private.inventory_checkout_lines
    where checkout_session_id = any(${checkoutIds}::uuid[])
    order by created_at asc
  `;

  const grouped = new Map<string, CheckoutLineRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.checkout_session_id) ?? [];
    current.push(row);
    grouped.set(row.checkout_session_id, current);
  }
  return grouped;
}

export async function listCheckouts(
  wsId: string,
  query: ListQuery<InventoryCheckoutStatus> = {}
) {
  const sql = getPlatformSql();
  const { limit, offset } = normalizePagination(query.page, query.pageSize);
  const search = normalizeSearch(query.q);
  const status = query.status && query.status !== 'all' ? query.status : null;

  const rows = await sql<CheckoutRow[]>`
    select
      id,
      public_token,
      status,
      customer_name,
      customer_email,
      customer_phone,
      note,
      currency,
      subtotal_amount,
      platform_fee_amount,
      processing_fee_estimate_amount,
      conversion_fee_estimate_amount,
      total_amount,
      expires_at::text as expires_at,
      completed_at::text as completed_at,
      finance_invoice_id
    from private.inventory_checkout_sessions
    where ws_id = ${wsId}
      and (${status}::text is null or status = ${status})
      and (
        ${search}::text is null
        or customer_name ilike ${search}
        or customer_email ilike ${search}
        or public_token ilike ${search}
      )
    order by created_at desc
    limit ${limit}
    offset ${offset}
  `;

  const [countRow] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from private.inventory_checkout_sessions
    where ws_id = ${wsId}
      and (${status}::text is null or status = ${status})
      and (
        ${search}::text is null
        or customer_name ilike ${search}
        or customer_email ilike ${search}
        or public_token ilike ${search}
      )
  `;

  const linesByCheckoutId = await listCheckoutLines(rows.map((row) => row.id));
  return {
    count: countRow?.count ?? 0,
    data: rows.map((row) =>
      mapCheckout(row, linesByCheckoutId.get(row.id) ?? [])
    ),
  };
}

export async function getCheckoutByPublicToken(publicToken: string) {
  const sql = getPlatformSql();
  const [row] = await sql<CheckoutRow[]>`
    select
      id,
      public_token,
      status,
      customer_name,
      customer_email,
      customer_phone,
      note,
      currency,
      subtotal_amount,
      platform_fee_amount,
      processing_fee_estimate_amount,
      conversion_fee_estimate_amount,
      total_amount,
      expires_at::text as expires_at,
      completed_at::text as completed_at,
      finance_invoice_id
    from private.inventory_checkout_sessions
    where public_token = ${publicToken}
    limit 1
  `;

  if (!row) {
    return null;
  }

  const linesByCheckoutId = await listCheckoutLines([row.id]);
  return mapCheckout(row, linesByCheckoutId.get(row.id) ?? []);
}
