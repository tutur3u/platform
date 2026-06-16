import 'server-only';

import type {
  InventoryListingStatus,
  InventoryStorefront,
  InventoryStorefrontListing,
  InventoryStorefrontListingPayload,
  InventoryStorefrontPayload,
  InventoryStorefrontSectionItem,
  InventoryStorefrontStatus,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type ListQuery,
  mapStorefront,
  mapStorefrontSection,
  mapStorefrontSectionItem,
  type StorefrontRow,
  type StorefrontSectionItemRow,
  type StorefrontSectionRow,
} from './mappers';
import {
  scheduleInventoryPolarProductArchive,
  scheduleListingPolarSync,
} from './polar-product-sync';
import { revalidatePublicStorefront } from './public-storefront';

type SupabaseErrorLike = { code?: string; message?: string } | null;

type ListRpcRow<TKey extends string, TValue> = {
  total_count: number | null;
} & Record<TKey, TValue | null>;

const storefrontSelect =
  'id, ws_id, slug, name, description, status, visibility, cover_image_url, hero_image_url, accent_color, currency, checkout_mode, theme_preset, layout_style, surface_style, corner_style, show_inventory_badges, analytics_enabled, polar_environment, created_at, updated_at';

const storefrontSectionSelect =
  'id, ws_id, storefront_id, section_type, status, title, description, image_url, href, sort_order, metadata, created_at, updated_at';

const storefrontSectionItemSelect =
  'id, ws_id, storefront_id, section_id, listing_id, bundle_id, title, description, image_url, href, sort_order, metadata, created_at, updated_at';

function normalizePagination(page?: number, pageSize?: number) {
  const limit = Math.max(1, Math.min(pageSize ?? 25, 100));
  const offset = (Math.max(1, page ?? 1) - 1) * limit;
  return { limit, offset };
}

function normalizeSearch(q?: string) {
  const value = q?.trim();
  return value ? value : null;
}

/**
 * Busts the cached public storefront payload after a write so shoppers see the
 * change immediately instead of waiting out the time-based revalidation. Resolves
 * the slug from the storefront id since listing/bundle writes only carry the id.
 */
async function revalidateStorefrontById(wsId: string, storefrontId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data } = await inventory
    .from('inventory_storefronts')
    .select('slug')
    .eq('id', storefrontId)
    .eq('ws_id', wsId)
    .maybeSingle();
  const slug = (data as { slug?: string | null } | null)?.slug;
  if (slug) revalidatePublicStorefront(slug);
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

async function createPrivateInventoryClient() {
  const sbAdmin = await createAdminClient();
  return { inventory: sbAdmin.schema('private'), sbAdmin };
}

async function getStorefrontListingsCount(
  storefrontId: string,
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory']
) {
  const { count, error } = await inventory
    .from('inventory_storefront_listings')
    .select('id', { count: 'exact', head: true })
    .eq('storefront_id', storefrontId);

  if (error) throw error;
  return count ?? 0;
}

async function mapStorefrontWithCount(
  row: Omit<StorefrontRow, 'listings_count'>,
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory']
) {
  const [listingsCount, sections] = await Promise.all([
    getStorefrontListingsCount(row.id, inventory),
    listStorefrontSections(inventory, row.ws_id, row.id),
  ]);

  return mapStorefront(
    {
      ...row,
      listings_count: listingsCount,
    },
    sections
  );
}

