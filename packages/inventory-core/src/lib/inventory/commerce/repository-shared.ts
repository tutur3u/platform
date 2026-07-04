import 'server-only';

import type {
  InventoryStorefrontPayload,
  InventoryStorefrontSectionItem,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  mapStorefront,
  mapStorefrontSection,
  mapStorefrontSectionItem,
  type StorefrontRow,
  type StorefrontSectionItemRow,
  type StorefrontSectionRow,
} from './mappers';
import { revalidatePublicStorefront } from './public-storefront';

export type SupabaseErrorLike = { code?: string; message?: string } | null;

export type ListRpcRow<TKey extends string, TValue> = {
  total_count: number | null;
} & Record<TKey, TValue | null>;

export const storefrontSelect =
  'id, ws_id, slug, name, description, status, visibility, cover_image_url, hero_image_url, accent_color, currency, checkout_mode, theme_preset, layout_style, surface_style, corner_style, show_inventory_badges, analytics_enabled, polar_environment, created_at, updated_at';

export const storefrontSectionSelect =
  'id, ws_id, storefront_id, section_type, status, title, description, image_url, href, sort_order, metadata, created_at, updated_at';

export const storefrontSectionItemSelect =
  'id, ws_id, storefront_id, section_id, listing_id, bundle_id, title, description, image_url, href, sort_order, metadata, created_at, updated_at';

export function normalizePagination(page?: number, pageSize?: number) {
  const limit = Math.max(1, Math.min(pageSize ?? 25, 100));
  const offset = (Math.max(1, page ?? 1) - 1) * limit;
  return { limit, offset };
}

export function normalizeSearch(q?: string) {
  const value = q?.trim();
  return value ? value : null;
}

/**
 * Busts the cached public storefront payload after a write so shoppers see the
 * change immediately instead of waiting out the time-based revalidation. Resolves
 * the slug from the storefront id since listing/bundle writes only carry the id.
 */
export async function revalidateStorefrontById(
  wsId: string,
  storefrontId: string
) {
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

export function mapRpcList<TKey extends string, TValue>(
  rows: ListRpcRow<TKey, TValue>[] | null | undefined,
  key: TKey
) {
  return {
    count: rows?.[0]?.total_count ?? 0,
    data: (rows ?? []).map((row) => row[key]).filter(Boolean) as TValue[],
  };
}

export function hasPayloadKey<T extends object, K extends PropertyKey>(
  payload: T,
  key: K
): payload is T & Record<K, unknown> {
  return Object.hasOwn(payload, key);
}

export async function createPrivateInventoryClient() {
  const sbAdmin = await createAdminClient();
  return { inventory: sbAdmin.schema('private'), sbAdmin };
}

export async function getStorefrontListingsCount(
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

export async function mapStorefrontWithCount(
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

export async function listStorefrontSections(
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

export async function replaceStorefrontSections(
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
