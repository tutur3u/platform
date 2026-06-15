import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  getCmsWorkspaceAccess,
  hasCmsCommerceInsightsPermission,
} from '@/lib/external-projects/access';

export interface CmsCommerceInsights {
  hasStorefront: boolean;
  outOfStock: number;
  storefrontPublished: boolean;
  totalProducts: number;
  unlisted: number;
}

/**
 * CMS-owned commerce insights — a "smart utility" spanning inventory + storefront.
 *
 * Turns cross-app signals into actionable nudges for the dashboard: products out
 * of stock, products not yet on the storefront, and whether the storefront is
 * live. Read-only via the admin client, authorized by the CMS workspace-access
 * layer (satellite session).
 */
export async function GET(request: Request) {
  const wsId = new URL(request.url).searchParams.get('wsId');
  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const access = await getCmsWorkspaceAccess(wsId);
  if (
    !access.canAccessWorkspace ||
    !hasCmsCommerceInsightsPermission(access.workspacePermissions)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const workspaceId = access.normalizedWorkspaceId;

    const { data: products } = await admin
      .from('workspace_products')
      .select('id')
      .eq('ws_id', workspaceId)
      .eq('archived', false);
    const productIds = (products ?? []).map((product) => product.id);

    const { data: storefront } = await admin
      .schema('private')
      .from('inventory_storefronts')
      .select('id, status')
      .eq('ws_id', workspaceId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const [stockRows, listingRows] = await Promise.all([
      productIds.length
        ? admin
            .schema('private')
            .from('inventory_products')
            .select('product_id, amount')
            .in('product_id', productIds)
        : Promise.resolve({
            data: [] as { amount: number; product_id: string }[],
          }),
      storefront
        ? admin
            .schema('private')
            .from('inventory_storefront_listings')
            .select('product_id')
            .eq('storefront_id', storefront.id)
        : Promise.resolve({ data: [] as { product_id: string | null }[] }),
    ]);

    const stockByProduct = new Map<string, number>();
    for (const row of stockRows.data ?? []) {
      stockByProduct.set(
        row.product_id,
        (stockByProduct.get(row.product_id) ?? 0) + (row.amount ?? 0)
      );
    }
    const outOfStock = productIds.filter(
      (id) => (stockByProduct.get(id) ?? 0) <= 0
    ).length;

    const listedProductIds = new Set(
      (listingRows.data ?? [])
        .map((row) => row.product_id)
        .filter((id): id is string => Boolean(id))
    );
    const unlisted = storefront
      ? productIds.filter((id) => !listedProductIds.has(id)).length
      : 0;

    const insights: CmsCommerceInsights = {
      hasStorefront: Boolean(storefront),
      outOfStock,
      storefrontPublished: storefront?.status === 'published',
      totalProducts: productIds.length,
      unlisted,
    };

    return NextResponse.json(insights);
  } catch {
    return NextResponse.json(
      { error: 'Failed to load insights' },
      { status: 500 }
    );
  }
}