async function listStorefrontSections(
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
  wsId: string,
  storefrontId: string
) {
  const { data: sectionRows, error: sectionError } = await inventory
    .from('inventory_storefront_sections' as never)
    .select(storefrontSectionSelect as never)
    .eq('ws_id', wsId)
    .eq('storefront_id', storefrontId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (sectionError) throw sectionError;

  const sections = (sectionRows ?? []) as unknown as StorefrontSectionRow[];
  if (sections.length === 0) return [];

  const { data: itemRows, error: itemError } = await inventory
    .from('inventory_storefront_section_items' as never)
    .select(storefrontSectionItemSelect as never)
    .eq('ws_id', wsId)
    .eq('storefront_id', storefrontId)
    .in(
      'section_id',
      sections.map((section) => section.id)
    )
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (itemError) throw itemError;

  const itemsBySection = new Map<string, InventoryStorefrontSectionItem[]>();
  for (const row of (itemRows ?? []) as unknown as StorefrontSectionItemRow[]) {
    const item = mapStorefrontSectionItem(row);
    const items = itemsBySection.get(item.sectionId) ?? [];
    items.push(item);
    itemsBySection.set(item.sectionId, items);
  }

  return sections.map((section) =>
    mapStorefrontSection(section, itemsBySection.get(section.id) ?? [])
  );
}

async function replaceStorefrontSections(
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
  wsId: string,
  storefrontId: string,
  sections: NonNullable<InventoryStorefrontPayload['sections']>
) {
  const { error: deleteError } = await inventory
    .from('inventory_storefront_sections' as never)
    .delete()
    .eq('ws_id', wsId)
    .eq('storefront_id', storefrontId);

  if (deleteError) throw deleteError;
  if (sections.length === 0) return;

  for (const [index, section] of sections.entries()) {
    const { data: insertedSection, error: sectionError } = await inventory
      .from('inventory_storefront_sections' as never)
      .insert({
        description: section.description ?? null,
        href: section.href ?? null,
        image_url: section.imageUrl ?? null,
        metadata: section.metadata ?? {},
        section_type: section.sectionType,
        sort_order: section.sortOrder ?? index,
        status: section.status ?? 'published',
        storefront_id: storefrontId,
        title: section.title ?? null,
        ws_id: wsId,
      } as never)
      .select('id')
      .single();

    if (sectionError) throw sectionError;
    const sectionId = String((insertedSection as { id: string }).id);
    const items = section.items ?? [];
    if (items.length === 0) continue;

    const { error: itemsError } = await inventory
      .from('inventory_storefront_section_items' as never)
      .insert(
        items.map((item, itemIndex) => ({
          bundle_id: item.bundleId ?? null,
          description: item.description ?? null,
          href: item.href ?? null,
          image_url: item.imageUrl ?? null,
          listing_id: item.listingId ?? null,
          metadata: item.metadata ?? {},
          section_id: sectionId,
          sort_order: item.sortOrder ?? itemIndex,
          storefront_id: storefrontId,
          title: item.title ?? null,
          ws_id: wsId,
        })) as never
      );

    if (itemsError) throw itemsError;
  }
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
  const { data, error } = await inventory
    .from('inventory_storefronts')
    .insert({
      accent_color: payload.accentColor ?? null,
      analytics_enabled: payload.analyticsEnabled ?? true,
      checkout_mode: payload.checkoutMode ?? 'polar',
      corner_style: payload.cornerStyle ?? 'rounded',
      cover_image_url: payload.coverImageUrl ?? null,
      currency: payload.currency ?? 'USD',
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

export async function listStorefrontListings(
  wsId: string,
  storefrontId: string,
  query: {
    status?: InventoryStorefrontStatus | InventoryListingStatus | 'all';
  } = {}
) {
  const { inventory } = await createPrivateInventoryClient();
  const status = query.status && query.status !== 'all' ? query.status : null;
  const { data, error } = (await inventory.rpc(
    'list_inventory_storefront_listings' as never,
    {
      p_status: status,
      p_storefront_id: storefrontId,
      p_ws_id: wsId,
    } as never
  )) as {
    data: ListRpcRow<'listing', InventoryStorefrontListing>[] | null;
    error: SupabaseErrorLike;
  };

  if (error) throw error;
  return mapRpcList(data, 'listing');
}

async function assertListingTarget(
  wsId: string,
  payload: InventoryStorefrontListingPayload
) {
  const { inventory, sbAdmin } = await createPrivateInventoryClient();

  if ((payload.listingType ?? 'product') === 'product') {
    if (!payload.productId || !payload.unitId || !payload.warehouseId) {
      throw new Error('Invalid inventory listing product target');
    }

    const { data: product, error: productError } = await sbAdmin
      .from('workspace_products')
      .select('id')
      .eq('id', payload.productId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (productError) throw productError;

    const { data: stock, error: stockError } = await inventory
      .from('inventory_products')
      .select('product_id')
      .eq('product_id', payload.productId)
      .eq('unit_id', payload.unitId)
      .eq('warehouse_id', payload.warehouseId)
      .maybeSingle();
    if (stockError) throw stockError;
    if (!product || !stock) {
      throw new Error('Invalid inventory listing product target');
    }
    return;
  }

  const { data, error } = await inventory
    .from('inventory_bundles')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', payload.bundleId ?? '')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Invalid inventory listing bundle target');
}

async function assertStorefrontTarget(wsId: string, storefrontId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_storefronts')
    .select('id')
    .eq('id', storefrontId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Invalid inventory storefront target');
}

async function getListingTargetPayload(
  wsId: string,
  storefrontId: string,
  listingId: string,
  payload: Partial<InventoryStorefrontListingPayload>
) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_storefront_listings')
    .select(
      'listing_type, product_id, unit_id, warehouse_id, bundle_id, title, price'
    )
    .eq('id', listingId)
    .eq('storefront_id', storefrontId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const listingType =
    payload.listingType ??
    (data.listing_type === 'bundle' ? 'bundle' : 'product');
  return {
    bundleId: payload.bundleId ?? data.bundle_id,
    listingType,
    price: payload.price ?? Number(data.price),
    productId: payload.productId ?? data.product_id,
    title: payload.title ?? data.title,
    unitId: payload.unitId ?? data.unit_id,
    warehouseId: payload.warehouseId ?? data.warehouse_id,
  } satisfies InventoryStorefrontListingPayload;
}

async function findListingById(
  wsId: string,
  storefrontId: string,
  listingId: string
) {
  const result = await listStorefrontListings(wsId, storefrontId, {
    status: 'all',
  });
  return result.data.find((listing) => listing.id === listingId) ?? null;
}

export async function createStorefrontListing(
  wsId: string,
  storefrontId: string,
  payload: InventoryStorefrontListingPayload
) {
  await assertStorefrontTarget(wsId, storefrontId);
  await assertListingTarget(wsId, payload);

  const { inventory } = await createPrivateInventoryClient();
  const listingType = payload.listingType ?? 'product';
  const { data, error } = await inventory
    .from('inventory_storefront_listings')
    .insert({
      bundle_id: listingType === 'bundle' ? (payload.bundleId ?? null) : null,
      compare_at_price: payload.compareAtPrice ?? null,
      description: payload.description ?? null,
      image_url: payload.imageUrl ?? null,
      listing_type: listingType,
      max_per_order: payload.maxPerOrder ?? 99,
      price: payload.price,
      product_id:
        listingType === 'product' ? (payload.productId ?? null) : null,
      sort_order: payload.sortOrder ?? 0,
      status: payload.status ?? 'draft',
      storefront_id: storefrontId,
      title: payload.title,
      unit_id: listingType === 'product' ? (payload.unitId ?? null) : null,
      warehouse_id:
        listingType === 'product' ? (payload.warehouseId ?? null) : null,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Failed to create inventory storefront listing');

  const listing = await findListingById(wsId, storefrontId, String(data.id));
  if (!listing) throw new Error('Failed to load inventory storefront listing');
  scheduleListingPolarSync(listing);
  await revalidateStorefrontById(wsId, storefrontId);
  return listing;
}

export async function updateStorefrontListing(
  wsId: string,
  storefrontId: string,
  listingId: string,
  payload: Partial<InventoryStorefrontListingPayload>
) {
  await assertStorefrontTarget(wsId, storefrontId);
  const targetPayload = await getListingTargetPayload(
    wsId,
    storefrontId,
    listingId,
    payload
  );
  if (!targetPayload) return null;

  await assertListingTarget(wsId, targetPayload);

  const listingType = targetPayload.listingType ?? 'product';
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (payload.title !== undefined) update.title = payload.title;
  if (payload.price !== undefined) update.price = payload.price;
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.sortOrder !== undefined) update.sort_order = payload.sortOrder;
  if (payload.maxPerOrder !== undefined) {
    update.max_per_order = payload.maxPerOrder;
  }
  if (hasPayloadKey(payload, 'description')) {
    update.description = payload.description ?? null;
  }
  if (hasPayloadKey(payload, 'imageUrl')) {
    update.image_url = payload.imageUrl ?? null;
  }
  if (hasPayloadKey(payload, 'compareAtPrice')) {
    update.compare_at_price = payload.compareAtPrice ?? null;
  }
  if (
    payload.listingType !== undefined ||
    hasPayloadKey(payload, 'productId') ||
    hasPayloadKey(payload, 'unitId') ||
    hasPayloadKey(payload, 'warehouseId') ||
    hasPayloadKey(payload, 'bundleId')
  ) {
    update.listing_type = listingType;
    update.bundle_id =
      listingType === 'bundle' ? (targetPayload.bundleId ?? null) : null;
    update.product_id =
      listingType === 'product' ? (targetPayload.productId ?? null) : null;
    update.unit_id =
      listingType === 'product' ? (targetPayload.unitId ?? null) : null;
    update.warehouse_id =
      listingType === 'product' ? (targetPayload.warehouseId ?? null) : null;
  }

  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_storefront_listings')
    .update(update as never)
    .eq('id', listingId)
    .eq('storefront_id', storefrontId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const listing = await findListingById(wsId, storefrontId, listingId);
  if (listing) {
    scheduleListingPolarSync(listing);
    await revalidateStorefrontById(wsId, storefrontId);
  }
  return listing;
}

export async function deleteStorefrontListing(
  wsId: string,
  storefrontId: string,
  listingId: string
) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_storefront_listings')
    .delete()
    .eq('id', listingId)
    .eq('storefront_id', storefrontId)
    .eq('ws_id', wsId)
    .select('id, polar_product_id')
    .maybeSingle();

  if (error) throw error;
  if (data) {
    // A deleted listing must not remain buyable on Polar — archive its product.
    scheduleInventoryPolarProductArchive({
      polarProductId:
        (data as { polar_product_id?: string | null }).polar_product_id ?? null,
      storefrontId,
      wsId,
    });
    await revalidateStorefrontById(wsId, storefrontId);
  }
  return Boolean(data);
}
