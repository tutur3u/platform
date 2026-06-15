import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  getCmsWorkspaceAccess,
  hasCmsCommerceStorefrontPublishPermission,
  hasCmsCommerceStorefrontReadPermission,
} from '@/lib/external-projects/access';

export interface CmsStorefrontListing {
  id: string;
  price: number;
  productId: string | null;
  status: string;
  title: string;
}

export interface CmsStorefrontOverview {
  listings: CmsStorefrontListing[];
  storefront: {
    currency: string;
    id: string;
    name: string;
    slug: string;
    status: string;
    visibility: string;
  } | null;
}

async function resolveStorefront(admin: TypedSupabaseClient, wsId: string) {
  const { data } = await admin
    .schema('private')
    .from('inventory_storefronts')
    .select('id, slug, name, status, currency, visibility')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * CMS-owned storefront endpoint — a deep integration with apps/storefront.
 *
 * GET returns the workspace storefront + its product listings. POST publishes a
 * product (from inventory) as a storefront listing — i.e. the CMS authors what
 * the storefront renders. Reads/writes go through the admin client, authorized
 * by the CMS workspace-access layer (satellite session), mirroring the other
 * commerce endpoints.
 */
export async function GET(request: Request) {
  const wsId = new URL(request.url).searchParams.get('wsId');
  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const access = await getCmsWorkspaceAccess(wsId);
  if (
    !access.canAccessWorkspace ||
    !hasCmsCommerceStorefrontReadPermission(access.workspacePermissions)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const storefront = await resolveStorefront(
      admin,
      access.normalizedWorkspaceId
    );

    const listings = storefront
      ? ((
          await admin
            .schema('private')
            .from('inventory_storefront_listings')
            .select('id, title, price, status, product_id')
            .eq('storefront_id', storefront.id)
            .order('sort_order', { ascending: true })
        ).data ?? [])
      : [];

    const overview: CmsStorefrontOverview = {
      listings: listings.map((listing) => ({
        id: listing.id,
        price: listing.price ?? 0,
        productId: listing.product_id,
        status: listing.status,
        title: listing.title,
      })),
      storefront: storefront
        ? {
            currency: storefront.currency,
            id: storefront.id,
            name: storefront.name,
            slug: storefront.slug,
            status: storefront.status,
            visibility: storefront.visibility,
          }
        : null,
    };

    return NextResponse.json(overview);
  } catch {
    return NextResponse.json(
      { error: 'Failed to load storefront' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: { productId?: string; wsId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { productId, wsId } = body;
  if (!wsId || !productId) {
    return NextResponse.json(
      { error: 'wsId and productId are required' },
      { status: 400 }
    );
  }

  const access = await getCmsWorkspaceAccess(wsId);
  if (
    !access.canAccessWorkspace ||
    !hasCmsCommerceStorefrontPublishPermission(access.workspacePermissions)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const workspaceId = access.normalizedWorkspaceId;

    const storefront = await resolveStorefront(admin, workspaceId);
    if (!storefront) {
      return NextResponse.json(
        { error: 'No storefront configured' },
        { status: 409 }
      );
    }

    const { data: product } = await admin
      .from('workspace_products')
      .select('id, name')
      .eq('ws_id', workspaceId)
      .eq('id', productId)
      .maybeSingle();
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { data: stock } = await admin
      .schema('private')
      .from('inventory_products')
      .select('price')
      .eq('product_id', productId)
      .order('price', { ascending: true })
      .limit(1)
      .maybeSingle();

    const { error: insertError } = await admin
      .schema('private')
      .from('inventory_storefront_listings')
      .insert({
        listing_type: 'product',
        price: stock?.price ?? 0,
        product_id: productId,
        status: 'published',
        storefront_id: storefront.id,
        title: product.name ?? 'Untitled product',
        ws_id: workspaceId,
      });

    if (insertError) {
      throw new Error(insertError.message);
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to publish listing' },
      { status: 500 }
    );
  }
}
