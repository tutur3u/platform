import 'server-only';

import type {
  InventoryCheckoutSession,
  InventoryCheckoutStatus,
  InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { ListQuery } from './mappers';

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

function normalizePagination(page?: number, pageSize?: number) {
  const limit = Math.max(1, Math.min(pageSize ?? 25, 100));
  const offset = (Math.max(1, page ?? 1) - 1) * limit;
  return { limit, offset };
}

function normalizeSearch(q?: string) {
  const value = q?.trim();
  return value ? value : null;
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

export async function listCheckouts(
  wsId: string,
  query: ListQuery<InventoryCheckoutStatus> = {}
) {
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

  return data ?? null;
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
    } as never
  )) as {
    data: null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return getCheckoutByPublicToken(checkout.public_token);
}
