import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { majorToMinor } from '@tuturuuu/utils/money';
import { getWorkspaceDefaultCurrency } from '../workspace-currency';
import { getDefaultStorefrontSlug } from './auto-listing-slug';
import { createStorefront, createStorefrontListing } from './repository';

type DefaultStorefront = { currency: string; id: string };

/**
 * Inventory products are automatically surfaced as storefront listings so they
 * are sellable and flow to Polar (listings auto-sync) without a manual
 * publishing step. Listings start as `draft` and can be paused/edited from the
 * storefront panel. This module resolves a default storefront, creates a listing
 * on product create, and backfills listings for products created before the
 * behaviour existed.
 */
async function findDefaultStorefront(
  wsId: string
): Promise<DefaultStorefront | null> {
  const sbAdmin = await createAdminClient();
  const { data } = await sbAdmin
    .schema('private')
    .from('inventory_storefronts')
    .select('id, currency, created_at')
    .eq('ws_id', wsId)
    .neq('status', 'archived')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { currency: data.currency ?? 'USD', id: data.id };
}

export async function ensureDefaultStorefront(
  wsId: string
): Promise<DefaultStorefront> {
  const existing = await findDefaultStorefront(wsId);
  if (existing) return existing;

  const currency = await getWorkspaceDefaultCurrency(wsId);
  const storefront = await createStorefront(wsId, {
    currency,
    name: 'Storefront',
    // Storefront slugs are public and globally unique. A constant `store`
    // made product creation log a unique-key failure for every workspace after
    // the first one, even though product creation itself continued.
    slug: getDefaultStorefrontSlug(wsId),
    status: 'draft',
  } as never);
  return { currency: storefront.currency ?? currency, id: storefront.id };
}

async function listingExistsForProduct(wsId: string, productId: string) {
  const sbAdmin = await createAdminClient();
  const { count } = await sbAdmin
    .schema('private')
    .from('inventory_storefront_listings')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('product_id', productId)
    .neq('status', 'archived');
  return (count ?? 0) > 0;
}

/**
 * Best-effort: create a draft listing for a freshly created product. Never
 * throws — a listing/Polar problem must not fail product creation.
 */
export async function autoCreateProductListing(
  wsId: string,
  params: {
    priceMajor: number;
    productId: string;
    title: string;
    unitId: string;
    warehouseId: string;
  }
): Promise<void> {
  try {
    if (await listingExistsForProduct(wsId, params.productId)) return;
    const storefront = await ensureDefaultStorefront(wsId);
    await createStorefrontListing(wsId, storefront.id, {
      listingType: 'product',
      price: majorToMinor(params.priceMajor || 0, storefront.currency),
      productId: params.productId,
      status: 'draft',
      title: params.title,
      unitId: params.unitId,
      warehouseId: params.warehouseId,
    });
  } catch (error) {
    console.error('Failed to auto-create product listing', error);
  }
}

/**
 * Create draft listings for every workspace product that has stock but no
 * (non-archived) listing yet. Returns the number of listings created. Used by
 * the manual "Re-sync now" action so existing catalogs converge in one click.
 */
export async function backfillProductListings(wsId: string): Promise<number> {
  const sbAdmin = await createAdminClient();

  const { data: products } = await sbAdmin
    .from('workspace_products')
    .select('id, name')
    .eq('ws_id', wsId);
  if (!products?.length) return 0;

  const { data: listings } = await sbAdmin
    .schema('private')
    .from('inventory_storefront_listings')
    .select('product_id')
    .eq('ws_id', wsId)
    .not('product_id', 'is', null);
  const listed = new Set((listings ?? []).map((row) => row.product_id));

  const missing = products.filter((product) => !listed.has(product.id));
  if (missing.length === 0) return 0;

  const storefront = await ensureDefaultStorefront(wsId);
  let created = 0;

  for (const product of missing) {
    const { data: stock } = await sbAdmin
      .schema('private')
      .from('inventory_products')
      .select('unit_id, warehouse_id, price')
      .eq('product_id', product.id)
      .limit(1)
      .maybeSingle();
    if (!stock) continue;

    try {
      await createStorefrontListing(wsId, storefront.id, {
        listingType: 'product',
        price: majorToMinor(Number(stock.price ?? 0), storefront.currency),
        productId: product.id,
        status: 'draft',
        title: product.name ?? 'Product',
        unitId: stock.unit_id,
        warehouseId: stock.warehouse_id,
      });
      created += 1;
    } catch (error) {
      console.error('Failed to backfill product listing', error);
    }
  }

  return created;
}
