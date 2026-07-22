import 'server-only';

import type {
  InventoryListingStatus,
  InventoryOptionTemplate,
  InventoryStorefrontListing,
  InventoryStorefrontListingPayload,
  InventoryStorefrontListingVariantPayload,
  InventoryStorefrontStatus,
} from '@tuturuuu/internal-api/inventory';
import {
  scheduleInventoryPolarProductArchive,
  scheduleListingPolarSync,
  scheduleVariantPolarSync,
} from './polar-product-sync';
import { getOptionTemplate } from './repository-option-templates';
import {
  createPrivateInventoryClient,
  hasPayloadKey,
  type ListRpcRow,
  mapRpcList,
  revalidateStorefrontById,
  type SupabaseErrorLike,
} from './repository-shared';

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
    .is('deleted_at', null)
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
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
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
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
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
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
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

    let variantId =
      variant.id && existingById.has(variant.id) ? variant.id : '';
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
