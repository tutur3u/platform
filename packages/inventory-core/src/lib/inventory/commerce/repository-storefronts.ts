import 'server-only';

import type {
  InventoryStorefront,
  InventoryStorefrontPayload,
  InventoryStorefrontStatus,
} from '@tuturuuu/internal-api/inventory';
import { getWorkspaceDefaultCurrency } from '../workspace-currency';
import { type ListQuery, mapStorefront, type StorefrontRow } from './mappers';
import { revalidatePublicStorefront } from './public-storefront';
import {
  createPrivateInventoryClient,
  hasPayloadKey,
  type ListRpcRow,
  listStorefrontSections,
  mapRpcList,
  mapStorefrontWithCount,
  normalizePagination,
  normalizeSearch,
  replaceStorefrontSections,
  type SupabaseErrorLike,
  storefrontSelect,
} from './repository-shared';

const DELETED_STOREFRONT_SLUG_PATTERN =
  /^deleted-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isMissingDeletedAtColumn(error: SupabaseErrorLike) {
  return (
    error?.code === '42703' && error.message?.includes('deleted_at') === true
  );
}

export async function listStorefronts(
  wsId: string,
  query: ListQuery<InventoryStorefrontStatus> = {}
) {
  const { inventory } = await createPrivateInventoryClient();
  const { limit, offset } = normalizePagination(query.page, query.pageSize);
  const status = query.status && query.status !== 'all' ? query.status : null;
  const { data, error } = (await inventory.rpc(
    'list_inventory_storefronts' as never,
    {
      p_limit: limit,
      p_offset: offset,
      p_search: normalizeSearch(query.q),
      p_status: status,
      p_ws_id: wsId,
    } as never
  )) as {
    data: ListRpcRow<'storefront', InventoryStorefront>[] | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;

  // A tombstone can be created by the rollout-safe fallback before the
  // deleted_at migration reaches an environment. Keep it out of the operator
  // list during that narrow deployment window; the migrated RPC applies the
  // authoritative database filter afterward.
  const result = mapRpcList(data, 'storefront');
  const visible = result.data.filter(
    (storefront) => !DELETED_STOREFRONT_SLUG_PATTERN.test(storefront.slug)
  );
  return {
    count: Math.max(0, result.count - (result.data.length - visible.length)),
    data: visible,
  };
}

export async function getStorefront(wsId: string, storefrontId: string) {
  const { inventory } = await createPrivateInventoryClient();
  let { data, error } = await inventory
    .from('inventory_storefronts')
    .select(storefrontSelect as never)
    .eq('id', storefrontId)
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .maybeSingle();

  if (isMissingDeletedAtColumn(error)) {
    ({ data, error } = await inventory
      .from('inventory_storefronts')
      .select(storefrontSelect as never)
      .eq('id', storefrontId)
      .eq('ws_id', wsId)
      .neq('slug', `deleted-${storefrontId}`)
      .maybeSingle());
  }

  if (error) throw error;
  if (!data) return null;

  return mapStorefrontWithCount(
    data as unknown as Omit<StorefrontRow, 'listings_count'>,
    inventory
  );
}

export async function createStorefront(
  wsId: string,
  payload: InventoryStorefrontPayload
) {
  const { inventory } = await createPrivateInventoryClient();
  const currency =
    payload.currency ?? (await getWorkspaceDefaultCurrency(wsId));
  const { data, error } = await inventory
    .from('inventory_storefronts')
    .insert({
      accent_color: payload.accentColor ?? null,
      analytics_enabled: payload.analyticsEnabled ?? true,
      checkout_mode: payload.checkoutMode ?? 'polar',
      corner_style: payload.cornerStyle ?? 'rounded',
      cover_image_url: payload.coverImageUrl ?? null,
      currency,
      description: payload.description ?? null,
      hero_image_url: payload.heroImageUrl ?? null,
      layout_style: payload.layoutStyle ?? 'grid',
      name: payload.name,
      polar_environment: payload.polarEnvironment ?? 'production',
      show_inventory_badges: payload.showInventoryBadges ?? true,
      slug: payload.slug,
      status: payload.status ?? 'draft',
      surface_style: payload.surfaceStyle ?? 'solid',
      theme_preset: payload.themePreset ?? 'minimal',
      visibility: payload.visibility ?? 'public',
      ws_id: wsId,
    } as never)
    .select(storefrontSelect as never)
    .single();

  if (error) throw error;
  if (!data) throw new Error('Failed to create inventory storefront');
  const storefrontId = String((data as unknown as { id: string }).id);
  if (payload.sections) {
    await replaceStorefrontSections(
      inventory,
      wsId,
      storefrontId,
      payload.sections
    );
  }

  const storefront = mapStorefront(
    {
      ...(data as unknown as Omit<StorefrontRow, 'listings_count'>),
      listings_count: 0,
    },
    await listStorefrontSections(inventory, wsId, storefrontId)
  );
  revalidatePublicStorefront(storefront.slug);
  return storefront;
}

export async function updateStorefront(
  wsId: string,
  storefrontId: string,
  payload: Partial<InventoryStorefrontPayload>
) {
  const { inventory } = await createPrivateInventoryClient();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.slug !== undefined) update.slug = payload.slug;
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.visibility !== undefined) update.visibility = payload.visibility;
  if (payload.currency !== undefined) update.currency = payload.currency;
  if (payload.checkoutMode !== undefined) {
    update.checkout_mode = payload.checkoutMode;
  }
  if (payload.themePreset !== undefined) {
    update.theme_preset = payload.themePreset;
  }
  if (payload.layoutStyle !== undefined) {
    update.layout_style = payload.layoutStyle;
  }
  if (payload.surfaceStyle !== undefined) {
    update.surface_style = payload.surfaceStyle;
  }
  if (payload.cornerStyle !== undefined) {
    update.corner_style = payload.cornerStyle;
  }
  if (payload.showInventoryBadges !== undefined) {
    update.show_inventory_badges = payload.showInventoryBadges;
  }
  if (payload.analyticsEnabled !== undefined) {
    update.analytics_enabled = payload.analyticsEnabled;
  }
  if (payload.polarEnvironment !== undefined) {
    update.polar_environment = payload.polarEnvironment;
  }
  if (hasPayloadKey(payload, 'description')) {
    update.description = payload.description ?? null;
  }
  if (hasPayloadKey(payload, 'coverImageUrl')) {
    update.cover_image_url = payload.coverImageUrl ?? null;
  }
  if (hasPayloadKey(payload, 'heroImageUrl')) {
    update.hero_image_url = payload.heroImageUrl ?? null;
  }
  if (hasPayloadKey(payload, 'accentColor')) {
    update.accent_color = payload.accentColor ?? null;
  }

  let { data, error } = await inventory
    .from('inventory_storefronts')
    .update(update as never)
    .eq('id', storefrontId)
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .select(storefrontSelect as never)
    .maybeSingle();

  if (isMissingDeletedAtColumn(error)) {
    ({ data, error } = await inventory
      .from('inventory_storefronts')
      .update(update as never)
      .eq('id', storefrontId)
      .eq('ws_id', wsId)
      .neq('slug', `deleted-${storefrontId}`)
      .select(storefrontSelect as never)
      .maybeSingle());
  }

  if (error) throw error;
  if (!data) return null;
  if (payload.sections) {
    await replaceStorefrontSections(
      inventory,
      wsId,
      storefrontId,
      payload.sections
    );
  }

  const storefront = await mapStorefrontWithCount(
    data as unknown as Omit<StorefrontRow, 'listings_count'>,
    inventory
  );
  revalidatePublicStorefront(storefront.slug);
  return storefront;
}

