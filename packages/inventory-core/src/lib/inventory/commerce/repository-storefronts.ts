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
  return mapRpcList(data, 'storefront');
}

export async function getStorefront(wsId: string, storefrontId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_storefronts')
    .select(storefrontSelect as never)
    .eq('id', storefrontId)
    .eq('ws_id', wsId)
    .maybeSingle();

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

  const { data, error } = await inventory
    .from('inventory_storefronts')
    .update(update as never)
    .eq('id', storefrontId)
    .eq('ws_id', wsId)
    .select(storefrontSelect as never)
    .maybeSingle();

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
  const { data, error } = await inventory
    .from('inventory_storefronts')
    .delete()
    .eq('id', storefrontId)
    .eq('ws_id', wsId)
    .select('id, slug')
    .maybeSingle();

  if (error) throw error;
  const slug = (data as { slug?: string | null } | null)?.slug;
  if (slug) revalidatePublicStorefront(slug);
  return Boolean(data);
}
