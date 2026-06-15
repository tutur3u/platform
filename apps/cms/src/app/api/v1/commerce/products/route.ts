import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  getCmsWorkspaceAccess,
  hasCmsCommerceProductReadPermission,
} from '@/lib/external-projects/access';

export interface CmsCommerceProduct {
  category: string | null;
  id: string;
  name: string;
  price: number | null;
  stock: number;
}

/**
 * CMS-owned products endpoint — a deep integration with apps/inventory.
 *
 * Reads the workspace inventory (public workspace_products + private
 * inventory_products for stock/price) via the admin client, authorized by the
 * CMS workspace-access layer (satellite session). This bridges inventory into
 * the CMS without exposing the web inventory API to cross-app auth, mirroring
 * the commerce/overview pattern.
 */
export async function GET(request: Request) {
  const wsId = new URL(request.url).searchParams.get('wsId');
  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const access = await getCmsWorkspaceAccess(wsId);
  if (
    !access.canAccessWorkspace ||
    !hasCmsCommerceProductReadPermission(access.workspacePermissions)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const workspaceId = access.normalizedWorkspaceId;

    const [{ data: products, error: productsError }, { data: categories }] =
      await Promise.all([
        admin
          .from('workspace_products')
          .select('id, name, category_id')
          .eq('ws_id', workspaceId)
          .eq('archived', false)
          .order('name', { ascending: true }),
        admin
          .from('product_categories')
          .select('id, name')
          .eq('ws_id', workspaceId),
      ]);

    if (productsError) {
      throw new Error(productsError.message);
    }

    const productRows = products ?? [];
    const ids = productRows.map((product) => product.id);
    const stockRows = ids.length
      ? ((
          await admin
            .schema('private')
            .from('inventory_products')
            .select('product_id, amount, price')
            .in('product_id', ids)
        ).data ?? [])
      : [];

    const categoryName = new Map(
      (categories ?? []).map((category) => [category.id, category.name])
    );
    const stockByProduct = new Map<
      string,
      { price: number | null; stock: number }
    >();
    for (const row of stockRows) {
      const current = stockByProduct.get(row.product_id) ?? {
        price: null,
        stock: 0,
      };
      current.stock += row.amount ?? 0;
      if (
        row.price != null &&
        (current.price == null || row.price < current.price)
      ) {
        current.price = row.price;
      }
      stockByProduct.set(row.product_id, current);
    }

    const result: CmsCommerceProduct[] = productRows.map((product) => {
      const stock = stockByProduct.get(product.id);
      return {
        category: product.category_id
          ? (categoryName.get(product.category_id) ?? null)
          : null,
        id: product.id,
        name: product.name ?? '',
        price: stock?.price ?? null,
        stock: stock?.stock ?? 0,
      };
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: 'Failed to load products' },
      { status: 500 }
    );
  }
}