export async function deleteStorefront(wsId: string, storefrontId: string) {
  const { inventory } = await createPrivateInventoryClient();
  let { data: storefront, error: storefrontError } = await inventory
    .from('inventory_storefronts')
    .select('id, slug, metadata')
    .eq('id', storefrontId)
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .maybeSingle();

  let usesLegacySoftDelete = false;
  if (isMissingDeletedAtColumn(storefrontError)) {
    usesLegacySoftDelete = true;
    ({ data: storefront, error: storefrontError } = await inventory
      .from('inventory_storefronts')
      .select('id, slug, metadata')
      .eq('id', storefrontId)
      .eq('ws_id', wsId)
      .neq('slug', `deleted-${storefrontId}`)
      .maybeSingle());
  }

  if (storefrontError) throw storefrontError;
  if (!storefront) return false;

  const current = storefront as unknown as {
    id: string;
    metadata: Record<string, unknown> | null;
    slug: string;
  };
  const deletedAt = new Date().toISOString();
  const tombstone = {
    metadata: {
      ...(current.metadata ?? {}),
      deletedAt,
      deletedSlug: current.slug,
    },
    slug: `deleted-${current.id}`,
    status: 'archived',
    updated_at: deletedAt,
  };
  let result = usesLegacySoftDelete
    ? await inventory
        .from('inventory_storefronts')
        .update(tombstone as never)
        .eq('id', storefrontId)
        .eq('ws_id', wsId)
        .eq('slug', current.slug)
        .select('id')
        .maybeSingle()
    : await inventory
        .from('inventory_storefronts')
        .update({ ...tombstone, deleted_at: deletedAt } as never)
        .eq('id', storefrontId)
        .eq('ws_id', wsId)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();

  if (!usesLegacySoftDelete && isMissingDeletedAtColumn(result.error)) {
    result = await inventory
      .from('inventory_storefronts')
      .update(tombstone as never)
      .eq('id', storefrontId)
      .eq('ws_id', wsId)
      .eq('slug', current.slug)
      .select('id')
      .maybeSingle();
  }

  const { data, error } = result;

  if (error) throw error;
  if (data) revalidatePublicStorefront(current.slug);
  return Boolean(data);
}
