import 'server-only';

import type {
  InventoryListingStatus,
  InventoryOptionTemplate,
  InventoryOptionTemplatePayload,
  InventoryStorefront,
  InventoryStorefrontListing,
  InventoryStorefrontListingPayload,
  InventoryStorefrontListingVariantPayload,
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
  scheduleVariantPolarSync,
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

type ListingOptionMap = Map<
  string,
  { groupId: string; values: Map<string, string> }
>;

/** Resolves the listing's option groups (name -> {groupId, label -> valueId}). */
async function loadListingOptionMap(
  inventory: Awaited<ReturnType<typeof createPrivateInventoryClient>>['inventory'],
  listingId: string
): Promise<ListingOptionMap> {
  const map: ListingOptionMap = new Map();
  const { data: groups, error } = (await inventory
    .from('inventory_listing_option_groups')
    .select('id, name')
    .eq('listing_id', listingId)) as {
    data: Array<{ id: string; name: string }> | null;
    error: SupabaseErrorLike;
  };
  if (error) throw error;
  if (!groups || groups.length === 0) return map;

  const { data: values, error: valuesError } = (await inventory
    .from('inventory_listing_option_values')
    .select('id, label, group_id')
    .eq('listing_id', listingId)) as {
    data: Array<{ group_id: string; id: string; label: string }> | null;
    error: SupabaseErrorLike;
  };
  if (valuesError) throw valuesError;

  for (const group of groups) {
    map.set(group.name, { groupId: group.id, values: new Map() });
  }
  for (const value of values ?? []) {
    for (const entry of map.values()) {
      if (entry.groupId === value.group_id) {
        entry.values.set(value.label, value.id);
      }
    }
  }
  return map;
}

/** Wipes and re-inserts the listing's option groups/values from a fresh shape. */
async function rebuildListingOptions(
  inventory: Awaited<ReturnType<typeof createPrivateInventoryClient>>['inventory'],
  wsId: string,
  listingId: string,
  options: NonNullable<InventoryStorefrontListingPayload['options']>
): Promise<ListingOptionMap> {
  const { error: deleteError } = await inventory
    .from('inventory_listing_option_groups')
    .delete()
    .eq('listing_id', listingId);
  if (deleteError) throw deleteError;

  const map: ListingOptionMap = new Map();
  for (const [groupIndex, group] of options.entries()) {
    const { data: groupRow, error: groupError } = (await inventory
      .from('inventory_listing_option_groups')
      .insert({
        listing_id: listingId,
        name: group.name,
        sort_order: group.sortOrder ?? groupIndex,
        ws_id: wsId,
      } as never)
      .select('id')
      .single()) as {
      data: { id: string } | null;
      error: SupabaseErrorLike;
    };
    if (groupError) throw groupError;
    if (!groupRow) throw new Error('Failed to create listing option group');

    const valueMap = new Map<string, string>();
    for (const [valueIndex, value] of group.values.entries()) {
      const { data: valueRow, error: valueError } = (await inventory
        .from('inventory_listing_option_values')
        .insert({
          group_id: groupRow.id,
          label: value.label,
          listing_id: listingId,
          sort_order: value.sortOrder ?? valueIndex,
          ws_id: wsId,
        } as never)
        .select('id')
        .single()) as {
        data: { id: string } | null;
        error: SupabaseErrorLike;
      };
      if (valueError) throw valueError;
      if (valueRow) valueMap.set(value.label, valueRow.id);
    }
    map.set(group.name, { groupId: groupRow.id, values: valueMap });
  }
  return map;
}

/** Validates a variant's (product, unit, warehouse) stock coordinate exists. */
async function assertVariantStock(
  wsId: string,
  variant: InventoryStorefrontListingVariantPayload
) {
  const { inventory, sbAdmin } = await createPrivateInventoryClient();
  const { data: product, error: productError } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('id', variant.productId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (productError) throw productError;

  const { data: stock, error: stockError } = await inventory
    .from('inventory_products')
    .select('product_id')
    .eq('product_id', variant.productId)
    .eq('unit_id', variant.unitId)
    .eq('warehouse_id', variant.warehouseId)
    .maybeSingle();
  if (stockError) throw stockError;
  if (!product || !stock) {
    throw new Error('Invalid inventory variant stock target');
  }
}

type RebuiltVariant = {
  id: string;
  imageUrl: string | null;
  polarProductId: string | null;
  price: number;
  status: NonNullable<InventoryStorefrontListingVariantPayload['status']>;
  title: string | null;
};

/**
 * Upserts the listing's variants (by id, preserving Polar mapping for kept
 * rows), deletes removed ones (archiving their Polar product), and rebuilds each
 * variant's option-value junction from the option map.
 */
async function rebuildListingVariants(
  inventory: Awaited<ReturnType<typeof createPrivateInventoryClient>>['inventory'],
  wsId: string,
  listingId: string,
  listingPrice: number,
  variants: NonNullable<InventoryStorefrontListingPayload['variants']>,
  optionMap: ListingOptionMap
): Promise<RebuiltVariant[]> {
  const { data: existingRows, error: existingError } = (await inventory
    .from('inventory_storefront_listing_variants')
    .select('id, polar_product_id')
    .eq('listing_id', listingId)) as {
    data: Array<{ id: string; polar_product_id: string | null }> | null;
    error: SupabaseErrorLike;
  };
  if (existingError) throw existingError;

  const existingById = new Map(
    (existingRows ?? []).map((row) => [row.id, row])
  );
  const keptIds = new Set<string>();
  const rebuilt: RebuiltVariant[] = [];

  for (const [index, variant] of variants.entries()) {
    await assertVariantStock(wsId, variant);
    const status = variant.status ?? 'active';
    const row = {
      compare_at_price: variant.compareAtPrice ?? null,
      image_url: variant.imageUrl ?? null,
      listing_id: listingId,
      price: variant.price ?? null,
      product_id: variant.productId,
      sku: variant.sku ?? null,
      sort_order: variant.sortOrder ?? index,
      status,
      title: variant.title ?? null,
      unit_id: variant.unitId,
      warehouse_id: variant.warehouseId,
      ws_id: wsId,
    };

    let variantId = variant.id && existingById.has(variant.id) ? variant.id : '';
    if (variantId) {
      const { error: updateError } = await inventory
        .from('inventory_storefront_listing_variants')
        .update(row as never)
        .eq('id', variantId)
        .eq('listing_id', listingId);
      if (updateError) throw updateError;
    } else {
      const { data: inserted, error: insertError } = (await inventory
        .from('inventory_storefront_listing_variants')
        .insert(row as never)
        .select('id')
        .single()) as {
        data: { id: string } | null;
        error: SupabaseErrorLike;
      };
      if (insertError) throw insertError;
      if (!inserted) throw new Error('Failed to create listing variant');
      variantId = inserted.id;
    }
    keptIds.add(variantId);

    // Rebuild this variant's option-value junction from the option map.
    const { error: junctionDeleteError } = await inventory
      .from('inventory_listing_variant_option_values')
      .delete()
      .eq('variant_id', variantId);
    if (junctionDeleteError) throw junctionDeleteError;

    const junctionRows: Array<{
      group_id: string;
      listing_id: string;
      value_id: string;
      variant_id: string;
    }> = [];
    for (const [groupName, label] of Object.entries(
      variant.optionValueLabels ?? {}
    )) {
      const group = optionMap.get(groupName);
      const valueId = group?.values.get(label);
      if (group && valueId) {
        junctionRows.push({
          group_id: group.groupId,
          listing_id: listingId,
          value_id: valueId,
          variant_id: variantId,
        });
      }
    }
    if (junctionRows.length > 0) {
      const { error: junctionError } = await inventory
        .from('inventory_listing_variant_option_values')
        .insert(junctionRows as never);
      if (junctionError) throw junctionError;
    }

    rebuilt.push({
      id: variantId,
      imageUrl: variant.imageUrl ?? null,
      polarProductId: existingById.get(variantId)?.polar_product_id ?? null,
      price: variant.price ?? listingPrice,
      status,
      title: variant.title ?? null,
    });
  }

  // Delete variants no longer present and archive their Polar products.
  for (const existing of existingRows ?? []) {
    if (keptIds.has(existing.id)) continue;
    const { error: deleteError } = await inventory
      .from('inventory_storefront_listing_variants')
      .delete()
      .eq('id', existing.id)
      .eq('listing_id', listingId);
    if (deleteError) throw deleteError;
    if (existing.polar_product_id) {
      scheduleInventoryPolarProductArchive({
        polarProductId: existing.polar_product_id,
        storefrontId: null,
        wsId,
      });
    }
  }

  return rebuilt;
}

/** Maps an option template's groups into the listing-option payload shape. */
function templateToOptions(
  template: InventoryOptionTemplate
): NonNullable<InventoryStorefrontListingPayload['options']> {
  return template.groups.map((group) => ({
    name: group.name,
    sortOrder: group.sortOrder,
    values: group.values.map((value) => ({
      label: value.label,
      sortOrder: value.sortOrder,
    })),
  }));
}

/**
 * Applies the option/variant portion of a listing payload. Only runs when the
 * payload touches options/variants, so a normal listing edit leaves them alone.
 * Schedules a per-variant Polar sync for every active variant.
 */
async function applyListingOptionsAndVariants(
  wsId: string,
  storefrontId: string,
  listingId: string,
  listingTitle: string,
  listingDescription: string | null,
  listingPrice: number,
  payload: Partial<InventoryStorefrontListingPayload>
) {
  const touchesOptions =
    payload.options !== undefined || Boolean(payload.applyOptionTemplateId);
  const touchesVariants = payload.variants !== undefined;
  if (!touchesOptions && !touchesVariants) return;

  const { inventory } = await createPrivateInventoryClient();

  let optionMap: ListingOptionMap;
  if (touchesOptions) {
    let options = payload.options;
    if (!options && payload.applyOptionTemplateId) {
      const template = await getOptionTemplate(
        wsId,
        payload.applyOptionTemplateId
      );
      options = template ? templateToOptions(template) : [];
    }
    optionMap = await rebuildListingOptions(
      inventory,
      wsId,
      listingId,
      options ?? []
    );
  } else {
    optionMap = await loadListingOptionMap(inventory, listingId);
  }

  if (touchesVariants) {
    const rebuilt = await rebuildListingVariants(
      inventory,
      wsId,
      listingId,
      listingPrice,
      payload.variants ?? [],
      optionMap
    );
    for (const variant of rebuilt) {
      scheduleVariantPolarSync({
        description: listingDescription,
        imageUrl: variant.imageUrl,
        listingTitle,
        polarProductId: variant.polarProductId,
        priceCents: variant.price,
        status: variant.status,
        storefrontId,
        variantId: variant.id,
        variantLabel: variant.title,
        wsId,
      });
    }
  }
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

  await applyListingOptionsAndVariants(
    wsId,
    storefrontId,
    String(data.id),
    payload.title,
    payload.description ?? null,
    payload.price,
    payload
  );

  const listing = await findListingById(wsId, storefrontId, String(data.id));
  if (!listing) throw new Error('Failed to load inventory storefront listing');
  // A listing with active variants is bought per-variant; each variant is its
  // own Polar product, so don't also advertise the listing-level product.
  if ((listing.variants ?? []).some((variant) => variant.status === 'active')) {
    scheduleInventoryPolarProductArchive({
      polarProductId: listing.polarProductId ?? null,
      storefrontId,
      wsId,
    });
  } else {
    scheduleListingPolarSync(listing);
  }
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

  await applyListingOptionsAndVariants(
    wsId,
    storefrontId,
    listingId,
    targetPayload.title,
    payload.description ?? null,
    targetPayload.price,
    payload
  );

  const listing = await findListingById(wsId, storefrontId, listingId);
  if (listing) {
    if (
      (listing.variants ?? []).some((variant) => variant.status === 'active')
    ) {
      scheduleInventoryPolarProductArchive({
        polarProductId: listing.polarProductId ?? null,
        storefrontId,
        wsId,
      });
    } else {
      scheduleListingPolarSync(listing);
    }
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

async function hydrateOptionTemplates(
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
  templates: Array<{
    created_at: string | null;
    description: string | null;
    id: string;
    name: string;
    updated_at: string | null;
    ws_id: string;
  }>
): Promise<InventoryOptionTemplate[]> {
  if (templates.length === 0) return [];
  const ids = templates.map((template) => template.id);

  const { data: groups, error: groupsError } = (await inventory
    .from('inventory_option_template_groups')
    .select('id, template_id, name, sort_order')
    .in('template_id', ids)
    .order('sort_order', { ascending: true })) as {
    data: Array<{
      id: string;
      name: string;
      sort_order: number;
      template_id: string;
    }> | null;
    error: SupabaseErrorLike;
  };
  if (groupsError) throw groupsError;

  const groupIds = (groups ?? []).map((group) => group.id);
  const { data: values, error: valuesError } =
    groupIds.length > 0
      ? ((await inventory
          .from('inventory_option_template_values')
          .select('id, group_id, label, value, sort_order')
          .in('group_id', groupIds)
          .order('sort_order', { ascending: true })) as {
          data: Array<{
            group_id: string;
            id: string;
            label: string;
            sort_order: number;
            value: string | null;
          }> | null;
          error: SupabaseErrorLike;
        })
      : { data: [], error: null };
  if (valuesError) throw valuesError;

  const valuesByGroup = new Map<
    string,
    InventoryOptionTemplate['groups'][number]['values']
  >();
  for (const value of values ?? []) {
    const list = valuesByGroup.get(value.group_id) ?? [];
    list.push({
      id: value.id,
      label: value.label,
      sortOrder: value.sort_order,
      value: value.value,
    });
    valuesByGroup.set(value.group_id, list);
  }

  const groupsByTemplate = new Map<string, InventoryOptionTemplate['groups']>();
  for (const group of groups ?? []) {
    const list = groupsByTemplate.get(group.template_id) ?? [];
    list.push({
      id: group.id,
      name: group.name,
      sortOrder: group.sort_order,
      values: valuesByGroup.get(group.id) ?? [],
    });
    groupsByTemplate.set(group.template_id, list);
  }

  return templates.map((template) => ({
    createdAt: template.created_at,
    description: template.description,
    groups: groupsByTemplate.get(template.id) ?? [],
    id: template.id,
    name: template.name,
    updatedAt: template.updated_at,
    wsId: template.ws_id,
  }));
}

export async function listOptionTemplates(
  wsId: string
): Promise<InventoryOptionTemplate[]> {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory
    .from('inventory_option_templates')
    .select('id, ws_id, name, description, created_at, updated_at')
    .eq('ws_id', wsId)
    .order('name', { ascending: true })) as {
    data: Array<{
      created_at: string | null;
      description: string | null;
      id: string;
      name: string;
      updated_at: string | null;
      ws_id: string;
    }> | null;
    error: SupabaseErrorLike;
  };
  if (error) throw error;
  return hydrateOptionTemplates(inventory, data ?? []);
}

export async function getOptionTemplate(
  wsId: string,
  templateId: string
): Promise<InventoryOptionTemplate | null> {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory
    .from('inventory_option_templates')
    .select('id, ws_id, name, description, created_at, updated_at')
    .eq('ws_id', wsId)
    .eq('id', templateId)
    .maybeSingle()) as {
    data: {
      created_at: string | null;
      description: string | null;
      id: string;
      name: string;
      updated_at: string | null;
      ws_id: string;
    } | null;
    error: SupabaseErrorLike;
  };
  if (error) throw error;
  if (!data) return null;
  const [template] = await hydrateOptionTemplates(inventory, [data]);
  return template ?? null;
}

async function replaceTemplateGroups(
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
  wsId: string,
  templateId: string,
  groups: NonNullable<InventoryOptionTemplatePayload['groups']>
) {
  const { error: deleteError } = await inventory
    .from('inventory_option_template_groups')
    .delete()
    .eq('template_id', templateId);
  if (deleteError) throw deleteError;

  for (const [groupIndex, group] of groups.entries()) {
    const { data: groupRow, error: groupError } = (await inventory
      .from('inventory_option_template_groups')
      .insert({
        name: group.name,
        sort_order: group.sortOrder ?? groupIndex,
        template_id: templateId,
        ws_id: wsId,
      } as never)
      .select('id')
      .single()) as {
      data: { id: string } | null;
      error: SupabaseErrorLike;
    };
    if (groupError) throw groupError;
    if (!groupRow) continue;

    for (const [valueIndex, value] of group.values.entries()) {
      const { error: valueError } = await inventory
        .from('inventory_option_template_values')
        .insert({
          group_id: groupRow.id,
          label: value.label,
          sort_order: value.sortOrder ?? valueIndex,
          value: value.value ?? null,
          ws_id: wsId,
        } as never);
      if (valueError) throw valueError;
    }
  }
}

export async function createOptionTemplate(
  wsId: string,
  payload: InventoryOptionTemplatePayload
): Promise<InventoryOptionTemplate> {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory
    .from('inventory_option_templates')
    .insert({
      description: payload.description ?? null,
      name: payload.name,
      ws_id: wsId,
    } as never)
    .select('id')
    .single()) as {
    data: { id: string } | null;
    error: SupabaseErrorLike;
  };
  if (error) throw error;
  if (!data) throw new Error('Failed to create option template');

  await replaceTemplateGroups(inventory, wsId, data.id, payload.groups ?? []);
  const template = await getOptionTemplate(wsId, data.id);
  if (!template) throw new Error('Failed to load option template');
  return template;
}

export async function updateOptionTemplate(
  wsId: string,
  templateId: string,
  payload: Partial<InventoryOptionTemplatePayload>
): Promise<InventoryOptionTemplate | null> {
  const { inventory } = await createPrivateInventoryClient();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (payload.name !== undefined) update.name = payload.name;
  if (hasPayloadKey(payload, 'description')) {
    update.description = payload.description ?? null;
  }

  const { data, error } = await inventory
    .from('inventory_option_templates')
    .update(update as never)
    .eq('id', templateId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (payload.groups !== undefined) {
    await replaceTemplateGroups(inventory, wsId, templateId, payload.groups);
  }
  return getOptionTemplate(wsId, templateId);
}

export async function deleteOptionTemplate(wsId: string, templateId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_option_templates')
    .delete()
    .eq('id', templateId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
