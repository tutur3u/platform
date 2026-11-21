import 'server-only';

import type {
  InventoryBundle,
  InventoryBundlePayload,
  InventoryBundleStatus,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { ListQuery } from './mappers';
import {
  scheduleBundlePolarSync,
  scheduleInventoryPolarProductArchive,
} from './polar-product-sync';
import { revalidatePublicStorefront } from './public-storefront';

type SupabaseErrorLike = { code?: string; message?: string } | null;

type ListRpcRow<TKey extends string, TValue> = {
  total_count: number | null;
} & Record<TKey, TValue | null>;

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

function hasPayloadKey<T extends object, K extends PropertyKey>(
  payload: T,
  key: K
): payload is T & Record<K, unknown> {
  return Object.hasOwn(payload, key);
}

export class InvalidInventoryBundleComponentTargetError extends Error {
  constructor() {
    super('Invalid inventory bundle component target');
    this.name = 'InvalidInventoryBundleComponentTargetError';
  }
}

function rethrowBundleRpcError(error: SupabaseErrorLike): never {
  if (error?.message?.includes('INVALID_BUNDLE_COMPONENT_WORKSPACE_SCOPE')) {
    throw new InvalidInventoryBundleComponentTargetError();
  }
  if (
    error?.message?.includes(
      'INVALID_BUNDLE_CATEGORY_COMPONENT_WORKSPACE_SCOPE'
    )
  ) {
    throw new InvalidInventoryBundleComponentTargetError();
  }

  throw error ?? new Error('Inventory bundle RPC failed');
}

async function createPrivateInventoryClient() {
  const sbAdmin = await createAdminClient();
  return sbAdmin.schema('private');
}

export async function listBundles(
  wsId: string,
  query: ListQuery<InventoryBundleStatus> = {}
) {
  const inventory = await createPrivateInventoryClient();
  const { limit, offset } = normalizePagination(query.page, query.pageSize);
  const status = query.status && query.status !== 'all' ? query.status : null;
  const { data, error } = (await inventory.rpc(
    'list_inventory_bundles' as never,
    {
      p_limit: limit,
      p_offset: offset,
      p_search: normalizeSearch(query.q),
      p_status: status,
      p_ws_id: wsId,
    } as never
  )) as {
    data: ListRpcRow<'bundle', InventoryBundle>[] | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return mapRpcList(data, 'bundle');
}

async function upsertBundle(
  wsId: string,
  payload: InventoryBundlePayload,
  bundleId: string | null = null
) {
  const inventory = await createPrivateInventoryClient();
  const { data, error } = (await inventory.rpc(
    'upsert_inventory_bundle_with_components' as never,
    {
      p_bundle_id: bundleId,
      p_category_candidate_scope: payload.categoryCandidateScope ?? null,
      p_category_components: payload.categoryComponents ?? null,
      p_components: payload.components ?? null,
      p_description: payload.description ?? null,
      p_image_url: payload.imageUrl ?? null,
      p_max_per_order: payload.maxPerOrder ?? 99,
      p_name: payload.name,
      p_price: payload.price,
      p_pricing_mode: payload.pricingMode ?? null,
      p_slug: payload.slug,
      p_status: payload.status ?? 'draft',
      p_storefront_id: payload.storefrontId ?? null,
      p_ws_id: wsId,
    } as never
  )) as {
    data: InventoryBundle | null;
    error: SupabaseErrorLike;
  };

  if (error) rethrowBundleRpcError(error);
  if (!data && bundleId === null) {
    throw new Error('Failed to create inventory bundle');
  }

  return data;
}

async function revalidateBundleStorefront(storefrontId: string | null) {
  if (!storefrontId) return;
  const inventory = await createPrivateInventoryClient();
  const { data } = await inventory
    .from('inventory_storefronts')
    .select('slug')
    .eq('id', storefrontId)
    .maybeSingle();
  const slug = (data as { slug?: string | null } | null)?.slug;
  if (slug) revalidatePublicStorefront(slug);
}

export async function createBundle(
  wsId: string,
  payload: InventoryBundlePayload
) {
  const bundle = await upsertBundle(wsId, payload);
  if (bundle) {
    scheduleBundlePolarSync(bundle);
    await revalidateBundleStorefront(bundle.storefrontId);
  }
  return bundle;
}

async function getBundleBase(wsId: string, bundleId: string) {
  const inventory = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_bundles')
    .select(
      'storefront_id, slug, name, description, image_url, price, pricing_mode, category_candidate_scope, status, max_per_order'
    )
    .eq('id', bundleId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateBundle(
  wsId: string,
  bundleId: string,
  payload: Partial<InventoryBundlePayload>
) {
  const current = await getBundleBase(wsId, bundleId);
  if (!current) return null;

  const merged: InventoryBundlePayload = {
    categoryCandidateScope:
      payload.categoryCandidateScope ??
      (current.category_candidate_scope as InventoryBundle['categoryCandidateScope']),
    categoryComponents: payload.categoryComponents,
    components: payload.components,
    description: hasPayloadKey(payload, 'description')
      ? (payload.description ?? null)
      : current.description,
    imageUrl: hasPayloadKey(payload, 'imageUrl')
      ? (payload.imageUrl ?? null)
      : current.image_url,
    maxPerOrder: payload.maxPerOrder ?? current.max_per_order,
    name: payload.name ?? current.name,
    price: payload.price ?? Number(current.price),
    pricingMode:
      payload.pricingMode ??
      (current.pricing_mode as InventoryBundle['pricingMode']),
    slug: payload.slug ?? current.slug,
    status: payload.status ?? (current.status as InventoryBundleStatus),
    storefrontId: hasPayloadKey(payload, 'storefrontId')
      ? (payload.storefrontId ?? null)
      : current.storefront_id,
  };

  const bundle = await upsertBundle(wsId, merged, bundleId);
  if (bundle) {
    scheduleBundlePolarSync(bundle);
    await revalidateBundleStorefront(bundle.storefrontId);
  }
  return bundle;
}

export async function deleteBundle(wsId: string, bundleId: string) {
  const inventory = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_bundles')
    .delete()
    .eq('id', bundleId)
    .eq('ws_id', wsId)
    .select('id, storefront_id, polar_product_id')
    .maybeSingle();

  if (error) throw error;
  if (data) {
    const row = data as {
      polar_product_id?: string | null;
      storefront_id?: string | null;
    };
    // A deleted bundle must not remain buyable on Polar — archive its product.
    scheduleInventoryPolarProductArchive({
      polarProductId: row.polar_product_id ?? null,
      storefrontId: row.storefront_id ?? null,
      wsId,
    });
    await revalidateBundleStorefront(row.storefront_id ?? null);
  }
  return Boolean(data);
}
