import {
  activeWorkspaceCatalog,
  PUBLIC_WORKSPACE_PRODUCT_IDS,
  publicVersionedWorkspacePrices,
  publicWorkspacePrices,
} from '@tuturuuu/payment-core/public-prices';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';

export async function GET() {
  await connection();
  try {
    const catalog = activeWorkspaceCatalog();
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .schema('private')
      .from('workspace_subscription_products')
      .select(
        'id,tier,archived,pricing_model,price_per_seat,recurring_interval'
      )
      .in(
        'id',
        catalog?.map(({ productId }) => productId) ??
          PUBLIC_WORKSPACE_PRODUCT_IDS
      );
    if (error || !data) throw new Error('Catalog read unavailable');
    return NextResponse.json(
      catalog
        ? publicVersionedWorkspacePrices(data, catalog)
        : publicWorkspacePrices(data),
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=30',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'Pricing is temporarily unavailable' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
