import 'server-only';

import type {
  InventoryCheckoutSession,
  InventoryCheckoutStatus,
  InventoryOrderHistoryItem,
  InventorySaleSummary,
  InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { ListQuery } from './mappers';
import { type CheckoutLineRow, type CheckoutRow, mapCheckout } from './mappers';

type SupabaseErrorLike = { code?: string; message?: string } | null;

type ListRpcRow<TKey extends string, TValue> = {
  total_count: number | null;
} & Record<TKey, TValue | null>;

type CheckoutStorefrontAccess = {
  storefrontId: string;
  storefrontSlug: string;
  visibility: InventoryStorefrontVisibility;
  wsId: string;
};

type PrivateInventoryClient = Awaited<
  ReturnType<typeof createPrivateInventoryClient>
>['inventory'];

type CheckoutHistoryRow = CheckoutRow & {
  created_at: string | null;
  storefront_id: string;
};

type StorefrontLookupRow = {
  id: string;
  name: string;
  slug: string;
};

const CHECKOUT_HISTORY_SELECT = `
  id,
  ws_id,
  storefront_id,
  public_token,
  status,
  customer_auth_uid,
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
  expires_at,
  completed_at,
  created_at,
  finance_invoice_id,
  polar_checkout_id,
  polar_checkout_url,
  polar_environment,
  polar_order_id,
  polar_product_id,
  polar_status
`;

const CHECKOUT_SQUARE_SELECT = `
  ${CHECKOUT_HISTORY_SELECT},
  checkout_provider,
  square_environment,
  square_location_id,
  square_device_id,
  square_order_id,
  square_terminal_checkout_id,
  square_payment_id,
  square_receipt_url,
  square_status,
  square_failure_reason,
  square_last_synced_at
`;

const CHECKOUT_LINE_SELECT = `
  id,
  checkout_session_id,
  listing_id,
  bundle_id,
  variant_id,
  product_id,
  unit_id,
  warehouse_id,
  title,
  quantity,
  unit_price,
  subtotal_amount
`;

function normalizePagination(page?: number, pageSize?: number) {
  const limit = Math.max(1, Math.min(pageSize ?? 25, 100));
  const offset = (Math.max(1, page ?? 1) - 1) * limit;
  return { limit, offset };
}

function normalizeSearch(q?: string) {
  const value = q?.trim();
  return value ? value : null;
}

function isExpiredReservedCheckout(
  checkout: Pick<InventoryCheckoutSession, 'expiresAt' | 'status'>,
  now = Date.now()
) {
  if (checkout.status !== 'reserved' || !checkout.expiresAt) return false;
  const expiresAt = Date.parse(checkout.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function mapRpcList<TKey extends string, TValue>(
  rows: ListRpcRow<TKey, TValue>[] | null | undefined,
  key: TKey
) {
  return {
    count: rows?.[0]?.total_count ?? 0,
    data: (rows ?? []).map((row) => row[key]).filter(Boolean) as TValue[],
  };
}

async function createPrivateInventoryClient() {
  const sbAdmin = await createAdminClient();
  return { inventory: sbAdmin.schema('private'), sbAdmin };
}

function normalizeLimitOffset(limit = 50, offset = 0) {
  return {
    limit: Math.max(1, Math.min(limit, 100)),
    offset: Math.max(0, offset),
  };
}

function linesByCheckoutId(lines: CheckoutLineRow[]) {
  const map = new Map<string, CheckoutLineRow[]>();
  for (const line of lines) {
    const current = map.get(line.checkout_session_id) ?? [];
    current.push(line);
    map.set(line.checkout_session_id, current);
  }
  return map;
}

async function loadCheckoutLines(
  inventory: PrivateInventoryClient,
  checkoutIds: string[]
) {
  if (checkoutIds.length === 0) return [];

  const { data, error } = await inventory
    .from('inventory_checkout_lines')
    .select(CHECKOUT_LINE_SELECT)
    .in('checkout_session_id', checkoutIds);

  if (error) throw error;
  return (data ?? []) as CheckoutLineRow[];
}

async function loadStorefrontLookupByIds(
  inventory: PrivateInventoryClient,
  storefrontIds: string[]
) {
  const uniqueIds = [...new Set(storefrontIds)].filter(Boolean);
  if (uniqueIds.length === 0) return new Map<string, StorefrontLookupRow>();

  const { data, error } = await inventory
    .from('inventory_storefronts')
    .select('id, name, slug')
    .in('id', uniqueIds);

  if (error) throw error;
  return new Map(
    (data ?? []).map((row) => [row.id, row as StorefrontLookupRow])
  );
}

async function loadStorefrontBySlug(
  inventory: PrivateInventoryClient,
  storeSlug: string
) {
  const { data, error } = await inventory
    .from('inventory_storefronts')
    .select('id, name, slug')
    .eq('slug', storeSlug)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as StorefrontLookupRow | null;
}

function mapOrderHistoryItem({
  lines,
  row,
  storefront,
}: {
  lines: CheckoutLineRow[];
  row: CheckoutHistoryRow;
  storefront: StorefrontLookupRow;
}): InventoryOrderHistoryItem {
  const checkout = mapCheckout(row, lines);

  return {
    checkout,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    currency: row.currency,
    id: row.id,
    lines: checkout.lines,
    polarStatus: row.polar_status,
    publicToken: row.public_token,
    squareStatus: row.square_status ?? null,
    status: row.status,
    storefrontId: storefront.id,
    storefrontName: storefront.name,
    storefrontSlug: storefront.slug,
    totalAmount: row.total_amount,
  };
}

function mapCheckoutSaleSummary(
  row: CheckoutHistoryRow,
  lines: CheckoutLineRow[]
): InventorySaleSummary {
  return {
    category_name: null,
    completed_at: row.completed_at,
    created_at: row.created_at,
    creator_name: null,
    currency: row.currency,
    customer_name: row.customer_name || row.customer_email || row.public_token,
    id: row.id,
    items_count: lines.length,
    note: row.note,
    notice: row.public_token,
    owners: [],
    paid_amount: row.total_amount,
    polar_order_id: row.polar_order_id,
    public_token: row.public_token,
    square_order_id: row.square_order_id ?? null,
    source: 'checkout_session',
    total_quantity: lines.reduce((sum, line) => sum + Number(line.quantity), 0),
    wallet_name: null,
  };
}

export async function listCheckouts(
  wsId: string,
  query: ListQuery<InventoryCheckoutStatus> = {}
) {
  await expireCheckoutReservations({ wsId });
  const { inventory } = await createPrivateInventoryClient();
  const { limit, offset } = normalizePagination(query.page, query.pageSize);
  const status = query.status && query.status !== 'all' ? query.status : null;
  const { data, error } = (await inventory.rpc(
    'list_inventory_checkouts' as never,
    {
      p_limit: limit,
      p_offset: offset,
      p_search: normalizeSearch(query.q),
      p_status: status,
      p_ws_id: wsId,
    } as never
  )) as {
    data: ListRpcRow<'checkout', InventoryCheckoutSession>[] | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return mapRpcList(data, 'checkout');
}

export async function getCheckoutByPublicToken(publicToken: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory.rpc(
    'get_inventory_checkout_by_public_token' as never,
    {
      p_public_token: publicToken,
    } as never
  )) as {
    data: InventoryCheckoutSession | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;

  const checkout = data ?? null;
  if (!checkout || !isExpiredReservedCheckout(checkout)) return checkout;

  await expireCheckoutReservations({ wsId: checkout.wsId });
  const { data: refreshed, error: refreshError } = (await inventory.rpc(
    'get_inventory_checkout_by_public_token' as never,
    {
      p_public_token: publicToken,
    } as never
  )) as {
    data: InventoryCheckoutSession | null;
    error: SupabaseErrorLike;
  };

  if (refreshError) throw refreshError;
  return refreshed ?? null;
}

export async function expireCheckoutReservations({
  limit = 500,
  now = new Date(),
  wsId,
}: {
  limit?: number;
  now?: Date;
  wsId?: string | null;
} = {}) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory.rpc(
    'expire_inventory_checkout_sessions' as never,
    {
      p_limit: Math.max(1, Math.min(limit, 5000)),
      p_now: now.toISOString(),
      p_ws_id: wsId ?? null,
    } as never
  )) as {
    data: Array<{ checkout_id: string; ws_id: string }> | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return data ?? [];
}

export async function getCheckoutById(wsId: string, checkoutId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_checkout_sessions')
    .select(CHECKOUT_SQUARE_SELECT)
    .eq('id', checkoutId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lines = await loadCheckoutLines(inventory, [checkoutId]);
  return mapCheckout(data as unknown as CheckoutRow, lines);
}

export async function markCheckoutProvider({
  checkoutId,
  provider,
  wsId,
}: {
  checkoutId: string;
  provider: 'polar' | 'square_terminal';
  wsId: string;
}) {
  const { inventory } = await createPrivateInventoryClient();
  const { error } = await inventory
    .from('inventory_checkout_sessions')
    .update({
      checkout_provider: provider,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', checkoutId)
    .eq('ws_id', wsId);

  if (error) throw error;
}

export async function getCheckoutStorefrontAccessByPublicToken(
  publicToken: string
): Promise<CheckoutStorefrontAccess | null> {
  const { inventory } = await createPrivateInventoryClient();
  const { data: checkout, error: checkoutError } = await inventory
    .from('inventory_checkout_sessions')
    .select('storefront_id')
    .eq('public_token', publicToken)
    .maybeSingle();

  if (checkoutError) throw checkoutError;
  if (!checkout?.storefront_id) return null;

  const { data: storefront, error: storefrontError } = await inventory
    .from('inventory_storefronts')
    .select('id, slug, visibility, ws_id')
    .eq('id', checkout.storefront_id)
    .maybeSingle();

  if (storefrontError) throw storefrontError;
  if (!storefront) return null;

  return {
    storefrontId: storefront.id,
    storefrontSlug: storefront.slug,
    visibility: storefront.visibility as InventoryStorefrontVisibility,
    wsId: storefront.ws_id,
  };
}

export async function listCheckoutOrderHistory({
  customerAuthUid,
  limit = 50,
  offset = 0,
  storeSlug,
}: {
  customerAuthUid: string;
  limit?: number;
  offset?: number;
  storeSlug?: string;
}) {
  const { inventory } = await createPrivateInventoryClient();
  const pagination = normalizeLimitOffset(limit, offset);
  let storefrontFilter: StorefrontLookupRow | null = null;

  if (storeSlug) {
    storefrontFilter = await loadStorefrontBySlug(inventory, storeSlug);
    if (!storefrontFilter) {
      return { count: 0, data: [] as InventoryOrderHistoryItem[] };
    }
  }

  let query = inventory
    .from('inventory_checkout_sessions')
    .select(CHECKOUT_HISTORY_SELECT, { count: 'exact' })
    .eq('customer_auth_uid', customerAuthUid)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  if (storefrontFilter) {
    query = query.eq('storefront_id', storefrontFilter.id);
  }

  const { count, data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as CheckoutHistoryRow[];
  const checkoutIds = rows.map((row) => row.id);
  const [lines, storefrontsById] = await Promise.all([
    loadCheckoutLines(inventory, checkoutIds),
    storefrontFilter
      ? Promise.resolve(
          new Map<string, StorefrontLookupRow>([
            [storefrontFilter.id, storefrontFilter],
          ])
        )
      : loadStorefrontLookupByIds(
          inventory,
          rows.map((row) => row.storefront_id)
        ),
  ]);
  const linesMap = linesByCheckoutId(lines);

  return {
    count: count ?? rows.length,
    data: rows.flatMap((row) => {
      const storefront = storefrontsById.get(row.storefront_id);
      if (!storefront) return [];

      return [
        mapOrderHistoryItem({
          lines: linesMap.get(row.id) ?? [],
          row,
          storefront,
        }),
      ];
    }),
  };
}

export async function listCompletedCheckoutSales({
  limit = 50,
  offset = 0,
  sbAdmin,
  wsId,
}: {
  limit?: number;
  offset?: number;
  sbAdmin?: TypedSupabaseClient;
  wsId: string;
}) {
  const inventory = sbAdmin
    ? sbAdmin.schema('private')
    : (await createPrivateInventoryClient()).inventory;
  const pagination = normalizeLimitOffset(limit, offset);
  const { count, data, error } = await inventory
    .from('inventory_checkout_sessions')
    .select(CHECKOUT_HISTORY_SELECT, { count: 'exact' })
    .eq('ws_id', wsId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  if (error) throw error;

  const rows = (data ?? []) as CheckoutHistoryRow[];
  const lines = await loadCheckoutLines(
    inventory,
    rows.map((row) => row.id)
  );
  const linesMap = linesByCheckoutId(lines);

  return {
    count: count ?? rows.length,
    data: rows.map((row) =>
      mapCheckoutSaleSummary(row, linesMap.get(row.id) ?? [])
    ),
  };
}

export async function releaseCheckout(wsId: string, checkoutId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data: checkout, error: checkoutError } = await inventory
    .from('inventory_checkout_sessions')
    .select('id, public_token')
    .eq('id', checkoutId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (checkoutError) throw checkoutError;
  if (!checkout?.public_token) return null;

  const { error } = (await inventory.rpc(
    'release_inventory_checkout_session' as never,
    {
      p_checkout_id: checkoutId,
      p_ws_id: wsId,
    } as never
  )) as {
    data: null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return getCheckoutByPublicToken(checkout.public_token);
}
